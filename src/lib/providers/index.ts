import { ApiFootballAdapter } from "./api-football";
import { TheOddsApiAdapter } from "./the-odds-api";
import type { ProviderAdapter } from "./types";

/** All known provider adapters. Unconfigured ones are skipped at ingest time. */
export const adapters: ProviderAdapter[] = [
  new ApiFootballAdapter(),
  new TheOddsApiAdapter(),
];

export function configuredAdapters(): ProviderAdapter[] {
  return adapters.filter((a) => a.isConfigured());
}
