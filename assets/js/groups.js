import {
  generateId,
  generateInviteCode,
  getGroups,
  getUsers,
  saveGroups,
  saveUsers,
  updateTasks,
} from "./storage.js";

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

function createGroup(groupName, currentUser) {
  if (!currentUser) {
    throw new Error("Please log in before creating a group.");
  }

  if (!groupName.trim()) {
    throw new Error("Please provide a group name.");
  }

  const newGroup = {
    id: generateId("group"),
    groupName: groupName.trim(),
    inviteCode: generateInviteCode(),
    leaderId: currentUser.id,
    memberIds: [currentUser.id],
    roleMap: {
      [currentUser.id]: "leader",
    },
    createdAt: new Date().toISOString(),
  };

  saveGroups([...getGroups(), newGroup]);

  const users = getUsers().map((user) =>
    user.id === currentUser.id
      ? {
          ...user,
          joinedGroupIds: Array.from(new Set([...(user.joinedGroupIds ?? []), newGroup.id])),
        }
      : user
  );

  saveUsers(users);
  return newGroup;
}

function joinGroupByCode(inviteCode, currentUser) {
  if (!currentUser) {
    throw new Error("Please log in before joining a group.");
  }

  const code = inviteCode.trim().toUpperCase();
  const groups = getGroups();
  const group = groups.find((entry) => entry.inviteCode === code);

  if (!group) {
    throw new Error("Invalid invite code.");
  }

  if (group.memberIds.includes(currentUser.id)) {
    throw new Error("You are already a member of this group.");
  }

  const updatedGroups = groups.map((entry) =>
    entry.id === group.id
      ? {
          ...entry,
          memberIds: [...entry.memberIds, currentUser.id],
          roleMap: {
            ...entry.roleMap,
            [currentUser.id]: "member",
          },
        }
      : entry
  );

  const updatedUsers = getUsers().map((user) =>
    user.id === currentUser.id
      ? {
          ...user,
          joinedGroupIds: Array.from(new Set([...(user.joinedGroupIds ?? []), group.id])),
        }
      : user
  );

  saveGroups(updatedGroups);
  saveUsers(updatedUsers);

  return updatedGroups.find((entry) => entry.id === group.id);
}

function updateMemberRole({ groupId, targetUserId, role }, currentUser) {
  const allowedRoles = ["member", "editor"];
  if (!allowedRoles.includes(role)) {
    throw new Error("Please choose a valid member role.");
  }

  const groups = getGroups();
  const group = groups.find((entry) => entry.id === groupId);

  if (!group) {
    throw new Error("Group not found.");
  }

  if (!canManageRoles(currentUser, group)) {
    throw new Error("You do not have permission to manage roles in this group.");
  }

  if (targetUserId === group.leaderId) {
    throw new Error("The group leader role cannot be changed here.");
  }

  if (!group.memberIds.includes(targetUserId)) {
    throw new Error("That user is not part of this group.");
  }

  const updatedGroups = groups.map((entry) =>
    entry.id === groupId
      ? {
          ...entry,
          roleMap: {
            ...entry.roleMap,
            [targetUserId]: role,
          },
        }
      : entry
  );

  saveGroups(updatedGroups);
  return updatedGroups.find((entry) => entry.id === groupId);
}

function transferLeadership({ groupId, newLeaderId }, currentUser) {
  const groups = getGroups();
  const group = groups.find((entry) => entry.id === groupId);

  if (!group) {
    throw new Error("Group not found.");
  }

  if (group.leaderId !== currentUser.id) {
    throw new Error("Only the group leader can transfer leadership.");
  }

  if (!group.memberIds.includes(newLeaderId)) {
    throw new Error("The new leader must be a member of the group.");
  }

  if (newLeaderId === currentUser.id) {
    throw new Error("You are already the leader.");
  }

  const updatedGroups = groups.map((entry) =>
    entry.id === groupId
      ? {
          ...entry,
          leaderId: newLeaderId,
          roleMap: {
            ...entry.roleMap,
            [currentUser.id]: "member",
            [newLeaderId]: "leader",
          },
        }
      : entry
  );

  saveGroups(updatedGroups);
  return updatedGroups.find((entry) => entry.id === groupId);
}

function deleteGroup({ groupId }, currentUser) {
  const groups = getGroups();
  const group = groups.find((entry) => entry.id === groupId);

  if (!group) {
    throw new Error("Group not found.");
  }

  if (group.leaderId !== currentUser.id && currentUser.globalRole !== "admin") {
    throw new Error("Only the group leader can delete this group.");
  }

  // 1. Remove group ID from all members' joinedGroupIds
  const updatedUsers = getUsers().map((user) => ({
    ...user,
    joinedGroupIds: (user.joinedGroupIds ?? []).filter((id) => id !== groupId),
  }));
  saveUsers(updatedUsers);

  // 2. Cleanup tasks: Delete all tasks associated with this group
  updateTasks((current) => current.filter((task) => task.groupId !== groupId));

  // 3. Remove the group itself
  saveGroups(groups.filter((entry) => entry.id !== groupId));
}

function leaveGroup({ groupId }, currentUser) {
  if (!currentUser) {
    throw new Error("Please log in before leaving a group.");
  }

  const groups = getGroups();
  const group = groups.find((entry) => entry.id === groupId);

  if (!group) {
    throw new Error("Group not found.");
  }

  if (group.leaderId === currentUser.id) {
    throw new Error("Leaders cannot leave the group directly. Please transfer leadership or delete the group.");
  }

  if (!group.memberIds.includes(currentUser.id)) {
    throw new Error("You are not a member of this group.");
  }

  const updatedGroups = groups.map((entry) => {
    if (entry.id !== groupId) return entry;
    const nextRoleMap = { ...entry.roleMap };
    delete nextRoleMap[currentUser.id];
    return {
      ...entry,
      memberIds: entry.memberIds.filter((id) => id !== currentUser.id),
      roleMap: nextRoleMap,
    };
  });

  const updatedUsers = getUsers().map((user) => {
    if (user.id !== currentUser.id) return user;
    return {
      ...user,
      joinedGroupIds: (user.joinedGroupIds ?? []).filter((id) => id !== groupId),
    };
  });

  saveGroups(updatedGroups);
  saveUsers(updatedUsers);

  // Unassign tasks in this group that were assigned to the user
  updateTasks((current) =>
    current.map((task) =>
      task.groupId === groupId && task.assignedTo === currentUser.id
        ? { ...task, assignedTo: null }
        : task
    )
  );
}

function getGroupMembers(groupId) {
  const group = getGroupById(groupId);
  if (!group) {
    return [];
  }

  return getUsers().filter((user) => group.memberIds.includes(user.id));
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
