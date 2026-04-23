import { bootstrapProtectedPage } from "../app.js";
import { setFlash, isAdmin } from "../auth.js";
import { canCreateGroupTask, getGroupMembers, getUserGroups, getGroupById } from "../groups.js";
import {
  addTaskComment,
  deleteTaskComment,
  createTask,
  deleteTask,
  getTaskAssigneeName,
  getTaskAssigneeRole,
  getTaskById,
  getUserVisibleTasks,
  syncTaskWithGithub,
  updateTask,
  updateTaskStatus,
  canEditTask,
  canUpdateTaskStatus,
} from "../tasks.js";
import { getComplexityTargets, saveComplexityTargets } from "../storage.js";
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
  const categoryFilterSelect = document.querySelector("#task-category-filter");
  const priorityFilterSelect = document.querySelector("#task-priority-filter");
  const startDateInput = document.querySelector("#filter-start-date");
  const endDateInput = document.querySelector("#filter-end-date");
  const clearFiltersBtn = document.querySelector("#clear-filters-btn");
  const downloadReportBtn = document.querySelector("#download-report-btn");
  
  const drawer = document.querySelector("#discussion-drawer");
  const drawerBackdrop = document.querySelector("#drawer-backdrop");
  const drawerBody = document.querySelector("#drawer-body");
  const drawerTitle = document.querySelector("#drawer-task-title");
  const commentForm = document.querySelector("#comment-form");
  const commentInput = document.querySelector("#comment-input");
  const typingIndicator = document.querySelector("#typing-indicator-container");
  const typingUserLabel = document.querySelector("#typing-user");

  const bulkBar = document.querySelector("#bulk-actions-bar");
  const selectedCountLabel = document.querySelector("#selected-count");
  const bulkApplyBtn = document.querySelector("#apply-bulk");
  const bulkDeleteBtn = document.querySelector("#bulk-delete");
  const clearSelectionBtn = document.querySelector("#clear-selection");

  const bulkDeleteModal = document.querySelector("#bulk-delete-modal");
  const cancelBulkDeleteBtn = document.querySelector("#cancel-bulk-delete");
  const confirmBulkDeleteBtn = document.querySelector("#confirm-bulk-delete");

  const taskDeleteModal = document.querySelector("#task-delete-modal");
  const cancelTaskDeleteBtn = document.querySelector("#cancel-task-delete");
  const confirmTaskDeleteBtn = document.querySelector("#confirm-task-delete");

  const settingsBtn = document.querySelector("#complexity-settings-btn");
  const settingsDrawer = document.querySelector("#settings-drawer");
  const settingsOverlay = document.querySelector("#settings-overlay");
  const complexityForm = document.querySelector("#complexity-targets-form");

  let editingTaskId = null;
  let activeDiscussionTaskId = null;
  let activeRoleFilter = "all";
  let activeSearchQuery = "";
  let taskToDeleteId = null;
  let activeSort = "deadline";
  let activeCategoryFilter = "all";
  let activePriorityFilter = "all";
  let activeStartDate = "";
  let activeEndDate = "";
  const selectedTaskIds = new Set();
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
    document.querySelector("#scope-personal")?.classList.toggle("active", !isGroup);
    document.querySelector("#scope-group")?.classList.toggle("active", isGroup);

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
    if (document.querySelector("#complexitySize")) document.querySelector("#complexitySize").value = task.complexitySize || "M";
    if (document.querySelector("#githubBranch")) document.querySelector("#githubBranch").value = task.githubBranch || "";
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
              <span class="comment-time" style="margin-top: 0;">${formatDateTime(c.
                ${isMe || isAdmin(user) ? `
                  <button class="btn-ghost-danger btn-comment-delete" data-comment-id="${c.id}" title="Delete comment" style="padding: 2px 6px; font-size: 0.7rem;">Delete</button>
                ` : ""}
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

  function updateCategoryFilterOptions(tasks) {
    if (!categoryFilterSelect) return;
    
    const categories = [...new Set(tasks.map((t) => t.category).filter(Boolean))].sort();

    categoryFilterSelect.innerHTML = `
      <option value="all">All Categories</option>
      ${categories.map((cat) => `<option value="${escapeHtml(cat)}" ${cat === activeCategoryFilter ? "selected" : ""}>${escapeHtml(cat)}</option>`).join("")}
    `;

    // If the active filter is no longer in the list of available categories, reset it to "all"
    if (activeCategoryFilter !== "all" && !categories.includes(activeCategoryFilter)) {
      activeCategoryFilter = "all";
      renderTaskSections();
    }
  }

  function updateBulkBar() {
    if (selectedTaskIds.size > 0) {
      bulkBar?.classList.remove("is-hidden");
      if (selectedCountLabel) selectedCountLabel.textContent = selectedTaskIds.size;
    } else {
      bulkBar?.classList.add("is-hidden");
    }
  }

  function renderTaskSections() {
    const tasks = getUserVisibleTasks(user);
    const allUsers = getUsers();
    updateCategoryFilterOptions(tasks);

    const filteredTasks = tasks.filter((task) => {
      const query = activeSearchQuery.toLowerCase();
      const matchesSearch = !query || 
             task.title.toLowerCase().includes(query) || 
             task.description.toLowerCase().includes(query);

      const matchesCategory = activeCategoryFilter === "all" || task.category === activeCategoryFilter;
      const matchesPriority = activePriorityFilter === "all" || (task.priority || "Medium") === activePriorityFilter;

      return matchesSearch && matchesCategory && matchesPriority;
    });

    // Update Print Summary Metrics (Requirement 4.2)
    const total = filteredTasks.length;
    const completed = filteredTasks.filter(t => t.status === "Completed").length;
    const ongoing = filteredTasks.filter(t => t.status === "Ongoing").length;
    const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
    const overdue = filteredTasks.filter(t => t.deadline && t.status !== "Completed" && new Date(t.deadline) < new Date()).length;

    if (document.querySelector("#print-stat-total")) document.querySelector("#print-stat-total").textContent = total;
    if (document.querySelector("#print-stat-rate")) document.querySelector("#print-stat-rate").textContent = rate + "%";
    if (document.querySelector("#print-stat-ongoing")) document.querySelector("#print-stat-ongoing").textContent = ongoing;
    if (document.querySelector("#print-stat-overdue")) document.querySelector("#print-stat-overdue").textContent = overdue;
    if (document.querySelector("#report-date-range")) {
      document.querySelector("#report-date-range").textContent = (activeStartDate || activeEndDate)
        ? `Report Period: ${activeStartDate || 'Earliest'} to ${activeEndDate || 'Latest'}`
        : `Full workspace audit as of ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}`;
    }

    // Calculate Top Contributors (Requirement 4.2 extension)
    const completedTasks = filteredTasks.filter(t => t.status === "Completed");
    const contributorMap = {};
    completedTasks.forEach(t => {
      if (t.assignedTo) contributorMap[t.assignedTo] = (contributorMap[t.assignedTo] || 0) + 1;
    });

    const topContributors = Object.entries(contributorMap)
      .map(([userId, count]) => ({ name: allUsers.find(u => u.id === userId)?.name || "Unknown", count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    const contributorsEl = document.querySelector("#print-top-contributors");
    if (contributorsEl) {
      contributorsEl.innerHTML = topContributors.length > 0
        ? topContributors.map(c => `
          <div style="display:flex; align-items:center; gap:0.6rem;">
            <div style="width:28px; height:28px; border-radius:50%; background:var(--accent); color:white; display:grid; place-items:center; font-size:0.65rem; font-weight:700;">
              ${c.name.slice(0, 2).toUpperCase()}
            </div>
            <div style="display:flex; flex-direction:column;">
              <strong style="font-size:0.85rem; color:var(--ink);">${escapeHtml(c.name)}</strong>
              <span class="muted" style="font-size:0.65rem;">${c.count} ${c.count === 1 ? 'task' : 'tasks'} done</span>
            </div>
          </div>`).join("")
        : '<span class="muted small">No completions recorded in this view.</span>';
    }

    // Calculate Task Distribution by Category (Requirement 4.2 extension)
    const categoryMap = {};
    filteredTasks.forEach(t => {
      const cat = t.category || "Uncategorized";
      categoryMap[cat] = (categoryMap[cat] || 0) + 1;
    });

    const distributionBody = document.querySelector("#print-distribution-body");
    if (distributionBody) {
      const distData = Object.entries(categoryMap).sort((a, b) => b[1] - a[1]);
      distributionBody.innerHTML = distData.length > 0
        ? distData.map(([cat, count]) => {
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            return `
              <tr>
                <td><strong style="color:var(--ink);">${escapeHtml(cat)}</strong></td>
                <td>${count} ${count === 1 ? 'task' : 'tasks'}</td>
                <td>${pct}%</td>
              </tr>
            `;
          }).join("")
        : '<tr><td colspan="3" style="text-align:center; padding: 2rem;" class="muted small">No category data available in this view.</td></tr>';
    }

    const sortedTasks = [...filteredTasks].sort((a, b) => {
      if (activeSort === "deadline") {
        return (a.deadline ? new Date(a.deadline).getTime() : Infinity) - (b.deadline ? new Date(b.deadline).getTime() : Infinity);
      }
      const pMap = { High: 3, Medium: 2, Low: 1 }, sMap = { Ongoing: 3, Pending: 2, Completed: 1 };
      return activeSort === "priority" ? pMap[b.priority || "Medium"] - pMap[a.priority || "Medium"] : sMap[b.status] - sMap[a.status];
    });

    // 1. Handle "Due Today" High Priority Section (now respects global filters)
    const todayStr = new Date().toISOString().slice(0, 10);
    const dueTodayTasks = filteredTasks.filter((t) => {
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
            assigneeAvatar: getAvatarMarkup(allUsers.find(u => u.id === task.assignedTo)),
            showGroupName: !task.isPersonal,
            groupName: task.groupId ? getGroupById(task.groupId)?.groupName : "",
          }))
          .join("");
      } else {
        dueTodaySection.classList.add("is-hidden");
      }
    }

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
              assigneeAvatar: getAvatarMarkup(allUsers.find(u => u.id === task.assignedTo)),
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

            const group = getGroupById(task.groupId);
            const isLeader = user.globalRole === "admin" || group?.leaderId === user.id;
            if (isLeader && task.githubBranch) {
              actions.push(`<button class="action-btn-sm" data-action="sync-github" data-task-id="${task.id}" type="button">Sync GitHub</button>`);
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
              assigneeAvatar: getAvatarMarkup(allUsers.find(u => u.id === task.assignedTo)),
              showGroupName: true,
              groupName: task.groupId ? (getGroupById(task.groupId)?.groupName || "") : "General",
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
      button.addEventListener("click", () => {
        taskToDeleteId = button.dataset.taskId;
        taskDeleteModal?.classList.add("open");
      });
    });

    document.querySelectorAll("[data-action='sync-github']").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          const taskId = button.dataset.taskId;
          button.disabled = true;
          button.textContent = "Syncing...";
          
          await syncTaskWithGithub(taskId, user);
          showInlineFlash("Task synchronized with GitHub.", "success");
          renderTaskSections();
        } catch (error) {
          showInlineFlash(error.message, "error");
          button.disabled = false;
          button.textContent = "Sync GitHub";
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

  categoryFilterSelect?.addEventListener("change", (e) => {
    activeCategoryFilter = e.target.value;
    renderTaskSections();
  });

  priorityFilterSelect?.addEventListener("change", (e) => {
    activePriorityFilter = e.target.value;
    renderTaskSections();
  });

  startDateInput?.addEventListener("change", (e) => {
    activeStartDate = e.target.value;
    renderTaskSections();
  });

  endDateInput?.addEventListener("change", (e) => {
    activeEndDate = e.target.value;
    renderTaskSections();
  });

  clearFiltersBtn?.addEventListener("click", () => {
    activeSearchQuery = "";
    activeCategoryFilter = "all";
    activePriorityFilter = "all";
    activeStartDate = "";
    activeEndDate = "";
    
    if (searchInput) searchInput.value = "";
    if (categoryFilterSelect) categoryFilterSelect.value = "all";
    if (priorityFilterSelect) priorityFilterSelect.value = "all";
    if (startDateInput) startDateInput.value = "";
    if (endDateInput) endDateInput.value = "";
    
    selectedTaskIds.clear();
    updateBulkBar();
    
    renderTaskSections();
  });

  taskScope.addEventListener("change", syncTaskScopeUi);
  taskType.addEventListener("change", syncTaskScopeUi);
  groupSelect.addEventListener("change", updateAssigneeOptions);

  cancelEditButton.addEventListener("click", resetForm);
  
  document.querySelector("#close-drawer")?.addEventListener("click", closeDrawer);
  drawerBackdrop?.addEventListener("click", closeDrawer);

  drawerBody?.addEventListener("click", async (e) => {
    if (e.target.classList.contains("btn-comment-delete")) {
      const commentId = e.target.dataset.commentId;
      if (confirm("Are you sure you want to delete this comment?")) {
        try {
          await deleteTaskComment(activeDiscussionTaskId, commentId, user);
          renderComments(getTaskById(activeDiscussionTaskId));
        } catch (error) {
          showInlineFlash(error.message, "error");
        }
      }
    }
  });

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
      complexitySize: formData.get("complexitySize"),
      githubBranch: formData.get("githubBranch"),
      assignedTo: formData.get("assignedTo"),
      groupId: formData.get("taskScope") === "group" ? formData.get("groupId") : null,
      isPersonal: formData.get("taskScope") !== "group",
      taskType: formData.get("taskType"),
      progressNote: formData.get("progressNote"),
    };

    try {
      const submitBtn = document.querySelector("#save-btn");
      const originalHtml = submitBtn.innerHTML;
      
      const showSuccessFeedback = () => {
        submitBtn.classList.add("success");
        submitBtn.innerHTML = `✓ Saved!`;
        setTimeout(() => { submitBtn.classList.remove("success"); submitBtn.innerHTML = originalHtml; }, 2000);
      };

      if (editingTaskId) {
        await updateTask(editingTaskId, payload, user);
        showInlineFlash("Task updated successfully.", "success");
      } else {
        await createTask(payload, user);
        showInlineFlash("Task created successfully.", "success");
      }
      showSuccessFeedback();
      resetForm();
      renderTaskSections();
    } catch (error) {
      showInlineFlash(error.message, "error");
    }
  });

  bulkApplyBtn?.addEventListener("click", async () => {
    const status = document.querySelector("#bulk-status")?.value;
    const category = document.querySelector("#bulk-category")?.value.trim();

    if (!status && !category) {
      showInlineFlash("Select a status or enter a category to update.", "info");
      return;
    }

    const originalText = bulkApplyBtn.textContent;
    bulkApplyBtn.disabled = true;
    bulkApplyBtn.textContent = "Processing...";

    const updates = {};
    if (status) updates.status = status;
    if (category) updates.category = category;

    try {
      const ids = Array.from(selectedTaskIds);
      for (const id of ids) {
        await updateTask(id, updates, user);
      }
      
      showInlineFlash(`Successfully updated ${ids.length} tasks.`, "success");
      selectedTaskIds.clear();
      updateBulkBar();
      renderTaskSections();
      if (document.querySelector("#bulk-status")) document.querySelector("#bulk-status").value = "";
      if (document.querySelector("#bulk-category")) document.querySelector("#bulk-category").value = "";
    } catch (error) {
      showInlineFlash(error.message, "error");
    } finally {
      bulkApplyBtn.disabled = false;
      bulkApplyBtn.textContent = originalText;
    }
  });

  clearSelectionBtn?.addEventListener("click", () => {
    selectedTaskIds.clear();
    updateBulkBar();
    renderTaskSections();
  });

  bulkDeleteBtn?.addEventListener("click", () => {
    if (selectedTaskIds.size > 0) {
      bulkDeleteModal?.classList.add("open");
    }
  });

  cancelBulkDeleteBtn?.addEventListener("click", () => {
    bulkDeleteModal?.classList.remove("open");
  });

  confirmBulkDeleteBtn?.addEventListener("click", async () => {
    const originalText = confirmBulkDeleteBtn.textContent;
    confirmBulkDeleteBtn.disabled = true;
    confirmBulkDeleteBtn.textContent = "Deleting...";

    try {
      const ids = Array.from(selectedTaskIds);
      for (const id of ids) {
        await deleteTask(id, user);
      }
      
      showInlineFlash(`Successfully deleted ${ids.length} tasks.`, "success");
      selectedTaskIds.clear();
      updateBulkBar();
      renderTaskSections();
      bulkDeleteModal?.classList.remove("open");
    } catch (error) {
      showInlineFlash(error.message, "error");
    } finally {
      confirmBulkDeleteBtn.disabled = false;
      confirmBulkDeleteBtn.textContent = originalText;
    }
  });

  cancelTaskDeleteBtn?.addEventListener("click", () => {
    taskDeleteModal?.classList.remove("open");
    taskToDeleteId = null;
  });

  confirmTaskDeleteBtn?.addEventListener("click", async () => {
    if (!taskToDeleteId) return;
    try {
      const taskId = taskToDeleteId;
      await deleteTask(taskId, user);

      if (editingTaskId === taskId) {
        resetForm();
      }

      if (activeDiscussionTaskId === taskId) {
        closeDrawer();
      }

      showInlineFlash("Task deleted successfully.", "success");
      taskDeleteModal?.classList.remove("open");
      taskToDeleteId = null;
      renderTaskSections();
    } catch (error) {
      showInlineFlash(error.message, "error");
    }
  });

  // Complexity Settings Logic
  const isLeader = isAdmin(user) || getUserGroups(user).some(g => g.leaderId === user.id);
  if (isLeader && downloadReportBtn) {
    downloadReportBtn.classList.remove("hidden");
    downloadReportBtn.addEventListener("click", () => window.print());
  }

  if (isLeader && settingsBtn) {
    settingsBtn.classList.remove("hidden");
    
    settingsBtn.addEventListener("click", () => {
      const targets = getComplexityTargets();
      Object.keys(targets).forEach(key => {
        const input = complexityForm.querySelector(`[name="${key}"]`);
        if (input) input.value = targets[key];
      });
      settingsDrawer.classList.add("open");
      settingsOverlay.classList.add("open");
    });
  }

  function closeSettings() {
    settingsDrawer?.classList.remove("open");
    settingsOverlay?.classList.remove("open");
  }

  document.querySelector("#close-settings")?.addEventListener("click", closeSettings);
  settingsOverlay?.addEventListener("click", closeSettings);

  complexityForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    const formData = new FormData(complexityForm);
    const newTargets = {};
    formData.forEach((value, key) => {
      newTargets[key] = parseInt(value, 10);
    });

    saveComplexityTargets(newTargets);
    showInlineFlash("LoC targets updated successfully.", "success");
    closeSettings();
    renderTaskSections();
  });

  populateGroupOptions();
  resetForm();
  renderTaskSections();
}
