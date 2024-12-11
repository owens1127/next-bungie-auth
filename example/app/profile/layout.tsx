"use client";

import { Button } from "@/components/ui/button";
import { BungieSessionSuspender } from "next-bungie-auth/client";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <BungieSessionSuspender
      fallback={(state) => {
        switch (state.status) {
          case "unauthorized":
            return (
              <div>
                <Button asChild>
                  <a href="/api/auth/authorize">Sign In</a>
                </Button>

                <Button asChild>
                  <a href="/api/auth/authorize?reauth=true">
                    Sign (Force Re-Approval)
                  </a>
                </Button>
              </div>
            );
          case "unavailable":
            return <div>Session unavailable</div>;
          case "pending":
            return <div>Loading...</div>;
        }
      }}
    >
      {children}
    </BungieSessionSuspender>
  );
}
