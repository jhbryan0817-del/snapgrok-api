"use client";

import { ClerkProvider } from "@clerk/react";

const FALLBACK_DEVELOPMENT_KEY =
  "pk_test_aW1tb3J0YWwtdHJvbGwtNDIuY2xlcmsuYWNjb3VudHMuZGV2JA";

export function SnapGrokClerkProvider({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const publishableKey =
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || FALLBACK_DEVELOPMENT_KEY;

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
