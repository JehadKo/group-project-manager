import { bootstrapProtectedPage } from "../app.js";
import { setFlash } from "../auth.js";
import { downloadBackup, getSystemMetrics, removeUser, toggleUserActive } from "../admin.js";
import { getUsers } from "../storage.js";
import { escapeHtml, renderFlash, renderProgressMarkup } from "../ui.js";

const user = bootstrapProtectedPage({ pageKey: "admin", roles: ["admin"] });

if (user) {
  const metricsContainer = document.querySelector("#admin-metrics");
  const usersBody = document.querySelector("#admin-users");
  const topGroupsBody = document.querySelector("#top-groups-list");
  const exportButton = document.querySelector("#export-backup");

  let showOnlyAtRisk = false;

  function showInlineFlash(message, type = "success") {
    setFlash(message, type);
    renderFlash();
  }

  function renderMetrics() {
    const metrics = getSystemMetrics();
    const timeline = metrics.growthTimeline;
    const maxCount = Math.max(...timeline.map((g) => Math.max(g.userCount, g.taskCount)), 1);

    const userPoints = timeline
      .map((g, i) => {
        const x = timeline.length > 1 ? (i / (timeline.length - 1)) * 100 : 50;
        const y = 100 - (g.userCount / maxCount) * 100;
        return `${x},${y}`;
      })
      .join(" ");

    const taskPoints = timeline
      .map((g, i) => {
        const x = timeline.length > 1 ? (i / (timeline.length - 1)) * 100 : 50;
        const y = 100 - (g.taskCount / maxCount) * 100;
        return `${x},${y}`;
      })
      .join(" ");

    metricsContainer.innerHTML = `
      <div class="panel" style="grid-column: 1 / -1; margin-bottom: 0.5rem; padding: 1.5rem; background: var(--surface-strong);">
        <div class="split" style="margin-bottom: 0.8rem;">
          <div>
            <h3 style="font-family: var(--font-display); font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-soft); margin: 0;">System Health</h3>
            <p class="muted small" style="margin-top: 0.2rem;">Global task completion velocity across all workspaces.</p>
          </div>
          <div style="text-align: right;">
            <span style="font-family: var(--font-display); font-weight: 800; font-size: 1.5rem; color: var(--primary); line-height: 1;">${metrics.completionRate}%</span>
          </div>
        </div>
        ${renderProgressMarkup(metrics.completionRate)}
      </div>

      <div class="panel" style="grid-column: 1 / -1; margin-bottom: 0.5rem; padding: 1.5rem;">
        <div class="split" style="margin-bottom: 1rem;">
          <div>
            <h3 style="font-family: var(--font-display); font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-soft); margin: 0;">System Momentum</h3>
            <p class="muted small" style="margin-top: 0.2rem;">Comparing account registrations vs. milestone activity.</p>
          </div>
          <div style="display: flex; gap: 1rem;">
            <div style="display: flex; align-items: center; gap: 0.4rem; font-size: 0.65rem; font-weight: 700; text-transform: uppercase;">
              <div style="width: 8px; height: 8px; border-radius: 2px; background: var(--blue);"></div> Users
            </div>
            <div style="display: flex; align-items: center; gap: 0.4rem; font-size: 0.65rem; font-weight: 700; text-transform: uppercase;">
              <div style="width: 8px; height: 8px; border-radius: 2px; background: var(--teal);"></div> Tasks
            </div>
          </div>
        </div>
        <div style="height: 150px; width: 100%;">
          <svg viewBox="0 -5 100 110" preserveAspectRatio="none" style="width: 100%; height: 100%; overflow: visible; display: block;">
            <defs>
              <linearGradient id="user-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="var(--blue)" stop-opacity="0.1" />
                <stop offset="100%" stop-color="var(--blue)" stop-opacity="0" />
              </linearGradient>
              <linearGradient id="task-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="var(--teal)" stop-opacity="0.1" />
                <stop offset="100%" stop-color="var(--teal)" stop-opacity="0" />
              </linearGradient>
            </defs>

            <polyline points="${taskPoints}" fill="none" stroke="var(--teal)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M 0,100 L ${taskPoints} L 100,100 Z" fill="url(#task-grad)" />

            <polyline points="${userPoints}" fill="none" stroke="var(--blue)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M 0,100 L ${userPoints} L 100,100 Z" fill="url(#user-grad)" />

            ${timeline.map((g, i) => {
              const x = timeline.length > 1 ? (i / (timeline.length - 1)) * 100 : 50;
              const yUser = 100 - (g.userCount / maxCount) * 100;
              const yTask = 100 - (g.taskCount / maxCount) * 100;
              return `
                <circle cx="${x}" cy="${yUser}" r="1.5" fill="#fff" stroke="var(--blue)" stroke-width="1" data-tooltip="${g.userCount} users as of ${g.date}" style="cursor: pointer;"></circle>
                <circle cx="${x}" cy="${yTask}" r="1.5" fill="#fff" stroke="var(--teal)" stroke-width="1" data-tooltip="${g.taskCount} tasks as of ${g.date}" style="cursor: pointer;"></circle>
              `;
            }).join("")}
          </svg>
        </div>
        <div style="display: flex; justify-content: space-between; margin-top: 1rem; border-top: 1px solid var(--line); padding-top: 0.8rem;">
          ${timeline.map((g) => `<span class="muted" style="font-size: 0.6rem; font-weight: 700; text-transform: uppercase;">${g.date.split("-").slice(1).join("/")}</span>`).join("")}
        </div>
      </div>

      <article class="metric-card metric-card--teal">
        <div class="metric-card__label">Total Userbase</div>
        <div class="metric-card__value">${metrics.users}</div>
        <div class="metric-card__hint">${metrics.activeUsers} active accounts</div>
        <svg class="metric-card__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
      </article>
      <article class="metric-card metric-card--amber">
        <div class="metric-card__label">Muhammad's Network</div>
        <div class="metric-card__value">${metrics.muhammadGroups}</div>
        <div class="metric-card__hint">Active groups in Muhammad's workspace</div>
        <svg class="metric-card__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
      </article>
      <article class="metric-card metric-card--emerald">
        <div class="metric-card__label">System Milestones</div>
        <div class="metric-card__value">${metrics.tasks}</div>
        <div class="metric-card__hint">${metrics.completionRate}% overall completion</div>
        <svg class="metric-card__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
      </article>
      <article class="metric-card metric-card--blue">
        <div class="metric-card__label">Action Stream</div>
        <div class="metric-card__value">${metrics.recentActivity.length}</div>
        <div class="metric-card__hint">Latest tasks across the demo app</div>
        <svg class="metric-card__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
      </article>
    `;

    const topGroupsPanel = topGroupsBody?.closest(".panel");
    const headerLeft = topGroupsPanel?.querySelector(".panel-header-left");
    if (headerLeft && !document.querySelector("#risk-filter-container")) {
      const toggleContainer = document.createElement("div");
      toggleContainer.id = "risk-filter-container";
      toggleContainer.style.marginTop = "0.6rem";
      toggleContainer.innerHTML = `
        <label style="display:flex; align-items:center; gap: 8px; cursor:pointer; font-size: 0.72rem; font-weight: 700; color: var(--text-soft); text-transform: uppercase; letter-spacing: 0.05em;">
          <input type="checkbox" id="risk-filter-toggle" style="width: auto; min-height: auto; cursor: pointer;">
          Show only "At Risk" teams
        </label>
      `;
      headerLeft.appendChild(toggleContainer);

      document.querySelector("#risk-filter-toggle").addEventListener("change", (event) => {
        showOnlyAtRisk = event.target.checked;
        renderMetrics();
      });
    }

    if (topGroupsBody) {
      const groupsToRender = showOnlyAtRisk
        ? metrics.topGroups.filter((group) => group.completionRate < 20)
        : metrics.topGroups;

      if (groupsToRender.length === 0 && showOnlyAtRisk) {
        topGroupsBody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 3rem;" class="muted">No groups currently meet the risk criteria.</td></tr>`;
        return;
      }

      topGroupsBody.innerHTML = groupsToRender.map((group) => {
        const riskBadge = group.completionRate < 20
          ? `<span class="pill" style="background: var(--red-light); color: var(--red); margin-left: 0.5rem; font-size: 0.65rem;">At Risk</span>`
          : "";

        return `
          <tr>
            <td>
              <div style="display:flex; align-items:center;">
                <strong style="color: var(--primary);">${escapeHtml(group.name)}</strong>
                ${riskBadge}
              </div>
            </td>
            <td><span class="pill" style="background: var(--teal-light); color: var(--teal-dark);">${group.taskCount} items</span></td>
            <td><span style="font-weight: 700;">${group.completionRate}%</span></td>
            <td style="text-align: right; width: 220px;">
              <div style="display:flex; align-items:center; gap: 12px;">
                <div style="flex:1;">${renderProgressMarkup(group.completionRate)}</div>
              </div>
            </td>
          </tr>
        `;
      }).join("");
    }
  }

  function renderUsers() {
    usersBody.innerHTML = getUsers()
      .map(
        (entry) => `
          <tr>
            <td>${escapeHtml(entry.name)}</td>
            <td>${escapeHtml(entry.email)}</td>
            <td>${escapeHtml(entry.globalRole)}</td>
            <td><span class="status-pill" data-status="${entry.isActive ? "Completed" : "Inactive"}">${entry.isActive ? "Active" : "Inactive"}</span></td>
            <td>${entry.joinedGroupIds?.length ?? 0}</td>
            <td>
              <div class="inline-actions">
                <button class="btn-ghost" data-action="toggle" data-user-id="${entry.id}" type="button">${entry.isActive ? "Deactivate" : "Activate"}</button>
                <button class="btn-danger" data-action="remove" data-user-id="${entry.id}" type="button">Remove</button>
              </div>
            </td>
          </tr>
        `
      )
      .join("");

    usersBody.querySelectorAll("[data-action='toggle']").forEach((button) => {
      button.addEventListener("click", () => {
        try {
          toggleUserActive(button.dataset.userId);
          showInlineFlash("User status updated.", "success");
          renderMetrics();
          renderUsers();
        } catch (error) {
          showInlineFlash(error.message, "error");
        }
      });
    });

    usersBody.querySelectorAll("[data-action='remove']").forEach((button) => {
      button.addEventListener("click", () => {
        try {
          removeUser(button.dataset.userId);
          showInlineFlash("User removed from the demo system.", "success");
          renderMetrics();
          renderUsers();
        } catch (error) {
          showInlineFlash(error.message, "error");
        }
      });
    });
  }

  exportButton?.addEventListener("click", () => downloadBackup());

  renderMetrics();
  renderUsers();
}
