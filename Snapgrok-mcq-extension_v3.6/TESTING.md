# V3.4 manual reliability test

Use one ordinary HTTPS webpage and keep it active throughout each sequence.

## Full capture repetition

1. Press the full-capture shortcut.
2. Wait for an answer/error icon and for it to return to default.
3. Repeat 20 times.
4. Confirm that presses made before default-icon restoration are ignored.

## Selected-zone repetition

1. Press the selected-zone shortcut.
2. Confirm that the crosshair appears immediately.
3. Drag a rectangle and release.
4. Wait for the result icon and default reset.
5. Repeat 20 times.

## Listener fallback

1. Install or reload V3.4 while an ordinary webpage is already open.
2. Without refreshing that page, press the selected-zone shortcut.
3. The one-time injection fallback should start the selector.
4. Refreshing the page afterward makes the static listener the normal path.

## Cancellation

1. Start selected-zone capture.
2. Press Escape.
3. Confirm that the selector disappears, the icon is default, and the next shortcut works.

## Error representation

Test a protected page such as `chrome://extensions` with selected-zone capture. Confirm that the red-plus system-error icon appears for five seconds and then resets.


## Immediate crosshair test

On a normal HTTPS page, leave the pointer stationary over the page and press the selected-zone shortcut. The custom crosshair should appear without changing tabs. Move the pointer, drag a rectangle, and confirm that the processing icon follows capture.
