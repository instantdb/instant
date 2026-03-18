import Image from 'next/image';

export function FirebaseTestimonial() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 sm:flex-row sm:items-start sm:gap-8">
      <Image
        src="/img/investors/james-tamplin.jpg"
        alt="James Tamplin"
        width={160}
        height={160}
        className="h-28 w-28 shrink-0 rounded-full object-cover object-center sm:h-36 sm:w-36"
      />
      <div>
        <blockquote className="text-base leading-relaxed text-gray-500 max-sm:text-center sm:text-lg">
          The amount of requests we had for relational queries for Firebase was
          off-the-charts. I always wanted this built and open sourced. I’m glad
          to see Instant is doing it!
        </blockquote>
        <div className="mt-4 max-sm:text-center">
          <div className="text-sm font-semibold">James Tamplin</div>
          <div className="text-xs text-gray-500">Founder of Firebase</div>
        </div>
      </div>
    </div>
  );
}
