import { API_BASE_URL } from './api-config';

const apiOrigin = API_BASE_URL;
const profileUploadsPath = 'uploads/profiles';
const attemptedMediaFallbacks = new WeakMap<HTMLImageElement, number>();

/**
 * Fullscreen viewer size: a 1280px WebP (originals are 1280px JPEGs, so no detail is lost)
 * at about half the bytes, resized once on the server and cached by Cloudflare.
 */
export function fullSizeImage(url: string): string {
  return url.replace(/&w=\d+$/, '&w=1280');
}

/** Small version of a proxied photo: thumbnails (160) and avatars (320). Other URLs unchanged. */
export function smallImage(url: string, width: 160 | 320 = 160): string {
  return /&w=\d+$/.test(url) ? url.replace(/&w=\d+$/, `&w=${width}`) : url;
}

/** Warms the browser cache so the next photo shows instantly. */
export function preloadImages(urls: string[]): void {
  for (const url of urls) {
    if (!url) continue;
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
  }
}

export function toMediaUrl(value?: string | null): string {
  if (!value) {
    return '';
  }

  const normalizedValue = value.replace(/\\/g, '/');

  if (normalizedValue.startsWith('/media/')) {
    return normalizedValue;
  }

  if (normalizedValue.startsWith('http://') || normalizedValue.startsWith('https://')) {
    try {
      const mediaUrl = new URL(normalizedValue);
      if (/\/uploads\/profiles\/(apartment-image|profile-image)\/?$/i.test(mediaUrl.pathname)) {
        return '';
      }
      if (
        mediaUrl.hostname === 'zhijxljnddhvlxzhrckz.supabase.co' &&
        mediaUrl.pathname.startsWith('/storage/v1/object/sign/apartments/')
      ) {
        // The upstream API can reuse a signed URL after its embedded expiry time,
        // while Supabase still serves the object. Let the same-origin media proxy
        // fetch/cache the real image instead of rejecting it from the token alone.
        // ".jpg" lets Cloudflare cache the photo at the edge; listing photo URLs stay the
        // same for days (the API signs them for a week), so repeat visits load from cache.
        // w=960: a resized WebP (~3x smaller than the 1280px original) — enough for cards,
        // the map preview and the listing page. fullSizeImage() drops it for the photo viewer.
        // Profile photos are only shown as small avatars: 320px is plenty and ~10x smaller.
        const width = mediaUrl.pathname.includes('/apartments/profiles/') ? 320 : 960;
        return `/media/apartment-image.jpg?url=${encodeURIComponent(normalizedValue)}&w=${width}`;
      }
    } catch {
      return '';
    }
    return normalizedValue;
  }

  let cleanValue = normalizedValue.replace(/^\/+/, '');

  // Some legacy apartment records expose their upload field name as though it
  // were a profile filename. It is not a real media object and always 404s.
  if (/^(apartment-image|profile-image)$/i.test(cleanValue)) {
    return '';
  }

  if (cleanValue.startsWith('wwwroot/')) {
    cleanValue = cleanValue.replace(/^wwwroot\//, '');
  }

  if (cleanValue.startsWith('uploads/')) {
    return `${apiOrigin}/${cleanValue}`;
  }

  if (cleanValue.startsWith('profiles/')) {
    // This is a private Supabase object path, not a public Railway URL.
    // API responses must provide a signed absolute URL for display.
    return '';
  }

  return `${apiOrigin}/${profileUploadsPath}/${cleanValue}`;
}

export function tryNextProfileImageUrl(event: Event): boolean {
  const image = event.target as HTMLImageElement;
  const rawFileName = image.currentSrc.split('/').pop() || '';
  const fileName = rawFileName.split('?')[0];

  if (!fileName) {
    return false;
  }

  const candidates = [
    `${apiOrigin}/${profileUploadsPath}/${fileName}`,
    `${apiOrigin}/wwwroot/${profileUploadsPath}/${fileName}`,
    `/${profileUploadsPath}/${fileName}`,
    '/agent1.jpg',
  ].filter((url) => url !== image.src);

  const nextIndex = attemptedMediaFallbacks.get(image) || 0;
  const nextUrl = candidates[nextIndex];

  if (!nextUrl) {
    return false;
  }

  attemptedMediaFallbacks.set(image, nextIndex + 1);
  image.src = nextUrl;
  return true;
}
