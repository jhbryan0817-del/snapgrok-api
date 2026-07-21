"use client";

import { SignIn } from "@clerk/react";
import { AuthShell } from "../auth-shell";

export default function SignInPage() {
  return (
    <AuthShell
      eyebrow="WELCOME BACK"
      title="Sign in once. Keep your workflow moving."
      description="Your SneakSolve account connects the website, Chrome extension, and secure analysis API."
      mode="sign-in"
    >
      <SignIn
        routing="hash"
        signUpUrl="/account?mode=sign-up"
        forceRedirectUrl="/account"
        fallbackRedirectUrl="/account"
      />
    </AuthShell>
  );
}
