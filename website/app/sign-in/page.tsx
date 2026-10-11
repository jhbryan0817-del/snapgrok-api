"use client";

import { AuthShell } from "../auth-shell";
import { SignInForm } from "../sign-in-form";

export default function SignInPage() {
  return (
    <AuthShell>
      <SignInForm />
    </AuthShell>
  );
}
