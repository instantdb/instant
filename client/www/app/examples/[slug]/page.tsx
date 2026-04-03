import type { Metadata } from 'next';
import { getAllSlugs, getExampleAppBySlug } from '@/lib/examples/server';
import Content from './content';

export async function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const app = getExampleAppBySlug(slug);
  return {
    title: `${app.title} | InstantDB Examples`,
    description: 'Learn Instant through example apps',
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const app = getExampleAppBySlug(slug);
  return <Content app={app} />;
}
