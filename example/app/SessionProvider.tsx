"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BungieSessionProvider } from "next-bungie-auth/client";
import type { ReactNode} from "react";
import { useState } from "react";
import type { NextBungieAuthSessionResponse } from "next-bungie-auth/types";

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
