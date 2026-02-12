import * as z from "zod";

/**
 * User authentication schema.
 */
export const userAuthSchema = z.object({
	user: z.string(),
});

/**
 * User sign-up schema.
 */
export const userSignUpSchema = z.object({
	user: z.string(),
	//   password: z.string().min(8),
});
