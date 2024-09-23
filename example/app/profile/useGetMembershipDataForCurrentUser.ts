import { getMembershipDataForCurrentUser } from "bungie-net-core/endpoints/User";
import { useHttpClient } from "./useHttpClient";
import { useCallback } from "react";

export const useGetMembershipDataForCurrentUser = (access_token: string) => {
  const bungieHttp = useHttpClient(access_token);

  return useCallback(
    () =>
      getMembershipDataForCurrentUser(bungieHttp).then((res) => res.Response),
    [bungieHttp]
  );
};
