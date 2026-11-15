import { Pipe, PipeTransform, inject } from '@angular/core';
import { LocationService } from '../services/location.service';
import { TranslationService } from '../services/translation.service';

/** Street and district names in the page language: `{{ apartment.address | localizedAddress }}`. */
@Pipe({ name: 'localizedAddress', standalone: true, pure: false })
export class LocalizedAddressPipe implements PipeTransform {
  private readonly locations = inject(LocationService);
  private readonly translation = inject(TranslationService);

  constructor() {
    this.locations.ensureLoaded();
  }

  transform(value: string | null | undefined): string {
    return this.locations.localizeAddress(value, this.translation.language$.value as 'ka' | 'en' | 'ru');
  }
}
