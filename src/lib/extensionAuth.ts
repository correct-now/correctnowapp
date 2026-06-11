/**
 * CorrectNow ↔ Chrome extension auth bridge.
 *
 * The extension's popup only knows you're logged in if the website pushes a
 * fresh Firebase ID token to it. Previously this push happened only on the
 * /auth page after a *fresh* login — so an already-logged-in user (who gets
 * redirected straight to the dashboard) never re-authenticated the extension.
 *
 * `startExtensionAuthSync()` runs globally (mounted in App.tsx) and pushes the
 * token to the extension whenever the auth state resolves to a logged-in user,
 * on ANY page, plus on a periodic refresh.
 */

import { onAuthStateChanged, type User } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";

const getChrome = (): any => {
  const c = (window as any).chrome;
  return c && c.runtime && c.runtime.sendMessage ? c : null;
};

/**
 * Resolve the installed extension's ID. The content script injects it onto the
 * page (window.__CORRECTNOW_EXTENSION_ID) and also answers a postMessage /
 * custom-event handshake. Races all three so we get it as fast as possible.
 */
export const waitForExtensionId = async (
  maxAttempts = 20,
  delayMs = 100
): Promise<string | null> => {
  const already =
    (window as any).__CORRECTNOW_EXTENSION_ID ||
    (document as any).__CORRECTNOW_EXTENSION_ID;
  if (already) return already;

  const eventPromise = new Promise<string | null>((resolve) => {
    const handler = (event: any) => resolve(event.detail?.extensionId || null);
    window.addEventListener("correctnow-extension-ready", handler, { once: true });
    setTimeout(() => {
      window.removeEventListener("correctnow-extension-ready", handler);
      resolve(null);
    }, maxAttempts * delayMs);
  });

  const pollPromise = (async () => {
    for (let i = 0; i < maxAttempts; i++) {
      const id =
        (window as any).__CORRECTNOW_EXTENSION_ID ||
        (document as any).__CORRECTNOW_EXTENSION_ID;
      if (id) return id;
      await new Promise((r) => setTimeout(r, delayMs));
    }
    return null;
  })();

  const messagePromise = new Promise<string | null>((resolve) => {
    const handler = (event: MessageEvent) => {
      if (event.data && event.data.type === "EXTENSION_ID_RESPONSE") {
        window.removeEventListener("message", handler);
        resolve(event.data.extensionId || null);
      }
    };
    window.addEventListener("message", handler);
    window.postMessage({ type: "REQUEST_EXTENSION_ID" }, "*");
    setTimeout(() => {
      window.removeEventListener("message", handler);
      resolve(null);
    }, maxAttempts * delayMs);
  });

  return Promise.race([eventPromise, pollPromise, messagePromise]);
};

/** Push the given user's fresh ID token to the extension (no-op off-Chrome). */
export const pushAuthToExtension = async (
  user: User,
  forceRefresh = false
): Promise<void> => {
  const chromeApi = getChrome();
  if (!chromeApi) return;
  try {
    const token = await user.getIdToken(forceRefresh);
    const extensionId = await waitForExtensionId();
    if (!extensionId) return;
    chromeApi.runtime.sendMessage(
      extensionId,
      {
        action: "authUpdate",
        token,
        user: {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName || "",
        },
      },
      () => {
        // Swallow "extension not responding" — it just isn't installed.
        void chromeApi.runtime.lastError;
      }
    );
  } catch (err) {
    console.warn("[extensionAuth] push failed:", (err as Error)?.message);
  }
};

const REFRESH_MS = 45 * 60 * 1000;

/**
 * Subscribe to auth state and keep the extension in sync. Returns an unsubscribe
 * function. Safe to call once at app start.
 */
export const startExtensionAuthSync = (): (() => void) => {
  const auth = getFirebaseAuth();
  if (!auth || !getChrome()) return () => {};

  let intervalId: ReturnType<typeof setInterval> | undefined;
  let lastUid: string | null = null;

  const unsubscribe = onAuthStateChanged(auth, (user) => {
    if (user) {
      // Force a fresh token the first time we see this user (the extension's
      // stored token may be stale/expired); subsequent pushes can reuse cache.
      const isNewUser = user.uid !== lastUid;
      lastUid = user.uid;
      void pushAuthToExtension(user, isNewUser);
      if (!intervalId) {
        intervalId = setInterval(() => {
          if (auth.currentUser) void pushAuthToExtension(auth.currentUser, true);
        }, REFRESH_MS);
      }
    } else {
      lastUid = null;
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = undefined;
      }
    }
  });

  return () => {
    if (intervalId) clearInterval(intervalId);
    unsubscribe();
  };
};
