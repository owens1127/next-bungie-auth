import type {
  BungieTokenResponse,
  NextBungieAuthSessionResponse,
} from "./types";

/** @internal */
export const getSession = ({
  createdAt,
  tokens,
  state,
}:
  | {
      createdAt: Date;
      tokens: BungieTokenResponse;
      state: "authorized" | "refreshed" | "system disabled";
    }
  | {
      createdAt: null;
      tokens: null;
      state: "reauthorization required" | "unauthorized" | "error";
    }): NextBungieAuthSessionResponse => {
  switch (state) {
    case "unauthorized":
    case "reauthorization required":
      return {
        status: "unauthorized",
        data: null,
      };
    case "error":
      return {
        status: "error",
        data: null,
      };
    default:
      const createdAtSeconds = Math.floor(createdAt.getTime() / 1000);
      return {
        status:
          state === "system disabled" ? "bungie-api-offline" : "authorized",
        data: {
          bungieMembershipId: tokens.membership_id,
          accessToken: tokens.access_token,
          accessTokenExpiresAt: tokens.expires_in + createdAtSeconds,
          refreshToken: tokens.refresh_token,
          refreshTokenExpiresAt: tokens.refresh_expires_in + createdAtSeconds,
          createdAt: createdAtSeconds,
        },
      };
  }
};
