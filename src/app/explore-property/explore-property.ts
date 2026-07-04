import { Component } from '@angular/core';


@Component({
  selector: 'app-explore-property',
  standalone: false,
  templateUrl: './explore-property.html',
  styleUrl: './explore-property.css',
})
export class ExploreProperty {

  searchQuery: string = '';
  selectedType: string = 'For rent';
  priceRange: string = '';
  homeType: string = '';
  location: string = '';


  // Used strictly to loop empty skeletal cards on the right container
  propertiesPlaceholder = new Array(4); 

  /**
   * Bound to the Search button. 
   * Captures the live state of all ngModels.
   */
  onSearch(): void {
    const payload = {
      searchQuery: this.searchQuery,
      selectedType: this.selectedType,
      priceRange: this.priceRange,
      homeType: this.homeType,
      location: this.location
    };
    
    console.log('Sending bound model payloads to backend service:', payload);
  }
}
