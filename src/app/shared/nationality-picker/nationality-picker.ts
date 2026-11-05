import { Component, ElementRef, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CountryOption, countryOptions, fold } from '../../utils/country-names';
import { enableFlagEmojis } from '../../utils/flag-emoji';
import { TranslationService } from '../../services/translation.service';

// Windows has no flag emoji: load the site's flag font.
enableFlagEmojis();

/** Countries listed first; the rest follow alphabetically. Same order as Velven Match. */
const POPULAR = ['GE', 'RU', 'UA', 'BY', 'AM', 'AZ', 'KZ', 'TR', 'IR', 'IL', 'AE', 'SA', 'IN', 'CN', 'US', 'GB', 'DE', 'FR', 'IT', 'PL'];

/**
 * Searchable country dropdown with flags. The value is the English country name
 * ("Georgia"), the same value Velven Match saves.
 */
@Component({
  selector: 'app-nationality-picker',
  templateUrl: './nationality-picker.html',
  styleUrl: './nationality-picker.css',
  imports: [NgIf, NgFor, FormsModule],
})
export class NationalityPicker {
  @Input() value = '';
  @Output() valueChange = new EventEmitter<string>();
  @Input() inputId = 'nationality';

  open = false;
  search = '';

  constructor(private translation: TranslationService, private host: ElementRef<HTMLElement>) {}

  private get all(): CountryOption[] {
    return countryOptions(this.translation.language$.value);
  }

  get selected(): CountryOption | undefined {
    return this.all.find((country) => country.name === this.value);
  }

  get options(): CountryOption[] {
    const all = this.all;
    const query = fold(this.search.trim());
    if (query) return all.filter((country) => country.search.includes(query));
    const first = POPULAR.map((code) => all.find((country) => country.code === code)).filter((c): c is CountryOption => !!c);
    const shown = new Set(first.map((country) => country.code));
    return [...first, ...all.filter((country) => !shown.has(country.code))];
  }

  toggle(): void {
    this.open = !this.open;
    if (this.open) setTimeout(() => this.host.nativeElement.querySelector<HTMLInputElement>('.np-search input')?.focus(), 0);
  }

  choose(country: CountryOption): void {
    this.value = country.name;
    this.valueChange.emit(country.name);
    this.open = false;
    this.search = '';
  }

  trackCode(_: number, country: CountryOption): string {
    return country.code;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    if (this.open && !this.host.nativeElement.contains(event.target as Node)) this.open = false;
  }

  @HostListener('keydown.escape')
  onEscape(): void {
    this.open = false;
  }
}
