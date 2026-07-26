"use client";

import { SignUp } from "@clerk/react";
import { AuthShell } from "../auth-shell";

export default function SignUpPage() {
  return (
    <AuthShell>
      <SignUp
        routing="hash"
        signInUrl="/account?mode=sign-in"
        forceRedirectUrl="/account"
        fallbackRedirectUrl="/account"
      />
    </AuthShell>
  );
}
