import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { BlogPost, CreateBlogPost } from '../models/blog-post';
import { API_URL } from '../utils/api-config';

@Injectable({
  providedIn: 'root',
})
export class BlogService {
  private readonly apiUrl = `${API_URL}/Blog`;

  constructor(private http: HttpClient) {}

  getPosts(): Observable<BlogPost[]> {
    return this.http.get<BlogPost[]>(this.apiUrl).pipe(
      map((posts) => posts.map((post) => this.normalizePost(post))),
    );
  }

  getPost(id: string | number): Observable<BlogPost> {
    return this.http
      .get<BlogPost>(`${this.apiUrl}/${id}`)
      .pipe(map((post) => this.normalizePost(post)));
  }

  createPost(data: CreateBlogPost): Observable<BlogPost> {
    return this.http
      .post<BlogPost>(this.apiUrl, this.toFormData(data))
      .pipe(map((post) => this.normalizePost(post)));
  }

  updatePost(id: string | number, data: CreateBlogPost): Observable<BlogPost> {
    return this.http
      .put<BlogPost>(`${this.apiUrl}/${id}`, this.toFormData(data))
      .pipe(map((post) => this.normalizePost(post)));
  }

  deletePost(id: string | number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  private toFormData(data: CreateBlogPost): FormData {
    const formData = new FormData();
    formData.append('Title', data.title);
    formData.append('Summary', data.description);
    formData.append('Content', data.description);

    if (data.imageFile) {
      formData.append('Image', data.imageFile, data.imageFile.name);
    }

    return formData;
  }

  private normalizePost(post: BlogPost): BlogPost {
    return {
      ...post,
      description: post.description || post.summary || post.content || '',
      imageUrl: post.imageUrl || '',
    };
  }
}
