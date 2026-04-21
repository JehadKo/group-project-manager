import { bootstrapProtectedPage } from "../app.js";
import { getCurrentUser } from "../auth.js";
import { STORAGE_KEYS } from "../storage.js";
import { getGroupProgress, getUserDashboardData } from "../dashboard.js";
import { createEmptyState, createTaskCard, renderProgressMarkup, renderAppChrome } from "../ui.js";
import { getTaskAssigneeName, getTaskAssigneeRole } from "../tasks.js";

let user = bootstrapProtectedPage({ pageKey: "dashboard" });

if (user) {
  const metricContainer = document.querySelector("#dashboard-metrics");
  const overviewChartContainer = document.querySelector("#dashboard-overview-chart");
  const weeklyChartContainer = document.querySelector("#dashboard-weekly-chart");
  const typeChartContainer = document.querySelector("#dashboard-type-chart");
  const upcomingContainer = document.querySelector("#upcoming-tasks");
  const groupContainer = document.querySelector("#group-progress");
  const title = document.querySelector("#dashboard-title");
  const copy = document.querySelector("#dashboard-copy");

  function getTrendMarkup(value, unit = "", invertColor = false) {
    if (value === 0) return `<div class="metric-card__trend">Stable</div>`;
    
    const isPositive = value > 0;
    // For assigned tasks, a decrease (-) is good (invertColor = true)
    const isGood = invertColor ? !isPositive : isPositive;
    const cls = isGood ? "metric-card__trend--up" : "metric-card__trend--down";
    const icon = isPositive 
      ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>`
      : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"></polyline><polyline points="17 18 23 18 23 12"></polyline></svg>`;
    
    const sign = isPositive ? "+" : "";
    return `<div class="metric-card__trend ${cls}">${icon} ${sign}${value}${unit}</div>`;
  }

  function renderDashboard(currentUser) {
    const data = getUserDashboardData(currentUser);

    if (title) {
      title.textContent = `Welcome, ${currentUser.name}`;
    }

    if (copy) {
      copy.textContent =
        currentUser.globalRole === "admin"
          ? "Your admin workspace gives you a full overview of system activity and demo data."
          : "Track your active work, group health, and the next tasks that need attention.";
    }

    if (metricContainer) {
      metricContainer.innerHTML = `
      <article class="metric-card metric-card--teal">
        <div class="metric-card__label">Task Ecosystem</div>
        <div class="metric-card__value">${data.overview.total}</div>
        ${getTrendMarkup(data.trends.taskDiff, " tasks")}
        <div class="metric-card__hint">Total milestones in your workspace</div>
        <svg class="metric-card__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
      </article>
      <article class="metric-card metric-card--emerald">
        <div class="metric-card__label">Efficiency Rating</div>
        <div class="metric-card__value">${data.overview.completed}</div>
        ${getTrendMarkup(data.trends.rateDiff, "%")}
        <div class="metric-card__hint">${data.overview.completionRate}% overall success rate</div>
        <svg class="metric-card__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
      </article>
      <article class="metric-card metric-card--blue">
        <div class="metric-card__label">Direct Directives</div>
        <div class="metric-card__value">${data.assignedCount}</div>
        ${getTrendMarkup(data.trends.assignedDiff, " active", true)}
        <div class="metric-card__hint">Items requiring your immediate focus</div>
        <svg class="metric-card__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
      </article>
      <article class="metric-card metric-card--amber">
        <div class="metric-card__label">Active Networks</div>
        <div class="metric-card__value">${data.groupCount}</div>
        <div class="metric-card__trend">Stable</div>
        <div class="metric-card__hint">Collaborative project teams</div>
        <svg class="metric-card__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
      </article>
    `;
    }

    if (overviewChartContainer) {
      const { pending, ongoing, completed, total, completionRate } = data.overview;
      const isGoalReached = completionRate === 100 && total > 0;

      overviewChartContainer.innerHTML = `
        <div class="split">
          <div>
            <h2 style="margin: 0;">Task Distribution</h2>
            <p class="muted small">A summary of your active workload and overall workspace progress.</p>
          </div>
          <div style="text-align: right;">
            <div class="${isGoalReached ? 'is-celebrating' : ''}" style="font-family: var(--font-display); font-size: 2.6rem; font-weight: 800; color: var(--primary); line-height: 1;">${completionRate}%</div>
            <div class="muted small" style="font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 0.2rem;">Completion Rate</div>
          </div>
        </div>
        <div class="chart" style="margin-top: 2rem; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 2rem;">
          <div class="chart-bar" data-tooltip="${total ? Math.round((pending / total) * 100) : 0}% of all tasks">
            <div class="split small" style="margin-bottom: 0.4rem;">
              <span style="font-weight: 700; color: var(--warning);">Pending Tasks</span>
              <strong>${pending}</strong>
            </div>
            <div class="chart-bar__track"><div class="chart-bar__fill chart-bar__fill--pending" style="width:${total ? (pending / total) * 100 : 0}%"></div></div>
          </div>
          <div class="chart-bar" data-tooltip="${total ? Math.round((ongoing / total) * 100) : 0}% of all tasks">
            <div class="split small" style="margin-bottom: 0.4rem;">
              <span style="font-weight: 700; color: var(--primary);">Ongoing Work</span>
              <strong>${ongoing}</strong>
            </div>
            <div class="chart-bar__track"><div class="chart-bar__fill chart-bar__fill--ongoing" style="width:${total ? (ongoing / total) * 100 : 0}%"></div></div>
          </div>
          <div class="chart-bar" data-tooltip="${completionRate}% of all tasks">
            <div class="split small" style="margin-bottom: 0.4rem;">
              <span style="font-weight: 700; color: var(--success);">Completed Items</span>
              <strong>${completed}</strong>
            </div>
            <div class="chart-bar__track"><div class="chart-bar__fill chart-bar__fill--completed" style="width:${total ? (completed / total) * 100 : 0}%"></div></div>
          </div>
        </div>
        ${isGoalReached ? `
          <div class="goal-banner">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" width="18" height="18" style="vertical-align: middle; margin-right: 4px;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            ALL GOALS ACHIEVED — AMAZING WORK!
          </div>
        ` : ''}
      `;
    }

    if (weeklyChartContainer && data.weeklyActivity) {
      const counts = data.weeklyActivity.map((d) => d.count);
      const maxCount = Math.max(...counts, 1);
      const points = data.weeklyActivity
        .map((d, i) => {
          const x = (i / 6) * 100;
          const y = 100 - (d.count / maxCount) * 100;
          return `${x},${y}`;
        })
        .join(" ");

      weeklyChartContainer.innerHTML = `
        <div class="split">
          <div>
            <h2 style="margin: 0;">Weekly Momentum</h2>
            <p class="muted small">Tasks completed per day over the last week.</p>
          </div>
        </div>
        <div class="weekly-line-chart" style="margin-top: 2rem; position: relative; height: 150px; padding: 0 10px;">
          <svg viewBox="0 -5 100 110" preserveAspectRatio="none" style="width: 100%; height: 100%; overflow: visible; display: block;">
            <defs>
              <linearGradient id="line-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="var(--teal)" stop-opacity="0.25" />
                <stop offset="100%" stop-color="var(--teal)" stop-opacity="0" />
              </linearGradient>
            </defs>
            <polyline points="${points}" fill="none" stroke="var(--teal)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M 0,100 L ${points} L 100,100 Z" fill="url(#line-grad)" />
            ${data.weeklyActivity.map((d, i) => {
              const x = (i / 6) * 100;
              const y = 100 - (d.count / maxCount) * 100;
              return `<circle cx="${x}" cy="${y}" r="2" fill="#fff" stroke="var(--teal)" stroke-width="1.5" data-tooltip="${d.count} tasks completed on ${d.label}" style="cursor: pointer;"></circle>`;
            }).join("")}
          </svg>
          <div style="display: flex; justify-content: space-between; margin-top: 1.2rem; border-top: 1px solid var(--line); padding-top: 0.8rem;">
            ${data.weeklyActivity.map((d) => `<span class="muted" style="font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">${d.label}</span>`).join("")}
          </div>
        </div>
      `;
    }

    if (typeChartContainer && data.typeBreakdown) {
      const { deadlines, reminders } = data.typeBreakdown;
      const total = deadlines + reminders;
      const deadlinePercent = total ? Math.round((deadlines / total) * 100) : 0;
      const reminderPercent = total ? 100 - deadlinePercent : 0;

      // SVG Donut Math (Circumference of radius 15.9155 is exactly 100)
      const strokeDash = `${deadlinePercent} 100`;

      typeChartContainer.innerHTML = `
        <div class="split">
          <div>
            <h2 style="margin: 0;">Task Composition</h2>
            <p class="muted small">Breakdown by task category.</p>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 2rem; margin-top: 1.5rem;">
          <div style="position: relative; width: 100px; height: 100px;">
            <svg viewBox="0 0 42 42" style="transform: rotate(-90deg); width: 100%; height: 100%;">
              <circle cx="21" cy="21" r="15.9155" fill="transparent" stroke="var(--warning)" stroke-width="6" 
                data-tooltip="Reminders: ${reminderPercent}%" style="opacity: 0.2;"></circle>
              <circle class="donut-segment--animate" cx="21" cy="21" r="15.9155" fill="transparent" stroke="var(--teal)" stroke-width="6" 
                stroke-dasharray="${strokeDash}" stroke-dashoffset="0" stroke-linecap="round"
                data-tooltip="Deadlines: ${deadlinePercent}%" style="transition: stroke-dasharray 1s ease;"></circle>
            </svg>
            <div class="donut-total--animate" style="position: absolute; inset: 0; display: grid; place-items: center; font-family: var(--font-display); font-weight: 800; font-size: 0.9rem; color: var(--primary);">
              ${total}
            </div>
          </div>
          <div class="list" style="flex: 1; gap: 0.8rem;">
            <div class="split small">
              <div style="display: flex; align-items: center; gap: 0.5rem;">
                <div style="width: 8px; height: 8px; border-radius: 2px; background: var(--teal);"></div>
                <span style="font-weight: 700;">Deadlines</span>
              </div>
              <strong>${deadlines}</strong>
            </div>
            <div class="split small">
              <div style="display: flex; align-items: center; gap: 0.5rem;">
                <div style="width: 8px; height: 8px; border-radius: 2px; background: var(--warning);"></div>
                <span style="font-weight: 700;">Reminders</span>
              </div>
              <strong>${reminders}</strong>
            </div>
            <div style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid var(--line);">
              <p class="muted" style="font-size: 0.65rem; line-height: 1.4;">
                ${
                  deadlinePercent > 70 
                  ? "Heavy focus on deliverables. Ensure team bandwidth." 
                  : "Balanced mix of coordination and production work."
                }
              </p>
            </div>
          </div>
        </div>
      `;
    }

    if (upcomingContainer) {
      upcomingContainer.innerHTML = data.upcomingTasks.length
        ? data.upcomingTasks
            .map((task) =>
              createTaskCard(task, {
                assigneeName: getTaskAssigneeName(task),
                assigneeRole: getTaskAssigneeRole(task),
              })
            )
            .join("")
        : createEmptyState("No upcoming tasks", "Create a task or join a group to see deadlines here.");
    }

    if (groupContainer) {
      groupContainer.innerHTML = data.groups.length
        ? data.groups
          .map((group) => {
            const progress = getGroupProgress(group.id);
            if (!progress) {
              return "";
            }

            const members = progress.memberMap
              .map(
                (member) => `
                  <div class="split small">
                    <span>${member.name} (${member.role})</span>
                    <span>${member.tasksCompleted}/${member.tasksAssigned} completed</span>
                  </div>
                `
              )
              .join("");

            return `
              <article class="dashboard-card">
                <div class="split">
                  <div>
                    <h2>${group.groupName}</h2>
                    <p class="muted">Invite code: ${group.inviteCode}</p>
                  </div>
                  <div>${renderProgressMarkup(progress.summary.completionRate)}</div>
                </div>
                <div class="chart" style="margin-top: 1rem;">
                  <div class="chart-bar" data-tooltip="${progress.summary.total ? Math.round((progress.summary.pending / progress.summary.total) * 100) : 0}% of group tasks">
                    <div class="split small"><span>Pending</span><span>${progress.summary.pending}</span></div>
                    <div class="chart-bar__track"><div class="chart-bar__fill chart-bar__fill--pending" style="width:${progress.summary.total ? (progress.summary.pending / progress.summary.total) * 100 : 0}%"></div></div>
                  </div>
                  <div class="chart-bar" data-tooltip="${progress.summary.total ? Math.round((progress.summary.ongoing / progress.summary.total) * 100) : 0}% of group tasks">
                    <div class="split small"><span>Ongoing</span><span>${progress.summary.ongoing}</span></div>
                    <div class="chart-bar__track"><div class="chart-bar__fill chart-bar__fill--ongoing" style="width:${progress.summary.total ? (progress.summary.ongoing / progress.summary.total) * 100 : 0}%"></div></div>
                  </div>
                  <div class="chart-bar" data-tooltip="${progress.summary.completionRate}% of group tasks">
                    <div class="split small"><span>Completed</span><span>${progress.summary.completed}</span></div>
                    <div class="chart-bar__track"><div class="chart-bar__fill chart-bar__fill--completed" style="width:${progress.summary.total ? (progress.summary.completed / progress.summary.total) * 100 : 0}%"></div></div>
                  </div>
                </div>
                <div class="list" style="margin-top: 1rem;">
                  ${members}
                </div>
              </article>
            `;
          })
          .join("")
        : createEmptyState("No groups yet", "Create a group or join one with an invite code to start tracking project progress.");
    }
  }

  // Initial render
  renderDashboard(user);

  // Real-time synchronization across browser tabs
  window.addEventListener("storage", (event) => {
    // Only react to changes in this application's storage keys
    if (Object.values(STORAGE_KEYS).includes(event.key)) {
      const freshUser = getCurrentUser();
      if (freshUser) {
        user = freshUser;
        // Re-render the app chrome (sidebar/header) and main dashboard content
        renderAppChrome("dashboard", user);
        renderDashboard(user);
      }
    }
  });
}
