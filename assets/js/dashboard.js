import { getGroups, getTasks, getUsers, getProgressLogs } from "./storage.js";
import { getUserGroups } from "./groups.js";
import { getUserVisibleTasks } from "./tasks.js";

function summarizeTasks(tasks) {
  const counts = {
    total: tasks.length,
    pending: 0,
    ongoing: 0,
    completed: 0,
  };

  tasks.forEach((task) => {
    if (task.status === "Completed") {
      counts.completed += 1;
      return;
    }

    if (task.status === "Ongoing") {
      counts.ongoing += 1;
      return;
    }

    counts.pending += 1;
  });

  const completionRate = counts.total ? Math.round((counts.completed / counts.total) * 100) : 0;
  return { ...counts, completionRate };
}

function getUserDashboardData(user) {
  const tasks = getUserVisibleTasks(user);
  const groups = getUserGroups(user);
  const personalTasks = tasks.filter((task) => task.isPersonal);
  const groupTasks = tasks.filter((task) => !task.isPersonal);
  const logs = getProgressLogs();
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  // Reconstruct state from 7 days ago
  const pastTasks = tasks.filter((t) => new Date(t.createdAt) <= weekAgo);
  const pastTasksWithStatus = pastTasks.map((t) => {
    const relevantLogs = logs
      .filter((l) => l.taskId === t.id && new Date(l.timestamp) <= weekAgo)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return {
      ...t,
      status: relevantLogs.length ? relevantLogs[0].status : "Pending",
    };
  });

  const currentOverview = summarizeTasks(tasks);
  const pastOverview = summarizeTasks(pastTasksWithStatus);

  const upcomingTasks = tasks
    .filter((task) => task.deadline)
    .sort((left, right) => new Date(left.deadline) - new Date(right.deadline))
    .slice(0, 5);

  const pastAssignedCount = pastTasksWithStatus.filter(
    (t) => !t.isPersonal && t.assignedTo === user.id && t.status !== "Completed"
  ).length;

  const currentAssignedCount = groupTasks.filter(
    (task) => task.assignedTo === user.id && task.status !== "Completed"
  ).length;

  // Calculate daily completions for the last 7 days
  const weeklyActivity = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date();
    day.setDate(day.getDate() - i);
    const dateStr = day.toISOString().slice(0, 10);

    const completedOnDay = logs.filter(
      (l) => l.status === "Completed" && l.timestamp.startsWith(dateStr) && tasks.some((t) => t.id === l.taskId)
    ).length;

    weeklyActivity.push({
      label: day.toLocaleDateString("en-GB", { weekday: "short" }),
      count: completedOnDay,
    });
  }

  const typeBreakdown = {
    deadlines: tasks.filter((t) => t.taskType === "deadline").length,
    reminders: tasks.filter((t) => t.taskType === "reminder").length,
  };

  return {
    overview: currentOverview,
    groupCount: groups.length,
    personalCount: personalTasks.length,
    assignedCount: currentAssignedCount,
    upcomingTasks,
    groups,
    trends: {
      taskDiff: currentOverview.total - pastOverview.total,
      rateDiff: currentOverview.completionRate - pastOverview.completionRate,
      assignedDiff: currentAssignedCount - pastAssignedCount,
    },
    weeklyActivity,
    typeBreakdown,
  };
}

function getGroupProgress(groupId) {
  const group = getGroups().find((entry) => entry.id === groupId);
  if (!group) {
    return null;
  }

  const tasks = getTasks().filter((task) => task.groupId === groupId && !task.isPersonal);
  const summary = summarizeTasks(tasks);
  const memberMap = getUsers()
    .filter((user) => group.memberIds.includes(user.id))
    .map((user) => ({
      name: user.name,
      role: group.roleMap?.[user.id] ?? "member",
      tasksAssigned: tasks.filter((task) => task.assignedTo === user.id).length,
      tasksCompleted: tasks.filter((task) => task.assignedTo === user.id && task.status === "Completed").length,
    }));

  return {
    group,
    tasks,
    summary,
    memberMap,
  };
}

function getAdminOverview() {
  const users = getUsers();
  const groups = getGroups();
  const tasks = getTasks();
  return {
    userCount: users.length,
    activeUsers: users.filter((user) => user.isActive).length,
    groupCount: groups.length,
    taskSummary: summarizeTasks(tasks),
  };
}

export {
  getAdminOverview,
  getGroupProgress,
  getUserDashboardData,
  summarizeTasks,
};
