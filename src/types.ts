import type { ResponseCookie } from "next/dist/compiled/@edge-runtime/cookies";
import type { NextRequest } from "next/server";

export type NextBungieAuth = {
  /**
   * The Next.js API routes for Bungie OAuth. These routes should be destructured and exported
   * in a route handler file.
   */
  handlers: {
    /**
     * Redirects the user to the Bungie OAuth page.
     */
    authorizeGET: (request: NextRequest) => void;
    /**
     * Deauthorizes the user's Bungie OAuth session.
     */
    deauthorizePOST: (request: NextRequest) => void;
    /**
     * Handles the callback from the Bungie OAuth page.
     */
    callbackGET: (request: NextRequest) => void;
    /**
     * Retrieves the user's Bungie OAuth session. Refreshes the session
     * if the `minimumRefreshInterval` has passed, if the auth token is expired,
     * or if ?force=true is passed.
     */
    sessionGET: (request: NextRequest) => void;
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
     * Retrieves the current server session. Does not refresh the session.
     */
    getServerSession: () => Promise<NextBungieAuthSessionResponse>;
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
   * The minimum time to wait in seconds before refreshing the valid auth token.
   * Defaults to 1800 seconds (30 minutes).
   */
  minimumRefreshInterval: number;
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
   * Method to encode the session into a string.
   * Defaults to base64 encoding.
   */
  encode: (data: NextBungieAuthJWTPayload) => Promise<string>;
  /**
   * Method to decode the session from a string.
   * Defaults to base64 decoding.
   */
  decode: (token: string) => Promise<NextBungieAuthJWTPayload>;
  /**
   * Function to generate a state for the OAuth request.
   * @param request - The NextRequest object.
   * @returns The state string.
   */
  generateState: (request: NextRequest) => string;
  /**
   * Callback function to determine the callback URL for the OAuth request.
   * Defaults to the origin of the request URL.
   * @param request - The NextRequest object.
   * @returns The NextResponse object or void.
   */
  getCallbackURL: (request: NextRequest) => string;
  /**
   * Function to make HTTP request given the search parameters.
   * Defaults to a fetch request using the native fetch API to the Bungie API.
   *
   * IMPORTANT: The function must throw a `BungieAuthorizationError` if the API returns a known error.
   *
   * @returns A promise that resolves to the Bungie token response.
   * @throws BungieAuthorizationError | Error
   */
  tokenHttp: (searchParams: URLSearchParams) => Promise<BungieTokenResponse>;
  /**
   * Callback function to log errors as you wish.
   */
  logError: (
    path: "authorize" | "deauthorize" | "callback" | "session",
    error: Error,
    state?: string
  ) => void;
  /**
   * Callback function to log events as you wish.
   */
  logResponse: (
    path: "authorize" | "deauthorize" | "callback" | "session",
    statusCode: number,
    state?: string
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

export type NextBungieAuthJWTPayload = {
  bungie: BungieTokenResponse;
  iat: number;
  exp: number;
};

/**
 * The data returned from the session API route.
 *
 * Dates are in ISO 8601 format and can be parsed with `new Date(dateString)`.
 */
export type NextBungieAuthSessionData = {
  bungieMembershipId: string;
  accessToken: string;
  accessTokenExpires: string;
  refreshToken: string;
  refreshTokenExpires: string;
  minted: string;
};

export type NextBungieAuthSessionResponse =
  | {
      status: "unauthorized" | "error";
      data: null;
    }
  | {
      status: "authorized" | "bungie-api-offline";
      data: NextBungieAuthSessionData;
    }
  | {
      status: "authorized" | "bungie-api-offline";
      data: NextBungieAuthSessionData;
    };

/**
 * Options for the BungieSessionProvider.
 *
 * @param sessionPath - The path to the session API route.
 * @param deauthorizePath - The path to the deauthorize API route.
 * @param initialSession - An optional (recommended) initial session fetched server-side. Saves
 * a round trip to the server.
 * @param enableAutomaticRefresh - Default `true`. When enabled, the session will automatically
 * refresh when the access token is about to expire.
 * @param fetchOverride - An optional override instead of the default browser implementation
 * of `fetch`.
 *
 */
export type BungieSessionProviderOptions = {
  children: React.ReactNode;
  sessionPath: string;
  deauthorizePath: string;
  initialSession?: NextBungieAuthSessionResponse;
  enableAutomaticRefresh?: boolean;
  onError?: (error: Error, type: "client" | "server" | "network") => void;
  fetchOverride?: typeof fetch;
};

/**
 * Return type for the `useBungieSession` hook.
 */
export type BungieSession = BungieSessionState & {
  /**
   * Ends the session and optionally reloads the page.
   */
  end: (reload?: boolean) => void;
  /**
   * Refreshes the session. If `soft` is true, the session will only refresh expired or if config allows.
   */
  refresh: (soft?: boolean) => void;
};

/**
 * The state of the Bungie session. It is a discriminated union type to allow type narrowing.
 */
export type BungieSessionState = {
  isPending: boolean;
  isFetching: boolean;
  data: null | NextBungieAuthSessionData;
} & (
  | {
      isError: true;
      error: "bungie-api-offline" | "network" | "server" | "client";
    }
  | {
      isError: false;
      error: undefined;
    }
) &
  (
    | {
        status: "pending";
        isPending: true;
        isError: false;
        data: null;
      }
    | {
        status: "unauthorized";
        isPending: false;
        data: null;
      }
    | {
        status: "authorized";
        isPending: false;
        data: NextBungieAuthSessionData;
      }
  );
