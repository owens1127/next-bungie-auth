import type { BungieTokenResponse, NextBungieAuthConfig } from "../types";
import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";

/** @internal */
export const setStateCookie = (
  state: string,
  cookieJar: ReadonlyRequestCookies,
  config: NextBungieAuthConfig
) => {
  cookieJar.set(`${config.baseCookieName}.state`, state, {
    ...config.cookieOptions,
    maxAge: 900,
  });
};

/** @internal */
export const getStateCookie = (
  cookieJar: ReadonlyRequestCookies,
  config: NextBungieAuthConfig
) => {
  return cookieJar.get(`${config.baseCookieName}.state`)?.value;
};

/** @internal */
export const clearStateCookie = (
  cookieJar: ReadonlyRequestCookies,
  config: NextBungieAuthConfig
) => {
  cookieJar.delete(`${config.baseCookieName}.state`);
};

/** @internal */
export const setCallbackCookie = (
  callbackUrl: string,
  cookieJar: ReadonlyRequestCookies,
  config: NextBungieAuthConfig
) => {
  cookieJar.set(`${config.baseCookieName}.callback`, callbackUrl, {
    ...config.cookieOptions,
    maxAge: 900,
  });
};

/** @internal */
export const getCallbackCookie = (
  cookieJar: ReadonlyRequestCookies,
  config: NextBungieAuthConfig
) => {
  return cookieJar.get(`${config.baseCookieName}.callback`)?.value;
};

/** @internal */
export const clearCallbackCookie = (
  cookieJar: ReadonlyRequestCookies,
  config: NextBungieAuthConfig
) => {
  cookieJar.delete(`${config.baseCookieName}.callback`);
};

/** @internal */
export const getAllCookies = async (
  cookieJar: ReadonlyRequestCookies,
  config: NextBungieAuthConfig
) => {
  const bungieMembershipId = cookieJar.get(
    `${config.baseCookieName}.membershipid`
  )?.value;
  const encodedAccessToken = cookieJar.get(
    `${config.baseCookieName}.access`
  )?.value;
  const accessExpires = new Date(
    cookieJar.get(`${config.baseCookieName}.expires`)?.value ?? 0
  );
  const encodedRefreshToken = cookieJar.get(
    `${config.baseCookieName}.refresh`
  )?.value;

  return {
    accessExpires,
    bungieMembershipId,
    accessToken: encodedAccessToken
      ? config.encodeTokens
        ? await config.encodeTokens.decoder(
            encodedAccessToken,
            config.clientSecret
          )
        : encodedAccessToken
      : null,
    refreshToken: encodedRefreshToken
      ? config.encodeTokens
        ? await config.encodeTokens.decoder(
            encodedRefreshToken,
            config.clientSecret
          )
        : encodedRefreshToken
      : null,
  };
};

/** @internal */
export const setAllCookies = async (
  {
    tokens,
    sessionAge,
    accessAge,
    accessExpires,
  }: {
    tokens: BungieTokenResponse;
    sessionAge: number;
    accessAge: number;
    accessExpires: Date;
  },
  cookieJar: ReadonlyRequestCookies,
  config: NextBungieAuthConfig
) => {
  cookieJar.set(`${config.baseCookieName}.membershipid`, tokens.membership_id, {
    ...config.cookieOptions,
    maxAge: sessionAge,
  });

  cookieJar.set(
    `${config.baseCookieName}.refresh`,
    config.encodeTokens
      ? await config.encodeTokens.encoder(
          tokens.refresh_token,
          config.clientSecret
        )
      : tokens.refresh_token,
    {
      ...config.cookieOptions,
      maxAge: sessionAge,
    }
  );

  cookieJar.set(
    `${config.baseCookieName}.access`,
    config.encodeTokens
      ? await config.encodeTokens.encoder(
          tokens.access_token,
          config.clientSecret
        )
      : tokens.access_token,
    {
      ...config.cookieOptions,
      maxAge: accessAge,
    }
  );
  cookieJar.set(
    `${config.baseCookieName}.expires`,
    accessExpires.toISOString(),
    {
      ...config.cookieOptions,
      maxAge: accessAge,
    }
  );
};

/** @internal */
export const clearAllCookies = (
  cookieJar: ReadonlyRequestCookies,
  config: NextBungieAuthConfig
) => {
  ["membershipid", "access", "refresh", "expires"].forEach((key) => {
    cookieJar.delete(`${config.baseCookieName}.${key}`);
  });
};
