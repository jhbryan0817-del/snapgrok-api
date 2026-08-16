"use client";

const API_ORIGIN = requiredApiOrigin(process.env.NEXT_PUBLIC_API_URL);

export type DeleteAccountReceipt = {
  requestId: string;
  state: string;
};

export type DeleteAccountConfirmation = {
  confirmImmediateLoss: true;
  confirmRenewalCancellation: true;
  confirmLegalRetention: true;
  confirmIrreversible: true;
  confirmText: "DELETE";
};

export class PrivacyApiError extends Error {
  status: number;
  code: string;
  requestId: string | null;
  reverificationAfterMinutes: number | null;

  constructor(
    status: number,
    code: string,
    message: string,
    requestId: string | null = null,
    reverificationAfterMinutes: number | null = null,
  ) {
    super(message);
    this.name = "PrivacyApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.reverificationAfterMinutes = reverificationAfterMinutes;
  }
}

export async function getPrivacyExport(token: string): Promise<Record<string, unknown>> {
  const payload = await privacyRequest<
    ({ ok: true; export: Record<string, unknown> } & Record<string, unknown>) |
    Record<string, unknown>
  >("/api/privacy/export", token);
  const exportValue = "export" in payload ? payload.export : payload;
  if (!exportValue || typeof exportValue !== "object" || Array.isArray(exportValue)) {
    throw new PrivacyApiError(
      502,
      "PRIVACY_EXPORT_INVALID",
      "The privacy service returned an invalid export.",
    );
  }
  return exportValue as Record<string, unknown>;
}

export async function deletePrivacyAccount(
  token: string,
  confirmation: DeleteAccountConfirmation,
): Promise<DeleteAccountReceipt> {
  const payload = await privacyRequest<{
    ok: true;
    requestId: string;
    state: string;
  }>("/api/privacy/delete-account", token, {
    method: "POST",
    body: JSON.stringify(confirmation),
  });
  if (!payload.requestId || !payload.state) {
    throw new PrivacyApiError(
      502,
      "PRIVACY_RECEIPT_INVALID",
      "The privacy service did not return a valid deletion receipt.",
    );
  }
  return { requestId: payload.requestId, state: payload.state };
}

async function privacyRequest<T>(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<T> {
  if (!token) {
    throw new PrivacyApiError(
      401,
      "AUTH_REQUIRED",
      "Please sign in again before using privacy controls.",
    );
  }

  const response = await fetch(`${API_ORIGIN}${path}`, {
    ...init,
    cache: "no-store",
    credentials: "omit",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || payload.ok === false) {
    const requestId = safeRequestId(payload?.requestId) ||
      safeRequestId(response.headers.get("x-request-id"));
    throw new PrivacyApiError(
      response.status,
      safeErrorCode(payload?.code),
      safeErrorMessage(payload?.error, response.status),
      requestId,
      safeReverificationAfterMinutes(payload?.reverification?.afterMinutes),
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

function safeErrorCode(value: unknown): string {
  const code = String(value || "");
  return /^[A-Z][A-Z0-9_]{0,63}$/.test(code)
    ? code
    : "PRIVACY_REQUEST_FAILED";
}

function safeReverificationAfterMinutes(value: unknown): number | null {
  const minutes = Number(value);
  return Number.isInteger(minutes) && minutes >= 1 && minutes <= 60
    ? minutes
    : null;
}

function safeRequestId(value: unknown): string | null {
  const requestId = String(value || "").trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    requestId,
  )
    ? requestId
    : null;
}

function safeErrorMessage(value: unknown, status: number): string {
  const message = String(value || "");
  if (status < 500 && message.length > 0 && message.length <= 240) {
    return message;
  }
  return "The privacy service is temporarily unavailable. Please try again.";
}
