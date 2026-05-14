import type { Metadata } from 'next';
import { GetadbLanding } from '../GetadbLanding';

const MAKE_URL = 'https://www.getadb.com/make';

const FIGMA_MAKE_SUFFIX = `Use InstantDB for your backend. For credentials, Figma Make notes, and current Instant docs, curl ${MAKE_URL} and follow the steps.`;

export const metadata: Metadata = {
  title: 'getadb for Figma Make',
  description:
    'Give Figma Make fresh InstantDB credentials, Figma-specific notes, and the current Instant docs.',
};

export default function FigmaGetadbHome() {
  return (
    <GetadbLanding
      guideHref={MAKE_URL}
      guideLabel="getadb.com/make"
      guideVerb="curls"
      humanFormSuffix={FIGMA_MAKE_SUFFIX}
      agentCommand={`curl '${MAKE_URL}'`}
    />
  );
}
