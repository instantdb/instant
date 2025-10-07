import { Monaco } from '@monaco-editor/react';
import { version } from '@instantdb/core';

const bareVersion = version.replace(/^v/, '');

export async function addInstantLibs(monaco: Monaco) {
  const files = [
    'index.d.ts',
    'schema.d.ts',
    'queryTypes.d.ts',
    'schemaTypes.d.ts',
    'presence.d.ts',
    'instatx.d.ts',
  ];

  const fileContents = await Promise.all(
    files.map(async (file) => {
      const content = await fetch(
        `https://unpkg.com/@instantdb/core@${bareVersion}/dist/esm/${file}`,
      ).then((r) => r.text());
      return { file, content };
    }),
  );

  monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
    target: monaco.languages.typescript.ScriptTarget.ESNext,
    module: monaco.languages.typescript.ModuleKind.ESNext,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs, // Node-style lookup
    baseUrl: 'file:///', // virtual project root
    ...monaco.languages.typescript.typescriptDefaults.getCompilerOptions(),

    paths: {
      '@instantdb/core': ['file:///node_modules/@instantdb/core/index.d.ts'],
      '@instantdb/admin': ['file:///node_modules/@instantdb/admin/index.d.ts'],
      '@instantdb/react': ['file:///node_modules/@instantdb/react/index.d.ts'],
      '@instantdb/react-native': [
        'file:///node_modules/@instantdb/react-native/index.d.ts',
      ],
    },
  });

  for (const { file, content } of fileContents) {
    monaco.languages.typescript.typescriptDefaults.addExtraLib(
      content,
      `file:///node_modules/@instantdb/core/${file}`,
    );
    monaco.languages.typescript.typescriptDefaults.addExtraLib(
      content,
      `file:///node_modules/@instantdb/admin/${file}`,
    );
    monaco.languages.typescript.typescriptDefaults.addExtraLib(
      content,
      `file:///node_modules/@instantdb/react/${file}`,
    );
    monaco.languages.typescript.typescriptDefaults.addExtraLib(
      content,
      `file:///node_modules/@instantdb/react-native/${file}`,
    );
  }
}
