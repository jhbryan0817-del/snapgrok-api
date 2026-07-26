import typescriptEslint from "typescript-eslint";

export default typescriptEslint.config(
  {
    ignores: [
      ".next/**",
      "dist/**",
      "node_modules/**",
      "worker-configuration.d.ts",
    ],
  },
  ...typescriptEslint.configs.recommended,
);
