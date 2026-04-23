import { getGroups, getTasks, getUsers, getProgressLogs, getComplexityTargets } from "./storage.js";
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
  const now = new Date();
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  // Reconstruct state from 7 days ago
  const pastTasks = tasks.filter((t) => new Date(t.createdAt) <= weekAgo);
  const pastTasksWithStatus = pastTasks.map((t) => {
    const relevantLogs = logs
      .filter((l) => l.taskId === t.id && new Date(l.createdAt) <= weekAgo)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return {
      ...t,
      status: relevantLogs.length ? relevantLogs[0].statusAtLog : "Pending",
    };
  });

  const currentOverview = summarizeTasks(tasks);
  const pastOverview = summarizeTasks(pastTasksWithStatus);

  const upcomingTasks = tasks
    .filter((task) => task.deadline && task.status !== "Completed")
    .sort((left, right) => new Date(left.deadline) - new Date(right.deadline))
    .slice(0, 5);

  const overdueCount = tasks.filter((task) => {
    if (!task.deadline || task.status === "Completed") {
      return false;
    }

    return new Date(task.deadline) < now;
  }).length;

  const dueSoonCount = tasks.filter((task) => {
    if (!task.deadline || task.status === "Completed") {
      return false;
    }

    const deadline = new Date(task.deadline);
    const hoursUntilDue = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);
    return hoursUntilDue >= 0 && hoursUntilDue <= 72;
  }).length;

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
      (l) => l.statusAtLog === "Completed" && l.createdAt?.startsWith(dateStr) && tasks.some((t) => t.id === l.taskId)
    ).length;

    weeklyActivity.push({
      label: day.toLocaleDateString("en-GB", { weekday: "short" }),
      count: completedOnDay,
    });
  }

  const completedThisWeek = weeklyActivity.reduce((total, day) => total + day.count, 0);

  const typeBreakdown = {
    deadlines: tasks.filter((t) => t.taskType === "deadline").length,
    reminders: tasks.filter((t) => t.taskType === "reminder").length,
  };

  // Calculate Leaderboard: Top 5 contributors by completed tasks
  const completedTasks = tasks.filter((t) => t.status === "Completed" && t.assignedTo);
  const userCompletions = {};
  completedTasks.forEach((t) => {
    userCompletions[t.assignedTo] = (userCompletions[t.assignedTo] || 0) + 1;
  });

  const leaderboard = Object.entries(userCompletions)
    .map(([userId, count]) => ({
      user: getUsers().find((u) => u.id === userId),
      count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    overview: currentOverview,
    groupCount: groups.length,
    personalCount: personalTasks.length,
    assignedCount: currentAssignedCount,
    allTasks: tasks,
    upcomingTasks,
    overdueCount,
    dueSoonCount,
    completedThisWeek,
    groups,
    trends: {
      taskDiff: currentOverview.total - pastOverview.total,
      rateDiff: currentOverview.completionRate - pastOverview.completionRate,
      assignedDiff: currentAssignedCount - pastAssignedCount,
    },
    weeklyActivity,
    typeBreakdown,
    leaderboard,
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

/**
 * Calculates a weighted health score (0-100) for a group.
 * Professional Metric: Weighs deadline compliance against LoC sync fidelity.
 */
function getGroupHealth(groupId) {
  const progress = getGroupProgress(groupId);
  if (!progress || progress.total === 0) return { score: 100, label: "Healthy", tone: "positive" };

  const now = new Date();
  const complexityMap = getComplexityTargets();
  let healthScore = 100;

  progress.tasks.forEach(task => {
    // 1. Time-based Risk
    if (task.status !== "Completed" && task.deadline) {
      const deadline = new Date(task.deadline);
      if (deadline < now) {
        healthScore -= (task.priority === "High" ? 20 : 10);
      } else {
        const hoursRemaining = (deadline - now) / (1000 * 60 * 60);
        if (hoursRemaining < 48 && task.status === "Pending") healthScore -= 5;
      }
    }

    // 2. Technical Integrity (Sync Fidelity)
    if (task.actualLoC !== null) {
      const targetLoC = complexityMap[task.complexitySize] || 500;
      const ratio = task.actualLoC / targetLoC;

      if (task.status === "Completed" && ratio < 0.25) healthScore -= 15;
      else if (ratio > 1.5) healthScore -= 10;
    }
  });

  const score = Math.max(0, healthScore);
  if (score < 50) return { score, label: "Critical", tone: "critical" };
  if (score < 80) return { score, label: "At Risk", tone: "watch" };
  return { score, label: "Healthy", tone: "positive" };
}

export {
  getAdminOverview,
  getGroupProgress,
  getUserDashboardData,
  getGroupHealth,
  summarizeTasks,
};
