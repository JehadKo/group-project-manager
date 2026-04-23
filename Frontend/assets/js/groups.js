import {
  createGroupWithApi,
  deleteGroupWithApi,
  joinGroupWithApi,
  leaveGroupWithApi,
  transferLeadershipWithApi,
  updateGroupRoleWithApi,
} from "./api.js";
import { getGroups, getUsers, hydrateAppState } from "./storage.js";

function getGroupById(groupId) {
  return getGroups().find((group) => group.id === groupId) ?? null;
}

function getUserGroupRole(user, group) {
  if (!user || !group) {
    return null;
  }

  if (group.leaderId === user.id) {
    return "leader";
  }

  return group.roleMap?.[user.id] ?? null;
}

function isGroupLeader(user, group) {
  return Boolean(user && group && group.leaderId === user.id);
}

function canManageRoles(user, group) {
  return Boolean(user && group && (user.globalRole === "admin" || group.leaderId === user.id));
}

function canCreateGroupTask(user, group) {
  if (!user || !group) {
    return false;
  }

  if (user.globalRole === "admin" || group.leaderId === user.id) {
    return true;
  }

  return ["editor"].includes(group.roleMap?.[user.id]);
}

function getUserGroups(user) {
  if (!user) {
    return [];
  }

  if (user.globalRole === "admin") {
    return getGroups();
  }

  return getGroups().filter((group) => group.memberIds.includes(user.id));
}

async function createGroup(groupName, currentUser) {
  if (!currentUser) {
    throw new Error("Please log in before creating a group.");
  }

  const response = await createGroupWithApi({
    groupName,
  });

  hydrateAppState(response.state);
  return response.state.groups.find((group) => group.groupName === groupName.trim()) ?? null;
}

async function joinGroupByCode(inviteCode, currentUser) {
  if (!currentUser) {
    throw new Error("Please log in before joining a group.");
  }

  const response = await joinGroupWithApi({
    inviteCode,
  });

  hydrateAppState(response.state);
  return response.state.groups.find((group) => group.inviteCode === inviteCode.trim().toUpperCase()) ?? null;
}

async function updateMemberRole({ groupId, targetUserId, role }, currentUser) {
  const group = getGroupById(groupId);
  if (!group) {
    throw new Error("Group not found.");
  }

  if (!canManageRoles(currentUser, group)) {
    throw new Error("You do not have permission to manage roles in this group.");
  }

  const response = await updateGroupRoleWithApi(groupId, targetUserId, { role });
  hydrateAppState(response.state);
  return getGroupById(groupId);
}

async function transferLeadership({ groupId, newLeaderId }, currentUser) {
  const group = getGroupById(groupId);
  if (!group) {
    throw new Error("Group not found.");
  }

  if (group.leaderId !== currentUser.id) {
    throw new Error("Only the group leader can transfer leadership.");
  }

  const response = await transferLeadershipWithApi(groupId, { newLeaderId });
  hydrateAppState(response.state);
  return getGroupById(groupId);
}

async function deleteGroup({ groupId }, currentUser) {
  const group = getGroupById(groupId);
  if (!group) {
    throw new Error("Group not found.");
  }

  if (group.leaderId !== currentUser.id && currentUser.globalRole !== "admin") {
    throw new Error("Only the group leader can delete this group.");
  }

  const response = await deleteGroupWithApi(groupId);
  hydrateAppState(response.state);
}

async function leaveGroup({ groupId }, currentUser) {
  if (!currentUser) {
    throw new Error("Please log in before leaving a group.");
  }

  const group = getGroupById(groupId);
  if (!group) {
    throw new Error("Group not found.");
  }

  if (group.leaderId === currentUser.id) {
    throw new Error("Leaders cannot leave the group directly. Please transfer leadership or delete the group.");
  }

  const response = await leaveGroupWithApi(groupId);
  hydrateAppState(response.state);
}

function getGroupMembers(groupId) {
  const group = getGroupById(groupId);
  if (!group) {
    return [];
  }

  // Filter out inactive users to ensure they cannot be assigned new tasks or appear in active member lists
  return getUsers().filter((user) => group.memberIds.includes(user.id) && user.isActive);
}

export {
  canCreateGroupTask,
  canManageRoles,
  createGroup,
  deleteGroup,
  getGroupById,
  getGroupMembers,
  getUserGroupRole,
  getUserGroups,
  isGroupLeader,
  joinGroupByCode,
  leaveGroup,
  transferLeadership,
  updateMemberRole,
};
