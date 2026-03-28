import type { Metadata } from 'next';
import { EssayPage } from '@/components/essays/EssayPage';
import { getAllSlugs, getPostBySlug } from '@/lib/posts';
import * as og from '@/lib/og';

export async function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  return {
    title: post.title,
    openGraph: {
      title: post.title,
      type: 'article',
      images: [
        post.og_image ||
          post.hero ||
          og.url({ title: post.title, section: 'blog' }),
      ],
      authors: post.authors.map((a) => a.name),
    },
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  return <EssayPage post={post} />;
}
