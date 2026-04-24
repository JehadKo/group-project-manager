import { bootstrapProtectedPage } from "../app.js";
import { getCurrentUser, setFlash } from "../auth.js";
import { getGroupProgress } from "../dashboard.js";
import {
  canManageRoles,
  createGroup,
  getGroupMembers,
  getUserGroupRole,
  getUserGroups,
  updateMemberRole,
  joinGroupByCode,
  leaveGroup,
  deleteGroup,
} from "../groups.js";
import { formatDate, createEmptyState, escapeHtml, getAvatarMarkup, renderAppChrome, renderFlash } from "../ui.js";

const user = await bootstrapProtectedPage({ pageKey: "groups" });

if (user) {
  const groupsList = document.querySelector("#groups-list");
  const createForm = document.querySelector("#create-group-form");
  const joinForm = document.querySelector("#join-group-form");

  if (user.globalRole === "admin") {
    createForm?.classList.add("is-hidden");
    joinForm?.classList.add("is-hidden");
  }

  function showInlineFlash(message, type = "success") {
    setFlash(message, type);
    renderFlash();
  }

  function refreshGroupsView({ refreshChrome = false } = {}) {
    if (refreshChrome) {
      const freshUser = getCurrentUser();
      if (freshUser) {
        renderAppChrome("groups", freshUser);
      }
    }

    renderGroups();
  }

  function renderGroups() {
    const groups = getUserGroups(getCurrentUser() || user);
    if (!groupsList) {
      return;
    }

    let shouldCelebrate = false;

    groupsList.innerHTML = groups.length
      ? groups
          .map((group) => {
            const members = getGroupMembers(group.id);
            const viewer = getCurrentUser() || user;
            const role = getUserGroupRole(viewer, group) ?? "member";
            const progress = getGroupProgress(group.id);
            const isAchieved = progress?.summary.completionRate === 100 && progress?.summary.total > 0;

            if (isAchieved) {
              shouldCelebrate = true;
            }

            const achievementBadge = isAchieved
              ? `<span class="tag tag--achievement" style="margin-left: 0.5rem;">Group Milestone</span>`
              : "";

            const memberMarkup = members
              .map((member) => {
                const isLeader = group.leaderId === member.id;
                const memberRole = group.roleMap?.[member.id] ?? "member";
                const roleClass = isLeader ? "tag--leader" : (memberRole === "editor" ? "tag--editor" : "tag--member");
                const roleControl = canManageRoles(viewer, group) && !isLeader
                  ? `
                    <form class="inline-actions role-form" data-group-id="${group.id}" data-user-id="${member.id}">
                      <select name="role">
                        <option value="member" ${memberRole === "member" ? "selected" : ""}>Member</option>
                        <option value="editor" ${memberRole === "editor" ? "selected" : ""}>Editor</option>
                      </select>
                      <button class="btn-ghost" type="submit">Update</button>
                    </form>
                  `
                  : `<span class="tag ${roleClass}">${escapeHtml(isLeader ? "Leader" : memberRole)}</span>`;

                return `
                  <div class="panel" style="padding: 1rem;">
                    <div class="split">
                      <div class="profile-hero">
                        ${getAvatarMarkup(member, "avatar")}
                        <div>
                          <strong>${escapeHtml(member.name)}</strong>
                          <div class="muted small">${escapeHtml(member.email)}</div>
                        </div>
                      </div>
                      ${roleControl}
                    </div>
                  </div>
                `;
              })
              .join("");

            return `
              <article class="group-card">
                <div class="group-card__top">
                  <div>
                    <span class="tag ${
                      role === "leader" ? "tag--leader" : role === "editor" ? "tag--editor" : "tag--member"
                    }">${escapeHtml(role)}</span>${achievementBadge}
                    <h3 style="margin-top: 0.9rem;">${escapeHtml(group.groupName)}</h3>
                  </div>
                  <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.5rem;">
                    <span class="pill">Invite: ${escapeHtml(group.inviteCode)}</span>
                    ${
                      role === "leader"
                        ? `<button class="btn-danger" data-action="delete-group" data-group-id="${group.id}" style="padding: 0.4rem 0.8rem; font-size: 0.75rem; min-height: auto;">Delete Group</button>`
                        : `<button class="btn-danger" data-action="leave" data-group-id="${group.id}" style="padding: 0.4rem 0.8rem; font-size: 0.75rem; min-height: auto;">Leave Group</button>`
                    }
                  </div>
                </div>
                <p>Created on ${escapeHtml(formatDate(group.createdAt))}. Members can use the invite code to join the team.</p>
                <div class="detail-list">
                  <div><strong>Members:</strong> ${group.memberIds.length}</div>
                  <div><strong>Your access:</strong> ${escapeHtml(role)}</div>
                </div>
                <div class="list" style="margin-top: 1rem;">
                  ${memberMarkup}
                </div>
              </article>
            `;
          })
          .join("")
      : createEmptyState("No groups yet", "Create your first team or join an existing one with an invite code.");

    if (shouldCelebrate) {
      import("https://cdn.skypack.dev/canvas-confetti")
        .then((module) => {
          const confetti = module.default;
          confetti({
            particleCount: 150,
            spread: 70,
            origin: { y: 0.6 },
            colors: ["#0f766e", "#10b981", "#fbbf24"],
          });
        })
        .catch(() => {
          // Keep the page functional when the demo is running without internet access.
        });
    }

    document.querySelectorAll(".role-form").forEach((formElement) => {
      formElement.addEventListener("submit", async (event) => {
        event.preventDefault();
        const groupId = formElement.dataset.groupId;
        const userId = formElement.dataset.userId;
        const role = new FormData(formElement).get("role");

        try {
          await updateMemberRole({ groupId, targetUserId: userId, role }, getCurrentUser() || user);
          showInlineFlash("Member role updated.", "success");
          refreshGroupsView();
        } catch (error) {
          showInlineFlash(error.message, "error");
        }
      });
    });

    document.querySelectorAll("[data-action='leave']").forEach((button) => {
      button.addEventListener("click", async () => {
        if (confirm("Are you sure you want to leave this group?")) {
          try {
            await leaveGroup({ groupId: button.dataset.groupId }, getCurrentUser() || user);
            showInlineFlash("You have left the group.", "success");
            refreshGroupsView({ refreshChrome: true });
          } catch (error) {
            showInlineFlash(error.message, "error");
          }
        }
      });
    });

    document.querySelectorAll("[data-action='delete-group']").forEach((button) => {
      button.addEventListener("click", async () => {
        const confirmMsg = "Are you sure? This will permanently delete the group and all associated group tasks.";
        if (confirm(confirmMsg)) {
          try {
            await deleteGroup({ groupId: button.dataset.groupId }, getCurrentUser() || user);
            showInlineFlash("Group deleted successfully.", "success");
            refreshGroupsView({ refreshChrome: true });
          } catch (error) {
            showInlineFlash(error.message, "error");
          }
        }
      });
    });
  }

  createForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const groupName = new FormData(createForm).get("groupName");
      await createGroup(groupName, getCurrentUser() || user);
      createForm.reset();
      showInlineFlash("Group created successfully.", "success");
      refreshGroupsView({ refreshChrome: true });
    } catch (error) {
      showInlineFlash(error.message, "error");
    }
  });

  joinForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const inviteCode = new FormData(joinForm).get("inviteCode");
      await joinGroupByCode(inviteCode, getCurrentUser() || user);
      joinForm.reset();
      showInlineFlash("You joined the group successfully.", "success");
      refreshGroupsView({ refreshChrome: true });
    } catch (error) {
      showInlineFlash(error.message, "error");
    }
  });

  renderGroups();
}
