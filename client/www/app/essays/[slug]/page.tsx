import type { Metadata } from 'next';
import { EssayPage } from '@/components/essays/EssayPage';
import { getAllSlugs, getPostBySlug } from '@/lib/posts';
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
  const postImage = post.og_image || post.hero || post.thumbnail;
  return {
    title: post.title,
    openGraph: {
      title: post.title,
      type: 'article',
      ...(postImage ? { images: [postImage] } : {}),
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
