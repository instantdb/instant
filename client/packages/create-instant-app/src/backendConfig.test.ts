import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { afterEach, describe, expect, it } from 'vitest';
import { applyBackendConfig, websocketURIFromAPIURI } from './backendConfig.js';
import { projectBaseConfig, projectBases } from './projectBase.js';

const tempDirs: string[] = [];
const examplesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../examples',
);

const createTempDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'backend-config-'));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.removeSync(dir);
  }
});

describe('websocketURIFromAPIURI', () => {
  it.each([
    ['http://localhost:8888', 'ws://localhost:8888/runtime/session'],
    ['https://instant.example', 'wss://instant.example/runtime/session'],
    [
      'https://instant.example/backend/',
      'wss://instant.example/backend/runtime/session',
    ],
  ])('derives a websocket URI from %s', (apiURI, expected) => {
    expect(websocketURIFromAPIURI(apiURI)).toBe(expected);
  });

  it('rejects non-HTTP URIs', () => {
    expect(() => websocketURIFromAPIURI('ftp://instant.example')).toThrow(
      'INSTANT_CLI_API_URI must be a valid HTTP(S) URL',
    );
  });

  it('rejects malformed URIs', () => {
    expect(() => websocketURIFromAPIURI('instant.example')).toThrow(
      'INSTANT_CLI_API_URI must be a valid HTTP(S) URL',
    );
  });
});

describe('applyBackendConfig', () => {
  it('adds API and websocket URIs to a client init', () => {
    const dir = createTempDir();
    const filePath = path.join(dir, 'src/lib/db.ts');
    fs.outputFileSync(
      filePath,
      'export const db = init({\n  appId: "app-id",\n});\n',
    );

    applyBackendConfig('next-js-app-dir', dir, 'http://localhost:8888/');

    expect(fs.readFileSync(filePath, 'utf8')).toBe(
      'export const db = init({\n' +
        '  apiURI: "http://localhost:8888",\n' +
        '  websocketURI: "ws://localhost:8888/runtime/session",\n' +
        '  appId: "app-id",\n' +
        '});\n',
    );
    expect(fs.readFileSync(path.join(dir, 'instant.config.ts'), 'utf8')).toBe(
      `export default {
  apiURI: "http://localhost:8888",
};
`,
    );
  });

  it('adds the dashboard URI to instant.config.ts when provided', () => {
    const dir = createTempDir();
    const filePath = path.join(dir, 'src/lib/db.ts');
    fs.outputFileSync(filePath, 'export const db = init({\n});\n');

    applyBackendConfig(
      'next-js-app-dir',
      dir,
      'https://api.instant.example',
      'https://dash.instant.example',
    );

    expect(fs.readFileSync(path.join(dir, 'instant.config.ts'), 'utf8')).toBe(
      `export default {
  apiURI: "https://api.instant.example",
  dashURI: "https://dash.instant.example",
};
`,
    );
  });

  it('adds only the API URI to admin init', () => {
    const dir = createTempDir();
    const clientPath = path.join(dir, 'src/lib/db.ts');
    const adminPath = path.join(dir, 'src/lib/adminDb.ts');
    fs.outputFileSync(clientPath, 'export const db = init({\n});\n');
    fs.outputFileSync(adminPath, 'export const adminDb = init({\n});\n');

    applyBackendConfig('tanstack-start', dir, 'https://instant.example');

    expect(fs.readFileSync(adminPath, 'utf8')).toContain(
      'init({\n  apiURI: "https://instant.example",\n',
    );
    expect(fs.readFileSync(adminPath, 'utf8')).not.toContain('websocketURI');
  });

  it('does not update any files if a template cannot be configured', () => {
    const dir = createTempDir();
    const clientPath = path.join(dir, 'src/lib/db.ts');
    const adminPath = path.join(dir, 'src/lib/adminDb.ts');
    const clientContents = 'export const db = init({\n});\n';
    fs.outputFileSync(clientPath, clientContents);
    fs.outputFileSync(adminPath, 'export const adminDb = unknownInit({});\n');

    expect(() =>
      applyBackendConfig('tanstack-start', dir, 'https://instant.example'),
    ).toThrow('Could not find init({ in scaffolded database file');
    expect(fs.readFileSync(clientPath, 'utf8')).toBe(clientContents);
    expect(fs.pathExistsSync(path.join(dir, 'instant.config.ts'))).toBe(false);
  });

  it('configures the Python client', () => {
    const dir = createTempDir();
    const filePath = path.join(dir, 'main.py');
    fs.outputFileSync(filePath, 'db = Instant()\n');

    applyBackendConfig('python-script', dir, 'https://instant.example/');

    expect(fs.readFileSync(filePath, 'utf8')).toBe(
      'db = Instant(api_uri="https://instant.example")\n',
    );
  });
});

describe('project base backend config', () => {
  it.each(projectBases)('%s matches its example template', (base) => {
    for (const file of projectBaseConfig[base].backendConfigFiles) {
      const contents = fs.readFileSync(
        path.join(examplesDir, base, file.path),
        'utf8',
      );
      const initializer =
        file.type === 'python' ? 'db = Instant()' : `${file.initializer}({`;

      expect(contents).toContain(initializer);
    }
  });
});
