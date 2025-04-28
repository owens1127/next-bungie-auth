import type {
  BungieTokenResponse,
  NextBungieAuth,
  NextBungieAuthConfig,
  NextBungieAuthConfigRequiredKeys,
} from "./types";
import { getTokens } from "./internal/tokens";
import {
  clearAllCookies,
  getAllCookies,
  setAllCookies,
} from "./internal/cookies";
import { refreshSession } from "./internal/session";
import { DefaultBungieAuthConfig } from "./internal/config";
import { createHandlers } from "./internal/handlers";
import { BungieAuthorizationError } from "./internal/error";

export { DefaultBungieAuthConfig };
export { BungieAuthorizationError };

export const createNextBungieAuth = (
  config: Partial<NextBungieAuthConfig> &
    Pick<NextBungieAuthConfig, NextBungieAuthConfigRequiredKeys>
): NextBungieAuth => {
  if (!config.clientId || !config.clientSecret) {
    throw new TypeError(
      "Both clientId and clientSecret are required config options",
      {
        cause: {
          clientId: config.clientId,
          clientSecret: config.clientSecret,
        },
      }
    );
  }

  const defaultedConfig: NextBungieAuthConfig = {
    ...DefaultBungieAuthConfig,
    ...config,
  };

  const { handlers, catchAllHandler } = createHandlers(defaultedConfig);

  return {
    handlers,
    catchAllHandler,
    serverSideHelpers: {
      clearServerSession: (cookies) => {
        clearAllCookies(cookies, defaultedConfig);
      },
      requestNewTokens: async (
        grantType: "authorization_code" | "refresh_token",
        value: string
      ) => {
        return await getTokens(
          {
            grantType,
            value,
          },
          defaultedConfig
        );
      },
      updateServerSession: async (
        tokens: BungieTokenResponse,
        issuedAt: Date,
        cookies
      ) => {
        const offset = Date.now() - issuedAt.getTime();
        const sessionAge = tokens.refresh_expires_in * 1000 - offset;
        const accessAge = tokens.expires_in * 1000 - offset;
        const accessExpires = new Date(Date.now() + accessAge);

        await setAllCookies(
          {
            tokens,
            sessionAge,
            accessAge,
            accessExpires,
          },
          cookies,
          defaultedConfig
        );
      },
      getServerSession: async (cookies) => {
        const { bungieMembershipId, refreshToken, accessExpires, accessToken } =
          await getAllCookies(cookies, defaultedConfig);

        if (!bungieMembershipId || !refreshToken) {
          return {
            status: "unauthorized",
            data: null,
            message: "No session found",
          };
        }

        if (!accessToken || accessExpires.getTime() < Date.now()) {
          return {
            status: "stale",
            data: await defaultedConfig.createStaleSession({
              bungieMembershipId,
            }),
            message: "Session expired",
          };
        }

        return {
          status: "authorized",
          data: await defaultedConfig.createSession({
            bungieMembershipId: bungieMembershipId,
            accessToken: accessToken,
            accessTokenExpiresIn: accessExpires.getTime() - Date.now(),
          }),
          message: "Session refreshed",
        };
      },
      getRefreshedServerSession: async (cookies) => {
        return await refreshSession(cookies, defaultedConfig);
      },
    },
  };
};
