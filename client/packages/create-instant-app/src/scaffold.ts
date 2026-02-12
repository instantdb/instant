import path from 'path';
import degit from 'degit';
import fs from 'fs-extra';
import { PKG_ROOT } from './consts.js';
import { Project } from './cli.js';
import chalk from 'chalk';
import { getUserPkgManager } from './utils/getUserPkgManager.js';
import { renderUnwrap, UI } from 'instant-cli/ui';
import slugify from 'slugify';
import ignore from 'ignore';

type ScaffoldMethod = 'dev' | 'bundled-template' | 'degit';

export const scaffoldBase = async (cliResults: Project, appDir: string) => {
  const projectDir = path.resolve(process.cwd(), appDir);

  if (fs.existsSync(projectDir)) {
    if (fs.readdirSync(projectDir).length === 0) {
      UI.log(
        `${chalk.cyan.bold(cliResults.appName)} exists but is empty, continuing...`,
        UI.ciaModifier(null),
      );
    } else {
      const overwriteDir = await renderUnwrap(
        new UI.Select({
          promptText: chalk.redBright(
            `${chalk.bold('Warning:')} ${chalk.bold(
              cliResults.appName,
            )} already exists and isn't empty. How would you like to proceed?`,
          ),
          options: [
            {
              label: 'Abort installation',
              value: 'abort',
            },
            {
              label: 'Clear the directory and continue installation',
              value: 'clear',
            },
          ],
          defaultValue: 'abort',
          modifyOutput: UI.ciaModifier(),
        }),
      );

      if (overwriteDir === 'abort') {
        UI.log('Aborting installation...');
        process.exit(1);
      }

      if (overwriteDir === 'clear') {
        fs.emptyDirSync(projectDir);
      }
    }
  }

  const result = scaffoldBaseCode({
    projectDir,
    baseTemplateName: cliResults.base,
  });

  const scaffoldedName =
    cliResults.appName === '.'
      ? 'App'
      : chalk.hex('#EA570B').bold(cliResults.appName);
  await renderUnwrap(
    new UI.Spinner({
      promise: result,
      workingText: `Scaffolding project files...`,
      doneText: `Successfully scaffolded ${scaffoldedName}!`,
      errorText: 'Error scaffolding project files',
      modifyOutput: UI.ciaModifier(null),
    }),
  );

  if (fs.pathExistsSync(path.join(projectDir, 'pnpm-lock.yaml'))) {
    fs.removeSync(path.join(projectDir, 'pnpm-lock.yaml'));
  }

  if (fs.pathExistsSync(path.join(projectDir, 'bun.lock'))) {
    fs.removeSync(path.join(projectDir, 'bun.lock'));
  }

  if (
    getUserPkgManager(cliResults.base) === 'pnpm' &&
    cliResults.base === 'expo'
  ) {
    await fs.appendFile(
      path.join(projectDir, '.npmrc'),
      `node-linker=hoisted
enable-pre-post-scripts=true`,
    );
  }

  // overwrite the "expo-template" and "My Instant App"
  if (cliResults.base === 'expo') {
    const slugifiedName = slugify.default(appDir);
    replaceTextInFile(
      path.join(projectDir, 'app.json'),
      '"name": "expo-template"',
      `"name": "${appDir}"`,
    );
    replaceTextInFile(
      path.join(projectDir, 'app.json'),
      '"slug": "expo-template"',
      `"slug": "${slugifiedName}"`,
    );
    replaceTextInFile(
      path.join(projectDir, 'app/_layout.tsx'),
      '"My Instant App"',
      `"${appDir}"`,
    );
  }

  return projectDir;
};

const replaceTextInFile = (
  filePath: string,
  oldText: string,
  newText: string,
) => {
  const fileContent = fs.readFileSync(filePath, 'utf8');
  const updatedContent = fileContent.replaceAll(oldText, newText);
  fs.writeFileSync(filePath, updatedContent);
};

const scaffoldWithDegit = async ({
  projectDir,
  baseTemplateName,
}: {
  projectDir: string;
  baseTemplateName: string;
}) => {
  const repoPath = `instantdb/instant/examples/${baseTemplateName}`;
  const degitInstance = degit(repoPath, { mode: 'tar', cache: true });
  await degitInstance.clone(projectDir);
};

/**
 * Copies files from src to dest, respecting .gitignore rules.
 * Only used for local development. In production, the folder will be cloned from github
 */
export async function copyRespectingGitignore(src: string, dest: string) {
  const ig = ignore();

  // Always ignore .git folder
  ig.add('.git');

  try {
    const gitignorePath = path.join(src, '.gitignore');
    const gitignoreContent = await fs.readFile(gitignorePath, 'utf8');
    ig.add(gitignoreContent);
  } catch {
    // No .gitignore file, continue without it
  }

  await fs.copy(src, dest, {
    filter: (srcPath) => {
      const relativePath = path.relative(src, srcPath);
      // Always copy the root directory
      if (relativePath === '') return true;
      return !ig.ignores(relativePath);
    },
  });
}

const scaffoldBaseCode = async ({
  projectDir,
  baseTemplateName,
}: {
  projectDir: string;
  baseTemplateName: string;
}) => {
  const srcDir = path.join(PKG_ROOT, `template/base/${baseTemplateName}`);
  const useDevRepo =
    Boolean(process.env.INSTANT_CLI_DEV) &&
    Boolean(process.env.INSTANT_REPO_FOLDER);
  const bundledTemplateExists = fs.pathExistsSync(srcDir);
  const method: ScaffoldMethod = useDevRepo
    ? 'dev'
    : bundledTemplateExists
      ? 'bundled-template'
      : 'degit';

  if (method === 'bundled-template') {
    fs.copySync(srcDir, projectDir);
    return;
  }

  if (method === 'dev') {
    const repoFolder = process.env.INSTANT_REPO_FOLDER;
    if (!repoFolder) {
      throw new Error(
        'INSTANT_REPO_FOLDER is required when using repo-examples scaffolding.',
      );
    }

    const folder = path.join(repoFolder, 'examples', baseTemplateName);
    await copyRespectingGitignore(folder, projectDir);
    return;
  }

  if (process.env.INSTANT_CLI_DEV && !process.env.INSTANT_REPO_FOLDER) {
    UI.log(
      chalk.bold.yellowBright(
        'WARNING: INSTANT_CLI_DEV is TRUE but no INSTANT_REPO_FOLDER is set. \nUsing git to clone from main...',
      ),
      UI.ciaModifier(null),
    );
  }

  await scaffoldWithDegit({ projectDir, baseTemplateName });
};
