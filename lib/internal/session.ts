import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";
import { clearAllCookies, getAllCookies, setAllCookies } from "./cookies";
import { BungieAuthorizationError } from "./error";
import { getTokens } from "./tokens";
import type {
  NextBungieAuthConfig,
  NextBungieAuthSessionResponse,
} from "../types";

/** @internal */
export const refreshSession = async (
  cookies: ReadonlyRequestCookies,
  config: NextBungieAuthConfig
): Promise<NextBungieAuthSessionResponse> => {
  const { bungieMembershipId, refreshToken } = await getAllCookies(
    cookies,
    config
  );

  if (!bungieMembershipId || !refreshToken) {
    return {
      status: "unauthorized",
      data: null,
      message: "No session found",
    };
  }

  try {
    const tokens = await getTokens(
      {
        grantType: "refresh_token",
        value: refreshToken,
      },
      config
    );

    const sessionAge = tokens.refresh_expires_in * 1000;
    const accessAge = tokens.expires_in * 1000;
    const accessExpires = new Date(Date.now() + accessAge);

    await setAllCookies(
      {
        accessExpires,
        accessAge,
        sessionAge,
        tokens,
      },
      cookies,
      config
    );

    return {
      status: "authorized",
      data: await config.createSession({
        bungieMembershipId: tokens.membership_id,
        accessToken: tokens.access_token,
        accessTokenExpiresIn: accessAge * 1000,
      }),
      message: "Session refreshed",
    };
  } catch (err) {
    if (!(err instanceof BungieAuthorizationError)) {
      return {
        status: "error",
        data: null,
        message: "Unknown error",
      };
    }

    if (err.error_description === "SystemDisabled") {
      return {
        status: "disabled",
        data: await config.createStaleSession({
          bungieMembershipId,
        }),
        message: `${err.error}: ${err.error_description}`,
      };
    } else if (err.error === "server_error") {
      return {
        status: "stale",
        data: await config.createStaleSession({
          bungieMembershipId,
        }),
        message: `${err.error}: ${err.error_description}`,
      };
    } else {
      clearAllCookies(cookies, config);
      return {
        status: "expired",
        data: null,
        message: `${err.error}: ${err.error_description}`,
      };
    }
  }
};
