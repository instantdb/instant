import { test, expect, describe } from 'vitest';
import stripAnsi from 'strip-ansi';
import { UI } from '../src/ui/index.ts';

const key = (name: string) => ({
  sequence: name,
  name,
  ctrl: false,
  meta: false,
  shift: false,
});

const tab = key('tab');
const down = key('down');
const up = key('up');

class FakeTerminal {
  toggleCursor(_state: 'hide' | 'show') {}
  requestLayout() {}
  setAllowInteraction(_v: boolean) {}
  resolve(_v: any) {}
}

const setup = <T>(props: any) => {
  const sel = new UI.Select<T>(props);
  const term = new FakeTerminal();
  sel.attach(term as any);
  return { sel, term };
};

const tick = () => new Promise<void>((r) => setImmediate(r));

describe('Select expansion', () => {
  test('Tab is a no-op when option has no expandableLabel', () => {
    const { sel } = setup({
      options: [{ value: 'a', label: 'a' }],
      promptText: 'p',
    });
    sel.input(undefined, tab);
    expect(stripAnsi(sel.render('idle'))).not.toContain('expanded');
  });

  test('Tab shows a static expandableLabel string', () => {
    const { sel } = setup({
      options: [
        {
          value: 'a',
          label: 'a',
          expandableLabel: '    static-detail-line',
        },
      ],
      promptText: 'p',
    });
    expect(stripAnsi(sel.render('idle'))).not.toContain('static-detail-line');
    sel.input(undefined, tab);
    expect(stripAnsi(sel.render('idle'))).toContain('static-detail-line');
  });

  test('Tab twice collapses', () => {
    const { sel } = setup({
      options: [
        { value: 'a', label: 'a', expandableLabel: '    static-detail' },
      ],
      promptText: 'p',
    });
    sel.input(undefined, tab);
    sel.input(undefined, tab);
    expect(stripAnsi(sel.render('idle'))).not.toContain('static-detail');
  });

  test('Sticky mode: navigating to another expandable auto-expands it', () => {
    const { sel } = setup({
      options: [
        { value: 'a', label: 'a-row', expandableLabel: '    a-detail' },
        { value: 'b', label: 'b-row', expandableLabel: '    b-detail' },
      ],
      promptText: 'p',
    });
    sel.input(undefined, tab);
    expect(stripAnsi(sel.render('idle'))).toContain('a-detail');
    sel.input(undefined, down);
    const out = stripAnsi(sel.render('idle'));
    expect(out).not.toContain('a-detail');
    expect(out).toContain('b-detail');
  });

  test('Sticky mode: navigating to non-expandable hides expansion but stays sticky', () => {
    const { sel } = setup({
      options: [
        { value: 'a', label: 'a', expandableLabel: '    a-detail' },
        { value: 'b', label: 'b' },
      ],
      promptText: 'p',
    });
    sel.input(undefined, tab);
    sel.input(undefined, down); // move to b, no expansion
    let out = stripAnsi(sel.render('idle'));
    expect(out).not.toContain('a-detail');
    expect(out).toContain('(tab to collapse)');
    sel.input(undefined, up); // back to a — should auto-expand again
    out = stripAnsi(sel.render('idle'));
    expect(out).toContain('a-detail');
  });

  test('Without Tab, navigation does not auto-expand', () => {
    const { sel } = setup({
      options: [
        { value: 'a', label: 'a', expandableLabel: '    a-detail' },
        { value: 'b', label: 'b', expandableLabel: '    b-detail' },
      ],
      promptText: 'p',
    });
    sel.input(undefined, down);
    const out = stripAnsi(sel.render('idle'));
    expect(out).not.toContain('a-detail');
    expect(out).not.toContain('b-detail');
  });

  test('Async expandableLabel shows Loading then resolves', async () => {
    let resolveFn!: (s: string) => void;
    const promise = new Promise<string>((r) => {
      resolveFn = r;
    });
    const { sel } = setup({
      options: [
        {
          value: 'a',
          label: 'a',
          expandableLabel: () => promise,
        },
      ],
      promptText: 'p',
    });
    sel.input(undefined, tab);
    expect(stripAnsi(sel.render('idle'))).toContain('Loading');
    resolveFn('    resolved-content-here');
    await tick();
    await tick();
    expect(stripAnsi(sel.render('idle'))).toContain('resolved-content-here');
  });

  test('Async expandableLabel caches result across collapse/re-expand', async () => {
    let calls = 0;
    const { sel } = setup({
      options: [
        {
          value: 'a',
          label: 'a',
          expandableLabel: () => {
            calls++;
            return Promise.resolve('    cached');
          },
        },
      ],
      promptText: 'p',
    });
    sel.input(undefined, tab);
    await tick();
    expect(calls).toBe(1);
    sel.input(undefined, tab); // collapse
    sel.input(undefined, tab); // re-expand
    expect(calls).toBe(1);
    expect(stripAnsi(sel.render('idle'))).toContain('cached');
  });

  test('Async expandableLabel rejection shows error in expansion', async () => {
    const { sel } = setup({
      options: [
        {
          value: 'a',
          label: 'a',
          expandableLabel: () => Promise.reject(new Error('boom')),
        },
      ],
      promptText: 'p',
    });
    sel.input(undefined, tab);
    await tick();
    await tick();
    expect(stripAnsi(sel.render('idle'))).toMatch(/Error loading.*boom/);
  });

  test('Hint shown whenever any option has expandableLabel', () => {
    const { sel } = setup({
      options: [
        { value: 'a', label: 'a', expandableLabel: '    detail' },
        { value: 'b', label: 'b' },
      ],
      promptText: 'p',
    });
    expect(stripAnsi(sel.render('idle'))).toContain('(tab to expand)');
    sel.input(undefined, tab);
    expect(stripAnsi(sel.render('idle'))).toContain('(tab to collapse)');
    // Moving to a non-expandable row keeps the hint (sticky mode is active)
    sel.input(undefined, down);
    expect(stripAnsi(sel.render('idle'))).toContain('(tab to collapse)');
  });

  test('Hint not shown when no option has expandableLabel', () => {
    const { sel } = setup({
      options: [
        { value: 'a', label: 'a' },
        { value: 'b', label: 'b' },
      ],
      promptText: 'p',
    });
    expect(stripAnsi(sel.render('idle'))).not.toMatch(/tab to/);
  });

  test('Tab only expands the focused row', async () => {
    const { sel } = setup({
      options: [
        { value: 'a', label: 'a-row', expandableLabel: '    detail-a' },
        { value: 'b', label: 'b-row', expandableLabel: '    detail-b' },
      ],
      promptText: 'p',
    });
    sel.input(undefined, down); // focus b
    sel.input(undefined, tab);
    const out = stripAnsi(sel.render('idle'));
    expect(out).toContain('detail-b');
    expect(out).not.toContain('detail-a');
  });
});
