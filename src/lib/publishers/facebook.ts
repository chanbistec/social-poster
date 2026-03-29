import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { basename } from 'path';

const GRAPH_API = 'https://graph.facebook.com/v21.0';

// ── Types ──

export interface FacebookCredentials {
  page_token: string;
  page_id: string;
}

export interface FacebookPublishResult {
  success: boolean;
  external_id?: string;
  external_url?: string;
  error?: string;
}

// ── Publishers ──

export async function publishPhotoToFacebook(
  credentials: FacebookCredentials,
  image_path: string,
  caption: string
): Promise<FacebookPublishResult> {
  try {
    // Verify file exists
    try {
      await stat(image_path);
    } catch {
      return { success: false, error: `Image file not found: ${image_path}` };
    }

    const url = `${GRAPH_API}/${credentials.page_id}/photos`;

    // Build multipart form data
    const form = new FormData();
    const fileStream = createReadStream(image_path);

    // Read the file into a buffer for FormData (Node 18+ fetch supports this)
    const chunks: Buffer[] = [];
    for await (const chunk of fileStream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const fileBuffer = Buffer.concat(chunks);
    const blob = new Blob([fileBuffer]);

    form.append('source', blob, basename(image_path));
    form.append('message', caption);
    form.append('access_token', credentials.page_token);

    const res = await fetch(url, { method: 'POST', body: form });
    const data = (await res.json()) as Record<string, unknown>;

    if (!res.ok || data.error) {
      const errObj = data.error as Record<string, unknown> | undefined;
      const msg = errObj?.message ?? JSON.stringify(data);
      return { success: false, error: `Facebook photo upload failed: ${msg}` };
    }

    const photoId = (data.id ?? data.post_id) as string | undefined;
    return {
      success: true,
      external_id: photoId,
      external_url: photoId
        ? `https://www.facebook.com/${credentials.page_id}/posts/${photoId}`
        : undefined,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Facebook photo publish failed: ${message}` };
  }
}

export async function publishVideoToFacebook(
  credentials: FacebookCredentials,
  video_path: string,
  caption: string
): Promise<FacebookPublishResult> {
  try {
    // Verify file exists
    try {
      await stat(video_path);
    } catch {
      return { success: false, error: `Video file not found: ${video_path}` };
    }

    const url = `${GRAPH_API}/${credentials.page_id}/videos`;

    // Read file into buffer for FormData
    const fileStream = createReadStream(video_path);
    const chunks: Buffer[] = [];
    for await (const chunk of fileStream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const fileBuffer = Buffer.concat(chunks);
    const blob = new Blob([fileBuffer]);

    const form = new FormData();
    form.append('source', blob, basename(video_path));
    form.append('description', caption);
    form.append('access_token', credentials.page_token);

    const res = await fetch(url, { method: 'POST', body: form });
    const data = (await res.json()) as Record<string, unknown>;

    if (!res.ok || data.error) {
      const errObj = data.error as Record<string, unknown> | undefined;
      const msg = errObj?.message ?? JSON.stringify(data);
      return { success: false, error: `Facebook video upload failed: ${msg}` };
    }

    const videoId = data.id as string | undefined;
    return {
      success: true,
      external_id: videoId,
      external_url: videoId
        ? `https://www.facebook.com/${credentials.page_id}/videos/${videoId}`
        : undefined,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Facebook video publish failed: ${message}` };
  }
}
