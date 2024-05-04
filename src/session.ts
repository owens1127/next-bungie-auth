import type {
  BungieTokenResponse,
  NextBungieAuthSessionResponse,
} from "./types";

/** @internal */
export const getSession = ({
  createdAt,
  jwt,
  state,
}:
  | {
      createdAt: Date;
      jwt: BungieTokenResponse;
      state: "authorized" | "refreshed" | "system disabled";
    }
  | {
      createdAt: null;
      jwt: null;
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
      return {
        status:
          state === "system disabled" ? "bungie-api-offline" : "authorized",
        data: {
          bungieMembershipId: jwt.membership_id,
          accessToken: jwt.access_token,
          accessTokenExpires: new Date(
            jwt.expires_in * 1000 + createdAt.getTime()
          ).toISOString(),
          refreshToken: jwt.refresh_token,
          refreshTokenExpires: new Date(
            jwt.refresh_expires_in * 1000 + createdAt.getTime()
          ).toISOString(),
          minted: createdAt.toISOString(),
        },
      };
  }
};
