import path from 'path';
import fs from 'fs-extra';
import { PKG_ROOT } from './consts.js';
import { Project } from './cli.js';
import chalk from 'chalk';
import { getUserPkgManager } from './utils/getUserPkgManager.js';
import { renderUnwrap, UI } from 'instant-cli/ui';
import slugify from 'slugify';

export const scaffoldBase = async (cliResults: Project, appDir: string) => {
  const projectDir = path.resolve(process.cwd(), appDir);
  const srcDir = path.join(PKG_ROOT, `template/base/${cliResults.base}`);

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

  fs.copySync(srcDir, projectDir);
  fs.renameSync(
    path.join(projectDir, '_gitignore'),
    path.join(projectDir, '.gitignore'),
  );
  fs.renameSync(path.join(projectDir, '_env'), path.join(projectDir, '.env'));

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
