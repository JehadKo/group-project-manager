import { bootstrapProtectedPage } from "../app.js";
import { setFlash, updateCurrentUserProfile, deleteUserAccount, getCurrentUser } from "../auth.js";
import { getSocialLoginUrl } from "../api.js";
import { getSession } from "../storage.js";
import { getUserGroups, getUserGroupRole } from "../groups.js";
import { getGroupProgress } from "../dashboard.js";
import { escapeHtml } from "../ui.js";

const user = await bootstrapProtectedPage({ pageKey: "profile" });

if (user) {
  const form = document.querySelector("#profile-form");
  const urlInput = document.querySelector("#profile-picture");
  const uploadInput = document.querySelector("#profile-upload");
  const nameInput = document.querySelector("#profile-name");
  const discardBtn = document.querySelector("#discard-btn");
  const deleteBtn = document.querySelector("#delete-account-btn");
  const avatarClickArea = document.querySelector("#avatar-ring");
  const summaryName = document.querySelector("#summary-name");
  const summaryEmail = document.querySelector("#summary-email");
  const summaryRole = document.querySelector("#summary-role");
  const summaryGroupsCount = document.querySelector("#summary-groups-count");
  const summaryInitials = document.querySelector("#summary-initials");
  const summaryAvatarImg = document.querySelector("#summary-avatar-img");
  const groupsCountLabel = document.querySelector("#groups-count-label");
  const groupsList = document.querySelector("#profile-groups");
  const sidebarName = document.querySelector("#sidebar-name");
  const sidebarAvatar = document.querySelector("#sidebar-avatar");

  let uploadedImage = "";

  function getInitials(name) {
    return name
      .trim()
      .split(/\s+/)
      .map((part) => part[0] || "")
      .join("")
      .slice(0, 2)
      .toUpperCase() || "SG";
  }

  function getRoleLabel(role) {
    return role === "admin" ? "Administrator" : "Student";
  }

  function renderAvatar(src, name) {
    const safeName = name || user.name;
    const initials = getInitials(safeName);

    if (summaryInitials) {
      summaryInitials.textContent = initials;
      summaryInitials.style.display = src ? "none" : "";
    }

    if (summaryAvatarImg) {
      if (src) {
        summaryAvatarImg.src = src;
        summaryAvatarImg.style.display = "block";
      } else {
        summaryAvatarImg.removeAttribute("src");
        summaryAvatarImg.style.display = "none";
      }
    }

    if (!sidebarAvatar) {
      return;
    }

    if (src) {
      sidebarAvatar.innerHTML = `<img src="${escapeHtml(src)}" alt="${escapeHtml(safeName)}" />`;
      return;
    }

    sidebarAvatar.textContent = initials;
  }

  function renderGroups(groups) {
    if (!groupsList || !groupsCountLabel || !summaryGroupsCount) {
      return;
    }

    summaryGroupsCount.textContent = String(groups.length);
    groupsCountLabel.textContent = `${groups.length} group${groups.length === 1 ? "" : "s"}`;

    groupsList.innerHTML = groups.length
      ? groups
          .map((group) => {
            const progress = getGroupProgress(group.id);
            const myStats = progress?.memberMap.find((member) => member.name === user.name);
            const role = getUserGroupRole(user, group) || "member";
            const roleClass = role === "leader" ? "badge-leader" : "badge-member";
            const statsLabel = myStats ? `${myStats.tasksCompleted}/${myStats.tasksAssigned} tasks` : "No assigned tasks";

            return `
              <div class="group-pill">
                <div class="group-pill-left">
                  <div class="group-dot"></div>
                  <span class="group-pill-name">${escapeHtml(group.groupName)}</span>
                </div>
                <div style="display:flex; align-items:center; gap:0.5rem;">
                  <span class="group-badge ${roleClass}">${escapeHtml(role)}</span>
                  <span class="small muted">${escapeHtml(statsLabel)}</span>
                </div>
              </div>
            `;
          })
          .join("")
      : "<span class=\"muted\">Not in any groups yet.</span>";
  }

  function renderProfile() {
    const groups = getUserGroups(user);

    summaryName.textContent = user.name;
    summaryEmail.textContent = user.email;
    summaryRole.textContent = getRoleLabel(user.globalRole);
    sidebarName.textContent = user.name;

    document.querySelector("#profile-name").value = user.name;
    document.querySelector("#profile-email").value = user.email;
    urlInput.value = user.profilePicture || "";
    uploadInput.value = "";

    renderGroups(groups);
    renderAvatar(user.profilePicture || "", user.name);
  }

  // Handle account linking UI
  const githubLinkBtn = document.querySelector("#link-github-btn");
  if (githubLinkBtn) {
    if (user.githubUsername) {
      githubLinkBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="margin-right:8px;"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.042-1.416-4.042-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg> Linked: @${escapeHtml(user.githubUsername)}`;
      githubLinkBtn.classList.add("btn-ghost");
      githubLinkBtn.disabled = true;
    } else {
      githubLinkBtn.addEventListener("click", () => {
        const session = getSession();
        githubLinkBtn.disabled = true;
        githubLinkBtn.textContent = "Redirecting...";
        window.location.href = getSocialLoginUrl('github', session.token);
      });
    }
  }

  // Check for successful link in URL
  if (window.location.search.includes("linked=success")) {
    setFlash("GitHub account linked successfully!", "success");
    // Clean URL
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  nameInput.addEventListener("input", () => {
    const nextName = nameInput.value.trim() || "Your name";
    summaryName.textContent = nextName;
    sidebarName.textContent = nextName;
    renderAvatar(uploadedImage || urlInput.value.trim() || user.profilePicture || "", nextName);
  });

  avatarClickArea?.addEventListener("click", () => uploadInput.click());

  urlInput.addEventListener("input", () => {
    uploadedImage = "";
    renderAvatar(urlInput.value.trim(), nameInput.value.trim() || user.name);
  });

  uploadInput.addEventListener("change", () => {
    const [file] = uploadInput.files ?? [];
    if (!file) {
      uploadedImage = "";
      renderAvatar(urlInput.value.trim(), nameInput.value.trim() || user.name);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      uploadedImage = String(reader.result || "");
      renderAvatar(uploadedImage, nameInput.value.trim() || user.name);
    };
    reader.readAsDataURL(file);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const btn = form.querySelector('[type="submit"]');

    try {
      await updateCurrentUserProfile(user.id, {
        name: nameInput.value,
        profilePicture: uploadedImage || urlInput.value.trim(),
      });

      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg> Saved!`;
      btn.style.background = "var(--teal-dark)";

      setTimeout(() => {
        setFlash("Profile updated successfully.", "success");
        window.location.reload();
      }, 800);
    } catch (error) {
      setFlash(error.message, "error");
    }
  });

  discardBtn?.addEventListener("click", () => {
    if (confirm("Discard all unsaved changes?")) {
      uploadedImage = "";
      renderProfile();
      setFlash("Changes discarded.", "info");
    }
  });

  deleteBtn?.addEventListener("click", async () => {
    const confirmMsg = "Are you sure you want to delete your account? This will remove all your data from the demo.";
    if (confirm(confirmMsg)) {
      await deleteUserAccount(user.id);
      window.location.href = "index.html";
    }
  });

  renderProfile();
}
