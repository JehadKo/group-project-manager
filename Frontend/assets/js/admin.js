import { exportAppData, getGroups, getTasks, getUsers, saveGroups, saveTasks, saveUsers } from "./storage.js";

function getSystemMetrics() {
  const users = getUsers();
  const tasks = getTasks();
  const groups = getGroups();
  const completed = tasks.filter((task) => task.status === "Completed").length;

  const muhammad = users.find((u) => u.email === "saeedmuhammadabdulkadir@gmail.com");
  const muhammadGroups = muhammad ? groups.filter((g) => g.memberIds.includes(muhammad.id)).length : 0;

  // Calculate cumulative growth over time for both users and tasks
  const growthMap = {};
  const taskGrowthMap = {};

  users.forEach((u) => { const d = u.createdAt.slice(0, 10); growthMap[d] = (growthMap[d] || 0) + 1; });
  tasks.forEach((t) => { const d = t.createdAt.slice(0, 10); taskGrowthMap[d] = (taskGrowthMap[d] || 0) + 1; });

  const sortedDates = Array.from(new Set([...Object.keys(growthMap), ...Object.keys(taskGrowthMap)])).sort();
  
  let userCumulative = 0;
  let taskCumulative = 0;
  
  const growthTimeline = sortedDates.map((date) => {
    userCumulative += growthMap[date] || 0;
    taskCumulative += taskGrowthMap[date] || 0;
    return { 
      date, 
      userCount: userCumulative, 
      taskCount: taskCumulative 
    };
  });

  // Calculate top groups by task volume and efficiency
  const topGroups = groups
    .map((group) => {
      const groupTasks = tasks.filter((t) => t.groupId === group.id);
      const completed = groupTasks.filter((t) => t.status === "Completed").length;
      return {
        id: group.id,
        name: group.groupName,
        taskCount: groupTasks.length,
        completionRate: groupTasks.length ? Math.round((completed / groupTasks.length) * 100) : 0,
      };
    })
    .sort((a, b) => b.taskCount - a.taskCount)
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

function toggleUserActive(userId) {
  const users = getUsers();
  let updatedUser = null;

  const updatedUsers = users.map((user) => {
    if (user.id !== userId) {
      return user;
    }

    if (user.globalRole === "admin") {
      throw new Error("The admin demo account cannot be deactivated here.");
    }

    updatedUser = {
      ...user,
      isActive: !user.isActive,
    };

    return updatedUser;
  });

  if (!updatedUser) {
    throw new Error("User not found.");
  }

  saveUsers(updatedUsers);
  return updatedUser;
}

function removeUser(userId) {
  const user = getUsers().find((entry) => entry.id === userId);
  if (!user) {
    throw new Error("User not found.");
  }

  if (user.globalRole === "admin") {
    throw new Error("The admin demo account cannot be removed.");
  }

  if (getGroups().some((group) => group.leaderId === userId)) {
    throw new Error("This user leads a group. Reassign or keep the account for the demo.");
  }

  saveUsers(getUsers().filter((entry) => entry.id !== userId));
  saveGroups(
    getGroups().map((group) => ({
      ...group,
      memberIds: group.memberIds.filter((memberId) => memberId !== userId),
      roleMap: Object.fromEntries(
        Object.entries(group.roleMap ?? {}).filter(([memberId]) => memberId !== userId)
      ),
    }))
  );
  saveTasks(
    getTasks().map((task) => ({
      ...task,
      assignedTo: task.assignedTo === userId ? null : task.assignedTo,
    }))
  );
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
