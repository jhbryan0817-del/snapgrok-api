(() => {
  "use strict";

  const LISTENER_KEY = "__snapgrokV38ZoneListenerInstalled";
  const CONTROLLER_KEY = "__snapgrokV38ZoneController";
  const DIALOG_ID = "__snapgrok-v38-selector-dialog";
  const SHADOW_HOST_ID = "__snapgrok-v38-selector-shadow-host";
  const BACKDROP_STYLE_ID = "__snapgrok-v38-selector-style";

  if (globalThis[LISTENER_KEY]) return;
  globalThis[LISTENER_KEY] = true;

  // Keep the last pointer position so the custom crosshair can appear at the
  // user's current location as soon as area-selection mode starts.
  let lastPointer = {
    x: Math.max(0, Math.round(window.innerWidth / 2)),
    y: Math.max(0, Math.round(window.innerHeight / 2)),
    known: false,
  };

  window.addEventListener(
    "pointermove",
    (event) => {
      lastPointer = {
        x: clamp(event.clientX, 0, window.innerWidth),
        y: clamp(event.clientY, 0, window.innerHeight),
        known: true,
      };
    },
    true,
  );

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "SNAPGROK_STOP_ZONE_SELECTOR") {
      globalThis[CONTROLLER_KEY]?.cleanup?.();
      sendResponse({ ok: true });
      return false;
    }

    if (message?.type !== "SNAPGROK_START_ZONE_SELECTOR") return false;

    void startSelector(message.operationId)
      .then(() => sendResponse({ ok: true, visible: true }))
      .catch((error) => {
        sendResponse({
          ok: false,
          visible: false,
          error: error?.message || "The selector could not start.",
        });
      });

    // The channel stays open only for the short selector-readiness handshake.
    return true;
  });

  async function startSelector(operationId) {
    if (typeof operationId !== "string" || !operationId) {
      throw new Error("The selector operation ID was invalid.");
    }

    globalThis[CONTROLLER_KEY]?.cleanup?.();
    document.getElementById(DIALOG_ID)?.remove();
    document.getElementById(BACKDROP_STYLE_ID)?.remove();

    const rootElement = document.body || document.documentElement;
    if (!rootElement) throw new Error("The webpage is not ready for area selection.");

    const backdropStyle = document.createElement("style");
    backdropStyle.id = BACKDROP_STYLE_ID;
    backdropStyle.textContent = `
      dialog#${DIALOG_ID}::backdrop {
        background: transparent !important;
        background-color: transparent !important;
        backdrop-filter: none !important;
      }
    `;
    (document.head || document.documentElement).appendChild(backdropStyle);

    // The dialog enters Chrome's top layer. Do not attach Shadow DOM directly
    // to <dialog>: HTMLDialogElement is not a valid shadow host in Chrome.
    // A normal <div> inside the dialog is used as the shadow host instead.
    const dialog = document.createElement("dialog");
    dialog.id = DIALOG_ID;
    dialog.setAttribute("aria-label", "SneakSolve screenshot area selector");
    dialog.style.cssText = [
      "all: initial !important",
      "position: fixed !important",
      "inset: 0 !important",
      "width: 100vw !important",
      "height: 100vh !important",
      "max-width: none !important",
      "max-height: none !important",
      "margin: 0 !important",
      "padding: 0 !important",
      "border: 0 !important",
      "outline: 0 !important",
      "background: transparent !important",
      "overflow: hidden !important",
      "box-sizing: border-box !important",
      "pointer-events: auto !important",
      "user-select: none !important",
      "touch-action: none !important",
      "cursor: none !important",
    ].join(";");

    const shadowHost = document.createElement("div");
    shadowHost.id = SHADOW_HOST_ID;
    shadowHost.style.cssText = [
      "all: initial !important",
      "position: fixed !important",
      "inset: 0 !important",
      "width: 100vw !important",
      "height: 100vh !important",
      "margin: 0 !important",
      "padding: 0 !important",
      "border: 0 !important",
      "background: transparent !important",
      "box-sizing: border-box !important",
      "pointer-events: auto !important",
      "cursor: none !important",
    ].join(";");

    const shadow = shadowHost.attachShadow({ mode: "closed" });
    const surface = document.createElement("div");
    const box = document.createElement("div");
    const crosshair = document.createElement("div");

    surface.setAttribute("role", "application");
    surface.setAttribute("aria-label", "Drag to select a screenshot area");
    surface.tabIndex = -1;
    surface.style.cssText = [
      "all: initial !important",
      "position: fixed !important",
      "inset: 0 !important",
      "width: 100vw !important",
      "height: 100vh !important",
      "margin: 0 !important",
      "padding: 0 !important",
      "background: transparent !important",
      "pointer-events: auto !important",
      "user-select: none !important",
      "touch-action: none !important",
      "box-sizing: border-box !important",
      "outline: none !important",
      "cursor: none !important",
    ].join(";");

    box.style.cssText = [
      "all: initial !important",
      "position: fixed !important",
      "display: none !important",
      "border: 2px solid rgba(70, 70, 70, 0.92) !important",
      "background: transparent !important",
      "box-sizing: border-box !important",
      "pointer-events: none !important",
      "z-index: 1 !important",
    ].join(";");

    // A DOM-rendered crosshair avoids relying on Chrome to repaint the native
    // operating-system cursor immediately after the shortcut is pressed.
    crosshair.style.cssText = [
      "all: initial !important",
      "position: fixed !important",
      "left: 0 !important",
      "top: 0 !important",
      "width: 22px !important",
      "height: 22px !important",
      "margin-left: -11px !important",
      "margin-top: -11px !important",
      "pointer-events: none !important",
      "z-index: 2 !important",
      "background: linear-gradient(#ffffff, #ffffff) center / 22px 2px no-repeat, linear-gradient(#ffffff, #ffffff) center / 2px 22px no-repeat, linear-gradient(#111111, #111111) center / 24px 4px no-repeat, linear-gradient(#111111, #111111) center / 4px 24px no-repeat !important",
      "filter: drop-shadow(0 1px 1px rgba(0,0,0,0.35)) !important",
      "transform: translate3d(0,0,0) !important",
      "will-change: transform !important",
    ].join(";");

    surface.append(box, crosshair);
    shadow.appendChild(surface);
    dialog.appendChild(shadowHost);
    rootElement.appendChild(dialog);

    let startX = 0;
    let startY = 0;
    let activePointerId = null;
    let dragging = false;
    let cleaned = false;
    let inactivityTimerId = null;

    const controller = {
      cleanup: () => cleanup(false),
    };
    globalThis[CONTROLLER_KEY] = controller;

    function placeCrosshair(x, y) {
      const safeX = clamp(x, 0, window.innerWidth);
      const safeY = clamp(y, 0, window.innerHeight);
      crosshair.style.setProperty(
        "transform",
        `translate3d(${safeX}px, ${safeY}px, 0)`,
        "important",
      );
    }

    function focusSelector() {
      try {
        dialog.focus({ preventScroll: true });
      } catch {}
      try {
        surface.focus({ preventScroll: true });
      } catch {}
    }

    function onPointerDown(event) {
      if (event.button !== 0 || activePointerId !== null) return;
      event.preventDefault();
      event.stopImmediatePropagation();

      activePointerId = event.pointerId;
      dragging = true;
      startX = clamp(event.clientX, 0, window.innerWidth);
      startY = clamp(event.clientY, 0, window.innerHeight);
      placeCrosshair(startX, startY);

      surface.setPointerCapture?.(event.pointerId);
      updateBox(startX, startY, startX, startY);
    }

    function onPointerMove(event) {
      placeCrosshair(event.clientX, event.clientY);
      lastPointer = {
        x: clamp(event.clientX, 0, window.innerWidth),
        y: clamp(event.clientY, 0, window.innerHeight),
        known: true,
      };

      if (!dragging || event.pointerId !== activePointerId) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      updateBox(startX, startY, event.clientX, event.clientY);
    }

    function onPointerEnter(event) {
      placeCrosshair(event.clientX, event.clientY);
    }

    function onPointerUp(event) {
      if (!dragging || event.pointerId !== activePointerId) return;
      event.preventDefault();
      event.stopImmediatePropagation();

      const rectangle = makeRectangle(startX, startY, event.clientX, event.clientY);
      dragging = false;
      activePointerId = null;

      if (rectangle.width < 5 || rectangle.height < 5) {
        box.style.setProperty("display", "none", "important");
        return;
      }

      cleanup(false);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          void sendReliable({
            type: "SNAPGROK_ZONE_SELECTED",
            operationId,
            rectangle,
            viewport: {
              width: window.innerWidth,
              height: window.innerHeight,
            },
          });
        });
      });
    }

    function onPointerCancel(event) {
      if (event.pointerId !== activePointerId) return;
      cleanup(false);
      void sendReliable({
        type: "SNAPGROK_ZONE_ERROR",
        operationId,
        error: "The pointer selection was interrupted.",
      });
    }

    function onKeyDown(event) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      cleanup(false);
      void sendReliable({ type: "SNAPGROK_ZONE_CANCELLED", operationId });
    }

    function onContextMenu(event) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }

    function onCancel(event) {
      event.preventDefault();
      cleanup(false);
      void sendReliable({ type: "SNAPGROK_ZONE_CANCELLED", operationId });
    }

    function updateBox(x1, y1, x2, y2) {
      const rectangle = makeRectangle(x1, y1, x2, y2);
      box.style.setProperty("display", "block", "important");
      box.style.setProperty("left", `${rectangle.x}px`, "important");
      box.style.setProperty("top", `${rectangle.y}px`, "important");
      box.style.setProperty("width", `${rectangle.width}px`, "important");
      box.style.setProperty("height", `${rectangle.height}px`, "important");
    }

    function cleanup(notifyCancellation) {
      if (cleaned) return;
      cleaned = true;

      if (inactivityTimerId !== null) clearTimeout(inactivityTimerId);
      surface.removeEventListener("pointerdown", onPointerDown, true);
      surface.removeEventListener("pointermove", onPointerMove, true);
      surface.removeEventListener("pointerenter", onPointerEnter, true);
      surface.removeEventListener("pointerup", onPointerUp, true);
      surface.removeEventListener("pointercancel", onPointerCancel, true);
      surface.removeEventListener("contextmenu", onContextMenu, true);
      window.removeEventListener("keydown", onKeyDown, true);
      dialog.removeEventListener("cancel", onCancel, true);

      try {
        if (dialog.open) dialog.close();
      } catch {}
      dialog.remove();
      backdropStyle.remove();

      if (globalThis[CONTROLLER_KEY] === controller) {
        delete globalThis[CONTROLLER_KEY];
      }

      if (notifyCancellation) {
        void sendReliable({ type: "SNAPGROK_ZONE_CANCELLED", operationId });
      }
    }

    surface.addEventListener("pointerdown", onPointerDown, true);
    surface.addEventListener("pointermove", onPointerMove, true);
    surface.addEventListener("pointerenter", onPointerEnter, true);
    surface.addEventListener("pointerup", onPointerUp, true);
    surface.addEventListener("pointercancel", onPointerCancel, true);
    surface.addEventListener("contextmenu", onContextMenu, true);
    window.addEventListener("keydown", onKeyDown, true);
    dialog.addEventListener("cancel", onCancel, true);

    try {
      dialog.showModal();
    } catch (error) {
      cleanup(false);
      throw new Error(
        `Chrome could not activate the screenshot selector: ${error?.message || "unknown error"}`,
      );
    }

    placeCrosshair(lastPointer.x, lastPointer.y);
    focusSelector();

    await nextFrame();
    focusSelector();
    await nextFrame();

    const rect = dialog.getBoundingClientRect();
    const probeX = clamp(lastPointer.x, 1, Math.max(1, window.innerWidth - 1));
    const probeY = clamp(lastPointer.y, 1, Math.max(1, window.innerHeight - 1));
    const hitTarget = document.elementFromPoint(probeX, probeY);

    const selectorOwnsHitPoint =
      hitTarget === dialog ||
      hitTarget === shadowHost ||
      (hitTarget instanceof Node && dialog.contains(hitTarget));

    if (
      !dialog.open ||
      !dialog.matches(":modal") ||
      rect.width < Math.max(10, window.innerWidth - 2) ||
      rect.height < Math.max(10, window.innerHeight - 2) ||
      !selectorOwnsHitPoint
    ) {
      cleanup(false);
      throw new Error("Chrome did not place the screenshot selector in the active page layer.");
    }

    inactivityTimerId = setTimeout(() => cleanup(true), 85000);
  }

  async function sendReliable(message) {
    let lastError = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await chrome.runtime.sendMessage(message);
        if (response?.accepted) return true;
      } catch (error) {
        lastError = error;
      }

      await delay(120 * (attempt + 1));
    }

    console.error(
      `[SneakSolve V5] Selector message delivery failed: ${lastError?.message || "No acknowledgement"}`,
    );
    return false;
  }

  function makeRectangle(x1, y1, x2, y2) {
    const left = clamp(Math.min(x1, x2), 0, window.innerWidth);
    const top = clamp(Math.min(y1, y2), 0, window.innerHeight);
    const right = clamp(Math.max(x1, x2), 0, window.innerWidth);
    const bottom = clamp(Math.max(y1, y2), 0, window.innerHeight);

    return {
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    };
  }

  function nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(resolve));
  }

  function clamp(value, minimum, maximum) {
    return Math.min(Math.max(Number(value) || 0, minimum), maximum);
  }

  function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
})();
