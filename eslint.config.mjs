import js from "@eslint/js";
import prettierConfig from "eslint-config-prettier";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

const typedTypeCheckedConfigs = [...tseslint.configs.strictTypeChecked, ...tseslint.configs.stylisticTypeChecked].map((config) => ({
   ...config,
   files: ["**/*.{ts,tsx}"],
}));

export default tseslint.config(
   {
      ignores: ["desktop-dist", "desktop.ts", "dist", "node_modules"],
   },
   js.configs.recommended,
   ...typedTypeCheckedConfigs,
   {
      files: ["**/*.{ts,tsx}"],
      languageOptions: {
         ecmaVersion: "latest",
         sourceType: "module",
         parserOptions: {
            project: ["./tsconfig.eslint.json"],
         },
         globals: {
            ...globals.browser,
            ...globals.node,
         },
      },
      plugins: {
         "react-hooks": reactHooks,
         "react-refresh": reactRefresh,
      },
      rules: {
         ...reactHooks.configs.recommended.rules,
         "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
         "@typescript-eslint/consistent-type-imports": [
            "error",
            {
               prefer: "type-imports",
               fixStyle: "inline-type-imports",
            },
         ],
         "@typescript-eslint/no-confusing-void-expression": [
            "error",
            {
               ignoreArrowShorthand: true,
            },
         ],
         "@typescript-eslint/no-unused-vars": [
            "error",
            {
               argsIgnorePattern: "^_",
               varsIgnorePattern: "^_",
               caughtErrorsIgnorePattern: "^_",
            },
         ],
         "@typescript-eslint/restrict-template-expressions": [
            "error",
            {
               allowNumber: true,
               allowBoolean: false,
               allowNullish: false,
               allowRegExp: false,
            },
         ],
         "no-console": ["error", { allow: ["error", "warn"] }],
      },
   },
   {
      files: ["src/**/*.{ts,tsx}"],
      languageOptions: {
         globals: globals.browser,
      },
      rules: {
         "no-alert": "error",
      },
   },
   {
      files: ["server.ts", "server/**/*.ts"],
      languageOptions: {
         globals: globals.node,
      },
      rules: {
         "no-console": "off",
      },
   },
   prettierConfig
);
