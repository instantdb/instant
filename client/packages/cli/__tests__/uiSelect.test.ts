import { describe, expect, test } from 'vitest';
import { UI } from '../src/ui/index.ts';
import type { AnyKey } from '../src/ui/lib.ts';

const key = (name?: string): AnyKey => ({
  sequence: '',
  name,
  ctrl: false,
  meta: false,
  shift: false,
});

describe('UI.Select', () => {
  test('skips disabled options during selection', () => {
    const prompt = new UI.Select({
      promptText: 'Pick one:',
      options: [
        {
          label: 'Disabled first',
          value: 'disabled-first',
          disabled: true,
        },
        { label: 'Enabled first', value: 'enabled-first' },
        {
          label: 'Disabled middle',
          value: 'disabled-middle',
          disabled: true,
        },
        { label: 'Enabled second', value: 'enabled-second' },
      ],
    });

    expect(prompt.result()).toBe('enabled-first');

    prompt.input(undefined, key('down'));
    expect(prompt.result()).toBe('enabled-second');

    prompt.input(undefined, key('down'));
    expect(prompt.result()).toBe('enabled-first');

    prompt.input(undefined, key('up'));
    expect(prompt.result()).toBe('enabled-second');

    prompt.input('j', key());
    expect(prompt.result()).toBe('enabled-first');

    prompt.input('k', key());
    expect(prompt.result()).toBe('enabled-second');
  });

  test('renders disabled reasons', () => {
    const prompt = new UI.Select({
      promptText: 'Pick one:',
      options: [
        { label: 'Enabled', value: 'enabled' },
        {
          label: 'Disabled',
          value: 'disabled',
          disabled: true,
          disabledReason: "can't do this in dev mode",
        },
      ],
    });

    expect(prompt.render('idle')).toContain(
      "Disabled (can't do this in dev mode)",
    );
  });
});
