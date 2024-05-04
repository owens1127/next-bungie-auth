import { getServerSession } from "./api/auth";
import { BungieSessionProvider } from "next-bungie-auth/client";

export const metadata = {
  title: "Bungie Next Auth Example",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const serverSession = await getServerSession();

  return (
    <html lang="en">
      <body>
        <main>
          <h1>Next Bungie Auth</h1>
          <BungieSessionProvider
            sessionPath="/api/auth/session"
            deauthorizePath="/api/auth/logout"
            initialSession={serverSession}
          >
            {children}
          </BungieSessionProvider>
        </main>
      </body>
    </html>
  );
}
