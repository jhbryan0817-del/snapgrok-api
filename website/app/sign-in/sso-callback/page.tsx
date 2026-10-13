"use client";

import { AuthenticateWithRedirectCallback } from "@clerk/react";
import { AuthShell } from "../../auth-shell";

export default function SignInCallbackPage() {
  return (
    <AuthShell>
      <AuthenticateWithRedirectCallback
        signInUrl="/sign-in"
        signUpUrl="/sign-up"
        continueSignUpUrl="/sign-up#/continue"
        firstFactorUrl="/sign-in#/factor-one"
        secondFactorUrl="/sign-in#/factor-two"
        resetPasswordUrl="/sign-in#/reset-password"
        verifyEmailAddressUrl="/sign-up#/verify-email-address"
        verifyPhoneNumberUrl="/sign-up#/verify-phone-number"
        signInProtectCheckUrl="/sign-in#/protect-check"
        signUpProtectCheckUrl="/sign-up#/protect-check"
        signInForceRedirectUrl="/account"
        signUpForceRedirectUrl="/account"
        signInFallbackRedirectUrl="/account"
        signUpFallbackRedirectUrl="/account"
      />
    </AuthShell>
  );
}
