import {
  getSession,
  getUsers,
  saveSession,
  updateUsers,
  updateGroups,
  updateTasks,
  generateId,
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

function registerUser({ name, email, password, profilePicture = "", globalRole = "student" }) {
  if (!name.trim() || !email.trim() || !password.trim()) {
    throw new Error("Please fill in your name, email, and password.");
  }

  const users = getUsers();
  const normalizedEmail = normalizeEmail(email);
  if (users.some((user) => normalizeEmail(user.email) === normalizedEmail)) {
    throw new Error("An account with this email already exists.");
  }

  const newUser = {
    id: generateId("user"),
    name: name.trim(),
    email: normalizedEmail,
    password: password.trim(),
    profilePicture,
    globalRole,
    joinedGroupIds: [],
    isActive: true,
    createdAt: new Date().toISOString(),
  };

  updateUsers((current) => [...current, newUser]);
  saveSession({ userId: newUser.id, loggedInAt: new Date().toISOString() });
  return newUser;
}

function loginUser({ email, password, rememberMe = false }) {
  const normalizedEmail = normalizeEmail(email);
  const user = getUsers().find((entry) => normalizeEmail(entry.email) === normalizedEmail);

  if (!user || user.password !== password.trim()) {
    throw new Error("Invalid email or password.");
  }

  if (!user.isActive) {
    throw new Error("This account is currently inactive. Please contact the system administrator.");
  }

  saveSession(
    { userId: user.id, loggedInAt: new Date().toISOString() },
    rememberMe
  );
  return user;
}

function logoutUser() {
  saveSession(null);
}

function updateCurrentUserProfile(userId, updates) {
  let updatedUser = null;

  updateUsers((users) =>
    users.map((user) => {
      if (user.id !== userId) {
        return user;
      }

      updatedUser = {
        ...user,
        name: updates.name?.trim() || user.name,
        profilePicture: updates.profilePicture ?? user.profilePicture,
      };
      return updatedUser;
    })
  );

  if (!updatedUser) {
    throw new Error("Unable to update the profile right now.");
  }

  return updatedUser;
}

function deleteUserAccount(userId) {
  // 1. Remove the user from the global users list
  updateUsers((current) => current.filter((user) => user.id !== userId));

  // 2. Handle group ownership and membership
  updateGroups((current) =>
    current
      .map((group) => {
        const isLeader = group.leaderId === userId;
        const remainingMembers = group.memberIds.filter((id) => id !== userId);

        if (isLeader) {
          // If the leader is the only member, delete the group entirely
          if (remainingMembers.length === 0) return null;

          // Otherwise, promote the next available member to leader
          const nextLeaderId = remainingMembers[0];
          const nextRoleMap = { ...group.roleMap };
          delete nextRoleMap[userId];
          nextRoleMap[nextLeaderId] = "leader";

          return {
            ...group,
            leaderId: nextLeaderId,
            memberIds: remainingMembers,
            roleMap: nextRoleMap,
          };
        }

        // For non-leader memberships, just remove the user normally
        return {
          ...group,
          memberIds: remainingMembers,
          roleMap: Object.fromEntries(
            Object.entries(group.roleMap ?? {}).filter(([id]) => id !== userId)
          ),
        };
      })
      .filter(Boolean) // Remove the groups that returned null (deleted)
  );

  // 3. Cleanup tasks: Delete their personal tasks and unassign them from group tasks
  updateTasks((current) =>
    current
      .filter((task) => !(task.isPersonal && task.createdBy === userId))
      .map((task) => (task.assignedTo === userId ? { ...task, assignedTo: null } : task))
  );

  logoutUser();
}

function ensureAuthenticated() {
  const user = getCurrentUser();
  if (!user) {
    setFlash("Please log in to continue.", "info");
    window.location.href = "login.html";
    return null;
  }

  if (!user.isActive) {
    logoutUser();
    setFlash("Your account is inactive. Please contact the administrator.", "error");
    window.location.href = "login.html";
    return null;
  }

  return user;
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
  setFlash,
  updateCurrentUserProfile,
};
