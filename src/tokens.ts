import type { NextBungieAuthConfig } from "./types";

/** @internal */
export const getTokens = async (
  {
    grantType,
    value,
  }: {
    grantType: "authorization_code" | "refresh_token";
    value: string;
  },
  config: NextBungieAuthConfig
) => {
  const data = await config.tokenHttp(
    new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: grantType,
      [grantType === "authorization_code" ? "code" : "refresh_token"]: value,
    })
  );

  return data;
};
