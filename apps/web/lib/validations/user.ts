import * as z from "zod";

/**
 * User name validation schema.
 */
export const userNameSchema = z.object({
	name: z.string().min(3).max(32),
});
