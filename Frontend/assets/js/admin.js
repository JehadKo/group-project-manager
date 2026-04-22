import { removeUserWithApi, toggleUserActiveWithApi } from "./api.js";
import { exportAppData, getGroups, getTasks, getUsers, hydrateAppState } from "./storage.js";

function getSystemMetrics() {
  const users = getUsers();
  const tasks = getTasks();
  const groups = getGroups();
  const completed = tasks.filter((task) => task.status === "Completed").length;

  const muhammad = users.find((user) => user.email === "saeedmuhammadabdulkadir@gmail.com");
  const muhammadGroups = muhammad ? groups.filter((group) => group.memberIds.includes(muhammad.id)).length : 0;

  const growthMap = {};
  const taskGrowthMap = {};

  users.forEach((user) => {
    const date = String(user.createdAt || "").slice(0, 10);
    if (date) {
      growthMap[date] = (growthMap[date] || 0) + 1;
    }
  });

  tasks.forEach((task) => {
    const date = String(task.createdAt || "").slice(0, 10);
    if (date) {
      taskGrowthMap[date] = (taskGrowthMap[date] || 0) + 1;
    }
  });

  const sortedDates = Array.from(new Set([...Object.keys(growthMap), ...Object.keys(taskGrowthMap)])).sort();

  let userCumulative = 0;
  let taskCumulative = 0;

  const growthTimeline = sortedDates.map((date) => {
    userCumulative += growthMap[date] || 0;
    taskCumulative += taskGrowthMap[date] || 0;

    return {
      date,
      userCount: userCumulative,
      taskCount: taskCumulative,
    };
  });

  const topGroups = groups
    .map((group) => {
      const groupTasks = tasks.filter((task) => task.groupId === group.id);
      const done = groupTasks.filter((task) => task.status === "Completed").length;
      return {
        id: group.id,
        name: group.groupName,
        taskCount: groupTasks.length,
        completionRate: groupTasks.length ? Math.round((done / groupTasks.length) * 100) : 0,
      };
    })
    .sort((left, right) => right.taskCount - left.taskCount)
    .slice(0, 5);

  return {
    users: users.length,
    activeUsers: users.filter((user) => user.isActive).length,
    groups: groups.length,
    muhammadGroups,
    tasks: tasks.length,
    completionRate: tasks.length ? Math.round((completed / tasks.length) * 100) : 0,
    growthTimeline,
    topGroups,
    recentActivity: tasks
      .slice()
      .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
      .slice(0, 5),
  };
}

async function toggleUserActive(userId) {
  const response = await toggleUserActiveWithApi(userId);
  hydrateAppState(response.state);
  return getUsers().find((user) => user.id === userId) ?? null;
}

async function removeUser(userId) {
  const response = await removeUserWithApi(userId);
  hydrateAppState(response.state);
}

function downloadBackup() {
  const data = JSON.stringify(exportAppData(), null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `sgpm-backup-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export {
  downloadBackup,
  getSystemMetrics,
  removeUser,
  toggleUserActive,
};
