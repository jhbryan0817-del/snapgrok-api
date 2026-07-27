import { NextRequest, NextResponse } from "next/server";

const clerkFrontendApiOrigin = requiredClerkOrigin(
  process.env.NEXT_PUBLIC_CLERK_FRONTEND_API_URL,
);

export function proxy(request: NextRequest) {
  const nonce = createNonce();
  const contentSecurityPolicy = buildContentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);

  // Next.js reads the nonce from the request CSP and applies it to framework
  // scripts. Supplying the request header also keeps server and client
  // rendering on the same per-request policy.
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:avif|css|gif|ico|jpe?g|js|png|svg|webp|woff2?)$).*)",
  ],
};

function buildContentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${clerkFrontendApiOrigin} https://*.protect.clerk.com https://challenges.cloudflare.com${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://img.clerk.com",
    "font-src 'self' data:",
    `connect-src 'self' ${clerkFrontendApiOrigin} https://*.protect.clerk.com https://clerk-telemetry.com https://*.clerk-telemetry.com`,
    "frame-src 'self' https://*.protect.clerk.com https://challenges.cloudflare.com",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    ...(process.env.NODE_ENV === "production" ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

function createNonce(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

function requiredClerkOrigin(value: string | undefined): string {
  if (!value) throw new Error("NEXT_PUBLIC_CLERK_FRONTEND_API_URL is required.");
  let url: URL;
  try { url = new URL(value); } catch {
    throw new Error("NEXT_PUBLIC_CLERK_FRONTEND_API_URL must be an absolute URL.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("NEXT_PUBLIC_CLERK_FRONTEND_API_URL must be an HTTPS origin without a path.");
  }
  if (process.env.NODE_ENV === "production" && url.hostname !== "clerk.sneaksolve.com") {
    throw new Error(
      "NEXT_PUBLIC_CLERK_FRONTEND_API_URL must use https://clerk.sneaksolve.com in production.",
    );
  }
  return url.origin;
}
