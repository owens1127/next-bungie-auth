"use client";

import { useBungieSession } from "next-bungie-auth/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";

export default function Page() {
  const session = useBungieSession();

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Session</CardTitle>
      </CardHeader>
      <CardContent>
        <pre className="bg-gray-100 p-4 rounded-md overflow-x-auto">
          {JSON.stringify(session, null, 2)}
        </pre>
      </CardContent>
      <CardFooter className="flex justify-end space-x-2">
        {(session.status === "authorized" ||
          session.status === "unavailable") && (
          <>
            <Button onClick={() => session.kill()} variant="destructive">
              Sign Out
            </Button>
            <Button onClick={() => session.refresh()} variant="secondary">
              Refresh
            </Button>
          </>
        )}
        {session.status === "unauthorized" && (
          <Button asChild>
            <a href="/api/auth/authorize">Sign In</a>
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
