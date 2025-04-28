import type { ResponseCookie } from "next/dist/compiled/@edge-runtime/cookies";
import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";
import type { NextRequest, NextResponse } from "next/server";

export interface NextBungieAuth {
  /**
   * The single handler for Bungie OAuth. Wraps the individual handlers.
   */
  catchAllHandler: {
    POST: (request: NextRequest) => Promise<NextResponse>;
    GET: (request: NextRequest) => Promise<NextResponse>;
  };
  /**
   * The Next.js API routes for Bungie OAuth for my fain grained control.
   * These routes should be destructured and exported individually in a route handler file.
   */
  handlers: {
    /**
     * Redirects the user to the Bungie OAuth page.
     */
    authorizeGET: (request: NextRequest) => Promise<NextResponse>;
    /**
     * Deauthorizes the user's Bungie OAuth session.
     */
    deauthorizePOST: (
      request: NextRequest
    ) => Promise<NextResponse<NextBungieAuthSessionResponse>>;
    /**
     * Handles the callback from the Bungie OAuth page.
     */
    callbackGET: (request: NextRequest) => Promise<never>;
    /**
     * Refreshes the user's Bungie OAuth session.
     */
    sessionGET: (
      request: NextRequest
    ) => Promise<NextResponse<NextBungieAuthSessionResponse>>;
  };
  /**
   * Server-side helper functions for managing the session in server-side logic
   */
  serverSideHelpers: {
    /**
     * Clears the session cookie
     */
    clearServerSession: (cookies: ReadonlyRequestCookies) => void;
    /**
     * Requests new tokens from the Bungie API.
     */
    requestNewTokens: (
      grantType: "authorization_code" | "refresh_token",
      value: string,
      cookies: ReadonlyRequestCookies
    ) => Promise<BungieTokenResponse>;
    /**
     * Updates the server session with new tokens.
     */
    updateServerSession: (
      tokens: BungieTokenResponse,
      iat: Date,
      cookies: ReadonlyRequestCookies
    ) => Promise<void>;
    /**
     * Synchronously retrieves the current server session from the request cookies.
     * Does not refresh the session, so it may be expired.
     */
    getServerSession: (
      cookies: ReadonlyRequestCookies
    ) => Promise<NextBungieAuthSessionResponse>;
    /**
     * Retrieves the current server session from the cookies and refreshes.
     * Can only be called from an API route or a server-action.
     */
    getRefreshedServerSession: (
      cookies: ReadonlyRequestCookies
    ) => Promise<NextBungieAuthSessionResponse>;
  };
}

export type NextBungieAuthConfigRequiredKeys =
  | "clientId"
  | "clientSecret"
  | "generateState";

/**
 * Configuration options for NextBungieAuth.
 */
export interface NextBungieAuthConfig {
  /**
   * The client ID for Bungie OAuth.
   */
  clientId: string;
  /**
   * The client secret for Bungie OAuth.
   */
  clientSecret: string;
  /**
   * The name of the base cookie. Defaults to `__next-bungie-auth`.
   */
  baseCookieName: string;
  /**
   * Optional cookie options for setting the response cookie.
   * Defaults to ```{
        httpOnly: true,
        secure: true,
        sameSite: "lax"
      }```
   */
  cookieOptions: Partial<Omit<ResponseCookie, "expires">>;
  /**
   * Optional object to encode and decode tokens before storing them in cookies.
   *
   * Defaults to to a function that encodes the token with the client secret.
   */
  encodeTokens:
    | false
    | {
        encoder: (data: string, clientSecret: string) => Awaitable<string>;
        decoder: (encoded: string, clientSecret: string) => Awaitable<string>;
      };
  /**
   * Function to generate a state for the OAuth request.
   *
   * Can be set to `false` if you do not want to use a state parameter (not recommended).
   *
   * @param request - The NextRequest object.
   * @returns The state string.
   */
  generateState: ((request: NextRequest) => Awaitable<string>) | false;
  createSession: (params: {
    bungieMembershipId: string;
    accessToken: string;
    accessTokenExpiresIn: number;
  }) => Awaitable<NextBungieAuthSessionData>;
  createStaleSession: (params: {
    bungieMembershipId: string;
  }) => Awaitable<NextBungieAuthStaleSessionData>;
  /**
   * Function to make HTTP request given the parameters.
   * Defaults to a fetch request using the native fetch API to the Bungie API.
   *
   * @returns A promise that resolves to the Bungie token response.
   */
  tokenHttp: (params: {
    clientId: string;
    clientSecret: string;
    grantType: "authorization_code" | "refresh_token";
    grantKey: "code" | "refresh_token";
    grantValue: string;
  }) => Promise<Response>;
  /**
   * During the authorization request, this function generates the callback URL cookie
   * from the request object.
   *
   * Useful for saving the original page the user was on before being redirected to
   * the authorization flow.
   *
   * Defaults to a function that returns the `callback_url` query parameter
   * or the referrer header if the query parameter is not present.
   *
   * @param authorizationRequest The authorize request object.
   * @returns The value for the callback URL cookie, or null if no callback URL is present.
   */
  generateCallbackUrlCookie: (
    authorizationRequest: NextRequest
  ) => Awaitable<string | null>;
  /**
   * After a successful authorization, this function generates the base callback URL from
   * the request object, the callback URL cookie, and the tokens.
   *
   * You can use this to redirect the user to a specific page after authorization.
   *
   * @param callbackRequest The callback request object coming from bungie.net.
   * @param callbackUrlCookie The value of the callback URL cookie.
   * @param tokens The tokens returned from the authorization request.
   * @returns The url to redirect the user to after authorization.
   */
  generateCallbackUrl: (
    callbackRequest: NextRequest,
    callbackUrlCookie: string | null,
    tokens: BungieTokenResponse
  ) => Awaitable<string>;
  /**
   * After an error occurs during the authorization process, this function generates the
   * callback URL with the error type.
   *
   * @param callbackRequest The request object coming from bungie.net.
   * @param callbackUrlCookie The value of the callback URL cookie.
   * @param errorType The type of error that occurred.
   * @returns The url to redirect the user to after an error.
   */
  generateErrorCallbackUrl: (
    callbackRequest: NextRequest,
    callbackUrlCookie: string | null,
    errorType: "state_mismatch" | "token_error"
  ) => Awaitable<string>;
  /**
   * Side effects to run when a user is authorized. Could be used for additional logging, or
   * to trigger a webhook of some kind.
   *
   * Does not guarantee that the user has not already authorized in the past.
   */
  onAuthorize?: (bungieMembershipId: string) => void;
  /**
   * Callback which takes in the result of the request and logs it.
   */
  logRequest?: (
    path: "authorize" | "deauthorize" | "callback" | "session",
    status: "success" | "error" | "info" | "warn",
    message: string
  ) => void;
}

export interface BungieTokenResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  refresh_expires_in: number;
  membership_id: string;
}

/**
 * The data returned from the session API route.
 *
 * Dates are in seconds since epoch`.
 */
export interface NextBungieAuthSessionData {
  bungieMembershipId: string;
  accessToken: string;
  accessTokenExpiresIn: number;
}

export interface NextBungieAuthStaleSessionData {
  bungieMembershipId: string;
}

export type NextBungieAuthSessionResponse =
  | {
      status: "authorized";
      data: NextBungieAuthSessionData;
      message: string;
    }
  | {
      status: "stale";
      data: NextBungieAuthStaleSessionData;
      message: string;
    }
  | {
      status: "expired" | "unauthorized";
      data: null;
      message: string;
    }
  | {
      status: "error";
      data: null;
      message: string;
    }
  | {
      status: "disabled";
      data: NextBungieAuthStaleSessionData;
      message: string;
    };

/**
 * Options for the BungieSessionProvider.
 */
export interface BungieSessionProviderParams {
  children: React.ReactNode;
  initialSession?: NextBungieAuthSessionResponse;
  /**
   * The path to the refresh session API route.
   * @default "/api/auth/session"
   */
  sessionPath?: string;
  /**
   * The path to the deauthorize API route.
   * @default "/api/auth/signout"
   */
  deauthorizePath?: string;
  /**
   * When enabled, the session will automatically
   * refresh when the access token is about to expire.
   * @default true
   */
  enableAutomaticRefresh?: boolean;
  /**
   * When `enableAutomaticRefresh` is enabled and this argument
   * is set to true, the session will refresh even when the tab is in the background.
   * @default true
   */
  refreshInBackground?: boolean;
  /**
   * The time in seconds before the access token expires when calls to the session
   * endpoint will refresh the session.
   * @default 30_000 // (30 seconds)
   */
  timeBeforeRefresh?: number;
  /**
   * The min interval in milliseconds between automatic session refreshes.
   * @default 15_000 // (15 seconds)
   */
  refreshRateLimit?: number;
  /**
   * Handler errors that occur during the client-side session refresh.
   */
  onError?: (
    error: Error,
    type: "client" | "server" | "network",
    method: "refresh-session" | "terminate-session"
  ) => void;
  /**
   * A custom fetch function to use for the client-side session refresh.
   */
  fetchOverride?: typeof fetch;
}

export type BungieSessionError =
  | "bungie-api-offline"
  | "network"
  | "server"
  | "client";

export interface BaseBungieSessionState {
  status: "pending" | "authorized" | "stale" | "unauthorized" | "unavailable";
  data: NextBungieAuthSessionData | NextBungieAuthStaleSessionData | null;
  error: BungieSessionError | null;
  isFetching: boolean;
}

export interface PendingBungieSessionState extends BaseBungieSessionState {
  status: "pending";
  data: NextBungieAuthStaleSessionData | null;
}

export interface AuthorizedBungieSessionState extends BaseBungieSessionState {
  status: "authorized";
  data: NextBungieAuthSessionData;
  error: null;
}

export interface UnauthorizedBungieSessionState extends BaseBungieSessionState {
  status: "unauthorized";
  data: null;
}

export interface UnavailableBungieSessionState extends BaseBungieSessionState {
  status: "unavailable";
  data: NextBungieAuthStaleSessionData | NextBungieAuthSessionData | null;
  error: "bungie-api-offline";
}

export interface StaleBungieSessionState extends BaseBungieSessionState {
  status: "stale";
  data: NextBungieAuthStaleSessionData;
}

/**
 * The state of the Bungie session. It is a discriminated union type to allow type narrowing.
 *
 * A session can be in one of the following states:
 * - `pending` - The session is being fetched.
 * - `stale` - The session is stale, meaning there is no auth token but the data is available.
 * - `authorized` - The session is authorized and the data is available.
 * - `unauthorized` - There is no session and the data is null.
 * - `unavailable` - The session is unavailable at the moment and the data is available or stale.
 */
export type BungieSessionState =
  | PendingBungieSessionState
  | AuthorizedBungieSessionState
  | UnauthorizedBungieSessionState
  | StaleBungieSessionState
  | UnavailableBungieSessionState;

/**
 * Return type for the `useBungieSession` hook.
 */
export interface BungieSessionContext {
  session: BungieSessionState;
  /**
   * Refreshes the session.
   */
  refresh: () => Promise<void>;
  /**
   * Logs the user out by removing the session cookie.
   */
  terminate: () => Promise<void>;
}

export interface AuthorizedBungieSessionContext extends BungieSessionContext {
  session: AuthorizedBungieSessionState;
}

type Awaitable<T> = T | Promise<T>;
