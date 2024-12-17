"use client";

import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useBungieProfile } from "./useBungieProfile";
import Link from "next/link";

export default function Page() {
  const { data, isError, error, isPending } = useBungieProfile();

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-8">
      <Card className="max-w-4xl mx-auto bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="text-3xl font-bold text-amber-400">
            Bungie Profile
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isError && (
            <div className="flex items-center space-x-2 text-red-400 mb-4">
              <AlertCircle className="h-5 w-5" />
              <span>Bungie Error: {error.message}</span>
            </div>
          )}

          {isPending && (
            <div className="space-y-4">
              <Skeleton className="h-8 w-3/4 bg-gray-700" />
              <Skeleton className="h-6 w-1/2 bg-gray-700" />
              <Skeleton className="h-32 w-full bg-gray-700" />
            </div>
          )}

          {data && (
            <>
              <h2 className="text-2xl font-semibold mb-2 text-blue-300">
                Profile {data.primaryMembershipId}
              </h2>
              <h3 className="text-xl mb-6 text-amber-300">
                {data.bungieNetUser.uniqueName}
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {data.destinyMemberships.map((membership) => (
                  <Card
                    key={membership.membershipId}
                    className={`bg-gray-700 border-2`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center space-x-4 mb-4">
                        <Image
                          unoptimized
                          src={`https://www.bungie.net${membership.iconPath}`}
                          width={64}
                          height={64}
                          alt={membership.displayName}
                          className="rounded-full"
                        />
                        <div>
                          <h4 className="text-lg font-semibold text-blue-300">
                            <Link
                              href={`/profile/${membership.membershipType}/${membership.membershipId}`}
                              className="hover:underline"
                            >
                              {membership.bungieGlobalDisplayName}#
                              {membership.bungieGlobalDisplayNameCode}
                            </Link>
                          </h4>
                          <h5 className="text-sm text-gray-400">
                            {membership.displayName}
                          </h5>
                        </div>
                      </div>
                      <div className="space-y-2 text-sm text-gray-100">
                        <p>
                          <span className="text-gray-400">
                            Membership Type:
                          </span>{" "}
                          {membership.membershipType}
                        </p>
                        <p>
                          <span className="text-gray-400">
                            Cross-Save Override:
                          </span>{" "}
                          {membership.crossSaveOverride}
                        </p>
                        <p>
                          <span className="text-gray-400">
                            Applicable Membership Types:
                          </span>{" "}
                          {membership.applicableMembershipTypes.join(", ")}
                        </p>
                      </div>
                      {membership.membershipId === data.primaryMembershipId && (
                        <div className="mt-4 flex items-center text-green-400">
                          <CheckCircle2 className="h-5 w-5 mr-2" />
                          <span>Primary Account</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="mt-8">
                <h3 className="text-xl font-semibold mb-2 text-blue-300">
                  Bungie.net User Data
                </h3>
                <pre className="bg-gray-700 p-4 rounded-md overflow-x-auto text-sm text-white">
                  {JSON.stringify(data.bungieNetUser, null, 2)}
                </pre>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
