import { bootstrapPublicPage } from "../app.js";
import { loginUser, setFlash } from "../auth.js";
import { getSocialLoginUrl } from "../api.js";

await bootstrapPublicPage();

const demoAccounts = document.querySelector("#demo-accounts");
if (demoAccounts) {
  demoAccounts.innerHTML = `
    <div class="demo-item">
      <strong>New to Taskly?</strong><br />
      <span><a href="register.html" style="color: var(--teal); font-weight: 600;">Create an account</a> to sign up with email, or use the social buttons below for automatic sign-up.</span>
    </div>
  `;
}

// Wire up social login buttons (Assuming IDs match your HTML)
['google', 'github', 'facebook'].forEach(provider => {
  const btn = document.querySelector(`#login-${provider}`);
  if (btn) {
    btn.addEventListener('click', () => {
      const submitBtn = document.querySelector("#submit-btn");
      const allSocialBtns = document.querySelectorAll(".btn-social");

      if (submitBtn) submitBtn.disabled = true;
      allSocialBtns.forEach(b => b.disabled = true);
      btn.classList.add('loading');

      window.location.href = getSocialLoginUrl(provider);
    });
  }
});

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
