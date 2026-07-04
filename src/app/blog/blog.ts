import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';


interface BlogPost {
  id?: string | number;
  slug?: string;
  title: string;
  description: string;
  imageUrl: string;
}

@Component({
  selector: 'app-blog',
  standalone: false,
  templateUrl: './blog.html',
  styleUrl: './blog.css',
})
export class Blog {
blogPosts: BlogPost[] = [];

  constructor() {}

  ngOnInit(): void {
    // Your API fetching logic goes here, e.g.:
    // this.blogService.getPosts().subscribe(data => this.blogPosts = data);
  }
}