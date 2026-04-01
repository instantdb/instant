import { NextRequest } from 'next/server';
import { generateOgImage } from '@/lib/ogImage';

export const config = {
  runtime: 'edge',
};

export default async function handler(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get('title') || undefined;
  const section = searchParams.get('section') || undefined;

  const layout = section === 'docs' ? 'centered' : 'default';

  return generateOgImage({
    title,
    section: section === 'docs' ? undefined : section,
    layout,
  });
}
