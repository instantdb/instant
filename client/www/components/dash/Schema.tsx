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
import { addInstantLibs } from '@/lib/monaco';

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
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div className="flex min-h-0 flex-col gap-4 border-r p-4 text-sm md:text-base lg:basis-96 dark:border-r-neutral-600">
        <SectionHeading>Schema</SectionHeading>
        <p>This is the schema for your app in code form.</p>
        <p>
          We recommend you use the{' '}
          <code className="tracking-tight">instant-cli</code> to push and pull
          changes to your schema:
        </p>
        <p>
          <div className="overflow-auto rounded-sm border bg-white text-sm dark:border-neutral-600 dark:bg-neutral-800">
            <Fence
              copyable
              code={`npx instant-cli@latest pull`}
              language="bash"
            />
          </div>
        </p>
        <p>
          <a
            className="flex items-baseline gap-1 underline"
            target="_blank"
            href="https://www.instantdb.com/docs/modeling-data#schema-as-code"
          >
            Learn more in the docs
            <ArrowTopRightOnSquareIcon className="h-3 w-3" />
          </a>
        </p>
      </div>
      <div className="flex w-full flex-1 flex-col justify-start">
        <div className="flex items-center justify-between gap-4 border-b bg-gray-50 px-4 py-2 dark:border-b-neutral-600 dark:bg-neutral-800">
          <div className="font-mono text-sm">instant.schema.ts</div>

          <div className="flex items-center gap-2">
            <Label>Package</Label>
            <Select
              value={pkg}
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
        <div className="grow">
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
