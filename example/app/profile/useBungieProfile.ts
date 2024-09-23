import { useQuery } from "@tanstack/react-query";
import { useAuthorizedBungieSession } from "next-bungie-auth/client";
import { useGetMembershipDataForCurrentUser } from "./useGetMembershipDataForCurrentUser";

export const useBungieProfile = () => {
  const session = useAuthorizedBungieSession();
  const getMembershipData = useGetMembershipDataForCurrentUser(
    session.data.accessToken
  );

  return useQuery({
    queryKey: [
      "getMembershipDataForCurrentUser",
      session.data.bungieMembershipId,
    ],
    queryFn: getMembershipData,
    staleTime: 60000,
  });
};
