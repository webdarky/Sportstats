import { ApiFootballAdapter } from "./api-football";
import { SportmonksAdapter } from "./sportmonks";
import { TheOddsApiAdapter } from "./the-odds-api";
import type { ProviderAdapter } from "./types";

/** All known provider adapters. Unconfigured ones are skipped at ingest time. */
export const adapters: ProviderAdapter[] = [
  new ApiFootballAdapter(),
  new SportmonksAdapter(),
  new TheOddsApiAdapter(),
];

export function configuredAdapters(): ProviderAdapter[] {
  return adapters.filter((a) => a.isConfigured());
}
