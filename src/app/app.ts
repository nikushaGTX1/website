import { AfterViewInit, Component, signal } from '@angular/core';
import { TranslationService } from './services/translation.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  standalone: false,
  styleUrl: './app.css'
})
export class App implements AfterViewInit {
  protected readonly title = signal('site');

  constructor(private translation: TranslationService) {}

  ngAfterViewInit(): void {
    this.translation.start();
  }
}
