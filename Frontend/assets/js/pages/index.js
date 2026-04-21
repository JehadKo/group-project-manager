import { bootstrapPublicPage } from "../app.js";
import { getUsers } from "../storage.js";
import { escapeHtml } from "../ui.js";

bootstrapPublicPage();

const demoAccounts = document.querySelector("#demo-accounts");
if (demoAccounts) {
  const accounts = getUsers()
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

  demoAccounts.innerHTML = accounts;
}
