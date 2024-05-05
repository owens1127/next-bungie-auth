# Next Bungie Auth

Next Bungie Auth is an open source Next.js library that provides a configurable solution for
authenticating your users with Bungie.net

## Getting Started

These instructions will get you a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

- Next.js 13.5 or later
- Registered [Bungie developer application](https://www.bungie.net/en/Application)
  1.  Select **Confidential** OAuth Client Type
  2.  Set your redirect url to `https://localhost:3000/your-custom-path`
      - Note: you should create a separate application for production

### Installation

1. Install the package

`npm install next-bungie-auth` or `yarn add next-bungie-auth` or `bun add next-bungie-auth`

2. Update `.env` file with your Bungie.net Application credentials:

```env
BUNGIE_CLIENT_ID=OAuth_client_id
BUNGIE_CLIENT_SECRET=OAuth_client_secret
```

## Usage

On the server side, you can use the `createNextBungieAuth` function from `next-bungie-auth/server` to create Bungie auth handlers and server-side helpers.

See [NextBungieAuthConfig](`/src/types.ts`) for a list of all options.

```ts
// /app/api/auth/index.ts
import "server-only"; // this is an optional npm package which prevents your from accidentally importing server code on the client (npm install server-only)
import { createNextBungieAuth } from "next-bungie-auth/server";

export const {
  handlers: { authorizeGET, deauthorizePOST, callbackGET, sessionGET },
  serverSideHelpers: {
    getServerSession,
    clearServerSession,
    requestNewTokens,
    updateServerSession,
  },
} = createNextBungieAuth({
  // Pass your config here
  clientId: process.env.BUNGIE_CLIENT_ID!,
  clientSecret: process.env.BUNGIE_CLIENT_SECRET!,
  // You can generate state however you want
  generateState: () => crypto.randomUUID(),
});
```

### Using the Route Handlers

The `createNextBungieAuth` function provides several route handlers that you can use in your Next.js API routes.

#### `authorizeGET`

This handler initiates the Bungie.net OAuth2 authorization flow. You can use it in your API route like this for example

```ts
// /app/api/auth/authorize/route.ts
export { authorizeGET as GET } from "..";
// optional: this library supports the edge run time
export const runtime = "edge";
```

#### `deauthorizePOST`

This handler deauthorizes/logs the user out of current session by clearing their cookies. You can use it in your API route like this:

```ts
// /app/api/auth/deauthorize/route.ts
export { deauthorizePOST as POST } from "..";
// optional: this library supports the edge run time
export const runtime = "edge";
```

#### `callbackGET`

This handler handles the callback from Bungie.net after the user has authorized your application. You can use it in your API route like this:

```ts
// /app/api/auth/callback/route.ts
export { callbackGET as GET } from "..";
// optional: this library supports the edge run time
export const runtime = "edge";
```

#### `sessionGET`

This handler returns the current session data from the cookies and refreshes it if needed. You can use it in your API route like this:

```ts
// /app/api/auth/session/route.ts
export { sessionGET as GET } from "..";
// optional: this library supports the edge run time
export const runtime = "edge";
```

To use the Bungie authentication in your Next.js pages, you can use the `useBungieSession` hook from [`client.tsx`](src/client.tsx). This hook provides the current Bungie session context.

### Authenticating Client Side

Now that you have set up your server-side logic, it is likely that you will also be making client-side requests on behalf of the user.

You can use the `BungieSessionProvider` from [`client.tsx`](src/client.tsx) to provide a Bungie session context to your components. It is recommended to place this component in the **root layout**. This provider takes several options:

- `sessionPath`: The path to the session.
- `deauthorizePath`: The path to deauthorize the session.
- `initialSession`: The initial session data.
- `enableAutomaticRefresh`: (Default true) Whether to enable automatic session refresh.
- ...and more

```tsx
// /app/layout.tsx
import { getServerSession } from "./api/auth";
import { BungieSessionProvider } from "next-bungie-auth/client";

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Optional: to avoid extra round trips, grab the session from the cookies at the time of the request
  const serverSession = getServerSession();

  return (
    <html lang="en">
      <body>
        <main>
          <BungieSessionProvider
            // You can customize these paths, however, they must align with the location of your route handlers
            sessionPath="/api/auth/authorize"
            deauthorizePath="/api/auth/deauthorize"
            initialSession={serverSession}
          >
            {children}
          </BungieSessionProvider>
        </main>
      </body>
    </html>
  );
}
```

Now, you can create a component which accesses the session

```tsx
// /app/my-component.tsx
"use client";

import { useBungieSession } from "next-bungie-auth/client";

export const MyComponent = () => {
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
};
```

## Important Note

In order to use Bungie's OAuth, you must use HTTPS. Next.js provides built in support with version 13.5 and above, using the `--experimental-https` flag. Update your dev command to use `next dev --experimental-https` if you do not have any custom proxy solution.

## What does this library not do?

This library does not handle network or refetching client side on an error. The session state provides the tools needed to identify a network or client error and refetch, but the user will need to manually implement this retry logic

## Questions?

Reach out to `_newo` on Discord!

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details
