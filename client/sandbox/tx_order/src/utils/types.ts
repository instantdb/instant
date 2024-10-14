export type Maybe<T> = T | null | undefined;

export type MaybeNull<T> = T | null;

export type MaybeUndefined<T> = T | undefined;

export type Filter<T> = (item: T) => boolean;

// Provide intellisense autocomplete for T while also allowing arbitrary values
// @see https://twitter.com/mattpocockuk/status/1671908303918473217
export type LooseAutocomplete<T> = T | (string & {});
