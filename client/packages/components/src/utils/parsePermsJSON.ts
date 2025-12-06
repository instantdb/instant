import JsonParser from 'json5';

// parse string as json5, returning the object,
// boolean values will be converted to strings
// return a normal json string
export const parsePermsJSON = (text: string): Result<string> => {
  const parseResult = doTry(() =>
    JsonParser.parse(text, (_key, value) => {
      if (value === true) {
        return 'true';
      } else if (value === false) {
        return 'false';
      } else {
        return value;
      }
    }),
  );
  return parseResult;
};

export const doTry = <T>(fn: () => T): Result<T> => {
  try {
    const value = fn();
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
