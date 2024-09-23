import { clearAllCookies, getAllCookies, setAllCookies } from "./cookies";
import { BungieAuthorizationError } from "./error";
import { getTokens } from "./tokens";
import type {
  NextBungieAuthConfig,
  NextBungieAuthSessionResponse,
} from "./types";

export const refreshSession = async (
  { force }: { force: boolean },
  config: NextBungieAuthConfig
): Promise<{
  session: NextBungieAuthSessionResponse & {
    status: "authorized" | "expired" | "unauthorized" | "error" | "disabled";
  };
  message: string;
}> => {
  const { bungieMembershipId, refreshToken, accessToken, accessExpires } =
    getAllCookies(config);

  if (!bungieMembershipId || !refreshToken) {
    return {
      session: {
        status: "unauthorized",
        data: null,
      },
      message: "No session found",
    };
  }

  if (
    !force &&
    accessToken &&
    accessExpires.getTime() - Date.now() / 1000 >
      config.sessionRefreshGracePeriod
  ) {
    return {
      session: {
        status: "authorized",
        data: {
          bungieMembershipId,
          accessToken: accessToken,
          accessTokenExpiresAt: accessExpires.toISOString(),
        },
      },
      message: `Token is still valid for ${Math.floor((accessExpires.getTime() - Date.now()) / 60000)} minutes`,
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

    const now = new Date();
    now.setMilliseconds(0);
    const sessionExpires = new Date(
      now.getTime() + tokens.refresh_expires_in * 1000
    );
    const accessExpires = new Date(now.getTime() + tokens.expires_in * 1000);

    setAllCookies(
      {
        accessExpires,
        sessionExpires,
        tokens,
      },
      config
    );

    return {
      session: {
        status: "authorized",
        data: {
          bungieMembershipId: tokens.membership_id,
          accessToken: tokens.access_token,
          accessTokenExpiresAt: accessExpires.toISOString(),
        },
      },
      message: "Session refreshed",
    };
  } catch (err) {
    if (!(err instanceof BungieAuthorizationError)) {
      return {
        session: {
          status: "error",
          data: null,
        },
        message: "Unknown error",
      };
    }

    if (err.error_description === "SystemDisabled") {
      return {
        session: {
          status: "disabled",
          data: {
            bungieMembershipId,
          },
        },
        message: `${err.error}: ${err.error_description}`,
      };
    } else {
      clearAllCookies(config);
      return {
        session: {
          status: "expired",
          data: null,
        },
        message: `${err.error}: ${err.error_description}`,
      };
    }
  }
};
