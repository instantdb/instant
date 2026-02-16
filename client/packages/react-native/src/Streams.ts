// RN may need a polyfill for streams, so we put those in Streams.native.ts
export const streamConstructors = {
  ReadableStream: ReadableStream,
  WritableStream: WritableStream,
};
