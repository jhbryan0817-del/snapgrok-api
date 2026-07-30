# Bundled Clerk client

`clerk-auth.js` contains the browser bundle used for Clerk's Chrome-extension
session flow. The release validator pins the reviewed file to SHA-256:

```text
fe5acff370fc5812320dfe02db9c063d76964643bbc11104d8469faa34e7c091
```

Do not replace or mechanically regenerate this file without:

1. recording the exact Clerk package versions and build command;
2. reviewing dependency advisories and licenses;
3. repeating sign-in, sign-out, native token, cookie-sync, and CSP checks; and
4. updating the pinned hash only after the new bundle passes review.

The bundle remains subject to the licenses and notices of its included
third-party packages.
