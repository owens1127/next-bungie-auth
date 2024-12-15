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
     * Retrieves the user's Bungie OAuth session.
     */
    sessionGET: (
      request: NextRequest
    ) => Promise<NextResponse<NextBungieAuthSessionResponse>>;
    /**
     * Refreshes the user's Bungie OAuth session.
     */
    refreshPOST: (
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
    ) => void;
    /**
     * Synchronously retrieves the current server session from the request cookies.
     * Does not refresh the session, so it may be expired.
     */
    getServerSession: (
      cookies: ReadonlyRequestCookies
    ) => NextBungieAuthSessionResponse;
    /**
     * Retrieves the current server session from the cookies and refreshes.
     * Can only be called from an API route or a server-action.
     */
    getRefreshedServerSession: (cookies: ReadonlyRequestCookies) => Promise<{
      session: NextBungieAuthSessionResponse;
      message: string;
    }>;
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
   * The time in seconds before the access token expires when calls to the session
   * endpoint will refresh the session.
   *
   * Calls to the session endpoint without `force=true` will not refresh the session if
   * the access token expires in greater than this time.
   *
   * Defaults to 300 seconds (5 minutes).
   */
  sessionRefreshGracePeriod: number;
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
   * Function to generate a state for the OAuth request.
   * @param request - The NextRequest object.
   * @returns The state string.
   */
  generateState: (request: NextRequest) => string;
  /**
   * Function to make HTTP request given the parameters.
   * Defaults to a fetch request using the native fetch API to the Bungie API.
   *
   * @returns A promise that resolves to the Bungie token response.
   * @throws BungieAuthorizationError | Error
   */
  tokenHttp: (params: {
    clientId: string;
    clientSecret: string;
    grantType: "authorization_code" | "refresh_token";
    grantKey: "code" | "refresh_token";
    value: string;
  }) => Promise<Response>;
  /**
   * Callback function to log events as you wish.
   */
  logRequest: (
    path: "authorize" | "deauthorize" | "callback" | "session" | "refresh",
    success: boolean,
    message?: string
  ) => void;
  /**
   * Generates an error callback URL for the client when the authorization fails.
   *
   * @param callbackUrl The normal callback URL.
   * @param errorType The type of error that occurred.
   * @returns
   */
  generateErrorCallbackUrl: (
    callbackUrl: string,
    errorType: "state_mismatch" | "token_error"
  ) => string;
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
  accessTokenExpiresAt: string;
}

export interface NextBungieAuthSaleSessionData {
  bungieMembershipId: string;
}

export type NextBungieAuthSessionResponse =
  | {
      status: "expired" | "unauthorized" | "error";
      data: null;
    }
  | {
      status: "stale" | "disabled";
      data: NextBungieAuthSaleSessionData;
    }
  | {
      status: "authorized";
      data: NextBungieAuthSessionData;
    };

/**
 * Options for the BungieSessionProvider.
 */
export interface BungieSessionProviderParams {
  children: React.ReactNode;
  initialSession?: NextBungieAuthSessionResponse;
  /**
   * The path to the session API route.
   * @default "/api/auth/session"
   */
  sessionPath?: string;
  /**
   * The path to the refresh session API route.
   * @default "/api/auth/refresh"
   */
  refreshPath?: string;
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
   * Handler errors that occur during the client-side session refresh.
   */
  onError?: (error: Error, type: "client" | "server" | "network") => void;
  /**
   * A custom fetch function to use for the client-side session refresh.
   */
  fetchOverride?: typeof fetch;
}

/**
 * Return type for the `useBungieSession` hook.
 */
export type BungieSession = BungieSessionState & {
  /**
   * Refreshes the session. If `force` is false (default), the session will only refresh from bungie.net
   * when expired or inside the grace period.
   */
  refresh: (force?: boolean) => void;
  /**
   * Logs the user out by removing the session cookie.
   */
  kill: () => void;
};

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
export type BungieSessionState = (
  | {
      status: "pending";
      isPending: true;
      isFetching: true;
      isError: false;
      error: undefined;
      data: null;
    }
  | {
      status: "stale";
      isPending: true;
      isFetching: boolean;
      isError: false;
      error: undefined;
      data: null | NextBungieAuthSaleSessionData;
    }
  | {
      status: "authorized";
      isPending: false;
      isFetching: boolean;
      isError: boolean;
      data: NextBungieAuthSessionData;
    }
  | {
      status: "unauthorized";
      isPending: false;
      isFetching: boolean;
      isError: boolean;
      data: null;
    }
  | {
      status: "unavailable";
      isPending: false;
      isFetching: boolean;
      isError: true;
      data: NextBungieAuthSaleSessionData;
    }
) &
  (
    | {
        isError: true;
        error: "bungie-api-offline" | "network" | "server" | "client";
      }
    | {
        isError: false;
        error: undefined;
      }
  );
