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
  if (persistent) {
    return persistent;
  }

  const sessionOnly = sessionStorage.getItem(STORAGE_KEYS.session);
  return sessionOnly ? JSON.parse(sessionOnly) : null;
}

function saveSession(session, persist = false) {
  if (!session) {
    localStorage.removeItem(STORAGE_KEYS.session);
    sessionStorage.removeItem(STORAGE_KEYS.session);
    return null;
  }

  if (persist) {
    return writeJson(STORAGE_KEYS.session, session);
  }

  sessionStorage.setItem(STORAGE_KEYS.session, JSON.stringify(session));
  localStorage.removeItem(STORAGE_KEYS.session);
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

function hydrateAppState(state = {}) {
  saveUsers(Array.isArray(state.users) ? state.users : []);
  saveGroups(Array.isArray(state.groups) ? state.groups : []);
  saveTasks(Array.isArray(state.tasks) ? state.tasks : []);
  saveProgressLogs(Array.isArray(state.progressLogs) ? state.progressLogs : []);
}

function clearAppState({ preserveSession = false } = {}) {
  localStorage.removeItem(STORAGE_KEYS.users);
  localStorage.removeItem(STORAGE_KEYS.groups);
  localStorage.removeItem(STORAGE_KEYS.tasks);
  localStorage.removeItem(STORAGE_KEYS.progressLogs);
  localStorage.removeItem(STORAGE_KEYS.seeded);

  if (!preserveSession) {
    localStorage.removeItem(STORAGE_KEYS.session);
    sessionStorage.removeItem(STORAGE_KEYS.session);
  }
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
    // The app now hydrates from the Flask backend, so local demo seeding stays disabled.
}

export {
  STORAGE_KEYS,
  clearAppState,
  exportAppData,
  generateId,
  generateInviteCode,
  getGroups,
  getProgressLogs,
  getSession,
  getTasks,
  getUsers,
  hydrateAppState,
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
