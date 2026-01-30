import { env } from "@/config/env.js";
import { db } from "@/server/db";

import { PrismaAdapter } from "@auth/prisma-adapter";
import { NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";

// sendgridClient.setApiKey(env.AUTH_SENDGRID_KEY);

export const authOptions: NextAuthOptions = {
	adapter: PrismaAdapter(db),
	session: {
		strategy: "jwt",
	},

	providers: [
		Credentials({
			// The name to display on the sign in form (e.g. 'Sign in with...')
			id: "login",
			name: "Login",
			// The credentials is used to generate a suitable form on the sign in page.
			// You can specify whatever fields you are expecting to be submitted.
			// e.g. domain, username, password, 2FA token, etc.
			credentials: {
				username: {
					label: "Username",
					type: "text",
					placeholder: "Username",
				},
			},
			async authorize(credentials: any) {
				if (!credentials || !credentials.username) {
					throw new Error("Invalid credentials");
				}

				const user = await db.user.findFirst({
					where: {
						name: credentials.username,
					},
				});

				// If no error and we have user data, return it
				if (user) {
					return user;
				}
				// Return null if user data could not be retrieved
				throw new Error("Invalid credentials");
			},
		}),

		Credentials({
			id: "register",
			name: "Register",
			credentials: {
				username: {
					label: "Username",
					type: "text",
					placeholder: "Username",
				},
			},
			async authorize(credentials: any) {
				if (!credentials || !credentials.username) {
					throw new Error("Invalid credentials");
				}

				const user = await db.user.findFirst({
					where: {
						name: credentials.username,
					},
				});

				// if a user with the same username already exists, throw an error
				if (user) {
					throw new Error("User already exists");
				}

				const encodedName = encodeURIComponent(credentials.username);

				// If no error and we have user data, return it
				const newUser = await db.user.create({
					data: {
						name: credentials.username,
						email: credentials.username,
						image: `https://api.dicebear.com/9.x/identicon/svg?seed=${encodedName}`,
						//role: "guest"
					},
				});

				if (newUser) {
					return newUser;
				}

				// Return null if user data could not be retrieved
				throw new Error("Invalid credentials");
			},
		}),
	],
	callbacks: {
		async session({ token, session }: any) {
			if (token) {
				session.user.id = token.id;
				session.user.name = token.name;
				session.user.email = token.email;
				session.user.image = token.picture;
				//session.user.role = token.role
			}

			return session;
		},
		async jwt({ token, user }: any) {
			const dbUser = await db.user.findFirst({
				where: {
					email: token.email ?? undefined,
				},
			});

			if (!dbUser) {
				if (user) {
					token.id = user?.id;
				}
				return token;
			}

			token.id = dbUser.id;
			token.name = dbUser.name;
			token.email = dbUser.email;
			token.picture = dbUser.image;
			//token.role = dbUser.role;

			return token;
		},
	},
};
