import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnDestroy,
  Output,
  QueryList,
  ViewChildren,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { lockPageScroll, unlockPageScroll } from '../../utils/page-scroll-lock';

export interface CodeDialogSubmit {
  code: string;
  password: string;
}

/**
 * Branded pop-up for entering a 6-digit email code (sign-up verification,
 * password reset, password change). Optional "new password" field.
 */
@Component({
  selector: 'app-code-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './code-dialog.component.html',
  styleUrl: './code-dialog.component.css',
})
export class CodeDialogComponent implements AfterViewInit, OnDestroy {
  @Input() heading = 'Verify your email';
  @Input() description = 'Enter the 6-digit code we sent to';
  @Input() email = '';
  @Input() submitLabel = 'Verify';
  @Input() askPassword = false;
  @Input() busy = false;
  @Input() error = '';
  @Input() info = '';

  @Output() submitted = new EventEmitter<CodeDialogSubmit>();
  @Output() resend = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  @ViewChildren('digit') digitInputs!: QueryList<ElementRef<HTMLInputElement>>;

  readonly slots = [0, 1, 2, 3, 4, 5];
  digits = ['', '', '', '', '', ''];
  password = '';
  showPassword = false;
  resendIn = 30;
  private timer?: number;

  get code(): string {
    return this.digits.join('');
  }

  get canSubmit(): boolean {
    return this.code.length === 6 && (!this.askPassword || this.password.length >= 6) && !this.busy;
  }

  ngAfterViewInit(): void {
    lockPageScroll();
    this.startResendTimer();
    setTimeout(() => this.focus(0));
  }

  ngOnDestroy(): void {
    unlockPageScroll();
    window.clearInterval(this.timer);
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(event: Event): void {
    event.preventDefault();
    this.closed.emit();
  }

  onDigitInput(index: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = input.value.replace(/\D/g, '');
    if (value.length > 1) {
      this.fill(value, index);
      return;
    }
    this.digits[index] = value;
    input.value = value;
    if (value && index < 5) this.focus(index + 1);
    this.autoSubmit();
  }

  onDigitKeydown(index: number, event: KeyboardEvent): void {
    if (event.key === 'Backspace' && !this.digits[index] && index > 0) {
      this.digits[index - 1] = '';
      this.focus(index - 1);
      event.preventDefault();
    } else if (event.key === 'ArrowLeft' && index > 0) {
      this.focus(index - 1);
    } else if (event.key === 'ArrowRight' && index < 5) {
      this.focus(index + 1);
    } else if (event.key === 'Enter') {
      this.submit();
    }
  }

  onPaste(event: ClipboardEvent): void {
    const text = event.clipboardData?.getData('text') ?? '';
    const numbers = text.replace(/\D/g, '');
    if (!numbers) return;
    event.preventDefault();
    this.fill(numbers, 0);
  }

  submit(): void {
    if (!this.canSubmit) return;
    this.submitted.emit({ code: this.code, password: this.password });
  }

  requestResend(): void {
    if (this.resendIn > 0 || this.busy) return;
    this.digits = ['', '', '', '', '', ''];
    this.resend.emit();
    this.startResendTimer();
    this.focus(0);
  }

  private fill(numbers: string, start: number): void {
    for (let i = 0; i < numbers.length && start + i < 6; i++) this.digits[start + i] = numbers[i];
    this.digitInputs.forEach((ref, i) => (ref.nativeElement.value = this.digits[i]));
    this.focus(Math.min(5, start + numbers.length));
    this.autoSubmit();
  }

  private autoSubmit(): void {
    // Verify straight away once all six digits are in (no password step needed).
    if (!this.askPassword && this.code.length === 6) this.submit();
  }

  private focus(index: number): void {
    const ref = this.digitInputs?.get(index);
    ref?.nativeElement.focus();
    ref?.nativeElement.select();
  }

  private startResendTimer(): void {
    window.clearInterval(this.timer);
    this.resendIn = 30;
    this.timer = window.setInterval(() => {
      this.resendIn = Math.max(0, this.resendIn - 1);
      if (!this.resendIn) window.clearInterval(this.timer);
    }, 1000);
  }
}
