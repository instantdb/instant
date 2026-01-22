import path from 'path';
import fs from 'fs-extra';
import degit from 'degit';
import { Project } from './cli.js';
import chalk from 'chalk';
import { getUserPkgManager } from './utils/getUserPkgManager.js';
import { renderUnwrap, UI } from 'instant-cli/ui';
import slugify from 'slugify';
import ignore from 'ignore';

export const scaffoldBaseAndEdit = async (
  cliResults: Project,
  appDir: string,
) => {
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

  await scaffoldBaseCode({
    projectDir,
    baseTemplateName: cliResults.base,
  });

  if (fs.pathExistsSync(path.join(projectDir, 'pnpm-lock.yaml'))) {
    fs.removeSync(path.join(projectDir, 'pnpm-lock.yaml'));
  }

  if (fs.pathExistsSync(path.join(projectDir, '.env.example'))) {
    fs.copyFileSync(
      path.join(projectDir, '.env.example'),
      path.join(projectDir, '.env'),
    );
  }

  if (getUserPkgManager() === 'pnpm' && cliResults.base === 'expo') {
    fs.appendFile(
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

  const scaffoldedName =
    cliResults.appName === '.'
      ? 'App'
      : chalk.hex('#EA570B').bold(cliResults.appName);

  UI.log(
    chalk.dim(`${scaffoldedName} scaffolded successfully!`),
    UI.ciaModifier(null),
  );

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
  const degitInstance = degit(repoPath);
  await degitInstance.clone(projectDir);
};

/**
 * Copies files from src to dest, respecting .gitignore rules.
 * Only used for local development. In production, the folder will be cloned from github
 */
async function copyRespectingGitignore(src: string, dest: string) {
  const gitignorePath = path.join(src, '.gitignore');

  const ig = ignore();

  // Always ignore .git folder
  ig.add('.git');

  try {
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
  // Copy files in dev mode
  if (process.env.INSTANT_CLI_DEV && process.env.INSTANT_REPO_FOLDER) {
    const folder = path.join(
      process.env.INSTANT_REPO_FOLDER,
      'examples',
      baseTemplateName,
    );
    await copyRespectingGitignore(folder, projectDir);
    return;
  }

  if (process.env.INSTANT_CLI_DEV) {
    UI.log(
      chalk.bold.yellowBright(
        'WARNING: INSTANT_CLI_DEV is TRUE but no INSTANT_REPO_FOLDER is set. \nUsing git to clone from main...',
      ),
      UI.ciaModifier(null),
    );
  }

  // Clone from github in prod
  await scaffoldWithDegit({ projectDir, baseTemplateName: baseTemplateName });
};
