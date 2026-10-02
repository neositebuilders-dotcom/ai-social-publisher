import { query } from "./_generated/server";
import { PLATFORM_IDS, adapterSummary } from "./lib/platforms";

/** Public catalog of platform adapters, capabilities and their gating notes. */
export const catalog = query({
  args: {},
  handler: async () => {
    return PLATFORM_IDS.map((id) => adapterSummary(id));
  },
});
