import { bootstrapPublicPage } from "../app.js";
import { registerUser, setFlash } from "../auth.js";
import { getSocialLoginUrl } from "../api.js";

await bootstrapPublicPage();

// Wire up social login (same as login page - handles both login and signup)
['google', 'github', 'facebook'].forEach(provider => {
  const btn = document.querySelector(`#login-${provider}`);
  if (btn) {
    btn.addEventListener('click', () => {
      const submitBtn = document.querySelector('button[type="submit"]');
      const allSocialBtns = document.querySelectorAll(".btn-social");

      // Disable buttons to prevent double submission during redirect
      if (submitBtn) submitBtn.disabled = true;
      allSocialBtns.forEach(b => b.disabled = true);
      btn.classList.add('loading');

      window.location.href = getSocialLoginUrl(provider);
    });
  }
});

const form = document.querySelector("#register-form");
form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(form);
  const btn = form.querySelector('button[type="submit"]');

  const payload = {
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  };

  try {
    // Disable button during request
    btn.disabled = true;
    btn.classList.add('loading');

    await registerUser(payload);

    btn.innerHTML = `✓ Success!`;
    btn.style.background = "var(--primary)";

    setTimeout(() => {
      window.location.href = "dashboard.html";
    }, 800);
  } catch (error) {
    btn.disabled = false;
    btn.classList.remove('loading');
    setFlash(error.message, "error");
  }
});