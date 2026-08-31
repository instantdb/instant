import fs from 'fs-extra';
import path from 'path';
import {
  projectBaseConfig,
  type BackendConfigFile,
  type ProjectBase,
} from './projectBase.js';

const normalizeAPIURI = (apiURI: string) => apiURI.replace(/\/+$/, '');

const instantConfigContents = (apiURI: string, dashURI?: string) => {
  const entries = [
    `  apiURI: ${JSON.stringify(apiURI)},`,
    dashURI ? `  dashURI: ${JSON.stringify(dashURI)},` : null,
  ]
    .filter(Boolean)
    .join('\n');

  return `export default {\n${entries}\n};\n`;
};

export const websocketURIFromAPIURI = (apiURI: string) => {
  let websocketURI: URL;
  try {
    websocketURI = new URL(normalizeAPIURI(apiURI));
  } catch {
    throw new Error('INSTANT_CLI_API_URI must be a valid HTTP(S) URL');
  }

  if (websocketURI.protocol === 'http:') {
    websocketURI.protocol = 'ws:';
  } else if (websocketURI.protocol === 'https:') {
    websocketURI.protocol = 'wss:';
  } else {
    throw new Error('INSTANT_CLI_API_URI must be a valid HTTP(S) URL');
  }

  websocketURI.pathname = `${websocketURI.pathname.replace(/\/+$/, '')}/runtime/session`;
  websocketURI.search = '';
  websocketURI.hash = '';

  return websocketURI.toString();
};

const injectInitConfig = ({
  contents,
  initializer,
  apiURI,
  websocketURI,
  dashURI,
}: {
  contents: string;
  initializer: string;
  apiURI: string;
  websocketURI?: string;
  dashURI?: string;
}) => {
  const initStart = `${initializer}({`;
  if (!contents.includes(initStart)) {
    throw new Error(`Could not find ${initStart} in scaffolded database file`);
  }

  const config = [
    `  apiURI: ${JSON.stringify(apiURI)},`,
    websocketURI ? `  websocketURI: ${JSON.stringify(websocketURI)},` : null,
    dashURI
      ? `  devtool: {\n    dashURI: ${JSON.stringify(dashURI)},\n  },`
      : null,
  ]
    .filter(Boolean)
    .join('\n');

  return contents.replace(initStart, `${initStart}\n${config}`);
};

const injectPythonConfig = (contents: string, apiURI: string) => {
  const initStart = 'db = Instant()';
  if (!contents.includes(initStart)) {
    throw new Error(`Could not find ${initStart} in scaffolded database file`);
  }

  return contents.replace(
    initStart,
    `db = Instant(api_uri=${JSON.stringify(apiURI)})`,
  );
};

const injectBackendConfig = (
  file: BackendConfigFile,
  contents: string,
  apiURI: string,
  websocketURI: string,
  dashURI?: string,
) => {
  if (file.type === 'python') {
    return injectPythonConfig(contents, apiURI);
  }

  return injectInitConfig({
    contents,
    initializer: file.initializer,
    apiURI,
    websocketURI: file.websocket ? websocketURI : undefined,
    dashURI: file.injectDevtoolConfig ? dashURI : undefined,
  });
};

export const applyBackendConfig = (
  base: ProjectBase,
  projectDir: string,
  apiURI: string,
  dashURI?: string,
) => {
  const normalizedAPIURI = normalizeAPIURI(apiURI);
  const websocketURI = websocketURIFromAPIURI(normalizedAPIURI);

  const updates = projectBaseConfig[base].backendConfigFiles.map((file) => {
    const filePath = path.join(projectDir, file.path);
    const contents = fs.readFileSync(filePath, 'utf8');
    return {
      filePath,
      contents: injectBackendConfig(
        file,
        contents,
        normalizedAPIURI,
        websocketURI,
        dashURI,
      ),
    };
  });

  for (const update of updates) {
    fs.writeFileSync(update.filePath, update.contents);
  }

  fs.writeFileSync(
    path.join(projectDir, 'instant.config.ts'),
    instantConfigContents(normalizedAPIURI, dashURI),
  );
};
