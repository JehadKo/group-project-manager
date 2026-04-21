import {
  generateId,
  getGroups,
  getTasks,
  getUsers,
  saveProgressLogs,
  saveTasks,
  getProgressLogs,
} from "./storage.js";
import { canCreateGroupTask, getGroupById } from "./groups.js";

const VALID_STATUSES = ["Pending", "Ongoing", "Completed"];

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

    if (task.isArchived) return false;

    const group = groups.find((entry) => entry.id === task.groupId);
    return Boolean(group?.memberIds.includes(user.id));
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
  if (!task.title) {
    throw new Error("Please enter a task title.");
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

  if (task.assignedTo && !group.memberIds.includes(task.assignedTo)) {
    throw new Error("The assigned user must be a member of the group.");
  }
}

function createTask(input, currentUser) {
  const task = normalizeTaskInput(input);
  validateTaskInput(task, currentUser);

  const newTask = {
    id: generateId("task"),
    ...task,
    createdBy: currentUser.id,
    createdAt: new Date().toISOString(),
  };

  if (newTask.isPersonal) {
    newTask.assignedTo = currentUser.id;
    newTask.groupId = null;
  }

  saveTasks([...getTasks(), newTask]);
  return newTask;
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

function updateTask(taskId, updates, currentUser) {
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
  saveTasks(getTasks().map((task) => (task.id === taskId ? nextTask : task)));
  return nextTask;
}

function deleteTask(taskId, currentUser) {
  const existingTask = getTaskById(taskId);
  if (!existingTask) {
    throw new Error("Task not found.");
  }

  if (!canEditTask(existingTask, currentUser)) {
    throw new Error("You do not have permission to delete this task.");
  }

  saveTasks(getTasks().filter((task) => task.id !== taskId));
}

function archiveTask(taskId, currentUser) {
  const existingTask = getTaskById(taskId);
  if (!existingTask) {
    throw new Error("Task not found.");
  }

  if (!canEditTask(existingTask, currentUser)) {
    throw new Error("You do not have permission to archive this task.");
  }

  saveTasks(getTasks().map((t) => t.id === taskId ? { ...t, isArchived: true } : t));
}

function addTaskComment(taskId, text, currentUser) {
  const task = getTaskById(taskId);
  if (!task) {
    throw new Error("Task not found.");
  }

  // Ensure user can see the task to comment on it
  const visibleTasks = getUserVisibleTasks(currentUser);
  if (!visibleTasks.some((t) => t.id === taskId)) {
    throw new Error("You do not have permission to comment on this task.");
  }

  const commentText = text?.trim();
  if (!commentText) {
    throw new Error("Comment text cannot be empty.");
  }

  const newComment = {
    id: generateId("comment"),
    userId: currentUser.id,
    userName: currentUser.name,
    text: commentText,
    timestamp: new Date().toISOString(),
  };

  const updatedTask = {
    ...task,
    comments: [...(task.comments || []), newComment],
  };

  saveTasks(getTasks().map((t) => (t.id === taskId ? updatedTask : t)));
  return newComment;
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

function updateTaskStatus(taskId, { status, progressNote }, currentUser) {
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

  const updatedTask = {
    ...task,
    status,
    progressNote: progressNote?.trim() ?? task.progressNote ?? "",
  };

  saveTasks(getTasks().map((entry) => (entry.id === taskId ? updatedTask : entry)));

  const logs = [
    ...getProgressLogs(),
    {
      id: generateId("log"),
      taskId,
      userId: currentUser.id,
      note: updatedTask.progressNote,
      status,
      timestamp: new Date().toISOString(),
    },
  ];

  saveProgressLogs(logs);
  return updatedTask;
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
  canEditTask,
  canUpdateTaskStatus,
  archiveTask,
  createTask,
  deleteTask,
  getGroupTasks,
  getTaskAssigneeName,
  getTaskAssigneeRole,
  getTaskById,
  getUserVisibleTasks,
  updateTask,
  updateTaskStatus,
};
