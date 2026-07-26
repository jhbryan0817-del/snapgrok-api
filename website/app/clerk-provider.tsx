"use client";

import { ClerkProvider } from "@clerk/react";

const publishableKey = requiredPublishableKey();

export function SneakSolveClerkProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider
      publishableKey={publishableKey}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      afterSignOutUrl="/"
    >
      {children}
    </ClerkProvider>
  );
}

function requiredPublishableKey(): string {
  const value = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!value) {
    throw new Error("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is required. SneakSolve will not fall back to a development Clerk instance.");
  }
  if (process.env.NODE_ENV === "production" && !value.startsWith("pk_live_")) {
    throw new Error("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY must use the Clerk production instance in production.");
  }
  return value;
}
