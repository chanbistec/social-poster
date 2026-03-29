import { google } from 'googleapis';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';

// ── Types ──

export interface YouTubeCredentials {
  access_token: string;
  refresh_token: string;
  client_id: string;
  client_secret: string;
}

export interface YouTubePublishResult {
  success: boolean;
  external_id?: string;
  external_url?: string;
  error?: string;
}

// ── Publisher ──

export async function publishToYouTube(
  credentials: YouTubeCredentials,
  media_path: string,
  caption: string,
  tags: string[],
  privacy: 'public' | 'private' | 'unlisted' = 'private'
): Promise<YouTubePublishResult> {
  try {
    // Verify file exists
    try {
      await stat(media_path);
    } catch {
      return { success: false, error: `Media file not found: ${media_path}` };
    }

    // Set up OAuth2 client with token refresh
    const oauth2Client = new google.auth.OAuth2(
      credentials.client_id,
      credentials.client_secret
    );

    oauth2Client.setCredentials({
      access_token: credentials.access_token,
      refresh_token: credentials.refresh_token,
    });

    // Auto-refresh token if expired
    oauth2Client.on('tokens', (tokens) => {
      if (tokens.access_token) {
        oauth2Client.setCredentials({
          access_token: tokens.access_token,
          refresh_token: credentials.refresh_token,
        });
      }
    });

    // Force a token refresh to ensure we have a valid token
    try {
      await oauth2Client.getAccessToken();
    } catch {
      return { success: false, error: 'Failed to refresh YouTube access token. Re-authentication may be required.' };
    }

    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

    // Extract title from caption (first line or first 100 chars)
    const title = caption.split('\n')[0].slice(0, 100) || 'Untitled';
    const description = caption;

    // Upload video via resumable upload
    const response = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title,
          description,
          tags,
        },
        status: {
          privacyStatus: privacy,
          selfDeclaredMadeForKids: false,
        },
      },
      media: {
        body: createReadStream(media_path),
      },
    });

    const videoId = response.data.id;
    if (!videoId) {
      return { success: false, error: 'Upload succeeded but no video ID returned' };
    }

    return {
      success: true,
      external_id: videoId,
      external_url: `https://www.youtube.com/watch?v=${videoId}`,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: `YouTube upload failed: ${message}` };
  }
}
