"use client";

import { useClerk, useUser } from "@clerk/react";
import { useEffect, useRef, useState } from "react";

function displayName(user: ReturnType<typeof useUser>["user"]) {
  if (!user) return "Account";
  return (
    user.fullName ||
    user.firstName ||
    user.username ||
    user.primaryEmailAddress?.emailAddress.split("@")[0] ||
    "Account"
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "S";
}

export function AccountNav() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut } = useClerk();
  const [isOpen, setIsOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function closeOnOutsideClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  if (!isLoaded) {
    return <span className="account-nav-loading" aria-label="Loading account" />;
  }

  if (!isSignedIn || !user) {
    return (
      <span className="account-entry-actions">
        <a className="nav-login" href="/account?mode=sign-in">Log in</a>
        <a className="nav-signup" href="/account?mode=sign-up">Get Started</a>
      </span>
    );
  }

  const name = displayName(user);
  const email = user.primaryEmailAddress?.emailAddress || "SneakSolve account";

  async function handleSignOut() {
    setIsSigningOut(true);
    try {
      await signOut({ redirectUrl: "/" });
    } finally {
      setIsSigningOut(false);
      setIsOpen(false);
    }
  }

  return (
    <div className="account-menu" ref={rootRef}>
      <button
        className="account-menu-trigger"
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span className="account-menu-name">{name}</span>
        <span className="account-avatar" aria-hidden="true">
          {user.hasImage ? <img src={user.imageUrl} alt="" /> : initials(name)}
        </span>
      </button>

      {isOpen ? (
        <div className="account-popover" role="menu">
          <div className="account-popover-profile">
            <span className="account-avatar account-avatar-large" aria-hidden="true">
              {user.hasImage ? <img src={user.imageUrl} alt="" /> : initials(name)}
            </span>
            <div><strong>{name}</strong><span>{email}</span></div>
          </div>
          <a className="account-popover-link" href="/account" role="menuitem">
            <span aria-hidden="true">&#9786;</span>Manage account
          </a>
          <button
            className="account-popover-link account-signout"
            type="button"
            role="menuitem"
            disabled={isSigningOut}
            onClick={handleSignOut}
          >
            <span aria-hidden="true">&#8594;</span>
            {isSigningOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
