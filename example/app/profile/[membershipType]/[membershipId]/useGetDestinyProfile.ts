import { useHttpClient } from "../../useHttpClient";
import { useCallback } from "react";
import { getProfile } from "bungie-net-core/endpoints/Destiny2";
import type {
  BungieMembershipType,
  DestinyComponentType,
} from "bungie-net-core/models";

export const useGetDestinyProfile = <T extends readonly DestinyComponentType[]>(
  params: {
    components: [...T];
    destinyMembershipId: string;
    membershipType: BungieMembershipType;
  },
  access_token: string
) => {
  const bungieHttp = useHttpClient(access_token);

  return useCallback(
    () => getProfile(bungieHttp, params).then((res) => res.Response),
    [bungieHttp]
  );
};
