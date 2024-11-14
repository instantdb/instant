export type IsAny<T> = 0 extends 1 & T ? true : false;

/**
 * Returns true if T is _not_ `any`, and extends Expected.
 */
export type SpecificallyExtends<T, Expected> =
  IsAny<T> extends true ? false : T extends Expected ? true : false;
