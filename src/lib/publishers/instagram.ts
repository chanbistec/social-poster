/**
 * Instagram Publisher — Meta Graph API (Container-based)
 *
 * NOTE: Instagram's Content Publishing API requires media to be at a publicly
 * accessible URL. The media serve route (T5) will provide this. Until then,
 * callers must ensure `image_url` / `video_url` is reachable from Meta's servers.
 */

const GRAPH_API = 'https://graph.facebook.com/v21.0';
const POLL_INTERVAL_MS = 5_000;
const MAX_POLL_MS = 60_000;

// ── Types ──

export interface InstagramCredentials {
  page_token: string;
  ig_account_id: string;
}

export interface InstagramPublishResult {
  success: boolean;
  external_id?: string;
  external_url?: string;
  error?: string;
}

// ── Helpers ──

async function graphPost(
  endpoint: string,
  params: Record<string, string>
): Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string }> {
  const url = new URL(`${GRAPH_API}${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), { method: 'POST' });
  const data = (await res.json()) as Record<string, unknown>;

  if (!res.ok || data.error) {
    const errObj = data.error as Record<string, unknown> | undefined;
    const msg = errObj?.message ?? JSON.stringify(data);
    return { ok: false, error: String(msg) };
  }
  return { ok: true, data };
}

async function graphGet(
  endpoint: string,
  params: Record<string, string>
): Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string }> {
  const url = new URL(`${GRAPH_API}${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString());
  const data = (await res.json()) as Record<string, unknown>;

  if (!res.ok || data.error) {
    const errObj = data.error as Record<string, unknown> | undefined;
    const msg = errObj?.message ?? JSON.stringify(data);
    return { ok: false, error: String(msg) };
  }
  return { ok: true, data };
}

async function waitForContainer(
  containerId: string,
  accessToken: string
): Promise<{ ok: boolean; error?: string }> {
  const start = Date.now();

  while (Date.now() - start < MAX_POLL_MS) {
    const result = await graphGet(`/${containerId}`, {
      fields: 'status_code',
      access_token: accessToken,
    });

    if (!result.ok) return { ok: false, error: result.error };

    const status = result.data?.status_code as string | undefined;

    if (status === 'FINISHED') return { ok: true };
    if (status === 'ERROR') {
      return { ok: false, error: 'Container processing failed (status: ERROR)' };
    }

    // status is IN_PROGRESS or PUBLISHED — keep polling
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  return { ok: false, error: 'Container processing timed out (60s)' };
}

// ── Publishers ──

export async function publishPhotoToInstagram(
  credentials: InstagramCredentials,
  image_url: string,
  caption: string
): Promise<InstagramPublishResult> {
  try {
    // Step 1: Create media container
    const container = await graphPost(`/${credentials.ig_account_id}/media`, {
      image_url,
      caption,
      access_token: credentials.page_token,
    });

    if (!container.ok) {
      return { success: false, error: `Container creation failed: ${container.error}` };
    }

    const containerId = container.data?.id as string;
    if (!containerId) {
      return { success: false, error: 'No container ID returned' };
    }

    // Step 2: Wait for processing
    const ready = await waitForContainer(containerId, credentials.page_token);
    if (!ready.ok) {
      return { success: false, error: ready.error };
    }

    // Step 3: Publish
    const publish = await graphPost(`/${credentials.ig_account_id}/media_publish`, {
      creation_id: containerId,
      access_token: credentials.page_token,
    });

    if (!publish.ok) {
      return { success: false, error: `Publish failed: ${publish.error}` };
    }

    const mediaId = publish.data?.id as string;
    return {
      success: true,
      external_id: mediaId,
      external_url: `https://www.instagram.com/p/${mediaId}/`,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Instagram photo publish failed: ${message}` };
  }
}

export async function publishReelToInstagram(
  credentials: InstagramCredentials,
  video_url: string,
  caption: string
): Promise<InstagramPublishResult> {
  try {
    // Step 1: Create reel container
    const container = await graphPost(`/${credentials.ig_account_id}/media`, {
      video_url,
      caption,
      media_type: 'REELS',
      access_token: credentials.page_token,
    });

    if (!container.ok) {
      return { success: false, error: `Reel container creation failed: ${container.error}` };
    }

    const containerId = container.data?.id as string;
    if (!containerId) {
      return { success: false, error: 'No container ID returned' };
    }

    // Step 2: Wait for processing
    const ready = await waitForContainer(containerId, credentials.page_token);
    if (!ready.ok) {
      return { success: false, error: ready.error };
    }

    // Step 3: Publish
    const publish = await graphPost(`/${credentials.ig_account_id}/media_publish`, {
      creation_id: containerId,
      access_token: credentials.page_token,
    });

    if (!publish.ok) {
      return { success: false, error: `Reel publish failed: ${publish.error}` };
    }

    const mediaId = publish.data?.id as string;
    return {
      success: true,
      external_id: mediaId,
      external_url: `https://www.instagram.com/reel/${mediaId}/`,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Instagram reel publish failed: ${message}` };
  }
}
