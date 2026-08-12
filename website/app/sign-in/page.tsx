"use client";

import { SignIn } from "@clerk/react";
import { AuthShell } from "../auth-shell";

export default function SignInPage() {
  return (
    <AuthShell>
      <SignIn
        routing="hash"
        signUpUrl="/account?mode=sign-up"
        forceRedirectUrl="/account"
        fallbackRedirectUrl="/account"
      />
    </AuthShell>
  );
}
