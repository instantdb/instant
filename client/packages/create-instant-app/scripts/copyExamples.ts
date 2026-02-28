import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';
import { copyRespectingGitignore } from '../src/scaffold.js';

const EXAMPLES_TO_COPY = [
  'expo',
  'next-js-app-dir',
  'vite-vanilla',
  'tanstack-start',
] as const;

async function main() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const repoRoot = path.resolve(__dirname, '../../../..');

  const examplesRoot = path.join(repoRoot, 'examples');
  const templateBaseRoot = path.join(__dirname, '../template/base');

  const copiedExamples = await Promise.all(
    EXAMPLES_TO_COPY.map(async (exampleName) => {
      const sourceDir = path.join(examplesRoot, exampleName);
      const targetDir = path.join(templateBaseRoot, exampleName);

      if (!(await fs.pathExists(sourceDir))) {
        throw new Error(`Example does not exist: ${exampleName}`);
      }

      await fs.remove(targetDir);
      await copyRespectingGitignore(sourceDir, targetDir);

      // Rename .gitignore to _gitignore so npm doesn't strip it during publish
      const gitignorePath = path.join(targetDir, '.gitignore');
      const underscorePath = path.join(targetDir, '_gitignore');
      if (await fs.pathExists(gitignorePath)) {
        await fs.rename(gitignorePath, underscorePath);
      }

      return exampleName;
    }),
  );

  for (const exampleName of copiedExamples) {
    console.log(`Copied ${exampleName}`);
  }

  console.log('Done copying examples to template/base.');
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
