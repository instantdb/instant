// ---------------------------------------------------------------------------
// CEL environment matching Instant's server (cel.clj)
//
// Lazily initialized — the @marcbachmann/cel-js module only loads
// when getCelEnv() is first called.
//
// Server adds these extensions via CelExtensions:
//   - bindings: cel.bind() — built-in to cel-js
//   - strings: charAt, indexOf, join, lastIndexOf, lowerAscii, replace,
//              split, substring, trim, upperAscii
//   - math: greatest, least, ceil, floor, round, trunc, abs, sign, sqrt,
//           isInf, isNaN, isFinite
//
// Custom functions (matching server):
//   - ref(map, string): list — graph traversal
//   - getTime(timestamp): int — epoch seconds
//
// Variables (matching server action compilers):
//   - auth, data, newData, linkedData, ruleParams, request
// ---------------------------------------------------------------------------

export interface CelError {
  message: string;
  column?: number;
}

export function parseCelError(e: unknown): CelError {
  if (!(e instanceof Error)) return { message: 'eval error' };
  const msg = e.message;
  const lines = msg.split('\n');
  const messageLine = lines[0].trim();

  const srcLine = lines.find((l) => /^\s*>\s+\d+\s*\|/.test(l));
  const caretLine = lines.find((l) => l.includes('^') && !/[|>]/.test(l));

  let column: number | undefined;
  if (srcLine && caretLine) {
    const pipeIdx = srcLine.indexOf('|');
    const exprStart = pipeIdx + 2;
    const caretPos = caretLine.indexOf('^');
    column = caretPos - exprStart;
  }

  return {
    message: messageLine,
    column: column != null && column >= 0 ? column : undefined,
  };
}

export function makeRefable(
  userId: string,
  refData: Record<string, Record<string, unknown[]>>,
  fields: Record<string, unknown>,
) {
  return {
    ...fields,
    _refData: refData[userId] ?? {},
  };
}

// ---------------------------------------------------------------------------
// Lazy singleton
// ---------------------------------------------------------------------------

type CelEnv = {
  evaluate: (expr: string, ctx: Record<string, unknown>) => unknown;
};

let _celEnv: CelEnv | null = null;

export async function getCelEnv(): Promise<CelEnv> {
  if (_celEnv) return _celEnv;

  const { Environment } = await import('@marcbachmann/cel-js');

  function toNum(v: unknown): number {
    return typeof v === 'bigint' ? Number(v) : (v as number);
  }

  const env = new Environment({ unlistedVariablesAreDyn: true })
    .registerVariable('auth', 'map')
    .registerVariable('data', 'map')
    .registerVariable('newData', 'map')
    .registerVariable('linkedData', 'map')
    .registerVariable('ruleParams', 'map')
    .registerVariable('request', 'map');

  // --- strings extension (fill gaps) ---

  env.registerFunction({
    name: 'charAt',
    receiverType: 'string',
    returnType: 'string',
    handler: (s: string, i: bigint) => s.charAt(Number(i)),
    params: [{ name: 'index', type: 'int' }],
  });

  env.registerFunction({
    name: 'replace',
    receiverType: 'string',
    returnType: 'string',
    handler: (s: string, from: string, to: string) => s.split(from).join(to),
    params: [
      { name: 'from', type: 'string' },
      { name: 'to', type: 'string' },
    ],
  });

  env.registerFunction({
    name: 'replace',
    receiverType: 'string',
    returnType: 'string',
    handler: (s: string, from: string, to: string, limit: bigint) => {
      const n = Number(limit);
      let result = s;
      for (let i = 0; i < n; i++) {
        const idx = result.indexOf(from);
        if (idx === -1) break;
        result = result.slice(0, idx) + to + result.slice(idx + from.length);
      }
      return result;
    },
    params: [
      { name: 'from', type: 'string' },
      { name: 'to', type: 'string' },
      { name: 'limit', type: 'int' },
    ],
  });

  // --- math extension via custom Math type ---

  env.registerType('Math', { fields: {} });
  env.registerVariable('math', 'Math');

  // math.greatest / math.least — 2 to 8 args
  for (let arity = 2; arity <= 8; arity++) {
    const params = Array.from({ length: arity }, (_, i) => ({
      name: `v${i}`,
      type: 'dyn' as const,
    }));
    env.registerFunction({
      name: 'greatest',
      receiverType: 'Math',
      returnType: 'dyn',
      handler: (_: unknown, ...args: unknown[]) =>
        args.reduce((m, v) => (toNum(v) > toNum(m) ? v : m))!,
      params,
    });
    env.registerFunction({
      name: 'least',
      receiverType: 'Math',
      returnType: 'dyn',
      handler: (_: unknown, ...args: unknown[]) =>
        args.reduce((m, v) => (toNum(v) < toNum(m) ? v : m))!,
      params,
    });
  }

  // math.ceil, floor, round, trunc
  for (const [name, fn] of [
    ['ceil', Math.ceil],
    ['floor', Math.floor],
    ['round', Math.round],
    ['trunc', Math.trunc],
  ] as const) {
    env.registerFunction({
      name,
      receiverType: 'Math',
      returnType: 'double',
      handler: (_: unknown, v: unknown) => fn(toNum(v)),
      params: [{ name: 'v', type: 'double' }],
    });
  }

  // math.abs
  env.registerFunction({
    name: 'abs',
    receiverType: 'Math',
    returnType: 'dyn',
    handler: (_: unknown, v: unknown) =>
      typeof v === 'bigint' ? (v < 0n ? -v : v) : Math.abs(toNum(v)),
    params: [{ name: 'v', type: 'dyn' }],
  });

  // math.sign
  env.registerFunction({
    name: 'sign',
    receiverType: 'Math',
    returnType: 'dyn',
    handler: (_: unknown, v: unknown) =>
      typeof v === 'bigint'
        ? v < 0n
          ? -1n
          : v > 0n
            ? 1n
            : 0n
        : Math.sign(toNum(v)),
    params: [{ name: 'v', type: 'dyn' }],
  });

  // math.sqrt
  env.registerFunction({
    name: 'sqrt',
    receiverType: 'Math',
    returnType: 'double',
    handler: (_: unknown, v: unknown) => Math.sqrt(toNum(v)),
    params: [{ name: 'v', type: 'dyn' }],
  });

  // math.isInf, isNaN, isFinite
  env.registerFunction({
    name: 'isInf',
    receiverType: 'Math',
    returnType: 'bool',
    handler: (_: unknown, v: unknown) =>
      !isFinite(toNum(v)) && !isNaN(toNum(v)),
    params: [{ name: 'v', type: 'double' }],
  });
  env.registerFunction({
    name: 'isNaN',
    receiverType: 'Math',
    returnType: 'bool',
    handler: (_: unknown, v: unknown) => isNaN(toNum(v)),
    params: [{ name: 'v', type: 'double' }],
  });
  env.registerFunction({
    name: 'isFinite',
    receiverType: 'Math',
    returnType: 'bool',
    handler: (_: unknown, v: unknown) => isFinite(toNum(v)),
    params: [{ name: 'v', type: 'double' }],
  });

  // --- Instant custom functions ---

  // ref() — graph traversal
  env.registerFunction({
    name: 'ref',
    receiverType: 'map',
    returnType: 'list',
    handler: (obj: Record<string, unknown>, path: string) => {
      const refData = obj._refData as Record<string, unknown[]> | undefined;
      return refData?.[path] ?? [];
    },
    params: [{ name: 'path', type: 'string' }],
  });

  // getTime() — epoch seconds
  env.registerFunction({
    name: 'getTime',
    receiverType: 'dyn',
    returnType: 'int',
    handler: (t: Date) => BigInt(Math.floor(t.getTime() / 1000)),
    params: [],
  });

  _celEnv = env;
  return env;
}
