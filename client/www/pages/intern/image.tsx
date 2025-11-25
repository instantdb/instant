import Head from 'next/head';
import { useRef, useState } from 'react';
import {
  LandingContainer,
  LandingFooter,
  MainNav,
  Section,
  H2,
} from '@/components/marketingUi';
import { Button, FullscreenLoading } from '@/components/ui';
import { useAdmin } from '@/lib/auth';
import { useIsHydrated } from '@/lib/hooks/useIsHydrated';
import { successToast, errorToast } from '@/lib/toast';

function InstantLogo({ size = 120 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="512" height="512" fill="black" />
      <rect x="97.0973" y="91.3297" width="140" height="330" fill="white" />
    </svg>
  );
}

function ImagePreview({ text, showLogo }: { text: string; showLogo: boolean }) {
  return (
    <div
      className="flex flex-col items-center justify-center border-2 border-gray-300 bg-white"
      style={{
        aspectRatio: '16 / 9',
        width: '100%',
        maxWidth: '800px',
      }}
    >
      {showLogo && (
        <div className="mb-8">
          <InstantLogo size={160} />
        </div>
      )}
      {text && (
        <div
          className="text-center font-mono text-5xl font-medium"
          style={{ wordBreak: 'break-word', maxWidth: '90%' }}
        >
          {text}
        </div>
      )}
    </div>
  );
}

function ImageCanvas({
  text,
  showLogo,
  canvasRef,
}: {
  text: string;
  showLogo: boolean;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}) {
  // 16:9 aspect ratio at 1920x1080
  const width = 1920;
  const height = 1080;

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="hidden"
      data-text={text}
      data-show-logo={showLogo}
    />
  );
}

export default function ImageGeneratorPage() {
  const [text, setText] = useState('db.auth.signInAsGuest()');
  const [showLogo, setShowLogo] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isHydrated = useIsHydrated();
  const { isAdmin, isLoading, error } = useAdmin();

  const pageTitle = 'Image Generator - Instant Intern';

  const renderCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const width = canvas.width;
    const height = canvas.height;

    // Clear and fill background
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, width, height);

    // Draw border
    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, width - 4, height - 4);

    let currentY = height / 2;

    // Calculate total height to center content
    const logoSize = 280;
    const textSize = 90;
    const spacing = 50;
    const totalHeight =
      (showLogo ? logoSize + spacing : 0) + (text ? textSize : 0);
    currentY = (height - totalHeight) / 2;

    // Draw logo if enabled
    if (showLogo) {
      const logoX = (width - logoSize) / 2;
      const logoY = currentY;

      // Black square
      ctx.fillStyle = 'black';
      ctx.fillRect(logoX, logoY, logoSize, logoSize);

      // White rectangle inside
      const innerX = logoX + logoSize * (97.0973 / 512);
      const innerY = logoY + logoSize * (91.3297 / 512);
      const innerWidth = logoSize * (140 / 512);
      const innerHeight = logoSize * (330 / 512);

      ctx.fillStyle = 'white';
      ctx.fillRect(innerX, innerY, innerWidth, innerHeight);

      currentY += logoSize + spacing;
    }

    // Draw text if present
    if (text) {
      ctx.fillStyle = 'black';
      ctx.font = `500 ${textSize}px "Berkeley Mono", ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(text, width / 2, currentY);
    }

    return canvas;
  };

  const downloadImage = async () => {
    const canvas = renderCanvas();
    if (!canvas) return;

    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = 'instant-image.png';
    link.href = dataUrl;
    link.click();
  };

  const copyImage = async () => {
    const canvas = renderCanvas();
    if (!canvas) return;

    try {
      // Create blob promise - some browsers need it as a promise
      const blobPromise = new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to create blob'));
          }
        }, 'image/png');
      });

      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blobPromise }),
      ]);
      successToast('Image copied to clipboard');
    } catch (err) {
      console.error('Copy failed:', err);
      errorToast('Failed to copy image to clipboard');
    }
  };

  if (!isHydrated || isLoading) {
    return (
      <LandingContainer>
        <Head>
          <title>{pageTitle}</title>
        </Head>
        <MainNav />
        <Section>
          <div className="min-h-64 flex items-center justify-center">
            <FullscreenLoading />
          </div>
        </Section>
        <LandingFooter />
      </LandingContainer>
    );
  }

  if (error || !isAdmin) {
    return (
      <LandingContainer>
        <Head>
          <title>Access Denied</title>
        </Head>
        <MainNav />
        <Section>
          <div className="mb-8 mt-12 text-center">
            <H2>Access Denied</H2>
            <p className="mt-4 text-gray-600">
              You need to be an Instant admin to access this page.
            </p>
          </div>
        </Section>
        <LandingFooter />
      </LandingContainer>
    );
  }

  return (
    <LandingContainer>
      <Head>
        <title>{pageTitle}</title>
        <meta name="description" content="Generate Instant branded images" />
      </Head>
      <MainNav />
      <Section>
        <div className="mb-8 mt-12">
          <div className="mb-6 text-center">
            <H2>Image Generator</H2>
          </div>
          <p className="text-gray-700">
            Generate 16:9 images with the Instant logo and custom text.
          </p>
        </div>

        {/* Controls */}
        <div className="mb-8 space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Text
            </label>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Enter text..."
              className="w-full rounded-md border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="showLogo"
              checked={showLogo}
              onChange={(e) => setShowLogo(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="showLogo" className="text-sm text-gray-700">
              Show Instant logo
            </label>
          </div>
        </div>

        {/* Preview */}
        <div className="mb-8">
          <h3 className="mb-4 text-lg font-medium">Preview</h3>
          <div className="flex justify-center">
            <ImagePreview text={text} showLogo={showLogo} />
          </div>
        </div>

        {/* Action buttons */}
        <div className="mb-16 flex justify-center gap-4">
          <Button variant="secondary" onClick={copyImage}>
            Copy to Clipboard
          </Button>
          <Button variant="primary" onClick={downloadImage}>
            Download PNG
          </Button>
        </div>

        {/* Hidden canvas for rendering */}
        <ImageCanvas text={text} showLogo={showLogo} canvasRef={canvasRef} />
      </Section>
      <LandingFooter />
    </LandingContainer>
  );
}
