import { EssayPage } from '@/components/essays/EssayPage';
import { getAllSlugs, getPostBySlug, type Post } from '../../lib/posts';

export default function Page({ post }: { post: Post }) {
  return <EssayPage post={post} />;
}

export async function getStaticPaths() {
  return {
    paths: getAllSlugs().map((slug) => `/essays/${slug}`),
    fallback: false,
  };
}

export async function getStaticProps({
  params: { slug },
}: {
  params: { slug: string };
}) {
  return {
    props: { post: getPostBySlug(slug) },
  };
}
