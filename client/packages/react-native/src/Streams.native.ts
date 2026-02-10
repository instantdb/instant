import streams from 'web-streams-polyfill';

export const streamConstructors = {
  ReadableStream: streams.ReadableStream,
  WritableStream: streams.WritableStream,
};
