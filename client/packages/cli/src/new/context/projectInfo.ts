import { Context, Data, Effect, Layer } from 'effect';
import { detect } from 'package-manager-detector/detect';
import { PackageJson, readPackage } from 'pkg-types';

import { exec } from 'child_process';
import { promisify } from 'util';
import { UI } from '../../ui/index.js';
import { findProjectDir } from '../../util/projectDir.js';
import { runUIEffect } from '../lib/ui.js';

export class ProjectInfo extends Context.Tag(
  'instant-cli/new/context/projectInfo',
)<
  ProjectInfo,
  {
    pkgDir: string;
    projectType: 'node' | 'deno';
    instantModuleName: string;
  }
>() {}

const execAsync = promisify(exec);

export const PACKAGE_ALIAS_AND_FULL_NAMES = {
  react: '@instantdb/react',
  'react-native': '@instantdb/react-native',
  core: '@instantdb/core',
  admin: '@instantdb/admin',
};

export class ProjectInfoError extends Data.TaggedError('ProjectInfoError')<{
  message: string;
  cause?: unknown;
}> {}

const getProjectInfo = (
  coerce: boolean = true,
  packageName?: keyof typeof PACKAGE_ALIAS_AND_FULL_NAMES,
) =>
  Effect.gen(function* () {
    const projectDir = yield* Effect.tryPromise({
      try: () => findProjectDir(),
      catch: (e) =>
        new ProjectInfoError({ message: "Couldn't get project dir" }),
    });

    if (!projectDir) {
      return yield* new ProjectInfoError({
        message: "Couldn't find a project directory (package.json)",
      });
    }

    if (projectDir.type === 'deno') {
      return {
        pkgDir: projectDir.dir,
        projectType: projectDir.type,
        instantModuleName: '@instantdb/core',
      };
    }

    const pkgJson = yield* Effect.tryPromise({
      try: () => readPackage(),
      catch: () =>
        new ProjectInfoError({ message: "Couldn't read package.json" }),
    });

    let moduleName = getInstantModuleName(pkgJson);
    if (!moduleName && !coerce) {
      return yield* new ProjectInfoError({
        message: 'No instant client library installed',
      });
    }

    // TODO: Clean up with option
    const packageManager = yield* Effect.tryPromise(() => detect()).pipe(
      Effect.flatMap(Effect.fromNullable),
      Effect.mapError(
        () =>
          new ProjectInfoError({
            message: 'Failed to detect package manager',
          }),
      ),
    );

    if (!moduleName && coerce) {
      // install the packages
      if (packageName) {
        moduleName = PACKAGE_ALIAS_AND_FULL_NAMES[packageName];
      } else {
        moduleName = yield* runUIEffect(
          new UI.Select({
            promptText: 'Which package would you like to use?',
            options: [
              { label: '@instantdb/react', value: '@instantdb/react' },
              {
                label: '@instantdb/react-native',
                value: '@instantdb/react-native',
              },
              { label: '@instantdb/core', value: '@instantdb/core' },
              { label: '@instantdb/admin', value: '@instantdb/admin' },
            ],
          }),
        ).pipe(
          Effect.flatMap(Effect.fromNullable),
          Effect.mapError(
            () =>
              new ProjectInfoError({
                message: 'Failed to select package',
              }),
          ),
        );
      }
      const packagesToInstall = [moduleName];
      if (moduleName === '@instantdb/react-native') {
        packagesToInstall.push(
          'react-native-get-random-values',
          '@react-native-async-storage/async-storage',
        );
      }
      const installCommand = getInstallCommand(
        packageManager.agent,
        packagesToInstall.join(' '),
      );
      console.log(installCommand);
      yield* runUIEffect(
        new UI.Spinner({
          promise: execAsync(installCommand, {
            cwd: projectDir.dir,
          }),
          errorText: 'Failed to install packages',
          workingText: `Installing ${packagesToInstall.join(', ')} using ${packageManager.agent}...`,
          doneText: `Installed ${packagesToInstall.join(', ')} using ${packageManager.agent}.`,
        }),
      );
      return {
        pkgDir: projectDir.dir,
        projectType: projectDir.type,
        instantModuleName: moduleName,
      };
    } else {
      return {
        pkgDir: projectDir.dir,
        projectType: projectDir.type,
        instantModuleName: moduleName!,
      };
    }
  });

export const ProjectInfoLive = (
  coerce: boolean = true,
  packageName?: keyof typeof PACKAGE_ALIAS_AND_FULL_NAMES,
) => Layer.effect(ProjectInfo, getProjectInfo(coerce, packageName));

function getInstantModuleName(pkgJson: PackageJson) {
  const deps = pkgJson.dependencies || {};
  const devDeps = pkgJson.devDependencies || {};
  const instantModuleName = [
    '@instantdb/react',
    '@instantdb/react-native',
    '@instantdb/core',
    '@instantdb/admin',
  ].find((name) => deps[name] || devDeps[name]);
  return instantModuleName;
}

function getInstallCommand(packageManager: string, moduleName: string) {
  if (packageManager === 'npm') {
    return `npm install ${moduleName}`;
  } else {
    return `${packageManager} add ${moduleName}`;
  }
}
