import { cookies } from "next/headers";
import type { NextBungieAuthConfig } from "./types";

/** @internal */
export const setAuthStateCookie = (
  state: string,
  config: NextBungieAuthConfig
) => {
  cookies().set(`${config.baseCookieName}.state`, state, config.cookieOptions);
};

/** @internal */
export const getAuthStateCookie = (config: NextBungieAuthConfig) => {
  return cookies().get(`${config.baseCookieName}.state`)?.value;
};

/** @internal */
export const clearAuthStateCookie = (config: NextBungieAuthConfig) => {
  cookies().delete(`${config.baseCookieName}.state`);
};

/** @internal */
export const setSessionCookie = (
  jwt: string,
  expires: Date,
  config: NextBungieAuthConfig
) => {
  cookies().set(`${config.baseCookieName}.session`, jwt, {
    ...config.cookieOptions,
    expires,
  });
};

/** @internal */
export const getSessionCookie = (config: NextBungieAuthConfig) => {
  return cookies().get(`${config.baseCookieName}.session`)?.value;
};

/** @internal */
export const clearSessionCookie = (config: NextBungieAuthConfig) => {
  cookies().delete(`${config.baseCookieName}.session`);
};
