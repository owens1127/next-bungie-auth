import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import {
  clearAuthStateCookie,
  clearSessionCookie,
  getAuthStateCookie,
  setAuthStateCookie,
  setSessionCookie,
} from "./cookies";
import { BungieAuthorizationError } from "./error";
import { getSession } from "./session";
import { getTokens } from "./tokens";
import type {
  BungieTokenResponse,
  NextBungieAuth,
  NextBungieAuthConfig,
  NextBungieAuthConfigRequiredKeys,
} from "./types";
import { cookies } from "next/headers";

export const DefaultBungieAuthConfig: Omit<
  NextBungieAuthConfig,
  NextBungieAuthConfigRequiredKeys
> = {
  minimumRefreshInterval: 30 * 60,
  baseCookieName: "__next-bungie-auth",
  cookieOptions: {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
  },
  getCallbackURL: (request) => new URL(request.url).origin,
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
  encode: async (data) => btoa(JSON.stringify(data)),
  decode: async (token) => JSON.parse(atob(token)),
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
  const defaultedConfig = {
    ...DefaultBungieAuthConfig,
    ...config,
  } as NextBungieAuthConfig;

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
        const jwt = await defaultedConfig.encode({
          bungie: tokens,
          iat: Math.floor(iat.getTime() / 1000),
          exp: Math.floor(iat.getTime() / 1000) + tokens.expires_in,
        });
        setSessionCookie(
          jwt,
          new Date(iat.getTime() + tokens.refresh_expires_in * 1000),
          defaultedConfig
        );
      },
      getServerSession: async () => {
        const encodedToken = cookies().get(
          `${defaultedConfig.baseCookieName}.session`
        )?.value;
        const token = encodedToken
          ? await defaultedConfig.decode(encodedToken)
          : null;

        if (!token) {
          const session = getSession({
            createdAt: null,
            jwt: null,
            state: "unauthorized",
          });
          return session;
        } else {
          const session = getSession({
            jwt: token.bungie,
            createdAt: new Date(token.iat * 1000),
            state: "authorized",
          });
          return session;
        }
      },
    },
    handlers: {
      authorizeGET: async (request) => {
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

      deauthorizePOST: async () => {
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
          defaultedConfig.logResponse("callback", 403, "error");
          return NextResponse.json(
            {
              error: "State mismatch error",
            },
            { status: 403 }
          );
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
          defaultedConfig.logError("callback", e, "unknown error");
          defaultedConfig.logResponse("callback", 500, "error");
          return NextResponse.json(
            {
              error: e.message,
            },
            { status: 500 }
          );
        }

        const now = new Date();
        const encodedToken = await defaultedConfig.encode({
          bungie: data,
          iat: Math.floor(now.getTime() / 1000),
          exp: Math.floor(now.getTime() / 1000) + data.expires_in,
        });
        setSessionCookie(
          encodedToken,
          new Date(now.getTime() + data.refresh_expires_in * 1000),
          defaultedConfig
        );

        defaultedConfig.logResponse("callback", 307, "authorized");
        redirect(defaultedConfig.getCallbackURL(request));
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
        const encodedToken = cookies().get(
          `${defaultedConfig.baseCookieName}.session`
        )?.value;

        const token = encodedToken
          ? await defaultedConfig.decode(encodedToken)
          : null;

        if (!token) {
          const session = getSession({
            createdAt: null,
            jwt: null,
            state: "unauthorized",
          });
          defaultedConfig.logResponse("session", 401, "no session");
          return NextResponse.json(session, { status: 200 });
        } else if (
          !force &&
          token.iat + token.bungie.expires_in - Date.now() / 1000 >
            defaultedConfig.minimumRefreshInterval
        ) {
          const session = getSession({
            jwt: token.bungie,
            createdAt: new Date(token.iat * 1000),
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
              value: token.bungie.refresh_token,
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
              jwt: null,
              state: "error",
            });
            defaultedConfig.logResponse("session", 500, "unknown error");
            return NextResponse.json(session, { status: 500 });
          }

          if (e.error_description === "SystemDisabled") {
            const session = getSession({
              jwt: token.bungie,
              createdAt: new Date(token.iat * 1000),
              state: "system disabled",
            });
            defaultedConfig.logResponse("session", 503, "system disabled");
            return NextResponse.json(session, { status: 503 });
          } else {
            clearSessionCookie(defaultedConfig);
            const session = getSession({
              createdAt: null,
              jwt: null,
              state: "reauthorization required",
            });
            defaultedConfig.logResponse("session", 401, e.error_description);
            return NextResponse.json(session, { status: 401 });
          }
        }

        const jwt = await defaultedConfig.encode({
          bungie: data,
          iat: Math.floor(now.getTime() / 1000),
          exp: Math.floor(now.getTime() / 1000 + data.expires_in),
        });
        setSessionCookie(
          jwt,
          new Date(now.getTime() + data.refresh_expires_in * 1000),
          defaultedConfig
        );

        const session = getSession({
          jwt: data,
          createdAt: now,
          state: "refreshed",
        });
        defaultedConfig.logResponse("session", 200, "refreshed");
        return NextResponse.json(session, { status: 200 });
      },
    },
  };
};
