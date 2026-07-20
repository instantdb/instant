const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

// Find the project and workspace directories
const projectRoot = __dirname;
// This can be replaced with `find-yarn-workspace-root`
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch all files within the monorepo
config.watchFolders = [workspaceRoot];
// 2. Let Metro know where to resolve packages and in what order
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// (XXX): Below is what is recommended by the expo docs but it doesn't work
// since v49 (see: https://docs.expo.dev/guides/monorepos/#using-the-package)
// 3. Force Metro to resolve (sub)dependencies only from the `nodeModulesPaths`
// config.resolver.disableHierarchicalLookup = true;

// So instead we do this per https://github.com/expo/expo/issues/17261#issuecomment-1681206857
config.resolver.disableHierarchicalLookup = false;

// 4. Our storage adapters (@instantdb/react-native-mmkv, @instantdb/expo-sqlite) take
// their native module as a peerDependency, but also keep a devDependency copy of it to
// typecheck against. In the workspace those copies are symlinked into the adapter, so
// Metro resolves them instead of this app's, and we end up bundling a second react-native.
// Resolve them from the app so there's only ever one copy.
const singletonModules = ['expo-sqlite', 'react-native-mmkv'];
const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = defaultResolveRequest ?? context.resolveRequest;
  const isSingleton = singletonModules.some(
    (m) => moduleName === m || moduleName.startsWith(`${m}/`),
  );
  if (isSingleton) {
    return resolve(
      { ...context, originModulePath: path.join(projectRoot, 'package.json') },
      moduleName,
      platform,
    );
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;
