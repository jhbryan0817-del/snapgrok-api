"use client";

import { ClerkProvider } from "@clerk/react";

const clerkFrontendApiOrigin = requiredFrontendApiOrigin();
const publishableKey = requiredPublishableKey(clerkFrontendApiOrigin);

export function ZenaianClerkProvider({
  children,
  nonce,
}: Readonly<{ children: React.ReactNode; nonce: string }>) {
  return (
    <ClerkProvider
      publishableKey={publishableKey}
      nonce={nonce}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      afterSignOutUrl="/"
      appearance={{
        elements: {
          // Account deletion intentionally uses a high application overlay.
          // Clerk's reverification prompt must remain above it so a server
          // AUTH_REVERIFICATION_REQUIRED response cannot look like a hung
          // submission while the verification UI is hidden underneath.
          modalBackdrop: { zIndex: 30_000 },
        },
      }}
    >
      {children}
    </ClerkProvider>
  );
}

function requiredPublishableKey(frontendApiOrigin: string): string {
  const value = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!value) {
    throw new Error("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is required. Zenaian will not fall back to a development Clerk instance.");
  }
  const match = /^pk_(live|test)_(.+)$/.exec(value);
  if (!match) {
    throw new Error("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY has an invalid format.");
  }
  if (process.env.NODE_ENV === "production" && match[1] !== "live") {
    throw new Error("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY must use the Clerk production instance in production.");
  }
  const encodedFrontendApi = match[2];
  const decodedFrontendApi = decodePublishableKeyPayload(encodedFrontendApi);
  const configuredHostname = new URL(frontendApiOrigin).hostname;
  if (decodedFrontendApi !== configuredHostname) {
    throw new Error(
      "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and NEXT_PUBLIC_CLERK_FRONTEND_API_URL must identify the same Clerk instance.",
    );
  }
  return value;
}

function requiredFrontendApiOrigin(): string {
  const value = process.env.NEXT_PUBLIC_CLERK_FRONTEND_API_URL;
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
  if (process.env.NODE_ENV === "production" && url.hostname !== "clerk.zenaian.com") {
    throw new Error(
      "NEXT_PUBLIC_CLERK_FRONTEND_API_URL must use https://clerk.zenaian.com in production.",
    );
  }
  return url.origin;
}

function decodePublishableKeyPayload(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  let decoded: string;
  try { decoded = atob(padded); } catch {
    throw new Error("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY payload is not valid base64.");
  }
  if (!decoded.endsWith("$")) {
    throw new Error("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY payload is invalid.");
  }
  return decoded.slice(0, -1);
}
