(() => {
  if (window.__snapGrokZoneSelectorActive) return;
  window.__snapGrokZoneSelectorActive = true;

  const overlay = document.createElement("div");
  const selectionBox = document.createElement("div");

  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    zIndex: "2147483647",
    background: "transparent",
    cursor: "crosshair",
    userSelect: "none",
    touchAction: "none",
  });

  Object.assign(selectionBox.style, {
    position: "fixed",
    display: "none",
    boxSizing: "border-box",
    border: "2px solid rgba(55, 55, 55, 0.9)",
    background: "transparent",
    pointerEvents: "none",
  });

  overlay.appendChild(selectionBox);
  document.documentElement.appendChild(overlay);

  let startX = 0;
  let startY = 0;
  let dragging = false;
  let finished = false;

  const stopPageEvent = (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  };

  const rectangleFrom = (x1, y1, x2, y2) => ({
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  });

  function draw(rectangle) {
    selectionBox.style.display = "block";
    selectionBox.style.left = `${rectangle.x}px`;
    selectionBox.style.top = `${rectangle.y}px`;
    selectionBox.style.width = `${rectangle.width}px`;
    selectionBox.style.height = `${rectangle.height}px`;
  }

  function cleanup() {
    overlay.remove();
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("blur", onBlur, true);
    window.__snapGrokZoneSelectorActive = false;
  }

  function sendAfterPaint(message) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        chrome.runtime.sendMessage(message).catch(() => {});
      });
    });
  }

  function cancel() {
    if (finished) return;
    finished = true;
    cleanup();
    sendAfterPaint({ type: "SNAPGROK_ZONE_CANCELLED" });
  }

  function onKeyDown(event) {
    if (event.key !== "Escape") return;
    stopPageEvent(event);
    cancel();
  }

  function onBlur() {
    if (dragging) cancel();
  }

  overlay.addEventListener(
    "mousedown",
    (event) => {
      if (event.button !== 0 || finished) return;
      stopPageEvent(event);
      dragging = true;
      startX = event.clientX;
      startY = event.clientY;
      draw({ x: startX, y: startY, width: 0, height: 0 });
    },
    true,
  );

  overlay.addEventListener(
    "mousemove",
    (event) => {
      if (!dragging || finished) return;
      stopPageEvent(event);
      draw(rectangleFrom(startX, startY, event.clientX, event.clientY));
    },
    true,
  );

  overlay.addEventListener(
    "mouseup",
    (event) => {
      if (!dragging || event.button !== 0 || finished) return;
      stopPageEvent(event);
      dragging = false;

      const rectangle = rectangleFrom(startX, startY, event.clientX, event.clientY);
      if (rectangle.width < 8 || rectangle.height < 8) {
        cancel();
        return;
      }

      finished = true;
      cleanup();
      sendAfterPaint({
        type: "SNAPGROK_ZONE_SELECTED",
        selection: {
          ...rectangle,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
        },
      });
    },
    true,
  );

  overlay.addEventListener("contextmenu", stopPageEvent, true);
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("blur", onBlur, true);

  setTimeout(cancel, 120000);
})();
