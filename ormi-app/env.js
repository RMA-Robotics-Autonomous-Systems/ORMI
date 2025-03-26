import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
    /**
     * Specify your server-side environment variables schema here. This way you can ensure the app
     * isn't built with invalid env vars.
     */
    server: {
        NEXTAUTH_URL: z.string().url().min(1),
        AUTH_SECRET:
            process.env.NODE_ENV === "production"
                ? z.string()
                : z.string().optional(),
        // AUTH_SLACK_ID: z.string().min(1),
        // AUTH_SLACK_SECRET: z.string().min(1),
        // AUTH_GITLAB_ID: z.string().min(1),
        // AUTH_GITLAB_SECRET: z.string().min(1),
        // AUTH_SENDGRID_KEY: z.string().min(1),
        // EMAIL_FROM: z.string().min(1),
        // SIGN_UP_TEMPLATE: z.string().min(1),
        // SIGN_IN_TEMPLATE: z.string().min(1),
        DATABASE_URL: z.string().url().min(1),
        NODE_ENV: z
            .enum(["development", "test", "production"])
            .default("development"),
    },

    /**
     * Specify your client-side environment variables schema here. This way you can ensure the app
     * isn't built with invalid env vars. To expose them to the client, prefix them with
     * `NEXT_PUBLIC_`.
     */
    client: {
        NEXT_PUBLIC_APP_URL: z.string().url().min(1),
    },

    /**
     * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
     * middlewares) or client-side so we need to destruct manually.
     */
    runtimeEnv: {
        NEXTAUTH_URL: process.env.NEXTAUTH_URL,
        AUTH_SECRET: process.env.AUTH_SECRET,
        // AUTH_SLACK_ID: process.env.AUTH_SLACK_ID,
        // AUTH_SLACK_SECRET: process.env.AUTH_SLACK_SECRET,
        // AUTH_GITLAB_ID: process.env.AUTH_GITLAB_ID,
        // AUTH_GITLAB_SECRET: process.env.AUTH_GITLAB_SECRET,
        // AUTH_SENDGRID_KEY: process.env.AUTH_SENDGRID_KEY,
        // EMAIL_FROM: process.env.EMAIL_FROM,
        // SIGN_UP_TEMPLATE: process.env.SIGN_UP_TEMPLATE,
        // SIGN_IN_TEMPLATE: process.env.SIGN_IN_TEMPLATE,
        DATABASE_URL: process.env.DATABASE_URL,
        NODE_ENV: process.env.NODE_ENV,
        NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL
    },
    /**
     * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
     * useful for Docker builds.
     */
    skipValidation: !!process.env.SKIP_ENV_VALIDATION,
    /**
     * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
     * `SOME_VAR=''` will throw an error.
     */
    emptyStringAsUndefined: true,
});

