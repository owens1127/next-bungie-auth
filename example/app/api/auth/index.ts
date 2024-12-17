/* eslint-disable @typescript-eslint/no-non-null-assertion */
import "server-only";
import { createNextBungieAuth } from "next-bungie-auth/server";

export const {
  catchAllHandler,
  serverSideHelpers: { getServerSession },
} = createNextBungieAuth({
  clientId: process.env.BUNGIE_CLIENT_ID!,
  clientSecret: process.env.BUNGIE_CLIENT_SECRET!,
  baseCookieName: "__example_next-bungie-auth",
  generateState: () => crypto.randomUUID(),
});
