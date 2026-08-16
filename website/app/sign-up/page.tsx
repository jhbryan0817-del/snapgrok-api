"use client";

import { SignUp } from "@clerk/react";
import { AuthShell } from "../auth-shell";
import { SignUpLegalNotice } from "../sign-up-legal-notice";

export default function SignUpPage() {
  return (
    <AuthShell>
      <div className="signup-flow">
        <SignUp
          routing="hash"
          signInUrl="/account?mode=sign-in"
          forceRedirectUrl="/account"
          fallbackRedirectUrl="/account"
        />
        <SignUpLegalNotice />
      </div>
    </AuthShell>
  );
}
