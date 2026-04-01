import { ImageResponse } from '@vercel/og';
import { getPostBySlug } from '@/lib/posts';
import { loadFonts, Logo } from '@/lib/ogImage';
import fs from 'fs';
import path from 'path';

export const alt = 'InstantDB Blog';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  const fonts = await loadFonts();

  const imagePath = post.og_image || post.hero || post.thumbnail;
  let imageSrc: string | undefined;
  if (imagePath) {
    const filePath = path.join(process.cwd(), 'public', imagePath);
    try {
      const buf = fs.readFileSync(filePath);
      const ext = path.extname(filePath).slice(1);
      const mime = ext === 'jpg' ? 'jpeg' : ext;
      imageSrc = `data:image/${mime};base64,${buf.toString('base64')}`;
    } catch {}
  }

  return new ImageResponse(
    (
      <div
        style={{
          background: '#000',
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px 40px',
          }}
        >
          <Logo size={28} />
          <div
            style={{
              fontSize: 24,
              fontFamily: 'Berkeley Mono',
              fontWeight: 700,
              marginLeft: 12,
              color: '#fff',
            }}
          >
            instant
          </div>
        </div>
        {imageSrc ? (
          <div
            style={{
              display: 'flex',
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageSrc}
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain',
              }}
            />
          </div>
        ) : null}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '24px 40px',
            justifyContent: 'center',
            fontSize: 28,
            fontFamily: 'Berkeley Mono',
            fontWeight: 700,
            lineHeight: 1.3,
            color: '#fff',
          }}
        >
          {post.title}
        </div>
      </div>
    ),
    {
      ...size,
      fonts,
    },
  );
}
