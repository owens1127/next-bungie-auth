"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BungieSessionProvider } from "next-bungie-auth/client";
import { ReactNode, useState } from "react";
import { NextBungieAuthSessionResponse } from "next-bungie-auth/types";

/**
 * Provides a client component for managing the Bungie session.
 *
 * @param serverSession - The server session for NextBungieAuth.
 * @param children - The child components.
 * @returns The session provider component.
 */
export const CustomSessionProvider = ({
  serverSession,
  children,
}: {
  serverSession?: NextBungieAuthSessionResponse;
  children?: ReactNode;
}) => {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnReconnect: true,
            refetchOnMount: false,
            retry: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <BungieSessionProvider
        sessionPath="/api/auth/session"
        deauthorizePath="/api/auth/signout"
        initialSession={serverSession}
        onError={(err, type) => {
          window.alert(`${type} error: ${err.message}`);
        }}
      >
        {children}
      </BungieSessionProvider>
    </QueryClientProvider>
  );
};
