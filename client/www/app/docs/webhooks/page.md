---
nextjs:
  metadata:
    title: 'Webhooks'
    description: 'How to receive, verify, and manage Instant webhooks.'
---

Webhooks allow you to subscribe to changes to your entities via POST requests to your server.

## How webhooks work

A webhook subscribes to one or more **entity types** (namespaces) and **actions** (`create`, `update`, `delete`). Whenever a matching write commits, Instant queues an event and POSTs it to your endpoint.

Each request carries an `Instant-Signature` header and a small body. The body holds a short-lived URL and a JWT — you exchange them for the full payload of records:

```json
{
  "data": [
    {
      "etype": "posts",
      "id": "<entity-id>",
      "action": "update",
      "before": { "id": "<entity-id>", "title": "Old title" },
      "after": { "id": "<entity-id>", "title": "New title" },
      "idempotencyKey": "<per-record-key>"
    }
  ],
  "idempotencyKey": "<batch-key>"
}
```

`before` is `null` on `create`, `after` is `null` on `delete`. The `idempotencyKey` is stable across redeliveries — use it to dedupe if your handler isn't idempotent on its own.

### Delivery and retries

Instant retries failed deliveries with backoff. An event moves through these stages:

- `pending` — queued, not yet attempted
- `processing` — a sender is actively trying to deliver
- `success` — receiver returned `2xx`
- `error` — an attempt failed; another retry is scheduled
- `failed` — all retries exhausted; will not be retried automatically

Each delivery attempt has a **15-second timeout** — if your endpoint hasn't responded by then the attempt is recorded as a `timeout` error and Instant retries. Do any slow work (sending emails, calling third-party APIs, etc.) asynchronously, and respond with `2xx` as soon as you've durably enqueued the work.

A webhook that fails too many times in a row is automatically disabled. You can re-enable it from the dashboard or via the SDK once you've fixed the receiver.

## Setting up a webhook

The easiest way to create a webhook is from the **Webhooks** tab in the dashboard: pick the entity types, the actions, and the URL Instant should POST to.

You can also create webhooks programmatically from the admin SDK:

```ts {% showCopy=true %}
// scripts/create-webhook.ts
import { init } from '@instantdb/admin';
import schema from './instant.schema';

const db = init({
  appId: process.env.INSTANT_APP_ID!,
  adminToken: process.env.INSTANT_APP_ADMIN_TOKEN!,
  schema,
});

const webhook = await db.webhooks.manager.create({
  url: 'https://example.com/api/instant-webhook',
  etypes: ['posts', 'comments'],
  actions: ['create', 'update'],
});
```

The URL must be `https` and resolve to a public host. An app can have up to **100 active webhooks** at a time.

## Receiving webhooks

`db.webhooks.processRequest` is the one-liner for handling incoming events. It verifies the signature, fetches the payload, and dispatches each record to your code.

### Next.js (App Router)

```ts {% showCopy=true %}
// app/api/instant-webhook/route.ts
import { init } from '@instantdb/admin';
import { sendNewPostEmail } from '@./lib/emails';
import schema from '@/instant.schema';

const db = init({
  appId: process.env.INSTANT_APP_ID!,
  schema,
});

const { typedHandlers, combineHandlers } = db.webhooks.helpers();

const handlers = combineHandlers(
  typedHandlers('posts', 'create', async (record) => {
    await sendNewPostEmail(record.after);
  }),
  typedHandlers('posts', 'update', (record) => {
    console.log('post %s changed', record.id, record.before, record.after);
  }),
  typedHandlers('$default', (record) => {
    console.log('unhandled record', record);
  }),
);

export async function POST(req: Request) {
  await db.webhooks.processRequest(handlers, req);
  return new Response('ok');
}
```

`Webhooks.helpers<typeof schema>()` gives you `typedHandlers` and `combineHandlers`. Inside each handler, `record.before` and `record.after` are typed according to your schema — TypeScript will autocomplete fields and narrow on `action`.

Handler resolution is most-specific-wins: `etype` + `action`, then the `etype`'s `$default`, then the top-level `$default`. Records with no matching handler are skipped.

Handlers run concurrently. `processRequest` resolves once every handler resolves or a handler rejects; if any handler rejects, the call rejects too — return a non-2xx response so Instant retries.

### Next.js (Pages Router)

The Pages Router gives you a Node-style request, so use `processNodeRequest`. You also need to disable Next's body parser so the raw bytes are available for signature verification:

```ts {% showCopy=true %}
// pages/api/instant-webhook.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { init, Webhooks } from '@instantdb/admin';
import schema from '@/instant.schema';

// Signature verification requires the raw bytes
export const config = { api: { bodyParser: false } };

const db = init({
  appId: process.env.INSTANT_APP_ID!,
  adminToken: process.env.INSTANT_APP_ADMIN_TOKEN!,
  schema,
});

const { typedHandlers, combineHandlers } = Webhooks.helpers<typeof schema>();

const handlers = combineHandlers(
  typedHandlers('posts', 'create', async (record) => {
    await sendNewPostEmail(record.after);
  }),
);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    await db.webhooks.processNodeRequest(handlers, req);
    res.status(200).end();
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
}
```

### Express / other Node frameworks

Anywhere you have a Web `Request`, `processRequest` works directly. For frameworks that hand you a Node request, either bridge it to a `Request` yourself or read the raw body and call `validate` / `fetchPayloads` / `processPayload`:

```ts {% showCopy=true %}
import express from 'express';
import { init, Webhooks } from '@instantdb/admin';
import schema from './instant.schema';

const { typedHandlers, combineHandlers } = Webhooks.helpers<typeof schema>();

const handlers = combineHandlers(
  typedHandlers('$default', (record) => console.log(record)),
);

const app = express();

app.post(
  '/api/instant-webhook',
  express.raw({ type: '*/*' }),
  async (req, res) => {
    const db = init({
      appId: process.env.INSTANT_APP_ID!,
      schema,
    });

    const signature = req.header('instant-signature')!;
    const body = req.body.toString('utf8');
    try {
      const webhookBody = await db.webhooks.validate(signature, body);
      const payload = await db.webhooks.fetchPayloads(webhookBody);
      await db.webhooks.processPayload(handlers, payload);
      res.status(200).send('ok');
    } catch (e) {
      res.status(400).send(String(e));
    }
  },
);
```

## Verifying signatures manually

If you'd rather not use the handler dispatch, you can stop after verification. `validate` parses and checks the `Instant-Signature` header against the body and returns the `{ payloadUrl, token }` you'd use to fetch records:

```ts {% showCopy=true %}
const { payloadUrl, token } = await db.webhooks.validate(
  signatureHeader,
  rawBody,
  { tolerance: 300 }, // max signature age in seconds; default 300
);

// Or, if you already have a Web Request:
const body = await db.webhooks.validateRequest(req);

const payload = await db.webhooks.fetchPayloads({ payloadUrl, token });
```

`validate` rejects requests whose signature is older than `tolerance` (default: 5 minutes) — this is what protects against replays, so don't crank it up without thinking about it.

## Managing webhooks programmatically

`db.webhooks.manager` exposes CRUD on webhooks and access to their delivery history. Use it from the admin SDK when you want to provision webhooks from code (e.g. during onboarding) rather than from the dashboard.

```ts {% showCopy=true %}
// List
const webhooks = await db.webhooks.manager.list();

// Create
const hook = await db.webhooks.manager.create({
  url: 'https://example.com/instant',
  etypes: ['posts'],
  actions: ['create', 'update', 'delete'],
});

// Update — pass only the fields you want to change
await db.webhooks.manager.update(hook.id, {
  actions: ['create', 'update'],
});

// Disable / re-enable
await db.webhooks.manager.disable(hook.id, { reason: 'paused for migration' });
await db.webhooks.manager.enable(hook.id);

// Delete
await db.webhooks.manager.delete(hook.id);
```

`update` is a patch — omitted fields keep their current value. `disable` and `enable` don't change the config, only whether new events are queued. Events that occurred while a webhook was disabled are **not** retroactively delivered when you re-enable it.

## Inspecting events

Every delivery attempt is recorded for ~60 days and is queryable through the manager. This is useful when a downstream system seems out of sync, or when you want to replay a missed event.

```ts {% showCopy=true %}
// Page through events, newest first
let cursor: string | null = null;
do {
  const { events, pageInfo } = await db.webhooks.manager.listEvents(hook.id, {
    after: cursor,
  });
  for (const event of events) {
    console.log(event.isn, event.status, event.attempts);
  }
  cursor = pageInfo.hasNextPage ? pageInfo.endCursor : null;
} while (cursor);

// Fetch one event by its isn (Instant Sequence Number)
const event = await db.webhooks.manager.getEvent(hook.id, isn);

// Fetch the full payload for an event
const payload = await db.webhooks.manager.getPayload(hook.id, isn);

// Force a redelivery (works on success, error, or failed)
await db.webhooks.manager.resendEvent(hook.id, isn);
```

Each `event.attempts` entry records the HTTP status, response body (first 256 bytes), duration, and an `errorType` tag (`timeout`, `dns`, `connect`, `tls`, `protocol`, `network`, `unknown`) when delivery failed — usually enough to tell whether the receiver is the problem or the network is.

`resendEvent` is rate-limited per event; if you call it twice in quick succession the second call will return a validation error and ask you to wait about a minute.

## Verifying and fetching from any language

The `@instantdb/admin` SDK is the easiest way to receive webhooks, but the protocol is plain HTTP + Ed25519 — you can implement a receiver in any language. The steps below are what `validate` and `fetchPayloads` do under the hood.

### 1. The request

Every webhook arrives as a `POST` with two things you care about:

- The `Instant-Signature` header, a comma-separated list of `key=value` pairs:

  ```
  Instant-Signature: t=1715551200,kid=1034696293,v1=4a8f...
  ```

  - `t` — Unix timestamp (seconds) of when Instant signed the request
  - `kid` — id of the signing key
  - `v1` — hex-encoded Ed25519 signature

- A JSON body containing a short-lived URL and JWT:

  ```json
  { "payloadUrl": "https://api.instantdb.com/...", "token": "eyJ..." }
  ```

### 2. Verify the signature

The signed message is `t` + `.` + the raw request body, as UTF-8 bytes. Verify the `v1` signature against the Ed25519 public key whose `kid` matches the header. The public keys are published as a JWK Set at:

```
https://api.instantdb.com/.well-known/webhooks/jwks.json
```

Reject requests where `t` is older than a few minutes (the SDK defaults to 300 seconds) to prevent replays.

{% language-tabs storageKey="webhook-verify" %}

```python {% showCopy=true %}
# pip install pynacl requests
import base64, json, time, requests
from nacl.signing import VerifyKey

JWKS_URL = "https://api.instantdb.com/.well-known/webhooks/jwks.json"
TOLERANCE_SECONDS = 300

def _b64url_decode(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))

def _verify_key_for(kid: str) -> VerifyKey:
    for k in requests.get(JWKS_URL).json()["keys"]:
        if k["kid"] == kid and k["kty"] == "OKP" and k["crv"] == "Ed25519":
            return VerifyKey(_b64url_decode(k["x"]))
    raise ValueError(f"unknown kid {kid}")

def verify_webhook(signature_header: str, raw_body: bytes) -> dict:
    parts = dict(p.split("=", 1) for p in signature_header.split(","))
    t, kid, v1 = parts["t"], parts["kid"], parts["v1"]

    if int(time.time()) - int(t) > TOLERANCE_SECONDS:
        raise ValueError("signature too old")

    message = t.encode("ascii") + b"." + raw_body
    _verify_key_for(kid).verify(message, bytes.fromhex(v1))  # raises BadSignatureError
    return json.loads(raw_body)  # {"payloadUrl": ..., "token": ...}
```

```go {% showCopy=true %}
package webhook

import (
	"crypto/ed25519"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const (
	jwksURL          = "https://api.instantdb.com/.well-known/webhooks/jwks.json"
	toleranceSeconds = 300
)

type WebhookBody struct {
	PayloadURL string `json:"payloadUrl"`
	Token      string `json:"token"`
}

func verifyKeyFor(kid string) (ed25519.PublicKey, error) {
	resp, err := http.Get(jwksURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var ks struct {
		Keys []struct{ Kid, Kty, Crv, X string }
	}
	if err := json.NewDecoder(resp.Body).Decode(&ks); err != nil {
		return nil, err
	}
	for _, k := range ks.Keys {
		if k.Kid == kid && k.Kty == "OKP" && k.Crv == "Ed25519" {
			return base64.RawURLEncoding.DecodeString(k.X)
		}
	}
	return nil, fmt.Errorf("unknown kid %s", kid)
}

func VerifyWebhook(signatureHeader string, rawBody []byte) (*WebhookBody, error) {
	parts := map[string]string{}
	for _, p := range strings.Split(signatureHeader, ",") {
		if kv := strings.SplitN(p, "=", 2); len(kv) == 2 {
			parts[kv[0]] = kv[1]
		}
	}
	t, kid, v1 := parts["t"], parts["kid"], parts["v1"]

	ts, _ := strconv.ParseInt(t, 10, 64)
	if time.Now().Unix()-ts > toleranceSeconds {
		return nil, fmt.Errorf("signature too old")
	}

	sig, err := hex.DecodeString(v1)
	if err != nil {
		return nil, err
	}
	pub, err := verifyKeyFor(kid)
	if err != nil {
		return nil, err
	}
	if !ed25519.Verify(pub, append([]byte(t+"."), rawBody...), sig) {
		return nil, fmt.Errorf("invalid signature")
	}

	var body WebhookBody
	return &body, json.Unmarshal(rawBody, &body)
}
```

```ruby {% showCopy=true %}
# gem install ed25519
require "ed25519"
require "base64"
require "json"
require "net/http"

JWKS_URL = "https://api.instantdb.com/.well-known/webhooks/jwks.json"
TOLERANCE_SECONDS = 300

def verify_key_for(kid)
  keys = JSON.parse(Net::HTTP.get(URI(JWKS_URL)))["keys"]
  jwk = keys.find { |k| k["kid"] == kid && k["kty"] == "OKP" && k["crv"] == "Ed25519" }
  raise "unknown kid #{kid}" unless jwk
  Ed25519::VerifyKey.new(Base64.urlsafe_decode64(jwk["x"]))
end

def verify_webhook(signature_header, raw_body)
  parts = signature_header.split(",").map { |p| p.split("=", 2) }.to_h
  t, kid, v1 = parts["t"], parts["kid"], parts["v1"]

  raise "signature too old" if Time.now.to_i - t.to_i > TOLERANCE_SECONDS

  message = "#{t}.#{raw_body}"
  verify_key_for(kid).verify([v1].pack("H*"), message)  # raises Ed25519::VerifyError
  JSON.parse(raw_body)  # => {"payloadUrl" => ..., "token" => ...}
end
```

```java {% showCopy=true %}
// deps: org.bouncycastle:bcprov-jdk18on, com.fasterxml.jackson.core:jackson-databind
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.HashMap;
import java.util.Map;
import org.bouncycastle.crypto.params.Ed25519PublicKeyParameters;
import org.bouncycastle.crypto.signers.Ed25519Signer;

public class WebhookVerifier {
  static final String JWKS_URL = "https://api.instantdb.com/.well-known/webhooks/jwks.json";
  static final long TOLERANCE_SECONDS = 300;
  static final ObjectMapper JSON = new ObjectMapper();

  public record WebhookBody(String payloadUrl, String token) {}

  static byte[] b64urlDecode(String s) {
    return Base64.getUrlDecoder().decode(s + "=".repeat((4 - s.length() % 4) % 4));
  }

  static Ed25519PublicKeyParameters verifyKeyFor(String kid) throws Exception {
    var resp = HttpClient.newHttpClient().send(
        HttpRequest.newBuilder(URI.create(JWKS_URL)).build(),
        HttpResponse.BodyHandlers.ofString());
    for (var k : JSON.readTree(resp.body()).get("keys")) {
      if (k.get("kid").asText().equals(kid)
          && k.get("kty").asText().equals("OKP")
          && k.get("crv").asText().equals("Ed25519")) {
        return new Ed25519PublicKeyParameters(b64urlDecode(k.get("x").asText()), 0);
      }
    }
    throw new IllegalStateException("unknown kid " + kid);
  }

  public static WebhookBody verify(String signatureHeader, byte[] rawBody) throws Exception {
    Map<String, String> parts = new HashMap<>();
    for (String p : signatureHeader.split(",")) {
      var kv = p.split("=", 2);
      if (kv.length == 2) parts.put(kv[0], kv[1]);
    }
    String t = parts.get("t"), kid = parts.get("kid"), v1 = parts.get("v1");

    if (Instant.now().getEpochSecond() - Long.parseLong(t) > TOLERANCE_SECONDS) {
      throw new IllegalStateException("signature too old");
    }

    var prefix = (t + ".").getBytes(StandardCharsets.UTF_8);
    var message = new byte[prefix.length + rawBody.length];
    System.arraycopy(prefix, 0, message, 0, prefix.length);
    System.arraycopy(rawBody, 0, message, prefix.length, rawBody.length);

    var signer = new Ed25519Signer();
    signer.init(false, verifyKeyFor(kid));
    signer.update(message, 0, message.length);
    if (!signer.verifySignature(HexFormat.of().parseHex(v1))) {
      throw new IllegalStateException("invalid signature");
    }
    return JSON.readValue(rawBody, WebhookBody.class);
  }
}
```

{% /language-tabs %}

### 3. Fetch the payload

Once the signature checks out, parse the body as JSON and `GET` `payloadUrl` with the JWT in the `Authorization` header:

```
GET <payloadUrl>
Authorization: Bearer <token>
Accept: application/json
```

The response contains `data` array of records, plus a top-level `idempotencyKey`. The `token` is short-lived and will only fetch the single payload.

Respond `2xx` once you've durably enqueued the records. Anything else (or no response within 15 seconds) is treated as a failure and the event is retried.
