/* eslint-disable @typescript-eslint/no-non-null-assertion */
import "server-only";
import { createNextBungieAuth } from "next-bungie-auth/server";

declare module "next-bungie-auth/types" {
  interface NextBungieAuthSessionData {
    username: string;
  }

  interface NextBungieAuthStaleSessionData {
    username: string;
  }
}

export const {
  catchAllHandler,
  serverSideHelpers: { getServerSession },
} = createNextBungieAuth({
  clientId: process.env.BUNGIE_CLIENT_ID!,
  clientSecret: process.env.BUNGIE_CLIENT_SECRET!,
  baseCookieName: "example_bungie_auth",
  generateState: () => crypto.randomUUID(),
  createSession: (params) => ({
    ...params,
    username: `user_${Math.floor(Math.random() * 1000)}`,
  }),
  createStaleSession: (params) => ({
    ...params,
    username: `user_${Math.floor(Math.random() * 1000)}`,
  }),
});
