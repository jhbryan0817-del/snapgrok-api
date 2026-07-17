(() => {
  const INSTALL_KEY = "__snapgrokV34SelectorListenerInstalled";
  const ACTIVE_KEY = "__snapgrokV34ActiveSelector";

  if (globalThis[INSTALL_KEY]) return;
  globalThis[INSTALL_KEY] = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "SNAPGROK_START_SELECTION") return false;

    try {
      globalThis[ACTIVE_KEY]?.cleanup?.();
      globalThis[ACTIVE_KEY] = createSelector(message.operationId);
      sendResponse({ ready: true });
    } catch (error) {
      console.error(`[SnapGrok selector] ${error?.message || "Initialization failed."}`);
      sendResponse({ ready: false });
    }

    return false;
  });

  function createSelector(operationId) {
    const host = document.createElement("div");
    host.setAttribute("data-snapgrok-selector", "true");
    host.style.setProperty("position", "fixed", "important");
    host.style.setProperty("inset", "0", "important");
    host.style.setProperty("z-index", "2147483647", "important");
    host.style.setProperty("pointer-events", "auto", "important");
    host.style.setProperty("cursor", "crosshair", "important");
    host.style.setProperty("background", "transparent", "important");
    host.style.setProperty("margin", "0", "important");
    host.style.setProperty("padding", "0", "important");

    const shadow = host.attachShadow({ mode: "closed" });
    const overlay = document.createElement("div");
    const box = document.createElement("div");

    overlay.style.cssText = [
      "position:fixed!important",
      "inset:0!important",
      "width:100vw!important",
      "height:100vh!important",
      "margin:0!important",
      "padding:0!important",
      "background:transparent!important",
      "cursor:crosshair!important",
      "pointer-events:auto!important",
      "user-select:none!important",
      "touch-action:none!important",
    ].join(";");

    box.style.cssText = [
      "position:fixed!important",
      "display:none!important",
      "box-sizing:border-box!important",
      "border:1px solid rgba(35,35,35,0.95)!important",
      "background:transparent!important",
      "pointer-events:none!important",
    ].join(";");

    shadow.append(overlay, box);
    (document.documentElement || document.body).appendChild(host);

    let startX = 0;
    let startY = 0;
    let pointerId = null;
    let dragging = false;
    let finished = false;

    const timeoutId = setTimeout(() => {
      if (finished) return;
      finished = true;
      cleanup();
      sendRuntimeMessage({
        type: "SNAPGROK_SELECTION_ERROR",
        operationId,
      });
    }, 120000);

    function pointerDown(event) {
      if (event.button !== 0 || finished) return;
      event.preventDefault();
      event.stopPropagation();

      dragging = true;
      pointerId = event.pointerId;
      startX = clamp(event.clientX, 0, window.innerWidth);
      startY = clamp(event.clientY, 0, window.innerHeight);
      overlay.setPointerCapture?.(pointerId);
      renderBox(startX, startY, startX, startY);
    }

    function pointerMove(event) {
      if (!dragging || event.pointerId !== pointerId || finished) return;
      event.preventDefault();
      event.stopPropagation();
      renderBox(
        startX,
        startY,
        clamp(event.clientX, 0, window.innerWidth),
        clamp(event.clientY, 0, window.innerHeight),
      );
    }

    function pointerUp(event) {
      if (!dragging || event.pointerId !== pointerId || finished) return;
      event.preventDefault();
      event.stopPropagation();

      dragging = false;
      const endX = clamp(event.clientX, 0, window.innerWidth);
      const endY = clamp(event.clientY, 0, window.innerHeight);
      const rect = normalizeRect(startX, startY, endX, endY);

      if (rect.width < 4 || rect.height < 4) {
        box.style.setProperty("display", "none", "important");
        return;
      }

      finished = true;
      cleanup();

      // Give Chrome time to repaint the page without the selector before the
      // service worker captures the visible tab.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          sendRuntimeMessage({
            type: "SNAPGROK_SELECTION_COMPLETE",
            operationId,
            rect,
            viewport: {
              width: window.innerWidth,
              height: window.innerHeight,
            },
          });
        });
      });
    }

    function keyDown(event) {
      if (event.key !== "Escape" || finished) return;
      event.preventDefault();
      event.stopPropagation();
      finished = true;
      cleanup();
      sendRuntimeMessage({
        type: "SNAPGROK_SELECTION_CANCELLED",
        operationId,
      });
    }

    function contextMenu(event) {
      event.preventDefault();
      event.stopPropagation();
    }

    function windowBlur() {
      if (!dragging || finished) return;
      finished = true;
      cleanup();
      sendRuntimeMessage({
        type: "SNAPGROK_SELECTION_CANCELLED",
        operationId,
      });
    }

    function renderBox(x1, y1, x2, y2) {
      const rect = normalizeRect(x1, y1, x2, y2);
      box.style.setProperty("display", "block", "important");
      box.style.setProperty("left", `${rect.x}px`, "important");
      box.style.setProperty("top", `${rect.y}px`, "important");
      box.style.setProperty("width", `${rect.width}px`, "important");
      box.style.setProperty("height", `${rect.height}px`, "important");
    }

    function cleanup() {
      clearTimeout(timeoutId);
      overlay.removeEventListener("pointerdown", pointerDown, true);
      overlay.removeEventListener("pointermove", pointerMove, true);
      overlay.removeEventListener("pointerup", pointerUp, true);
      overlay.removeEventListener("pointercancel", windowBlur, true);
      overlay.removeEventListener("contextmenu", contextMenu, true);
      window.removeEventListener("keydown", keyDown, true);
      window.removeEventListener("blur", windowBlur, true);
      host.remove();

      if (globalThis[ACTIVE_KEY]?.operationId === operationId) {
        globalThis[ACTIVE_KEY] = null;
      }
    }

    overlay.addEventListener("pointerdown", pointerDown, true);
    overlay.addEventListener("pointermove", pointerMove, true);
    overlay.addEventListener("pointerup", pointerUp, true);
    overlay.addEventListener("pointercancel", windowBlur, true);
    overlay.addEventListener("contextmenu", contextMenu, true);
    window.addEventListener("keydown", keyDown, true);
    window.addEventListener("blur", windowBlur, true);

    return { operationId, cleanup };
  }

  function normalizeRect(x1, y1, x2, y2) {
    return {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      width: Math.abs(x2 - x1),
      height: Math.abs(y2 - y1),
    };
  }

  function clamp(value, minimum, maximum) {
    return Math.min(Math.max(Number(value) || 0, minimum), maximum);
  }

  function sendRuntimeMessage(message) {
    chrome.runtime.sendMessage(message).catch((error) => {
      console.error(`[SnapGrok selector] ${error?.message || "Message delivery failed."}`);
    });
  }
})();
