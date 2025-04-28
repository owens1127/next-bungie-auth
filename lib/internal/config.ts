import type {
  NextBungieAuthConfig,
  NextBungieAuthConfigRequiredKeys,
} from "../types";

/** @internal */
export const DefaultBungieAuthConfig: Omit<
  NextBungieAuthConfig,
  NextBungieAuthConfigRequiredKeys
> = {
  baseCookieName: "__next-bungie-auth",
  cookieOptions: {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
  },
  encodeTokens: false,
  tokenHttp: (params) =>
    fetch("https://www.bungie.net/platform/app/oauth/token/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${btoa(`${params.clientId}:${params.clientSecret}`)}`,
      },
      body: new URLSearchParams({
        grant_type: params.grantType,
        [params.grantKey]: params.grantValue,
      }),
    }),
  createSession: (params) => params,
  createStaleSession: (params) => params,
  generateCallbackUrlCookie: (authorizationRequest) => {
    return (
      authorizationRequest.nextUrl.searchParams.get("callback_url") ??
      authorizationRequest.headers.get("referrer") ??
      null
    );
  },
  generateCallbackUrl: (callbackRequest, callbackUrlCookie, _) => {
    const url = callbackUrlCookie
      ? new URL(callbackUrlCookie)
      : new URL("/", callbackRequest.url);
    url.searchParams.delete("error");
    return url.toString();
  },
  generateErrorCallbackUrl: (callbackRequest, callbackUrlCookie, errorType) => {
    const url = callbackUrlCookie
      ? new URL(callbackUrlCookie)
      : new URL("/", callbackRequest.url);
    url.searchParams.set("error", errorType);
    return url.toString();
  },
  logRequest: (path, status, message) => {
    let logFn = console.log;
    switch (status) {
      case "info":
      case "success":
        logFn = console.info;
        break;
      case "error":
        logFn = console.error;
        break;
      case "warn":
        logFn = console.warn;
        break;
    }

    let emoji = "";
    switch (status) {
      case "error":
        emoji = "❌";
        break;
      case "info":
        emoji = "ℹ️";
        break;
      case "success":
        emoji = "✅";
        break;
      case "warn":
        emoji = "⚠️";
        break;
    }

    logFn(`NextBungieAuth[${path}]`, emoji, message);
  },
};
