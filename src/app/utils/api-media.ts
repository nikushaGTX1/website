import { API_BASE_URL } from './api-config';

const apiOrigin = API_BASE_URL;
const profileUploadsPath = 'uploads/profiles';
const attemptedMediaFallbacks = new WeakMap<HTMLImageElement, number>();

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
        return `/media/apartment-image?url=${encodeURIComponent(normalizedValue)}`;
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
