"use client";

import { useBungieSession } from "next-bungie-auth/client";

export default function Page() {
  const session = useBungieSession();

  if (session.isPending) return <div>Loading...</div>;

  return (
    <div>
      {session.status === "authorized" ? (
        <div>
          <button onClick={() => session.end()}>Sign Out</button>
          <button onClick={() => session.end(true)}>Sign Out (Reload)</button>
        </div>
      ) : (
        <div>
          <button>
            <a href="/api/auth/login">Sign In</a>
          </button>

          <button>
            <a href="/api/auth/login?reauth=true">Sign (Force Re-Auth)</a>
          </button>
        </div>
      )}

      <div>
        <h2>Session</h2>
      </div>
      <pre>{JSON.stringify(session, null, 2)}</pre>
      <div>
        <button onClick={() => session.refresh()}>Refresh</button>
        <button onClick={() => session.refresh(true)}>Refresh (soft)</button>
      </div>
    </div>
  );
}
