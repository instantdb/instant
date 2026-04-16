// `tiged` is an actively-maintained fork of `degit` with an identical API,
// so we reuse the `@types/degit` declarations rather than maintaining our own.
declare module 'tiged' {
  import degit = require('degit');
  export = degit;
}
