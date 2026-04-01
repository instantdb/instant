declare module '*.md' {
  import type { Metadata } from 'next';

  export const metadata: Metadata | undefined;
  export const markdoc: {
    frontmatter?: Record<string, unknown>;
  };

  const Component: (props: any) => Promise<JSX.Element> | JSX.Element;
  export default Component;
}
