import { cookies } from "next/headers";
import type { BungieTokenResponse, NextBungieAuthConfig } from "./types";
import { decodeToken, encodeToken } from "./tokens";

/** @internal */
export const setStateCookie = (state: string, config: NextBungieAuthConfig) => {
  cookies().set(`${config.baseCookieName}.state`, state, {
    ...config.cookieOptions,
    maxAge: 900,
  });
};

/** @internal */
export const getStateCookie = (config: NextBungieAuthConfig) => {
  return cookies().get(`${config.baseCookieName}.state`)?.value;
};

/** @internal */
export const clearStateCookie = (config: NextBungieAuthConfig) => {
  cookies().delete(`${config.baseCookieName}.state`);
};

/** @internal */
export const setCallbackCookie = (
  callbackUrl: string,
  config: NextBungieAuthConfig
) => {
  cookies().set(`${config.baseCookieName}.callback`, callbackUrl, {
    ...config.cookieOptions,
    maxAge: 900,
  });
};

/** @internal */
export const getCallbackCookie = (config: NextBungieAuthConfig) => {
  return cookies().get(`${config.baseCookieName}.callback`)?.value;
};

/** @internal */
export const clearCallbackCookie = (config: NextBungieAuthConfig) => {
  cookies().delete(`${config.baseCookieName}.callback`);
};

/** @internal */
export const getAllCookies = (config: NextBungieAuthConfig) => {
  const cookieJar = cookies();

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
    accessToken: decodeToken(encodedAccessToken, config),
    refreshToken: decodeToken(encodedRefreshToken, config),
  };
};
/** @internal */
export const setAllCookies = (
  {
    tokens,
    accessExpires,
    sessionExpires,
  }: {
    tokens: BungieTokenResponse;
    sessionExpires: Date;
    accessExpires: Date;
  },
  config: NextBungieAuthConfig
) => {
  const cookieJar = cookies();
  cookieJar.set(`${config.baseCookieName}.membershipid`, tokens.membership_id, {
    ...config.cookieOptions,
    expires: sessionExpires,
  });
  cookieJar.set(
    `${config.baseCookieName}.refresh`,
    encodeToken(tokens.refresh_token, config),
    {
      ...config.cookieOptions,
      expires: sessionExpires,
    }
  );

  cookieJar.set(
    `${config.baseCookieName}.access`,
    encodeToken(tokens.access_token, config),
    {
      ...config.cookieOptions,
      expires: accessExpires,
    }
  );
  cookieJar.set(
    `${config.baseCookieName}.expires`,
    accessExpires.toISOString(),
    {
      ...config.cookieOptions,
      expires: accessExpires,
    }
  );
};

/** @internal */
export const clearAllCookies = (config: NextBungieAuthConfig) => {
  const cookieJar = cookies();
  ["membershipid", "access", "refresh", "expires"].forEach((key) => {
    cookieJar.delete(`${config.baseCookieName}.${key}`);
  });
};
