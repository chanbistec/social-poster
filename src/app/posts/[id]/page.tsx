import db from "@/lib/db";

export default async function PostDetailPage({ params }: { params: { id: string } }) {
  const post = db.prepare("SELECT * FROM posts WHERE id = ?").get(params.id) as any;
  if (!post) return <div>Post not found</div>;

  const results = db.prepare("SELECT * FROM publish_results WHERE post_id = ?").all(post.id) as any[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Post #{post.id}</h1>
        <p className="text-sm text-zinc-400">Status: {post.status}</p>
      </div>

      <div className="rounded-lg border border-white/10 bg-zinc-900/60 p-4">
        <h3 className="text-sm font-medium text-zinc-300">Caption</h3>
        <p className="text-sm text-zinc-200 whitespace-pre-line">{post.caption}</p>
      </div>

      <div className="rounded-lg border border-white/10 bg-zinc-900/60 p-4">
        <h3 className="text-sm font-medium text-zinc-300">Publish Results</h3>
        {results.length === 0 && <p className="text-xs text-zinc-400">No publish results yet.</p>}
        {results.map((r) => (
          <div key={r.id} className="text-xs text-zinc-300">
            {r.platform}: {r.status} {r.external_url && <a href={r.external_url} className="underline">link</a>}
          </div>
        ))}
      </div>
    </div>
  );
}
