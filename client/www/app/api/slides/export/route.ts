import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const slideId = request.nextUrl.searchParams.get('slide');
  if (!slideId) {
    return NextResponse.json(
      { error: 'Missing slide parameter' },
      { status: 400 },
    );
  }

  try {
    const puppeteer = await import('puppeteer');
    const browser = await puppeteer.default.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 675, deviceScaleFactor: 2 });

    const url = `http://localhost:${process.env.PORT || 3000}/slides/export?slide=${slideId}`;
    await page.goto(url, { waitUntil: 'networkidle0' });

    // Wait for fonts to load
    await page.evaluate(() => document.fonts.ready);
    // Extra settle time for any animations
    await new Promise((r) => setTimeout(r, 500));

    // Hide all dev indicators (Next.js, Instant, etc.)
    await page.addStyleTag({
      content: `
        nextjs-portal, [data-nextjs-dev-overlay],
        [style*="position: fixed"], [style*="position:fixed"] {
          display: none !important;
        }
      `,
    });

    const element = await page.$('#slide-export');
    if (!element) {
      await browser.close();
      return NextResponse.json(
        { error: 'Slide element not found' },
        { status: 500 },
      );
    }

    const screenshot = await element.screenshot({ type: 'png' });
    await browser.close();

    return new NextResponse(new Uint8Array(screenshot) as any, {
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `attachment; filename="slide-${slideId}.png"`,
      },
    });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json(
      { error: 'Failed to export slide' },
      { status: 500 },
    );
  }
}
