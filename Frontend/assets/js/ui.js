import { consumeFlash, getCurrentUser, isAdmin, logoutUser } from "./auth.js";
import { getUserGroups } from "./groups.js";

const APP_LINKS = [
  { href: "dashboard.html", label: "Dashboard", key: "dashboard", section: "Overview", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>` },
  { href: "tasks.html", label: "Tasks", key: "tasks", section: "Work", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>` },
  { href: "groups.html", label: "Groups", key: "groups", section: "Work", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>` },
  { href: "feed.html", label: "Feed", key: "feed", section: "Work", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>` },
  { href: "profile.html", label: "Profile", key: "profile", section: "Account", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>` },
  { href: "admin.html", label: "Admin", key: "admin", adminOnly: true, section: "Account", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 010 14.14M4.93 4.93a10 10 0 000 14.14"/></svg>` },
];

function formatDate(value) {
  if (!value) {
    return "No deadline";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatDateTime(value) {
  if (!value) {
    return "N/A";
  }
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function escapeHtml(text = "") {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getAvatarMarkup(user, className = "avatar") {
  if (user?.profilePicture) {
    return `<img class="${className}" src="${escapeHtml(user.profilePicture)}" alt="${escapeHtml(user.name)}" />`;
  }

  // Deterministic color based on name
  const colors = ["#0f766e", "#1478b0", "#c77d2b", "#2f855a", "#b91c1c", "#6366f1"];
  let hash = 0;
  const name = user?.name || "SG";
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const color = colors[Math.abs(hash) % colors.length];

  const fallback = user?.name?.slice(0, 2)?.toUpperCase() || "SG";
  return `
    <div class="${className}" style="display:grid;place-items:center;font-weight:800;background-color:${color};color:#fff;">
      ${escapeHtml(fallback)}
    </div>
  `;
}

function renderPublicHeader(active = "") {
  const currentUser = getCurrentUser();
  const header = document.querySelector("#site-header");
  if (!header) {
    return;
  }

  header.className = "public-header";
  header.innerHTML = `
    <div class="container public-header__inner">
      <a class="brand" href="index.html">
        <span class="brand__mark">SG</span>
        <span>Student Group Project Manager</span>
      </a>
      <div class="header-links">
        <a class="header-link" href="index.html#features">Features</a>
        <a class="header-link" href="index.html#roles">Roles</a>
        <a class="header-link" href="index.html#demo">Demo</a>
      </div>
      <div class="header-actions">
        ${
          currentUser
            ? `<a class="btn-secondary" href="dashboard.html">Open Dashboard</a>`
            : `
              <a class="btn-ghost" href="login.html">Login</a>
              <a class="btn" href="register.html">Create Account</a>
            `
        }
      </div>
    </div>
  `;
}

function renderAppChrome(activePage, user) {
  const header = document.querySelector("#site-header");
  const sidebar = document.querySelector("#site-sidebar");
  const groupCount = getUserGroups(user).length;
  const roleLabel = isAdmin(user) ? "System Administrator" : "Student Workspace";

  const theme = localStorage.getItem("sgpm_theme") || "light";
  const themeIcon = theme === 'dark' 
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
  const themeText = theme === 'dark' ? 'Light mode' : 'Dark mode';

  if (header) {
    header.className = "app-header";
    header.innerHTML = `
      <div class="container app-header__inner">
        <a class="brand" href="dashboard.html">
          <span class="brand__mark">SG</span>
          <span>Project Manager</span>
        </a>
        <div class="header-actions">
          <span class="tag">${escapeHtml(roleLabel)}</span>
          <a class="btn-ghost" href="profile.html">My Profile</a>
        </div>
      </div>
    `;
  }

  if (!sidebar) {
    return;
  }

  const visibleLinks = APP_LINKS.filter((link) => !link.adminOnly || isAdmin(user));
  const sections = ["Overview", "Work", "Account"];
  
  let navHtml = "";
  sections.forEach(section => {
    const sectionLinks = visibleLinks.filter(l => l.section === section);
    if (sectionLinks.length > 0) {
      navHtml += `<div class="sidebar-section-label">${section}</div>`;
      sectionLinks.forEach(link => {
        navHtml += `
          <a class="sidebar-link ${link.key === activePage ? "is-active" : ""}" href="${link.href}">
            <div style="display:flex; align-items:center;">
              ${link.icon}
              <span>${link.label}</span>
            </div>
            ${link.key === "groups" ? `<span class="sidebar__badge">${groupCount}</span>` : ""}
          </a>
        `;
      });
    }
  });

  sidebar.className = "sidebar";
  sidebar.innerHTML = `
    <a href="index.html" class="sidebar-logo">
      <div class="sidebar-logo-icon">
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
          <polyline points="4,10 8,14 16,6" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <span class="sidebar-logo-text">Task<span>ly</span></span>
    </a>
    <nav class="sidebar-nav">${navHtml}</nav>
    <div class="sidebar-user">
      <div class="sidebar-user-avatar">${user.name.slice(0, 2).toUpperCase()}</div>
      <div>
        <div class="sidebar-user-name">${escapeHtml(user.name)}</div>
        <div class="sidebar-user-role">${escapeHtml(roleLabel)}</div>
      </div>
    </div>
    <button class="sidebar-link" id="theme-toggle" style="width: 100%; border: none; background: transparent; cursor: pointer; text-align: left;">
      <div style="display:flex; align-items:center;">
        ${themeIcon}
        <span>${themeText}</span>
      </div>
    </button>
    <button class="sidebar-link" id="logout-button" style="width: 100%; border: none; background: transparent; cursor: pointer; text-align: left;">
      <div style="display:flex; align-items:center;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        <span>Logout</span>
      </div>
    </button>
  `;

  sidebar.querySelector("#theme-toggle")?.addEventListener("click", () => {
    const isDark = document.body.classList.toggle("dark-theme");
    localStorage.setItem("sgpm_theme", isDark ? "dark" : "light");
    renderAppChrome(activePage, user);
  });

  sidebar.querySelector("#logout-button")?.addEventListener("click", () => {
    logoutUser();
    window.location.href = "login.html";
  });
}

function applyTheme() {
  const theme = localStorage.getItem("sgpm_theme") || "light";
  document.body.classList.toggle("dark-theme", theme === "dark");
}

function renderFlash(containerSelector = "#flash-container") {
  const container = document.querySelector(containerSelector);
  if (!container) {
    return;
  }

  const flash = consumeFlash();
  if (!flash) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = `<div class="flash" data-type="${escapeHtml(flash.type)}">${escapeHtml(flash.message)}</div>`;
}

function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = "flash";
  toast.style.cssText = `
    position: fixed; bottom: 2rem; right: 2rem; z-index: 9999;
    min-width: 300px; box-shadow: 0 10px 25px rgba(0,0,0,0.2);
    animation: popIn 0.3s ease-out;
  `;
  toast.dataset.type = type;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function createTaskCard(task, options = {}) {
  const {
    assigneeName = "Unassigned",
    assigneeRole = "",
    groupName = "",
    showGroupName = false,
    actions = "",
  } = options;

  const roleClass =
    assigneeRole === "leader"
      ? "tag--leader"
      : assigneeRole === "editor"
      ? "tag--editor"
      : assigneeRole === "member"
      ? "tag--member"
      : "";

  const priorityClass =
    task.priority === "High"
      ? "tag--high"
      : task.priority === "Low"
      ? "tag--low"
      : "tag--medium";

  const commentCount = task.comments?.length || 0;

  return `
    <article class="task-card">
      <div class="task-card__top">
        <div>
          <div class="inline-actions">
            <span class="status-pill" data-status="${escapeHtml(task.status)}">${escapeHtml(task.status)}</span>
            <span class="tag ${priorityClass}">${escapeHtml(task.priority || "Medium")}</span>
            ${commentCount > 0 ? `
              <span class="tag" style="gap: 4px;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                ${commentCount}
              </span>
            ` : ""}
            <span class="tag">${task.taskType === "reminder" ? "Reminder" : escapeHtml(task.category)}</span>
            ${showGroupName && groupName ? `<span class="tag">${escapeHtml(groupName)}</span>` : ""}
          </div>
          <h3 style="margin-top:0.9rem;">${escapeHtml(task.title)}</h3>
        </div>
        <div class="small muted">${escapeHtml(formatDate(task.deadline))}</div>
      </div>
      <p>${escapeHtml(task.description)}</p>
      <div class="task-meta">
        <div><strong>Assigned to:</strong> ${
          assigneeRole
            ? `<span class="tag ${roleClass}">${escapeHtml(assigneeName)}</span>`
            : `<span>${escapeHtml(assigneeName)}</span>`
        }</div>
        <div><strong>Progress note:</strong> ${escapeHtml(task.progressNote || "No update yet.")}</div>
      </div>
      <div class="button-row">
        ${actions}
        <button class="btn-ghost" data-action="view-discussion" data-task-id="${task.id}" type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          Discussion
        </button>
      </div>
    </article>
  `;
}

function createEmptyState(title, description) {
  return `
    <div class="empty-state">
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(description)}</p>
    </div>
  `;
}

function renderProgressMarkup(percent) {
  const riskClass = percent < 20 ? "progress__bar--risk" : "";
  return `
    <div class="progress" aria-label="Progress ${percent}%">
      <div class="progress__bar ${riskClass}" style="width:${percent}%;"></div>
    </div>
  `;
}

export {
  applyTheme,
  createEmptyState,
  createTaskCard,
  escapeHtml,
  formatDate,
  formatDateTime,
  getAvatarMarkup,
  renderAppChrome,
  renderFlash,
  renderProgressMarkup,
  renderPublicHeader,
  showToast,
};
