import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { BlogPost } from '../models/blog-post';
import { BlogService } from '../services/blog.service';

@Component({
  selector: 'app-blog',
  standalone: false,
  templateUrl: './blog.html',
  styleUrl: './blog.css',
})
export class Blog implements OnInit, OnDestroy {
  blogPosts: BlogPost[] = [];
  loading = false;
  errorMessage = '';
  currentPage = 1;
  readonly pageSize = 4;

  private subscription?: Subscription;

  constructor(private blogService: BlogService) {}

  ngOnInit(): void {
    this.loading = true;
    this.subscription = this.blogService.getPosts().subscribe({
      next: (posts) => {
        this.blogPosts = posts;
        this.currentPage = 1;
        this.loading = false;
      },
      error: () => {
        this.blogPosts = [];
        this.errorMessage = 'Could not load blog posts right now.';
        this.loading = false;
      },
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.blogPosts.length / this.pageSize));
  }

  get pageNumbers(): number[] {
    return Array.from({ length: this.totalPages }, (_, index) => index + 1);
  }

  get pagedPosts(): BlogPost[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.blogPosts.slice(start, start + this.pageSize);
  }

  setPage(page: number): void {
    this.currentPage = Math.min(Math.max(page, 1), this.totalPages);
  }
}
