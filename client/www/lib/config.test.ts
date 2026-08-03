import { expect, test } from 'vitest';
import { configFromApiURI, requireSelfHostedConfig } from './config';

test('builds dashboard config from an API URI', () => {
  expect(configFromApiURI('https://api.example.com')).toEqual({
    apiURI: 'https://api.example.com',
    websocketURI: 'wss://api.example.com/runtime/session',
  });
  expect(configFromApiURI('http://api.example.com')).toEqual({
    apiURI: 'http://api.example.com',
    websocketURI: 'ws://api.example.com/runtime/session',
  });
});

test('requires valid self-hosted dashboard config', () => {
  expect(() => requireSelfHostedConfig(undefined)).toThrow(
    'Self-hosted dashboard requires INSTANT_API_URI or INSTANT_BACKEND_URL to be a valid HTTP(S) URL.',
  );
  expect(() => requireSelfHostedConfig('not a url')).toThrow(
    'Self-hosted dashboard requires INSTANT_API_URI or INSTANT_BACKEND_URL to be a valid HTTP(S) URL.',
  );
  expect(() => requireSelfHostedConfig('ftp://api.example.com')).toThrow(
    'Self-hosted dashboard requires INSTANT_API_URI or INSTANT_BACKEND_URL to be a valid HTTP(S) URL.',
  );
});
