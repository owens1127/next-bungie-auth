"use client";

import React from "react";
import type {
  BungieSessionProviderParams,
  NextBungieAuthSessionResponse,
  BungieSession,
  BungieSessionState,
} from "./types";
import { useRouter } from "next/navigation";

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
 *   sessionPath="/api/auth/session"
 *   deauthorizePath="/api/auth/signout"
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
  sessionPath,
  deauthorizePath,
  enableAutomaticRefresh = true,
  refreshInBackground = true,
  fetchOverride: customFetch = fetch,
  onError,
}: BungieSessionProviderParams) => {
  const [isOnline, setIsOnline] = React.useState(true);
  const [isVisible, setIsVisible] = React.useState(true);
  const isFetching = React.useRef<boolean>(false);
  const isDeauthorizing = React.useRef<boolean>(false);

  const [session, setSession] = React.useState<BungieSessionState>(() => {
    if (initialSession === undefined) {
      return {
        status: "pending",
        isPending: true,
        isFetching: false,
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
    (force: boolean = false) => {
      if (isFetching.current) {
        return;
      }

      isFetching.current = true;
      setSession((prev) => deriveLoadingState({ previous: prev }));

      const path = force ? `${sessionPath}?force=true` : sessionPath;
      customFetch(path, {
        method: "GET",
      })
        .then(async (res) => {
          try {
            if (
              !res.headers.get("content-type")?.includes("application/json")
            ) {
              throw new Error("Invalid content type", {
                cause: res,
              });
            }

            const session: NextBungieAuthSessionResponse = await res.json();
            setSession((prev) =>
              deriveStateFromServer({
                prevSession: prev,
                session,
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
            } else {
              throw err;
            }
          }
        })
        .catch((err: Error) => {
          // Handle network and client side errors
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
          isFetching.current = false;
        });
    },
    [isFetching, customFetch, sessionPath, onError]
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
      .catch((err) => {
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
   * Returns 0 to indicate that the session should not be refreshed.
   */
  const calculateMsToNextRefresh = React.useCallback(
    (session: BungieSessionState): number => {
      switch (session.status) {
        case "authorized":
          return Math.max(
            1,
            new Date(session.data.accessTokenExpiresAt).getTime() -
              30000 -
              Date.now()
          );
        case "unavailable":
          return 5 * 60000;
        case "pending":
        case "unauthorized":
          return 0;
      }
    },
    []
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
      if (timeoutTime > 0) {
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
    };

    window.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleOnlineChange);
    window.addEventListener("offline", handleOnlineChange);

    return () => {
      window.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnlineChange);
      window.removeEventListener("offline", handleOnlineChange);
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        ...session,
        refresh: fetchAndUpdateSession,
        kill: deauthorize,
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
 * If a onUnauthorized is provided and the session is unauthorized, function
 * will be called. Commonly used for redirects sign-in pages.
 */
export const BungieSessionSuspender = ({
  onUnauthorized,
  fallback,
  children,
}: {
  children: React.ReactNode;
  onUnauthorized?: (
    session: BungieSession & { status: "unauthorized" }
  ) => void;
  fallback: (
    state: BungieSession & {
      status: "unauthorized" | "unavailable" | "pending";
    }
  ) => React.ReactNode;
}) => {
  const router = useRouter();
  const session = React.useContext(AuthContext);
  const onUnauthorizedRef = React.useRef(onUnauthorized); // Store the callback in a ref to avoid effects when it changes

  if (session === undefined) {
    throw new TypeError(
      "BungieSessionSuspender must be a child of a BungieSessionProvider"
    );
  }

  React.useEffect(() => {
    onUnauthorizedRef.current = onUnauthorized;
  }, [onUnauthorized]);

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
        status: "pending",
        isPending: true,
        isFetching: false,
        isError: false,
        data: session.data,
      } as DecodedServerResponseSessionState;
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
      } as DecodedServerResponseSessionState;
  }
}

function isNetworkError(err: Error): err is TypeError {
  return err instanceof TypeError && !navigator.onLine;
}
