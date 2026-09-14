import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';

const OUTPUT_SIZE = 512;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

@Component({
  selector: 'app-profile-photo-cropper',
  standalone: false,
  templateUrl: './profile-photo-cropper.html',
  styleUrl: './profile-photo-cropper.css',
})
export class ProfilePhotoCropperComponent implements OnInit, OnChanges, OnDestroy {
  @Input() imageSrc = '';
  @Output() confirmed = new EventEmitter<File>();
  @Output() cancelled = new EventEmitter<void>();
  @ViewChild('stage') private stageRef?: ElementRef<HTMLDivElement>;

  imageLoaded = false;
  confirming = false;
  zoom = MIN_ZOOM;

  private image = new Image();
  private naturalWidth = 0;
  private naturalHeight = 0;
  private baseScale = 1;
  private stageSize = 300;
  private offsetX = 0;
  private offsetY = 0;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private pinchStartDistance = 0;
  private pinchStartZoom = MIN_ZOOM;
  private previousBodyOverflow = '';

  ngOnInit(): void {
    this.previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    this.loadImage();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['imageSrc'] && !changes['imageSrc'].firstChange) {
      this.loadImage();
    }
  }

  ngOnDestroy(): void {
    document.body.style.overflow = this.previousBodyOverflow;
    this.pointers.clear();
  }

  get displayWidth(): number {
    return this.naturalWidth * this.baseScale * this.zoom;
  }

  get displayHeight(): number {
    return this.naturalHeight * this.baseScale * this.zoom;
  }

  get transform(): string {
    return `translate(${this.offsetX}px, ${this.offsetY}px)`;
  }

  @HostListener('window:resize')
  refit(): void {
    if (!this.imageLoaded) return;
    this.measureStage();
    this.clampOffsets();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.cancelled.emit();
  }

  onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.cancelled.emit();
  }

  zoomIn(): void {
    this.setZoom(this.zoom + 0.25);
  }

  zoomOut(): void {
    this.setZoom(this.zoom - 0.25);
  }

  onPointerDown(event: PointerEvent): void {
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.pointers.size === 2) {
      const [first, second] = [...this.pointers.values()];
      this.pinchStartDistance = Math.hypot(first.x - second.x, first.y - second.y);
      this.pinchStartZoom = this.zoom;
    }
    event.preventDefault();
  }

  onPointerMove(event: PointerEvent): void {
    const previous = this.pointers.get(event.pointerId);
    if (!previous) return;
    const current = { x: event.clientX, y: event.clientY };
    this.pointers.set(event.pointerId, current);

    if (this.pointers.size === 2) {
      const [first, second] = [...this.pointers.values()];
      const distance = Math.hypot(first.x - second.x, first.y - second.y);
      if (this.pinchStartDistance > 0 && distance > 0) {
        this.setZoom((this.pinchStartZoom * distance) / this.pinchStartDistance);
      }
      return;
    }

    this.offsetX += current.x - previous.x;
    this.offsetY += current.y - previous.y;
    this.clampOffsets();
  }

  onPointerUp(event: PointerEvent): void {
    this.pointers.delete(event.pointerId);
  }

  onWheel(event: WheelEvent): void {
    event.preventDefault();
    this.setZoom(this.zoom * Math.exp(-event.deltaY * 0.0015));
  }

  confirm(): void {
    if (this.confirming || !this.imageLoaded) return;
    const scale = this.baseScale * this.zoom;
    if (!scale) return;

    const sourceX = Math.max(0, -this.offsetX / scale);
    const sourceY = Math.max(0, -this.offsetY / scale);
    const sourceSize = Math.min(
      this.naturalWidth - sourceX,
      this.naturalHeight - sourceY,
      this.stageSize / scale,
    );
    if (sourceSize <= 0) return;

    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const context = canvas.getContext('2d');
    if (!context) return;

    context.drawImage(this.image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    this.confirming = true;
    canvas.toBlob(
      (blob) => {
        this.confirming = false;
        if (!blob) return;
        this.confirmed.emit(
          new File([blob], 'profile-photo.jpg', {
            type: 'image/jpeg',
            lastModified: Date.now(),
          }),
        );
      },
      'image/jpeg',
      0.92,
    );
  }

  private loadImage(): void {
    this.imageLoaded = false;
    this.zoom = MIN_ZOOM;
    if (!this.imageSrc) return;

    const loader = new Image();
    loader.onload = () => {
      this.image = loader;
      this.naturalWidth = loader.naturalWidth;
      this.naturalHeight = loader.naturalHeight;
      this.measureStage();
      this.imageLoaded = true;
    };
    loader.onerror = () => {
      this.imageLoaded = false;
    };
    loader.src = this.imageSrc;
  }

  private measureStage(): void {
    const measured = this.stageRef?.nativeElement.clientWidth || 300;
    this.stageSize = measured;
    if (this.naturalWidth && this.naturalHeight) {
      this.baseScale = Math.max(measured / this.naturalWidth, measured / this.naturalHeight);
    }
    this.clampOffsets();
  }

  private setZoom(next: number): void {
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    if (clamped === this.zoom) return;
    // Keep the stage center fixed while zooming.
    const center = this.stageSize / 2;
    const ratio = clamped / this.zoom;
    this.offsetX = center - (center - this.offsetX) * ratio;
    this.offsetY = center - (center - this.offsetY) * ratio;
    this.zoom = clamped;
    this.clampOffsets();
  }

  private clampOffsets(): void {
    const width = this.naturalWidth * this.baseScale * this.zoom;
    const height = this.naturalHeight * this.baseScale * this.zoom;
    this.offsetX = Math.min(0, Math.max(this.stageSize - width, this.offsetX));
    this.offsetY = Math.min(0, Math.max(this.stageSize - height, this.offsetY));
  }
}
