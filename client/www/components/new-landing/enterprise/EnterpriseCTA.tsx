import { AnimateIn } from '../AnimateIn';
import { LandingButton, SectionTitle } from '../typography';

export function EnterpriseCTA() {
  return (
    <div className="text-center">
      <AnimateIn>
        <SectionTitle>Ready to give your platform a backend?</SectionTitle>
      </AnimateIn>

      <AnimateIn delay={200}>
        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <LandingButton href="#contact">Talk to us</LandingButton>
          <LandingButton href="https://instantdb.com/docs" variant="secondary">
            Read the docs
          </LandingButton>
        </div>
      </AnimateIn>
    </div>
  );
}
