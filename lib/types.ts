import type { ResponseCookie } from "next/dist/compiled/@edge-runtime/cookies";
import type { NextRequest, NextResponse } from "next/server";

export type NextBungieAuth = {
  /**
   * The Next.js API routes for Bungie OAuth. These routes should be destructured and exported
   * in a route handler file.
   */
  handlers: {
    /**
     * Redirects the user to the Bungie OAuth page.
     */
    authorizeGET: (request: NextRequest) => never;
    /**
     * Deauthorizes the user's Bungie OAuth session.
     */
    deauthorizePOST: (
      request: NextRequest
    ) => NextResponse<NextBungieAuthSessionResponse>;
    /**
     * Handles the callback from the Bungie OAuth page.
     */
    callbackGET: (request: NextRequest) => Promise<never>;
    /**
     * Retrieves the user's Bungie OAuth session. Refreshes the session
     * if the `minimumRefreshInterval` has passed, if the auth token is expired,
     * or if ?force=true is passed.
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
    clearServerSession: () => void;
    /**
     * Requests new tokens from the Bungie API.
     */
    requestNewTokens: (
      grantType: "authorization_code" | "refresh_token",
      value: string
    ) => Promise<BungieTokenResponse>;
    /**
     * Updates the server session with new tokens.
     */
    updateServerSession: (
      tokens: BungieTokenResponse,
      iat: Date
    ) => Promise<void>;
    /**
     * Synchronously retrieves the current server session from the request cookies.
     * Does not refresh the session, so it may be expired.
     */
    getServerSession: () => NextBungieAuthSessionResponse;
    /**
     * Retrieves the current server session from the cookies and refreshes it if expired.
     * Can only be called from an API route or a server-action.
     *
     * @param opts.force - If true, the session will be refreshed even if it is not expired
     * and outside the grace period.
     */
    getRefreshedServerSession: (opts: { force: boolean }) => Promise<{
      session: NextBungieAuthSessionResponse;
      message: string;
    }>;
  };
};

export type NextBungieAuthConfigRequiredKeys =
  | "clientId"
  | "clientSecret"
  | "generateState";

/**
 * Configuration options for NextBungieAuth.
 */
export type NextBungieAuthConfig = {
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
    path: "authorize" | "deauthorize" | "callback" | "session",
    success: boolean,
    message?: string
  ) => void;
};

export type BungieTokenResponse = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  refresh_expires_in: number;
  membership_id: string;
};

/**
 * The data returned from the session API route.
 *
 * Dates are in seconds since epoch`.
 */
export type NextBungieAuthSessionData = {
  bungieMembershipId: string;
  accessToken: string;
  accessTokenExpiresAt: string;
};

export type NextBungieAuthSaleSessionData = {
  bungieMembershipId: string;
};

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
export type BungieSessionProviderParams = {
  children: React.ReactNode;
  initialSession?: NextBungieAuthSessionResponse;
  /**
   * The path to the session API route.
   */
  sessionPath: string;
  /**
   * The path to the deauthorize API route.
   */
  deauthorizePath: string;
  /**
   * Default `true`. When enabled, the session will automatically
   * refresh when the access token is about to expire.
   */
  enableAutomaticRefresh?: boolean;
  /**
   * Default `true`. When `enableAutomaticRefresh` is enabled and this argument
   * is set to true, the session will refresh even when the tab is in the background.
   */
  refreshInBackground?: boolean;
  /**
   * Handler errors that occur during the client-side session refresh.
   */
  onError?: (error: Error, type: "client" | "server" | "network") => void;
  /**
   * A custom fetch function to use for the client-side session refresh.
   */
  fetchOverride?: typeof fetch;
};

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
 * - `authorized` - The session is authorized and the data is available.
 * - `unauthorized` - There is no session and the data is null.
 * - `unavailable` - The session is unavailable at the moment and the data is available or stale.
 */
export type BungieSessionState = (
  | {
      status: "pending";
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
