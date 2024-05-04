import type {
  BungieTokenResponse,
  NextBungieAuthConfig,
  NextBungieAuthJWTPayload,
} from "./types";

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

/** @internal */
export const encodeToken = (
  data: BungieTokenResponse,
  iat: Date,
  config: NextBungieAuthConfig
) => {
  const jsonStr = JSON.stringify({
    ...data,
    iat: Math.floor(iat.getTime() / 1000),
  } as NextBungieAuthJWTPayload);

  return btoa(
    jsonStr
      .split("")
      .map((c, i) =>
        String.fromCharCode(
          c.charCodeAt(0) +
            config.clientSecret.charCodeAt(i % config.clientSecret.length)
        )
      )
      .join("")
  );
};

/** @internal */
export const decodeToken = (
  encodedStr: string | undefined,
  config: NextBungieAuthConfig
) => {
  if (!encodedStr) {
    return null;
  }

  const decodedStr = atob(encodedStr)
    .split("")
    .map((c, i) =>
      String.fromCharCode(
        c.charCodeAt(0) -
          config.clientSecret.charCodeAt(i % config.clientSecret.length)
      )
    )
    .join("");

  return JSON.parse(decodedStr) as NextBungieAuthJWTPayload;
};
