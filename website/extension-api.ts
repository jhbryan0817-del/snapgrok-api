"use client";

const API_ORIGIN = requiredApiOrigin(process.env.NEXT_PUBLIC_API_URL);

export const ZENAIAN_EXTENSION_ID = requiredExtensionId(
  process.env.NEXT_PUBLIC_EXTENSION_ID,
);

export class ExtensionApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ExtensionApiError";
    this.status = status;
    this.code = code;
  }
}

export async function createExtensionPairing(
  token: string,
  nonce: string,
): Promise<{ pairingCode: string; expiresAt: string }> {
  return extensionRequest("/api/extension/pairings", token, {
    method: "POST",
    body: JSON.stringify({
      extensionId: ZENAIAN_EXTENSION_ID,
      nonce,
    }),
  });
}

export async function revokeExtensionSessions(
  token: string,
  signal?: AbortSignal,
): Promise<void> {
  await extensionRequest("/api/extension/sessions/revoke", token, {
    method: "POST",
    body: "{}",
    signal,
  });
}

async function extensionRequest<T>(
  path: string,
  token: string,
  init: RequestInit,
): Promise<T> {
  if (!token) {
    throw new ExtensionApiError(
      401,
      "AUTH_REQUIRED",
      "Please sign in again before connecting the extension.",
    );
  }
  const response = await fetch(`${API_ORIGIN}${path}`, {
    ...init,
    cache: "no-store",
    credentials: "omit",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new ExtensionApiError(
      response.status,
      safeErrorCode(payload?.code),
      safeErrorMessage(payload?.error, response.status),
    );
  }
  return payload as T;
}

function requiredApiOrigin(value: string | undefined): string {
  if (!value) throw new Error("NEXT_PUBLIC_API_URL is required.");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("NEXT_PUBLIC_API_URL must be an absolute URL.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("NEXT_PUBLIC_API_URL must be an HTTPS origin without a path.");
  }
  if (
    process.env.NODE_ENV === "production" &&
    url.hostname !== "snapgrok-api.onrender.com"
  ) {
    throw new Error(
      "NEXT_PUBLIC_API_URL must use https://snapgrok-api.onrender.com in production.",
    );
  }
  return url.origin;
}

function requiredExtensionId(value: string | undefined): string {
  if (!value || !/^[a-p]{32}$/.test(value)) {
    throw new Error("NEXT_PUBLIC_EXTENSION_ID must be a Chrome extension ID.");
  }
  return value;
}

function safeErrorCode(value: unknown): string {
  const code = String(value || "");
  return /^[A-Z][A-Z0-9_]{0,63}$/.test(code)
    ? code
    : "EXTENSION_REQUEST_FAILED";
}

function safeErrorMessage(value: unknown, status: number): string {
  const message = String(value || "");
  if (status < 500 && message.length > 0 && message.length <= 240) {
    return message;
  }
  return "The extension connection service is temporarily unavailable.";
}
