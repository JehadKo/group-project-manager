import { ensureRole, logoutUser, setFlash, syncSessionState } from "./auth.js";
import { getSession, seedAppData } from "./storage.js";
import { applyTheme, renderAppChrome, renderFlash, renderPublicHeader } from "./ui.js";

async function bootstrapPublicPage() {
  seedAppData();
  applyTheme();

  const session = getSession();
  if (session?.token) {
    try {
      await syncSessionState();
    } catch (error) {
      await logoutUser({ skipApi: true });
    }
  }

  renderPublicHeader();
  renderFlash();
}

async function bootstrapProtectedPage({ pageKey, roles = [] } = {}) {
  seedAppData();
  applyTheme();

  const session = getSession();
  if (!session?.token) {
    setFlash("Please log in to continue.", "info");
    window.location.href = "login.html";
    return null;
  }

  try {
    const currentUser = await syncSessionState();
    if (!currentUser) {
      throw new Error("Your session has expired.");
    }

    if (!ensureRole(currentUser, roles)) {
      return null;
    }

    renderAppChrome(pageKey, currentUser);
    renderFlash();
    return currentUser;
  } catch (error) {
    await logoutUser({ skipApi: true });
    setFlash(error.message || "Please log in again.", "error");
    window.location.href = "login.html";
    return null;
  }
}

export {
  bootstrapProtectedPage,
  bootstrapPublicPage,
};
