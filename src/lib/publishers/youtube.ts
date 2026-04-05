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

export interface YouTubePublishOptions {
  privacy?: 'public' | 'private' | 'unlisted';
  category?: string;
  title?: string;
  description?: string;
}

function createYouTubeClient(credentials: YouTubeCredentials) {
  const oauth2Client = new google.auth.OAuth2(
    credentials.client_id,
    credentials.client_secret,
  );

  oauth2Client.setCredentials({
    access_token: credentials.access_token,
    refresh_token: credentials.refresh_token,
  });

  oauth2Client.on('tokens', (tokens) => {
    if (tokens.access_token) {
      oauth2Client.setCredentials({
        access_token: tokens.access_token,
        refresh_token: credentials.refresh_token,
      });
    }
  });

  return google.youtube({ version: 'v3', auth: oauth2Client });
}

async function ensureYouTubeAccess(credentials: YouTubeCredentials) {
  const oauth2Client = new google.auth.OAuth2(
    credentials.client_id,
    credentials.client_secret,
  );
  oauth2Client.setCredentials({
    access_token: credentials.access_token,
    refresh_token: credentials.refresh_token,
  });
  await oauth2Client.getAccessToken();
}

// ── Publisher ──

export async function publishToYouTube(
  credentials: YouTubeCredentials,
  media_path: string,
  caption: string,
  tags: string[],
  privacy: 'public' | 'private' | 'unlisted' = 'private',
  options: Omit<YouTubePublishOptions, 'privacy'> = {},
): Promise<YouTubePublishResult> {
  try {
    try {
      await stat(media_path);
    } catch {
      return { success: false, error: `Media file not found: ${media_path}` };
    }

    try {
      await ensureYouTubeAccess(credentials);
    } catch {
      return { success: false, error: 'Failed to refresh YouTube access token. Re-authentication may be required.' };
    }

    const youtube = createYouTubeClient(credentials);

    const title = options.title?.trim() || caption.split('\n')[0].slice(0, 100) || 'Untitled';
    const description = options.description ?? caption;

    try {
      await youtube.channels.list({ part: ['id'], mine: true });
    } catch (quotaErr: unknown) {
      const msg = quotaErr instanceof Error ? quotaErr.message : String(quotaErr);
      if (msg.includes('quota') || msg.includes('exceeded') || msg.includes('rateLimitExceeded')) {
        return { success: false, error: `YouTube API quota exceeded. Try again tomorrow. (${msg})` };
      }
    }

    const response = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title,
          description,
          tags,
          categoryId: options.category,
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

export async function ensurePlaylistAndAddVideo(
  credentials: YouTubeCredentials,
  playlistTitle: string,
  videoId: string,
  privacy: 'public' | 'private' | 'unlisted' = 'private',
): Promise<{ playlistId: string; playlistUrl: string; itemId?: string }> {
  await ensureYouTubeAccess(credentials);
  const youtube = createYouTubeClient(credentials);

  const trimmedTitle = playlistTitle.trim();
  if (!trimmedTitle) {
    throw new Error('Playlist title is required');
  }

  const existing = await youtube.playlists.list({
    part: ['id', 'snippet'],
    mine: true,
    maxResults: 50,
  });

  const matched = existing.data.items?.find(
    (item) => item.snippet?.title?.trim().toLowerCase() === trimmedTitle.toLowerCase(),
  );

  let playlistId = matched?.id;

  if (!playlistId) {
    const created = await youtube.playlists.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title: trimmedTitle,
          description: `Auto-created by Social Poster for ${trimmedTitle}`,
        },
        status: {
          privacyStatus: privacy,
        },
      },
    });

    playlistId = created.data.id ?? undefined;
  }

  if (!playlistId) {
    throw new Error('Failed to resolve or create YouTube playlist');
  }

  const inserted = await youtube.playlistItems.insert({
    part: ['snippet'],
    requestBody: {
      snippet: {
        playlistId,
        resourceId: {
          kind: 'youtube#video',
          videoId,
        },
      },
    },
  });

  return {
    playlistId,
    playlistUrl: `https://www.youtube.com/playlist?list=${playlistId}`,
    itemId: inserted.data.id ?? undefined,
  };
}
