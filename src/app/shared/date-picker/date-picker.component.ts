import { CommonModule } from '@angular/common';
import { Component, ElementRef, Input, NgZone, OnDestroy, OnInit, forwardRef } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { TranslationService } from '../../services/translation.service';
import { claimEscape, escapeAlreadyHandled } from '../../utils/escape-layer';

type Day = { iso: string; date: number; inMonth: boolean; today: boolean; disabled: boolean };

const MONTHS: Record<string, string[]> = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  ka: ['იანვარი', 'თებერვალი', 'მარტი', 'აპრილი', 'მაისი', 'ივნისი', 'ივლისი', 'აგვისტო', 'სექტემბერი', 'ოქტომბერი', 'ნოემბერი', 'დეკემბერი'],
  ru: ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'],
};
const WEEKDAYS: Record<string, string[]> = {
  en: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
  ka: ['ორ', 'სა', 'ოთ', 'ხუ', 'პა', 'შა', 'კვ'],
  ru: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
};

/**
 * Branded date picker used in place of the browser's native <input type="date">.
 * Value is an ISO "yyyy-mm-dd" string (or ''), so it drops into existing ngModel bindings.
 */
@Component({
  selector: 'app-date-picker',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './date-picker.component.html',
  styleUrl: './date-picker.component.css',
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DatePickerComponent), multi: true }],
})
export class DatePickerComponent implements ControlValueAccessor, OnInit, OnDestroy {
  @Input() placeholder = 'Select a date';
  /** Earliest selectable date (ISO). Defaults to today, since these are move-in dates. */
  @Input() min: string | null = DatePickerComponent.iso(new Date());

  value = '';
  open = false;
  disabled = false;
  viewYear = new Date().getFullYear();
  viewMonth = new Date().getMonth();
  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(
    private host: ElementRef<HTMLElement>,
    private translation: TranslationService,
    private zone: NgZone,
  ) {}

  private static iso(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  private get lang(): string {
    const language = this.translation.language$.value;
    return MONTHS[language] ? language : 'en';
  }

  get weekdays(): string[] { return WEEKDAYS[this.lang]; }
  get monthTitle(): string { return `${MONTHS[this.lang][this.viewMonth]} ${this.viewYear}`; }

  get displayValue(): string {
    if (!this.value) return '';
    const [y, m, d] = this.value.split('-').map(Number);
    return `${d} ${MONTHS[this.lang][m - 1]} ${y}`;
  }

  get canGoBack(): boolean {
    if (!this.min) return true;
    const [y, m] = this.min.split('-').map(Number);
    return this.viewYear > y || (this.viewYear === y && this.viewMonth > m - 1);
  }

  /** Six Monday-first weeks covering the visible month. */
  get days(): Day[] {
    const first = new Date(this.viewYear, this.viewMonth, 1);
    const offset = (first.getDay() + 6) % 7;
    const today = DatePickerComponent.iso(new Date());
    const days: Day[] = [];
    for (let i = 0; i < 42; i++) {
      const date = new Date(this.viewYear, this.viewMonth, 1 - offset + i);
      const iso = DatePickerComponent.iso(date);
      days.push({
        iso,
        date: date.getDate(),
        inMonth: date.getMonth() === this.viewMonth,
        today: iso === today,
        disabled: !!this.min && iso < this.min,
      });
    }
    return days;
  }


  toggle(): void {
    if (this.disabled) return;
    this.open = !this.open;
    if (this.open) {
      const base = this.value ? new Date(this.value + 'T00:00:00') : new Date();
      this.viewYear = base.getFullYear();
      this.viewMonth = base.getMonth();
      this.placePanel();
    } else {
      this.onTouched();
    }
  }

  /**
   * After opening, scroll whichever container holds the field (filters drawer or page)
   * just enough to show the whole calendar. Phones use the fixed bottom sheet instead.
   */
  private placePanel(): void {
    if (window.innerWidth <= 650) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const panel = this.host.nativeElement.querySelector<HTMLElement>('.dp-panel');
      panel?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }));
  }

  move(step: number): void {
    const next = new Date(this.viewYear, this.viewMonth + step, 1);
    this.viewYear = next.getFullYear();
    this.viewMonth = next.getMonth();
  }

  pick(day: Day): void {
    if (day.disabled) return;
    this.set(day.iso);
    this.open = false;
  }

  pickToday(): void { this.set(DatePickerComponent.iso(new Date())); this.open = false; }
  clear(): void { this.set(''); this.open = false; }

  private set(value: string): void {
    this.value = value;
    this.onChange(value);
    this.onTouched();
  }

  trackDay(_: number, day: Day): string { return day.iso; }

  /**
   * Close on any press outside the picker. Listens in the capture phase: hosts such as the
   * filters drawer call stopPropagation() on clicks, so a normal document click never arrived.
   */
  private readonly outsidePress = (event: Event): void => {
    if (!this.open || this.host.nativeElement.contains(event.target as Node)) return;
    this.zone.run(() => {
      this.open = false;
      this.onTouched();
    });
  };

  ngOnInit(): void {
    this.zone.runOutsideAngular(() => {
      document.addEventListener('pointerdown', this.outsidePress, true);
      // Capture phase: the calendar is the topmost layer, so it closes before any dialog around it.
      document.addEventListener('keydown', this.escapePress, true);
    });
  }

  ngOnDestroy(): void {
    document.removeEventListener('pointerdown', this.outsidePress, true);
    document.removeEventListener('keydown', this.escapePress, true);
  }

  private readonly escapePress = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || !this.open || escapeAlreadyHandled(event)) return;
    claimEscape(event);
    this.zone.run(() => (this.open = false));
  };

  writeValue(value: string | null): void { this.value = value || ''; }
  registerOnChange(fn: (value: string) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(disabled: boolean): void { this.disabled = disabled; }
}
