import {
  addTaskCommentWithApi,
  createTaskWithApi,
  deleteTaskCommentWithApi,
  deleteTaskWithApi,
  syncTaskWithApi,
  updateTaskStatusWithApi,
  updateTaskWithApi,
} from "./api.js";
import { getGroups, getProgressLogs, getTasks, getUsers, hydrateAppState } from "./storage.js";
import { canCreateGroupTask, getGroupById } from "./groups.js";

const VALID_STATUSES = ["Pending", "Ongoing", "Completed"];
const VALID_COMPLEXITIES = ["XS", "S", "M", "L", "XL"];

function getTaskById(taskId) {
  return getTasks().find((task) => task.id === taskId) ?? null;
}

function getUserVisibleTasks(user) {
  if (!user) {
    return [];
  }

  const groups = getGroups();
  return getTasks().filter((task) => {
    if (task.isPersonal) {
      return task.createdBy === user.id || task.assignedTo === user.id;
    }

    if (user.globalRole === "admin") {
      return true;
    }

    if (task.isArchived) {
      return false;
    }

    const group = groups.find((entry) => entry.id === task.groupId);
    return Boolean(group && (group.memberIds.includes(user.id) || group.leaderId === user.id));
  });
}

function getGroupTasks(groupId) {
  return getTasks().filter((task) => task.groupId === groupId && !task.isPersonal);
}

function normalizeTaskInput(input) {
  return {
    title: input.title?.trim() ?? "",
    description: input.description?.trim() ?? "",
    deadline: input.deadline ?? "",
    status: VALID_STATUSES.includes(input.status) ? input.status : "Pending",
    category: input.category?.trim() ?? "",
    priority: ["High", "Medium", "Low"].includes(input.priority) ? input.priority : "Medium",
    complexitySize: VALID_COMPLEXITIES.includes(input.complexitySize) ? input.complexitySize : "M",
    githubBranch: input.githubBranch?.trim() ?? "",
    actualLoC: typeof input.actualLoC === 'number' ? input.actualLoC : null,
    assignedTo: input.assignedTo || null,
    groupId: input.groupId || null,
    isPersonal: Boolean(input.isPersonal),
    taskType: input.taskType === "reminder" ? "reminder" : "deadline",
    isArchived: Boolean(input.isArchived),
    progressNote: input.progressNote?.trim() ?? "",
    comments: Array.isArray(input.comments) ? input.comments : [],
  };
}

function validateTaskInput(task, currentUser) {
  if (!task.title || task.title.length < 3) {
    throw new Error("Task title must be at least 3 characters long.");
  }

  if (!task.description) {
    throw new Error("Please add a short task description.");
  }

  if (!task.category) {
    throw new Error("Please choose or enter a category.");
  }

  if (task.taskType === "deadline" && !task.deadline) {
    throw new Error("Please select a deadline for this task.");
  }

  if (task.githubBranch) {
    const githubBranchPattern = /^[\w.-]+\/[\w.-]+:[\w.-]+$/;
    if (!githubBranchPattern.test(task.githubBranch)) {
      throw new Error("Invalid GitHub branch format. Use 'owner/repo:branch' (e.g., Saeed/Taskly:main)");
    }
  }

  if (task.isPersonal) {
    return;
  }

  const group = getGroupById(task.groupId);
  if (!group) {
    throw new Error("Please choose a valid group.");
  }

  if (!canCreateGroupTask(currentUser, group)) {
    throw new Error("You do not have permission to create or update group tasks.");
  }

  // Requirement 3.2: Ensure group leaders cannot assign tasks to users outside their group.
  const memberIds = Array.isArray(group.memberIds) ? group.memberIds : [];
  const isValidAssignee = memberIds.includes(task.assignedTo) || group.leaderId === task.assignedTo;

  if (task.assignedTo && !isValidAssignee) {
    throw new Error("The assigned user must be a member of the group.");
  }
}

async function createTask(input, currentUser) {
  const task = normalizeTaskInput(input);
  validateTaskInput(task, currentUser);

  const response = await createTaskWithApi(task);
  hydrateAppState(response.state);
  return getTasks()[0] ?? null;
}

function canEditTask(task, currentUser) {
  if (!task || !currentUser) {
    return false;
  }

  if (currentUser.globalRole === "admin") {
    return true;
  }

  if (task.isPersonal) {
    return task.createdBy === currentUser.id;
  }

  const group = getGroupById(task.groupId);
  return Boolean(group && (group.leaderId === currentUser.id || task.createdBy === currentUser.id || canCreateGroupTask(currentUser, group)));
}

async function updateTask(taskId, updates, currentUser) {
  const existingTask = getTaskById(taskId);
  if (!existingTask) {
    throw new Error("Task not found.");
  }

  if (!canEditTask(existingTask, currentUser)) {
    throw new Error("You do not have permission to edit this task.");
  }

  const nextTask = {
    ...existingTask,
    ...normalizeTaskInput({ ...existingTask, ...updates }),
  };

  validateTaskInput(nextTask, currentUser);
  const response = await updateTaskWithApi(taskId, nextTask);
  hydrateAppState(response.state);
  return getTaskById(taskId);
}

async function deleteTask(taskId, currentUser) {
  const existingTask = getTaskById(taskId);
  if (!existingTask) {
    throw new Error("Task not found.");
  }

  if (!canEditTask(existingTask, currentUser)) {
    throw new Error("You do not have permission to delete this task.");
  }

  const response = await deleteTaskWithApi(taskId);
  hydrateAppState(response.state);
}

function archiveTask(taskId, currentUser) {
  return updateTask(taskId, { isArchived: true }, currentUser);
}

async function syncTaskWithGithub(taskId, currentUser) {
  const task = getTaskById(taskId);
  if (!task) {
    throw new Error("Task not found.");
  }

  const group = getGroupById(task.groupId);
  const isAuthorized = currentUser.globalRole === "admin" || (group && group.leaderId === currentUser.id);

  if (!isAuthorized) {
    throw new Error("Only group leaders can manually sync with GitHub.");
  }

  if (!task.githubBranch) {
    throw new Error("No GitHub branch linked to this task.");
  }

  const response = await syncTaskWithApi(taskId);
  hydrateAppState(response.state);
  return getTaskById(taskId);
}

async function addTaskComment(taskId, text, currentUser) {
  const task = getTaskById(taskId);
  if (!task) {
    throw new Error("Task not found.");
  }

  const visibleTasks = getUserVisibleTasks(currentUser);
  if (!visibleTasks.some((entry) => entry.id === taskId)) {
    throw new Error("You do not have permission to comment on this task.");
  }

  const commentText = text?.trim();
  if (!commentText) {
    throw new Error("Comment text cannot be empty.");
  }

  const response = await addTaskCommentWithApi(taskId, { text: commentText });
  hydrateAppState(response.state);
  return getTaskById(taskId)?.comments?.slice(-1)[0] ?? null;
}

async function deleteTaskComment(taskId, commentId, currentUser) {
  const task = getTaskById(taskId);
  if (!task) {
    throw new Error("Task not found.");
  }

  const comment = task.comments?.find((c) => c.id === commentId);
  if (!comment) {
    throw new Error("Comment not found.");
  }

  // Frontend safety check mirroring backend logic
  if (comment.userId !== currentUser.id && currentUser.globalRole !== "admin") {
    throw new Error("You do not have permission to delete this comment.");
  }

  const response = await deleteTaskCommentWithApi(taskId, commentId);
  hydrateAppState(response.state);
}

function canUpdateTaskStatus(task, currentUser) {
  if (!task || !currentUser) {
    return false;
  }

  if (currentUser.globalRole === "admin") {
    return true;
  }

  if (task.isPersonal) {
    return task.createdBy === currentUser.id;
  }

  if (task.taskType === "reminder") {
    const group = getGroupById(task.groupId);
    return Boolean(group?.memberIds.includes(currentUser.id));
  }

  return task.assignedTo === currentUser.id || canEditTask(task, currentUser);
}

async function updateTaskStatus(taskId, { status, progressNote }, currentUser) {
  if (!VALID_STATUSES.includes(status)) {
    throw new Error("Please choose a valid task status.");
  }

  const task = getTaskById(taskId);
  if (!task) {
    throw new Error("Task not found.");
  }

  if (!canUpdateTaskStatus(task, currentUser)) {
    throw new Error("You do not have permission to update this task.");
  }

  const response = await updateTaskStatusWithApi(taskId, {
    status,
    progressNote: progressNote?.trim() ?? task.progressNote ?? "",
  });

  hydrateAppState(response.state);
  return getTaskById(taskId);
}

function getTaskAssigneeName(task) {
  if (!task.assignedTo) {
    return "Unassigned";
  }
  return getUsers().find((user) => user.id === task.assignedTo)?.name ?? "Unknown";
}

function getTaskAssigneeRole(task) {
  if (!task.assignedTo || !task.groupId) {
    return "";
  }
  const group = getGroups().find((entry) => entry.id === task.groupId);
  if (!group) {
    return "";
  }
  if (group.leaderId === task.assignedTo) {
    return "leader";
  }
  return group.roleMap?.[task.assignedTo] ?? "member";
}

export {
  VALID_STATUSES,
  addTaskComment,
  deleteTaskComment,
  archiveTask,
  canEditTask,
  canUpdateTaskStatus,
  createTask,
  deleteTask,
  getGroupTasks,
  getTaskAssigneeName,
  getTaskAssigneeRole,
  getTaskById,
  getUserVisibleTasks,
  syncTaskWithGithub,
  updateTask,
  updateTaskStatus,
};
