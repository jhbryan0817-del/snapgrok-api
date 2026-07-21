"use client";

import { SignUp } from "@clerk/react";
import { AuthShell } from "../auth-shell";

export default function SignUpPage() {
  return (
    <AuthShell
      eyebrow="CREATE YOUR ACCOUNT"
      title="A secure home for your SneakSolve access."
      description="Create an account on the website, then return to the extension. Your authenticated session will sync automatically."
      mode="sign-up"
    >
      <SignUp
        routing="hash"
        signInUrl="/account?mode=sign-in"
        forceRedirectUrl="/account"
        fallbackRedirectUrl="/account"
      />
    </AuthShell>
  );
}
