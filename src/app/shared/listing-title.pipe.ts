import { Pipe, PipeTransform } from '@angular/core';
import { LocationService } from '../services/location.service';
import { TranslationService } from '../services/translation.service';
import { ListingTitleSource, localizeListingTitle, TitleDistrict } from '../utils/listing-title';

/** Pass the listing itself (`apartment | listingTitle`) so its saved translations are used. */
@Pipe({
  name: 'listingTitle',
  pure: false,
})
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

  transform(listing: string | ListingTitleSource | null | undefined): string {
    const language = this.translation.language$.value;
    const item = typeof listing === 'string' ? { title: listing } : (listing ?? {});
    const key = [language, this.districts.length, item.title, item.titleEn, item.titleKa, item.titleRu, item.district]
      .map((part) => part ?? '')
      .join('|');
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.lastValue = localizeListingTitle(item, language, this.districts);
    }
    return this.lastValue;
  }
}
