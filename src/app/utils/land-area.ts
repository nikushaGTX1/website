import { Pipe, PipeTransform } from '@angular/core';

/** Yard / land area of a house or plot, saved in the listing details as "Land area: N m2". 0 when none. */
export function landAreaOf(apartment: { description?: string | null } | null | undefined): number {
  const match = (apartment?.description || '').match(/(?:^|[|\r\n])\s*Land area:\s*([\d.,]+)/i);
  const value = match ? Number(match[1].replace(/,/g, '')) : 0;
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/** `apartment | landArea` -> yard / land m² (0 when the listing has none). */
@Pipe({ name: 'landArea', standalone: true })
export class LandAreaPipe implements PipeTransform {
  transform(apartment: { description?: string | null } | null | undefined): number {
    return landAreaOf(apartment);
  }
}
