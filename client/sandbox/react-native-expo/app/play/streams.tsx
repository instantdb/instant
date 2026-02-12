import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { i, id, InstantReactNativeDatabase } from '@instantdb/react-native';
import EphemeralAppPage, {
  ResetButton,
} from '../../components/EphemeralAppPage';

const schema = i.schema({
  entities: {},
});

const rules = {
  $streams: {
    allow: {
      create: 'true',
      view: 'true',
    },
  },
};

type Schema = typeof schema;

function getRandomEmoji() {
  const ranges = [
    [0x1f600, 0x1f64f], // Emoticons
    [0x1f300, 0x1f5ff], // Misc Symbols and Pictographs
    [0x1f680, 0x1f6ff], // Transport and Map
  ];
  const range = ranges[Math.floor(Math.random() * ranges.length)];
  const codePoint =
    Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0];
  return String.fromCodePoint(codePoint);
}

// -- Writer --

function Writer({
  db,
  clientId,
  setClientId,
}: {
  db: InstantReactNativeDatabase<Schema, false>;
  clientId: string;
  setClientId: (id: string) => void;
}) {
  const writerRef = useRef<WritableStreamDefaultWriter<string> | null>(null);
  const [status, setStatus] = useState<'idle' | 'streaming' | 'done' | 'error'>(
    'idle',
  );
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [chunkCount, setChunkCount] = useState(0);

  const [autoEmoji, setAutoEmoji] = useState(false);
  const [emojiRate, setEmojiRate] = useState(1000); // ms

  const startStream = useCallback(async () => {
    const newId = id();
    setClientId(newId);
    setStatus('streaming');
    setError(null);
    setChunkCount(0);
    try {
      const stream = db.streams.createWriteStream({
        clientId: newId,
      });
      writerRef.current = stream.getWriter();
    } catch (e: any) {
      setStatus('error');
      setError(e.message);
    }
  }, [db, setClientId]);

  const sendChunk = useCallback(
    async (content?: string) => {
      if (!writerRef.current) return;
      const data = content || text.trim();
      if (!data) return;
      try {
        await writerRef.current.write(
          JSON.stringify({ text: data, t: Date.now() }) + '\n',
        );
        setChunkCount((c) => c + 1);
        if (!content) setText('');
      } catch {
        // ignore
      }
    },
    [text],
  );

  const sendRandomEmoji = useCallback(() => {
    sendChunk(getRandomEmoji());
  }, [sendChunk]);

  useEffect(() => {
    if (autoEmoji && status === 'streaming') {
      const interval = setInterval(sendRandomEmoji, emojiRate);
      return () => clearInterval(interval);
    }
  }, [autoEmoji, status, sendRandomEmoji, emojiRate]);

  const stopStream = useCallback(async () => {
    if (!writerRef.current) return;
    try {
      await writerRef.current.close();
    } catch {
      // ignore
    }
    writerRef.current = null;
    setStatus('done');
    setAutoEmoji(false);
  }, []);

  const isIdle = status === 'idle' || status === 'done' || status === 'error';

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Write Stream</Text>
      <View style={styles.row}>
        {isIdle ? (
          <Pressable style={styles.buttonRed} onPress={startStream}>
            <Text style={styles.buttonText}>
              {status === 'done' ? 'New Stream' : 'Start Stream'}
            </Text>
          </Pressable>
        ) : (
          <Pressable style={styles.buttonGray} onPress={stopStream}>
            <Text style={styles.buttonText}>Close Stream</Text>
          </Pressable>
        )}
        <Text style={styles.statusText}>
          {status === 'streaming'
            ? `Streaming (${chunkCount} chunks)`
            : status === 'done'
              ? `Done - ${chunkCount} chunks sent`
              : status === 'error'
                ? `Error: ${error}`
                : 'Tap to start'}
        </Text>
      </View>
      {status === 'streaming' && (
        <View style={styles.writerControls}>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.textInput}
              value={text}
              onChangeText={setText}
              placeholder="Type a message..."
              onSubmitEditing={() => sendChunk()}
              returnKeyType="send"
            />
            <Pressable
              style={[styles.buttonBlue, !text.trim() && styles.buttonDisabled]}
              onPress={() => sendChunk()}
              disabled={!text.trim()}
            >
              <Text style={styles.buttonText}>Send</Text>
            </Pressable>
          </View>

          <View style={styles.emojiRow}>
            <Pressable style={styles.buttonEmoji} onPress={sendRandomEmoji}>
              <Text style={styles.buttonText}>Random Emoji</Text>
            </Pressable>
            <Pressable
              style={[
                styles.buttonEmoji,
                autoEmoji ? styles.buttonActive : styles.buttonInactive,
              ]}
              onPress={() => setAutoEmoji(!autoEmoji)}
            >
              <Text style={styles.buttonText}>
                {autoEmoji ? 'Stop Auto' : 'Auto Emoji'}
              </Text>
            </Pressable>
          </View>

          <View style={styles.rateRow}>
            <Text style={styles.rateLabel}>Rate: {emojiRate}ms</Text>
            <View style={styles.rateButtons}>
              <Pressable
                style={styles.buttonRate}
                onPress={() => setEmojiRate((r) => Math.max(100, r - 100))}
              >
                <Text style={styles.buttonText}>-100ms</Text>
              </Pressable>
              <Pressable
                style={styles.buttonRate}
                onPress={() => setEmojiRate((r) => Math.min(5000, r + 100))}
              >
                <Text style={styles.buttonText}>+100ms</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
      {status === 'done' && clientId ? (
        <Text style={styles.mono}>Stream ID: {clientId}</Text>
      ) : null}
    </View>
  );
}

// -- Reader --

type StreamMessage = { text: string; t: number };

function parseMessages(
  raw: string,
  buffer: string,
): { messages: StreamMessage[]; rest: string } {
  const combined = buffer + raw;
  const parts = combined.split('\n');
  const rest = parts.pop()!;
  const messages: StreamMessage[] = [];
  for (const part of parts) {
    if (part.trim()) {
      try {
        messages.push(JSON.parse(part));
      } catch {
        // skip
      }
    }
  }
  return { messages, rest };
}

function Reader({
  db,
  defaultClientId,
}: {
  db: InstantReactNativeDatabase<Schema, false>;
  defaultClientId: string;
}) {
  const [clientId, setClientId] = useState(defaultClientId);
  const [status, setStatus] = useState<
    'idle' | 'loading' | 'playing' | 'done' | 'error'
  >('idle');
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<StreamMessage[]>([]);
  const cancelRef = useRef(false);
  const readerRef = useRef<ReadableStreamDefaultReader<string> | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const play = useCallback(async () => {
    setStatus('loading');
    setError(null);
    setMessages([]);
    cancelRef.current = false;

    try {
      const stream: ReadableStream<string> = db.streams.createReadStream({
        clientId: clientId,
      });
      const reader = stream.getReader();
      readerRef.current = reader;
      setStatus('playing');

      let buffer = '';
      while (true) {
        if (cancelRef.current) break;
        const { value, done } = await reader.read();
        if (done) break;
        if (value !== undefined) {
          const { messages: newMsgs, rest } = parseMessages(value, buffer);
          buffer = rest;
          if (newMsgs.length > 0) {
            setMessages((prev) => [...prev, ...newMsgs]);
          }
        }
      }

      // flush remaining
      if (buffer.trim()) {
        try {
          const msg: StreamMessage = JSON.parse(buffer);
          setMessages((prev) => [...prev, msg]);
        } catch {
          // skip
        }
      }

      readerRef.current = null;
      setStatus('done');
    } catch (e: any) {
      readerRef.current = null;
      setStatus('error');
      setError(e.message);
    }
  }, [db, clientId]);

  const cancel = useCallback(async () => {
    cancelRef.current = true;
    if (readerRef.current) {
      try {
        await readerRef.current.cancel('User cancelled');
      } catch {
        // ignore
      }
      readerRef.current = null;
    }
    setStatus('idle');
  }, []);

  // sync defaultClientId
  const prevDefault = useRef(defaultClientId);
  useEffect(() => {
    if (prevDefault.current !== defaultClientId) {
      prevDefault.current = defaultClientId;
      setClientId(defaultClientId);
    }
  }, [defaultClientId]);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Read Stream</Text>
      <TextInput
        style={styles.textInput}
        value={clientId}
        onChangeText={setClientId}
        placeholder="Stream ID"
        editable={status !== 'loading' && status !== 'playing'}
      />
      <View style={styles.row}>
        {status === 'loading' || status === 'playing' ? (
          <Pressable style={styles.buttonRed} onPress={cancel}>
            <Text style={styles.buttonText}>Stop</Text>
          </Pressable>
        ) : (
          <Pressable
            style={[styles.buttonBlue, !clientId && styles.buttonDisabled]}
            onPress={play}
            disabled={!clientId}
          >
            <Text style={styles.buttonText}>
              {status === 'done' ? 'Replay' : 'Subscribe'}
            </Text>
          </Pressable>
        )}
        <Text style={styles.statusText}>
          {status === 'loading'
            ? 'Connecting...'
            : status === 'playing'
              ? `Receiving... (${messages.length} messages)`
              : status === 'done'
                ? `Done (${messages.length} messages)`
                : status === 'error'
                  ? `Error: ${error}`
                  : ''}
        </Text>
      </View>
      <ScrollView ref={scrollRef} style={styles.messageList}>
        {messages.length === 0 && status !== 'idle' ? (
          <Text style={styles.emptyText}>Waiting for messages...</Text>
        ) : (
          [...messages].reverse().map((msg, idx) => (
            <View key={messages.length - 1 - idx} style={styles.messageBubble}>
              <Text style={styles.messageText}>{msg.text}</Text>
              <Text style={styles.messageTime}>
                {new Date(msg.t).toLocaleTimeString()}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

// -- App --

function App({
  db,
  onReset,
}: {
  db: InstantReactNativeDatabase<Schema, false>;
  onReset?: () => void;
}) {
  const [clientId, setClientId] = useState('');

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.containerContent}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Streams Demo</Text>
        <ResetButton onReset={onReset} />
      </View>
      <Text style={styles.description}>
        Write messages to a stream, then read them back. The writer sends
        newline-delimited JSON chunks. The reader subscribes and displays
        messages as they arrive.
      </Text>
      <Writer db={db} clientId={clientId} setClientId={setClientId} />
      <Reader db={db} defaultClientId={clientId} />
    </ScrollView>
  );
}

export default function Page() {
  return (
    <View style={styles.page}>
      <EphemeralAppPage schema={schema} perms={rules} Component={App} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  containerContent: {
    padding: 16,
    gap: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  description: {
    fontSize: 14,
    color: '#666',
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  writerControls: {
    gap: 12,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  emojiRow: {
    flexDirection: 'row',
    gap: 8,
  },
  rateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f3f4f6',
    padding: 8,
    borderRadius: 6,
  },
  rateLabel: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '500',
  },
  rateButtons: {
    flexDirection: 'row',
    gap: 6,
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  buttonRed: {
    backgroundColor: '#dc2626',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  buttonGray: {
    backgroundColor: '#374151',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  buttonBlue: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  buttonEmoji: {
    flex: 1,
    backgroundColor: '#4b5563',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  buttonRate: {
    backgroundColor: '#9ca3af',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
  },
  buttonActive: {
    backgroundColor: '#059669',
  },
  buttonInactive: {
    backgroundColor: '#4b5563',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  statusText: {
    fontSize: 13,
    color: '#666',
    flexShrink: 1,
  },
  mono: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#666',
  },
  messageList: {
    maxHeight: 300,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 6,
    padding: 8,
    backgroundColor: '#fafafa',
  },
  emptyText: {
    color: '#999',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 20,
  },
  messageBubble: {
    backgroundColor: '#fff',
    padding: 10,
    borderRadius: 6,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  messageText: {
    fontSize: 14,
  },
  messageTime: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
  },
});
