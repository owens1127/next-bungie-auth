import { useQuery } from "@tanstack/react-query";
import { useAuthorizedBungieSession } from "next-bungie-auth/client";
import { useGetDestinyProfile } from "./useGetDestinyProfile";
import { BungieMembershipType } from "bungie-net-core/models";

export const useDestinyProfile = (
  destinyMembershipId: string,
  membershipType: BungieMembershipType
) => {
  const session = useAuthorizedBungieSession();
  const getDestinyProfile = useGetDestinyProfile(
    {
      destinyMembershipId: destinyMembershipId,
      membershipType: membershipType,
      components: [100, 103, 200],
    },
    session.data.accessToken
  );

  return useQuery({
    queryKey: ["getDestinyProfile", destinyMembershipId, membershipType],
    queryFn: getDestinyProfile,
    staleTime: 60000,
  });
};
