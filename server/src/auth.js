import { createClerkClient } from "@clerk/backend";

export function createAuthenticator({
  secretKey,
  publishableKey,
  jwtKey,
  authorizedParties,
  clerkClient,
}) {
  if (!secretKey) {
    throw new Error("CLERK_SECRET_KEY is required for active-session enforcement.");
  }
  if (!publishableKey) {
    throw new Error("CLERK_PUBLISHABLE_KEY is required.");
  }
  if (!Array.isArray(authorizedParties) || authorizedParties.length === 0) {
    throw new Error("CLERK_AUTHORIZED_PARTIES must contain at least one origin.");
  }

  const clerk = clerkClient || createClerkClient({
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
      throw authenticationError("AUTH_REQUIRED");
    }

    await requireActiveSession(clerk, auth.sessionId, auth.userId);

    return {
      userId: auth.userId,
      sessionId: auth.sessionId,
      organizationId: auth.orgId || null,
    };
  };
}

async function requireActiveSession(clerk, sessionId, userId) {
  let session;
  try {
    session = await clerk.sessions.getSession(sessionId);
  } catch (error) {
    if (Number(error?.status) === 404) {
      throw authenticationError("AUTH_SESSION_INACTIVE");
    }

    const unavailable = new Error("Authentication service is temporarily unavailable.");
    unavailable.status = 503;
    unavailable.code = "AUTH_SERVICE_UNAVAILABLE";
    throw unavailable;
  }

  if (
    !session ||
    session.id !== sessionId ||
    session.userId !== userId ||
    session.status !== "active"
  ) {
    throw authenticationError("AUTH_SESSION_INACTIVE");
  }
}

function authenticationError(code) {
  const error = new Error(
    code === "AUTH_SESSION_INACTIVE"
      ? "Your session is no longer active. Sign in again."
      : "Authentication required.",
  );
  error.status = 401;
  error.code = code;
  return error;
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

  // Authentication only needs the method, path, and headers. A fixed base URL
  // prevents untrusted Host/X-Forwarded-Host values from influencing parsing.
  const url = new URL(request.url || "/", "https://api.sneaksolve.invalid");

  return new Request(url, {
    method: request.method || "GET",
    headers,
  });
}

function normalizePem(value) {
  return String(value || "").replace(/\\n/g, "\n").trim();
}
