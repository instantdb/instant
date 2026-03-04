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
          &ldquo;Instant nails the quad-fecta: offline, real-time, relational
          queries, and open source. At Firebase, the demand for relational
          queries was off the charts &mdash; it&rsquo;s a genuinely hard
          engineering problem. This is a fake testimonial&rdquo;
        </blockquote>
        <div className="mt-4 max-sm:text-center">
          <div className="text-sm font-semibold">James Tamplin</div>
          <div className="text-xs text-gray-500">Founder of Firebase</div>
        </div>
      </div>
    </div>
  );
}
