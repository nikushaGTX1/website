import { DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { clientRelativeTime } from '../utils/client-relative-time';
import { ChangeDetectorRef, Component, ElementRef, HostListener, OnDestroy, OnInit } from '@angular/core';
import { claimEscape, escapeAlreadyHandled } from '../utils/escape-layer';
import { NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription, catchError, forkJoin, of, timer } from 'rxjs';
import { Apartment } from '../models/apartment';
import { SavedSearch, SavedSearchMatchRecord } from '../models/client';
import { HomeMatchProfile } from '../ai-home-match/models/home-match-profile';
import { HomeMatchResult } from '../ai-home-match/models/home-match-result';
import { HomeMatchService } from '../ai-home-match/services/home-match.service';
import { answerLabel, answerList, bedroomsLabel } from '../ai-home-match/services/answer-labels';
import { evaluateMandatoryRequirements, selectedPets } from '../ai-home-match/services/mandatory-requirements';
import { ApartmentService } from '../services/apartment.service';
import { AuthService } from '../services/auth.service';
import { ClientService } from '../services/client.service';
import { CurrencyService } from '../services/currency.service';
import { FavoriteService } from '../services/favorite.service';
import { TranslationService } from '../services/translation.service';
import { DiscoverCard } from './discover-card/discover-card';

type DiscoverTab = 'new' | 'all' | 'saved';
type SortOrder = 'best' | 'newest' | 'price-low' | 'price-high';

/** One home in a Discover list. */
interface DiscoverItem {
  apartment: Apartment;
  searchId: number;
  /** Lifestyle ranking from Velven Match (higher is better). */
  score: number;
  needsCheck: boolean;
  isNew: boolean;
  matchedAt?: string;
}

/** What the page shows for each saved search. */
interface SearchView {
  search: SavedSearch;
  matches: DiscoverItem[];
  /** Velven Match could not be run for this search (network); counts are unknown. */
  failed: boolean;
}

/**
 * Velven Discover: the client's saved Velven Match searches, homes published since that match
 * them ("New for you"), every current match, and saved homes. Matches come from the same
 * pipeline as Velven Match itself (API ranking + mandatory requirements on the website).
 */
@Component({
  selector: 'app-discover',
  templateUrl: './discover.html',
  styleUrl: './discover.css',
  imports: [NgIf, NgFor, FormsModule, RouterLink, DiscoverCard],
})
export class Discover implements OnInit, OnDestroy {
  private readonly destroyRef = inject(DestroyRef);
  loading = true;
  matchesLoading = false;
  errorMessage = '';
  searches: SearchView[] = [];
  /** null = every saved search. */
  selectedSearchId: number | null = null;
  tab: DiscoverTab = 'new';
  sort: SortOrder = 'best';
  sortOpen = false;
  readonly sortOptions: Array<{ value: SortOrder; label: string; icon: string }> = [
    { value: 'best', label: 'Best match', icon: 'fa-solid fa-wand-magic-sparkles' },
    { value: 'newest', label: 'Newest', icon: 'fa-regular fa-clock' },
    { value: 'price-low', label: 'Price: low to high', icon: 'fa-solid fa-arrow-up-wide-short' },
    { value: 'price-high', label: 'Price: high to low', icon: 'fa-solid fa-arrow-down-wide-short' },
  ];

  get sortLabel(): string {
    return this.sortOptions.find((option) => option.value === this.sort)?.label ?? 'Best match';
  }

  chooseSort(value: SortOrder): void {
    this.sort = value;
    this.sortOpen = false;
  }

  @HostListener('document:click', ['$event'])
  closeSortOnOutsideClick(event: MouseEvent): void {
    if (!this.sortOpen) return;
    const menu = this.host?.nativeElement.querySelector('.sort-menu');
    if (menu && !menu.contains(event.target as Node)) this.sortOpen = false;
  }

  @HostListener('document:keydown.escape', ['$event'])
  closeSortOnEscape(event: Event): void {
    if (!this.sortOpen || escapeAlreadyHandled(event)) return;
    claimEscape(event);
    this.sortOpen = false;
  }
  /** Quick refinements on top of the saved criteria (the saved search itself never changes). */
  refine = { parking: false, petFriendly: false, furnished: false };
  highlightedApartmentId: number | null = null;
  justSaved = false;
  pendingSaveBusy = false;
  get hasPendingSearch(): boolean { return this.client.hasPendingSearch(); }
  retryPendingSearch(): void {
    if (this.pendingSaveBusy) return;
    this.pendingSaveBusy = true;
    this.subscriptions.add(this.client.savePendingSearch().pipe(takeUntilDestroyed(this.destroyRef)).subscribe((id) => {
      this.pendingSaveBusy = false;
      if (id) { this.selectedSearchId = id; this.load(); }
      else this.actionError = 'Could not save your search. Your answers are kept. Please try again.';
      this.cdr.markForCheck();
    }));
  }

  renamingId: number | null = null;
  renameValue = '';
  confirmDeleteId: number | null = null;
  busySearchId: number | null = null;
  actionError = '';

  private newRecords: SavedSearchMatchRecord[] = [];
  private catalogue = new Map<number, Apartment>();
  private favoriteIds = new Set<number>();
  private subscriptions = new Subscription();
  private loadSubscription?: Subscription;
  private matchSubscription?: Subscription;

  constructor(
    private client: ClientService,
    private homeMatch: HomeMatchService,
    private apartments: ApartmentService,
    private favorites: FavoriteService,
    private currency: CurrencyService,
    private auth: AuthService,
    private route: ActivatedRoute,
    private router: Router,
    private cdr: ChangeDetectorRef,
    readonly translation: TranslationService,
    // Optional so tests can build the page without a DOM element.
    private host?: ElementRef<HTMLElement>,
  ) {}

  ngOnInit(): void {
    this.subscriptions.add(this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((query) => {
    this.selectedSearchId = Number(query.get('search')) || null;
    this.highlightedApartmentId = Number(query.get('apartment')) || null;
    this.justSaved = query.get('saved') === '1';
    const tab = query.get('tab');
    if (tab === 'all' || tab === 'saved' || tab === 'new') this.tab = tab;
    else this.tab = 'new';
    if (!this.loading && !this.matchesLoading) this.revealHighlightedApartment();
    }));

    this.subscriptions.add(
      this.favorites.favoriteIds$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((ids) => {
        this.favoriteIds = ids;
        this.cdr.markForCheck();
      }),
    );
    this.load();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.loadSubscription?.unsubscribe();
    this.matchSubscription?.unsubscribe();
  }

  get firstName(): string {
    return (this.auth.currentUser?.fullName || '').trim().split(/\s+/)[0] || '';
  }

  // ---------- Loading ----------

  load(): void {
    this.matchesLoading = false;
    this.loadSubscription?.unsubscribe();
    this.matchSubscription?.unsubscribe();
    this.loading = true;
    this.errorMessage = '';
    this.loadSubscription = forkJoin({
      searches: this.client.getSearches(),
      records: this.client.getMatches(),
      catalogue: this.apartments.getApartments(),
      favorites: this.favorites.loadFavorites(true),
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ searches, records, catalogue }) => {
        this.catalogue = new Map(catalogue.map((apartment) => [apartment.id, apartment]));
        this.newRecords = records;
        this.searches = searches.map((search) => ({ search, matches: [], failed: false }));
        if (this.selectedSearchId && !searches.some((search) => search.id === this.selectedSearchId))
          this.selectedSearchId = null;
        this.loading = false;
        this.cdr.detectChanges();
        this.loadMatches();
      },
      error: () => {
        this.loading = false;
        this.errorMessage = 'We could not load Velven Discover right now. Please try again.';
        this.cdr.detectChanges();
      },
    });
  }

  /** Runs Velven Match for every saved search (the same results the client saw when searching). */
  private loadMatches(): void {
    if (!this.searches.length) return;
    this.matchesLoading = true;
    const views = [...this.searches];
    this.matchSubscription = forkJoin(
      views.map((view) =>
        this.homeMatch.findRankedMatches(view.search.profile).pipe(catchError(() => of(null))),
      ),
    ).pipe(takeUntilDestroyed(this.destroyRef)).subscribe((results) => {
      results.forEach((result, index) => {
        if (this.searches.includes(views[index])) this.applyResults(views[index], result);
      });
      this.matchesLoading = false;
      this.cdr.detectChanges();
      this.revealHighlightedApartment();
    });
  }

  private applyResults(view: SearchView, results: HomeMatchResult[] | null): void {
    if (!results) {
      view.failed = true;
      view.matches = [];
      return;
    }
    const profile = view.search.profile;
    const newIds = new Map(
      this.newRecords
        .filter((record) => record.savedSearchId === view.search.id)
        .map((record) => [record.apartmentId, record]),
    );
    view.failed = false;
    view.matches = results
      .map((result) => ({
        result,
        status: evaluateMandatoryRequirements(result.apartment, profile, this.currency.rates).status,
      }))
      // Every must-have met; homes that only need a detail confirmed are kept, marked as such.
      .filter(({ status }) => status !== 'alternative')
      .map(({ result, status }): DiscoverItem | null => {
        const apartment = this.catalogue.get(result.apartment.id) ?? (result.apartment as unknown as Apartment);
        if (!apartment) return null;
        const record = newIds.get(result.apartment.id);
        return {
          apartment,
          searchId: view.search.id,
          score: result.rankingScore ?? result.matchScore ?? 0,
          needsCheck: status === 'confirm',
          isNew: !!record && !record.seenAt,
          matchedAt: record?.matchedAt,
        };
      })
      .filter((item): item is DiscoverItem => !!item);
  }

  // ---------- Lists ----------

  get selectedViews(): SearchView[] {
    return this.selectedSearchId
      ? this.searches.filter((view) => view.search.id === this.selectedSearchId)
      : this.searches;
  }

  get hasFailedSearch(): boolean { return this.selectedViews.some(view => view.failed); }

  get selectedSearch(): SavedSearch | null {
    return this.searches.find((view) => view.search.id === this.selectedSearchId)?.search ?? null;
  }

  /** New matches: published after the search was saved and still meeting every must-have. */
  get newItems(): DiscoverItem[] {
    const items = this.selectedViews.flatMap((view) =>
      view.matches.filter((item) => this.isRecordedMatch(item)),
    );
    return this.sorted(this.unique(items), true);
  }

  get allItems(): DiscoverItem[] {
    return this.sorted(this.unique(this.selectedViews.flatMap((view) => view.matches)).filter((item) => this.passesRefine(item)));
  }

  get savedApartments(): Apartment[] {
    return [...this.favoriteIds]
      .map((id) => this.catalogue.get(id))
      .filter((apartment): apartment is Apartment => !!apartment);
  }

  get unseenCount(): number {
    return this.newItems.filter((item) => item.isNew).length;
  }

  get totalMatches(): number {
    return this.unique(this.searches.flatMap((view) => view.matches)).length;
  }

  matchCount(view: SearchView): number {
    return view.matches.length;
  }

  newCount(view: SearchView): number {
    return view.matches.filter((item) => item.isNew).length;
  }

  private isRecordedMatch(item: DiscoverItem): boolean {
    return this.newRecords.some(
      (record) => record.savedSearchId === item.searchId && record.apartmentId === item.apartment.id,
    );
  }

  /** The same home can match several searches: show it once (unseen wins). */
  private unique(items: DiscoverItem[]): DiscoverItem[] {
    const byId = new Map<number, DiscoverItem>();
    for (const item of items) {
      const current = byId.get(item.apartment.id);
      if (!current || (item.isNew && !current.isNew) || (item.isNew === current.isNew && item.score > current.score)) byId.set(item.apartment.id, item);
    }
    return [...byId.values()];
  }

  private passesRefine(item: DiscoverItem): boolean {
    const apartment = item.apartment;
    return (
      (!this.refine.parking || !!apartment.hasParking) &&
      (!this.refine.petFriendly || !!apartment.isPetFriendly) &&
      (!this.refine.furnished || !!apartment.isFurnished)
    );
  }

  private sorted(items: DiscoverItem[], newestFirst = false): DiscoverItem[] {
    const order = newestFirst && this.sort === 'best' ? 'newest' : this.sort;
    const time = (item: DiscoverItem) =>
      new Date(item.matchedAt || item.apartment.createdAt || 0).getTime();
    return [...items].sort((a, b) => {
      if (order === 'price-low') return a.apartment.price - b.apartment.price;
      if (order === 'price-high') return b.apartment.price - a.apartment.price;
      if (order === 'newest') return time(b) - time(a);
      return b.score - a.score;
    });
  }

  searchName(item: DiscoverItem): string {
    if (this.selectedSearchId || this.searches.length < 2) return '';
    return this.searches.find((view) => view.search.id === item.searchId)?.search.name ?? '';
  }

  trackItem = (_: number, item: DiscoverItem): number => item.apartment.id;
  trackApartment = (_: number, apartment: Apartment): number => apartment.id;
  trackSearch = (_: number, view: SearchView): number => view.search.id;

  // ---------- Selection and deep links ----------

  selectSearch(id: number | null): void {
    this.selectedSearchId = id;
    this.highlightedApartmentId = null;
    this.syncUrl();
  }

  setTab(tab: DiscoverTab): void {
    this.tab = tab;
    this.syncUrl();
  }

  /** Keeps the selection in the address, so a refresh or a shared link opens the same view. */
  private syncUrl(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      replaceUrl: true,
      queryParams: {
        search: this.selectedSearchId ?? null,
        tab: this.tab === 'new' ? null : this.tab,
        apartment: this.highlightedApartmentId ?? null,
        saved: null,
      },
    });
  }

  /** Alert deep link: open the tab that holds the home, scroll to it and mark it seen. */
  private revealHighlightedApartment(): void {
    const id = this.highlightedApartmentId;
    if (!id) return;
    const inNew = this.newItems.some((item) => item.apartment.id === id);
    const inAll = this.selectedViews.some((view) => view.matches.some((item) => item.apartment.id === id));
    if (!inNew && !inAll && this.selectedSearchId) {
      // Not in this search any more (e.g. its preferences changed): try every search.
      this.selectedSearchId = null;
    }
    this.tab = inNew ? 'new' : 'all';
    this.cdr.detectChanges();
    this.subscriptions.add(timer(120).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      document.getElementById(`match-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }));
    this.markSeen([id]);
  }

  /** Opening a home clears its "New match" badge. */
  onOpened(apartment: Apartment): void {
    this.markSeen([apartment.id]);
  }

  markAllSeen(): void {
    this.markSeen(this.newItems.filter((item) => item.isNew).map((item) => item.apartment.id));
  }

  private markSeen(ids: number[]): void {
    const unseen = ids.filter((id) => this.newItems.some((item) => item.apartment.id === id && item.isNew));
    if (!unseen.length) return;
    const previous = this.newRecords.map(record => ({ ...record }));
    const now = new Date().toISOString();
    for (const record of this.newRecords)
      if (unseen.includes(record.apartmentId) && !record.seenAt) record.seenAt = now;
    for (const view of this.searches)
      for (const item of view.matches) if (unseen.includes(item.apartment.id)) item.isNew = false;
    this.subscriptions.add(this.client.markMatchesSeen(unseen).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ error: () => {
      this.newRecords = previous;
      for (const view of this.searches) for (const item of view.matches)
        item.isNew = previous.some(r => r.savedSearchId === item.searchId && r.apartmentId === item.apartment.id && !r.seenAt);
      this.client.refreshSummary();
      this.failAction('Could not save viewed status. Please try again.');
    } }));
  }

  // ---------- Saved search actions ----------

  startRename(search: SavedSearch): void {
    this.renamingId = search.id;
    this.renameValue = search.name;
    this.confirmDeleteId = null;
    window.setTimeout(() => document.getElementById(`rename-${search.id}`)?.focus());
  }

  saveRename(search: SavedSearch): void {
    const name = this.renameValue.trim();
    if (!name || name === search.name) {
      this.renamingId = null;
      return;
    }
    this.busySearchId = search.id;
    this.client.updateSearch(search.id, { name }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (saved) => {
        search.name = saved.name;
        this.renamingId = null;
        this.busySearchId = null;
        this.cdr.detectChanges();
      },
      error: () => this.failAction('Could not rename the search. Please try again.'),
    });
  }

  toggleNotifications(search: SavedSearch): void {
    if (this.busySearchId) return;
    this.busySearchId = search.id;
    const enabled = !search.notificationsEnabled;
    search.notificationsEnabled = enabled;
    this.client.updateSearch(search.id, { notificationsEnabled: enabled }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { this.busySearchId = null; this.cdr.markForCheck(); },
      error: () => {
        search.notificationsEnabled = !enabled;
        this.failAction('Could not change alerts for this search. Please try again.');
      },
    });
  }

  deleteSearch(search: SavedSearch): void {
    this.busySearchId = search.id;
    this.client.deleteSearch(search.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.searches = this.searches.filter((view) => view.search.id !== search.id);
        this.newRecords = this.newRecords.filter((record) => record.savedSearchId !== search.id);
        if (this.selectedSearchId === search.id) this.selectSearch(null);
        this.confirmDeleteId = null;
        this.busySearchId = null;
        this.cdr.detectChanges();
      },
      error: () => this.failAction('Could not delete the search. Please try again.'),
    });
  }

  /** Opens Velven Match with this search's answers; finishing it updates the saved search. */
  editPreferences(search: SavedSearch): void {
    this.homeMatch.saveToSession(search.profile);
    void this.router.navigate(['/ai-home-match'], { queryParams: { editSearch: search.id } });
  }

  private failAction(message: string): void {
    this.busySearchId = null;
    this.actionError = message;
    this.cdr.detectChanges();
  }

  // ---------- Search card text ----------

  goalLabel(profile: HomeMatchProfile): string {
    return profile.propertyGoal === 'Buy' ? 'Buy' : 'Rent';
  }

  locationText(profile: HomeMatchProfile): string {
    if (profile.locationFlexible) return 'Flexible';
    if (profile.districts?.length) return answerList(profile.districts.filter((district) => district !== 'SelectOnMap'));
    return profile.selectedMapArea ? 'Selected map area' : 'Tbilisi';
  }

  budgetText(profile: HomeMatchProfile): string {
    const symbol = profile.currency === 'GEL' ? '₾' : profile.currency === 'EUR' ? '€' : '$';
    const min = Number(profile.budgetMin) || 0;
    const max = Number(profile.budgetMax) || 0;
    if (!max) return min ? `${symbol}${min.toLocaleString('en-US')}+` : 'Any';
    return `${symbol}${min.toLocaleString('en-US')} – ${symbol}${max.toLocaleString('en-US')}`;
  }

  bedroomsText(profile: HomeMatchProfile): string {
    return bedroomsLabel(profile);
  }

  /** Up to three of the most telling extra answers (pets, lifestyle, top priority). */
  preferenceChips(profile: HomeMatchProfile): string[] {
    const chips: string[] = [];
    const pets = profile.propertyGoal === 'Rent' ? selectedPets(profile) : [];
    if (pets.length) chips.push(answerList(pets));
    for (const lifestyle of profile.lifestyles || []) chips.push(answerLabel(lifestyle));
    for (const priority of profile.topPriorities || []) chips.push(answerLabel(priority));
    return [...new Set(chips)].slice(0, 3);
  }

  /** "5 minutes ago" / "2 days ago" in the page language. */
  relativeTime(value: string): string {
    return clientRelativeTime(value, this.translation.language$.value);
  }
}
