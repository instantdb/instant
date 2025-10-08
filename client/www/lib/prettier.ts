import prettier from 'prettier/standalone';
import tsPlugin from 'prettier/plugins/typescript';
import estreePlugin from 'prettier/plugins/estree';

export async function prettifyTypescript({
  code,
  printWidth,
  cursorOffset,
}: {
  code: string;
  printWidth: number;
  cursorOffset: number;
}): Promise<{ formatted: string; cursorOffset: number }> {
  return await prettier.formatWithCursor(code, {
    cursorOffset,
    parser: 'typescript',
    plugins: [estreePlugin, tsPlugin],
    printWidth,
  });
}
