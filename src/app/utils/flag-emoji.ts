import { polyfillCountryFlagEmojis } from 'country-flag-emoji-polyfill';

/** Windows has no flag emoji: load the flag font from this site (not a CDN) when needed. */
export function enableFlagEmojis(): void {
  polyfillCountryFlagEmojis('Twemoji Country Flags', '/fonts/TwemojiCountryFlags.woff2');
}
