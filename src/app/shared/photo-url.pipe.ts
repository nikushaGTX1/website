import { Pipe, PipeTransform } from '@angular/core';
import { toMediaUrl } from '../utils/api-media';

/**
 * Small, fast version of a stored photo. A raw signed storage URL (a 1280px JPEG, 2-12 s on a
 * first visit) goes through the site's photo proxy instead: a resized WebP that the server
 * prepares as soon as the page's data arrives, so it is usually ready before it is asked for.
 * 960 suits cards; 320 suits avatars. Other URLs (local files, placeholders) are left as they are.
 */
@Pipe({ name: 'photoUrl', standalone: true })
export class PhotoUrlPipe implements PipeTransform {
  transform(url: string | null | undefined, width: 160 | 320 | 960 = 960): string {
    if (!url) return '';
    if (/^https:\/\/[^/]+\/storage\/v1\/object\/sign\/apartments\//.test(url)) {
      const proxied = toMediaUrl(url);
      return proxied ? proxied.replace(/&w=\d+$/, `&w=${width}`) : url;
    }
    if (url.startsWith('/media/apartment-image') && /&w=\d+$/.test(url)) {
      return url.replace(/&w=\d+$/, `&w=${width}`);
    }
    return url;
  }
}
