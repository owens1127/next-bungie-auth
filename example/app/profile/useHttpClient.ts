import { BungieClientProtocol } from "bungie-net-core";
import { useMemo } from "react";

export const useHttpClient = (accessToken: string) => {
  return useMemo<BungieClientProtocol>(
    () => ({
      fetch: async (config) => {
        const apiKey = process.env.NEXT_PUBLIC_BUNGIE_API_KEY;
        if (!apiKey) {
          throw new Error("Missing Bungie API Key");
        }

        const headersDict = new Headers(config.headers);
        headersDict.append("X-API-KEY", apiKey);
        headersDict.append("Authorization", `Bearer ${accessToken}`);

        const response = await fetch(config.url, {
          method: config.method,
          headers: headersDict,
          body: config.body,
        });

        if (
          response.headers.get("content-type")?.includes("application/json")
        ) {
          const data = await response.json();

          if ("ErrorCode" in data) {
            // Bungie Platform API Response
            if (data.ErrorCode !== 1) {
              throw new Error(data.Message);
            } else {
              return data;
            }
          } else {
            // Bungie API Response
            if (response.ok) {
              return data;
            } else {
              throw new Error(data.error_description);
            }
          }
        } else {
          const body = await response.text();
          const htmlRegex = /<title>(.*?)<\/title>/;
          const match = body.match(htmlRegex);
          if (match) {
            throw new Error(match[1]);
          } else {
            throw new Error(
              `Invalid response: ${response.status} ${response.statusText}`
            );
          }
        }
      },
    }),
    [accessToken]
  );
};
