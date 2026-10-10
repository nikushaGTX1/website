import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Swipeable photo strip (Airbnb-style): the track follows the finger or mouse, resists
 * past the first/last photo, and settles with an ease-out. Pointer moves run outside
 * Angular and write the transform directly, so dragging stays smooth on slow phones.
 */
@Component({
  selector: 'app-photo-carousel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './photo-carousel.component.html',
  styleUrl: './photo-carousel.component.css',
})
export class PhotoCarouselComponent implements OnChanges, AfterViewInit, OnDestroy {
  @Input() images: string[] = [];
  @Input() alt = '';
  @Input() index = 0;
  /** 'cover' fills the frame (cropped); 'contain' shows the whole photo. */
  @Input() fit: 'cover' | 'contain' = 'cover';
  @Input() showArrows = true;
  @Output() indexChange = new EventEmitter<number>();
  /** A tap/click on a photo that was not part of a swipe. */
  @Output() photoTap = new EventEmitter<number>();
  @Output() imageError = new EventEmitter<{ index: number; event: Event }>();

  @ViewChild('viewport', { static: true }) private viewport!: ElementRef<HTMLElement>;
  @ViewChild('track', { static: true }) private track!: ElementRef<HTMLElement>;

  /** Photos whose <img> has been created; they stay, so revisiting never flashes. */
  private readonly rendered = new Set<number>();
  private gesture: {
    pointer: number;
    x: number;
    y: number;
    width: number;
    axis: 'x' | 'y' | null;
    offset: number;
    lastX: number;
    lastTime: number;
    velocity: number;
  } | null = null;
  private suppressClickUntil = 0;
  private readonly cleanup: Array<() => void> = [];

  constructor(
    private readonly zone: NgZone,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['images'] && !changes['images'].firstChange) this.rendered.clear();
    this.index = this.clamp(this.index);
    this.markRendered();
    if (this.track) this.applyTransform(0, !changes['images']);
  }

  ngAfterViewInit(): void {
    this.applyTransform(0, false);
    const element = this.viewport.nativeElement;
    this.zone.runOutsideAngular(() => {
      const listen = <K extends keyof HTMLElementEventMap>(
        type: K,
        handler: (event: HTMLElementEventMap[K]) => void,
      ): void => {
        element.addEventListener(type, handler as EventListener);
        this.cleanup.push(() => element.removeEventListener(type, handler as EventListener));
      };
      listen('pointerdown', (event) => this.onPointerDown(event));
      listen('pointermove', (event) => this.onPointerMove(event));
      listen('pointerup', (event) => this.onPointerEnd(event, false));
      listen('pointercancel', (event) => this.onPointerEnd(event, true));
      // Touch starts with implicit capture on the slide under the finger; moving capture to the
      // viewport fires a bubbling lostpointercapture from that slide, which must not end the swipe.
      listen('lostpointercapture', (event) => {
        if (event.target === element) this.onPointerEnd(event, true);
      });
    });
  }

  ngOnDestroy(): void {
    this.cleanup.forEach((remove) => remove());
  }

  get count(): number {
    return this.images.length;
  }

  shouldRender(slide: number): boolean {
    return this.rendered.has(slide);
  }

  /** Up to five dots around the active photo; edge dots shrink when more photos follow. */
  get dots(): Array<{ index: number; small: boolean }> {
    const total = this.count;
    if (total <= 1) return [];
    const visible = Math.min(5, total);
    const start = Math.min(Math.max(0, this.index - 2), total - visible);
    return Array.from({ length: visible }, (_, offset) => {
      const index = start + offset;
      return {
        index,
        small: (offset === 0 && start > 0) || (offset === visible - 1 && index < total - 1),
      };
    });
  }

  readonly trackByIndex = (index: number): number => index;

  go(target: number, event?: Event): void {
    event?.stopPropagation();
    event?.preventDefault();
    const next = this.clamp(target);
    if (next !== this.index) {
      this.index = next;
      this.markRendered();
      this.indexChange.emit(next);
    }
    this.applyTransform(0, true);
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowRight') this.go(this.index + 1, event);
    else if (event.key === 'ArrowLeft') this.go(this.index - 1, event);
    else if ((event.key === 'Enter' || event.key === ' ') && event.target === this.viewport.nativeElement) {
      event.preventDefault();
      this.photoTap.emit(this.index);
    }
  }

  onClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).closest('button')) return;
    if (Date.now() < this.suppressClickUntil) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    this.photoTap.emit(this.index);
  }

  onImageError(index: number, event: Event): void {
    this.imageError.emit({ index, event });
  }

  private onPointerDown(event: PointerEvent): void {
    if (!event.isPrimary || event.button !== 0 || this.count < 2) return;
    if ((event.target as HTMLElement).closest('button')) return;
    this.gesture = {
      pointer: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      width: this.viewport.nativeElement.clientWidth || 1,
      axis: null,
      offset: 0,
      lastX: event.clientX,
      lastTime: performance.now(),
      velocity: 0,
    };
  }

  private onPointerMove(event: PointerEvent): void {
    const gesture = this.gesture;
    if (!gesture || gesture.pointer !== event.pointerId) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (!gesture.axis) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 6) return;
      // Mostly-horizontal drags belong to the gallery; vertical ones stay page scrolls.
      gesture.axis = Math.abs(dx) > Math.abs(dy) * 1.1 ? 'x' : 'y';
      if (gesture.axis === 'y') {
        this.gesture = null;
        return;
      }
      this.viewport.nativeElement.setPointerCapture(event.pointerId);
      this.track.nativeElement.classList.add('dragging');
    }
    event.preventDefault();
    const now = performance.now();
    const elapsed = Math.max(1, now - gesture.lastTime);
    gesture.velocity = 0.8 * ((event.clientX - gesture.lastX) / elapsed) + 0.2 * gesture.velocity;
    gesture.lastX = event.clientX;
    gesture.lastTime = now;
    // Past the first/last photo the strip resists instead of stopping dead.
    const atStart = this.index === 0 && dx > 0;
    const atEnd = this.index === this.count - 1 && dx < 0;
    gesture.offset = atStart || atEnd ? dx * 0.3 : Math.max(-gesture.width, Math.min(gesture.width, dx));
    this.applyTransform(gesture.offset, false);
  }

  private onPointerEnd(event: PointerEvent, cancelled: boolean): void {
    const gesture = this.gesture;
    if (!gesture || gesture.pointer !== event.pointerId) return;
    this.gesture = null;
    this.track.nativeElement.classList.remove('dragging');
    if (this.viewport.nativeElement.hasPointerCapture(event.pointerId)) {
      this.viewport.nativeElement.releasePointerCapture(event.pointerId);
    }
    if (gesture.axis !== 'x') return;
    this.suppressClickUntil = Date.now() + 400;
    const { offset, velocity, width } = gesture;
    const flick =
      Math.abs(velocity) > 0.35 && Math.abs(offset) > 20 && Math.sign(velocity) === Math.sign(offset);
    const step = !cancelled && (Math.abs(offset) > width * 0.22 || flick) ? (offset < 0 ? 1 : -1) : 0;
    this.zone.run(() => {
      this.go(this.index + step);
      this.cdr.markForCheck();
    });
  }

  private applyTransform(offset: number, animate: boolean): void {
    const track = this.track?.nativeElement;
    if (!track) return;
    track.classList.toggle('animate', animate);
    track.style.transform = `translate3d(calc(${-100 * this.index}% + ${offset}px), 0, 0)`;
  }

  private markRendered(): void {
    for (const slide of [this.index - 1, this.index, this.index + 1]) {
      if (slide >= 0 && slide < this.count) this.rendered.add(slide);
    }
  }

  private clamp(value: number): number {
    return Math.max(0, Math.min(Math.max(0, this.count - 1), Number(value) || 0));
  }
}
