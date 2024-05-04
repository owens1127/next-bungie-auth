"use client";

import React from "react";
import type {
  BungieSessionProviderOptions,
  NextBungieAuthSessionResponse,
  BungieSession,
  BungieSessionState,
} from "./types";

const Context = React.createContext<BungieSession | undefined>(undefined);

/**
 * Custom hook that returns the Next Bungie Auth Session.
 * @returns The Bungie session context.
 * @throws If used outside of a BungieSessionProvider.
 */
export const useBungieSession = (): BungieSession => {
  const ctx = React.useContext(Context);
  if (ctx === undefined) {
    throw new Error(
      "useBungieSession must be used within a BungieSessionProvider"
    );
  }
  return ctx;
};

export const BungieSessionProvider = ({
  sessionPath,
  deauthorizePath,
  initialSession,
  enableAutomaticRefresh = true,
  fetchOverride: f = fetch,
  onError = (err, type) => {
    if (process.env.NODE_ENV !== "production") {
      console.error(`NextBungieAuth ${type} error:`, err);
    }
  },
  children,
}: BungieSessionProviderOptions) => {
  const isFetchingRef = React.useRef<boolean>(false);

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
      return decodeServerSession(null, initialSession);
    }
  });

  const fetchAndUpdateSession = React.useCallback(
    async (force: boolean = false) => {
      if (isFetchingRef.current) {
        return;
      }

      isFetchingRef.current = true;
      setSession((prev) => decodeLoadingSession(prev));

      const path = force ? `${sessionPath}?force=true` : sessionPath;
      await f(path)
        .then(async (res) => {
          try {
            const session: NextBungieAuthSessionResponse = await res.json();
            setSession((prev) => decodeServerSession(prev, session));
          } catch (err) {
            if (res.status === 500) {
              setSession((prev) => decodeErrorSession(prev, "server"));
            } else {
              throw err;
            }
          }
        })
        .catch((err) => {
          const errType = isNetworkError(err) ? "network" : "client";
          onError(err, errType);
          setSession((prev) => decodeErrorSession(prev, errType));
        })
        .finally(() => {
          isFetchingRef.current = false;
        });
    },
    [isFetchingRef, sessionPath]
  );

  const deauthorize = React.useCallback(
    async (reload: boolean = false) => {
      setSession((prev) => decodeLoadingSession(prev));

      await f(deauthorizePath, {
        method: "POST",
      })
        .then(() => {
          if (reload) {
            window.location.reload();
          } else {
            setSession({
              status: "unauthorized",
              isPending: false,
              isFetching: false,
              isError: false,
              data: null,
              error: undefined,
            });
          }
        })
        .catch((err) => {
          const errType = isNetworkError(err) ? "network" : "client";
          onError(err, errType);
          setSession((prev) => decodeErrorSession(prev, errType));
        });
    },
    [deauthorizePath, fetchAndUpdateSession]
  );

  React.useEffect(() => {
    if (session.status === "pending") {
      fetchAndUpdateSession();
      return;
    }

    if (enableAutomaticRefresh) {
      const timeoutTime = calculateMsToNextRefresh(session);
      if (timeoutTime) {
        const timeout = setTimeout(fetchAndUpdateSession, timeoutTime);
        return () => clearTimeout(timeout);
      }
    }
  }, [session, fetchAndUpdateSession, enableAutomaticRefresh]);

  return (
    <Context.Provider
      value={{
        ...session,
        refresh: (soft) => fetchAndUpdateSession(!soft),
        end: (reload) => deauthorize(reload),
      }}
    >
      {children}
    </Context.Provider>
  );
};

function decodeErrorSession(
  previous: BungieSessionState,
  error: "client" | "server" | "network"
): BungieSessionState {
  return {
    status: previous.isPending ? "unauthorized" : previous.status,
    isPending: false,
    isFetching: false,
    isError: true,
    data: previous.data,
    error,
  } as BungieSessionState;
}

function decodeLoadingSession(
  previous: BungieSessionState
): BungieSessionState {
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
  status: "unauthorized" | "authorized";
  error: undefined | "server" | "bungie-api-offline";
};
function decodeServerSession(
  prevSession: BungieSessionState | null,
  session: NextBungieAuthSessionResponse
): DecodedServerResponseSessionState {
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
    case "unauthorized":
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
        data: prevSession?.data ?? null,
        error: "server",
      } as DecodedServerResponseSessionState;
    case "bungie-api-offline":
      return {
        status:
          !prevSession || prevSession.isPending
            ? "unauthorized"
            : prevSession.status,
        isPending: false,
        isFetching: false,
        isError: true,
        data: prevSession?.data ?? null,
        error: "bungie-api-offline",
      } as DecodedServerResponseSessionState;
  }
}

function isNetworkError(err: Error): err is TypeError {
  return err instanceof TypeError && !navigator.onLine;
}

/**
 * Calculates the time until the next session refresh.
 * Returns 0 to indicate that the session should not be refreshed.
 */
function calculateMsToNextRefresh(session: BungieSessionState) {
  switch (session.status) {
    case "authorized":
      return Math.max(
        1,
        new Date(session.data.accessTokenExpires).getTime() - Date.now()
      );
    case "pending":
    case "unauthorized":
      return 0;
  }
}
