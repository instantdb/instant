import { ImageResponse } from '@vercel/og';
import { NextRequest } from 'next/server';

export const config = {
  runtime: 'edge',
};

export default async function handler(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get('title');
  const section = searchParams.get('section');

  const [regular, bold] = await Promise.all([
    fetch(
      new URL(
        'https://stopaio.s3.amazonaws.com/public/BerkeleyMono-Regular.ttf',
        import.meta.url,
      ),
    ),
    fetch(
      new URL(
        'https://stopaio.s3.amazonaws.com/public/BerkeleyMono-Bold.ttf',
        import.meta.url,
      ),
    ),
  ]);
  const [boldFontData, regularFontData] = await Promise.all([
    bold.arrayBuffer(),
    regular.arrayBuffer(),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          background:
            'linear-gradient(120deg, #e7e7e7 40%, #fee7de 70%, #e4e4e4 100%)',
          height: '100%',
          width: '100%',
          display: 'flex',
          textAlign: 'center',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          flexWrap: 'nowrap',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'center',
            justifyItems: 'center',
            margin: '10px 0',
          }}
        >
          <div
            style={{
              display: 'flex',
              marginRight: 10,
            }}
          >
            <svg
              width="80"
              height="80"
              viewBox="0 0 512 512"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <rect width="512" height="512" fill="black" />
              <rect
                x="97.0973"
                y="91.3297"
                width="140"
                height="330"
                fill="white"
              />
            </svg>
          </div>
          <div
            style={{
              fontSize: 50,
              fontStyle: 'bold',
              fontFamily: 'Berkeley Mono',
              padding: '0 10px',
              lineHeight: 1.4,
              whiteSpace: 'pre-wrap',
              fontWeight: 700,
            }}
          >
            instant
          </div>
          {section ? (
            <div
              style={{
                fontSize: 50,
                fontStyle: 'normal',
                fontFamily: 'Berkeley Mono',
                padding: '0 10px',
                lineHeight: 1.4,
                whiteSpace: 'pre-wrap',
                color: '#000000',
              }}
            >
              {section}
            </div>
          ) : null}
        </div>
        {title ? (
          <div
            style={{
              fontSize: 50,
              fontStyle: 'normal',
              fontFamily: 'Berkeley Mono',
              marginTop: 30,
              padding: '0 10px',
              lineHeight: 1.4,
              whiteSpace: 'pre-wrap',
            }}
          >
            {title}
          </div>
        ) : null}
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: 'Berkeley Mono',
          data: regularFontData,
          style: 'normal',
          weight: 500,
        },
        {
          name: 'Berkeley Mono',
          data: boldFontData,
          style: 'normal',
          weight: 700,
        },
      ],
    },
  );
}
