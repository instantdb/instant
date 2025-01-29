export function makeAttrComparator(
  sortAttr: string,
  sortAsc: boolean | undefined,
): ((a: Record<string, any>, b: Record<string, any>) => number) | undefined {
  return (_a, _b) => {
    const a = _a[sortAttr];
    const b = _b[sortAttr];

    if (
      (a === null || typeof a === 'undefined') &&
      (b === null || typeof b === 'undefined')
    ) {
      return 0; // keep original order if both are null or undefined
    }

    // Check if a is null or undefined, if so, move it to the end
    if (a === null || typeof a === 'undefined') {
      return 1; // move a to the end
    }

    // Check if b is null or undefined, if so, move it to the end
    if (b === null || typeof b === 'undefined') {
      return -1; // move b to the end
    }

    if (typeof a === 'boolean' || typeof b === 'boolean') {
      return a - b * (sortAsc ? 1 : -1);
    }

    return (a < b ? -1 : 1) * (sortAsc ? 1 : -1);
  };
}
