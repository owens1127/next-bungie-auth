import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import {
  clearAuthStateCookie,
  clearSessionCookie,
  getAuthStateCookie,
  getSessionCookie,
  setAuthStateCookie,
  setSessionCookie,
} from "./cookies";
import { BungieAuthorizationError } from "./error";
import { getSession } from "./session";
import { decodeToken, encodeToken, getTokens } from "./tokens";
import type {
  BungieTokenResponse,
  NextBungieAuth,
  NextBungieAuthConfig,
  NextBungieAuthConfigRequiredKeys,
} from "./types";

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
  getCallbackURL: (request, success) => {
    if (success) {
      return new URL("/", request.url).toString();
    } else {
      return new URL("/error", request.url).toString();
    }
  },
  tokenHttp: (searchParams) =>
    fetch("https://www.bungie.net/platform/app/oauth/token/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: searchParams,
    }).then(async (res) => {
      if (!res.ok) {
        if (res.headers.get("content-type")?.includes("application/json")) {
          const msg = (await res.json()) as any;
          throw new BungieAuthorizationError(msg.error, msg.error_description);
        } else {
          throw new Error(res.statusText);
        }
      } else {
        return res.json() as Promise<BungieTokenResponse>;
      }
    }),
  logResponse: (path, statusCode, state) =>
    console.log(`BungieNextAuth[${path}]`, state, statusCode),
  logError: (path, err, state) =>
    console.error(`BungieNextAuth[${path}]`, state, err),
};

/**
 *
 * @param config
 * @returns
 */
export const createNextBungieAuth = (
  config: Partial<NextBungieAuthConfig> &
    Pick<NextBungieAuthConfig, NextBungieAuthConfigRequiredKeys>
): NextBungieAuth => {
  const defaultedConfig: NextBungieAuthConfig = {
    ...DefaultBungieAuthConfig,
    ...config,
  };

  return {
    serverSideHelpers: {
      clearServerSession: () => {
        clearSessionCookie(defaultedConfig);
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
      updateServerSession: async (tokens: BungieTokenResponse, iat: Date) => {
        const jwt = encodeToken(tokens, iat, defaultedConfig);
        setSessionCookie(
          jwt,
          new Date(iat.getTime() + tokens.refresh_expires_in * 1000),
          defaultedConfig
        );
      },
      getServerSession: () => {
        const encodedToken = getSessionCookie(defaultedConfig);
        const tokens = decodeToken(encodedToken, defaultedConfig);

        return tokens
          ? getSession({
              tokens: tokens,
              createdAt: new Date(tokens.iat * 1000),
              state: "authorized",
            })
          : getSession({
              createdAt: null,
              tokens: null,
              state: "unauthorized",
            });
      },
    },
    handlers: {
      authorizeGET: (request) => {
        const state = defaultedConfig.generateState(request);

        const url = new URL("https://www.bungie.net/en/oauth/authorize");

        request.nextUrl.searchParams.forEach((value, key) => {
          url.searchParams.append(key, value);
        });
        url.searchParams.set("client_id", defaultedConfig.clientId);
        url.searchParams.set("response_type", "code");
        url.searchParams.set("state", state);

        defaultedConfig.logResponse("authorize", 307, state);
        setAuthStateCookie(state, defaultedConfig);
        redirect(url.toString());
      },

      deauthorizePOST: () => {
        clearSessionCookie(defaultedConfig);
        defaultedConfig.logResponse("deauthorize", 200);
        return NextResponse.json("ok", {
          status: 200,
        });
      },

      callbackGET: async (request) => {
        const searchParams = new URL(request.url).searchParams;
        const code = searchParams.get("code") ?? "";
        const urlState = searchParams.get("state") ?? "";
        const cookieState = getAuthStateCookie(defaultedConfig);
        clearAuthStateCookie(defaultedConfig);

        if (urlState !== cookieState) {
          const err = new Error(
            `State mismatch error. Expected ${urlState}, got ${cookieState}`
          );
          defaultedConfig.logError("callback", err, "state mismatch");
          defaultedConfig.logResponse("callback", 307, "state mismatch error");
          redirect(defaultedConfig.getCallbackURL(request, false));
        }

        let data: BungieTokenResponse;
        try {
          data = await getTokens(
            {
              grantType: "authorization_code",
              value: code,
            },
            defaultedConfig
          );
        } catch (e: any) {
          if (e instanceof BungieAuthorizationError) {
            defaultedConfig.logError(
              "callback",
              e,
              `${e.error}: ${e.error_description}`
            );
          } else {
            defaultedConfig.logError("callback", e, "unknown error");
          }
          defaultedConfig.logResponse("callback", 307, "token fetch error");
          redirect(defaultedConfig.getCallbackURL(request, false));
        }

        const now = new Date();
        now.setMilliseconds(0);
        const encodedToken = encodeToken(data, now, defaultedConfig);
        setSessionCookie(
          encodedToken,
          new Date(now.getTime() + data.refresh_expires_in * 1000),
          defaultedConfig
        );

        defaultedConfig.logResponse("callback", 307, "authorized");
        redirect(defaultedConfig.getCallbackURL(request, true));
      },

      sessionGET: async (request) => {
        let force = false;
        if (
          (["t", "true", "1"] as (string | null)[]).includes(
            request.nextUrl.searchParams.get("force")
          )
        ) {
          force = true;
        }
        const encodedToken = getSessionCookie(defaultedConfig);
        const tokens = decodeToken(encodedToken, defaultedConfig);

        if (!tokens) {
          const session = getSession({
            createdAt: null,
            tokens: null,
            state: "unauthorized",
          });
          defaultedConfig.logResponse("session", 401, "no session");
          return NextResponse.json(session, { status: 200 });
        } else if (
          !force &&
          tokens.iat + tokens.expires_in - Date.now() / 1000 >
            defaultedConfig.sessionRefreshGracePeriod
        ) {
          const session = getSession({
            tokens: tokens,
            createdAt: new Date(tokens.iat * 1000),
            state: "authorized",
          });
          defaultedConfig.logResponse("session", 200, "not modified");
          return NextResponse.json(session, { status: 200 });
        }

        const now = new Date();
        now.setMilliseconds(0);
        let data: BungieTokenResponse;
        try {
          data = await getTokens(
            {
              grantType: "refresh_token",
              value: tokens.refresh_token,
            },
            defaultedConfig
          );
        } catch (e: any) {
          if (!(e instanceof BungieAuthorizationError)) {
            defaultedConfig.logError(
              "session",
              e,
              "unknown token error response"
            );
            const session = getSession({
              createdAt: null,
              tokens: null,
              state: "error",
            });
            defaultedConfig.logResponse("session", 500, "unknown error");
            return NextResponse.json(session, { status: 500 });
          }

          if (e.error_description === "SystemDisabled") {
            const session = getSession({
              tokens: tokens,
              createdAt: new Date(tokens.iat * 1000),
              state: "system disabled",
            });
            defaultedConfig.logResponse("session", 503, "system disabled");
            return NextResponse.json(session, { status: 503 });
          } else {
            clearSessionCookie(defaultedConfig);
            const session = getSession({
              createdAt: null,
              tokens: null,
              state: "reauthorization required",
            });
            defaultedConfig.logResponse("session", 401, e.error_description);
            return NextResponse.json(session, { status: 401 });
          }
        }

        const jwt = encodeToken(data, now, defaultedConfig);
        setSessionCookie(
          jwt,
          new Date(now.getTime() + data.refresh_expires_in * 1000),
          defaultedConfig
        );

        const session = getSession({
          tokens: data,
          createdAt: now,
          state: "refreshed",
        });
        defaultedConfig.logResponse("session", 200, "refreshed");
        return NextResponse.json(session, { status: 200 });
      },
    },
  };
};
