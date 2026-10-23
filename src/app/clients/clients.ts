import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { BoardClient, BoardPage, ClientBoardService } from '../services/client-board.service';
import { VelvenLifestyleAvatarComponent } from '../ai-home-match/lifestyle-avatar/lifestyle-avatar.component';
import { EMPTY_HOME_MATCH_PROFILE } from '../ai-home-match/models/home-match-profile';
import { answerLabel } from '../ai-home-match/services/answer-labels';

@Component({
  selector: 'app-clients',
  imports: [CommonModule, FormsModule, RouterLink, VelvenLifestyleAvatarComponent],
  templateUrl: './clients.html',
  styleUrl: './clients.css',
})
export class Clients implements OnInit, OnDestroy {
  readonly label = answerLabel;
  readonly hero = {
    ...EMPTY_HOME_MATCH_PROFILE,
    gender: 'Female' as const,
    adults: 2,
    householdType: 'Couple',
    hasPet: true,
    petTypes: ['Dog' as const],
  };
  readonly districts = [
    'Vake',
    'Saburtalo',
    'Vera',
    'Mtatsminda',
    'Dighomi',
    'DidiDighomi',
    'Didube',
    'Avlabari',
    'Isani',
    'Gldani',
    'Chugureti',
    'Ortachala',
    'Nadzaladevi',
    'Krtsanisi',
    'Vashlijvari',
    'Sololaki',
    'Samgori',
  ];
  district = '';
  budget = '';
  timing = '';
  residents = '';
  pets = '';
  loading = true;
  error = false;
  result: BoardPage = { items: [], total: 0, page: 1, pageSize: 12 };
  private request?: Subscription;
  constructor(
    private api: ClientBoardService,
    private cdr: ChangeDetectorRef,
  ) {}
  ngOnInit() {
    this.search();
  }
  ngOnDestroy() {
    this.request?.unsubscribe();
  }
  search(page = 1) {
    this.request?.unsubscribe();
    this.loading = true;
    this.error = false;
    const filters: Record<string, string | number | boolean> = {
      page,
      district: this.district,
      residents: this.residents,
      pets: this.pets,
    };
    if (this.budget) {
      const [min, max] = this.budget.split('-');
      filters['budgetMin'] = min;
      if (max) filters['budgetMax'] = max;
    }
    if (this.timing) {
      const date = new Date();
      date.setDate(date.getDate() + Number(this.timing));
      filters['moveInBefore'] =
        `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }
    this.request = this.api.board(filters).subscribe({
      next: (result) => {
        this.result = result;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.error = true;
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }
  get pages() {
    return Math.ceil(this.result.total / this.result.pageSize);
  }
  suggest(client: BoardClient) {
    return {
      client: client.id,
      district: client.profile.districts[0] ? answerLabel(client.profile.districts[0]) : undefined,
      bedrooms: client.profile.bedrooms ?? undefined,
    };
  }
  priorityIcon(code: string) {
    if (/Parking/.test(code)) return 'car';
    if (/Quiet|Away/.test(code)) return 'moon';
    if (/Park|Playground/.test(code)) return 'tree';
    if (/Metro|Transport/.test(code)) return 'train-subway';
    if (/School|University|Study|Kindergarten/.test(code)) return 'graduation-cap';
    if (/Workspace|Office|Company/.test(code)) return 'briefcase';
    return 'check';
  }
}
