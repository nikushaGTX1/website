import { Pipe, PipeTransform } from '@angular/core';
import { LocationService } from '../services/location.service';
import { TranslationService } from '../services/translation.service';
import { localizeListingTitle, TitleDistrict } from '../utils/listing-title';

@Pipe({ name: 'listingTitle', standalone: false, pure: false })
export class ListingTitlePipe implements PipeTransform {
  private districts: TitleDistrict[] = [];
  private lastKey = '';
  private lastValue = '';

  constructor(
    private locationService: LocationService,
    private translation: TranslationService,
  ) {
    this.locationService.getLocations().subscribe((locations) => {
      this.districts = locations.map((location) => ({
        en: location.district,
        ka: this.locationService.districtName(location, 'ka'),
      }));
      this.lastKey = '';
    });
  }

  transform(title: string | null | undefined): string {
    const language = this.translation.language$.value;
    const key = `${language}|${this.districts.length}|${title ?? ''}`;
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.lastValue = localizeListingTitle(title, language, this.districts);
    }
    return this.lastValue;
  }
}
