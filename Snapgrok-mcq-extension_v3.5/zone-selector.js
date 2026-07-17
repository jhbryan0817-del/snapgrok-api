(() => {
  "use strict";

  const LISTENER_KEY = "__snapgrokV35ZoneListenerInstalled";
  const CONTROLLER_KEY = "__snapgrokV35ZoneController";

  if (globalThis[LISTENER_KEY]) return;
  globalThis[LISTENER_KEY] = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "SNAPGROK_START_ZONE_SELECTOR") return false;

    try {
      startSelector(message.operationId);
      sendResponse({ ok: true });
    } catch (error) {
      sendResponse({ ok: false, error: error?.message || "The selector could not start." });
    }

    return false;
  });

  function startSelector(operationId) {
    if (typeof operationId !== "string" || !operationId) {
      throw new Error("The selector operation ID was invalid.");
    }

    globalThis[CONTROLLER_KEY]?.cleanup?.();

    const rootElement = document.documentElement || document.body;
    if (!rootElement) throw new Error("The webpage is not ready for area selection.");

    const previousHtmlCursor = captureInlineCursor(document.documentElement);
    const previousBodyCursor = document.body ? captureInlineCursor(document.body) : null;

    const host = document.createElement("div");
    host.id = "__snapgrok-v35-selector-host";
    host.tabIndex = -1;
    setImportant(host, "position", "fixed");
    setImportant(host, "inset", "0");
    setImportant(host, "width", "100vw");
    setImportant(host, "height", "100vh");
    setImportant(host, "margin", "0");
    setImportant(host, "padding", "0");
    setImportant(host, "border", "0");
    setImportant(host, "outline", "none");
    setImportant(host, "background", "transparent");
    setImportant(host, "cursor", "crosshair");
    setImportant(host, "z-index", "2147483647");
    setImportant(host, "pointer-events", "auto");
    setImportant(host, "user-select", "none");
    setImportant(host, "touch-action", "none");

    const shadow = host.attachShadow({ mode: "closed" });
    const surface = document.createElement("div");
    const box = document.createElement("div");

    surface.setAttribute("aria-label", "SnapGrok screenshot area selector");
    surface.setAttribute("role", "application");
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
      "cursor: crosshair !important",
      "pointer-events: auto !important",
      "user-select: none !important",
      "touch-action: none !important",
      "box-sizing: border-box !important",
      "outline: none !important",
    ].join(";");

    box.style.cssText = [
      "all: initial !important",
      "position: fixed !important",
      "display: none !important",
      "border: 2px solid rgba(70, 70, 70, 0.92) !important",
      "background: transparent !important",
      "box-sizing: border-box !important",
      "pointer-events: none !important",
    ].join(";");

    surface.appendChild(box);
    shadow.appendChild(surface);
    rootElement.appendChild(host);

    setImportant(document.documentElement, "cursor", "crosshair");
    if (document.body) {
      setImportant(document.body, "cursor", "crosshair");
    }

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

    function focusSelector() {
      try {
        window.focus();
      } catch {}
      try {
        host.focus({ preventScroll: true });
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

      surface.setPointerCapture?.(event.pointerId);
      updateBox(startX, startY, startX, startY);
    }

    function onPointerMove(event) {
      if (!dragging || event.pointerId !== activePointerId) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      updateBox(startX, startY, event.clientX, event.clientY);
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

    function onVisibilityChange() {
      if (!document.hidden) {
        requestAnimationFrame(() => focusSelector());
      }
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
      surface.removeEventListener("pointerup", onPointerUp, true);
      surface.removeEventListener("pointercancel", onPointerCancel, true);
      surface.removeEventListener("contextmenu", onContextMenu, true);
      window.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("visibilitychange", onVisibilityChange, true);
      host.remove();

      restoreInlineCursor(document.documentElement, previousHtmlCursor);
      if (document.body && previousBodyCursor) {
        restoreInlineCursor(document.body, previousBodyCursor);
      }

      if (globalThis[CONTROLLER_KEY] === controller) {
        delete globalThis[CONTROLLER_KEY];
      }

      if (notifyCancellation) {
        void sendReliable({ type: "SNAPGROK_ZONE_CANCELLED", operationId });
      }
    }

    surface.addEventListener("pointerdown", onPointerDown, true);
    surface.addEventListener("pointermove", onPointerMove, true);
    surface.addEventListener("pointerup", onPointerUp, true);
    surface.addEventListener("pointercancel", onPointerCancel, true);
    surface.addEventListener("contextmenu", onContextMenu, true);
    window.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("visibilitychange", onVisibilityChange, true);

    focusSelector();
    requestAnimationFrame(() => focusSelector());
    requestAnimationFrame(() => requestAnimationFrame(() => focusSelector()));

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
      `[SnapGrok V3.5] Selector message delivery failed: ${lastError?.message || "No acknowledgement"}`,
    );
    return false;
  }

  function captureInlineCursor(element) {
    return {
      value: element.style.getPropertyValue("cursor"),
      priority: element.style.getPropertyPriority("cursor"),
    };
  }

  function restoreInlineCursor(element, snapshot) {
    if (!snapshot) return;
    if (snapshot.value) {
      element.style.setProperty("cursor", snapshot.value, snapshot.priority || "");
    } else {
      element.style.removeProperty("cursor");
    }
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

  function setImportant(element, property, value) {
    element.style.setProperty(property, value, "important");
  }

  function clamp(value, minimum, maximum) {
    return Math.min(Math.max(Number(value) || 0, minimum), maximum);
  }

  function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
})();
