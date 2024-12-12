"use client";

import { useBungieSession } from "next-bungie-auth/client";

export default function Page() {
  const session = useBungieSession();

  if (session.isPending) return <div>Loading...</div>;

  return (
    <div>
      {session.status === "authorized" ? (
        <div>
          <button onClick={() => session.kill()}>Sign Out</button>
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
        <button onClick={() => session.refresh()}>Refresh</button>
      </div>
    </div>
  );
}
