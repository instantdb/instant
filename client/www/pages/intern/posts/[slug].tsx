// Live preview for essays during development.
// Connects to an SSE endpoint that watches the markdown file on disk,
// so edits appear instantly without polling or page reloads.
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { EssayPage } from '@/components/essays/EssayPage';
import type { Post } from '@/lib/posts';

export default function Preview() {
  const { query } = useRouter();
  const slug = query.slug as string;
  const [post, setPost] = useState<Post | null>(null);

  useEffect(() => {
    if (!slug) return;
    const es = new EventSource(`/api/intern/posts/watch/${slug}`);
    es.onmessage = (e) => setPost(JSON.parse(e.data));
    return () => es.close();
  }, [slug]);

  if (!post) {
    return (
      <div className="flex min-h-screen items-center justify-center text-gray-400">
        Loading...
      </div>
    );
  }

  return <EssayPage post={post} />;
}
