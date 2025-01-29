import format from "date-fns/format";
import parse from "date-fns/parse";
import Head from "next/head";
import { getAllSlugs, getHTMLPostBySlug } from "../../lib/posts";
import {
  H3,
  LandingContainer,
  LandingFooter,
  MainNav,
  type Post,
} from "@/components/marketingUi";

function Prose({ html }: { html: string }) {
  return (
    <div
      className="prose prose-h1:mt-8 prose-h1:mb-4 prose-h2:mt-4 prose-h2:mb-2 prose-pre:bg-gray-100"
      dangerouslySetInnerHTML={{ __html: html }}
    ></div>
  );
}

const Post = ({ post }: { post: Post }) => {
  const { title, date, mdHTML, authors } = post;
  return (
    <LandingContainer>
      <Head>
        <title>{title}</title>
        <meta
          name="description"
          content="Relational Database, on the client."
        />
      </Head>
      <MainNav />
      <div className="mx-auto mt-6 p-4 md:max-w-2xl">
        <div className="mb-4 space-y-2 border-b border-gray-300 py-4">
          <H3>{title}</H3>
          <div className="flex justify-between text-xs font-bold uppercase text-gray-500">
            <span className="space-x-2">
              {authors.map((author, idx) => {
                return (
                  <span>
                    <a
                      className="font-bold uppercase text-blue-500"
                      href={`https://x.com/${author.xHandle}`}
                      target="_blank"
                    >
                      {author.name}
                    </a>
                    {idx !== authors.length - 1 ? ", " : ""}
                  </span>
                );
              })}
            </span>
            {format(parse(date, "yyyy-MM-dd", new Date()), "MMM do, yyyy")}
          </div>
        </div>
        <Prose html={mdHTML} />
      </div>
      <LandingFooter />
    </LandingContainer>
  );
};

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
    props: { post: getHTMLPostBySlug(slug) },
  };
}

export default Post;
