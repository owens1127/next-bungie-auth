import "server-only";
import { createNextBungieAuth } from "next-bungie-auth/server";

export const {
  handlers: { authorizeGET, deauthorizePOST, callbackGET, sessionGET },
  serverSideHelpers: {
    getServerSession,
    clearServerSession,
    requestNewTokens,
    updateServerSession,
  },
} = createNextBungieAuth({
  clientId: process.env.BUNGIE_CLIENT_ID!,
  clientSecret: process.env.BUNGIE_CLIENT_SECRET!,
  generateState: () => crypto.randomUUID(),
});
