import { Monaco } from '@monaco-editor/react';
import { useId } from 'react';
import { useEffect } from 'react';

export function useMonacoJSONSchema(
  path: string,
  monaco?: Monaco,
  schema?: object,
) {
  const id = useId();
  useEffect(() => {
    if (!monaco || !schema) return;
    const schemaUri = `http://myserver/myJsonTypeSchema-${id}`;

    const diagnosticOptions =
      monaco.languages.json.jsonDefaults.diagnosticsOptions;
    const currentSchemas = diagnosticOptions.schemas || [];

    monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
      ...diagnosticOptions,
      schemas: [
        ...currentSchemas,
        {
          uri: schemaUri,
          fileMatch: [path],
          schema: schema,
        },
      ],
    });

    return () => {
      const currentOptions =
        monaco.languages.json.jsonDefaults.diagnosticsOptions;
      const currentSchemas = currentOptions.schemas || [];
      monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
        ...currentOptions,
        schemas: currentSchemas.filter((s) => s.uri !== schemaUri),
      });
    };
  }, [monaco, path, schema, id]);
}
