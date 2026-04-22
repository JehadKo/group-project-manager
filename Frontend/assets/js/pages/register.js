import { bootstrapPublicPage } from "../app.js";
import { registerUser, setFlash } from "../auth.js";
import { escapeHtml } from "../ui.js";

await bootstrapPublicPage();

const form = document.querySelector("#register-form");
const preview = document.querySelector("#profile-preview");
const urlInput = document.querySelector("#profilePicture");
const fileInput = document.querySelector("#profileUpload");
const passwordInput = document.querySelector("#password");
const passwordToggle = document.querySelector("#password-toggle");

let uploadedImage = "";

function togglePassword() {
  const icon = document.querySelector("#eye-icon");
  const isShowing = passwordInput.type === "text";
  passwordInput.type = isShowing ? "password" : "text";
  icon.innerHTML = isShowing
    ? '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'
    : '<path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>';
}

function checkStrength(val) {
  const segs = [
    document.getElementById("sb1"),
    document.getElementById("sb2"),
    document.getElementById("sb3"),
    document.getElementById("sb4"),
  ];
  const label = document.getElementById("strength-label");
  segs.forEach((s) => (s.className = "strength-bar-seg"));

  if (!val) { label.textContent = ""; return; }

  let score = 0;
  if (val.length >= 8) score++;
  if (/[A-Z]/.test(val)) score++;
  if (/[0-9]/.test(val)) score++;
  if (/[^A-Za-z0-9]/.test(val)) score++;

  const levels = ["weak", "fair", "good", "strong"];
  const labels = ["Weak", "Fair", "Good", "Strong"];
  const cls = levels[score - 1] || "weak";

  for (let i = 0; i < score; i++) segs[i].classList.add(cls);
  label.textContent = labels[score - 1] || "";
  label.style.color = score <= 1 ? "#e07070" : score === 2 ? "#e0900a" : score === 3 ? "var(--teal)" : "var(--mint)";
}

function renderPreview(src) {
  if (!preview) {
    return;
  }

  if (!src) {
    preview.classList.remove("has-image");
    preview.innerHTML = `<div class="preview-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>No image selected yet</div>`;
    return;
  }

  preview.classList.add("has-image");
  preview.innerHTML = `<img src="${escapeHtml(src)}" alt="Avatar preview"/>`;
}

urlInput?.addEventListener("input", () => {
  const val = urlInput.value.trim();
  if (val && val.startsWith("http")) renderPreview(val);
  else renderPreview(null);
});

passwordInput?.addEventListener("input", (e) => checkStrength(e.target.value));
passwordToggle?.addEventListener("click", togglePassword);

fileInput?.addEventListener("change", () => {
  const [file] = fileInput.files ?? [];
  if (!file) {
    uploadedImage = "";
    renderPreview(urlInput.value.trim());
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    uploadedImage = String(reader.result || "");
    renderPreview(uploadedImage);
  };
  reader.readAsDataURL(file);
});

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(form);
  const btn = document.querySelector("#submit-btn");

  try {
    await registerUser({
      name: formData.get("name"),
      email: formData.get("email"),
      password: formData.get("password"),
      profilePicture: uploadedImage || String(formData.get("profilePicture") || "").trim(),
    });

    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polyline points="20 6 9 17 4 12"/></svg> Account created!`;
    btn.style.background = "var(--primary)";

    setTimeout(() => {
      setFlash("Account created successfully. You are now logged in.", "success");
      window.location.href = "dashboard.html";
    }, 800);
  } catch (error) {
    setFlash(error.message, "error");
  }
});
