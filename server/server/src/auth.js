import { createClerkClient } from "@clerk/backend";

export function createAuthenticator({
  secretKey,
  publishableKey,
  jwtKey,
  authorizedParties,
  audience,
  timeoutMs = 10000,
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
    requireSingleHeader(incomingRequest, "authorization");
    requireSingleHeader(incomingRequest, "origin");
    const request = toFetchRequest(incomingRequest);
    const tokenMetadata = readBearerTokenMetadata(request);
    if (tokenMetadata.status === "missing") {
      throw authenticationError("AUTH_REQUIRED");
    }
    if (tokenMetadata.status !== "decoded") {
      throw authenticationError("AUTH_TOKEN_INVALID");
    }
    const nativeExtensionOrigin = authorizedNativeExtensionOrigin(
      request,
      authorizedParties,
    );

    // Clerk's Native API uses Authorization instead of Origin when it mints a
    // Chrome-extension session token. Clerk derives the token's azp claim from
    // that minting request's Origin header, so a valid native token has no azp.
    //
    // @clerk/backend rejects a missing azp whenever authorizedParties is
    // supplied. For that one documented native-token shape, bind the incoming
    // request to the exact configured chrome-extension origin and let Clerk
    // verify every cryptographic/session claim without an azp allowlist.
    const isBoundNativeToken =
      tokenMetadata.status === "decoded" &&
      !tokenMetadata.hasAuthorizedParty &&
      Boolean(nativeExtensionOrigin);

    if (
      tokenMetadata.status === "decoded" &&
      !tokenMetadata.hasAuthorizedParty &&
      !nativeExtensionOrigin
    ) {
      throw authenticationError("AUTH_TOKEN_PARTY_INVALID");
    }

    let state;
    try {
      state = await withTimeout(
        clerk.authenticateRequest(request, {
          acceptsToken: "session_token",
          authorizedParties: isBoundNativeToken ? undefined : authorizedParties,
          audience: audience?.length ? audience : undefined,
        }),
        timeoutMs,
      );
    } catch (error) {
      if (error?.code === "AUTH_SERVICE_TIMEOUT") throw error;
      throw authenticationServiceUnavailable();
    }

    if (!state.isAuthenticated) {
      const error = authenticationError(codeForClerkFailure(state.reason));
      error.authReason = safeClerkReason(state.reason);
      throw error;
    }

    const auth = state.toAuth();
    if (!auth.userId || !auth.sessionId) {
      throw authenticationError("AUTH_REQUIRED");
    }

    await requireActiveSession(clerk, auth.sessionId, auth.userId, timeoutMs);

    return {
      userId: auth.userId,
      sessionId: auth.sessionId,
      organizationId: auth.orgId || null,
    };
  };
}

function withTimeout(promise, timeoutMs) {
  let timeout;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      const error = new Error("Authentication service timed out.");
      error.status = 503;
      error.code = "AUTH_SERVICE_TIMEOUT";
      reject(error);
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeout);
  });
}

function requireSingleHeader(request, name) {
  const distinctValues = request.headersDistinct?.[name];
  const fallbackValue = request.headers?.[name];
  const values = Array.isArray(distinctValues)
    ? distinctValues
    : Array.isArray(fallbackValue)
      ? fallbackValue
      : fallbackValue == null
        ? []
        : [fallbackValue];

  if (values.length <= 1) return;

  const error = new Error(`Multiple ${name} headers are not allowed.`);
  error.status = 400;
  error.code = "AMBIGUOUS_SECURITY_HEADER";
  throw error;
}

async function requireActiveSession(clerk, sessionId, userId, timeoutMs) {
  let session;
  try {
    session = await withTimeout(clerk.sessions.getSession(sessionId), timeoutMs);
  } catch (error) {
    if (Number(error?.status) === 404) {
      throw authenticationError("AUTH_SESSION_INACTIVE");
    }
    if (error?.code === "AUTH_SERVICE_TIMEOUT") throw error;

    throw authenticationServiceUnavailable();
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
  const messages = {
    AUTH_REQUIRED: "Authentication required.",
    AUTH_SESSION_INACTIVE: "Your session is no longer active. Sign in again.",
    AUTH_TOKEN_EXPIRED: "Your session token expired. Sign in again.",
    AUTH_TOKEN_INVALID: "Your session token could not be verified.",
    AUTH_TOKEN_PARTY_INVALID:
      "The session token is not authorized for this application.",
  };
  const error = new Error(messages[code] || messages.AUTH_REQUIRED);
  error.status = 401;
  error.code = code;
  return error;
}

function authenticationServiceUnavailable() {
  const unavailable = new Error("Authentication service is temporarily unavailable.");
  unavailable.status = 503;
  unavailable.code = "AUTH_SERVICE_UNAVAILABLE";
  return unavailable;
}

function readBearerTokenMetadata(request) {
  const authorization = String(request.headers.get("authorization") || "");
  if (authorization.length > 8192) {
    return { status: "oversized", hasAuthorizedParty: false };
  }
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);
  if (!match) return { status: "missing", hasAuthorizedParty: false };

  const parts = match[1].split(".");
  if (parts.length !== 3) {
    return { status: "malformed", hasAuthorizedParty: false };
  }

  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    );
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return { status: "malformed", hasAuthorizedParty: false };
    }
    return {
      status: "decoded",
      hasAuthorizedParty: Object.hasOwn(payload, "azp"),
    };
  } catch {
    return { status: "malformed", hasAuthorizedParty: false };
  }
}

function authorizedNativeExtensionOrigin(request, authorizedParties) {
  const origin = String(request.headers.get("origin") || "")
    .trim()
    .replace(/\/$/, "");
  if (!/^chrome-extension:\/\/[a-p]{32}$/.test(origin)) return "";
  return authorizedParties.includes(origin) ? origin : "";
}

function codeForClerkFailure(reason) {
  const normalized = safeClerkReason(reason);
  if (normalized === "token-invalid-authorized-parties") {
    return "AUTH_TOKEN_PARTY_INVALID";
  }
  if (
    normalized === "token-expired" ||
    normalized.startsWith("session-token-expired")
  ) {
    return "AUTH_TOKEN_EXPIRED";
  }
  if (
    normalized &&
    normalized !== "session-token-missing" &&
    normalized !== "session-token-and-uat-missing"
  ) {
    return "AUTH_TOKEN_INVALID";
  }
  return "AUTH_REQUIRED";
}

function safeClerkReason(value) {
  const reason = String(value || "").toLowerCase();
  return /^[a-z0-9-]{1,100}$/.test(reason) ? reason : "";
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
  const url = new URL(request.url || "/", "https://api.zenaian.invalid");

  return new Request(url, {
    method: request.method || "GET",
    headers,
  });
}

function normalizePem(value) {
  return String(value || "").replace(/\\n/g, "\n").trim();
}
