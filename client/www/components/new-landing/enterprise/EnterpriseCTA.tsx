import { AnimateIn } from '../AnimateIn';

export function EnterpriseCTA() {
  return (
    <div className="text-center">
      <AnimateIn>
        <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl lg:text-5xl">
          Ready to give your platform a backend?
        </h2>
      </AnimateIn>

      <AnimateIn delay={200}>
        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <a
            href="#contact"
            className="inline-flex items-center justify-center rounded-lg bg-orange-600 px-6 py-3 text-base font-medium text-white shadow-[0_0_20px_rgba(234,88,12,0.3)] transition-all hover:bg-orange-700 hover:shadow-[0_0_30px_rgba(234,88,12,0.45)]"
          >
            Talk to us
          </a>
          <a
            href="https://instantdb.com/docs"
            className="bg-surface inline-flex items-center justify-center rounded-lg border border-gray-200 px-6 py-3 text-base font-medium text-gray-900 transition-all"
          >
            Read the docs
          </a>
        </div>
      </AnimateIn>
    </div>
  );
}
