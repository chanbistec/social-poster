import db from "@/lib/db";

export type PipelineHealthFilters = {
  tenantId?: string;
  status?: string;
  templateId?: string;
  platform?: string;
  issue?: string;
};

export type PipelineHealthRow = {
  id: number;
  status: string;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  post_id: number | null;
  template_id: number;
  template_name: string | null;
  tenant_id: string | null;
  tenant_name: string | null;
  latest_publish_at: string | null;
  last_publish_statuses: string | null;
  last_failed_platforms: string | null;
  success_platforms: string | null;
  total_publish_attempts: number;
};

export function getPipelineHealthRows(filters: PipelineHealthFilters = {}) {
  const conditions: string[] = [];
  const values: Array<string | number> = [];

  if (filters.tenantId) {
    conditions.push("pt.tenant_id = ?");
    values.push(filters.tenantId);
  }

  if (filters.status) {
    conditions.push("pr.status = ?");
    values.push(filters.status);
  }

  if (filters.templateId) {
    conditions.push("pr.template_id = ?");
    values.push(Number(filters.templateId));
  }

  if (filters.platform) {
    conditions.push(`EXISTS (
      SELECT 1
      FROM publish_results pr_filter
      WHERE pr_filter.post_id = pr.post_id
        AND pr_filter.platform = ?
    )`);
    values.push(filters.platform);
  }

  if (filters.issue === "stuck") {
    conditions.push(`pr.status IN ('generating', 'publishing')
      AND pr.started_at IS NOT NULL
      AND datetime(replace(replace(pr.started_at, 'T', ' '), 'Z', '')) <= datetime('now', '-15 minutes')`);
  } else if (filters.issue === "failed") {
    conditions.push("pr.status = 'failed'");
  } else if (filters.issue === "partial") {
    conditions.push(`(
      SELECT COUNT(*)
      FROM publish_results latest_partial
      WHERE latest_partial.post_id = pr.post_id
        AND latest_partial.id >= COALESCE(
          (
            SELECT MAX(anchor.id)
            FROM publish_results anchor
            WHERE anchor.post_id = pr.post_id
              AND anchor.platform = latest_partial.platform
          ), 0
        )
        AND latest_partial.status = 'success'
    ) > 0`);
    conditions.push(`(
      SELECT COUNT(*)
      FROM publish_results latest_partial
      WHERE latest_partial.post_id = pr.post_id
        AND latest_partial.id >= COALESCE(
          (
            SELECT MAX(anchor.id)
            FROM publish_results anchor
            WHERE anchor.post_id = pr.post_id
              AND anchor.platform = latest_partial.platform
          ), 0
        )
        AND latest_partial.status = 'failed'
    ) > 0`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  return db
    .prepare(
      `SELECT
        pr.id,
        pr.status,
        pr.error,
        pr.started_at,
        pr.completed_at,
        pr.created_at,
        pr.post_id,
        pr.template_id,
        pt.name as template_name,
        pt.tenant_id,
        t.name as tenant_name,
        (
          SELECT MAX(latest_all.published_at)
          FROM publish_results latest_all
          WHERE latest_all.post_id = pr.post_id
        ) as latest_publish_at,
        (
          SELECT GROUP_CONCAT(latest.status || ':' || latest.platform, ', ')
          FROM publish_results latest
          WHERE latest.post_id = pr.post_id
            AND latest.id IN (
              SELECT MAX(inner_pr.id)
              FROM publish_results inner_pr
              WHERE inner_pr.post_id = pr.post_id
              GROUP BY inner_pr.platform
            )
        ) as last_publish_statuses,
        (
          SELECT GROUP_CONCAT(latest.platform, ', ')
          FROM publish_results latest
          WHERE latest.post_id = pr.post_id
            AND latest.id IN (
              SELECT MAX(inner_pr.id)
              FROM publish_results inner_pr
              WHERE inner_pr.post_id = pr.post_id
              GROUP BY inner_pr.platform
            )
            AND latest.status = 'failed'
        ) as last_failed_platforms,
        (
          SELECT GROUP_CONCAT(latest.platform, ', ')
          FROM publish_results latest
          WHERE latest.post_id = pr.post_id
            AND latest.id IN (
              SELECT MAX(inner_pr.id)
              FROM publish_results inner_pr
              WHERE inner_pr.post_id = pr.post_id
              GROUP BY inner_pr.platform
            )
            AND latest.status = 'success'
        ) as success_platforms,
        (
          SELECT COUNT(*)
          FROM publish_results publish_attempts
          WHERE publish_attempts.post_id = pr.post_id
        ) as total_publish_attempts
      FROM pipeline_runs pr
      JOIN pipeline_templates pt ON pt.id = pr.template_id
      LEFT JOIN tenants t ON t.id = pt.tenant_id
      ${where}
      ORDER BY COALESCE(pr.completed_at, pr.started_at, pr.created_at) DESC`
    )
    .all(...values) as PipelineHealthRow[];
}

export function getPipelineHealthSummary(filters: PipelineHealthFilters = {}) {
  const rows = getPipelineHealthRows(filters);

  return {
    rows,
    counts: {
      total: rows.length,
      generating: rows.filter((row) => row.status === "generating").length,
      preview: rows.filter((row) => row.status === "preview").length,
      publishing: rows.filter((row) => row.status === "publishing").length,
      published: rows.filter((row) => row.status === "published").length,
      failed: rows.filter((row) => row.status === "failed").length,
      stuck: rows.filter((row) => isStuck(row.status, row.started_at)).length,
      partial: rows.filter((row) => Boolean(row.last_failed_platforms) && Boolean(row.success_platforms)).length,
    },
  };
}

export function isStuck(status: string, startedAt: string | null) {
  if (!startedAt) return false;
  if (!["generating", "publishing"].includes(status)) return false;
  const started = new Date(startedAt).getTime();
  if (Number.isNaN(started)) return false;
  return Date.now() - started >= 15 * 60 * 1000;
}
