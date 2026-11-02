import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

/**
 * Photo position dots, as on the Rent/Buy cards: at most five show at once; the row slides
 * along as the photo changes, the dots at the edges shrink when more photos follow, and the
 * selected dot pops. Purely visual (the photo count is announced elsewhere).
 */
@Component({
  selector: 'app-photo-dots',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (count > 1) {
      <div class="pd-window" aria-hidden="true">
        <div class="pd-track" [style.transform]="trackTransform">
          @for (dot of all; track dot) {
            <span [class.active]="dot === index" [class.small]="isSmall(dot)"></span>
          }
        </div>
      </div>
    }
  `,
  styles: `
    :host { display: block; pointer-events: none; }
    .pd-window { position: relative; width: 50px; height: 14px; overflow: hidden; border-radius: 999px; }
    .pd-track {
      position: absolute; top: 4px; left: 0; display: flex; align-items: center; gap: 5px; width: max-content;
      transition: transform 300ms cubic-bezier(.2, .8, .2, 1); will-change: transform;
    }
    span {
      width: 6px; height: 6px; flex: 0 0 6px; border-radius: 50%; background: #ffffffa8; box-shadow: 0 1px 3px #00000055;
      opacity: .82; transform: scale(1);
      transition: transform 260ms cubic-bezier(.2, .8, .2, 1), opacity 220ms ease, background-color 220ms ease;
    }
    span.active { background: #fff; opacity: 1; transform: scale(1.22); animation: pd-pop 320ms cubic-bezier(.2, .8, .2, 1); }
    span.small { opacity: .58; transform: scale(.62); }
    span.small.active { opacity: 1; transform: scale(1.22); }
    @keyframes pd-pop {
      0% { transform: scale(.65); opacity: .55; }
      58% { transform: scale(1.36); opacity: 1; }
      100% { transform: scale(1.22); opacity: 1; }
    }
    @media (prefers-reduced-motion: reduce) {
      .pd-track, span { transition: none; animation: none; }
    }
  `,
})
export class PhotoDotsComponent {
  @Input() count = 0;
  @Input() index = 0;

  private static readonly VISIBLE = 5;
  /** Dot width (6px) plus the gap (5px). */
  private static readonly PITCH = 11;

  get all(): number[] {
    return Array.from({ length: this.count }, (_, i) => i);
  }

  private get start(): number {
    return Math.max(0, Math.min(this.index - 2, this.count - PhotoDotsComponent.VISIBLE));
  }

  get trackTransform(): string {
    if (this.count <= PhotoDotsComponent.VISIBLE) {
      const width = this.count * 6 + Math.max(0, this.count - 1) * 5;
      return `translate3d(${(50 - width) / 2}px, 0, 0)`;
    }
    return `translate3d(${-this.start * PhotoDotsComponent.PITCH}px, 0, 0)`;
  }

  isSmall(dot: number): boolean {
    if (this.count <= PhotoDotsComponent.VISIBLE) return false;
    const first = this.start;
    const last = first + PhotoDotsComponent.VISIBLE - 1;
    return (dot === first && first > 0) || (dot === last && last < this.count - 1);
  }
}
