/** Minimal test framework for smoke tests. */

export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  durationMs: number;
}

export interface TestSuite {
  name: string;
  results: TestResult[];
}

const suites: TestSuite[] = [];
let currentSuite: TestSuite | null = null;

export function describe(name: string, fn: () => void | Promise<void>) {
  currentSuite = { name, results: [] };
  suites.push(currentSuite);
  return Promise.resolve(fn()).then(() => {
    currentSuite = null;
  });
}

export async function it(name: string, fn: () => Promise<void>, timeoutMs = 15000) {
  const start = Date.now();
  const suite = currentSuite!;
  try {
    await Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs),
      ),
    ]);
    suite.results.push({ name, passed: true, durationMs: Date.now() - start });
  } catch (e: any) {
    suite.results.push({
      name,
      passed: false,
      error: e.message || String(e),
      durationMs: Date.now() - start,
    });
  }
}

export function expect(actual: any) {
  return {
    toBe(expected: any) {
      if (actual !== expected) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    },
    toEqual(expected: any) {
      if (JSON.stringify(actual) !== JSON.stringify(expected))
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    },
    toBeTruthy() {
      if (!actual) throw new Error(`Expected truthy, got ${JSON.stringify(actual)}`);
    },
    toBeFalsy() {
      if (actual) throw new Error(`Expected falsy, got ${JSON.stringify(actual)}`);
    },
    toBeGreaterThan(n: number) {
      if (!(actual > n)) throw new Error(`Expected ${actual} > ${n}`);
    },
    toBeGreaterThanOrEqual(n: number) {
      if (!(actual >= n)) throw new Error(`Expected ${actual} >= ${n}`);
    },
    toBeDefined() {
      if (actual === undefined || actual === null) throw new Error(`Expected defined, got ${actual}`);
    },
    toBeUndefined() {
      if (actual !== undefined && actual !== null) throw new Error(`Expected undefined, got ${JSON.stringify(actual)}`);
    },
    toContain(item: any) {
      if (typeof actual === 'string') {
        if (!actual.includes(item)) throw new Error(`Expected "${actual}" to contain "${item}"`);
      } else if (Array.isArray(actual)) {
        if (!actual.includes(item)) throw new Error(`Expected array to contain ${JSON.stringify(item)}`);
      } else {
        throw new Error(`toContain requires string or array`);
      }
    },
    toHaveLength(n: number) {
      if (actual?.length !== n) throw new Error(`Expected length ${n}, got ${actual?.length}`);
    },
    toHaveProperty(key: string) {
      if (!(key in actual)) throw new Error(`Expected property "${key}" in ${JSON.stringify(actual)}`);
    },
  };
}

export function printResults(): boolean {
  let totalPassed = 0;
  let totalFailed = 0;

  for (const suite of suites) {
    console.log(`\n  ${suite.name}`);
    for (const r of suite.results) {
      if (r.passed) {
        totalPassed++;
        console.log(`    \x1b[32m✓\x1b[0m ${r.name} \x1b[90m(${r.durationMs}ms)\x1b[0m`);
      } else {
        totalFailed++;
        console.log(`    \x1b[31m✗\x1b[0m ${r.name} \x1b[90m(${r.durationMs}ms)\x1b[0m`);
        console.log(`      \x1b[31m${r.error}\x1b[0m`);
      }
    }
  }

  console.log(`\n  \x1b[32m${totalPassed} passing\x1b[0m`);
  if (totalFailed > 0) console.log(`  \x1b[31m${totalFailed} failing\x1b[0m`);
  console.log('');

  return totalFailed === 0;
}

export function getSuites() {
  return suites;
}
