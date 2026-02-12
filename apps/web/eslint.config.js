import { nextJsConfig } from "@workspace/eslint-config/next-js"

/** @type {import("eslint").Linter.Config} */
export default [
    // Global ignores for monorepo performance
    {
        ignores: [
            ".next/**",
            "out/**",
            "build/**",
            "next-env.d.ts",
            "node_modules/**",
            "dist/**",
            ".turbo/**",
            "coverage/**",
        ],
    },
    ...nextJsConfig,
]
