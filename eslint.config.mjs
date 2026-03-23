import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import noFetchWithoutOkCheck from "./eslint-rules/no-fetch-without-ok-check.mjs";

const localRulesPlugin = {
  rules: { "no-fetch-without-ok-check": noFetchWithoutOkCheck },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    plugins: { local: localRulesPlugin },
    rules: {
      "local/no-fetch-without-ok-check": "warn",
    },
  },
  // File-specific rule overrides
  {
    files: ["components/TodayActions.tsx"],
    rules: {
      // fetchData is an async helper defined inside the component that calls
      // multiple setState functions. Calling it from useEffect is intentional
      // and safe — the rule fires because it traces setState through the call.
      "react-hooks/set-state-in-effect": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Agent worktrees (not production code):
    ".claude/worktrees/**",
  ]),
]);

export default eslintConfig;
