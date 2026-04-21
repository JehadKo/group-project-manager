const STORAGE_KEYS = {
  users: "sgpm_users",
  groups: "sgpm_groups",
  tasks: "sgpm_tasks",
  progressLogs: "sgpm_progress_logs",
  session: "sgpm_session",
  seeded: "sgpm_seeded",
};

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    console.error(`Failed to read ${key}`, error);
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
  return value;
}

function generateId(prefix = "id") {
  if (window.crypto?.randomUUID) {
    return `${prefix}-${window.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function generateInviteCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function getUsers() {
  return readJson(STORAGE_KEYS.users, []);
}

function saveUsers(users) {
  return writeJson(STORAGE_KEYS.users, users);
}

function getGroups() {
  return readJson(STORAGE_KEYS.groups, []);
}

function saveGroups(groups) {
  return writeJson(STORAGE_KEYS.groups, groups);
}

function getTasks() {
  return readJson(STORAGE_KEYS.tasks, []);
}

function saveTasks(tasks) {
  return writeJson(STORAGE_KEYS.tasks, tasks);
}

function getProgressLogs() {
  return readJson(STORAGE_KEYS.progressLogs, []);
}

function saveProgressLogs(logs) {
  return writeJson(STORAGE_KEYS.progressLogs, logs);
}

function getSession() {
  const persistent = readJson(STORAGE_KEYS.session, null);
  if (persistent) return persistent;

  const sessionOnly = sessionStorage.getItem(STORAGE_KEYS.session);
  return sessionOnly ? JSON.parse(sessionOnly) : null;
}

function saveSession(session, persist = false) {
  if (!session) {
    localStorage.removeItem(STORAGE_KEYS.session);
    sessionStorage.removeItem(STORAGE_KEYS.session);
    return null;
  }
  if (persist) return writeJson(STORAGE_KEYS.session, session);
  sessionStorage.setItem(STORAGE_KEYS.session, JSON.stringify(session));
  return session;
}

function updateUsers(updater) {
  const updated = updater(getUsers());
  return saveUsers(updated);
}

function updateGroups(updater) {
  const updated = updater(getGroups());
  return saveGroups(updated);
}

function updateTasks(updater) {
  const updated = updater(getTasks());
  return saveTasks(updated);
}

function updateProgressLogs(updater) {
  const updated = updater(getProgressLogs());
  return saveProgressLogs(updated);
}

function upsertById(items, item) {
  const index = items.findIndex((entry) => entry.id === item.id);
  if (index === -1) {
    return [...items, item];
  }

  const next = [...items];
  next[index] = item;
  return next;
}

function exportAppData() {
  return {
    exportedAt: new Date().toISOString(),
    users: getUsers(),
    groups: getGroups(),
    tasks: getTasks(),
    progressLogs: getProgressLogs(),
  };
}

function seedAppData() {
  if (localStorage.getItem(STORAGE_KEYS.seeded)) {
    return;
  }

  const adminId = generateId("user");
  const leaderId = generateId("user");
  const studentId = generateId("user");
  const memberId = generateId("user");
  const groupId = generateId("group");

  const users = [
    {
      id: adminId,
      name: "Admin One",
      email: "admin@demo.com",
      password: "admin123",
      profilePicture: "",
      globalRole: "admin",
      joinedGroupIds: [],
      isActive: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: leaderId,
      name: "Layla Hassan",
      email: "leader@demo.com",
      password: "leader123",
      profilePicture: "",
      globalRole: "student",
      joinedGroupIds: [groupId],
      isActive: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: studentId,
      name: "Muhammad AbdulKadir Saeed",
      email: "saeedmuhammadabdulkadir@gmail.com",
      password: "student123",
      profilePicture: "",
      globalRole: "student",
      joinedGroupIds: [],
      isActive: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: memberId,
      name: "Maha Saeed",
      email: "member@demo.com",
      password: "member123",
      profilePicture: "",
      globalRole: "student",
      joinedGroupIds: [groupId],
      isActive: true,
      createdAt: new Date().toISOString(),
    },
  ];

  const groups = [
    {
      id: groupId,
      groupName: "Software Engineering Team Alpha",
      inviteCode: generateInviteCode(),
      leaderId,
      memberIds: [leaderId, memberId],
      roleMap: {
        [leaderId]: "leader",
        [memberId]: "editor",
      },
      createdAt: new Date().toISOString(),
    },
  ];

  const tasks = [
    {
      id: generateId("task"),
      title: "Write project proposal",
      description: "Draft the problem statement, system goals, and stakeholder summary.",
      deadline: new Date(Date.now() + 1000 * 60 * 60 * 24 * 2).toISOString(),
      status: "Ongoing",
      category: "Documentation",
      assignedTo: studentId,
      groupId,
      isPersonal: false,
      taskType: "deadline",
      progressNote: "Requirements section is halfway done.",
      createdBy: leaderId,
      createdAt: new Date().toISOString(),
    },
    {
      id: generateId("task"),
      title: "Design landing page layout",
      description: "Create a clean HTML and CSS structure for the homepage and app shell.",
      deadline: new Date(Date.now() + 1000 * 60 * 60 * 24 * 4).toISOString(),
      status: "Pending",
      category: "Frontend",
      assignedTo: memberId,
      groupId,
      isPersonal: false,
      taskType: "deadline",
      progressNote: "",
      createdBy: leaderId,
      createdAt: new Date().toISOString(),
    },
    {
      id: generateId("task"),
      title: "Confirm meeting at 6 PM",
      description: "Reminder for the weekly sprint check-in with the group.",
      deadline: new Date(Date.now() + 1000 * 60 * 60 * 10).toISOString(),
      status: "Pending",
      category: "Reminder",
      assignedTo: null,
      groupId,
      isPersonal: false,
      taskType: "reminder",
      progressNote: "",
      createdBy: leaderId,
      createdAt: new Date().toISOString(),
    },
    {
      id: generateId("task"),
      title: "Prepare database ER sketch",
      description: "Brainstorm classes and attributes before building the final interface.",
      deadline: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
      status: "Completed",
      category: "Analysis",
      assignedTo: leaderId,
      groupId,
      isPersonal: false,
      taskType: "deadline",
      progressNote: "Initial ERD completed and shared with the team.",
      createdBy: leaderId,
      createdAt: new Date().toISOString(),
    },
    {
      id: generateId("task"),
      title: "Practice final presentation",
      description: "Review demo flow and prepare talking points for each screen.",
      deadline: new Date(Date.now() + 1000 * 60 * 60 * 24 * 3).toISOString(),
      status: "Pending",
      category: "Personal",
      assignedTo: studentId,
      groupId: null,
      isPersonal: true,
      taskType: "deadline",
      progressNote: "",
      createdBy: studentId,
      createdAt: new Date().toISOString(),
    },
  ];

  const progressLogs = [
    {
      id: generateId("log"),
      taskId: tasks[0].id,
      userId: studentId,
      note: "Requirements section is halfway done.",
      status: "Ongoing",
      timestamp: new Date().toISOString(),
    },
    {
      id: generateId("log"),
      taskId: tasks[3].id,
      userId: leaderId,
      note: "Initial ERD completed and shared with the team.",
      status: "Completed",
      timestamp: new Date().toISOString(),
    },
  ];

  saveUsers(users);
  saveGroups(groups);
  saveTasks(tasks);
  saveProgressLogs(progressLogs);
  localStorage.setItem(STORAGE_KEYS.seeded, "true");
}

export {
  STORAGE_KEYS,
  exportAppData,
  generateId,
  generateInviteCode,
  getGroups,
  getProgressLogs,
  getSession,
  getTasks,
  getUsers,
  readJson,
  saveGroups,
  saveProgressLogs,
  saveSession,
  saveTasks,
  saveUsers,
  seedAppData,
  updateGroups,
  updateProgressLogs,
  updateTasks,
  updateUsers,
  upsertById,
  writeJson,
};
