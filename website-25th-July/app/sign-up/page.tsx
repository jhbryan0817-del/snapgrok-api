"use client";

import { SignUp } from "@clerk/react";
import { AuthShell } from "../auth-shell";

export default function SignUpPage() {
  return (
    <AuthShell>
      <SignUp
        routing="hash"
        signInUrl="/sign-in"
        forceRedirectUrl="/"
        fallbackRedirectUrl="/"
      />
    </AuthShell>
  );
}
