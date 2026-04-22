import { bootstrapPublicPage } from "../app.js";
import { loginUser, setFlash } from "../auth.js";

await bootstrapPublicPage();

const demoAccounts = document.querySelector("#demo-accounts");
if (demoAccounts) {
  demoAccounts.innerHTML = `
    <div class="demo-item">
      <strong>Live backend mode</strong><br />
      <span>Sign in with an existing backend account, or register a new one first.</span>
    </div>
  `;
}

const form = document.querySelector("#login-form");
form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(form);
  const btn = form.querySelector('button[type="submit"]');

  try {
    const user = await loginUser({
      email: formData.get("email"),
      password: formData.get("password"),
      rememberMe: formData.get("rememberMe") === "on",
    });

    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polyline points="20 6 9 17 4 12"/></svg> Signed in!`;
    btn.style.background = "var(--primary)";

    setTimeout(() => {
      setFlash(`Welcome back, ${user.name}.`, "success");
      window.location.href = user.globalRole === "admin" ? "admin.html" : "dashboard.html";
    }, 800);
  } catch (error) {
    setFlash(error.message, "error");
  }
});
