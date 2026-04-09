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

export type PostStatus = 'draft' | 'pending_approval' | 'scheduled' | 'approved' | 'publishing' | 'published' | 'failed';

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

// ── Pipeline Types ──

export type PipelineType = 'reel' | 'short' | 'social_image' | 'custom';

export type PipelineRunStatus = 'pending' | 'generating' | 'preview' | 'approved' | 'publishing' | 'published' | 'failed';

export interface StepConfig {
  type: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

export interface TtsConfig {
  voice?: string;
  speed?: number;
  language?: string;
  provider?: string;
  [key: string]: unknown;
}

export interface ImagenConfig {
  model?: string;
  style?: string;
  aspect_ratio?: string;
  resolution?: string;
  [key: string]: unknown;
}

export interface VideoConfig {
  fps?: number;
  resolution?: string;
  codec?: string;
  transition?: string;
  duration?: number;
  safe_zones?: VideoSafeZonesConfig;
  [key: string]: unknown;
}

export type VideoOverlayAnchor =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export interface VideoSafeZoneBounds {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface VideoOverlayPositionConfig {
  anchor: VideoOverlayAnchor;
  offset_x?: number;
  offset_y?: number;
}

export interface VideoPlatformSafeZoneConfig {
  safe_zone: VideoSafeZoneBounds;
  overlays: {
    logo: VideoOverlayPositionConfig;
    watermark: VideoOverlayPositionConfig;
  };
}

export type VideoSafeZonesConfig = Partial<Record<PlatformType, VideoPlatformSafeZoneConfig>>;

export const DEFAULT_VIDEO_SAFE_ZONES: Record<PlatformType, VideoPlatformSafeZoneConfig> = {
  instagram: {
    safe_zone: { top: 220, bottom: 260, left: 72, right: 72 },
    overlays: {
      logo: { anchor: 'top-right', offset_x: 24, offset_y: 20 },
      watermark: { anchor: 'bottom-center', offset_x: 0, offset_y: 28 },
    },
  },
  youtube: {
    safe_zone: { top: 180, bottom: 240, left: 64, right: 64 },
    overlays: {
      logo: { anchor: 'top-right', offset_x: 20, offset_y: 16 },
      watermark: { anchor: 'bottom-center', offset_x: 0, offset_y: 24 },
    },
  },
  facebook: {
    safe_zone: { top: 200, bottom: 250, left: 68, right: 68 },
    overlays: {
      logo: { anchor: 'top-right', offset_x: 20, offset_y: 20 },
      watermark: { anchor: 'bottom-center', offset_x: 0, offset_y: 24 },
    },
  },
};

export interface PipelineTemplate {
  id: number;
  tenant_id: string;
  name: string;
  description: string | null;
  type: PipelineType;
  platforms: string;     // JSON array
  steps: string;         // JSON array of StepConfig
  branding: string;      // JSON object
  tts_config: string | null;    // JSON
  imagen_config: string | null; // JSON
  video_config: string | null;  // JSON
  created_at: string;
  updated_at: string;
}

export interface PipelineTemplateParsed extends Omit<PipelineTemplate, 'platforms' | 'steps' | 'branding' | 'tts_config' | 'imagen_config' | 'video_config'> {
  platforms: PlatformType[];
  steps: StepConfig[];
  branding: Record<string, unknown>;
  tts_config: TtsConfig | null;
  imagen_config: ImagenConfig | null;
  video_config: VideoConfig | null;
}

export interface PipelineRun {
  id: number;
  template_id: number;
  post_id: number | null;
  status: PipelineRunStatus;
  input_params: string;     // JSON
  step_results: string | null; // JSON
  output_paths: string | null; // JSON
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface PipelineRunParsed extends Omit<PipelineRun, 'input_params' | 'step_results' | 'output_paths'> {
  input_params: Record<string, unknown>;
  step_results: Record<string, unknown>[] | null;
  output_paths: string[] | null;
}

export interface TenantBranding {
  id: number;
  tenant_id: string;
  logo_path: string | null;
  colors: string;       // JSON
  fonts: string;        // JSON
  intro_frame: string | null;
  outro_frame: string | null;
  watermark: string | null;
  bgm_path: string | null;
  backgrounds: string;  // JSON
  created_at: string;
  updated_at: string;
}
