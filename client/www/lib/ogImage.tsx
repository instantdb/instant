import { ImageResponse } from '@vercel/og';

const SIZE = { width: 1200, height: 630 };

const berkMonoRegularUrl = new URL(
  '../public/fonts/BerkeleyMono-Regular.ttf',
  import.meta.url,
);
const berkMonoBoldUrl = new URL(
  '../public/fonts/BerkeleyMono-Bold.ttf',
  import.meta.url,
);
const switzerRegularUrl = new URL(
  '../public/fonts/Switzer-Regular.woff',
  import.meta.url,
);
const switzerSemiboldUrl = new URL(
  '../public/fonts/Switzer-Semibold.woff',
  import.meta.url,
);

export async function loadFonts() {
  const [berkRegular, berkBold, swRegular, swSemibold] = await Promise.all([
    fetch(berkMonoRegularUrl).then((r) => r.arrayBuffer()),
    fetch(berkMonoBoldUrl).then((r) => r.arrayBuffer()),
    fetch(switzerRegularUrl).then((r) => r.arrayBuffer()),
    fetch(switzerSemiboldUrl).then((r) => r.arrayBuffer()),
  ]);
  return [
    {
      name: 'Berkeley Mono',
      data: berkRegular,
      style: 'normal' as const,
      weight: 500 as const,
    },
    {
      name: 'Berkeley Mono',
      data: berkBold,
      style: 'normal' as const,
      weight: 700 as const,
    },
    {
      name: 'Switzer',
      data: swRegular,
      style: 'normal' as const,
      weight: 400 as const,
    },
    {
      name: 'Switzer',
      data: swSemibold,
      style: 'normal' as const,
      weight: 600 as const,
    },
  ];
}

export function Logo({ size = 64 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="512" height="512" fill="white" />
      <rect x="97.0973" y="91.3297" width="140" height="330" fill="black" />
    </svg>
  );
}

export async function generateOgImage({
  title,
  section,
  brand = 'instant',
  layout = 'default',
}: {
  title?: React.ReactNode;
  section?: string;
  brand?: string;
  layout?: 'default' | 'centered';
}) {
  const fonts = await loadFonts();

  const content =
    layout === 'centered' ? (
      <div
        style={{
          background: '#fff',
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          padding: '60px 80px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <svg
            width="40"
            height="40"
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
          <div
            style={{
              fontSize: 36,
              fontFamily: 'Berkeley Mono',
              marginLeft: 14,
              fontWeight: 700,
              color: '#000',
            }}
          >
            {brand}
          </div>
        </div>
        {title ? (
          <div
            style={{
              display: 'flex',
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                fontSize: 56,
                fontFamily: 'Switzer',
                fontWeight: 600,
                lineHeight: 1.3,
                color: '#000',
                textAlign: 'center',
              }}
            >
              {title}
            </div>
          </div>
        ) : null}
      </div>
    ) : (
      <div
        style={{
          background: '#000',
          height: '100%',
          width: '100%',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'flex-end',
          flexDirection: 'column',
          padding: '60px 80px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <Logo />
          <div
            style={{
              fontSize: 64,
              fontFamily: 'Berkeley Mono',
              marginLeft: 20,
              fontWeight: 700,
              color: '#fff',
            }}
          >
            {brand}
          </div>
          {section ? (
            <div
              style={{
                fontSize: 64,
                fontFamily: 'Berkeley Mono',
                marginLeft: 16,
                color: '#888',
              }}
            >
              {section}
            </div>
          ) : null}
        </div>
        {title ? (
          <div
            style={{
              display: 'flex',
              fontSize: 40,
              fontFamily: 'Switzer',
              fontWeight: 400,
              marginTop: 24,
              lineHeight: 1.3,
              color: '#aaa',
              maxWidth: 1040,
            }}
          >
            {title}
          </div>
        ) : null}
      </div>
    );

  return new ImageResponse(content, {
    ...SIZE,
    fonts,
  });
}
