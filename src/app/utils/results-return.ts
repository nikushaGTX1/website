/** Remembers the last Explore results URL so a listing's "Back to results" keeps the search. */
const LAST_RESULTS_URL_KEY = 'velven:last-results-url';

export function rememberResultsUrl(url: string): void {
  try {
    sessionStorage.setItem(LAST_RESULTS_URL_KEY, url);
  } catch {
    // Storage blocked: Back to results falls back to the plain results page.
  }
}

export function lastResultsUrl(): string | null {
  try {
    return sessionStorage.getItem(LAST_RESULTS_URL_KEY);
  } catch {
    return null;
  }
}

/**
 * Query params for "Back to results". Reuses the saved search when it is for the same
 * mode (rent/buy) as the listing; otherwise only the mode is kept.
 */
export function backToResultsQuery(savedUrl: string | null, isForSale: boolean): Record<string, string> | null {
  const fallback = isForSale ? { mode: 'buy' } : null;
  if (!savedUrl || !/^\/ExploreProperty(?:[?#]|$)/.test(savedUrl)) return fallback;
  const query: Record<string, string> = {};
  const search = savedUrl.split('#')[0].split('?')[1] || '';
  new URLSearchParams(search).forEach((value, key) => (query[key] = value));
  return (query['mode'] === 'buy') === isForSale ? query : fallback;
}
