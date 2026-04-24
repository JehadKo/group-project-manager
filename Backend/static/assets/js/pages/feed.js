import { bootstrapProtectedPage } from "../app.js";
import { getCurrentUser, getUserById } from "../auth.js";
import { getGroupById } from "../groups.js";
import { getProgressLogs, STORAGE_KEYS } from "../storage.js";
import { getTaskAssigneeName, getTaskAssigneeRole, getUserVisibleTasks, getTaskById } from "../tasks.js";
import { createEmptyState, createTaskCard, formatDateTime, escapeHtml, renderAppChrome } from "../ui.js";

let user = await bootstrapProtectedPage({ pageKey: "feed" });

if (user) {
  const list = document.querySelector("#feed-list");
  const filters = document.querySelector("#feed-filters");
  const exportBtn = document.querySelector("#export-pdf-btn");
  let activeFilter = "activity";

  function filterTasks(tasks) {
    const soonCutoff = Date.now() + 1000 * 60 * 60 * 24 * 3;
    switch (activeFilter) {
      case "personal":
        return tasks.filter((task) => task.isPersonal);
      case "group":
        return tasks.filter((task) => !task.isPersonal);
      case "dueSoon":
        return tasks.filter((task) => task.deadline && new Date(task.deadline).getTime() <= soonCutoff && task.status !== "Completed");
      case "completed":
        return tasks.filter((task) => task.status === "Completed");
      default:
        return tasks;
    }
  }

  function renderActivityStream() {
    const visibleTaskIds = new Set(getUserVisibleTasks(user).map((t) => t.id));
    const logs = getProgressLogs()
      .filter((log) => visibleTaskIds.has(log.taskId))
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    if (!logs.length) {
      list.innerHTML = createEmptyState("No activity yet", "Progress updates and task changes will appear here.");
      return;
    }

    list.innerHTML = `
      <div class="activity-stream">
        ${logs
          .map((log) => {
            const task = getTaskById(log.taskId);
            const actor = getUserById(log.userId);
            return `
              <div class="activity-item">
                <span class="activity-item__time">${formatDateTime(log.timestamp)}</span>
                <div class="panel" style="padding: 1rem; background: var(--surface-strong);">
                  <p style="margin:0;">
                    <strong>${escapeHtml(actor?.name || "Unknown User")}</strong> 
                    updated <strong>${escapeHtml(task?.title || "Deleted Task")}</strong> 
                    to <span class="status-pill" data-status="${escapeHtml(log.status)}">${escapeHtml(log.status)}</span>
                  </p>
                  ${
                    log.note
                      ? `<p class="muted small" style="margin-top: 0.7rem; padding-left: 0.8rem; border-left: 2px solid var(--teal); font-style: italic;">"${escapeHtml(log.note)}"</p>`
                      : ""
                  }
                </div>
              </div>
            `;
          })
          .join("")}
      </div>
    `;
  }

  function renderFeed() {
    if (activeFilter === "activity") {
      renderActivityStream();
      return;
    }

    const tasks = filterTasks(
      getUserVisibleTasks(user).sort((left, right) => {
        const leftTime = left.deadline ? new Date(left.deadline).getTime() : Number.MAX_SAFE_INTEGER;
        const rightTime = right.deadline ? new Date(right.deadline).getTime() : Number.MAX_SAFE_INTEGER;
        return leftTime - rightTime;
      })
    );

    list.innerHTML = tasks.length
      ? tasks
          .map((task) =>
            createTaskCard(task, {
              assigneeName: getTaskAssigneeName(task),
              assigneeRole: getTaskAssigneeRole(task),
              groupName: task.groupId ? getGroupById(task.groupId)?.groupName ?? "" : "Personal",
              showGroupName: true,
            })
          )
          .join("")
      : createEmptyState("Nothing matches this filter", "Try another filter or create a new task.");
  }

  filters?.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      activeFilter = button.dataset.filter;
      filters.querySelectorAll("button").forEach((entry) => {
        const isActive = entry === button;
        entry.className = isActive ? "btn-secondary is-active" : "btn-ghost";
        entry.setAttribute("aria-pressed", isActive);
      });
      renderFeed();
    });
  });

  window.addEventListener("storage", (event) => {
    if (Object.values(STORAGE_KEYS).includes(event.key)) {
      const freshUser = getCurrentUser();
      if (freshUser) {
        user = freshUser;
        renderAppChrome("feed", user);
        renderFeed();
      }
    }
  });

  exportBtn?.addEventListener("click", () => window.print());

  renderFeed();
}
