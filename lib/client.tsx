"use client";

import React from "react";
import { useRouter } from "next/navigation";
import type {
  BungieSessionProviderParams,
  NextBungieAuthSessionResponse,
  BungieSession,
  BungieSessionState,
} from "./types";

// BEGIN STATE CONTEXTS

const AuthContext = React.createContext<BungieSession | undefined>(undefined);

const AuthorizedAuthContext = React.createContext<
  (BungieSession & { status: "authorized" }) | undefined
>(undefined);

// END STATE CONTEXTS

// BEGIN EXPORTED HOOKS

/**
 * Custom hook that returns the Next Bungie Auth Session.
 * @returns The Bungie session context.
 * @throws If used outside of a BungieSessionProvider.
 */
export const useBungieSession = (): BungieSession => {
  const ctx = React.useContext(AuthContext);
  if (ctx === undefined) {
    throw new Error(
      "useBungieSession must be used within a BungieSessionProvider"
    );
  }
  return ctx;
};

/**
 * Custom hook that returns the Next Bungie Auth Session.
 */
export const useAuthorizedBungieSession = (): BungieSession & {
  status: "authorized";
} => {
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
  sessionPath = "/api/auth/session",
  deauthorizePath = "/api/auth/deauthorize",
  refreshPath = "/api/auth/refresh",
  enableAutomaticRefresh = true,
  refreshInBackground = true,
  fetchOverride: customFetch = fetch,
  timeBeforeRefresh = 30000,
  refreshRateLimit = 15000,
  onError,
}: BungieSessionProviderParams) => {
  const [isOnline, setIsOnline] = React.useState(true);
  const [isVisible, setIsVisible] = React.useState(true);
  const isUpdatingSession = React.useRef<boolean>(false);
  const isDeauthorizing = React.useRef<boolean>(false);
  const [lastSuccessfulRefresh, setLastSuccessfulRefresh] = React.useState(0);

  const [session, setSession] = React.useState<BungieSessionState>(() => {
    if (initialSession === undefined) {
      return {
        status: "pending",
        isPending: true,
        isFetching: true,
        isError: false,
        data: null,
        error: undefined,
      };
    } else {
      return deriveStateFromServer({
        prevSession: null,
        session: initialSession,
      });
    }
  });

  const fetchAndUpdateSession = React.useCallback(
    (refresh = false) => {
      if (isUpdatingSession.current) {
        return;
      }

      isUpdatingSession.current = true;
      setSession((prev) => deriveLoadingState({ previous: prev }));

      customFetch(refresh ? refreshPath : sessionPath, {
        method: refresh ? "POST" : "GET",
      })
        .then(async (res) => {
          try {
            if (res.status === 404) {
              throw new Error(
                `${refresh ? "Refresh" : "Session"} route not found`,
                {
                  cause: res,
                }
              );
            }

            if (
              !res.headers.get("content-type")?.includes("application/json")
            ) {
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

            if (refresh) {
              setLastSuccessfulRefresh(Date.now());
            }

            setSession((prev) =>
              deriveStateFromServer({
                prevSession: prev,
                session: session as NextBungieAuthSessionResponse,
              })
            );
          } catch (err) {
            // Handle server errors
            if (res.status >= 500) {
              setSession((prev) =>
                deriveErrorState({
                  previous: prev,
                  error: "server",
                })
              );
              onError?.(err as Error, "server");
            } else {
              // Re-throw errors that are not server errors
              throw err;
            }
          }
        })
        .catch((err: Error) => {
          // Handle network and client side errors
          const errType = isNetworkError(err) ? "network" : "client";
          setSession((prev) =>
            deriveErrorState({
              previous: prev,
              error: errType,
            })
          );
          onError?.(err, errType);
        })
        .finally(() => {
          isUpdatingSession.current = false;
        });
    },
    [isUpdatingSession, customFetch, sessionPath, onError]
  );

  const deauthorize = React.useCallback(() => {
    if (isDeauthorizing.current) {
      return;
    }

    isDeauthorizing.current = true;
    setSession((prev) =>
      deriveLoadingState({
        previous: prev,
      })
    );

    customFetch(deauthorizePath, {
      method: "POST",
    })
      .then(() => {
        setSession({
          status: "unauthorized",
          isPending: false,
          isFetching: false,
          isError: false,
          data: null,
          error: undefined,
        });
      })
      .catch((err: Error) => {
        const errType = isNetworkError(err) ? "network" : "client";
        onError?.(err, errType);
        setSession((prev) =>
          deriveErrorState({
            previous: prev,
            error: errType,
          })
        );
      })
      .finally(() => {
        isDeauthorizing.current = false;
      });
  }, [deauthorizePath, customFetch, onError, fetchAndUpdateSession]);

  /**
   * Calculates the time until the next session refresh.
   * Returns false to indicate that the session should not be refreshed.
   */
  const calculateMsToNextRefresh = React.useCallback(
    (session: BungieSessionState): number | false => {
      const minWaitForRefresh = lastSuccessfulRefresh
        ? Math.max(
            0,
            refreshRateLimit - Math.max(0, Date.now() - lastSuccessfulRefresh)
          )
        : 0;

      switch (session.status) {
        case "stale":
          return minWaitForRefresh;
        case "authorized":
          return Math.max(
            session.isError ? 60_000 : minWaitForRefresh,
            new Date(session.data.accessTokenExpiresAt).getTime() -
              timeBeforeRefresh -
              Date.now()
          );
        case "unavailable":
          return 5 * 60_000;
        case "pending":
        case "unauthorized":
          return false;
      }
    },
    [timeBeforeRefresh, lastSuccessfulRefresh]
  );

  React.useEffect(() => {
    if (session.status === "pending") {
      // Fetch the session if it is pending, the fetch will be skipped if the session is already being fetched
      fetchAndUpdateSession(false);
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
          () => fetchAndUpdateSession(true),
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
        fetchAndUpdateSession(true);
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

  // These methods are memoized to prevent unnecessary re-renders but also act as wrappers
  // asto not expose them to the consumer

  const refresh = React.useCallback(
    () => fetchAndUpdateSession(true),
    [fetchAndUpdateSession]
  );
  const kill = React.useCallback(() => deauthorize(), [deauthorize]);

  return (
    <AuthContext.Provider
      value={{
        ...session,
        refresh,
        kill,
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
  onUnauthorized?: (
    session: BungieSession & { status: "unauthorized" }
  ) => void;
  onUnavailable?: (session: BungieSession & { status: "unavailable" }) => void;
  fallback: (
    state: BungieSession & {
      status: "unauthorized" | "unavailable" | "stale" | "pending";
    }
  ) => React.ReactNode;
}) => {
  const router = useRouter();
  const session = React.useContext(AuthContext);
  const onUnauthorizedRef = React.useRef(onUnauthorized); // Store the callback in a ref to avoid effects when it changes
  const onUnavailableRef = React.useRef(onUnavailable);

  if (session === undefined) {
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
    if (session.status === "unauthorized" && onUnauthorizedRef.current) {
      onUnauthorizedRef.current(session);
    }
  }, [router, session]);

  if (session.status !== "authorized") {
    return fallback(session);
  }

  return (
    <AuthorizedAuthContext.Provider value={session}>
      {children}
    </AuthorizedAuthContext.Provider>
  );
};

// END CONTEXT PROVIDERS

// BEGIN STATE DERIVATION FUNCTIONS

function deriveErrorState({
  previous,
  error,
}: {
  previous: BungieSessionState;
  error: "client" | "server" | "network";
}): BungieSessionState {
  return {
    status:
      previous.isPending || previous.status === "unavailable"
        ? "unauthorized"
        : previous.status,
    isPending: false,
    isFetching: false,
    isError: true,
    data: previous.data,
    error,
  } as BungieSessionState;
}

function deriveLoadingState({
  previous,
}: {
  previous: BungieSessionState;
}): BungieSessionState {
  if (previous.status === "authorized" && previous.isError) {
    return {
      status: "unavailable",
      isPending: false,
      isFetching: false,
      isError: true,
      data: previous.data,
      error: previous.error,
    };
  }

  switch (previous.status) {
    case "pending":
      return {
        status: "pending",
        isPending: true,
        isFetching: true,
        isError: false,
        data: null,
        error: undefined,
      };
    case "stale":
      return {
        status: previous.status,
        isPending: true,
        isFetching: true,
        isError: previous.isError,
        data: previous.data,
        error: previous.error,
      };
    case "authorized":
    case "unauthorized":
    case "unavailable":
      return {
        status: previous.status,
        isPending: false,
        isFetching: true,
        isError: previous.isError,
        data: previous.data,
        error: previous.error,
      } as BungieSessionState;
  }
}

type DecodedServerResponseSessionState = BungieSessionState & {
  error: undefined | "server" | "bungie-api-offline";
};
function deriveStateFromServer({
  prevSession,
  session,
}: {
  prevSession: BungieSessionState | null;
  session: NextBungieAuthSessionResponse;
}): DecodedServerResponseSessionState {
  switch (session.status) {
    case "authorized":
      return {
        status: "authorized",
        isPending: false,
        isFetching: false,
        isError: false,
        data: session.data,
        error: undefined,
      };
    case "stale":
      return {
        status: "stale",
        isPending: true,
        isFetching: false,
        isError: false,
        data: session.data,
        error: undefined,
      };
    case "unauthorized":
    case "expired":
      return {
        status: "unauthorized",
        isPending: false,
        isFetching: false,
        isError: false,
        data: session.data,
        error: undefined,
      };
    case "error":
      return {
        status:
          !prevSession || prevSession.isPending
            ? "unauthorized"
            : prevSession.status,
        isPending: false,
        isFetching: false,
        isError: true,
        data:
          !prevSession?.data || prevSession.isPending ? null : prevSession.data,
        error: "server",
      } as DecodedServerResponseSessionState;
    case "disabled":
      return {
        status: "unavailable",
        isPending: false,
        isFetching: false,
        isError: true,
        data: session.data,
        error: "bungie-api-offline",
      };
  }
}

function isNetworkError(err: Error): err is TypeError {
  return err instanceof TypeError && !navigator.onLine;
}
