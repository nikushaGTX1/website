/**
 * Test data for agent cards and profiles, ONLY on a local development host (localhost,
 * 127.0.0.1). On velven.ge and every other host this returns null and the real numbers
 * are shown. Values are derived from the agent id, so they stay the same on every reload.
 */
export interface DemoAgentStats {
  rating: number;
  ratingCount: number;
  closedDeals: number;
}

export function demoAgentStats(agentId: string | number | null | undefined): DemoAgentStats | null {
  if (typeof location === 'undefined' || !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return null;
  const id = String(agentId ?? '');
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  const pick = (salt: number, span: number) => ((hash ^ Math.imul(salt, 2654435761)) >>> 0) % span;
  return {
    rating: 4 + pick(1, 11) / 10, // 4.0 - 5.0
    ratingCount: 6 + pick(2, 40), // 6 - 45
    closedDeals: 10 + pick(3, 40), // 10 - 49
  };
}
