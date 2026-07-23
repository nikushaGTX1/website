import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription, forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Agent } from '../models/agent';
import { Apartment } from '../models/apartment';
import { BlogPost, CreateBlogPost } from '../models/blog-post';
import { User } from '../models/user';
import { AdminService } from '../services/admin.service';
import { ApartmentService } from '../services/apartment.service';
import { AuthService } from '../services/auth.service';
import { BlogService } from '../services/blog.service';
import { PendingApartment, PendingApartmentService } from '../services/pending-apartment.service';

@Component({
  selector: 'app-admin-panel',
  standalone: false,
  templateUrl: './admin-panel.html',
  styleUrl: './admin-panel.css',
})
export class AdminPanel implements OnInit, OnDestroy {
  users: User[] = [];
  agents: Agent[] = [];
  apartments: Apartment[] = [];
  blogPosts: BlogPost[] = [];
  pendingApartments: PendingApartment[] = [];
  userIds: string[] = [];

  activeTab: 'pending' | 'users' | 'agents' | 'apartments' | 'blog' = 'pending';

  blogForm: CreateBlogPost = {
    title: '',
    description: '',
    imageUrl: '',
  };

  loading = false;
  actionId = '';
  errorMessage = '';
  successMessage = '';
  adminSearch = '';
  agentRatings: Record<string, number> = {};
  pendingDebug = '';
  reviewedCount = 0;

  private subscriptions = new Subscription();

  constructor(
    private adminService: AdminService,
    private apartmentService: ApartmentService,
    private authService: AuthService,
    private blogService: BlogService,
    private pendingService: PendingApartmentService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.subscriptions.add(
      this.pendingService.pendingApartments$.subscribe((items) => {
        this.pendingApartments = items;
        this.pendingDebug = this.pendingService.getStorageDebug();
        this.updateReviewedCount();
        this.cdr.detectChanges();
      })
    );

    this.loadDashboard();
    this.loadBlogPosts();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  get currentUser(): User | null {
    return this.authService.currentUser;
  }

  get isAdmin(): boolean {
    return this.authService.isAdmin;
  }

  get waitingCount(): number {
    return this.pendingApartments.filter((item) => item.status === 'pending').length;
  }

  get filteredPendingApartments(): PendingApartment[] {
    const query = this.normalizedSearch;

    return this.pendingApartments
      .filter((item) =>
        this.matchesQuery(
          [
            item.apartment.title,
            item.apartment.description,
            item.apartment.address,
            item.submittedByName,
            item.submittedByEmail,
            item.status,
          ],
          query
        )
      )
      .sort((a, b) => this.statusRank(a.status) - this.statusRank(b.status));
  }

  get filteredUsers(): User[] {
    const query = this.normalizedSearch;

    return this.users.filter((user) =>
      this.matchesQuery([user.fullName, user.userName, user.email, user.id], query)
    );
  }

  get filteredAgents(): Agent[] {
    const query = this.normalizedSearch;

    return this.agents.filter((agent) =>
      this.matchesQuery(
        [agent.fullName, agent.userName, agent.email, agent.id, agent.userId],
        query
      )
    );
  }

  get filteredApartments(): Apartment[] {
    const query = this.normalizedSearch;

    return this.apartments.filter((apartment) =>
      this.matchesQuery(
        [apartment.title, apartment.description, apartment.address, String(apartment.price)],
        query
      )
    );
  }

  get filteredBlogPosts(): BlogPost[] {
    const query = this.normalizedSearch;

    return this.blogPosts.filter((post) =>
      this.matchesQuery([post.title, post.description, post.imageUrl], query)
    );
  }

  private get normalizedSearch(): string {
    return this.adminSearch.trim().toLowerCase();
  }

  loadDashboard(): void {
    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';
    this.cdr.detectChanges();

    this.pendingService.refresh();
    this.pendingDebug = this.pendingService.getStorageDebug();

    if (!this.isAdmin) {
      this.users = [];
      this.userIds = [];
      this.agents = [];
      this.apartments = [];
      this.activeTab = 'pending';
      this.loading = false;
      this.cdr.detectChanges();
      return;
    }

    forkJoin({
      users: this.adminService.getUsers().pipe(catchError(() => of([] as User[]))),
      userIds: this.adminService.getUserIds().pipe(catchError(() => of([] as string[]))),
      agents: this.adminService.getAgents().pipe(catchError(() => of([] as Agent[]))),
      apartments: this.apartmentService.getApartments().pipe(catchError(() => of([] as Apartment[]))),
    }).subscribe({
      next: (data) => {
        console.log('Admin dashboard loaded:', data);

        this.users = data.users;
        this.userIds = data.userIds;
        this.agents = data.agents;
        this.agentRatings = data.agents.reduce<Record<string, number>>((ratings, agent) => {
          const agentId = this.getAgentRatingId(agent);
          if (agentId) {
            ratings[agentId] = this.getAgentRating(agent) || 5;
          }

          return ratings;
        }, {});
        this.apartments = data.apartments;

        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Admin dashboard error:', err);

        this.loading = false;
        this.errorMessage = 'Could not load dashboard.';
        this.cdr.detectChanges();
      },
    });
  }

  loadBlogPosts(): void {
    this.blogService.getPosts().subscribe({
      next: (posts) => {
        console.log('Blog posts loaded:', posts);
        this.blogPosts = posts;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Blog API error:', err);

        this.blogPosts = [];

        if (this.activeTab === 'blog') {
          this.errorMessage = 'Could not load blog posts from the API.';
        }

        this.cdr.detectChanges();
      },
    });
  }

  approve(item: PendingApartment): void {
    if (this.actionId) return;

    if (!this.isAdmin) {
      this.errorMessage = 'Only admins can confirm apartment posts.';
      this.successMessage = '';
      this.cdr.detectChanges();
      return;
    }

    this.actionId = item.id;
    this.successMessage = '';
    this.errorMessage = '';
    this.cdr.detectChanges();

    this.apartmentService.createApartment(item.apartment).subscribe({
      next: () => {
        this.pendingService.markApproved(item.id, this.currentUser);
        this.successMessage = 'Apartment confirmed and published.';
        this.actionId = '';
        this.loadDashboard();
      },
      error: (err) => {
        console.error('Approve error:', err);
        this.errorMessage = 'Could not publish this apartment.';
        this.actionId = '';
        this.cdr.detectChanges();
      },
    });
  }

  decline(item: PendingApartment): void {
    this.pendingService.markDeclined(item.id, this.currentUser, 'Your post was declined.');
    this.successMessage = 'Apartment request declined.';
    this.errorMessage = '';
    this.cdr.detectChanges();
  }

  moveToPending(item: PendingApartment): void {
    this.pendingService.markPending(item.id);
    this.successMessage = 'Apartment request moved back to pending.';
    this.errorMessage = '';
    this.cdr.detectChanges();
  }

  clearSearch(): void {
    this.adminSearch = '';
    this.cdr.detectChanges();
  }

  makeAgent(user: User): void {
    if (!this.isAdmin) {
      this.errorMessage = 'Only admins can promote users to agents.';
      this.cdr.detectChanges();
      return;
    }

    const userId = user.id;
    if (!userId || this.actionId) return;

    this.actionId = userId;
    this.successMessage = '';
    this.errorMessage = '';
    this.cdr.detectChanges();

    this.adminService.makeAgent(userId).subscribe({
      next: () => {
        this.successMessage = 'User promoted to agent.';
        this.actionId = '';
        this.loadDashboard();
      },
      error: (err) => {
        console.error('Make agent error:', err);
        this.errorMessage = 'Could not promote this user.';
        this.actionId = '';
        this.cdr.detectChanges();
      },
    });
  }

  removeAgent(agent: Agent): void {
    if (!this.isAdmin) {
      this.errorMessage = 'Only admins can remove agents.';
      this.cdr.detectChanges();
      return;
    }

    const userId = agent.userId || agent.id;
    if (!userId || this.actionId) return;

    this.actionId = userId;
    this.successMessage = '';
    this.errorMessage = '';
    this.cdr.detectChanges();

    this.adminService.removeAgent(userId).subscribe({
      next: () => {
        this.successMessage = 'Agent access removed.';
        this.actionId = '';
        this.loadDashboard();
      },
      error: (err) => {
        console.error('Remove agent error:', err);
        this.errorMessage = 'Could not remove this agent.';
        this.actionId = '';
        this.cdr.detectChanges();
      },
    });
  }

  getAgentRating(agent: Agent): number {
    return agent.averageRating ?? agent.rating ?? 0;
  }

  getAgentRatingCount(agent: Agent): number {
    return agent.ratingCount ?? 0;
  }

  getDraftRating(agent: Agent): number {
    const agentId = this.getAgentRatingId(agent);
    if (!agentId) return 5;

    const rating = this.agentRatings[agentId] ?? this.getAgentRating(agent);
    return rating > 0 ? rating : 5;
  }

  setDraftRating(agent: Agent, value: string | number): void {
    const agentId = this.getAgentRatingId(agent);
    if (!agentId) return;

    this.agentRatings[agentId] = Number(value);
  }

  setAgentRating(agent: Agent): void {
    if (!this.isAdmin) {
      this.errorMessage = 'Only admins can set agent ratings.';
      this.successMessage = '';
      this.cdr.detectChanges();
      return;
    }

    const agentId = this.getAgentRatingId(agent);
    const rating = this.clampRating(this.getDraftRating(agent));

    if (!agentId || this.actionId) return;

    this.agentRatings[agentId] = rating;
    this.actionId = `rating:${agentId}`;
    this.successMessage = '';
    this.errorMessage = '';
    this.cdr.detectChanges();

    this.adminService.rateAgent(agentId, rating).subscribe({
      next: () => {
        this.successMessage = 'Agent rating updated.';
        this.actionId = '';
        this.loadDashboard();
      },
      error: (err) => {
        console.error('Set agent rating error:', err);
        this.errorMessage = 'Could not update this agent rating.';
        this.actionId = '';
        this.cdr.detectChanges();
      },
    });
  }

  deleteApartment(apartment: Apartment): void {
    if (!this.isAdmin) {
      this.errorMessage = 'Only admins can delete apartments.';
      this.cdr.detectChanges();
      return;
    }

    if (this.actionId) return;

    this.actionId = String(apartment.id);
    this.successMessage = '';
    this.errorMessage = '';
    this.cdr.detectChanges();

    this.apartmentService.deleteApartment(apartment.id).subscribe({
      next: () => {
        this.successMessage = 'Apartment deleted.';
        this.actionId = '';
        this.loadDashboard();
      },
      error: (err) => {
        console.error('Delete apartment error:', err);
        this.errorMessage = 'Could not delete this apartment.';
        this.actionId = '';
        this.cdr.detectChanges();
      },
    });
  }

  createBlogPost(): void {
    if (!this.isAdmin) {
      this.errorMessage = 'Only admins can post blog articles.';
      this.cdr.detectChanges();
      return;
    }

    this.successMessage = '';
    this.errorMessage = '';

    if (!this.blogForm.title.trim() || !this.blogForm.description.trim()) {
      this.errorMessage = 'Blog title and description are required.';
      this.cdr.detectChanges();
      return;
    }

    this.blogService
      .createPost({
        title: this.blogForm.title.trim(),
        description: this.blogForm.description.trim(),
        imageUrl: this.blogForm.imageUrl.trim(),
      })
      .subscribe({
        next: () => {
          this.blogForm = {
            title: '',
            description: '',
            imageUrl: '',
          };

          this.successMessage = 'Blog post published.';
          this.loadBlogPosts();
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error('Create blog error:', err);
          this.errorMessage = 'Could not publish blog post.';
          this.cdr.detectChanges();
        },
      });
  }

  deleteBlogPost(post: BlogPost): void {
    if (!this.isAdmin) {
      this.errorMessage = 'Only admins can delete blog posts.';
      this.cdr.detectChanges();
      return;
    }

    this.blogService.deletePost(post.id).subscribe({
      next: () => {
        this.successMessage = 'Blog post deleted.';
        this.loadBlogPosts();
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Delete blog error:', err);
        this.errorMessage = 'Could not delete blog post.';
        this.cdr.detectChanges();
      },
    });
  }

  identifyUser(_: number, user: User): string {
    return user.id || user.email || '';
  }

  identifyAgent(_: number, agent: Agent): string {
    return agent.id || agent.userId || agent.email || agent.fullName || '';
  }

  identifyApartment(_: number, apartment: Apartment): number {
    return apartment.id;
  }

  identifyPending(_: number, item: PendingApartment): string {
    return item.id;
  }

  identifyBlogPost(_: number, post: BlogPost): string {
    return String(post.id);
  }

  private matchesQuery(values: Array<string | number | undefined | null>, query: string): boolean {
    if (!query) return true;

    return values
      .filter((value): value is string | number => value !== undefined && value !== null)
      .some((value) => String(value).toLowerCase().includes(query));
  }

  private getAgentRatingId(agent: Agent): string {
    return agent.id || agent.userId || '';
  }

  private clampRating(value: number): number {
    if (!Number.isFinite(value)) return 5;
    return Math.min(5, Math.max(1, Math.round(value * 10) / 10));
  }

  private updateReviewedCount(): void {
    this.reviewedCount = this.pendingApartments.length - this.waitingCount;
  }

  private statusRank(status: PendingApartment['status']): number {
    switch (status) {
      case 'pending':
        return 0;
      case 'declined':
        return 1;
      case 'approved':
        return 2;
      default:
        return 3;
    }
  }
}
