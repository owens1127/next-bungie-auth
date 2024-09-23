"use client";

import { useDestinyProfile } from "./useBungieProfile";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, Shield, Swords, BarChart3 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export default function Page() {
  const params = useParams<{
    membershipId: string;
    membershipType: string;
  }>();
  const { data, isError, error, isPending, status, refetch } =
    useDestinyProfile(params.membershipId, Number(params.membershipType));

  if (isPending) {
    return (
      <div className="container mx-auto p-4">
        <Card>
          <CardHeader>
            <CardTitle>Loading Profile...</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-center">
              Please wait while we load your profile...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="container mx-auto p-4">
        <Card>
          <CardHeader>
            <CardTitle>Error Loading Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-center">
              An error occurred while loading your profile: {error.message}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <div className="mb-4">
        <Button asChild>
          <Link href="/profile">Back to Profile</Link>
        </Button>
      </div>
      <h1 className="text-3xl font-bold mb-6">Destiny 2 Profile Response</h1>
      {data.profile.data && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-6 w-6" />
              {data.profile.data.userInfo.displayName}
            </CardTitle>
            <CardDescription>
              Membership ID: {data.profile.data.userInfo.membershipId} (Type:{" "}
              {data.profile.data.userInfo.membershipType})
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="characters">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="characters">Characters</TabsTrigger>
                <TabsTrigger value="inventory">Inventory</TabsTrigger>
                <TabsTrigger value="stats">Stats</TabsTrigger>
              </TabsList>
              <TabsContent value="characters">
                <div className="grid gap-4 md:grid-cols-3">
                  {Object.values(data.characters.data ?? {}).map(
                    (character) => (
                      <Card key={character.characterId}>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <Shield className="h-4 w-4" />
                            {character.classType}
                          </CardTitle>
                          <CardDescription>
                            Light: {character.light}
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <Image
                            unoptimized
                            width={96}
                            height={96}
                            src={`https://www.bungie.net${character.emblemPath}`}
                            alt={`${character.classType} Emblem`}
                            className="w-24 h-24 object-cover rounded-md"
                          />
                        </CardContent>
                      </Card>
                    )
                  )}
                </div>
              </TabsContent>
              <TabsContent value="inventory">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Swords className="h-4 w-4" />
                      Currencies
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[200px]">
                      <ul className="space-y-2">
                        {data.profileCurrencies.data?.items.map((item) => (
                          <li
                            key={item.itemHash}
                            className="flex justify-between items-center"
                          >
                            <span>{item.itemHash}</span>
                            <span className="text-sm text-muted-foreground">
                              Type: {item.itemInstanceId}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
      <div className="mt-4">
        <Button onClick={() => refetch()}>Refresh Profile Data</Button>
      </div>
    </div>
  );
}
