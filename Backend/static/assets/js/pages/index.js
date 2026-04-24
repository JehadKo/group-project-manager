import { bootstrapPublicPage } from "../app.js";

await bootstrapPublicPage();

const demoAccounts = document.querySelector("#demo-accounts");
if (demoAccounts) {
  demoAccounts.innerHTML = `
    <div class="demo-item">
      <strong>Backend mode enabled</strong><br />
      <span>Use a real registered account or create one from the register page.</span>
    </div>
  `;
}
