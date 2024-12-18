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

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!config.generateState) {
    throw new TypeError("generateState is a required config option");
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
      updateServerSession: (
        tokens: BungieTokenResponse,
        issuedAt: Date,
        cookies
      ) => {
        const offset = Date.now() - issuedAt.getTime();
        const sessionAge = tokens.refresh_expires_in * 1000 - offset;
        const accessAge = tokens.expires_in * 1000 - offset;
        const accessExpires = new Date(Date.now() + accessAge);

        setAllCookies(
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
      getServerSession: (cookies) => {
        const { bungieMembershipId, refreshToken, accessExpires, accessToken } =
          getAllCookies(cookies, defaultedConfig);

        if (!bungieMembershipId || !refreshToken) {
          return {
            status: "unauthorized",
            data: null,
          };
        }

        if (!accessToken || accessExpires.getTime() < Date.now()) {
          return {
            status: "stale",
            data: {
              bungieMembershipId: bungieMembershipId,
            },
          };
        }

        return {
          status: "authorized",
          data: {
            bungieMembershipId: bungieMembershipId,
            accessToken: accessToken,
            accessTokenExpiresAt: accessExpires.toISOString(),
          },
        };
      },
      getRefreshedServerSession: async (cookies) => {
        return await refreshSession(cookies, defaultedConfig);
      },
    },
  };
};
