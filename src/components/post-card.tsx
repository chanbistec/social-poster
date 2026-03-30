import Link from "next/link";

const statusColors: Record<string, string> = {
  draft: "bg-zinc-700 text-zinc-300",
  pending_approval: "bg-amber-900/50 text-amber-400",
  approved: "bg-blue-900/50 text-blue-400",
  scheduled: "bg-purple-900/50 text-purple-400",
  published: "bg-emerald-900/50 text-emerald-400",
  publishing: "bg-cyan-900/50 text-cyan-400",
  failed: "bg-red-900/50 text-red-400",
};

const platformColors: Record<string, string> = {
  youtube: "bg-red-500/20 text-red-300",
  instagram: "bg-pink-500/20 text-pink-300",
  facebook: "bg-blue-500/20 text-blue-300",
};

export default function PostCard({
  post,
  tenantName,
}: {
  post: any;
  tenantName?: string;
}) {
  const platforms = JSON.parse(post.platforms || "[]") as string[];
  const caption = post.caption || "";
  const preview = caption.length > 100 ? caption.slice(0, 100) + "…" : caption;

  return (
    <Link
      href={`/posts/${post.id}`}
      className="block rounded-lg border border-white/10 bg-zinc-900/60 p-4 hover:border-orange-400/40 transition-colors"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          {/* Header: tenant + status */}
          <div className="flex items-center gap-2 flex-wrap">
            {tenantName && (
              <span className="text-xs font-medium text-orange-400">
                {tenantName}
              </span>
            )}
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                statusColors[post.status] || "bg-zinc-700 text-zinc-300"
              }`}
            >
              {post.status?.replace("_", " ")}
            </span>
          </div>

          {/* Caption preview */}
          <p className="text-sm text-zinc-200 leading-relaxed">
            {preview || "No caption"}
          </p>

          {/* Meta row */}
          <div className="flex items-center gap-3 text-[11px] text-zinc-500">
            {post.scheduled_at && (
              <span>
                📅 {new Date(post.scheduled_at).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
            {post.created_at && (
              <span>
                Created {new Date(post.created_at).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            )}
          </div>
        </div>

        {/* Platform badges */}
        <div className="flex flex-wrap gap-1.5 shrink-0">
          {platforms.map((p) => (
            <span
              key={p}
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${
                platformColors[p] || "bg-zinc-700 text-zinc-300"
              }`}
            >
              {p}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}
