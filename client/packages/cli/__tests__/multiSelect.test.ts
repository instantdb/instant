import { test, expect, describe } from 'vitest';
import { UI } from '../src/ui/index.ts';

const key = (
  name: string,
  overrides: { ctrl?: boolean; meta?: boolean; shift?: boolean } = {},
) => ({
  sequence: name,
  name,
  ctrl: overrides.ctrl ?? false,
  meta: overrides.meta ?? false,
  shift: overrides.shift ?? false,
});

const space = key('space');
const down = key('down');
const up = key('up');
const pageDown = key('pagedown');
const pageUp = key('pageup');
const ret = key('return');
const esc = key('escape');
const back = key('backspace');
const ch = (c: string) => ({
  sequence: c,
  name: c,
  ctrl: false,
  meta: false,
  shift: false,
});

class FakeTerminal {
  resolved: { data: unknown; status: string } | null = null;
  toggleCursor(_state: 'hide' | 'show') {}
  requestLayout() {}
  setAllowInteraction(_v: boolean) {}
  resolve(value: any) {
    this.resolved = value;
  }
}

const setup = <T>(props: any) => {
  const ms = new UI.MultiSelect<T>(props);
  const term = new FakeTerminal();
  ms.attach(term as any);
  return { ms, term };
};

const strOpts = (...values: string[]) =>
  values.map((v) => ({ value: v, label: v }));

describe('MultiSelect navigation', () => {
  test('space toggles current item', () => {
    const { ms } = setup<string>({
      options: strOpts('a', 'b'),
      promptText: 'p',
    });
    ms.input(' ', space);
    expect(ms.result()).toEqual(['a']);
  });

  test('down moves cursor forward', () => {
    const { ms } = setup<string>({
      options: strOpts('a', 'b'),
      promptText: 'p',
    });
    ms.input(undefined, down);
    ms.input(' ', space);
    expect(ms.result()).toEqual(['b']);
  });

  test('down wraps from last to first', () => {
    const { ms } = setup<string>({
      options: strOpts('a', 'b'),
      promptText: 'p',
    });
    ms.input(undefined, down);
    ms.input(undefined, down);
    ms.input(' ', space);
    expect(ms.result()).toEqual(['a']);
  });

  test('up wraps from first to last', () => {
    const { ms } = setup<string>({
      options: strOpts('a', 'b', 'c'),
      promptText: 'p',
    });
    ms.input(undefined, up);
    ms.input(' ', space);
    expect(ms.result()).toEqual(['c']);
  });

  test('pageDown moves cursor by pageSize', () => {
    const opts = Array.from({ length: 15 }, (_, i) => ({
      value: `o${i}`,
      label: `o${i}`,
    }));
    const { ms } = setup<string>({
      options: opts,
      promptText: 'p',
      pageSize: 5,
    });
    ms.input(undefined, pageDown); // 0 → 5
    ms.input(' ', space);
    expect(ms.result()).toEqual(['o5']);
  });

  test('pageUp clamps at 0', () => {
    const opts = Array.from({ length: 5 }, (_, i) => ({
      value: `o${i}`,
      label: `o${i}`,
    }));
    const { ms } = setup<string>({
      options: opts,
      promptText: 'p',
      pageSize: 10,
    });
    ms.input(undefined, pageUp);
    ms.input(' ', space);
    expect(ms.result()).toEqual(['o0']);
  });
});

describe('MultiSelect selection', () => {
  test('initialSelected reflects in result', () => {
    const { ms } = setup<string>({
      options: strOpts('a', 'b', 'c'),
      promptText: 'p',
      initialSelected: ['a', 'c'],
    });
    expect(ms.result()).toEqual(['a', 'c']);
  });

  test('space twice deselects', () => {
    const { ms } = setup<string>({
      options: strOpts('a'),
      promptText: 'p',
    });
    ms.input(' ', space);
    ms.input(' ', space);
    expect(ms.result()).toEqual([]);
  });

  test('result returns in original option order, not selection order', () => {
    const { ms } = setup<string>({
      options: strOpts('a', 'b', 'c'),
      promptText: 'p',
    });
    ms.input(undefined, down);
    ms.input(undefined, down); // cursor at c
    ms.input(' ', space); // select c
    ms.input(undefined, up);
    ms.input(undefined, up); // cursor at a
    ms.input(' ', space); // select a
    ms.input(undefined, down);
    ms.input(' ', space); // select b
    expect(ms.result()).toEqual(['a', 'b', 'c']);
  });
});

describe('MultiSelect filtering', () => {
  test('typing narrows visible options; space toggles a visible match', () => {
    const { ms } = setup<string>({
      options: strOpts('posts', 'comments', 'authors'),
      promptText: 'p',
    });
    'posts'.split('').forEach((c) => ms.input(c, ch(c)));
    ms.input(' ', space);
    expect(ms.result()).toEqual(['posts']);
  });

  test('filter with no matches: space is a no-op', () => {
    const { ms } = setup<string>({
      options: strOpts('a', 'b'),
      promptText: 'p',
    });
    ms.input('z', ch('z'));
    ms.input(' ', space);
    expect(ms.result()).toEqual([]);
  });

  test('backspace shortens filter and restores options', () => {
    const { ms } = setup<string>({
      options: strOpts('posts', 'comments'),
      promptText: 'p',
    });
    ms.input('z', ch('z'));
    ms.input(undefined, back); // filter empty again
    ms.input(' ', space); // toggles posts (first visible)
    expect(ms.result()).toEqual(['posts']);
  });

  test('case-insensitive filter by default', () => {
    const { ms } = setup<string>({
      options: strOpts('Posts', 'Comments'),
      promptText: 'p',
    });
    ms.input('p', ch('p'));
    ms.input(' ', space);
    expect(ms.result()).toEqual(['Posts']);
  });
});

describe('MultiSelect submit / cancel', () => {
  test('return submits result when minSelected is satisfied', () => {
    const { ms, term } = setup<string>({
      options: strOpts('a'),
      promptText: 'p',
      minSelected: 1,
    });
    ms.input(' ', space);
    ms.input(undefined, ret);
    expect(term.resolved).toEqual({ data: ['a'], status: 'submitted' });
  });

  test('return does not submit when below minSelected', () => {
    const { ms, term } = setup<string>({
      options: strOpts('a'),
      promptText: 'p',
      minSelected: 1,
    });
    ms.input(undefined, ret);
    expect(term.resolved).toBeNull();
  });

  test('escape aborts', () => {
    const { ms, term } = setup<string>({
      options: strOpts('a'),
      promptText: 'p',
    });
    ms.input(undefined, esc);
    expect(term.resolved).toEqual({
      data: undefined,
      status: 'aborted',
    });
  });
});
