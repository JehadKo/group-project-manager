import {
  deleteProfileWithApi,
  fetchBootstrap,
  loginWithApi,
  logoutWithApi,
  registerWithApi,
  requestPasswordResetWithApi,
  resetPasswordWithApi,
  updateProfileWithApi,
} from "./api.js";
import {
  STORAGE_KEYS,
  clearAppState,
  getSession,
  getUsers,
  hydrateAppState,
  saveSession,
} from "./storage.js";

const FLASH_KEY = "sgpm_flash";

function setFlash(message, type = "info") {
  sessionStorage.setItem(FLASH_KEY, JSON.stringify({ message, type }));
}

function consumeFlash() {
  const raw = sessionStorage.getItem(FLASH_KEY);
  if (!raw) {
    return null;
  }

  sessionStorage.removeItem(FLASH_KEY);
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function getCurrentUser() {
  const session = getSession();
  if (!session?.userId) {
    return null;
  }

  return getUsers().find((user) => user.id === session.userId) ?? null;
}

function getUserById(userId) {
  return getUsers().find((user) => user.id === userId) ?? null;
}

function persistSessionState({ currentUser, token }, rememberMe = false) {
  if (!currentUser?.id || !token) {
    throw new Error("Unable to persist the current session.");
  }

  saveSession(
    {
      userId: currentUser.id,
      token,
      loggedInAt: new Date().toISOString(),
    },
    rememberMe
  );
}

async function registerUser({ name, email, password, profilePicture = "", githubUsername = "" }) {
  const response = await registerWithApi({
    name,
    email,
    password,
    profilePicture,
    githubUsername,
  });

  hydrateAppState(response.state);
  persistSessionState(
    {
      currentUser: response.state?.currentUser,
      token: response.token,
    },
    false
  );

  return response.state.currentUser;
}

async function loginUser({ email, password, rememberMe = false }) {
  const response = await loginWithApi({
    email: normalizeEmail(email),
    password,
  });

  hydrateAppState(response.state);
  persistSessionState(
    {
      currentUser: response.state?.currentUser,
      token: response.token,
    },
    rememberMe
  );

  return response.state.currentUser;
}

async function syncSessionState() {
  const session = getSession();
  if (!session?.token) {
    return null;
  }

  const response = await fetchBootstrap();
  hydrateAppState(response.state);

  const rememberMe = Boolean(localStorage.getItem(STORAGE_KEYS.session));
  saveSession(
    {
      ...session,
      userId: response.state?.currentUser?.id || session.userId,
    },
    rememberMe
  );

  return response.state?.currentUser ?? null;
}

async function logoutUser({ skipApi = false } = {}) {
  try {
    if (!skipApi) {
      await logoutWithApi();
    }
  } catch (error) {
    // Keep local logout reliable even if the backend is unreachable.
  }

  clearAppState();
  saveSession(null);
}

async function requestPasswordReset(email) {
  await requestPasswordResetWithApi({ email: normalizeEmail(email) });
}

async function resetPassword(token, password) {
  await resetPasswordWithApi({ token, password });
}

async function updateCurrentUserProfile(userId, updates) {
  const currentUser = getCurrentUser();
  if (!currentUser || currentUser.id !== userId) {
    throw new Error("Unable to update the profile right now.");
  }

  const response = await updateProfileWithApi({
    name: updates.name?.trim() || currentUser.name,
    profilePicture: updates.profilePicture ?? currentUser.profilePicture ?? "",
  });

  hydrateAppState(response.state);
  return response.state.currentUser;
}

async function deleteUserAccount(userId) {
  const currentUser = getCurrentUser();
  if (!currentUser || currentUser.id !== userId) {
    throw new Error("Unable to delete the profile right now.");
  }

  await deleteProfileWithApi();
  clearAppState();
  saveSession(null);
}

function ensureAuthenticated() {
  const session = getSession();
  if (!session?.token) {
    setFlash("Please log in to continue.", "info");
    window.location.href = "login.html";
    return null;
  }

  const user = getCurrentUser();
  if (user && user.isActive === false) {
    saveSession(null);
    setFlash("Your account is inactive. Please contact the administrator.", "error");
    window.location.href = "login.html";
    return null;
  }

  return user || { id: session.userId, token: session.token };
}

function ensureRole(user, allowedRoles = []) {
  if (!allowedRoles.length) {
    return true;
  }

  if (!user || !allowedRoles.includes(user.globalRole)) {
    setFlash("You do not have permission to view that page.", "error");
    window.location.href = "dashboard.html";
    return false;
  }

  return true;
}

function isAdmin(user) {
  return user?.globalRole === "admin";
}

export {
  consumeFlash,
  deleteUserAccount,
  ensureAuthenticated,
  ensureRole,
  getCurrentUser,
  getUserById,
  isAdmin,
  loginUser,
  logoutUser,
  registerUser,
  resetPassword,
  requestPasswordReset,
  setFlash,
  syncSessionState,
  updateCurrentUserProfile,
};
