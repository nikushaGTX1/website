import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { firstValueFrom, Subscription } from 'rxjs';
import { importLibrary, setOptions } from '@googlemaps/js-api-loader';
import { AdminAreaDetail, AdminService, AdminStreetDetail, AdminStreetSummary } from '../services/admin.service';

@Component({
  selector: 'app-street-validation-map',
  standalone: false,
  templateUrl: './street-validation-map.component.html',
  styleUrl: './street-validation-map.component.css',
})
export class StreetValidationMapComponent implements AfterViewInit, OnDestroy {
  @ViewChild('map') mapElement?: ElementRef<HTMLDivElement>;
  streets: AdminStreetSummary[] = [];
  selected?: AdminStreetDetail;
  reviewArea?: AdminAreaDetail;
  status = 'pending_review';
  search = '';
  importDistrict = 'Vake';
  notes = '';
  source = '';
  externalSourceId = '';
  geometryText = '';
  audit: any;
  loading = false;
  message = '';
  errorMessage = '';
  allowOutsideDistrict = false;
  readonly districts = ['Vake','Saburtalo','Vera','Mtatsminda','Didube','Digomi','Didi Digomi','Gldani','Nadzaladevi','Isani','Samgori','Avlabari','Sololaki','Chugureti','Krtsanisi','Vashlijvari'];
  private map?: google.maps.Map;
  private lines: google.maps.Polyline[] = [];
  private polygons: google.maps.Polygon[] = [];
  private subscription = new Subscription();

  constructor(private admin: AdminService, private cdr: ChangeDetectorRef) {}

  ngAfterViewInit(): void { void this.initializeMap(); this.reload(); this.loadAudit(); }
  ngOnDestroy(): void { this.subscription.unsubscribe(); this.clearGeometry(); }

  reload(): void {
    this.loading = true; this.errorMessage = '';
    this.subscription.add(this.admin.getStreets(this.status, this.search).subscribe({
      next: (streets) => { this.streets = streets; this.loading = false; this.cdr.detectChanges(); },
      error: () => { this.errorMessage = 'Queue failed to load.'; this.loading = false; this.cdr.detectChanges(); },
    }));
  }

  select(street: AdminStreetSummary): void {
    this.loading = true;
    this.subscription.add(this.admin.getStreet(street.id).subscribe({
      next: (detail) => {
        this.selected = detail;
        this.notes = detail.reviewNotes || '';
        this.source = detail.source;
        this.externalSourceId = detail.externalSourceId;
        this.geometryText = JSON.stringify(detail.geometry, null, 2);
        this.draw(detail);
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => { this.errorMessage = 'Geometry failed to load.'; this.loading = false; },
    }));
  }

  import(): void {
    this.loading = true; this.message = ''; this.errorMessage = '';
    this.admin.importDistrictStreets(this.importDistrict).subscribe({
      next: (result) => {
        this.message = `${result.candidateCount} ${result.district} street candidates imported for review.`;
        this.admin.getReviewArea(result.districtId).subscribe({
          next: (area) => { this.reviewArea = area; this.drawArea(area); this.cdr.detectChanges(); },
          error: () => { this.errorMessage = 'Boundary review failed to load.'; },
        });
        this.reload(); this.loadAudit();
      },
      error: (error) => { this.loading = false; this.errorMessage = error?.error?.detail || 'Import failed.'; },
    });
  }

  async importAll(): Promise<void> {
    this.loading = true; this.message = ''; this.errorMessage = '';
    let imported = 0;
    const failed: string[] = [];
    for (const district of this.districts) {
      try {
        await firstValueFrom(this.admin.importDistrictStreets(district));
        imported++;
      } catch {
        failed.push(district);
      }
    }
    this.loading = false;
    this.message = `${imported} districts imported for review.`;
    if (failed.length) this.errorMessage = `Import failed: ${failed.join(', ')}`;
    this.reload(); this.loadAudit(); this.cdr.detectChanges();
  }

  approveAll(): void {
    this.loading = true; this.message = ''; this.errorMessage = '';
    this.admin.approveAllVerifiedGeometry().subscribe({
      next: (result) => {
        this.loading = false;
        this.message = `Approved ${result.approvedDistricts} districts and ${result.approvedStreets} streets.`;
        const skipped = result.skippedDistricts.length + result.skippedStreets.length;
        if (skipped) this.errorMessage = `${skipped} invalid or incomplete records were safely skipped.`;
        this.selected = undefined; this.reviewArea = undefined; this.clearGeometry();
        this.reload(); this.loadAudit(); this.cdr.detectChanges();
      },
      error: (error) => { this.loading = false; this.errorMessage = error?.error?.message || 'Bulk approval failed.'; },
    });
  }

  approve(): void {
    if (!this.selected) return;
    this.admin.approveStreet(this.selected.id, this.notes, this.allowOutsideDistrict).subscribe({
      next: () => { this.message = 'Street approved.'; this.selected = undefined; this.clearGeometry(); this.reload(); this.loadAudit(); },
      error: (error) => { this.errorMessage = error?.error?.message || 'Approval failed.'; },
    });
  }

  reject(): void {
    if (!this.selected) return;
    this.admin.rejectStreet(this.selected.id, this.notes).subscribe({
      next: () => { this.message = 'Street rejected.'; this.selected = undefined; this.clearGeometry(); this.reload(); this.loadAudit(); },
      error: () => { this.errorMessage = 'Rejection failed.'; },
    });
  }

  saveGeometry(): void {
    if (!this.selected) return;
    let geometry: unknown;
    try { geometry = JSON.parse(this.geometryText); }
    catch { this.errorMessage = 'Geometry is not valid GeoJSON.'; return; }
    this.admin.replaceStreetGeometry(this.selected.id, {
      geometry, source: this.source, externalSourceId: this.externalSourceId,
      nameKa: this.selected.nameKa, nameEn: this.selected.nameEn,
      aliases: this.selected.aliases, notes: this.notes,
    }).subscribe({
      next: (detail) => { this.selected = detail; this.draw(detail); this.message = 'Geometry saved for review.'; },
      error: (error) => { this.errorMessage = error?.error?.message || 'Save failed.'; },
    });
  }

  loadAudit(): void {
    this.admin.getStreetAudit().subscribe({ next: (audit) => { this.audit = audit; this.cdr.detectChanges(); } });
  }

  approveArea(): void {
    if (!this.reviewArea) return;
    this.admin.approveReviewArea(this.reviewArea.id).subscribe({
      next: () => {
        if (this.reviewArea) this.reviewArea.geometryStatus = 'approved';
        this.message = 'District boundary approved.';
        this.cdr.detectChanges();
      },
      error: (error) => { this.errorMessage = error?.error?.message || 'Boundary approval failed.'; },
    });
  }

  private async initializeMap(): Promise<void> {
    const apiKey = document.querySelector<HTMLMetaElement>('meta[name="google-maps-api-key"]')?.content?.trim();
    const mapId = document.querySelector<HTMLMetaElement>('meta[name="google-maps-map-id"]')?.content?.trim();
    if (!apiKey || !this.mapElement) return;
    setOptions({ key: apiKey, v: 'weekly', ...(mapId ? { mapIds: [mapId] } : {}) });
    const { Map } = await importLibrary('maps') as google.maps.MapsLibrary;
    this.map = new Map(this.mapElement.nativeElement, {
      center: { lat: 41.7151, lng: 44.7833 }, zoom: 12,
      ...(mapId ? { mapId } : {}), mapTypeControl: false, streetViewControl: false,
    });
  }

  private draw(street: AdminStreetDetail): void {
    if (!this.map || !street.geometry) return;
    this.clearGeometry();
    const paths = street.geometry.type === 'LineString'
      ? [street.geometry.coordinates as number[][]]
      : street.geometry.coordinates as number[][][];
    const bounds = new google.maps.LatLngBounds();
    for (const path of paths) {
      const points = path.map(([lng, lat]) => ({ lat, lng }));
      points.forEach((point) => bounds.extend(point));
      this.lines.push(new google.maps.Polyline({
        map: this.map, path: points, strokeColor: '#6d28d9',
        strokeOpacity: 1, strokeWeight: 7, zIndex: 1000,
      }));
    }
    if (!bounds.isEmpty()) this.map.fitBounds(bounds, 80);
  }


  private drawArea(area: AdminAreaDetail): void {
    if (!this.map || !area.geometry) return;
    this.clearGeometry();
    const polygons = area.geometry.type === 'Polygon'
      ? [area.geometry.coordinates as number[][][]]
      : area.geometry.coordinates as number[][][][];
    const bounds = new google.maps.LatLngBounds();
    for (const polygon of polygons) {
      const paths = polygon.map((ring) => ring.map(([lng, lat]) => {
        const point = { lat, lng }; bounds.extend(point); return point;
      }));
      this.polygons.push(new google.maps.Polygon({
        map: this.map, paths, strokeColor: '#6d28d9', strokeOpacity: 1,
        strokeWeight: 4, fillColor: '#6d28d9', fillOpacity: 0.16,
      }));
    }
    if (!bounds.isEmpty()) this.map.fitBounds(bounds, 60);
  }

  private clearGeometry(): void {
    this.lines.forEach((line) => line.setMap(null)); this.lines = [];
    this.polygons.forEach((polygon) => polygon.setMap(null)); this.polygons = [];
  }
}
