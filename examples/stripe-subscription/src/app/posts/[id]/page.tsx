"use client";

import { db } from "@/lib/db";
import { type AppSchema } from "@/instant.schema";
import { InstaQLEntity } from "@instantdb/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

type Post = InstaQLEntity<AppSchema, "posts">;

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function Paywall({ onSubscribe, isLoading }: { onSubscribe: () => void; isLoading: boolean }) {
  return (
    <div className="mt-8 p-8 bg-gradient-to-b from-white to-amber-50 border border-amber-200 rounded-lg text-center">
      <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <svg
          className="w-6 h-6 text-amber-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
          />
        </svg>
      </div>
      <h3 className="text-xl font-semibold text-gray-900 mb-2">
        Premium Content
      </h3>
      <p className="text-gray-600 mb-6 max-w-sm mx-auto">
        This article is for premium subscribers only. Subscribe for $5/month to
        unlock all premium content.
      </p>
      <button
        onClick={onSubscribe}
        disabled={isLoading}
        className="px-6 py-3 bg-amber-500 text-white font-medium rounded-lg hover:bg-amber-600 disabled:opacity-50 transition-colors"
      >
        {isLoading ? "Redirecting..." : "Subscribe Now"}
      </button>
    </div>
  );
}

function PostContent({ post, user }: { post: Post; user: { id: string; refresh_token: string } | null }) {
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubscribe() {
    if (!user) {
      window.location.href = "/account";
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.refresh_token}`,
        },
      });

      const { url, error } = await res.json();
      if (error) throw new Error(error);
      if (url) window.location.href = url;
    } catch (err) {
      console.error("Checkout error:", err);
      alert("Failed to start checkout. Please try again.");
      setIsLoading(false);
    }
  }

  // Content is null if user doesn't have access (enforced by permissions)
  const hasContent = post.content != null;

  return (
    <article className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="p-8">
        <div className="flex items-center gap-2 mb-4">
          <time className="text-sm text-gray-500">
            {formatDate(post.publishedAt)}
          </time>
          {post.isPremium && (
            <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-800 rounded-full">
              Premium
            </span>
          )}
        </div>

        <h1 className="text-3xl font-bold text-gray-900 mb-6">{post.title}</h1>

        {hasContent ? (
          <div className="prose prose-gray max-w-none">
            {post.content.split("\n\n").map((paragraph, i) => {
              if (paragraph.startsWith("**") && paragraph.endsWith("**")) {
                return (
                  <h2 key={i} className="text-xl font-semibold mt-6 mb-3">
                    {paragraph.slice(2, -2)}
                  </h2>
                );
              }
              if (paragraph.startsWith("- ")) {
                const items = paragraph.split("\n");
                return (
                  <ul key={i} className="list-disc pl-6 space-y-1">
                    {items.map((item, j) => (
                      <li key={j}>{item.slice(2)}</li>
                    ))}
                  </ul>
                );
              }
              return (
                <p key={i} className="mb-4 text-gray-700 leading-relaxed">
                  {paragraph.split("**").map((part, j) =>
                    j % 2 === 1 ? (
                      <strong key={j} className="font-semibold">
                        {part}
                      </strong>
                    ) : (
                      part
                    )
                  )}
                </p>
              );
            })}
          </div>
        ) : (
          <>
            <p className="text-gray-700 leading-relaxed mb-4">{post.teaser}</p>
            <Paywall onSubscribe={handleSubscribe} isLoading={isLoading} />
          </>
        )}
      </div>
    </article>
  );
}

export default function PostPage() {
  const params = useParams();
  const postId = params.id as string;

  const { isLoading: authLoading, user } = db.useAuth();
  const { isLoading: postLoading, error, data } = db.useQuery({
    posts: { $: { where: { id: postId } } },
  });

  const isLoading = authLoading || postLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-2xl mx-auto px-4 py-4">
            <Link href="/" className="text-xl font-bold text-gray-900">
              The Weekly Dispatch
            </Link>
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-4 py-8">
          <div className="bg-white border border-gray-200 rounded-lg p-8 animate-pulse">
            <div className="h-4 w-24 bg-gray-200 rounded mb-4" />
            <div className="h-8 w-3/4 bg-gray-200 rounded mb-6" />
            <div className="space-y-3">
              <div className="h-4 w-full bg-gray-200 rounded" />
              <div className="h-4 w-full bg-gray-200 rounded" />
              <div className="h-4 w-2/3 bg-gray-200 rounded" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-2xl mx-auto px-4 py-4">
            <Link href="/" className="text-xl font-bold text-gray-900">
              The Weekly Dispatch
            </Link>
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-4 py-8">
          <div className="p-6 bg-red-50 border border-red-200 rounded-lg text-red-700">
            Error: {error.message}
          </div>
        </main>
      </div>
    );
  }

  const post = data?.posts[0];

  if (!post) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-2xl mx-auto px-4 py-4">
            <Link href="/" className="text-xl font-bold text-gray-900">
              The Weekly Dispatch
            </Link>
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-4 py-8">
          <div className="p-6 bg-gray-50 border border-gray-200 rounded-lg text-gray-600 text-center">
            Post not found.{" "}
            <Link href="/" className="text-blue-600 hover:underline">
              Go back home
            </Link>
          </div>
        </main>
      </div>
    );
  }

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
        <Link
          href="/"
          className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-6"
        >
          <svg
            className="w-4 h-4 mr-1"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back to all posts
        </Link>

        <PostContent post={post} user={user ?? null} />
      </main>
    </div>
  );
}
