// Service worker used by native-file-system-adapter's download fallback.
// It receives a ReadableStream over a MessagePort and serves it as a normal
// browser download, avoiding full Blob buffering in browsers without native
// showSaveFilePicker.

// These numeric message-type values must stay in sync with the upstream
// download fallback in native-file-system-adapter@3.0.1
// (src/adapters/downloader.js). This service worker is a hand-maintained
// mirror of that file's protocol, so re-verify these constants against the
// upstream source whenever the native-file-system-adapter dependency is bumped.
const WRITE = 0;
const PULL = 0;
const ERROR = 1;
const ABORT = 1;
const CLOSE = 2;

class MessagePortSource {
  constructor(port) {
    this.port = port;
    this.port.onmessage = (evt) => this.onMessage(evt.data);
  }

  start(controller) {
    this.controller = controller;
  }

  pull() {
    this.port.postMessage({ type: PULL });
  }

  cancel(reason) {
    this.port.postMessage({ type: ERROR, reason: reason?.message });
    this.port.close();
  }

  onMessage(message) {
    if (message.type === WRITE) {
      this.controller.enqueue(message.chunk);
    }
    if (message.type === ABORT) {
      this.controller.error(message.reason);
      this.port.close();
    }
    if (message.type === CLOSE) {
      this.controller.close();
      this.port.close();
    }
  }
}

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

const downloads = new Map();

self.addEventListener('message', (evt) => {
  const data = evt.data;
  if (data.url && data.readablePort) {
    data.rs = new ReadableStream(
      new MessagePortSource(data.readablePort),
      new CountQueuingStrategy({ highWaterMark: 4 }),
    );
    downloads.set(data.url, data);
  }
});

self.addEventListener('fetch', (evt) => {
  const data = downloads.get(evt.request.url);
  if (!data) return;
  downloads.delete(evt.request.url);
  evt.respondWith(
    new Response(data.rs, {
      headers: data.headers,
    }),
  );
});
