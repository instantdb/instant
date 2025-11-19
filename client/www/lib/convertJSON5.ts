import JsonParser from 'json5';

const detectIndent = (text: string): number => {
  const lines = text.split('\n');

  for (const line of lines) {
    if (line.startsWith(' ')) {
      return line.search(/\S/);
    }
  }

  return 2;
};

// if json5 parsing works, but normal JSON.parse doesn't,
// return a normal json string
export const convertJSON5 = async (text: string): Promise<string | null> => {
  const [json5Result, jsonResult] = await Promise.all([
    tryParse(() => JsonParser.parse(text)),
    tryParse(() => JSON.parse(text)),
  ]);

  if (json5Result.status === 'ok' && jsonResult.status === 'error') {
    const indent = detectIndent(text);
    const result = JSON.stringify(json5Result.value, null, indent);
    return result;
  }

  return null;
};

export const tryParse = async <T>(fn: () => T): Promise<Result<T>> => {
  try {
    const value = await fn();
    return { status: 'ok', value };
  } catch (error) {
    return { status: 'error', error: error as Error };
  }
};

type Result<T> =
  | { status: 'ok'; value: T }
  | {
      status: 'error';
      error: Error;
    };
