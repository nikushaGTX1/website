import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { BlogPost, CreateBlogPost } from '../models/blog-post';

@Injectable({
  providedIn: 'root',
})
export class BlogService {
  private readonly apiUrl = 'https://localhost:7111/api/Blog';

  constructor(private http: HttpClient) {}

  getPosts(): Observable<BlogPost[]> {
    return this.http.get<BlogPost[]>(this.apiUrl);
  }

  getPost(id: string | number): Observable<BlogPost> {
    return this.http.get<BlogPost>(`${this.apiUrl}/${id}`);
  }

  createPost(data: CreateBlogPost): Observable<BlogPost> {
    return this.http.post<BlogPost>(this.apiUrl, data);
  }

  updatePost(id: string | number, data: CreateBlogPost): Observable<BlogPost> {
    return this.http.put<BlogPost>(`${this.apiUrl}/${id}`, data);
  }

  deletePost(id: string | number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}
