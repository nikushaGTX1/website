import { API_BASE_URL } from './api-config';

const apiOrigin = API_BASE_URL;
const profileUploadsPath = 'uploads/profiles';
const attemptedMediaFallbacks = new WeakMap<HTMLImageElement, number>();

export function toMediaUrl(value?: string | null): string {
  if (!value) {
    return '';
  }

  const normalizedValue = value.replace(/\\/g, '/');

  if (normalizedValue.startsWith('http://') || normalizedValue.startsWith('https://')) {
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
    return `${apiOrigin}/uploads/${cleanValue}`;
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
