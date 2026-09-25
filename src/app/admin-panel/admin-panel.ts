import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription, firstValueFrom, forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Agent } from '../models/agent';
import { Apartment } from '../models/apartment';
import { BlogPost, CreateBlogPost } from '../models/blog-post';
import { User } from '../models/user';
import { AdminService } from '../services/admin.service';
import { ApartmentService, PendingApartmentEntry } from '../services/apartment.service';
import { AuthService } from '../services/auth.service';
import { BlogService } from '../services/blog.service';
import { CrmVacancyPosition } from '../models/crm';
import { CrmService } from '../services/crm.service';
import { toMediaUrl, tryNextProfileImageUrl } from '../utils/api-media';

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
  pendingApartments: PendingApartmentEntry[] = [];
  vacancyPositions: CrmVacancyPosition[] = [];
  newVacancyPosition = '';
  userIds: string[] = [];

  activeTab: 'pending' | 'users' | 'agents' | 'apartments' | 'blog' | 'streets' | 'vacancies' = 'pending';

  blogForm: CreateBlogPost = {
    title: '',
    description: '',
  };

  loading = false;
  actionId = '';
  errorMessage = '';
  successMessage = '';
  publishingBlog = false;
  blogImageName = '';
  blogImagePreview = '';
  blogImageFile: File | null = null;
  adminSearch = '';
  agentRatings: Record<string, number> = {};
  pendingDebug = '';
  reviewedCount = 0;
  editingUser: User | null = null;
  editUserForm = { fullName: '', userName: '', email: '', phoneNumber: '', bio: '' };
  editUserPassword = '';
  editUserPicture: File | null = null;
  editUserPicturePreview = '';
  savingUser = false;
  resettingPassword = false;
  deletingUser = false;

  private subscriptions = new Subscription();

  constructor(
    private adminService: AdminService,
    private apartmentService: ApartmentService,
    private authService: AuthService,
    private blogService: BlogService,
    private crmService: CrmService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadDashboard();
    this.loadBlogPosts();
  }

  ngOnDestroy(): void {
    this.releaseBlogImagePreview();
    this.releaseUserPicturePreview();
    this.subscriptions.unsubscribe();
  }

  get currentUser(): User | null {
    return this.authService.currentUser;
  }

  get isAdmin(): boolean {
    return this.authService.isAdmin;
  }

  get isManager(): boolean {
    return this.authService.isCrmManager;
  }

  get canOperateDashboard(): boolean {
    return this.isAdmin || this.isManager;
  }

  get canManageBlog(): boolean {
    return this.canOperateDashboard || this.authService.isAgent;
  }

  get waitingCount(): number {
    return this.pendingApartments.filter((item) => item.status === 'pending').length;
  }

  get filteredPendingApartments(): PendingApartmentEntry[] {
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
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
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

  get filteredVacancyPositions(): CrmVacancyPosition[] {
    const query = this.normalizedSearch;
    return this.vacancyPositions.filter((position) =>
      !query || position.title.toLowerCase().includes(query),
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

    this.loadPendingApartments();

    if (!this.canOperateDashboard) {
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
      users: this.isAdmin
        ? this.adminService.getUsers().pipe(catchError(() => of([] as User[])))
        : of([] as User[]),
      userIds: this.isAdmin
        ? this.adminService.getUserIds().pipe(catchError(() => of([] as string[])))
        : of([] as string[]),
      agents: this.adminService.getAgents().pipe(catchError(() => of([] as Agent[]))),
      apartments: this.apartmentService.getApartments().pipe(catchError(() => of([] as Apartment[]))),
      vacancyPositions: this.isAdmin
        ? this.crmService.getVacancyPositions(true).pipe(catchError(() => of([] as CrmVacancyPosition[])))
        : of([] as CrmVacancyPosition[]),
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
        this.vacancyPositions = data.vacancyPositions;

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

  addVacancyPosition(): void {
    const title = this.newVacancyPosition.trim();
    if (!this.isAdmin || !title || this.actionId) return;
    this.actionId = 'vacancy:new';
    this.crmService.createVacancyPosition(title).subscribe({
      next: (position) => {
        this.vacancyPositions = [...this.vacancyPositions, position]
          .sort((a, b) => a.title.localeCompare(b.title));
        this.newVacancyPosition = '';
        this.actionId = '';
        this.successMessage = `${position.title} was added to the careers form.`;
        this.cdr.detectChanges();
      },
      error: () => {
        this.actionId = '';
        this.errorMessage = 'Could not add this vacancy position.';
        this.cdr.detectChanges();
      },
    });
  }

  deleteVacancyPosition(position: CrmVacancyPosition): void {
    if (!this.isAdmin || this.actionId || !window.confirm(`Delete the “${position.title}” position?`)) return;
    this.actionId = `vacancy:${position.id}`;
    this.crmService.deleteVacancyPosition(position.id).subscribe({
      next: () => {
        this.vacancyPositions = this.vacancyPositions.filter((item) => item.id !== position.id);
        this.actionId = '';
        this.successMessage = `${position.title} was removed from the careers form.`;
        this.cdr.detectChanges();
      },
      error: () => {
        this.actionId = '';
        this.errorMessage = 'Could not delete this vacancy position.';
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

  loadPendingApartments(): void {
    if (!this.canOperateDashboard) {
      this.pendingApartments = [];
      return;
    }

    this.apartmentService.getPendingApartments().subscribe({
      next: (items) => {
        this.pendingApartments = items;
        this.pendingDebug = `${items.length} pending / ${items.length} total approval request(s).`;
        this.updateReviewedCount();
        this.cdr.detectChanges();
      },
      error: () => {
        this.pendingApartments = [];
        this.pendingDebug = '';
        this.cdr.detectChanges();
      },
    });
  }

  approve(item: PendingApartmentEntry): void {
    if (this.actionId) return;

    if (!this.canOperateDashboard) {
      this.errorMessage = 'Only managers and admins can confirm apartment posts.';
      this.successMessage = '';
      this.cdr.detectChanges();
      return;
    }

    this.actionId = String(item.id);
    this.successMessage = '';
    this.errorMessage = '';
    this.cdr.detectChanges();

    this.apartmentService.approveApartment(item.id).subscribe({
      next: () => {
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

  decline(item: PendingApartmentEntry): void {
    if (this.actionId) return;

    if (!this.canOperateDashboard) {
      this.errorMessage = 'Only managers and admins can decline apartment posts.';
      this.cdr.detectChanges();
      return;
    }

    this.actionId = String(item.id);
    this.cdr.detectChanges();

    this.apartmentService.deleteApartment(item.id).subscribe({
      next: () => {
        this.successMessage = 'Apartment request declined.';
        this.errorMessage = '';
        this.actionId = '';
        this.loadPendingApartments();
        this.cdr.detectChanges();
      },
      error: () => {
        this.errorMessage = 'Could not decline this apartment.';
        this.actionId = '';
        this.cdr.detectChanges();
      },
    });
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

  setCrmRole(user: User, role: string): void {
    if (!this.isAdmin || !user.id || this.actionId) return;

    this.actionId = user.id;
    this.successMessage = '';
    this.errorMessage = '';
    this.adminService.setCrmRole(user.id, role).subscribe({
      next: () => {
        this.successMessage = `${user.fullName || user.userName} is now a CRM ${role}.`;
        this.actionId = '';
        this.loadDashboard();
      },
      error: (err) => {
        console.error('Set CRM role error:', err);
        this.errorMessage = err?.error?.message || 'Could not change the CRM role.';
        this.actionId = '';
        this.cdr.detectChanges();
      },
    });
  }

  crmRole(user: User): string {
    const roles = [user.role, user.crmRole, ...(user.roles || [])]
      .filter((role): role is string => !!role);
    return ['Manager', 'Agent', 'Uploader']
      .find((expected) => roles.some((role) => role.toLowerCase() === expected.toLowerCase())) || '';
  }

  openUserEditor(user: User): void {
    if (!this.isAdmin || !user.id) return;

    this.releaseUserPicturePreview();
    this.editingUser = user;
    this.editUserForm = {
      fullName: user.fullName || '',
      userName: user.userName || '',
      email: user.email || '',
      phoneNumber: user.phoneNumber || '',
      bio: user.bio || '',
    };
    this.editUserPassword = '';
    this.editUserPicture = null;
    this.errorMessage = '';
    this.successMessage = '';
  }

  closeUserEditor(): void {
    if (this.savingUser || this.resettingPassword || this.deletingUser) return;
    this.releaseUserPicturePreview();
    this.editingUser = null;
    this.editUserPicture = null;
    this.editUserPassword = '';
  }

  onAdminUserPictureSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] || null;
    this.releaseUserPicturePreview();
    this.editUserPicture = file;
    if (file) this.editUserPicturePreview = URL.createObjectURL(file);
  }

  saveUserChanges(): void {
    const userId = this.editingUser?.id;
    if (!this.isAdmin || !userId || this.savingUser) return;

    if (!this.editUserForm.fullName.trim() ||
        !this.editUserForm.userName.trim() ||
        !this.editUserForm.email.trim()) {
      this.errorMessage = 'Full name, username, and email are required.';
      return;
    }

    this.savingUser = true;
    this.errorMessage = '';
    this.successMessage = '';
    this.adminService.updateUser(userId, {
      ...this.editUserForm,
      fullName: this.editUserForm.fullName.trim(),
      userName: this.editUserForm.userName.trim(),
      email: this.editUserForm.email.trim(),
      phoneNumber: this.editUserForm.phoneNumber.trim(),
      bio: this.editUserForm.bio.trim(),
      profilePicture: this.editUserPicture,
    }).subscribe({
      next: () => {
        this.savingUser = false;
        this.successMessage = 'User account updated.';
        this.closeUserEditor();
        this.loadDashboard();
      },
      error: (error) => {
        console.error('Update user error:', error);
        this.savingUser = false;
        this.errorMessage = error?.error?.message || 'Could not update this user.';
        this.cdr.detectChanges();
      },
    });
  }

  resetUserPassword(): void {
    const userId = this.editingUser?.id;
    if (!this.isAdmin || !userId || this.resettingPassword) return;

    if (this.editUserPassword.length < 8) {
      this.errorMessage = 'The new password must be at least 8 characters.';
      return;
    }

    this.resettingPassword = true;
    this.errorMessage = '';
    this.adminService.resetUserPassword(userId, this.editUserPassword).subscribe({
      next: () => {
        this.resettingPassword = false;
        this.editUserPassword = '';
        this.successMessage = 'User password reset successfully.';
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Reset password error:', error);
        this.resettingPassword = false;
        this.errorMessage = error?.error?.message || 'Could not reset this password.';
        this.cdr.detectChanges();
      },
    });
  }

  async deleteUserAccount(): Promise<void> {
    const user = this.editingUser;
    if (!this.isAdmin || !user?.id || this.deletingUser) return;

    const { default: Swal } = await import('sweetalert2');
    const displayName = user.fullName || user.userName || user.email || 'this user';
    const result = await Swal.fire({
      title: 'Delete user account?',
      text: `${displayName} will permanently lose access to Velven. This cannot be undone.`,
      icon: 'warning',
      iconColor: '#a03c47',
      showCancelButton: true,
      reverseButtons: true,
      focusCancel: true,
      confirmButtonText: 'Delete user permanently',
      cancelButtonText: 'Cancel',
      showLoaderOnConfirm: true,
      buttonsStyling: false,
      heightAuto: false,
      customClass: {
        popup: 'velven-alert',
        title: 'velven-alert__title',
        htmlContainer: 'velven-alert__copy',
        actions: 'velven-alert__actions',
        confirmButton: 'velven-alert__confirm',
        cancelButton: 'velven-alert__cancel',
      },
      allowOutsideClick: () => !Swal.isLoading(),
      allowEscapeKey: () => !Swal.isLoading(),
      preConfirm: async () => {
        this.deletingUser = true;
        try {
          await firstValueFrom(this.adminService.deleteUser(user.id!));
          return true;
        } catch (error: any) {
          Swal.showValidationMessage(
            error?.error?.message || 'Could not delete this user account.',
          );
          return false;
        } finally {
          this.deletingUser = false;
        }
      },
    });

    if (!result.isConfirmed) return;
    this.closeUserEditor();
    this.successMessage = `${displayName}'s account was deleted.`;
    this.loadDashboard();
  }

  get adminUserPicture(): string {
    return this.editUserPicturePreview ||
      toMediaUrl(this.editingUser?.profilePictureUrl || this.editingUser?.profilePicture);
  }

  fixAdminUserPicture(event: Event): void {
    tryNextProfileImageUrl(event);
  }

  private releaseUserPicturePreview(): void {
    if (this.editUserPicturePreview) URL.revokeObjectURL(this.editUserPicturePreview);
    this.editUserPicturePreview = '';
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
    if (!this.canOperateDashboard) {
      this.errorMessage = 'Only managers and admins can set agent ratings.';
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
    if (!this.canOperateDashboard) {
      this.errorMessage = 'Only managers and admins can delete apartments.';
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
    if (!this.canManageBlog) {
      this.errorMessage = 'Only agents and admins can post blog articles.';
      this.cdr.detectChanges();
      return;
    }

    if (this.publishingBlog) return;

    this.successMessage = '';
    this.errorMessage = '';

    if (!this.blogForm.title.trim() || !this.blogForm.description.trim()) {
      this.errorMessage = 'Blog title and description are required.';
      this.cdr.detectChanges();
      return;
    }

    this.publishingBlog = true;
    this.blogService
      .createPost({
        title: this.blogForm.title.trim(),
        description: this.blogForm.description.trim(),
        imageFile: this.blogImageFile,
      })
      .subscribe({
        next: () => {
          this.blogForm = {
            title: '',
            description: '',
          };
          this.clearBlogImage();
          this.publishingBlog = false;

          this.successMessage = 'Blog post published.';
          this.loadBlogPosts();
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error('Create blog error:', err);
          this.publishingBlog = false;
          this.errorMessage =
            err?.error?.message ||
            err?.error?.title ||
            `Could not publish blog post (HTTP ${err?.status || 'network error'}).`;
          this.cdr.detectChanges();
        },
      });
  }

  async onBlogImageSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    this.errorMessage = '';

    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.errorMessage = 'Please select a valid image file.';
      input.value = '';
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      this.errorMessage = 'Blog images must be smaller than 10 MB.';
      input.value = '';
      return;
    }

    try {
      const optimizedImage = await this.optimizeBlogImage(file);
      this.releaseBlogImagePreview();
      this.blogImageFile = optimizedImage;
      this.blogImagePreview = URL.createObjectURL(optimizedImage);
      this.blogImageName = file.name;
      this.cdr.detectChanges();
    } catch {
      this.errorMessage = 'The selected image could not be processed.';
      this.blogImageName = '';
      input.value = '';
      this.cdr.detectChanges();
    }
  }

  clearBlogImage(input?: HTMLInputElement): void {
    this.releaseBlogImagePreview();
    this.blogImageFile = null;
    this.blogImagePreview = '';
    this.blogImageName = '';
    if (input) input.value = '';
  }

  private optimizeBlogImage(file: File): Promise<File> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onerror = () => reject(new Error('Could not read image.'));
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error('Could not load image.'));
        image.onload = () => {
          const maxWidth = 1600;
          const scale = Math.min(1, maxWidth / image.width);
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');

          if (!context) {
            reject(new Error('Canvas is unavailable.'));
            return;
          }

          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Could not optimize image.'));
                return;
              }

              const baseName = file.name.replace(/\.[^.]+$/, '') || 'blog-cover';
              resolve(
                new File([blob], `${baseName}.jpg`, {
                  type: 'image/jpeg',
                  lastModified: file.lastModified,
                }),
              );
            },
            'image/jpeg',
            0.82,
          );
        };
        image.src = String(reader.result || '');
      };
      reader.readAsDataURL(file);
    });
  }

  private releaseBlogImagePreview(): void {
    if (this.blogImagePreview.startsWith('blob:')) {
      URL.revokeObjectURL(this.blogImagePreview);
    }
  }

  deleteBlogPost(post: BlogPost): void {
    if (!this.canManageBlog) {
      this.errorMessage = 'Only agents and admins can delete blog posts.';
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

  identifyPending(_: number, item: PendingApartmentEntry): number {
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
}
