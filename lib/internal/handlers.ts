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
import { getSession, refreshSession } from "./session";
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
      const state = defaultedConfig.generateState(request);

      const cookieJar = await cookies();

      setStateCookie(state, cookieJar, defaultedConfig);

      const callbackValue = defaultedConfig.generateCallbackUrlCookie(request);
      if (callbackValue) {
        setCallbackCookie(callbackValue, cookieJar, defaultedConfig);
      }

      const url = new URL("https://www.bungie.net/en/oauth/authorize");
      request.nextUrl.searchParams.forEach((value, key) => {
        if (!PROHIBITED_AUTHORIZATION_PARAMS.includes(key)) {
          url.searchParams.set(key, value);
        }
      });
      url.searchParams.set("client_id", defaultedConfig.clientId);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("state", state);

      defaultedConfig.logRequest("authorize", "info", "redirected");
      redirect(url.toString());
    },

    deauthorizePOST: async () => {
      const cookieJar = await cookies();
      clearAllCookies(cookieJar, defaultedConfig);

      defaultedConfig.logRequest("deauthorize", "success", "cookies cleared");
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

      const callbackUrlCookie =
        getCallbackCookie(cookieJar, defaultedConfig) ?? null;
      const cookieState = getStateCookie(cookieJar, defaultedConfig);

      clearStateCookie(cookieJar, defaultedConfig);
      clearCallbackCookie(cookieJar, defaultedConfig);

      if (urlState !== cookieState) {
        defaultedConfig.logRequest(
          "callback",
          "warn",
          `State mismatch error. Expected ${urlState}, got ${cookieState}`
        );

        const errCallbackUrl = defaultedConfig.generateErrorCallbackUrl(
          request,
          "state_mismatch",
          callbackUrlCookie
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
          defaultedConfig.logRequest(
            "callback",
            "error",
            `${e.error}: ${e.error_description}`
          );
        } else if (e instanceof Error) {
          defaultedConfig.logRequest("callback", "error", e.message);
        } else {
          defaultedConfig.logRequest("callback", "error", "unknown error");
        }

        const errCallbackUrl = defaultedConfig.generateErrorCallbackUrl(
          request,
          "token_error",
          callbackUrlCookie
        );
        redirect(errCallbackUrl);
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

      defaultedConfig.logRequest("callback", "success", "authorized");

      const callbackUrl = defaultedConfig.generateCallbackUrl(
        request,
        callbackUrlCookie
      );
      redirect(callbackUrl);
    },

    sessionGET: async () => {
      const cookieJar = await cookies();
      const { session, message } = getSession(cookieJar, defaultedConfig);

      defaultedConfig.logRequest("session", "info", message);
      return buildNextResponse(session, 200);
    },

    refreshPOST: async () => {
      const cookieJar = await cookies();
      const { session, message } = await refreshSession(
        cookieJar,
        defaultedConfig
      );

      const getResonse = (statusCode: number) => {
        defaultedConfig.logRequest(
          "refresh",
          statusCode === 200 ? "success" : "error",
          message
        );
        return buildNextResponse(session, statusCode);
      };

      switch (session.status) {
        case "authorized":
          return getResonse(200);
        case "error":
          return getResonse(500);
        case "disabled":
          return getResonse(503);
        default:
          return getResonse(401);
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
        case "refresh":
          return handlers.refreshPOST(request);
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
