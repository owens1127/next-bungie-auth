"use client";

import React from "react";
import { useRouter } from "next/navigation";
import type {
  BungieSessionProviderParams,
  NextBungieAuthSessionResponse,
  BungieSessionState,
  UnavailableBungieSessionState,
  UnauthorizedBungieSessionState,
  BungieSessionContext,
  AuthorizedBungieSessionContext,
  AuthorizedBungieSessionState,
} from "./types";

// BEGIN STATE CONTEXTS

const AuthContext = React.createContext<BungieSessionContext | undefined>(
  undefined
);

const AuthorizedAuthContext = React.createContext<
  AuthorizedBungieSessionContext | undefined
>(undefined);

// END STATE CONTEXTS

// BEGIN EXPORTED HOOKS

/**
 * Provides the Bungie to a client component.
 * @returns The Bungie session context.
 * @throws If used outside of a BungieSessionProvider.
 */
export const useBungieSession = () => {
  const ctx = React.useContext(AuthContext);
  if (ctx === undefined) {
    throw new Error(
      "useBungieSession must be used within a BungieSessionProvider"
    );
  }
  return ctx;
};

/**
 * Provides an authorized Bungie session to a client component.
 */
export const useAuthorizedBungieSession = () => {
  const ctx = React.useContext(AuthorizedAuthContext);
  if (ctx === undefined) {
    throw new TypeError(
      "useAuthorizedBungieSession must be used within a BungieSessionSuspender"
    );
  }
  return ctx;
};

// END EXPORTED HOOKS

// BEGIN CONTEXT PROVIDERS

/**
 * BungieSessionProvider is a React component that provides Bungie session management functionality.
 * It manages the session state, handles session refresh, and provides methods for deauthorization.
 *
 * NOTE: This this component must be wrapped within a client component if any functional
 * (non-serializable) arguments are passed in as props.
 *
 * @component
 * @example
 * ```tsx
 * <BungieSessionProvider
 *   initialSession={serverSession}
 *   onError={(err, type) => console.error(err, type)}
 * >
 *   <App />
 * </BungieSessionProvider>
 * ```
 */
export const BungieSessionProvider = ({
  children,
  initialSession,
  deauthorizePath = "/api/auth/deauthorize",
  sessionPath = "/api/auth/session",
  enableAutomaticRefresh = true,
  refreshInBackground = true,
  fetchOverride = fetch,
  timeBeforeRefresh = 30000,
  refreshRateLimit = 15000,
  onError,
}: BungieSessionProviderParams) => {
  const [isOnline, setIsOnline] = React.useState(true);
  const [isVisible, setIsVisible] = React.useState(true);
  const isUpdatingSession = React.useRef<boolean>(false);
  const isDeauthorizing = React.useRef<boolean>(false);
  const sessionUpdatedAt = React.useRef<number>(0);

  const [session, setSession] = React.useState<BungieSessionState>(() => {
    if (initialSession === undefined) {
      return {
        status: "pending",
        isFetching: true,
        data: null,
        error: null,
      };
    } else {
      return deriveResponseState({
        previousState: null,
        incomingSession: initialSession,
      });
    }
  });

  const fetchAndUpdateSession = React.useCallback(async () => {
    if (isUpdatingSession.current) {
      return;
    }

    isUpdatingSession.current = true;
    setSession(deriveLoadingState);

    await fetchOverride(sessionPath, {
      method: "GET",
    })
      .then(async (res) => {
        try {
          if (res.status === 404) {
            throw new Error("Refresh route not found", {
              cause: res,
            });
          }

          if (!res.headers.get("content-type")?.includes("application/json")) {
            throw new Error("Invalid response content type", {
              cause: {
                contentType: res.headers.get("content-type"),
              },
            });
          }

          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          const session = await res.json();

          if (
            typeof session !== "object" ||
            !("status" in session) ||
            !("data" in session)
          ) {
            throw new Error("Invalid response body", {
              cause: session,
            });
          }

          setSession((prev) =>
            deriveResponseState({
              previousState: prev,
              incomingSession: session as NextBungieAuthSessionResponse,
            })
          );
        } catch (err) {
          // Handle server errors
          if (res.status >= 500) {
            setSession((prev) => deriveErrorState(prev, "server"));
            onError?.(err as Error, "server", "refresh-session");
          } else {
            // Re-throw errors that are not server errors
            throw err;
          }
        }
      })
      .catch((err: Error) => {
        // Handle network and client side errors
        setSession((prev) => deriveErrorState(prev, "client"));
        onError?.(err, "client", "refresh-session");
      })
      .finally(() => {
        isUpdatingSession.current = false;
        sessionUpdatedAt.current = Date.now();
      });
  }, [isUpdatingSession, fetchOverride, sessionPath, onError]);

  const deauthorize = React.useCallback(async () => {
    if (isDeauthorizing.current) {
      return;
    }

    isDeauthorizing.current = true;
    setSession(deriveLoadingState);

    await fetchOverride(deauthorizePath, {
      method: "POST",
    })
      .then(() => {
        setSession({
          status: "unauthorized",
          isFetching: false,
          data: null,
          error: null,
        });
      })
      .catch((err: Error) => {
        onError?.(err, "client", "terminate-session");
        setSession((prev) => deriveErrorState(prev, "client"));
      })
      .finally(() => {
        isDeauthorizing.current = false;
        sessionUpdatedAt.current = Date.now();
      });
  }, [deauthorizePath, fetchOverride, onError, fetchAndUpdateSession]);

  /**
   * Calculates the time until the next session refresh.
   * Returns false to indicate that the session should not be refreshed.
   */
  const calculateMsToNextRefresh = React.useCallback(
    (session: BungieSessionState): number | false => {
      const rateLimitedDelay = sessionUpdatedAt.current
        ? Math.max(
            0,
            refreshRateLimit -
              Math.max(0, Date.now() - sessionUpdatedAt.current)
          )
        : 0;

      switch (session.status) {
        case "authorized":
          return Math.max(
            rateLimitedDelay,
            sessionUpdatedAt.current +
              session.data.accessTokenExpiresIn -
              timeBeforeRefresh
          );
        case "pending":
        case "stale":
          return rateLimitedDelay;
        case "unavailable":
        case "unauthorized":
          return false;
      }
    },
    [timeBeforeRefresh, sessionUpdatedAt]
  );

  React.useEffect(() => {
    if (session.status === "pending") {
      // Fetch the session if it is pending, the fetch will be skipped if the session is already being fetched
      void fetchAndUpdateSession();
      return;
    }

    if (
      enableAutomaticRefresh &&
      isOnline &&
      (isVisible || refreshInBackground)
    ) {
      const timeoutTime = calculateMsToNextRefresh(session);
      if (timeoutTime !== false) {
        const timeout = setTimeout(
          () => void fetchAndUpdateSession(),
          timeoutTime
        );
        return () => clearTimeout(timeout);
      }
    }
  }, [
    session,
    fetchAndUpdateSession,
    enableAutomaticRefresh,
    calculateMsToNextRefresh,
    isOnline,
    isVisible,
    refreshInBackground,
  ]);

  // Attach event listeners for visibility and online status
  React.useEffect(() => {
    const handleVisibilityChange = () => {
      setIsVisible(document.visibilityState === "visible");
    };

    const handleOnlineChange = () => {
      setIsOnline(navigator.onLine);

      if (navigator.onLine) {
        void fetchAndUpdateSession();
      }
    };

    window.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleOnlineChange);
    window.addEventListener("offline", handleOnlineChange);

    return () => {
      window.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnlineChange);
      window.removeEventListener("offline", handleOnlineChange);
    };
  }, [fetchAndUpdateSession]);

  return (
    <AuthContext.Provider
      value={{
        session,
        refresh: fetchAndUpdateSession,
        terminate: deauthorize,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

/**
 * Within this component, the children will only be rendered even when
 * the session is authorized.
 *
 * This allows you to use the `useAuthorizedBungieSession` hook which guarantees
 * the session is authorized in your components.
 *
 * If a onUnauthorized is provided and the session is unauthorized, the function
 * will be called. Commonly used for redirects sign-in pages.
 *
 * If onUnavailable is provided and the session is unavailable, the function
 * will be called. Commonly used for redirects to a maintenance page or to display
 * a message to the user.
 */
export const BungieSessionSuspender = ({
  onUnauthorized,
  onUnavailable,
  fallback,
  children,
}: {
  children: React.ReactNode;
  onUnauthorized?: (state: UnauthorizedBungieSessionState) => void;
  onUnavailable?: (state: UnavailableBungieSessionState) => void;
  fallback: (
    state: Exclude<BungieSessionState, AuthorizedBungieSessionState>
  ) => React.ReactNode;
}) => {
  const router = useRouter();
  const sessionCtx = React.useContext(AuthContext);
  const onUnauthorizedRef = React.useRef(onUnauthorized);
  const onUnavailableRef = React.useRef(onUnavailable);

  if (sessionCtx === undefined) {
    throw new TypeError(
      "BungieSessionSuspender must be a child of a BungieSessionProvider"
    );
  }

  React.useEffect(() => {
    onUnauthorizedRef.current = onUnauthorized;
  }, [onUnauthorized]);

  React.useEffect(() => {
    onUnavailableRef.current = onUnavailable;
  }, [onUnavailable]);

  React.useEffect(() => {
    if (
      sessionCtx.session.status === "unauthorized" &&
      onUnauthorizedRef.current
    ) {
      onUnauthorizedRef.current(sessionCtx.session);
    }
  }, [router, sessionCtx.session]);

  if (sessionCtx.session.status !== "authorized") {
    return fallback(sessionCtx.session);
  }

  return (
    <AuthorizedAuthContext.Provider
      value={sessionCtx as AuthorizedBungieSessionContext}
    >
      {children}
    </AuthorizedAuthContext.Provider>
  );
};

// END CONTEXT PROVIDERS

// BEGIN STATE DERIVATION FUNCTIONS

function deriveResponseState({
  previousState: prevState,
  incomingSession,
}: {
  previousState: BungieSessionState | null;
  incomingSession: NextBungieAuthSessionResponse;
}): BungieSessionState {
  switch (incomingSession.status) {
    case "authorized":
      return {
        status: "authorized",
        isFetching: false,
        data: incomingSession.data,
        error: null,
      };
    case "stale":
      return {
        status: !prevState ? "pending" : "stale",
        isFetching: false,
        data: incomingSession.data,
        error: null,
      };
    case "unauthorized":
    case "expired":
      return {
        status: "unauthorized",
        isFetching: false,
        data: null,
        error: null,
      };
    case "error":
      return deriveErrorState(prevState, "server");
    case "disabled":
      return {
        status: "unavailable",
        isFetching: false,
        error: "bungie-api-offline",
        data: prevState?.data ?? null,
      };
  }
}

function deriveLoadingState(
  previousState: BungieSessionState
): BungieSessionState {
  return {
    ...previousState,
    isFetching: true,
  };
}

function deriveErrorState(
  previousState: BungieSessionState | null,
  error: "client" | "server"
): BungieSessionState {
  if (
    !previousState ||
    previousState.status === "pending" ||
    previousState.status === "unavailable" ||
    previousState.status === "unauthorized"
  ) {
    return {
      status: "unauthorized",
      isFetching: false,
      data: null,
      error,
    };
  }

  if (previousState.status === "authorized") {
    return {
      status: "unauthorized",
      isFetching: false,
      data: null,
      error,
    };
  }

  return {
    ...previousState,
    error,
    isFetching: false,
  };
}
