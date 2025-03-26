import * as z from "zod"

export const userAuthSchema = z.object({
  email: z.string().email(),
})

export const userSignUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

