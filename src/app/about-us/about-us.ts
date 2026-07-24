import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-about-us',
  standalone: false,
  templateUrl: './about-us.html',
  styleUrl: './about-us.css',
})
export class AboutUs {
  
email: string = '';

  onSubscribe(): void {
    if (this.email) {
      alert(`Subscribed successfully with: ${this.email}`);
      this.email = '';
    }
  }
}
