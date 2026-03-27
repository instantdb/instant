'use client';

import {
  LandingContainer,
  MainNav,
  PageProgressBar,
} from '@/components/marketingUi';
import { authorFirstName, formatDuration } from '@/lib/postUtils';
import type { Post } from '@/lib/posts';

import { TopWash } from '@/components/new-landing/TopWash';
import { EssayMarkdown } from '@/components/essays/EssayMarkdown';
import { Footer } from '@/components/new-landing/Footer';

export function EssayPage({ post }: { post: Post }) {
  const { title, authors, hero, content } = post;

  return (
    <LandingContainer>
      <PageProgressBar />
      <div className="relative">
        <TopWash />
        <MainNav transparent />
        <div className="relative mx-auto max-w-4xl px-4 pt-28 pb-8 sm:pt-32">
          <div className="mx-auto mb-8 max-w-2xl">
            <h1 className="mb-4 text-5xl leading-tight font-normal tracking-tight">
              {title}
            </h1>
            <div className="flex items-center text-base text-gray-500">
              <span>
                {authors.map((author, idx) => {
                  const name = authorFirstName(author);
                  return (
                    <span key={author.name}>
                      <a
                        className="underline decoration-transparent underline-offset-4 transition-[text-decoration-color] duration-300 hover:decoration-current"
                        href={author.url}
                        target="_blank"
                      >
                        {name}
                      </a>
                      {idx !== authors.length - 1 ? ' & ' : ''}
                    </span>
                  );
                })}
              </span>
              <span className="ml-auto">{formatDuration(post)}</span>
            </div>
          </div>
          {hero && (
            <div className="mx-auto mb-10 max-w-3xl">
              <img src={hero} alt={title} className="w-full" />
            </div>
          )}
          <div className="essay-content prose prose-lg prose-headings:font-normal prose-headings:leading-snug prose-h1:mb-4 prose-h1:mt-12 prose-h2:mb-3 prose-h2:mt-8 mx-auto max-w-2xl">
            <EssayMarkdown content={content} title={title} />
          </div>
        </div>
      </div>
      <Footer />
    </LandingContainer>
  );
}
