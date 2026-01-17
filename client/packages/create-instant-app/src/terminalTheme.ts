// written by claude
import { stdin, stdout } from 'process';
import { setRawModeWindowsFriendly } from 'instant-cli/ui';

/**
 * Query terminal background color using OSC 11
 * Returns the RGB color values or null if not supported
 */
export async function queryTerminalBackground(): Promise<string | null> {
  return new Promise((resolve) => {
    // Check if we're in a TTY environment
    if (!stdout.isTTY || !stdin.isTTY) {
      resolve(null);
      return;
    }

    // Set up stdin for raw mode to capture the response
    const wasRaw = stdin.isRaw;
    if (!wasRaw) {
      setRawModeWindowsFriendly(stdin, true);
    }

    // Timeout in case terminal doesn't support OSC 11
    const timeout = setTimeout(() => {
      cleanup();
      resolve(null);
    }, 100);

    let response = '';

    const cleanup = () => {
      clearTimeout(timeout);
      stdin.removeListener('data', onData);
      if (!wasRaw && stdin.isTTY) {
        setRawModeWindowsFriendly(stdin, false);
      }
    };

    const onData = (chunk: Buffer) => {
      const data = chunk.toString();
      response += data;

      // OSC response format: ESC ] 11 ; rgb:RRRR/GGGG/BBBB ESC \
      // or ESC ] 11 ; rgb:RRRR/GGGG/BBBB BEL
      const oscMatch = response.match(
        /\x1b\]11;rgb:([0-9a-fA-F]+)\/([0-9a-fA-F]+)\/([0-9a-fA-F]+)(?:\x1b\\|\x07)/,
      );

      if (oscMatch) {
        cleanup();
        const [, r, g, b] = oscMatch;
        resolve(`rgb:${r}/${g}/${b}`);
      }
    };

    stdin.on('data', onData);

    // Send OSC 11 query: ESC ] 11 ; ? ESC \
    stdout.write('\x1b]11;?\x1b\\');
  });
}

/**
 * Parse RGB values from OSC response
 */
export function parseRGBResponse(
  response: string,
): { r: number; g: number; b: number } | null {
  const match = response.match(
    /rgb:([0-9a-fA-F]+)\/([0-9a-fA-F]+)\/([0-9a-fA-F]+)/,
  );
  if (!match) return null;

  const [, rHex, gHex, bHex] = match;

  // Terminal colors are often 16-bit per channel (0-65535)
  // Convert to 8-bit (0-255)
  const r = Math.round(parseInt(rHex as string, 16) / 257);
  const g = Math.round(parseInt(gHex as string, 16) / 257);
  const b = Math.round(parseInt(bHex as string, 16) / 257);

  return { r, g, b };
}

/**
 * Determine if background is light or dark based on luminance
 */
export function isLightBackground(rgb: {
  r: number;
  g: number;
  b: number;
}): boolean {
  // Calculate relative luminance using sRGB formula
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance > 0.5;
}

export type Theme = 'light' | 'dark' | 'unknown';

/**
 * Main function to query and determine background theme
 */
export async function detectTerminalTheme(): Promise<
  'light' | 'dark' | 'unknown'
> {
  try {
    const bgColor = await queryTerminalBackground();

    if (!bgColor) {
      return 'unknown';
    }

    const rgb = parseRGBResponse(bgColor);
    if (!rgb) {
      return 'unknown';
    }

    return isLightBackground(rgb) ? 'light' : 'dark';
  } catch (error) {
    console.error('Error detecting terminal theme:', error);
    return 'unknown';
  }
}
