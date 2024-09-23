import { BungieAuthorizationError } from "./error";
import type { BungieTokenResponse, NextBungieAuthConfig } from "./types";

const responseJsonKeys = [
  "access_token",
  "token_type",
  "expires_in",
  "refresh_token",
  "refresh_expires_in",
  "membership_id",
] as const;

const errorResponseJsonKeys = ["error", "error_description"] as const;

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
  const data = await config
    .tokenHttp({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      grantType,
      grantKey: grantType === "authorization_code" ? "code" : "refresh_token",
      value,
    })
    .then(async (res) => {
      if (res.ok) {
        const tokenResponse = await res.json();

        if (!responseJsonKeys.every((key) => key in tokenResponse)) {
          throw new TypeError("Response body is missing required keys");
        }

        return tokenResponse as BungieTokenResponse;
      }

      // Handle invalid token response
      if (res.headers.get("content-type")?.includes("application/json")) {
        const errorResponse = await res.json();

        if (!errorResponseJsonKeys.every((key) => key in errorResponse)) {
          throw new TypeError(
            `Unexpected error response: ${JSON.stringify(errorResponse)}`
          );
        }

        throw new BungieAuthorizationError(
          errorResponse.error,
          errorResponse.error_description
        );
      } else {
        throw new TypeError(
          `Invalid response [${res.status}]: ${await res.text()}`
        );
      }
    });

  return data;
};

/** @internal */
export const encodeToken = (data: string, config: NextBungieAuthConfig) => {
  return btoa(
    data
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

  return atob(encodedStr)
    .split("")
    .map((c, i) =>
      String.fromCharCode(
        c.charCodeAt(0) -
          config.clientSecret.charCodeAt(i % config.clientSecret.length)
      )
    )
    .join("");
};
