import { bootstrapProtectedPage } from "../app.js";
import { getCurrentUser } from "../auth.js";
import { STORAGE_KEYS } from "../storage.js";
import { getGroupProgress, getUserDashboardData } from "../dashboard.js";
import { createEmptyState, createTaskCard, escapeHtml, formatDate, renderProgressMarkup, renderAppChrome } from "../ui.js";
import { getTaskAssigneeName, getTaskAssigneeRole } from "../tasks.js";

let user = bootstrapProtectedPage({ pageKey: "dashboard" });

if (user) {
  const heroStatsContainer = document.querySelector("#dashboard-hero-stats");
  const focusCardContainer = document.querySelector("#dashboard-focus-card");
  const quickActionsContainer = document.querySelector("#dashboard-quick-actions");
  const metricContainer = document.querySelector("#dashboard-metrics");
  const overviewChartContainer = document.querySelector("#dashboard-overview-chart");
  const insightsContainer = document.querySelector("#dashboard-insights");
  const weeklyChartContainer = document.querySelector("#dashboard-weekly-chart");
  const typeChartContainer = document.querySelector("#dashboard-type-chart");
  const upcomingContainer = document.querySelector("#upcoming-tasks");
  const groupContainer = document.querySelector("#group-progress");
  const title = document.querySelector("#dashboard-title");
  const copy = document.querySelector("#dashboard-copy");

  function pluralize(count, singular, plural = `${singular}s`) {
    return `${count} ${count === 1 ? singular : plural}`;
  }

  function getTrendMarkup(value, unit = "", invertColor = false) {
    if (value === 0) {
      return `<div class="metric-card__trend">Stable</div>`;
    }

    const isPositive = value > 0;
    const isGood = invertColor ? !isPositive : isPositive;
    const cls = isGood ? "metric-card__trend--up" : "metric-card__trend--down";
    const icon = isPositive
      ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>`
      : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"></polyline><polyline points="17 18 23 18 23 12"></polyline></svg>`;

    const sign = isPositive ? "+" : "";
    return `<div class="metric-card__trend ${cls}">${icon} ${sign}${value}${unit}</div>`;
  }

  function getDayDelta(value) {
    if (!value) {
      return null;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const target = new Date(value);
    target.setHours(0, 0, 0, 0);

    return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  }

  function getRelativeDeadlineLabel(value) {
    const delta = getDayDelta(value);
    const deadline = value ? new Date(value) : null;
    const now = new Date();

    if (delta === null) {
      return "No deadline";
    }

    if (deadline && deadline.getTime() < now.getTime()) {
      if (delta === 0) {
        return "Overdue today";
      }

      return `Overdue by ${pluralize(Math.abs(delta), "day")}`;
    }

    if (delta === 0) {
      return "Due today";
    }

    if (delta === 1) {
      return "Due tomorrow";
    }

    return `Due in ${pluralize(delta, "day")}`;
  }

  function getFocusTone(task) {
    if (!task?.deadline || task.status === "Completed") {
      return "calm";
    }

    if (new Date(task.deadline).getTime() < Date.now()) {
      return "critical";
    }

    const delta = getDayDelta(task.deadline);

    if (delta <= 1) {
      return "urgent";
    }

    if (delta <= 3) {
      return "watch";
    }

    return "calm";
  }

  function getFocusLabel(tone) {
    if (tone === "critical") return "Needs recovery";
    if (tone === "urgent") return "Immediate priority";
    if (tone === "watch") return "Coming up fast";
    return "On track";
  }

  function getWorkspaceNarrative(data, currentUser) {
    if (currentUser.globalRole === "admin") {
      if (data.overdueCount > 0) {
        return "Several deadlines have slipped. This is a good moment to review workload balance across the system.";
      }

      if (data.completedThisWeek > 0) {
        return "The platform is active and recent completions are coming through steadily.";
      }

      return "Use this space to watch task flow, team activity, and where support may be needed next.";
    }

    if (data.overdueCount > 0) {
      return "A few tasks need recovery. Reset expectations early so the rest of the board stays realistic.";
    }

    if (data.dueSoonCount > 0) {
      return "The next few days are busy. Tight follow-through now will keep the week under control.";
    }

    if (data.assignedCount > 0) {
      return "Your queue is active, but there is room to stay ahead if you keep progress notes fresh.";
    }

    return "The board is calm right now. This is a good time to prepare the next milestone before it becomes urgent.";
  }

  function renderHeroStats(data) {
    if (!heroStatsContainer) {
      return;
    }

    heroStatsContainer.innerHTML = `
      <div class="hero-stat">
        <strong>${data.overview.completionRate}%</strong>
        <span>completion rate</span>
      </div>
      <div class="hero-stat">
        <strong>${data.assignedCount}</strong>
        <span>tasks on your plate</span>
      </div>
      <div class="hero-stat">
        <strong>${data.completedThisWeek}</strong>
        <span>closed this week</span>
      </div>
      <div class="hero-stat">
        <strong>${data.overdueCount > 0 ? data.overdueCount : data.dueSoonCount}</strong>
        <span>${data.overdueCount > 0 ? "overdue items" : "due in 3 days"}</span>
      </div>
    `;
  }

  function renderFocusCard(data) {
    if (!focusCardContainer) {
      return;
    }

    const nextTask = data.upcomingTasks[0];

    if (!nextTask) {
      focusCardContainer.innerHTML = `
        <div class="dashboard-focus-card__eyebrow">Current focus</div>
        <div class="dashboard-focus-card__headline">Everything important is clear.</div>
        <p>No open deadline is competing for attention right now. Use the space to plan the next deliverable or clean up the backlog.</p>
        <div class="dashboard-focus-card__meta">
          <span class="dashboard-chip dashboard-chip--calm">Clear runway</span>
          <span class="dashboard-chip">0 upcoming deadlines</span>
        </div>
        <div class="dashboard-focus-card__actions">
          <a class="btn" href="tasks.html">Create task</a>
          <a class="btn-ghost" href="groups.html">Open groups</a>
        </div>
      `;
      return;
    }

    const tone = getFocusTone(nextTask);
    const categoryLabel = nextTask.taskType === "reminder" ? "Reminder" : nextTask.category;

    focusCardContainer.innerHTML = `
      <div class="dashboard-focus-card__eyebrow">Current focus</div>
      <div class="dashboard-focus-card__headline">${escapeHtml(nextTask.title)}</div>
      <p>${escapeHtml(nextTask.description)}</p>
      <div class="dashboard-focus-card__meta">
        <span class="dashboard-chip dashboard-chip--${tone}">${getFocusLabel(tone)}</span>
        <span class="dashboard-chip">${escapeHtml(getRelativeDeadlineLabel(nextTask.deadline))}</span>
      </div>
      <div class="dashboard-focus-card__detail-grid">
        <div class="dashboard-focus-card__detail">
          <span>Deadline</span>
          <strong>${escapeHtml(formatDate(nextTask.deadline))}</strong>
        </div>
        <div class="dashboard-focus-card__detail">
          <span>Status</span>
          <strong>${escapeHtml(nextTask.status)}</strong>
        </div>
        <div class="dashboard-focus-card__detail">
          <span>Assignee</span>
          <strong>${escapeHtml(getTaskAssigneeName(nextTask))}</strong>
        </div>
        <div class="dashboard-focus-card__detail">
          <span>Category</span>
          <strong>${escapeHtml(categoryLabel)}</strong>
        </div>
      </div>
      <div class="dashboard-focus-card__actions">
        <a class="btn" href="tasks.html">Open tasks</a>
        <a class="btn-ghost" href="feed.html">Team feed</a>
      </div>
    `;
  }

  function renderQuickActions(data, currentUser) {
    if (!quickActionsContainer) {
      return;
    }

    const actions = [
      {
        accent: "teal",
        href: "tasks.html",
        kicker: "Execution",
        title: "Manage active tasks",
        metric: `${data.overview.pending + data.overview.ongoing} open items`,
        description: "Update progress notes, close finished work, and keep deadlines believable.",
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>`,
      },
      {
        accent: "amber",
        href: "groups.html",
        kicker: "Coordination",
        title: "Review team spaces",
        metric: pluralize(data.groupCount, "group"),
        description: "Check invite codes, progress balance, and who may need help this week.",
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`,
      },
      {
        accent: "blue",
        href: "feed.html",
        kicker: "Visibility",
        title: "Check activity feed",
        metric: `${pluralize(data.completedThisWeek, "completion")} this week`,
        description: "See momentum across the workspace before you decide what to push next.",
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"></path></svg>`,
      },
      currentUser.globalRole === "admin"
        ? {
            accent: "rose",
            href: "admin.html",
            kicker: "Oversight",
            title: "Open admin controls",
            metric: `${data.overview.total} tasks in system`,
            description: "Manage accounts, monitor activity, and keep the demo environment healthy.",
            icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path><path d="M4.93 4.93a10 10 0 0 0 0 14.14"></path></svg>`,
          }
        : {
            accent: "sun",
            href: "profile.html",
            kicker: "Profile",
            title: "Refresh your workspace",
            metric: pluralize(data.personalCount, "personal task"),
            description: "Keep your account details current and make your workspace easier to understand.",
            icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`,
          },
    ];

    quickActionsContainer.innerHTML = actions
      .map(
        (action) => `
          <a class="dashboard-action-card" href="${action.href}" data-accent="${action.accent}">
            <div class="dashboard-action-card__top">
              <div class="dashboard-action-card__icon">${action.icon}</div>
              <div class="dashboard-action-card__metric">${escapeHtml(action.metric)}</div>
            </div>
            <div>
              <div class="dashboard-action-card__kicker">${escapeHtml(action.kicker)}</div>
              <h3 class="dashboard-action-card__title">${escapeHtml(action.title)}</h3>
              <p>${escapeHtml(action.description)}</p>
            </div>
            <span class="dashboard-action-card__cta">Open section</span>
          </a>
        `
      )
      .join("");
  }

  function renderInsights(data, currentUser) {
    if (!insightsContainer) {
      return;
    }

    const insights = [
      data.overdueCount > 0
        ? {
            tone: "critical",
            eyebrow: "Recovery",
            title: `${pluralize(data.overdueCount, "overdue task")} need attention`,
            copy: "Start by resetting the oldest deadline or updating the task owner so the dashboard stays trustworthy.",
          }
        : {
            tone: "positive",
            eyebrow: "Control",
            title: "No deadlines are currently overdue",
            copy: "That gives the team room to focus on quality instead of emergency recovery work.",
          },
      data.dueSoonCount > 0
        ? {
            tone: "watch",
            eyebrow: "Next 72 hours",
            title: `${pluralize(data.dueSoonCount, "task")} land soon`,
            copy: "A quick check-in now will prevent last-minute handoffs and unclear ownership.",
          }
        : {
            tone: "calm",
            eyebrow: "Breathing room",
            title: "The near-term schedule is manageable",
            copy: "Use the extra space to tighten documentation, notes, or group coordination.",
          },
      {
        tone: data.overview.completionRate >= 65 ? "positive" : "watch",
        eyebrow: "Delivery pace",
        title:
          data.overview.completionRate >= 65
            ? `${data.overview.completionRate}% of visible tasks are complete`
            : "Completion pace still has room to improve",
        copy:
          data.overview.completionRate >= 65
            ? "Momentum is healthy. Keep task updates current so the board continues to reflect reality."
            : "Push a few nearly-finished items over the line to make the board clearer and more motivating.",
      },
      {
        tone: data.assignedCount > 0 ? "calm" : "positive",
        eyebrow: currentUser.globalRole === "admin" ? "Coverage" : "Personal load",
        title:
          currentUser.globalRole === "admin"
            ? `${pluralize(data.groupCount, "group")} currently visible in your workspace`
            : data.assignedCount > 0
            ? `${pluralize(data.assignedCount, "active assignment")} are directly yours`
            : "No active assignments are directly on your plate",
        copy: getWorkspaceNarrative(data, currentUser),
      },
    ];

    insightsContainer.innerHTML = `
      <div class="dashboard-panel-header">
        <div>
          <h2>What needs attention</h2>
          <p class="muted small">A short read on the current workspace state.</p>
        </div>
      </div>
      <div class="dashboard-insight-list">
        ${insights
          .map(
            (insight) => `
              <article class="dashboard-insight dashboard-insight--${insight.tone}">
                <div class="dashboard-insight__eyebrow">${escapeHtml(insight.eyebrow)}</div>
                <h3>${escapeHtml(insight.title)}</h3>
                <p>${escapeHtml(insight.copy)}</p>
              </article>
            `
          )
          .join("")}
      </div>
    `;
  }

  function renderDashboard(currentUser) {
    const data = getUserDashboardData(currentUser);

    if (title) {
      title.textContent = `Welcome, ${currentUser.name}`;
    }

    if (copy) {
      copy.textContent =
        currentUser.globalRole === "admin"
          ? "See system activity, watch deadline risk, and keep the whole workspace moving with fewer surprises."
          : "Stay on top of your workload, your team health, and the deadlines that matter most next.";
    }

    renderHeroStats(data);
    renderFocusCard(data);
    renderQuickActions(data, currentUser);
    renderInsights(data, currentUser);

    if (metricContainer) {
      metricContainer.innerHTML = `
        <article class="metric-card metric-card--teal">
          <div class="metric-card__label">Workspace Tasks</div>
          <div class="metric-card__value">${data.overview.total}</div>
          ${getTrendMarkup(data.trends.taskDiff, " tasks")}
          <div class="metric-card__hint">Visible tasks across personal and group work</div>
          <svg class="metric-card__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
        </article>
        <article class="metric-card metric-card--emerald">
          <div class="metric-card__label">Completion Rate</div>
          <div class="metric-card__value">${data.overview.completionRate}%</div>
          ${getTrendMarkup(data.trends.rateDiff, "%")}
          <div class="metric-card__hint">${data.overview.completed} completed out of ${data.overview.total}</div>
          <svg class="metric-card__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
        </article>
        <article class="metric-card metric-card--blue">
          <div class="metric-card__label">Your Active Queue</div>
          <div class="metric-card__value">${data.assignedCount}</div>
          ${getTrendMarkup(data.trends.assignedDiff, " active", true)}
          <div class="metric-card__hint">Assignments that still need progress from you</div>
          <svg class="metric-card__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
        </article>
        <article class="metric-card metric-card--amber">
          <div class="metric-card__label">${data.overdueCount > 0 ? "Deadline Risk" : "Near-Term Due"}</div>
          <div class="metric-card__value">${data.overdueCount > 0 ? data.overdueCount : data.dueSoonCount}</div>
          <div class="metric-card__trend">${data.overdueCount > 0 ? "Act now" : "Keep watch"}</div>
          <div class="metric-card__hint">${data.overdueCount > 0 ? "Tasks already past deadline" : "Tasks due within the next 72 hours"}</div>
          <svg class="metric-card__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="13" r="8"></circle><path d="M12 9v4l2.5 1.5"></path></svg>
        </article>
      `;
    }

    if (overviewChartContainer) {
      const { pending, ongoing, completed, total, completionRate } = data.overview;
      const isGoalReached = completionRate === 100 && total > 0;

      overviewChartContainer.innerHTML = `
        <div class="dashboard-panel-header">
          <div>
            <h2>Task distribution</h2>
            <p class="muted small">See where the workload is stuck, moving, or already resolved.</p>
          </div>
          <div class="dashboard-kpi">
            <div class="dashboard-kpi__value ${isGoalReached ? "is-celebrating" : ""}">${completionRate}%</div>
            <div class="dashboard-kpi__label">Completion rate</div>
          </div>
        </div>
        <div class="dashboard-bar-grid">
          <div class="dashboard-bar-card chart-bar" data-tooltip="${total ? Math.round((pending / total) * 100) : 0}% of all tasks">
            <div class="split small">
              <span class="dashboard-bar-card__title dashboard-bar-card__title--warning">Pending tasks</span>
              <strong>${pending}</strong>
            </div>
            <div class="chart-bar__track"><div class="chart-bar__fill chart-bar__fill--pending" style="width:${total ? (pending / total) * 100 : 0}%"></div></div>
          </div>
          <div class="dashboard-bar-card chart-bar" data-tooltip="${total ? Math.round((ongoing / total) * 100) : 0}% of all tasks">
            <div class="split small">
              <span class="dashboard-bar-card__title dashboard-bar-card__title--primary">Ongoing work</span>
              <strong>${ongoing}</strong>
            </div>
            <div class="chart-bar__track"><div class="chart-bar__fill chart-bar__fill--ongoing" style="width:${total ? (ongoing / total) * 100 : 0}%"></div></div>
          </div>
          <div class="dashboard-bar-card chart-bar" data-tooltip="${completionRate}% of all tasks">
            <div class="split small">
              <span class="dashboard-bar-card__title dashboard-bar-card__title--success">Completed items</span>
              <strong>${completed}</strong>
            </div>
            <div class="chart-bar__track"><div class="chart-bar__fill chart-bar__fill--completed" style="width:${total ? (completed / total) * 100 : 0}%"></div></div>
          </div>
        </div>
        ${
          isGoalReached
            ? `
              <div class="goal-banner">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" width="18" height="18" style="vertical-align: middle; margin-right: 4px;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                All visible goals are complete. Excellent work.
              </div>
            `
            : ""
        }
      `;
    }

    if (weeklyChartContainer && data.weeklyActivity) {
      const counts = data.weeklyActivity.map((day) => day.count);
      const maxCount = Math.max(...counts, 1);
      const points = data.weeklyActivity
        .map((day, index) => {
          const x = (index / 6) * 100;
          const y = 100 - (day.count / maxCount) * 100;
          return `${x},${y}`;
        })
        .join(" ");

      weeklyChartContainer.innerHTML = `
        <div class="dashboard-panel-header">
          <div>
            <h2>Weekly momentum</h2>
            <p class="muted small">Completed tasks over the last seven days.</p>
          </div>
        </div>
        <div class="dashboard-weekly-chart">
          <svg viewBox="0 -5 100 110" preserveAspectRatio="none" style="width: 100%; height: 100%; overflow: visible; display: block;">
            <defs>
              <linearGradient id="line-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="var(--primary)" stop-opacity="0.25"></stop>
                <stop offset="100%" stop-color="var(--primary)" stop-opacity="0"></stop>
              </linearGradient>
            </defs>
            <polyline points="${points}" fill="none" stroke="var(--primary)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></polyline>
            <path d="M 0,100 L ${points} L 100,100 Z" fill="url(#line-grad)"></path>
            ${data.weeklyActivity
              .map((day, index) => {
                const x = (index / 6) * 100;
                const y = 100 - (day.count / maxCount) * 100;
                return `<circle cx="${x}" cy="${y}" r="2.5" fill="#fff" stroke="var(--primary)" stroke-width="1.5" data-tooltip="${day.count} tasks completed on ${day.label}" style="cursor: pointer;"></circle>`;
              })
              .join("")}
          </svg>
          <div class="dashboard-weekly-axis">
            ${data.weeklyActivity
              .map(
                (day) =>
                  `<span class="muted" style="font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">${day.label}</span>`
              )
              .join("")}
          </div>
        </div>
      `;
    }

    if (typeChartContainer && data.typeBreakdown) {
      const { deadlines, reminders } = data.typeBreakdown;
      const total = deadlines + reminders;
      const deadlinePercent = total ? Math.round((deadlines / total) * 100) : 0;
      const reminderPercent = total ? 100 - deadlinePercent : 0;
      const strokeDash = `${deadlinePercent} 100`;

      typeChartContainer.innerHTML = `
        <div class="dashboard-panel-header">
          <div>
            <h2>Task composition</h2>
            <p class="muted small">How much of the workload is delivery versus coordination.</p>
          </div>
        </div>
        <div class="dashboard-composition">
          <div class="dashboard-composition__ring">
            <svg viewBox="0 0 42 42" style="transform: rotate(-90deg); width: 100%; height: 100%;">
              <circle cx="21" cy="21" r="15.9155" fill="transparent" stroke="var(--warning)" stroke-width="6" data-tooltip="Reminders: ${reminderPercent}%" style="opacity: 0.2;"></circle>
              <circle class="donut-segment--animate" cx="21" cy="21" r="15.9155" fill="transparent" stroke="var(--primary)" stroke-width="6" stroke-dasharray="${strokeDash}" stroke-dashoffset="0" stroke-linecap="round" data-tooltip="Deadlines: ${deadlinePercent}%" style="transition: stroke-dasharray 1s ease;"></circle>
            </svg>
            <div class="dashboard-composition__total donut-total--animate">${total}</div>
          </div>
          <div class="dashboard-composition__legend">
            <div class="dashboard-composition__row small">
              <div class="dashboard-composition__label">
                <div class="dashboard-composition__swatch" style="background: var(--primary);"></div>
                <span style="font-weight: 700;">Deadlines</span>
              </div>
              <strong>${deadlines}</strong>
            </div>
            <div class="dashboard-composition__row small">
              <div class="dashboard-composition__label">
                <div class="dashboard-composition__swatch" style="background: var(--warning);"></div>
                <span style="font-weight: 700;">Reminders</span>
              </div>
              <strong>${reminders}</strong>
            </div>
            <div class="dashboard-composition__note">
              <p class="muted" style="font-size: 0.65rem; line-height: 1.4;">
                ${deadlinePercent > 70 ? "Heavy focus on deliverables. Make sure workload and ownership are realistic." : "This looks like a balanced mix of planning and actual delivery work."}
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
                .map((member) => {
                  const roleLabel = member.role.charAt(0).toUpperCase() + member.role.slice(1);

                  return `
                    <div class="dashboard-member">
                      <div>
                        <div class="dashboard-member__name">${escapeHtml(member.name)}</div>
                        <div class="dashboard-member__role">${escapeHtml(roleLabel)}</div>
                      </div>
                      <div class="dashboard-member__score">${member.tasksCompleted}/${member.tasksAssigned} completed</div>
                    </div>
                  `;
                })
                .join("");

              return `
                <article class="dashboard-card dashboard-group-card">
                  <div class="dashboard-group-card__header">
                    <div>
                      <h2>${escapeHtml(group.groupName)}</h2>
                      <p class="dashboard-group-card__invite">Invite code: ${escapeHtml(group.inviteCode)}</p>
                    </div>
                    <div class="dashboard-group-card__progress">${renderProgressMarkup(progress.summary.completionRate)}</div>
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
                  <div class="dashboard-member-list">
                    ${members}
                  </div>
                </article>
              `;
            })
            .join("")
        : createEmptyState("No groups yet", "Create a group or join one with an invite code to start tracking project progress.");
    }
  }

  renderDashboard(user);

  window.addEventListener("storage", (event) => {
    if (Object.values(STORAGE_KEYS).includes(event.key)) {
      const freshUser = getCurrentUser();
      if (freshUser) {
        user = freshUser;
        renderAppChrome("dashboard", user);
        renderDashboard(user);
      }
    }
  });
}
