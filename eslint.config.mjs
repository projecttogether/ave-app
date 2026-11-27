import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "migrate-bundle.cjs",
    "startup-bundle.cjs",
    "tmp_*.ts",
    "vendor/**",
  ]),
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/ban-ts-comment": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          args: "after-used",
          argsIgnorePattern: "^_",
          caughtErrors: "none",
          caughtErrorsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "react-hooks/error-boundaries": "warn",
      "react-hooks/incompatible-library": "off",
      "react-hooks/purity": "warn",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/lib/db/**', 'src/__tests__/**'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          { name: 'pg', message: 'Use the scoped database module.' },
          { name: 'drizzle-orm/node-postgres', message: 'Use the scoped database module.' },
        ],
      }],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/lib/db/**', 'src/__tests__/**', 'src/auth.ts', 'src/app/actions/auth.ts', 'src/lib/auth/verify-otp.ts', 'src/lib/auth/activate-account.ts', 'src/lib/audit.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          { name: 'pg', message: 'Use the scoped database module.' },
          { name: 'drizzle-orm/node-postgres', message: 'Use the scoped database module.' },
          { name: '@/lib/db/auth', message: 'Authentication credentials must not be used by data actions.' },
        ],
      }],
    },
  },
  {
    files: ["scripts/**/*.{js,cjs,mjs,ts}"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
]);

export default eslintConfig;
