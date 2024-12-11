import { redirect } from "next/navigation";
import { BungieAuthorizationError } from "./error";
import { getSession, refreshSession } from "./session";
import { getTokens } from "./tokens";
import type {
  BungieTokenResponse,
  NextBungieAuth,
  NextBungieAuthConfig,
  NextBungieAuthConfigRequiredKeys,
  NextBungieAuthSessionResponse,
} from "./types";
import { NextResponse } from "next/server";
import {
  clearAllCookies,
  clearCallbackCookie,
  clearStateCookie,
  getAllCookies,
  getCallbackCookie,
  getStateCookie,
  setAllCookies,
  setCallbackCookie,
  setStateCookie,
} from "./cookies";
import { cookies } from "next/headers";
import { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";

export const DefaultBungieAuthConfig: Omit<
  NextBungieAuthConfig,
  NextBungieAuthConfigRequiredKeys
> = {
  sessionRefreshGracePeriod: 300,
  baseCookieName: "__next-bungie-auth",
  cookieOptions: {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
  },
  tokenHttp: (params) =>
    fetch("https://www.bungie.net/platform/app/oauth/token/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${btoa(`${params.clientId}:${params.clientSecret}`)}`,
      },
      body: new URLSearchParams({
        grant_type: params.grantType,
        [params.grantKey]: params.value,
      }),
    }),
  logRequest: (path, success, message) =>
    console[success ? "log" : "error"](
      `BungieNextAuth[${path}]`,
      success ? "✅" : "❌",
      message
    ),
};

export const createNextBungieAuth = (
  config: Partial<NextBungieAuthConfig> &
    Pick<NextBungieAuthConfig, NextBungieAuthConfigRequiredKeys>
): NextBungieAuth => {
  const defaultedConfig: NextBungieAuthConfig = {
    ...DefaultBungieAuthConfig,
    ...config,
  };

  const handlers: NextBungieAuth["handlers"] = {
    authorizeGET: async (request) => {
      const state = defaultedConfig.generateState(request);

      const url = new URL("https://www.bungie.net/en/oauth/authorize");

      request.nextUrl.searchParams.forEach((value, key) => {
        url.searchParams.append(key, value);
      });
      url.searchParams.set("client_id", defaultedConfig.clientId);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("state", state);

      const cookieJar = await cookies();
      const referer = request.headers.get("referer");
      if (referer) {
        setCallbackCookie(referer, cookieJar, defaultedConfig);
      }
      setStateCookie(state, cookieJar, defaultedConfig);

      defaultedConfig.logRequest("authorize", true, "redirected");
      redirect(url.toString());
    },

    deauthorizePOST: async () => {
      const cookieJar = await cookies();
      clearAllCookies(cookieJar, defaultedConfig);

      defaultedConfig.logRequest("deauthorize", true, "cookies cleared");
      return buildNextResponse(
        {
          status: "unauthorized",
          data: null,
        },
        200
      );
    },

    callbackGET: async (request) => {
      const searchParams = new URL(request.url).searchParams;
      const code = searchParams.get("code") ?? "";
      const urlState = searchParams.get("state") ?? "";

      const cookieJar = await cookies();

      const cookieState = getStateCookie(cookieJar, defaultedConfig);
      const callbackUrl =
        getCallbackCookie(cookieJar, defaultedConfig) ??
        new URL("/", request.url).toString();

      clearStateCookie(cookieJar, defaultedConfig);
      clearCallbackCookie(cookieJar, defaultedConfig);

      if (urlState !== cookieState) {
        defaultedConfig.logRequest(
          "callback",
          false,
          `State mismatch error. Expected ${urlState}, got ${cookieState}`
        );
        redirect(callbackUrl);
      }

      let tokens: BungieTokenResponse;
      try {
        tokens = await getTokens(
          {
            grantType: "authorization_code",
            value: code,
          },
          defaultedConfig
        );
      } catch (e) {
        if (e instanceof BungieAuthorizationError) {
          defaultedConfig.logRequest(
            "callback",
            false,
            `${e.error}: ${e.error_description}`
          );
        } else if (e instanceof Error) {
          defaultedConfig.logRequest("callback", false, e.message);
        } else {
          defaultedConfig.logRequest("callback", false, "unknown error");
        }
        redirect(callbackUrl);
      }

      const now = new Date();
      now.setMilliseconds(0);
      const sessionExpires = new Date(
        now.getTime() + tokens.refresh_expires_in * 1000
      );
      const accessExpires = new Date(now.getTime() + tokens.expires_in * 1000);

      setAllCookies(
        {
          tokens,
          sessionExpires,
          accessExpires,
        },
        cookieJar,
        defaultedConfig
      );

      defaultedConfig.logRequest("callback", true, "authorized");
      redirect(callbackUrl);
    },

    sessionGET: async () => {
      const cookieJar = await cookies();
      const { session, message } = await getSession(cookieJar, defaultedConfig);

      defaultedConfig.logRequest("session", true, message);
      return buildNextResponse(session, 200);
    },

    refreshPOST: async () => {
      const cookieJar = await cookies();
      const { session, message } = await refreshSession(
        cookieJar,
        defaultedConfig
      );

      const getResonse = (success: boolean, statusCode: number) => {
        defaultedConfig.logRequest("refresh", success, message);
        return buildNextResponse(session, statusCode);
      };

      switch (session.status) {
        case "authorized":
          return getResonse(true, 200);
        case "error":
          return getResonse(false, 500);
        case "disabled":
          return getResonse(false, 503);
        default:
          return getResonse(false, 401);
      }
    },
  };

  return {
    handlers,
    catchAllHandler: {
      GET: (request) => {
        const url = new URL(request.nextUrl);
        const path = url.pathname.split("/").at(-1);

        switch (path) {
          case "authorize":
            return handlers.authorizeGET(request);
          case "callback":
            return handlers.callbackGET(request);
          case "session":
            return handlers.sessionGET(request);
          default:
            return Promise.resolve(
              NextResponse.json("Not Found", {
                status: 404,
              })
            );
        }
      },
      POST: (request) => {
        const url = new URL(request.nextUrl);
        const path = url.pathname.split("/").at(-1);

        switch (path) {
          case "deauthorize":
            return handlers.deauthorizePOST(request);
          case "refresh":
            return handlers.refreshPOST(request);
          default:
            return Promise.resolve(
              NextResponse.json("Not Found", {
                status: 404,
              })
            );
        }
      },
    },
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
        const sessionExpires = new Date(
          issuedAt.getTime() + tokens.refresh_expires_in * 1000
        );
        const accessExpires = new Date(
          issuedAt.getTime() + tokens.expires_in * 1000
        );
        setAllCookies(
          {
            tokens,
            sessionExpires,
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
      getRefreshedServerSession: (cookies: ReadonlyRequestCookies) =>
        refreshSession(cookies, defaultedConfig),
    },
  };
};

const buildNextResponse = (
  data: NextBungieAuthSessionResponse,
  status: number
) =>
  NextResponse.json(data, {
    status: status,
  });
