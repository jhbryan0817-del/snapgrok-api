"use client";

import { AuthenticateWithRedirectCallback } from "@clerk/react";
import { AuthShell } from "../../auth-shell";

export default function SignInCallbackPage() {
  return (
    <AuthShell>
      <AuthenticateWithRedirectCallback
        signInUrl="/sign-in"
        signUpUrl="/sign-up"
        signInForceRedirectUrl="/account"
        signUpForceRedirectUrl="/account"
      />
    </AuthShell>
  );
}
