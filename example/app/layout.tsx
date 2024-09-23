import { getServerSession } from "./api/auth";
import { CustomSessionProvider } from "./SessionProvider";
import { Inter } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata = {
  title: "Bungie Next Auth Example",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = getServerSession();

  return (
    <html lang="en" className={`${inter.variable} font-sans`}>
      <body className="bg-gray-100 min-h-screen">
        <div className="mx-auto px-4 py-8">
          <header className="mb-8">
            <nav className="flex justify-between items-center mb-4">
              <ul className="flex space-x-4">
                <li>
                  <Link href="/" className="text-blue-600 hover:text-blue-800">
                    Home
                  </Link>
                </li>
                <li>
                  <Link
                    href="/profile"
                    className="text-blue-600 hover:text-blue-800"
                  >
                    Profile
                  </Link>
                </li>
              </ul>
            </nav>
            <h1 className="text-3xl font-bold text-gray-800">
              Next Bungie Auth
            </h1>
          </header>
          <main>
            <CustomSessionProvider serverSession={session}>
              {children}
            </CustomSessionProvider>
          </main>
        </div>
      </body>
    </html>
  );
}
