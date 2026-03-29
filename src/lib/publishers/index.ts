import { publishToYouTube, type YouTubeCredentials } from './youtube';
import {
  publishPhotoToInstagram,
  publishReelToInstagram,
  type InstagramCredentials,
} from './instagram';
import {
  publishPhotoToFacebook,
  publishVideoToFacebook,
  type FacebookCredentials,
} from './facebook';
import type { PlatformType, PostParsed } from '../types';

// ── Types ──

export interface PublishResult {
  platform: string;
  success: boolean;
  external_id?: string;
  external_url?: string;
  error?: string;
}

export interface PlatformConfig {
  platform: PlatformType;
  credentials: YouTubeCredentials | InstagramCredentials | FacebookCredentials;
  /** YouTube-specific: privacy setting */
  privacy?: 'public' | 'private' | 'unlisted';
  /**
   * For Instagram: the base URL where media files are served publicly.
   * The media path will be appended to form the full URL.
   * e.g. "https://example.com/media" → "https://example.com/media/uploads/photo.jpg"
   */
  media_base_url?: string;
}

// ── Helpers ──

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v', '.3gp']);

function getMediaType(path: string): 'image' | 'video' | 'unknown' {
  const ext = path.toLowerCase().replace(/^.*(\.[^.]+)$/, '$1');
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  return 'unknown';
}

// ── Orchestrator ──

async function publishToPlatform(
  platform: PlatformType,
  credentials: PlatformConfig['credentials'],
  mediaPaths: string[],
  caption: string,
  tags: string[],
  options: { privacy?: 'public' | 'private' | 'unlisted'; media_base_url?: string }
): Promise<PublishResult> {
  // Use the first media file for publishing
  const mediaPath = mediaPaths[0];
  if (!mediaPath) {
    return { platform, success: false, error: 'No media file provided' };
  }

  const mediaType = getMediaType(mediaPath);

  switch (platform) {
    case 'youtube': {
      if (mediaType !== 'video') {
        return { platform, success: false, error: 'YouTube only supports video uploads' };
      }
      const creds = credentials as YouTubeCredentials;
      const result = await publishToYouTube(
        creds,
        mediaPath,
        caption,
        tags,
        options.privacy ?? 'private'
      );
      return { platform, ...result };
    }

    case 'instagram': {
      const creds = credentials as InstagramCredentials;

      // Instagram requires publicly accessible URLs
      if (!options.media_base_url) {
        return {
          platform,
          success: false,
          error: 'Instagram requires a media_base_url to serve files publicly',
        };
      }

      const publicUrl = `${options.media_base_url.replace(/\/$/, '')}/${mediaPath.replace(/^\//, '')}`;

      if (mediaType === 'image') {
        const result = await publishPhotoToInstagram(creds, publicUrl, caption);
        return { platform, ...result };
      } else if (mediaType === 'video') {
        const result = await publishReelToInstagram(creds, publicUrl, caption);
        return { platform, ...result };
      }
      return { platform, success: false, error: `Unsupported media type for Instagram: ${mediaPath}` };
    }

    case 'facebook': {
      const creds = credentials as FacebookCredentials;
      if (mediaType === 'image') {
        const result = await publishPhotoToFacebook(creds, mediaPath, caption);
        return { platform, ...result };
      } else if (mediaType === 'video') {
        const result = await publishVideoToFacebook(creds, mediaPath, caption);
        return { platform, ...result };
      }
      return { platform, success: false, error: `Unsupported media type for Facebook: ${mediaPath}` };
    }

    default:
      return { platform, success: false, error: `Unknown platform: ${platform}` };
  }
}

/**
 * Publish a post to all configured platforms in parallel.
 *
 * @param post - The parsed post object
 * @param platformConfigs - Array of platform configurations with credentials
 * @returns Array of publish results, one per platform
 */
export async function publishPost(
  post: PostParsed,
  platformConfigs: PlatformConfig[]
): Promise<PublishResult[]> {
  const caption = [post.caption ?? '', ...post.hashtags.map((t) => `#${t}`)].join('\n').trim();

  const promises = platformConfigs.map((config) =>
    publishToPlatform(
      config.platform,
      config.credentials,
      post.media_paths,
      caption,
      post.hashtags,
      { privacy: config.privacy, media_base_url: config.media_base_url }
    )
  );

  const results = await Promise.allSettled(promises);

  return results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    return {
      platform: platformConfigs[i].platform,
      success: false,
      error: r.reason instanceof Error ? r.reason.message : String(r.reason),
    };
  });
}

// Re-export types and individual publishers for direct use
export { publishToYouTube, type YouTubeCredentials, type YouTubePublishResult } from './youtube';
export {
  publishPhotoToInstagram,
  publishReelToInstagram,
  type InstagramCredentials,
  type InstagramPublishResult,
} from './instagram';
export {
  publishPhotoToFacebook,
  publishVideoToFacebook,
  type FacebookCredentials,
  type FacebookPublishResult,
} from './facebook';
