import { env } from "@/env.js"
import { db } from "@/server/db"

import { PrismaAdapter } from "@auth/prisma-adapter";
import { NextAuthOptions } from "next-auth"

import EmailProvider from "next-auth/providers/email"
import * as sendgridClient from '@sendgrid/mail';

import GitlabProvider from "next-auth/providers/gitlab";
import { GitLabProfile } from "next-auth/providers/gitlab";

import SlackProvider from "next-auth/providers/slack"
import {SlackProfile} from "next-auth/providers/slack"
import Credentials from "next-auth/providers/credentials";


// sendgridClient.setApiKey(env.AUTH_SENDGRID_KEY);


export const authOptions: NextAuthOptions = {
  // We are not using PrismaAdapter library from
  // the latest "@auth/prisma-adapter" because its
  // has a lot of bugs
  adapter: PrismaAdapter(db),
  session: {                
    strategy: "jwt"
  },

  providers: [
    // SlackProvider({
    //   clientId: env.AUTH_SLACK_ID,
    //   clientSecret: env.AUTH_SLACK_SECRET,
    //   profile(profile: SlackProfile) {
    //     return { 
    //     id: profile.sub,
    //     name: profile.name,
    //     email: profile.email,
    //     image: profile.picture
    //     //role: profile.role ?? "guest"
    //   }
    //   }
    // }),

    // GitlabProvider({
    //   clientId: env.AUTH_GITLAB_ID,
    //   clientSecret: env.AUTH_GITLAB_SECRET,
    //   id: "gitlab.cylab.be",
    //   name: "gitlab.cylab.be",
    //   wellKnown: "https://gitlab.cylab.be/.well-known/openid-configuration",
    //   authorization: {
    //     url: "https://gitlab.cylab.be/oauth/authorize",
    //     params: { scope: "openid email profile read_user" },
    //   },
    //   token: "https://gitlab.cylab.be/oauth/token",
    //   userinfo: "https://gitlab.cylab.be/api/v4/user",
    //   idToken: true,
    //   checks: ["pkce", "state"],
    //   profile(profile: GitLabProfile) {
    //     return {
    //       id: String(profile.id),
    //       name: profile.name ?? profile.username,
    //       email: profile.email,
    //       image: profile.avatar_url
    //       //role: profile.role ?? "guest"
    //     }
    //   }
    // }),

    // EmailProvider(
    //   {
    //     from: env.EMAIL_FROM,
    //     sendVerificationRequest: async ({ identifier, url, provider }) => {
    //       const user = await db.user.findUnique({
    //         where: {
    //           email: identifier,
    //         },
    //         select: {
    //           emailVerified: true,
    //         },
    //       })
  
    //       const templateID = user?.emailVerified
    //         ? env.SIGN_IN_TEMPLATE
    //         : env.SIGN_UP_TEMPLATE
    //       if (!templateID) {
    //         throw new Error("Missing template id")
    //       }

    //       const msg = {
    //         to: identifier,
    //         from: {
    //           name: "RAS-APP",
    //           email: provider.from as string
    //         },
    //         templateId: templateID,
    //         headers: { 
    //           Name : "X-Entity-Ref-ID",
    //           Value: new Date().getTime() + ""
    //         },
    //         dynamicTemplateData: {
    //             action_url: url
    //         },
    //         hideWarnings: true
    //       }
  
    //       sendgridClient.send(msg).then(() => {
    //       })
    //       .catch((error) => {
    //         console.error(error)
    //       })
          
    //     },
    //   }
    // ),

    Credentials({
        // The name to display on the sign in form (e.g. 'Sign in with...')
        name: 'Credentials',
        // The credentials is used to generate a suitable form on the sign in page.
        // You can specify whatever fields you are expecting to be submitted.
        // e.g. domain, username, password, 2FA token, etc.
        credentials: {
          username: { label: "Username", type: "text", placeholder: "Username" },
        },
        async authorize(credentials) {

            if(!credentials || !credentials.username) {
                throw new Error("Invalid credentials");
            }

            const user = await db.user.findFirst({
                where: {
                    name: credentials.username,
                },
            })
    
          // If no error and we have user data, return it
          if (user) {
            return user
          }
          // Return null if user data could not be retrieved
          throw new Error("Invalid credentials")
        }
      })
  ],
  callbacks: {
    async session({ token, session}) {
      if (token) {
        
        session.user.id = token.id
        session.user.name = token.name
        session.user.email = token.email
        session.user.image = token.picture
        //session.user.role = token.role
      }

      return session
    },
    async jwt({ token, user }) {
      const dbUser = await db.user.findFirst({
        where: {
          email: token.email ?? undefined
        },
      })

      if (!dbUser) {
        if (user) {
          token.id = user?.id
        }
        return token
      }

      token.id = dbUser.id;
      token.name = dbUser.name;
      token.email = dbUser.email;
      token.picture = dbUser.image;
      //token.role = dbUser.role;

      return token;
    },
  },
}
