function fallbackCompareStrings(a: string, b: string) {
  return a.localeCompare(b);
}

function makeCompareStringsFn(): (a: string, b: string) => number {
  let compareStrings = fallbackCompareStrings;

  if (typeof Intl === 'object' && Intl.hasOwnProperty('Collator')) {
    try {
      const collator = Intl.Collator('en-US');

      compareStrings = collator.compare;
    } catch (_e) {}
  }

  return compareStrings;
}

export const stringCompare = makeCompareStringsFn();
