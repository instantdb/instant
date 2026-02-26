import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createResumableStreamContext,
  type ResumableStreamContext,
} from '../index.js';
import { createTestingStream, streamToBuffer } from './testing-stream.js';

type EphemeralApp = {
  appId: string;
  adminToken: string;
  apiURI: string;
};

async function createEphemeralAppForTests(): Promise<EphemeralApp> {
  const apiURI = process.env.INSTANT_API_URI || 'https://api.instantdb.com';
  const response = await fetch(`${apiURI}/dash/apps/ephemeral`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: `resumable-stream-tests-${Date.now()}`,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Failed to create ephemeral app (${response.status}): ${body}`,
    );
  }

  const json = (await response.json()) as any;
  const appId = json?.app?.id ?? json?.appId;
  const adminToken =
    json?.app?.['admin-token'] ??
    json?.app?.adminToken ??
    json?.app?.admin_token ??
    json?.adminToken;

  if (!appId || !adminToken) {
    throw new Error(
      `Unexpected ephemeral app response: ${JSON.stringify(json)}`,
    );
  }

  return {
    appId,
    adminToken,
    apiURI,
  };
}

function withScopedStreamIds(
  context: ResumableStreamContext,
  scope: string,
): ResumableStreamContext {
  const scopedId = (streamId: string) => `${scope}:${streamId}`;
  return {
    resumableStream: (streamId, makeStream, skipCharacters) =>
      context.resumableStream(scopedId(streamId), makeStream, skipCharacters),
    resumeExistingStream: (streamId, skipCharacters) =>
      context.resumeExistingStream(scopedId(streamId), skipCharacters),
    createNewResumableStream: (streamId, makeStream, skipCharacters) =>
      context.createNewResumableStream(
        scopedId(streamId),
        makeStream,
        skipCharacters,
      ),
    hasExistingStream: (streamId) =>
      context.hasExistingStream(scopedId(streamId)),
  };
}

describe('resumable stream', () => {
  let app: EphemeralApp;
  let resume: ResumableStreamContext;
  let waitUntilPromises: Promise<any>[] = [];

  beforeAll(async () => {
    app = await createEphemeralAppForTests();
  }, 60000);

  beforeEach(() => {
    const baseContext = createResumableStreamContext({
      waitUntil: (p) => waitUntilPromises.push(p),
      appId: app.appId,
      adminToken: app.adminToken,
      apiURI: app.apiURI,
    });
    resume = withScopedStreamIds(baseContext, crypto.randomUUID());
  });

  it('should act like a normal stream', async () => {
    const { readable, writer } = createTestingStream();
    const stream = await resume.resumableStream('test', () => readable);
    writer.write('1\n');
    writer.write('2\n');
    writer.write('3\n');
    writer.close();
    const result2 = await streamToBuffer(stream);
    expect(result2).toEqual('1\n2\n3\n');
  });

  it('should resume a done stream', async () => {
    const { readable, writer } = createTestingStream();
    const stream = await resume.resumableStream('test', () => readable);
    const stream2 = await resume.resumableStream('test', () => readable);
    writer.write('1\n');
    writer.write('2\n');
    writer.close();
    const result = await streamToBuffer(stream);
    const result2 = await streamToBuffer(stream2);
    expect(result).toEqual('1\n2\n');
    expect(result2).toEqual('1\n2\n');
  });

  it('hasExistingStream', async () => {
    const { readable, writer } = createTestingStream();
    expect(await resume.hasExistingStream('test')).toBe(null);
    const stream = await resume.resumableStream('test', () => readable);
    expect(await resume.hasExistingStream('test')).toBe(true);
    expect(await resume.hasExistingStream('test2')).toBe(null);
    const stream2 = await resume.resumableStream('test', () => readable);
    expect(await resume.hasExistingStream('test')).toBe(true);
    writer.write('1\n');
    writer.write('2\n');
    writer.close();

    const result = await streamToBuffer(stream);
    const result2 = await streamToBuffer(stream2);
    expect(result).toEqual('1\n2\n');
    expect(result2).toEqual('1\n2\n');
    await Promise.all(waitUntilPromises);
    expect(await resume.hasExistingStream('test')).toBe('DONE');
  });

  it('should resume a done stream reverse read', async () => {
    const { readable, writer } = createTestingStream();
    const stream = await resume.resumableStream('test', () => readable);
    const stream2 = await resume.resumableStream('test', () => readable);
    writer.write('1\n');
    writer.write('2\n');
    writer.close();
    const result2 = await streamToBuffer(stream2);
    const result = await streamToBuffer(stream);

    expect(result).toEqual('1\n2\n');
    expect(result2).toEqual('1\n2\n');
  });

  it('should resume an in-progress stream', async () => {
    const { readable, writer } = createTestingStream();
    const stream = await resume.resumableStream('test', () => readable);
    writer.write('1\n');
    const stream2 = await resume.resumableStream('test', () => readable);
    writer.write('2\n');
    writer.close();
    const result = await streamToBuffer(stream);
    const result2 = await streamToBuffer(stream2);
    expect(result).toEqual('1\n2\n');
    expect(result2).toEqual('1\n2\n');
  });

  it('should actually stream', async () => {
    const { readable, writer } = createTestingStream();
    const stream = await resume.resumableStream('test', () => readable);
    writer.write('1\n');
    const stream2 = await resume.resumableStream('test', () => readable);
    const result = await streamToBuffer(stream, 1);
    const result2 = await streamToBuffer(stream2, 1);
    expect(result).toEqual('1\n');
    expect(result2).toEqual('1\n');
    writer.write('2\n');
    writer.close();
    const step1 = await streamToBuffer(stream);
    const step2 = await streamToBuffer(stream2);
    expect(step1).toEqual('2\n');
    expect(step2).toEqual('2\n');
  });

  it('should actually stream producer first', async () => {
    const { readable, writer } = createTestingStream();
    const stream = await resume.resumableStream('test', () => readable);
    writer.write('1\n');
    const stream2 = await resume.resumableStream('test', () => readable);
    const result = await streamToBuffer(stream, 1);
    expect(result).toEqual('1\n');
    writer.write('2\n');
    writer.close();
    const step1 = await streamToBuffer(stream);
    const step2 = await streamToBuffer(stream2);
    expect(step1).toEqual('2\n');
    expect(step2).toEqual('1\n2\n');
  });

  it('should actually stream consumer first', async () => {
    const { readable, writer } = createTestingStream();
    const stream = await resume.resumableStream('test', () => readable);
    writer.write('1\n');
    const stream2 = await resume.resumableStream('test', () => readable);
    const result2 = await streamToBuffer(stream2, 1);
    expect(result2).toEqual('1\n');
    writer.write('2\n');
    writer.close();
    const step1 = await streamToBuffer(stream);
    const step2 = await streamToBuffer(stream2);
    expect(step1).toEqual('1\n2\n');
    expect(step2).toEqual('2\n');
  });

  it('should resume multiple streams', async () => {
    const { readable, writer } = createTestingStream();
    const stream = await resume.resumableStream('test', () => readable);
    writer.write('1\n');
    const stream2 = await resume.resumableStream('test', () => readable);
    writer.write('2\n');
    const stream3 = await resume.resumableStream('test', () => readable);
    writer.close();
    const result = await streamToBuffer(stream);
    const result2 = await streamToBuffer(stream2);
    const result3 = await streamToBuffer(stream3);
    expect(result).toEqual('1\n2\n');
    expect(result2).toEqual('1\n2\n');
    expect(result3).toEqual('1\n2\n');
  });

  it('should differentiate between streams', async () => {
    const { readable, writer } = createTestingStream();
    const { readable: readable2, writer: writer2 } = createTestingStream();
    const stream1 = await resume.resumableStream('test', () => readable);
    const stream2 = await resume.resumableStream('test2', () => readable2);
    const stream12 = await resume.resumableStream('test', () => readable);
    const stream22 = await resume.resumableStream('test2', () => readable2);
    writer.write('1\n');
    writer.write('2\n');
    writer.close();
    writer2.write('writer2\n');
    writer2.close();
    const result1 = await streamToBuffer(stream1);
    const result2 = await streamToBuffer(stream2);
    const result12 = await streamToBuffer(stream12);
    const result22 = await streamToBuffer(stream22);
    expect(result1).toEqual('1\n2\n');
    expect(result2).toEqual('writer2\n');
    expect(result12).toEqual('1\n2\n');
    expect(result22).toEqual('writer2\n');
  });

  it('should respect skipCharacters', async () => {
    const { readable, writer } = createTestingStream();
    const stream = await resume.resumableStream('test', () => readable);
    writer.write('1\n');
    writer.write('2\n');
    const stream2 = await resume.resumableStream('test', () => readable, 2);
    writer.close();
    const result = await streamToBuffer(stream);
    const result2 = await streamToBuffer(stream2);
    expect(result).toEqual('1\n2\n');
    expect(result2).toEqual('2\n');
  });

  it('should respect skipCharacters 2', async () => {
    const { readable, writer } = createTestingStream();
    const stream = await resume.resumableStream('test', () => readable);
    writer.write('1\n');
    writer.write('2\n');
    const stream2 = await resume.resumableStream('test', () => readable, 4);
    writer.close();
    const result = await streamToBuffer(stream);
    const result2 = await streamToBuffer(stream2);
    expect(result).toEqual('1\n2\n');
    expect(result2).toEqual('');
  });

  it('should respect skipCharacters 0', async () => {
    const { readable, writer } = createTestingStream();
    const stream = await resume.resumableStream('test', () => readable);
    writer.write('1\n');
    writer.write('2\n');
    const stream2 = await resume.resumableStream('test', () => readable, 0);
    writer.close();
    const result = await streamToBuffer(stream);
    const result2 = await streamToBuffer(stream2);
    expect(result).toEqual('1\n2\n');
    expect(result2).toEqual('1\n2\n');
  });

  // We return the stream because we can afford to hold on to the old streams
  // Leaving this as a skipped test in case we want to offer a compat mode that
  // returns null
  it.skip('should return null if stream is done', async () => {
    const { readable, writer } = createTestingStream();
    const stream = await resume.resumableStream('test', () => readable);
    writer.write('1\n');
    writer.write('2\n');
    writer.close();

    const result = await streamToBuffer(stream);
    expect(
      await resume.resumableStream('test', () => {
        throw new Error('Should never be called');
      }),
    ).toBeNull();
    expect(result).toEqual('1\n2\n');
  });

  it('should support the deconstructed APIs', async () => {
    const { readable, writer } = createTestingStream();
    const stream = await resume.createNewResumableStream(
      'test',
      () => readable,
    );
    const stream2 = await resume.resumeExistingStream('test');
    writer.write('1\n');
    writer.write('2\n');
    writer.close();
    const result = await streamToBuffer(stream);
    const result2 = await streamToBuffer(stream2);
    expect(result).toEqual('1\n2\n');
    expect(result2).toEqual('1\n2\n');
  });

  // We return the stream because we can afford to hold on to the old streams
  // Leaving this as a skipped test in case we want to offer a compat mode that
  // returns null
  it.skip('should return null if stream is done explicit APIs', async () => {
    const { readable, writer } = createTestingStream();
    const stream = await resume.createNewResumableStream(
      'test',
      () => readable,
    );
    writer.write('1\n');
    writer.write('2\n');
    writer.close();

    const result = await streamToBuffer(stream);
    expect(await resume.resumeExistingStream('test')).toBeNull();
    expect(result).toEqual('1\n2\n');
  });
});
