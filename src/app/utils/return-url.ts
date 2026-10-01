/** Only same-site paths are accepted as a post-login destination (no `//host`, `/\host` or `http:`). */
export function safeReturnUrl(value: string | null | undefined): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return null;
  if (value.startsWith('/login')) return null;
  return value;
}
