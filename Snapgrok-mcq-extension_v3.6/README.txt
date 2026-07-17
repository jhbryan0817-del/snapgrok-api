SnapGrok MCQ Assistant V3.6
Build: 3.6.1

This corrected V3.6 fixes the selector startup error:
  Failed to execute 'attachShadow' on 'Element': This element does not support attachShadow

Cause:
- The first V3.6 build attempted to call attachShadow() directly on an HTML <dialog> element.

Correction:
- The modal <dialog> remains the transparent top-layer container.
- A normal <div> inside that dialog now hosts the closed Shadow DOM.
- The custom DOM crosshair, selection rectangle, pointer handling, processing icon,
  answer icons, system-error icon, lock behavior, and server request format remain unchanged.

Shortcuts:
- Full visible tab: Ctrl+Shift+A
- Select zone: Ctrl+Shift+X
- Shortcuts can be reassigned at chrome://extensions/shortcuts

The existing SnapGrok server requires no changes.
