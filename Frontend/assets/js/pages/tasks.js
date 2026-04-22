import { bootstrapProtectedPage } from "../app.js";
import { setFlash } from "../auth.js";
import { canCreateGroupTask, getGroupMembers, getUserGroups, getGroupById } from "../groups.js";
import {
  addTaskComment,
  createTask,
  deleteTask,
  getTaskAssigneeName,
  getTaskAssigneeRole,
  getTaskById,
  getUserVisibleTasks,
  updateTask,
  updateTaskStatus,
  canEditTask,
  canUpdateTaskStatus,
} from "../tasks.js";
import { createEmptyState, createTaskCard, escapeHtml, getAvatarMarkup, formatDateTime, renderFlash } from "../ui.js";

const user = await bootstrapProtectedPage({ pageKey: "tasks" });

if (user) {
  const form = document.querySelector("#task-form");
  const taskScope = document.querySelector("#taskScope");
  const taskType = document.querySelector("#taskType");
  const groupSelect = document.querySelector("#groupId");
  const assigneeSelect = document.querySelector("#assignedTo");
  const deadlineInput = document.querySelector("#deadline");
  const personalContainer = document.querySelector("#personal-tasks");
  const groupContainer = document.querySelector("#group-tasks");
  const dueTodaySection = document.querySelector("#due-today-section");
  const dueTodayList = document.querySelector("#due-today-list");
  const cancelEditButton = document.querySelector("#cancel-edit-button");
  const formTitle = document.querySelector("#task-form-title");
  const roleFilterContainer = document.querySelector("#group-role-filters");
  const searchInput = document.querySelector("#task-search");
  const sortSelect = document.querySelector("#task-sort");
  
  const drawer = document.querySelector("#discussion-drawer");
  const drawerBackdrop = document.querySelector("#drawer-backdrop");
  const drawerBody = document.querySelector("#drawer-body");
  const drawerTitle = document.querySelector("#drawer-task-title");
  const commentForm = document.querySelector("#comment-form");
  const commentInput = document.querySelector("#comment-input");
  const typingIndicator = document.querySelector("#typing-indicator-container");
  const typingUserLabel = document.querySelector("#typing-user");

  let editingTaskId = null;
  let activeDiscussionTaskId = null;
  let activeRoleFilter = "all";
  let activeSearchQuery = "";
  let activeSort = "deadline";
  const readBySimulation = new Set();

  function showInlineFlash(message, type = "success") {
    setFlash(message, type);
    renderFlash();
  }

  function getCreatableGroups() {
    return getUserGroups(user).filter((group) => canCreateGroupTask(user, group));
  }

  function populateGroupOptions() {
    const creatableGroups = getCreatableGroups();
    groupSelect.innerHTML = creatableGroups.length
      ? creatableGroups
          .map((group) => `<option value="${group.id}">${escapeHtml(group.groupName)}</option>`)
          .join("")
      : `<option value="">No group access</option>`;

    updateAssigneeOptions();
  }

  function updateAssigneeOptions() {
    const selectedGroupId = groupSelect.value;
    const group = selectedGroupId ? getGroupById(selectedGroupId) : null;
    const members = selectedGroupId ? getGroupMembers(selectedGroupId) : [];

    assigneeSelect.innerHTML = `
      <option value="">${taskType.value === "reminder" ? "No assignee needed" : "Select a member"}</option>
      ${members
        .map((member) => {
          const role = group?.leaderId === member.id ? "leader" : (group?.roleMap?.[member.id] || "member");
          const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);
          return `<option value="${member.id}" class="role-${role}">${escapeHtml(member.name)} (${roleLabel})</option>`;
        })
        .join("")}
    `;
  }

  function syncTaskScopeUi() {
    const isGroup = taskScope.value === "group";
    groupSelect.closest(".field").classList.toggle("is-hidden", !isGroup);
    assigneeSelect.closest(".field").classList.toggle("is-hidden", !isGroup && user.globalRole !== "admin");
    deadlineInput.closest(".field").classList.toggle("is-hidden", taskType.value === "reminder");

    if (!isGroup) {
      assigneeSelect.value = user.id;
    } else {
      updateAssigneeOptions();
    }
  }

  function resetForm() {
    editingTaskId = null;
    form.reset();
    formTitle.textContent = "Create a Task";
    cancelEditButton.classList.add("is-hidden");
    taskScope.value = "personal";
    taskType.value = "deadline";
    populateGroupOptions();
    syncTaskScopeUi();
  }

  function fillFormForEdit(task) {
    editingTaskId = task.id;
    formTitle.textContent = `Editing: ${task.title}`;
    cancelEditButton.classList.remove("is-hidden");
    taskScope.value = task.isPersonal ? "personal" : "group";
    taskType.value = task.taskType;
    document.querySelector("#title").value = task.title;
    document.querySelector("#category").value = task.category;
    document.querySelector("#priority").value = task.priority || "Medium";
    document.querySelector("#description").value = task.description;
    document.querySelector("#deadline").value = task.deadline ? new Date(task.deadline).toISOString().slice(0, 10) : "";
    document.querySelector("#status").value = task.status;
    document.querySelector("#progressNote").value = task.progressNote || "";
    populateGroupOptions();
    groupSelect.value = task.groupId || groupSelect.value;
    updateAssigneeOptions();
    assigneeSelect.value = task.assignedTo || "";
    syncTaskScopeUi();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openDiscussion(taskId) {
    const task = getTaskById(taskId);
    if (!task) return;

    activeDiscussionTaskId = taskId;
    drawerTitle.textContent = task.title;
    renderComments(task);
    
    drawer.classList.add("is-open");
    drawerBackdrop.classList.add("is-active");
    commentInput.focus();

    simulateCollaboration(task);
  }

  function closeDrawer() {
    activeDiscussionTaskId = null;
    typingIndicator?.classList.add("is-hidden");
    drawer?.classList.remove("is-open");
    drawerBackdrop?.classList.remove("is-active");
    commentForm?.reset();
  }

  function renderComments(task) {
    if (!task.comments || task.comments.length === 0) {
      drawerBody.innerHTML = createEmptyState("No messages yet", "Be the first to start the conversation.");
      return;
    }

    drawerBody.innerHTML = task.comments.map(c => {
      const isMe = c.userId === user.id;
      const isRead = isMe && readBySimulation.has(task.id);

      return `
        <div class="comment-bubble">
          ${getAvatarMarkup({ name: c.userName }, "sidebar-user-avatar")}
          <div class="comment-content">
            <span class="comment-author">${escapeHtml(c.userName)}</span>
            <div class="comment-text">${escapeHtml(c.text)}</div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.4rem;">
              <span class="comment-time" style="margin-top: 0;">${formatDateTime(c.timestamp)}</span>
              ${isMe ? `
                <span style="display: flex; align-items: center; gap: 3px; font-size: 0.65rem; color: var(--teal); font-weight: 700; text-transform: uppercase; letter-spacing: 0.02em;">
                  ${isRead 
                    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><polyline points="7 13 10 16 17 9"/><polyline points="2 13 5 16 12 9"/></svg> Read`
                    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" width="10" height="10"><polyline points="20 6 9 17 4 12"/></svg> Delivered`
                  }
                </span>
              ` : ""}
            </div>
          </div>
        </div>
      `;
    }).join('');
    
    setTimeout(() => { drawerBody.scrollTop = drawerBody.scrollHeight; }, 100);
  }

  function simulateCollaboration(task) {
    if (task.isPersonal || !typingIndicator) return;
    const members = getGroupMembers(task.groupId).filter(m => m.id !== user.id);
    if (members.length === 0) return;
    const otherMember = members[0].name.split(' ')[0];

    setTimeout(() => {
      typingUserLabel.textContent = otherMember;
      typingIndicator.classList.remove("is-hidden");
      drawerBody.scrollTop = drawerBody.scrollHeight;
      setTimeout(() => { 
        typingIndicator.classList.add("is-hidden");
        readBySimulation.add(task.id);
        renderComments(task);
      }, 3500);
    }, 1200);
  }

  function renderTaskSections() {
    const tasks = getUserVisibleTasks(user);

    // 1. Handle "Due Today" High Priority Section
    const todayStr = new Date().toISOString().slice(0, 10);
    const dueTodayTasks = tasks.filter((t) => {
      if (!t.deadline || t.status === "Completed" || t.priority !== "High") return false;
      return new Date(t.deadline).toISOString().slice(0, 10) === todayStr;
    });

    if (dueTodaySection && dueTodayList) {
      if (dueTodayTasks.length > 0) {
        dueTodaySection.classList.remove("is-hidden");
        dueTodayList.innerHTML = dueTodayTasks
          .map((task) => createTaskCard(task, {
            assigneeName: getTaskAssigneeName(task),
            assigneeRole: getTaskAssigneeRole(task),
            showGroupName: !task.isPersonal,
            groupName: task.groupId ? getGroupById(task.groupId)?.groupName : "",
          }))
          .join("");
      } else {
        dueTodaySection.classList.add("is-hidden");
      }
    }
    
    const filteredBySearch = tasks.filter((task) => {
      const query = activeSearchQuery.toLowerCase();
      return !query || 
             task.title.toLowerCase().includes(query) || 
             task.description.toLowerCase().includes(query);
    });

    const sortedTasks = filteredBySearch.sort((a, b) => {
      if (activeSort === "deadline") {
        const dateA = a.deadline ? new Date(a.deadline).getTime() : Infinity;
        const dateB = b.deadline ? new Date(b.deadline).getTime() : Infinity;
        return dateA - dateB;
      }
      if (activeSort === "priority") {
        const levels = { High: 1, Medium: 2, Low: 3 };
        return levels[a.priority || "Medium"] - levels[b.priority || "Medium"];
      }
      if (activeSort === "status") {
        const order = { Pending: 1, Ongoing: 2, Completed: 3 };
        return order[a.status] - order[b.status];
      }
      return 0;
    });

    const personalTasks = sortedTasks.filter((task) => task.isPersonal);
    
    // Apply role filter to group tasks
    const groupTasks = sortedTasks
      .filter((task) => !task.isPersonal)
      .filter((task) => activeRoleFilter === "all" || getTaskAssigneeRole(task) === activeRoleFilter);

    personalContainer.innerHTML = personalTasks.length
      ? personalTasks
          .map((task) =>
            createTaskCard(task, {
              assigneeName: getTaskAssigneeName(task),
              assigneeRole: getTaskAssigneeRole(task),
              actions: `
                <button class="btn-ghost" data-action="edit" data-task-id="${task.id}" type="button">Edit</button>
                <button class="btn-danger" data-action="delete" data-task-id="${task.id}" type="button">Delete</button>
                <form class="inline-actions status-update-form" data-task-id="${task.id}">
                  <select name="status">
                    <option ${task.status === "Pending" ? "selected" : ""}>Pending</option>
                    <option ${task.status === "Ongoing" ? "selected" : ""}>Ongoing</option>
                    <option ${task.status === "Completed" ? "selected" : ""}>Completed</option>
                  </select>
                  <input name="progressNote" placeholder="Progress note" value="${escapeHtml(task.progressNote || "")}" />
                  <button class="btn-secondary" type="submit">Save Status</button>
                </form>
              `,
            })
          )
          .join("")
      : createEmptyState("No personal tasks yet", "Use the form above to add a personal deadline or reminder.");

    groupContainer.innerHTML = groupTasks.length
      ? groupTasks
          .map((task) => {
            const actions = [];

            if (canEditTask(task, user)) {
              actions.push(`<button class="btn-ghost" data-action="edit" data-task-id="${task.id}" type="button">Edit</button>`);
              actions.push(`<button class="btn-danger" data-action="delete" data-task-id="${task.id}" type="button">Delete</button>`);
            }

            if (canUpdateTaskStatus(task, user)) {
              actions.push(`
                <form class="inline-actions status-update-form" data-task-id="${task.id}">
                  <select name="status">
                    <option ${task.status === "Pending" ? "selected" : ""}>Pending</option>
                    <option ${task.status === "Ongoing" ? "selected" : ""}>Ongoing</option>
                    <option ${task.status === "Completed" ? "selected" : ""}>Completed</option>
                  </select>
                  <input name="progressNote" placeholder="Progress note" value="${escapeHtml(task.progressNote || "")}" />
                  <button class="btn-secondary" type="submit">Save Status</button>
                </form>
              `);
            }

            return createTaskCard(task, {
              assigneeName: getTaskAssigneeName(task),
              assigneeRole: getTaskAssigneeRole(task),
              actions: actions.join(""),
            });
          })
          .join("")
      : createEmptyState("No group tasks yet", "Create a task as a leader or join a group with existing work.");

    document.querySelectorAll("[data-action='edit']").forEach((button) => {
      button.addEventListener("click", () => {
        const task = getTaskById(button.dataset.taskId);
        if (task) {
          fillFormForEdit(task);
        }
      });
    });

    document.querySelectorAll("[data-action='delete']").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          const taskId = button.dataset.taskId;
          await deleteTask(taskId, user);

          if (editingTaskId === taskId) {
            resetForm();
          }

          if (activeDiscussionTaskId === taskId) {
            closeDrawer();
          }

          showInlineFlash("Task deleted successfully.", "success");
          renderTaskSections();
        } catch (error) {
          showInlineFlash(error.message, "error");
        }
      });
    });

    document.querySelectorAll("[data-action='view-discussion']").forEach((button) => {
      button.addEventListener("click", () => {
        openDiscussion(button.dataset.taskId);
      });
    });

    document.querySelectorAll(".status-update-form").forEach((statusForm) => {
      statusForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const data = new FormData(statusForm);
        try {
          await updateTaskStatus(
            statusForm.dataset.taskId,
            {
              status: data.get("status"),
              progressNote: data.get("progressNote"),
            },
            user
          );
          showInlineFlash("Task status updated.", "success");
          renderTaskSections();
        } catch (error) {
          showInlineFlash(error.message, "error");
        }
      });
    });
  }

  // Setup Role Filter Listeners
  roleFilterContainer?.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeRoleFilter = btn.dataset.role;
      roleFilterContainer.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === btn));
      renderTaskSections();
    });
  });

  searchInput?.addEventListener("input", (e) => {
    activeSearchQuery = e.target.value.trim();
    renderTaskSections();
  });

  sortSelect?.addEventListener("change", (e) => {
    activeSort = e.target.value;
    renderTaskSections();
  });

  taskScope.addEventListener("change", syncTaskScopeUi);
  taskType.addEventListener("change", syncTaskScopeUi);
  groupSelect.addEventListener("change", updateAssigneeOptions);

  cancelEditButton.addEventListener("click", resetForm);
  
  document.querySelector("#close-drawer")?.addEventListener("click", closeDrawer);
  drawerBackdrop?.addEventListener("click", closeDrawer);

  commentForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = commentInput.value.trim();
    if (!text || !activeDiscussionTaskId) return;

    try {
      readBySimulation.delete(activeDiscussionTaskId);
      await addTaskComment(activeDiscussionTaskId, text, user);
      const updatedTask = getTaskById(activeDiscussionTaskId);
      renderComments(updatedTask);
      commentForm.reset();
      
      renderTaskSections();

      const task = getTaskById(activeDiscussionTaskId);
      if (task) simulateCollaboration(task);

    } catch (error) {
      alert(error.message);
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const payload = {
      title: formData.get("title"),
      description: formData.get("description"),
      deadline: formData.get("deadline")
        ? new Date(`${formData.get("deadline")}T12:00:00`).toISOString()
        : "",
      status: formData.get("status"),
      category: formData.get("category"),
      priority: formData.get("priority"),
      assignedTo: formData.get("assignedTo"),
      groupId: formData.get("taskScope") === "group" ? formData.get("groupId") : null,
      isPersonal: formData.get("taskScope") !== "group",
      taskType: formData.get("taskType"),
      progressNote: formData.get("progressNote"),
    };

    try {
      if (editingTaskId) {
        await updateTask(editingTaskId, payload, user);
        showInlineFlash("Task updated successfully.", "success");
      } else {
        await createTask(payload, user);
        showInlineFlash("Task created successfully.", "success");
      }
      resetForm();
      renderTaskSections();
    } catch (error) {
      showInlineFlash(error.message, "error");
    }
  });

  populateGroupOptions();
  resetForm();
  renderTaskSections();
}
