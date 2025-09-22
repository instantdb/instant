import {
  CodeEditor,
  Fence,
  Label,
  SectionHeading,
  Select,
} from '@/components/ui';
import { DBAttr } from '@/lib/types';
import {
  apiSchemaToInstantSchemaDef,
  generateSchemaTypescriptFile,
} from '@instantdb/platform';
import { Monaco } from '@monaco-editor/react';
import { useState } from 'react';

import { attrsToSchema } from '@/lib/schema';
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';

async function addInstantLibs(monaco: Monaco) {
  const files = [
    'index.d.ts',
    'schema.d.ts',
    'schemaTypes.d.ts',
    'presence.d.ts',
  ];

  const fileContents = await Promise.all(
    files.map(async (file) => {
      const content = await fetch(
        `https://unpkg.com/@instantdb/core@latest/dist/esm/${file}`,
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

type Pkg =
  | '@instantdb/core'
  | '@instantdb/react'
  | '@instantdb/react-native'
  | '@instantdb/admin';

function attrsToTsFile(attrs: Record<string, DBAttr>, pkg: Pkg) {
  const schema = apiSchemaToInstantSchemaDef(
    attrsToSchema(Object.values(attrs)),
  );

  return generateSchemaTypescriptFile(schema, schema, pkg);
}

export function Schema({ attrs }: { attrs: Record<string, DBAttr> | null }) {
  const [pkg, setPkg] = useState<
    | '@instantdb/core'
    | '@instantdb/admin'
    | '@instantdb/react'
    | '@instantdb/react-native'
  >('@instantdb/core');

  const onMount = (_editor: any, monaco: Monaco) => {
    addInstantLibs(monaco);
  };

  return (
    <div className="flex flex-1 flex-col lg:flex-row min-h-0">
      <div className="flex flex-col gap-4 border-r p-4 text-sm lg:basis-96 md:text-base min-h-0">
        <SectionHeading>Schema</SectionHeading>
        <p>This is the schema for your app in code form.</p>
        <p>
          We recommend you use the{' '}
          <code className="tracking-tight">instant-cli</code> to push and pull
          changes to your schema:
        </p>
        <p>
          <div className="border rounded text-sm overflow-auto">
            <Fence
              copyable
              code={`npx instant-cli@latest pull`}
              language="bash"
            />
          </div>
        </p>
        <p>
          <a
            className="underline flex gap-1 items-baseline"
            target="_blank"
            href="https://www.instantdb.com/docs/modeling-data#schema-as-code"
          >
            Learn more in the docs
            <ArrowTopRightOnSquareIcon className="h-3 w-3" />
          </a>
        </p>
      </div>
      <div className="flex w-full flex-1 flex-col justify-start">
        <div className="flex items-center justify-between gap-4 border-b px-4 py-2">
          <div className="font-mono text-sm font-[600]">instant.schema.ts</div>

          <div className="flex gap-2 items-center">
            <Label>Package</Label>
            <Select<Pkg>
              options={[
                { label: '@instantdb/core', value: '@instantdb/core' },
                { label: '@instantdb/react', value: '@instantdb/react' },
                {
                  label: '@instantdb/react-native',
                  value: '@instantdb/react-native',
                },
                { label: '@instantdb/admin', value: '@instantdb/admin' },
              ]}
              onChange={(o) => {
                if (o) {
                  setPkg(o.value);
                }
              }}
            />
          </div>
        </div>
        <div className="flex-grow">
          <CodeEditor
            readOnly={true}
            onChange={() => null}
            language="typescript"
            value={
              attrs ? attrsToTsFile(attrs, pkg) : '/* Loading schema... */'
            }
            onMount={onMount}
          />
        </div>
      </div>
    </div>
  );
}
