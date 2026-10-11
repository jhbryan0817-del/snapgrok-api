"use client";

import { SignIn, useClerk, useSession, useSignIn, useUser } from "@clerk/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";

function verificationRoute(status: string | null) {
  switch (status) {
    case "needs_second_factor": return "factor-two";
    case "needs_client_trust": return "client-trust";
    case "needs_new_password": return "reset-password";
    case "needs_protect_check": return "protect-check";
    default: return "factor-one";
  }
}

function subscribeToHashChange(callback: () => void) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}

export function SignInForm() {
  const { signIn, errors, fetchStatus } = useSignIn();
  const { isLoaded, isSignedIn } = useUser();
  const { session } = useSession();
  const clerk = useClerk();
  const router = useRouter();
  const [emailAddress, setEmailAddress] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [alternativeSignIn, setAlternativeSignIn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const emailInput = useRef<HTMLInputElement>(null);
  const hash = useSyncExternalStore(
    subscribeToHashChange,
    () => window.location.hash,
    () => "",
  );
  const busy = !isLoaded || submitting || fetchStatus === "fetching";

  useEffect(() => {
    if (isSignedIn && !session?.currentTask) router.replace("/account");
  }, [isSignedIn, router, session?.currentTask]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setSubmitting(true);
    setErrorMessage("");
    try {
      const { error } = await signIn.password({ emailAddress: emailAddress.trim(), password });
      if (error) {
        setErrorMessage("Unable to sign in. Check your email and password and try again.");
        return;
      }
      // Never retain a submitted password during verification or recovery.
      setPassword("");
      if (signIn.status === "complete") {
        const { error: activationError } = await signIn.finalize({
          navigate: async ({ session, decorateUrl }) => {
            if (session?.currentTask) {
              await clerk.redirectToTasks({ redirectUrl: "/account" });
              return;
            }
            const destination = decorateUrl("/account");
            if (destination.startsWith("http")) window.location.assign(destination);
            else router.replace(destination);
          },
        });
        if (activationError) setErrorMessage("Unable to finish signing in. Please try again.");
      } else {
        // Clerk resumes the same attempt for MFA, device trust, or other required checks.
        window.location.hash = `/${verificationRoute(signIn.status)}`;
        setAlternativeSignIn(true);
      }
    } catch {
      setErrorMessage("Unable to sign in right now. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleForgotPassword() {
    if (busy) return;
    setPassword("");
    if (!emailInput.current?.reportValidity()) {
      setErrorMessage("Enter your email address to reset your password.");
      emailInput.current?.focus();
      return;
    }
    setSubmitting(true);
    setErrorMessage("");
    try {
      const { error } = await signIn.create({ identifier: emailAddress.trim() });
      if (error) {
        setErrorMessage("Unable to start password recovery. Please check your email and try again.");
        return;
      }
      // Use Clerk's native reset intent after initializing the user's sign-in attempt.
      window.location.hash = signIn.status === "needs_protect_check"
        ? "/protect-check"
        : "/factor-one?__clerk_reset_password=true";
      setAlternativeSignIn(true);
    } catch {
      setErrorMessage("Unable to start password recovery. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogleSignIn() {
    if (busy) return;
    setSubmitting(true);
    setErrorMessage("");
    try {
      const { error } = await signIn.sso({
        strategy: "oauth_google",
        redirectUrl: "/account",
        redirectCallbackUrl: "/sign-in/sso-callback",
      });
      if (error) setErrorMessage("Unable to sign in with Google. Please try again.");
    } catch {
      setErrorMessage("Unable to sign in with Google. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // Keep Clerk's existing recovery, verification, and alternate-method routes available.
  const clerkRoute = hash.startsWith("#/") && hash !== "#/";
  if (alternativeSignIn || clerkRoute) {
    return (
      <div className="sign-in-clerk-flow">
        <SignIn
          routing="hash"
          signUpUrl="/account?mode=sign-up"
          forceRedirectUrl="/account"
          fallbackRedirectUrl="/account"
          initialValues={{ emailAddress }}
        />
        <button className="sign-in-back-link" type="button" disabled={busy} onClick={() => {
          signIn.reset();
          window.location.hash = "";
          setAlternativeSignIn(false);
          setErrorMessage("");
        }}>Back to email and password</button>
      </div>
    );
  }

  const fieldError = errors.fields.identifier || errors.fields.password;
  const message = fieldError?.longMessage || fieldError?.message || errorMessage;

  return (
    <div className="sign-in-card">
      <header className="sign-in-card-heading">
        <h1>Sign in to Zenaian</h1>
        <p>Welcome back! Please sign in to continue</p>
      </header>
      <button className="sign-in-google" type="button" disabled={busy} onClick={handleGoogleSignIn}>
        <span className="sign-in-google-icon" aria-hidden="true" />
        Continue with Google
      </button>
      <div className="sign-in-divider"><span>or</span></div>
      <form className="sign-in-fields" onSubmit={handleSubmit}>
        <label htmlFor="sign-in-email">Email address</label>
        <input
          ref={emailInput} id="sign-in-email" name="email" type="email" autoComplete="username"
          placeholder="Enter your email address"
          required value={emailAddress} onChange={(event) => setEmailAddress(event.target.value)}
          aria-invalid={Boolean(errors.fields.identifier)} aria-describedby={message ? "sign-in-error" : undefined}
        />
        <div className="sign-in-password-label">
          <label htmlFor="sign-in-password">Password</label>
          <button type="button" disabled={busy} onClick={handleForgotPassword}>Forgot password?</button>
        </div>
        <div className="sign-in-password-input">
          <input
            id="sign-in-password" name="password" type={showPassword ? "text" : "password"}
            autoComplete="current-password" required value={password}
            placeholder="Enter your password"
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={Boolean(errors.fields.password)} aria-describedby={message ? "sign-in-error" : undefined}
          />
          <button type="button" aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword} onClick={() => setShowPassword((shown) => !shown)}>
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
        {message ? <p id="sign-in-error" className="sign-in-error" role="alert">{message}</p> : null}
        <button className="sign-in-submit" type="submit" disabled={busy}>
          {submitting ? "Signing in…" : "Continue"}
        </button>
      </form>
      <button className="sign-in-alternative" type="button" disabled={busy}
        onClick={() => { setPassword(""); setAlternativeSignIn(true); }}>
        Use another sign-in method
      </button>
      <p className="sign-in-card-footer">
        Don’t have an account? <Link href="/account?mode=sign-up">Sign up</Link>
      </p>
    </div>
  );
}
