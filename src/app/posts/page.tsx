import Link from "next/link";
import PostCard from "@/components/post-card";

async function getPosts() {
  const res = await fetch("http://localhost:3000/api/posts", { cache: "no-store" });
  const data = await res.json();
  return data.data || [];
}

export default async function PostsPage() {
  const posts = await getPosts();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Posts</h1>
          <p className="text-sm text-zinc-400">
            Drafts, approvals, schedules, published content
          </p>
        </div>
        <Link
          href="/posts/new"
          className="rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-400"
        >
          + New Post
        </Link>
      </div>

      <div className="grid gap-4">
        {posts.length === 0 && (
          <div className="rounded-lg border border-white/10 bg-zinc-900/60 p-6 text-sm text-zinc-400">
            No posts yet.
          </div>
        )}
        {posts.map((p: any) => (
          <PostCard key={p.id} post={p} />
        ))}
      </div>
    </div>
  );
}
