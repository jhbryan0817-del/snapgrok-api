"use client";

import { useAuth, useClerk, useUser } from "@clerk/react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  revokeExtensionSessions,
  SNEAKSOLVE_EXTENSION_ID,
} from "./extension-api";

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
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "S"
  );
}

type PopoverPosition = { top: number; left: number };

export function AccountNav() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { getToken } = useAuth();
  const { signOut } = useClerk();
  const [isOpen, setIsOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState<PopoverPosition>({
    top: 0,
    left: 0,
  });
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function updatePopoverPosition() {
      const trigger = triggerRef.current;
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const viewportPadding = 15;
      const popoverWidth = Math.min(292, window.innerWidth - viewportPadding * 2);
      const left = Math.max(
        viewportPadding,
        Math.min(rect.right - popoverWidth, window.innerWidth - popoverWidth - viewportPadding),
      );

      const popoverHeight = popoverRef.current?.offsetHeight || 220;
      const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
      const top =
        spaceBelow >= popoverHeight + 11
          ? rect.bottom + 11
          : Math.max(viewportPadding, rect.top - popoverHeight - 11);

      setPopoverPosition({ top, left });
    }

    function closeOnOutsideClick(event: MouseEvent) {
      const target = event.target as Node;
      const clickedTrigger = rootRef.current?.contains(target);
      const clickedPopover = popoverRef.current?.contains(target);
      if (!clickedTrigger && !clickedPopover) setIsOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    }

    updatePopoverPosition();
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", updatePopoverPosition);
    window.addEventListener("scroll", updatePopoverPosition, true);

    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", updatePopoverPosition);
      window.removeEventListener("scroll", updatePopoverPosition, true);
    };
  }, [isOpen]);

  if (!isLoaded) {
    return <span className="account-nav-loading" aria-label="Loading account" />;
  }

  if (!isSignedIn || !user) {
    return (
      <span className="account-entry-actions">
        <a className="nav-login" href="/account?mode=sign-in">
          Log in
        </a>
        <a className="nav-signup" href="/account?mode=sign-up">
          Sign up
        </a>
      </span>
    );
  }

  const name = displayName(user);
  const email = user.primaryEmailAddress?.emailAddress || "SneakSolve account";

  async function handleSignOut() {
    setIsSigningOut(true);
    try {
      const token = await getToken().catch(() => null);
      if (token) {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 5000);
        await revokeExtensionSessions(token, controller.signal).catch(() => undefined);
        window.clearTimeout(timeout);
      }
      await notifyExtensionSignedOut();
      await signOut({ redirectUrl: "/" });
    } finally {
      setIsSigningOut(false);
      setIsOpen(false);
    }
  }

  const popover = isOpen ? (
    <div
      className="account-popover account-popover-portal"
      id="account-profile-menu"
      ref={popoverRef}
      role="menu"
      style={{
        top: popoverPosition.top,
        left: popoverPosition.left,
        visibility: popoverPosition.top > 0 ? "visible" : "hidden",
      }}
    >
      <div className="account-popover-profile">
        <span className="account-avatar account-avatar-large" aria-hidden="true">
          {user.hasImage ? <img src={user.imageUrl} alt="" /> : initials(name)}
        </span>
        <div>
          <strong>{name}</strong>
          <span>{email}</span>
        </div>
      </div>
      <a
        className="account-popover-link"
        href="/account"
        role="menuitem"
        onClick={() => setIsOpen(false)}
      >
        <span aria-hidden="true">&#9786;</span>
        Manage account
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
  ) : null;

  return (
    <div className="account-menu" ref={rootRef}>
      <button
        className="account-menu-trigger"
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-controls="account-profile-menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span className="account-menu-name">{name}</span>
        <span className="account-avatar" aria-hidden="true">
          {user.hasImage ? <img src={user.imageUrl} alt="" /> : initials(name)}
        </span>
      </button>
      {popover && typeof document !== "undefined" ? createPortal(popover, document.body) : null}
    </div>
  );
}

async function notifyExtensionSignedOut(): Promise<void> {
  const runtime = (
    window as Window & {
      chrome?: {
        runtime?: {
          lastError?: unknown;
          sendMessage: (
            extensionId: string,
            message: { type: string },
            callback: () => void,
          ) => void;
        };
      };
    }
  ).chrome?.runtime;
  if (!runtime?.sendMessage) return;
  await new Promise<void>((resolve) => {
    const timeout = window.setTimeout(resolve, 1200);
    try {
      runtime.sendMessage(
        SNEAKSOLVE_EXTENSION_ID,
        { type: "SNEAKSOLVE_EXTENSION_REVOKED" },
        () => {
          void runtime.lastError;
          window.clearTimeout(timeout);
          resolve();
        },
      );
    } catch {
      window.clearTimeout(timeout);
      resolve();
    }
  });
}
