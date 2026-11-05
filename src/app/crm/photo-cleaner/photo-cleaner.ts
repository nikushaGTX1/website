import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ImageAiService } from '../../services/image-ai.service';

type CleanState = 'waiting' | 'working' | 'cleaned' | 'clean' | 'other' | 'error';

interface CleanItem {
  file: File;
  original: string;
  cleaned?: string;
  state: CleanState;
  message?: string;
  showOriginal?: boolean;
  mask?: File;
}

const MAX_BYTES = 8 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Explicit cleanup of uploader-owned or authorized marks. */
@Component({
  selector: 'app-photo-cleaner',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './photo-cleaner.html',
  styleUrl: './photo-cleaner.css',
})
export class PhotoCleaner implements OnDestroy {
  items: CleanItem[] = [];
  dragging = false;
  running = false;
  notice = '';
  rateLimited = false;
  rightsConfirmed = false;
  authorizationBasis: 'owned' | 'licensed' = 'owned';
  permissionReference = '';
  enabled = false;

  constructor(private imageAi: ImageAiService, private cdr: ChangeDetectorRef) {
    imageAi.availability().subscribe({ next: value => { this.enabled = value.canRemove; this.cdr.markForCheck(); }, error: () => { this.enabled = false; } });
  }

  pickMask(item: CleanItem, input: HTMLInputElement): void {
    item.mask = input.files?.[0];
    input.value = '';
  }

  get canStart(): boolean {
    return this.enabled && this.rightsConfirmed && !this.running && !this.rateLimited &&
      (this.authorizationBasis === 'owned' || !!this.permissionReference.trim());
  }

  start(): void { if (this.canStart) void this.run(); }

  ngOnDestroy(): void {
    for (const item of this.items) {
      URL.revokeObjectURL(item.original);
      if (item.cleaned) URL.revokeObjectURL(item.cleaned);
    }
  }

  get cleanedCount(): number {
    return this.items.filter((item) => item.state === 'cleaned').length;
  }

  count(state: CleanState): number {
    return this.items.filter((item) => item.state === state).length;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging = false;
    this.add(Array.from(event.dataTransfer?.files ?? []));
  }

  onPick(input: HTMLInputElement): void {
    this.add(Array.from(input.files ?? []));
    input.value = '';
  }

  private add(files: File[]): void {
    const skipped = files.filter((file) => !TYPES.includes(file.type) || file.size > MAX_BYTES);
    this.notice = skipped.length
      ? `${skipped.length} file(s) skipped: use JPG, PNG or WebP up to 8 MB.`
      : '';
    for (const file of files.filter((f) => !skipped.includes(f))) {
      this.items.push({ file, original: URL.createObjectURL(file), state: 'waiting' });
    }
  }

  /** Submit each explicitly selected image once; stop the batch on failure. */
  private async run(): Promise<void> {
    if (!this.canStart) return;
    this.running = true;
    let item: CleanItem | undefined;
    while ((item = this.items.find((entry) => entry.state === 'waiting'))) {
      item.state = 'working';
      this.cdr.markForCheck();
      try {
        const result = await firstValueFrom(this.imageAi.check(item.file, 'clean', this.rightsConfirmed, { mask: item.mask, authorizationBasis: this.authorizationBasis, permissionReference: this.permissionReference }));
        if (result.cleanedImage) {
          item.cleaned = URL.createObjectURL(base64Blob(result.cleanedImage, result.contentType || 'image/png'));
          item.state = 'cleaned';
        } else if (result.classification === 'none') {
          item.state = 'clean';
        } else if (result.classification === 'third_party') {
          item.state = 'other';
          item.message = result.watermarkText
            ? `Watermark (${result.watermarkText}) could not be removed. Try again.`
            : 'The detected watermark could not be removed. Try again.';
        } else {
          item.state = 'error';
          item.message = 'The watermark was found but could not be removed cleanly.';
        }
      } catch (error: any) {
        if (error?.status === 429) {
          // A rejected request did not produce an edit. Retain this and remaining originals.
          item.state = 'waiting';
          const message = error?.error?.message;
          const busy = typeof message === 'string' && message.includes('Another image');
          this.rateLimited = !busy;
          this.notice = busy ? message : (message || 'Image processing is temporarily unavailable.') +
            ' Your remaining photos are kept here. Download completed results and refresh before trying again. No automatic retry was made.';
          break;
        }
        item.state = 'error';
        item.message = error?.error?.message || 'Image editing failed. No automatic retry was made.';
        this.notice = 'Processing paused after a failure. Review the error before starting remaining photos.';
        break;
      }
      this.cdr.markForCheck();
    }
    this.running = false;
    this.cdr.markForCheck();
  }

  retry(item: CleanItem): void {
    if (!this.canStart) return;
    item.state = 'waiting';
    item.message = undefined;
    void this.run();
  }

  remove(item: CleanItem): void {
    URL.revokeObjectURL(item.original);
    if (item.cleaned) URL.revokeObjectURL(item.cleaned);
    this.items = this.items.filter((entry) => entry !== item);
  }

  clear(): void {
    if (this.running) return;
    this.ngOnDestroy();
    this.items = [];
    this.notice = '';
  }

  fileName(item: CleanItem): string {
    const base = item.file.name.replace(/\.[^.]+$/, '');
    return `${base}-velven.png`;
  }

  downloadOriginal(item: CleanItem): void {
    const link = document.createElement('a');
    link.href = item.original;
    link.download = item.file.name;
    link.click();
  }

  download(item: CleanItem): void {
    const url = item.cleaned ?? (item.state === 'clean' ? item.original : undefined);
    if (!url) return;
    const link = document.createElement('a');
    link.href = url;
    link.download = item.cleaned ? this.fileName(item) : item.file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  /** Clean photos and photos that had no watermark, one file each. */
  async downloadAll(): Promise<void> {
    for (const item of this.items.filter((entry) => entry.state === 'cleaned' || entry.state === 'clean')) {
      this.download(item);
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
  }

  get downloadableCount(): number {
    return this.count('cleaned') + this.count('clean');
  }
}

function base64Blob(base64: string, type: string): Blob {
  const bytes = atob(base64);
  const buffer = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) buffer[i] = bytes.charCodeAt(i);
  return new Blob([buffer], { type });
}
