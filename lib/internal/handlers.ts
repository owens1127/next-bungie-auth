import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import type {
  BungieTokenResponse,
  NextBungieAuth,
  NextBungieAuthConfig,
  NextBungieAuthSessionResponse,
} from "../types";
import {
  clearAllCookies,
  clearCallbackCookie,
  clearStateCookie,
  getCallbackCookie,
  getStateCookie,
  setAllCookies,
  setCallbackCookie,
  setStateCookie,
} from "./cookies";
import { refreshSession } from "./session";
import { getTokens } from "./tokens";
import { BungieAuthorizationError } from "./error";

/**
 * A list of authorization parameters that are prohibited from being used in the authorization request.
 *
 * According to the Bungie API OAuth Documentation, certain parameters should not be included in the authorization request.
 * Including these parameters could lead to unexpected behavior.
 *
 * @see {@link https://github.com/Bungie-net/api/wiki/OAuth-Documentation#authorization-request}
 */
const PROHIBITED_AUTHORIZATION_PARAMS = ["scope", "redirect_uri"];

export const createHandlers = (
  defaultedConfig: NextBungieAuthConfig
): Pick<NextBungieAuth, "catchAllHandler" | "handlers"> => {
  const handlers: NextBungieAuth["handlers"] = {
    authorizeGET: async (request) => {
      const cookieJar = await cookies();

      const [state, _] = await Promise.all([
        (async () => {
          if (defaultedConfig.generateState) {
            const state = await defaultedConfig.generateState(request);

            setStateCookie(state, cookieJar, defaultedConfig);

            return state;
          } else {
            return false;
          }
        })(),
        (async () => {
          const callbackValue =
            await defaultedConfig.generateCallbackUrlCookie(request);

          if (callbackValue) {
            setCallbackCookie(callbackValue, cookieJar, defaultedConfig);
          }

          return callbackValue;
        })(),
      ]);

      const url = new URL("https://www.bungie.net/en/oauth/authorize");
      request.nextUrl.searchParams.forEach((value, key) => {
        if (!PROHIBITED_AUTHORIZATION_PARAMS.includes(key)) {
          url.searchParams.set(key, value);
        }
      });
      url.searchParams.set("client_id", defaultedConfig.clientId);
      url.searchParams.set("response_type", "code");
      if (state !== false) {
        url.searchParams.set("state", state);
      }

      defaultedConfig.logRequest?.("authorize", "info", "redirected");
      redirect(url.toString());
    },

    deauthorizePOST: async () => {
      const cookieJar = await cookies();
      clearAllCookies(cookieJar, defaultedConfig);

      defaultedConfig.logRequest?.("deauthorize", "success", "cookies cleared");
      return buildNextResponse(
        {
          status: "unauthorized",
          data: null,
          message: "Session cleared",
        },
        200
      );
    },

    callbackGET: async (request) => {
      const searchParams = new URL(request.url).searchParams;
      const code = searchParams.get("code") ?? "";
      const urlState = searchParams.get("state");

      const cookieJar = await cookies();

      const callbackUrlCookie =
        getCallbackCookie(cookieJar, defaultedConfig) ?? null;
      const cookieState = getStateCookie(cookieJar, defaultedConfig);

      clearStateCookie(cookieJar, defaultedConfig);
      clearCallbackCookie(cookieJar, defaultedConfig);

      if (defaultedConfig.generateState && urlState !== cookieState) {
        defaultedConfig.logRequest?.(
          "callback",
          "warn",
          `State mismatch error. Expected ${urlState}, got ${cookieState}`
        );

        const errCallbackUrl = await defaultedConfig.generateErrorCallbackUrl(
          request,
          callbackUrlCookie,
          "state_mismatch"
        );
        redirect(errCallbackUrl);
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
          defaultedConfig.logRequest?.(
            "callback",
            "error",
            `${e.error}: ${e.error_description}`
          );
        } else if (e instanceof Error) {
          defaultedConfig.logRequest?.("callback", "error", e.message);
        } else {
          defaultedConfig.logRequest?.("callback", "error", "unknown error");
        }

        const errCallbackUrl = await defaultedConfig.generateErrorCallbackUrl(
          request,
          callbackUrlCookie,
          "token_error"
        );
        redirect(errCallbackUrl);
      }

      const sessionAge = tokens.refresh_expires_in * 1000;
      const accessAge = tokens.expires_in * 1000;
      const accessExpires = new Date(Date.now() + accessAge);

      await setAllCookies(
        {
          tokens,
          accessExpires,
          accessAge,
          sessionAge,
        },
        cookieJar,
        defaultedConfig
      );

      const callbackUrl = await defaultedConfig.generateCallbackUrl(
        request,
        callbackUrlCookie,
        tokens
      );

      defaultedConfig.logRequest?.("callback", "success", "authorized");
      defaultedConfig.onAuthorize?.(tokens.membership_id);

      redirect(callbackUrl);
    },

    sessionGET: async () => {
      const cookieJar = await cookies();
      const session = await refreshSession(cookieJar, defaultedConfig);

      const getResonse = (statusCode: number) => {
        defaultedConfig.logRequest?.(
          "session",
          statusCode === 200 ? "success" : "error",
          session.message
        );
        return buildNextResponse(session, statusCode);
      };

      switch (session.status) {
        case "authorized":
          return getResonse(200);
        case "unauthorized":
        case "expired":
          return getResonse(401);
        case "error":
        case "stale":
          return getResonse(500);
        case "disabled":
          return getResonse(503);
      }
    },
  };

  const catchAllHandler: NextBungieAuth["catchAllHandler"] = {
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
            new NextResponse("Not Found", {
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
        default:
          return Promise.resolve(
            new NextResponse("Not Found", {
              status: 404,
            })
          );
      }
    },
  };

  return {
    handlers,
    catchAllHandler,
  };
};

const buildNextResponse = (
  data: NextBungieAuthSessionResponse,
  status: number
) =>
  NextResponse.json(data, {
    status: status,
  });
