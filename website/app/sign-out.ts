"use client";

import {
  revokeExtensionSessions,
  ZENAIAN_EXTENSION_ID,
} from "./extension-api";

type GetSessionToken = () => Promise<string | null>;

/**
 * Clear both the server-issued extension sessions and the extension's local
 * account state before Clerk signs the website out. Failures are deliberately
 * non-blocking because Clerk remains the session authority and must still be
 * allowed to terminate the browser session.
 */
export async function clearExtensionAccessBeforeSignOut(
  getToken: GetSessionToken,
): Promise<void> {
  const token = await getToken().catch(() => null);
  if (token) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5000);
    await revokeExtensionSessions(token, controller.signal).catch(() => undefined);
    window.clearTimeout(timeout);
  }
  await notifyExtensionSignedOut();
}

async function notifyExtensionSignedOut(): Promise<void> {
  const runtime = (
    window as Window & {
      chrome?: {
        runtime?: {
          lastError?: unknown;
          sendMessage: (
            extensionId: string,
            message: { type: string },
            callback: () => void,
          ) => void;
        };
      };
    }
  ).chrome?.runtime;
  if (!runtime?.sendMessage) return;

  await new Promise<void>((resolve) => {
    const timeout = window.setTimeout(resolve, 1200);
    try {
      runtime.sendMessage(
        ZENAIAN_EXTENSION_ID,
        { type: "SNEAKSOLVE_EXTENSION_REVOKED" },
        () => {
          void runtime.lastError;
          window.clearTimeout(timeout);
          resolve();
        },
      );
    } catch {
      window.clearTimeout(timeout);
      resolve();
    }
  });
}
