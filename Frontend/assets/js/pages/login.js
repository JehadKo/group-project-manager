import { bootstrapPublicPage } from "../app.js";
import { loginUser, setFlash } from "../auth.js";
import { getUsers } from "../storage.js";
import { escapeHtml } from "../ui.js";

bootstrapPublicPage();

const demoAccounts = document.querySelector("#demo-accounts");
if (demoAccounts) {
  demoAccounts.innerHTML = getUsers()
    .map(
      (user) => `
        <div class="demo-item">
          <strong>${escapeHtml(user.name)}</strong><br />
          <span>${escapeHtml(user.email)}</span><br />
          <span class="small">Password: ${escapeHtml(user.password)}</span>
        </div>
      `
    )
    .join("");
}

const form = document.querySelector("#login-form");
form?.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(form);
  const btn = form.querySelector('button[type="submit"]');

  try {
    const user = loginUser({
      email: formData.get("email"),
      password: formData.get("password"),
      rememberMe: formData.get("rememberMe") === "on",
    });

    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polyline points="20 6 9 17 4 12"/></svg> Signed in!`;
    btn.style.background = "var(--teal-dark)";

    setTimeout(() => {
      setFlash(`Welcome back, ${user.name}.`, "success");
      window.location.href = user.globalRole === "admin" ? "admin.html" : "dashboard.html";
    }, 800);
  } catch (error) {
    setFlash(error.message, "error");
  }
});
