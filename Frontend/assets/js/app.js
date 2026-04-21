import { ensureAuthenticated, ensureRole } from "./auth.js";
import { seedAppData } from "./storage.js";
import { renderAppChrome, renderFlash, renderPublicHeader, applyTheme } from "./ui.js";

function bootstrapPublicPage() {
  seedAppData();
  applyTheme();
  renderPublicHeader();
  renderFlash();
}

function bootstrapProtectedPage({ pageKey, roles = [] } = {}) {
  seedAppData();
  applyTheme();
  const user = ensureAuthenticated();
  if (!user) {
    return null;
  }

  if (!ensureRole(user, roles)) {
    return null;
  }

  renderAppChrome(pageKey, user);
  renderFlash();
  return user;
}

export {
  bootstrapProtectedPage,
  bootstrapPublicPage,
};
