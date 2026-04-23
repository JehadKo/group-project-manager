import { getSession } from "./storage.js";

const DEFAULT_API_BASE = "http://127.0.0.1:5000/api";

function getApiBase() {
  const configuredBase =
    window.SGPM_API_BASE ||
    localStorage.getItem("sgpm_api_base") ||
    DEFAULT_API_BASE;

  return configuredBase.replace(/\/$/, "");
}

async function apiRequest(path, options = {}) {
  const session = getSession();
  const headers = new Headers(options.headers || {});

  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (session?.token) {
    headers.set("Authorization", `Bearer ${session.token}`);
  }

  const response = await fetch(`${getApiBase()}${path}`, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch (error) {
    data = {};
  }

  if (!response.ok) {
    throw new Error(data.error || `Request failed with status ${response.status}.`);
  }

  return data;
}

function registerWithApi(payload) {
  return apiRequest("/register", {
    method: "POST",
    body: payload,
  });
}

function loginWithApi(payload) {
  return apiRequest("/login", {
    method: "POST",
    body: payload,
  });
}

function requestPasswordResetWithApi(payload) {
  return apiRequest("/forgot-password", {
    method: "POST",
    body: payload,
  });
}

function resetPasswordWithApi(payload) {
  return apiRequest("/reset-password", {
    method: "POST",
    body: payload,
  });
}

function logoutWithApi() {
  return apiRequest("/logout", {
    method: "POST",
  });
}

function fetchBootstrap() {
  return apiRequest("/bootstrap");
}

function updateProfileWithApi(payload) {
  return apiRequest("/profile", {
    method: "PATCH",
    body: payload,
  });
}

function deleteProfileWithApi() {
  return apiRequest("/profile", {
    method: "DELETE",
  });
}

function createGroupWithApi(payload) {
  return apiRequest("/groups", {
    method: "POST",
    body: payload,
  });
}

function joinGroupWithApi(payload) {
  return apiRequest("/groups/join", {
    method: "POST",
    body: payload,
  });
}

function updateGroupRoleWithApi(groupId, userId, payload) {
  return apiRequest(`/groups/${groupId}/members/${userId}/role`, {
    method: "PATCH",
    body: payload,
  });
}

function transferLeadershipWithApi(groupId, payload) {
  return apiRequest(`/groups/${groupId}/leader`, {
    method: "POST",
    body: payload,
  });
}

function leaveGroupWithApi(groupId) {
  return apiRequest(`/groups/${groupId}/leave`, {
    method: "POST",
  });
}

function deleteGroupWithApi(groupId) {
  return apiRequest(`/groups/${groupId}`, {
    method: "DELETE",
  });
}

function createTaskWithApi(payload) {
  return apiRequest("/tasks", {
    method: "POST",
    body: payload,
  });
}

function updateTaskWithApi(taskId, payload) {
  return apiRequest(`/tasks/${taskId}`, {
    method: "PATCH",
    body: payload,
  });
}

function deleteTaskWithApi(taskId) {
  return apiRequest(`/tasks/${taskId}`, {
    method: "DELETE",
  });
}

function updateTaskStatusWithApi(taskId, payload) {
  return apiRequest(`/tasks/${taskId}/status`, {
    method: "PATCH",
    body: payload,
  });
}

function addTaskCommentWithApi(taskId, payload) {
  return apiRequest(`/tasks/${taskId}/comments`, {
    method: "POST",
    body: payload,
  });
}

function syncTaskWithApi(taskId) {
  return apiRequest(`/tasks/${taskId}/sync`, {
    method: "POST",
  });
}

function getSocialLoginUrl(provider, token = null) {
  const baseUrl = `${getApiBase()}/login/${provider}`;
  return token ? `${baseUrl}?token=${encodeURIComponent(token)}` : baseUrl;
}

function toggleUserActiveWithApi(userId) {
  return apiRequest(`/admin/users/${userId}/active`, {
    method: "PATCH",
  });
}

function updateUserRoleWithApi(userId, payload) {
  return apiRequest(`/admin/users/${userId}/role`, {
    method: "PATCH",
    body: payload,
  });
}

function removeUserWithApi(userId) {
  return apiRequest(`/admin/users/${userId}`, {
    method: "DELETE",
  });
}

export {
  addTaskCommentWithApi,
  createGroupWithApi,
  createTaskWithApi,
  deleteGroupWithApi,
  deleteProfileWithApi,
  deleteTaskWithApi,
  fetchBootstrap,
  getApiBase,
  joinGroupWithApi,
  loginWithApi,
  logoutWithApi,
  removeUserWithApi,
  requestPasswordResetWithApi,
  resetPasswordWithApi,
  registerWithApi,
  getSocialLoginUrl,
  syncTaskWithApi,
  toggleUserActiveWithApi,
  transferLeadershipWithApi,
  updateGroupRoleWithApi,
  updateProfileWithApi,
  updateTaskStatusWithApi,
  updateUserRoleWithApi,
  updateTaskWithApi,
  leaveGroupWithApi,
};
