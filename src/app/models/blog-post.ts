export interface BlogPost {
  id: string | number;
  title: string;
  description: string;
  imageUrl: string;
  createdAt?: string;
}

export interface CreateBlogPost {
  title: string;
  description: string;
  imageUrl: string;
}
