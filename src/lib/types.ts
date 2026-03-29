// ── Entity Types ──

export interface User {
  id: number;
  username: string;
  password_hash: string;
  role: 'admin' | 'editor' | 'viewer';
  created_at: string; // ISO 8601
  updated_at: string;
}

export interface Tenant {
  id: string; // slug, e.g. "acme-corp"
  name: string;
  description: string | null;
  logo_path: string | null;
  created_at: string;
  updated_at: string;
}

export type PlatformType = 'youtube' | 'instagram' | 'facebook';

export interface Platform {
  id: number;
  tenant_id: string;
  type: PlatformType;
  credentials: string; // AES-256-GCM encrypted JSON
  config: string | null; // plain JSON
  token_expires_at: string | null;
  enabled: boolean;
}

export type PostStatus = 'draft' | 'scheduled' | 'approved' | 'publishing' | 'published' | 'failed';

export interface Post {
  id: number;
  tenant_id: string;
  status: PostStatus;
  caption: string | null;
  hashtags: string; // JSON array
  media_paths: string; // JSON array
  platforms: string; // JSON array of platform type strings
  scheduled_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
}

export type PublishStatus = 'pending' | 'success' | 'failed';

export interface PublishResult {
  id: number;
  post_id: number;
  platform: PlatformType;
  status: PublishStatus;
  external_id: string | null;
  external_url: string | null;
  error: string | null;
  published_at: string | null;
}

// ── Parsed convenience types (JSON fields decoded) ──

export interface PostParsed extends Omit<Post, 'hashtags' | 'media_paths' | 'platforms'> {
  hashtags: string[];
  media_paths: string[];
  platforms: PlatformType[];
}

export interface PlatformCredentials {
  access_token?: string;
  refresh_token?: string;
  client_id?: string;
  client_secret?: string;
  [key: string]: unknown;
}
