import { API_BASE_URL } from './api-config';

const apiOrigin = API_BASE_URL;
const profileUploadsPath = 'uploads/profiles';
const attemptedMediaFallbacks = new WeakMap<HTMLImageElement, number>();

function signedUrlHasExpired(url: URL): boolean {
  try {
    const token = url.searchParams.get('token');
    if (!token) return false;
    const encodedPayload = token.split('.')[1];
    if (!encodedPayload) return false;
    const normalizedPayload = encodedPayload.replace(/-/g, '+').replace(/_/g, '/');
    const paddedPayload = normalizedPayload.padEnd(Math.ceil(normalizedPayload.length / 4) * 4, '=');
    const payload = JSON.parse(atob(paddedPayload)) as { exp?: number };
    return typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now() + 60_000;
  } catch {
    return false;
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
      if (
        mediaUrl.hostname === 'zhijxljnddhvlxzhrckz.supabase.co' &&
        mediaUrl.pathname.startsWith('/storage/v1/object/sign/apartments/')
      ) {
        if (signedUrlHasExpired(mediaUrl)) return '/property-placeholder.svg';
        return `/media/apartment-image?url=${encodeURIComponent(normalizedValue)}`;
      }
    } catch {
      return '';
    }
    return normalizedValue;
  }

  let cleanValue = normalizedValue.replace(/^\/+/, '');

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
