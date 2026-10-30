import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy } from '@angular/core';
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
}

const MAX_BYTES = 8 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * CRM tool: staff drop listing photos, Velven's and licensed partners' watermarks
 * (myhome.ge, ss.ge) are removed, and the clean photos are downloaded.
 * Other companies' watermarks are never removed; those photos are flagged instead.
 */
@Component({
  selector: 'app-photo-cleaner',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './photo-cleaner.html',
  styleUrl: './photo-cleaner.css',
})
export class PhotoCleaner implements OnDestroy {
  items: CleanItem[] = [];
  dragging = false;
  running = false;
  notice = '';

  constructor(private imageAi: ImageAiService, private cdr: ChangeDetectorRef) {}

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
    void this.run();
  }

  /** One photo at a time: the AI service runs on a single GPU worker. */
  private async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    let item: CleanItem | undefined;
    while ((item = this.items.find((entry) => entry.state === 'waiting'))) {
      item.state = 'working';
      this.cdr.markForCheck();
      try {
        const result = await firstValueFrom(this.imageAi.check(item.file, 'clean', true));
        if (result.cleanedImage) {
          item.cleaned = URL.createObjectURL(base64Blob(result.cleanedImage, result.contentType || 'image/jpeg'));
          item.state = 'cleaned';
        } else if (result.classification === 'none') {
          item.state = 'clean';
        } else if (result.classification === 'third_party') {
          item.state = 'other';
          item.message = result.watermarkText
            ? `Watermark of another company (${result.watermarkText}). Ask the owner for the original photo.`
            : 'Unrecognised watermark. Ask the owner for the original photo.';
        } else {
          item.state = 'error';
          item.message = 'The watermark was found but could not be removed cleanly.';
        }
      } catch (error: any) {
        item.state = 'error';
        item.message = error?.error?.message || 'Photo check failed. Try again.';
      }
      this.cdr.markForCheck();
    }
    this.running = false;
    this.cdr.markForCheck();
  }

  retry(item: CleanItem): void {
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
    return `${base}-velven.jpg`;
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
