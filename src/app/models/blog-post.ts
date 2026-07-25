export interface BlogPost {
  id: string | number;
  title: string;
  description: string;
  imageUrl: string;
  summary?: string;
  content?: string;
  createdAt?: string;
}

export interface CreateBlogPost {
  title: string;
  description: string;
  imageFile?: File | null;
}
