import { createClerkClient } from "@clerk/backend";

export function createAuthenticator({
  secretKey,
  publishableKey,
  jwtKey,
  authorizedParties,
}) {
  if (!secretKey && !jwtKey) {
    throw new Error("CLERK_SECRET_KEY or CLERK_JWT_KEY is required.");
  }
  if (!publishableKey) {
    throw new Error("CLERK_PUBLISHABLE_KEY is required.");
  }
  if (!Array.isArray(authorizedParties) || authorizedParties.length === 0) {
    throw new Error("CLERK_AUTHORIZED_PARTIES must contain at least one origin.");
  }

  const clerk = createClerkClient({
    secretKey: secretKey || undefined,
    publishableKey,
    jwtKey: normalizePem(jwtKey) || undefined,
  });

  return async function authenticate(incomingRequest) {
    const request = toFetchRequest(incomingRequest);
    const state = await clerk.authenticateRequest(request, {
      acceptsToken: "session_token",
      authorizedParties,
    });

    if (!state.isAuthenticated) {
      const error = new Error("Authentication required.");
      error.status = 401;
      error.code = "AUTH_REQUIRED";
      throw error;
    }

    const auth = state.toAuth();
    if (!auth.userId || !auth.sessionId) {
      const error = new Error("Authentication required.");
      error.status = 401;
      error.code = "AUTH_REQUIRED";
      throw error;
    }

    return {
      userId: auth.userId,
      sessionId: auth.sessionId,
      organizationId: auth.orgId || null,
    };
  };
}

function toFetchRequest(request) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers || {})) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    } else if (value != null) {
      headers.set(name, String(value));
    }
  }

  const forwardedProto = firstHeaderValue(headers.get("x-forwarded-proto"));
  const forwardedHost = firstHeaderValue(headers.get("x-forwarded-host"));
  const protocol = forwardedProto || "https";
  const host = forwardedHost || headers.get("host") || "localhost";
  const url = new URL(request.url || "/", `${protocol}://${host}`);

  return new Request(url, {
    method: request.method || "GET",
    headers,
  });
}

function firstHeaderValue(value) {
  return String(value || "")
    .split(",")[0]
    .trim();
}

function normalizePem(value) {
  return String(value || "").replace(/\\n/g, "\n").trim();
}
