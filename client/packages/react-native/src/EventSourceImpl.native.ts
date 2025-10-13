import { type EventSourceType } from '@instantdb/core';

// Modified version of https://github.com/binaryminds/react-native-sse/blob/master/src/EventSource.js
// that conforms to out `EventSourceType` subset of the browser-native `EventSource`.

const XMLReadyStateMap = [
  'UNSENT',
  'OPENED',
  'HEADERS_RECEIVED',
  'LOADING',
  'DONE',
];

class EventSource implements EventSourceType {
  private ERROR = -1;
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;

  private CRLF = '\r\n';
  private LF = '\n';
  private CR = '\r';

  readonly url: string;

  onopen;
  onerror;
  onmessage;

  debug: boolean;

  private status: number;

  private headers = {
    Accept: 'text/event-stream',
    'Cache-Control': 'no-cache',
    'X-Requested-With': 'XMLHttpRequest',
  };

  private _xhr: XMLHttpRequest | null;
  private lineEndingCharacter: string | null;
  private _lastIndexProcessed: number;

  constructor(url) {
    this.status = EventSource.CONNECTING;

    this.lineEndingCharacter = null;
    this._xhr = null;
    this._lastIndexProcessed = 0;
    this.debug = false;

    if (!url || typeof url !== 'string') {
      throw new SyntaxError('[EventSource] Invalid URL argument.');
    }

    this.url = url;

    this.open();
  }

  public get readyState() {
    if (this.status === this.ERROR) {
      return EventSource.CLOSED;
    }
    return this.status;
  }

  open() {
    try {
      this.status = EventSource.CONNECTING;

      this._lastIndexProcessed = 0;

      this._xhr = new XMLHttpRequest();
      this._xhr.open('GET', this.url, true);

      for (const [key, value] of Object.entries(this.headers)) {
        if (value !== undefined && value !== null) {
          this._xhr.setRequestHeader(key, value);
        }
      }

      this._xhr.onreadystatechange = () => {
        if (this.status === EventSource.CLOSED) {
          return;
        }

        const xhr = this._xhr;

        this._logDebug(
          `[EventSource][onreadystatechange] ReadyState: ${XMLReadyStateMap[xhr.readyState] || 'Unknown'}(${
            xhr.readyState
          }), status: ${xhr.status}`,
        );

        if (
          xhr.readyState !== XMLHttpRequest.DONE &&
          xhr.readyState !== XMLHttpRequest.LOADING
        ) {
          return;
        }

        if (xhr.status >= 200 && xhr.status < 400) {
          if (this.status === EventSource.CONNECTING) {
            this.status = EventSource.OPEN;
            this.dispatch('open', { type: 'open' });
            this._logDebug(
              '[EventSource][onreadystatechange][OPEN] Connection opened.',
            );
          }

          this._handleEvent(xhr.responseText || '');

          if (xhr.readyState === XMLHttpRequest.DONE) {
            this._logDebug(
              '[EventSource][onreadystatechange][DONE] Operation done.',
            );
            this.dispatch('error', { type: 'error' });
          }
        } else if (xhr.status !== 0) {
          this.status = this.ERROR;
          this.dispatch('error', {
            type: 'error',
            message: xhr.responseText,
            xhrStatus: xhr.status,
            xhrState: xhr.readyState,
          });

          if (xhr.readyState === XMLHttpRequest.DONE) {
            this._logDebug(
              '[EventSource][onreadystatechange][ERROR] Response status error.',
            );
          }
        }
      };

      this._xhr.onerror = () => {
        if (this.status === EventSource.CLOSED) {
          return;
        }

        this.status = this.ERROR;
        this.dispatch('error', {
          type: 'error',
          message: this._xhr.responseText,
          xhrStatus: this._xhr.status,
          xhrState: this._xhr.readyState,
        });
      };

      this._xhr.send();
    } catch (e) {
      this.status = this.ERROR;
      this.dispatch('error', {
        type: 'exception',
        message: e.message,
        error: e,
      });
    }
  }

  _logDebug(...msg) {
    if (this.debug) {
      console.debug(...msg);
    }
  }

  _handleEvent(response) {
    if (this.lineEndingCharacter === null) {
      const detectedNewlineChar = this._detectNewlineChar(response);
      if (detectedNewlineChar !== null) {
        this._logDebug(
          `[EventSource] Automatically detected lineEndingCharacter: ${JSON.stringify(
            detectedNewlineChar,
          ).slice(1, -1)}`,
        );
        this.lineEndingCharacter = detectedNewlineChar;
      } else {
        console.warn(
          "[EventSource] Unable to identify the line ending character. Ensure your server delivers a standard line ending character: \\r\\n, \\n, \\r, or specify your custom character using the 'lineEndingCharacter' option.",
        );
        return;
      }
    }

    const indexOfDoubleNewline = this._getLastDoubleNewlineIndex(response);
    if (indexOfDoubleNewline <= this._lastIndexProcessed) {
      return;
    }

    const parts = response
      .substring(this._lastIndexProcessed, indexOfDoubleNewline)
      .split(this.lineEndingCharacter);

    this._lastIndexProcessed = indexOfDoubleNewline;

    let type = undefined;
    let data = [];
    let line = '';

    for (let i = 0; i < parts.length; i++) {
      line = parts[i].trim();
      if (line.startsWith('event')) {
        type = line.replace(/event:?\s*/, '');
      } else if (line.startsWith('retry')) {
        // Ignore for our use case, we'll reconnect with a new
        // instance on error
      } else if (line.startsWith('data')) {
        data.push(line.replace(/data:?\s*/, ''));
      } else if (line.startsWith('id')) {
        // Ignore this, not used for our use case
      } else if (line === '') {
        if (data.length > 0) {
          const eventType = type || 'message';
          const event = {
            type: eventType,
            data: data.join('\n'),
            url: this.url,
          };

          this.dispatch(eventType, event);

          data = [];
          type = undefined;
        }
      }
    }
  }

  _detectNewlineChar(response) {
    const supportedLineEndings = [this.CRLF, this.LF, this.CR];
    for (const char of supportedLineEndings) {
      if (response.includes(char)) {
        return char;
      }
    }
    return null;
  }

  _getLastDoubleNewlineIndex(response) {
    const doubleLineEndingCharacter =
      this.lineEndingCharacter + this.lineEndingCharacter;
    const lastIndex = response.lastIndexOf(doubleLineEndingCharacter);
    if (lastIndex === -1) {
      return -1;
    }

    return lastIndex + doubleLineEndingCharacter.length;
  }

  dispatch(type, data) {
    switch (type) {
      case 'open': {
        if (this.onopen) {
          this.onopen(data);
        }
        break;
      }
      case 'error': {
        if (this.onerror) {
          this.onerror(data);
        }
        break;
      }
      case 'message': {
        if (this.onmessage) {
          this.onmessage(data);
        }
        break;
      }
    }
  }

  close() {
    if (this.status !== EventSource.CLOSED) {
      this.status = EventSource.CLOSED;
    }

    if (this._xhr) {
      this._xhr.abort();
    }
  }
}

export default EventSource;
