"use client";

import { db } from "@/lib/db";
import { type AppSchema } from "@/instant.schema";
import { InstaQLEntity } from "@instantdb/react";
import Link from "next/link";

type Post = InstaQLEntity<AppSchema, "posts">;

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function PostCard({ post }: { post: Post }) {
  return (
    <Link href={`/posts/${post.id}`} className="block group">
      <article className="p-6 bg-white border border-gray-200 rounded-lg hover:border-gray-300 hover:shadow-md transition-all">
        <div className="flex items-center gap-2 mb-3">
          <time className="text-sm text-gray-500">
            {formatDate(post.publishedAt)}
          </time>
          {post.isPremium && (
            <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-800 rounded-full">
              Premium
            </span>
          )}
        </div>
        <h2 className="text-xl font-semibold text-gray-900 group-hover:text-blue-600 transition-colors mb-2">
          {post.title}
        </h2>
        <p className="text-gray-600 line-clamp-2">{post.teaser}</p>
      </article>
    </Link>
  );
}

function PostFeed() {
  const { isLoading, error, data } = db.useQuery({
    posts: { $: { order: { publishedAt: "desc" } } },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="p-6 bg-gray-50 border border-gray-200 rounded-lg animate-pulse"
          >
            <div className="h-4 w-24 bg-gray-200 rounded mb-3" />
            <div className="h-6 w-3/4 bg-gray-200 rounded mb-2" />
            <div className="h-4 w-full bg-gray-200 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-lg text-red-700">
        Error loading posts: {error.message}
      </div>
    );
  }

  const { posts } = data;

  if (posts.length === 0) {
    return (
      <div className="p-6 bg-gray-50 border border-gray-200 rounded-lg text-gray-600 text-center">
        No posts yet. Check back soon!
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  );
}

export default function HomePage() {
  const { user } = db.useAuth();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-gray-900">
            The Weekly Dispatch
          </Link>
          <Link
            href="/account"
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            {user ? "Account" : "Sign In"}
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Latest Posts
          </h1>
          <p className="text-gray-600">
            Insights and ideas delivered weekly.{" "}
            {!user && (
              <Link href="/account" className="text-blue-600 hover:underline">
                Subscribe for $5/month
              </Link>
            )}{" "}
            to unlock premium content.
          </p>
        </div>

        <PostFeed />
      </main>
    </div>
  );
}
