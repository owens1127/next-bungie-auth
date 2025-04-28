"use client";

import { useBungieSession } from "next-bungie-auth/client";

export default function Page() {
  const { session, terminate, refresh } = useBungieSession();

  if (session.status === "pending") return <div>Loading...</div>;

  return (
    <div>
      {session.status === "authorized" ? (
        <div>
          <button onClick={() => terminate()}>Sign Out</button>
        </div>
      ) : (
        <div>
          <button>
            <a href="/api/auth/authorize">Sign In</a>
          </button>

          <button>
            <a href="/api/auth/authorize?reauth=true">
              Sign (Force Re-Approval)
            </a>
          </button>
        </div>
      )}

      <div>
        <h2>Session</h2>
      </div>
      <pre>{JSON.stringify(session, null, 2)}</pre>
      <div>
        <button onClick={() => refresh()}>Refresh</button>
      </div>
    </div>
  );
}
