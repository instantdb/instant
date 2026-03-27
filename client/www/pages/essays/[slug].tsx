import { EssayPage } from '@/components/essays/EssayPage';
import { getAllSlugs, getPostBySlug, type Post } from '../../lib/posts';
import { withStarCount } from '@/lib/withStarCount';

export default function Page({ post }: { post: Post }) {
  return <EssayPage post={post} />;
}

export async function getStaticPaths() {
  return {
    paths: getAllSlugs().map((slug) => `/essays/${slug}`),
    fallback: false,
  };
}

export const getStaticProps = withStarCount(async (context) => {
  const slug = context.params!.slug as string;
  return {
    props: { post: getPostBySlug(slug) },
  };
});
