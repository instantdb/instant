import { describe, test, expect } from 'vitest';
import { Webhooks } from '../../src/index';

// Captured from a real webhook delivery from a localhost:8888 sender,
// signed by the localhost:8888 dev key (kid=503090235).
const SIGNATURE_HEADER =
  't=1778610366,kid=503090235,v1=b4385e8285de38d22b6d8a6bdd03cc75287e356f1adf48cea257a8e6c056c04ef99af7d8e162afcaa07d201e97c7865cc91e552bd5def8f9ed4b52efc5843406';

const BODY =
  '{"payloadUrl":"http://localhost:8888/webhooks/payload/f717e056-94af-4556-9eec-288fb27847a1/4e119bf6-ef64-4e86-bf26-49a18dec54b8/0/328/5307A1A0","token":"eyJraWQiOiI1MDMwOTAyMzUiLCJ0eXAiOiJKV1QiLCJhbGciOiJFZERTQSJ9.eyJpc3MiOiJodHRwOi8vbG9jYWxob3N0Ojg4ODgiLCJzdWIiOiJmNzE3ZTA1Ni05NGFmLTQ1NTYtOWVlYy0yODhmYjI3ODQ3YTEiLCJhcHAtaWQiOiJmNzE3ZTA1Ni05NGFmLTQ1NTYtOWVlYy0yODhmYjI3ODQ3YTEiLCJleHAiOjE3Nzg2MTM5NjYsImlzbiI6IjAvMzI4LzUzMDdBMUEwIiwid2ViaG9vay1pZCI6IjRlMTE5YmY2LWVmNjQtNGU4Ni1iZjI2LTQ5YTE4ZGVjNTRiOCJ9.SsI2iZ4rD_sDjUcgqyJ0agGXMgjTRU5PKgcEQsE-txp5jTNoVouQU-GneTrKR2GmleETEzFrpf_v4HAnCDYABw"}';

const RECEIVED_AT = new Date(1778610366 * 1000);

function makeWebhooks() {
  return new Webhooks({
    appId: 'f717e056-94af-4556-9eec-288fb27847a1',
    apiURI: 'http://localhost:8888',
  });
}

describe('validate', () => {
  test('verifies a signature from the localhost:8888 dev key and returns the parsed body', async () => {
    const wh = makeWebhooks();

    const body = await wh.validate(SIGNATURE_HEADER, BODY, {
      receivedAt: RECEIVED_AT,
    });

    expect(body).toEqual({
      payloadUrl:
        'http://localhost:8888/webhooks/payload/f717e056-94af-4556-9eec-288fb27847a1/4e119bf6-ef64-4e86-bf26-49a18dec54b8/0/328/5307A1A0',
      token:
        'eyJraWQiOiI1MDMwOTAyMzUiLCJ0eXAiOiJKV1QiLCJhbGciOiJFZERTQSJ9.eyJpc3MiOiJodHRwOi8vbG9jYWxob3N0Ojg4ODgiLCJzdWIiOiJmNzE3ZTA1Ni05NGFmLTQ1NTYtOWVlYy0yODhmYjI3ODQ3YTEiLCJhcHAtaWQiOiJmNzE3ZTA1Ni05NGFmLTQ1NTYtOWVlYy0yODhmYjI3ODQ3YTEiLCJleHAiOjE3Nzg2MTM5NjYsImlzbiI6IjAvMzI4LzUzMDdBMUEwIiwid2ViaG9vay1pZCI6IjRlMTE5YmY2LWVmNjQtNGU4Ni1iZjI2LTQ5YTE4ZGVjNTRiOCJ9.SsI2iZ4rD_sDjUcgqyJ0agGXMgjTRU5PKgcEQsE-txp5jTNoVouQU-GneTrKR2GmleETEzFrpf_v4HAnCDYABw',
    });
  });

  test('rejects when the body is mutated', async () => {
    const wh = makeWebhooks();
    const tampered = BODY.replace('5307A1A0', '5307A1A1');

    await expect(
      wh.validate(SIGNATURE_HEADER, tampered, { receivedAt: RECEIVED_AT }),
    ).rejects.toThrow('Instant Signature did not validate');
  });

  test('rejects when the signature is older than the tolerance', async () => {
    const wh = makeWebhooks();
    const tooLate = new Date(RECEIVED_AT.getTime() + 301 * 1000);

    await expect(
      wh.validate(SIGNATURE_HEADER, BODY, { receivedAt: tooLate }),
    ).rejects.toThrow('Webhook signature is too old');
  });

  test.each([
    ['missing t', 'kid=503090235,v1=abcd'],
    ['missing kid', 't=1778610366,v1=abcd'],
    ['missing v1', 't=1778610366,kid=503090235'],
    ['empty header', ''],
  ])('rejects when the signature header is %s', async (_label, header) => {
    const wh = makeWebhooks();

    await expect(
      wh.validate(header, BODY, { receivedAt: RECEIVED_AT }),
    ).rejects.toThrow('Invalid Instant-Signature header.');
  });
});

describe('validateRequest', () => {
  test('pulls the signature header off the request and verifies', async () => {
    const wh = makeWebhooks();

    const req = new Request('http://example.com/webhook', {
      method: 'POST',
      headers: { 'Instant-Signature': SIGNATURE_HEADER },
      body: BODY,
    });

    const body = await wh.validateRequest(req, { receivedAt: RECEIVED_AT });

    expect(body.payloadUrl).toBe(
      'http://localhost:8888/webhooks/payload/f717e056-94af-4556-9eec-288fb27847a1/4e119bf6-ef64-4e86-bf26-49a18dec54b8/0/328/5307A1A0',
    );
  });

  test('rejects when the Instant-Signature header is missing', async () => {
    const wh = makeWebhooks();

    const req = new Request('http://example.com/webhook', {
      method: 'POST',
      body: BODY,
    });

    await expect(
      wh.validateRequest(req, { receivedAt: RECEIVED_AT }),
    ).rejects.toThrow('Request is missing Instant-Signature header');
  });
});
