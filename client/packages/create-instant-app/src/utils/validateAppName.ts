import pathModule from 'path';

const removeTrailingSlash = (input: string) => {
  if (input.length > 1 && input.endsWith('/')) {
    input = input.slice(0, -1);
  }

  return input;
};

const validationRegExp =
  /^(?:@[a-z0-9-*~][a-z0-9-*._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

export const parseNameAndPath = (rawInput: string) => {
  const input = removeTrailingSlash(rawInput);

  const paths = input.split('/');

  let appName = paths[paths.length - 1]!;

  if (appName === '.') {
    const parsedCwd = pathModule.resolve(process.cwd());
    appName = pathModule.basename(parsedCwd);
  }

  // If the first part is a @, it's a scoped package
  const indexOfDelimiter = paths.findIndex((p) => p.startsWith('@'));
  if (paths.findIndex((p) => p.startsWith('@')) !== -1) {
    appName = paths.slice(indexOfDelimiter).join('/');
  }

  const path = paths.filter((p) => !p.startsWith('@')).join('/');

  return [appName, path] as const;
};

/** Validate a string against allowed package.json names */
export const validateAppName = (rawInput: string): string | undefined => {
  const input = removeTrailingSlash(rawInput);
  const paths = input.split('/');

  // If the first part is a @, it's a scoped package
  const indexOfDelimiter = paths.findIndex((p) => p.startsWith('@'));

  let appName = paths[paths.length - 1];
  if (paths.findIndex((p) => p.startsWith('@')) !== -1) {
    appName = paths.slice(indexOfDelimiter).join('/');
  }

  if (input === '.' || validationRegExp.test(appName ?? '')) {
    return undefined;
  } else {
    return "App name must consist of only lowercase alphanumeric characters, '-', and '_'";
  }
};
