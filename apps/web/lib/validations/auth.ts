import * as z from "zod";

export const userAuthSchema = z.object({
  user: z.string(),
});

export const userSignUpSchema = z.object({
  user: z.string(),
  //   password: z.string().min(8),
});
