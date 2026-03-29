import Link from "next/link";

export default function PostCard({ post }: { post: any }) {
  const platforms = JSON.parse(post.platforms || "[]") as string[];

  return (
    <Link
      href={`/posts/${post.id}`}
      className="rounded-lg border border-white/10 bg-zinc-900/60 p-4 hover:border-orange-400/40"
    >
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">
            {post.caption?.split("\n")[0] || "Untitled Post"}
          </h3>
          <p className="text-xs text-zinc-400">
            {post.status} • {post.scheduled_at || "unscheduled"}
          </p>
        </div>
        <div className="text-xs text-zinc-400">{platforms.join(", ")}</div>
      </div>
    </Link>
  );
}
