/**
 * Comprehensive test app exercising ALL features of the Go + SQLite backend
 * via the REAL @instantdb/react SDK.
 *
 * Features covered:
 * 1. CRUD operations (create, read, update, delete)
 * 2. Entity linking / unlinking
 * 3. Complex queries (where, order, limit, pagination, aggregation)
 * 4. Real-time subscriptions (cross-tab sync)
 * 5. Authentication (guest)
 * 6. Presence & rooms
 * 7. Broadcasts / topics
 * 8. Typing indicators
 * 9. Connection status
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { db, id, tx } from './db';

// ─── Section 1: CRUD Todos ─────────────────────────────────────────────────

function TodosSection() {
  const { isLoading, error, data } = db.useQuery({ todos: {} });
  const [text, setText] = useState('');

  const addTodo = () => {
    if (!text.trim()) return;
    db.transact(
      tx.todos[id()].update({
        text: text.trim(),
        done: false,
        createdAt: Date.now(),
        priority: 1,
      }),
    );
    setText('');
  };

  const toggleDone = (todo: any) => {
    db.transact(tx.todos[todo.id].update({ done: !todo.done }));
  };

  const deleteTodo = (todo: any) => {
    db.transact(tx.todos[todo.id].delete());
  };

  const deleteAll = () => {
    const todos = data?.todos || [];
    if (todos.length === 0) return;
    db.transact(todos.map((t: any) => tx.todos[t.id].delete()));
  };

  if (isLoading) return <div data-testid="todos-loading">Loading todos...</div>;
  if (error)
    return <div data-testid="todos-error">Error: {error.message}</div>;

  const todos = (data?.todos || []) as any[];

  return (
    <div data-testid="todos-section">
      <h2>Todos CRUD</h2>
      <div data-testid="todos-count">Count: {todos.length}</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input
          data-testid="todo-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addTodo()}
          placeholder="Add todo..."
          style={{ flex: 1, padding: '6px 10px' }}
        />
        <button data-testid="todo-add-btn" onClick={addTodo}>
          Add
        </button>
      </div>
      <button
        data-testid="todo-delete-all-btn"
        onClick={deleteAll}
        style={{ marginBottom: 8 }}
      >
        Delete All
      </button>
      <ul data-testid="todo-list" style={{ listStyle: 'none', padding: 0 }}>
        {todos.map((todo: any) => (
          <li
            key={todo.id}
            data-testid="todo-item"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '4px 0',
              borderBottom: '1px solid #eee',
            }}
          >
            <input
              type="checkbox"
              data-testid="todo-checkbox"
              checked={!!todo.done}
              onChange={() => toggleDone(todo)}
            />
            <span
              data-testid="todo-text"
              style={{
                flex: 1,
                textDecoration: todo.done ? 'line-through' : 'none',
              }}
            >
              {todo.text}
            </span>
            <span data-testid="todo-priority" style={{ fontSize: 12, color: '#999' }}>
              p{todo.priority}
            </span>
            <button
              data-testid="todo-delete-btn"
              onClick={() => deleteTodo(todo)}
              style={{ fontSize: 12 }}
            >
              X
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Section 2: Projects + Linking ──────────────────────────────────────────

function LinkingSection() {
  const { data: todosData } = db.useQuery({ todos: { project: {} } });
  const { data: projectsData } = db.useQuery({ projects: { todos: {} } });
  const [projectName, setProjectName] = useState('');

  const addProject = () => {
    if (!projectName.trim()) return;
    db.transact(
      tx.projects[id()].update({
        name: projectName.trim(),
        color: '#' + Math.floor(Math.random() * 16777215).toString(16),
        createdAt: Date.now(),
      }),
    );
    setProjectName('');
  };

  const linkTodoToProject = (todoId: string, projectId: string) => {
    db.transact(tx.todos[todoId].link({ project: projectId }));
  };

  const unlinkTodoFromProject = (todoId: string, projectId: string) => {
    db.transact(tx.todos[todoId].unlink({ project: projectId }));
  };

  const deleteProject = (projectId: string) => {
    db.transact(tx.projects[projectId].delete());
  };

  const todos = (todosData?.todos || []) as any[];
  const projects = (projectsData?.projects || []) as any[];

  return (
    <div data-testid="linking-section">
      <h2>Projects & Linking</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input
          data-testid="project-input"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addProject()}
          placeholder="Project name..."
          style={{ flex: 1, padding: '6px 10px' }}
        />
        <button data-testid="project-add-btn" onClick={addProject}>
          Add Project
        </button>
      </div>
      <div data-testid="project-count">Projects: {projects.length}</div>
      <ul
        data-testid="project-list"
        style={{ listStyle: 'none', padding: 0, marginBottom: 12 }}
      >
        {projects.map((p: any) => (
          <li
            key={p.id}
            data-testid="project-item"
            style={{
              padding: '4px 0',
              borderBottom: '1px solid #eee',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span data-testid="project-name" style={{ flex: 1 }}>
              {p.name}
            </span>
            <span data-testid="project-todo-count" style={{ fontSize: 12, color: '#999' }}>
              ({(p.todos || []).length} todos)
            </span>
            <button
              data-testid="project-delete-btn"
              onClick={() => deleteProject(p.id)}
              style={{ fontSize: 12 }}
            >
              X
            </button>
          </li>
        ))}
      </ul>

      {/* Link/unlink controls */}
      {todos.length > 0 && projects.length > 0 && (
        <div data-testid="link-controls">
          <h3>Link Todo → Project</h3>
          {todos.map((todo: any) => (
            <div
              key={todo.id}
              data-testid="link-row"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '4px 0',
                fontSize: 13,
              }}
            >
              <span data-testid="link-todo-text">{todo.text}</span>
              <span>→</span>
              <span data-testid="link-current-project">
                {todo.project?.[0]?.name || 'none'}
              </span>
              {projects.map((p: any) => (
                <button
                  key={p.id}
                  data-testid={`link-btn-${p.name}`}
                  onClick={() => linkTodoToProject(todo.id, p.id)}
                  style={{ fontSize: 11 }}
                >
                  → {p.name}
                </button>
              ))}
              {todo.project?.[0] && (
                <button
                  data-testid="unlink-btn"
                  onClick={() =>
                    unlinkTodoFromProject(todo.id, todo.project[0].id)
                  }
                  style={{ fontSize: 11, color: 'red' }}
                >
                  Unlink
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Section 3: Complex Queries ─────────────────────────────────────────────

function QueriesSection() {
  const [queryType, setQueryType] = useState<string>('all');

  // Different query variants
  const allQuery = db.useQuery({ messages: {} });

  const filteredQuery = db.useQuery(
    queryType === 'filtered'
      ? { messages: { $: { where: { category: 'bug' } } } }
      : null,
  );

  const orderedQuery = db.useQuery(
    queryType === 'ordered'
      ? {
          messages: {
            $: { order: { serverCreatedAt: 'desc' as const }, limit: 5 },
          },
        }
      : null,
  );

  const comparisonQuery = db.useQuery(
    queryType === 'comparison'
      ? { messages: { $: { where: { priority: { $gt: 3 } } } } }
      : null,
  );

  const activeData =
    queryType === 'all'
      ? allQuery
      : queryType === 'filtered'
        ? filteredQuery
        : queryType === 'ordered'
          ? orderedQuery
          : comparisonQuery;

  const [msgContent, setMsgContent] = useState('');
  const [msgCategory, setMsgCategory] = useState('feature');
  const [msgPriority, setMsgPriority] = useState(3);

  const addMessage = () => {
    if (!msgContent.trim()) return;
    db.transact(
      tx.messages[id()].update({
        content: msgContent.trim(),
        sender: 'test-user',
        category: msgCategory,
        priority: msgPriority,
        createdAt: Date.now(),
      }),
    );
    setMsgContent('');
  };

  const deleteAllMessages = () => {
    const messages = (allQuery.data?.messages || []) as any[];
    if (messages.length === 0) return;
    db.transact(messages.map((m: any) => tx.messages[m.id].delete()));
  };

  const messages = (activeData.data?.messages || []) as any[];
  const totalCount = ((allQuery.data?.messages || []) as any[]).length;

  return (
    <div data-testid="queries-section">
      <h2>Queries</h2>

      {/* Add message form */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <input
          data-testid="msg-input"
          value={msgContent}
          onChange={(e) => setMsgContent(e.target.value)}
          placeholder="Message..."
          style={{ flex: 1, padding: '6px 10px', minWidth: 120 }}
        />
        <select
          data-testid="msg-category"
          value={msgCategory}
          onChange={(e) => setMsgCategory(e.target.value)}
          style={{ padding: '6px 10px' }}
        >
          <option value="feature">feature</option>
          <option value="bug">bug</option>
          <option value="docs">docs</option>
        </select>
        <input
          data-testid="msg-priority"
          type="number"
          value={msgPriority}
          onChange={(e) => setMsgPriority(Number(e.target.value))}
          min={1}
          max={5}
          style={{ width: 60, padding: '6px 10px' }}
        />
        <button data-testid="msg-add-btn" onClick={addMessage}>
          Add
        </button>
        <button data-testid="msg-delete-all-btn" onClick={deleteAllMessages}>
          Clear
        </button>
      </div>

      {/* Query type selector */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        {['all', 'filtered', 'ordered', 'comparison'].map((qt) => (
          <button
            key={qt}
            data-testid={`query-btn-${qt}`}
            onClick={() => setQueryType(qt)}
            style={{
              fontWeight: queryType === qt ? 'bold' : 'normal',
              textDecoration: queryType === qt ? 'underline' : 'none',
            }}
          >
            {qt}
          </button>
        ))}
      </div>

      <div data-testid="query-type-display">Query: {queryType}</div>
      <div data-testid="total-message-count">Total: {totalCount}</div>
      <div data-testid="filtered-message-count">Showing: {messages.length}</div>

      {activeData.isLoading && (
        <div data-testid="query-loading">Loading...</div>
      )}
      <ul data-testid="message-list" style={{ listStyle: 'none', padding: 0 }}>
        {messages.map((msg: any) => (
          <li
            key={msg.id}
            data-testid="message-item"
            style={{
              padding: '4px 0',
              borderBottom: '1px solid #eee',
              fontSize: 13,
            }}
          >
            <span data-testid="message-content">{msg.content}</span>{' '}
            <span
              data-testid="message-category"
              style={{ color: '#999', fontSize: 11 }}
            >
              [{msg.category}]
            </span>{' '}
            <span
              data-testid="message-priority"
              style={{ color: '#666', fontSize: 11 }}
            >
              p{msg.priority}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Section 4: Authentication ──────────────────────────────────────────────

function AuthSection() {
  const { isLoading, user, error } = db.useAuth();

  const signInAsGuest = async () => {
    try {
      await db.auth.signInAsGuest();
    } catch (e: any) {
      console.error('Guest sign-in failed:', e);
    }
  };

  const signOut = async () => {
    await db.auth.signOut();
  };

  return (
    <div data-testid="auth-section">
      <h2>Authentication</h2>
      {isLoading && <div data-testid="auth-loading">Loading auth...</div>}
      {error && (
        <div data-testid="auth-error">Auth error: {error.message}</div>
      )}
      {user ? (
        <div data-testid="auth-user">
          <div data-testid="auth-user-id">User ID: {user.id}</div>
          <div data-testid="auth-user-email">
            Email: {user.email || 'guest'}
          </div>
          <button data-testid="auth-signout-btn" onClick={signOut}>
            Sign Out
          </button>
        </div>
      ) : (
        <div data-testid="auth-signed-out">
          <div>Not signed in</div>
          <button data-testid="auth-guest-btn" onClick={signInAsGuest}>
            Sign In as Guest
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Section 5: Presence & Rooms ────────────────────────────────────────────

function PresenceSection() {
  const room = db.room('test-room', 'main');
  const { peers, publishPresence, isLoading } = db.rooms.usePresence(room);
  const [nickname, setNickname] = useState(
    'User-' + Math.random().toString(36).slice(2, 6),
  );
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    publishPresence({ nickname, cursor: cursorPos });
  }, [nickname]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const pos = {
        x: Math.round(e.clientX - rect.left),
        y: Math.round(e.clientY - rect.top),
      };
      setCursorPos(pos);
      publishPresence({ nickname, cursor: pos });
    },
    [nickname, publishPresence],
  );

  const peerList = Object.entries(peers || {});

  return (
    <div data-testid="presence-section">
      <h2>Presence & Rooms</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input
          data-testid="presence-nickname"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="Nickname..."
          style={{ flex: 1, padding: '6px 10px' }}
        />
      </div>
      <div data-testid="presence-peer-count">
        Peers online: {peerList.length}
      </div>
      {isLoading && <div data-testid="presence-loading">Loading...</div>}
      <ul
        data-testid="presence-peer-list"
        style={{ listStyle: 'none', padding: 0, marginBottom: 8 }}
      >
        {peerList.map(([peerId, peerData]: [string, any]) => (
          <li
            key={peerId}
            data-testid="presence-peer"
            style={{ fontSize: 13, padding: '2px 0' }}
          >
            <span data-testid="peer-nickname">
              {peerData.nickname || 'anon'}
            </span>{' '}
            <span style={{ color: '#999', fontSize: 11 }}>
              ({peerData.cursor?.x ?? '-'}, {peerData.cursor?.y ?? '-'})
            </span>
          </li>
        ))}
      </ul>

      {/* Cursor canvas */}
      <div
        ref={canvasRef}
        data-testid="cursor-canvas"
        onMouseMove={handleMouseMove}
        style={{
          position: 'relative',
          border: '2px dashed #ccc',
          height: 120,
          background: '#fafafa',
          overflow: 'hidden',
          cursor: 'crosshair',
        }}
      >
        <div
          style={{
            position: 'absolute',
            fontSize: 11,
            color: '#999',
            top: 4,
            left: 4,
          }}
        >
          Move mouse here
        </div>
        {peerList.map(([peerId, peerData]: [string, any]) =>
          peerData.cursor ? (
            <div
              key={peerId}
              data-testid="peer-cursor"
              style={{
                position: 'absolute',
                left: peerData.cursor.x,
                top: peerData.cursor.y,
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#4f46e5',
                transform: 'translate(-4px, -4px)',
                pointerEvents: 'none',
              }}
            />
          ) : null,
        )}
      </div>
      <div data-testid="cursor-position" style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
        Cursor: ({cursorPos.x}, {cursorPos.y})
      </div>
    </div>
  );
}

// ─── Section 6: Broadcasts / Topics ─────────────────────────────────────────

function BroadcastSection() {
  const room = db.room('test-room', 'main');
  const [broadcastLog, setBroadcastLog] = useState<string[]>([]);
  const [broadcastMsg, setBroadcastMsg] = useState('');

  const publishEmoji = db.rooms.usePublishTopic(room, 'emoji' as any);
  const publishChat = db.rooms.usePublishTopic(room, 'chat' as any);

  db.rooms.useTopicEffect(room, 'emoji' as any, (event: any, peer: any) => {
    setBroadcastLog((prev) => [
      ...prev.slice(-19),
      `[emoji] ${peer?.nickname || 'anon'}: ${event?.emoji || '?'}`,
    ]);
  });

  db.rooms.useTopicEffect(room, 'chat' as any, (event: any, peer: any) => {
    setBroadcastLog((prev) => [
      ...prev.slice(-19),
      `[chat] ${peer?.nickname || 'anon'}: ${event?.text || '?'}`,
    ]);
  });

  const sendEmoji = (emoji: string) => {
    publishEmoji({ emoji } as any);
  };

  const sendChat = () => {
    if (!broadcastMsg.trim()) return;
    publishChat({ text: broadcastMsg.trim() } as any);
    setBroadcastMsg('');
  };

  return (
    <div data-testid="broadcast-section">
      <h2>Broadcasts / Topics</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        {['🔥', '👍', '❤️', '🎉'].map((emoji) => (
          <button
            key={emoji}
            data-testid={`emoji-btn-${emoji}`}
            onClick={() => sendEmoji(emoji)}
            style={{ fontSize: 18 }}
          >
            {emoji}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input
          data-testid="broadcast-input"
          value={broadcastMsg}
          onChange={(e) => setBroadcastMsg(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendChat()}
          placeholder="Broadcast message..."
          style={{ flex: 1, padding: '6px 10px' }}
        />
        <button data-testid="broadcast-send-btn" onClick={sendChat}>
          Send
        </button>
      </div>
      <div
        data-testid="broadcast-log"
        style={{
          background: '#1e293b',
          color: '#e2e8f0',
          padding: 8,
          borderRadius: 4,
          fontFamily: 'monospace',
          fontSize: 12,
          minHeight: 60,
          maxHeight: 150,
          overflowY: 'auto',
        }}
      >
        <div data-testid="broadcast-count">
          Messages: {broadcastLog.length}
        </div>
        {broadcastLog.map((entry, i) => (
          <div key={i} data-testid="broadcast-entry">
            {entry}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Section 7: Typing Indicator ────────────────────────────────────────────

function TypingSection() {
  const room = db.room('test-room', 'main');
  const { active, inputProps } = db.rooms.useTypingIndicator(
    room,
    'chat-typing' as any,
    {
      timeout: 2000,
      stopOnEnter: true,
    },
  );

  return (
    <div data-testid="typing-section">
      <h2>Typing Indicator</h2>
      <input
        data-testid="typing-input"
        {...inputProps}
        placeholder="Type something..."
        style={{ width: '100%', padding: '6px 10px', marginBottom: 8 }}
      />
      <div data-testid="typing-active-count">
        Typing: {(active || []).length}
      </div>
      <div data-testid="typing-peers" style={{ fontSize: 13, color: '#999' }}>
        {(active || []).length > 0
          ? `${(active as any[]).map((p) => p.nickname || 'someone').join(', ')} typing...`
          : 'No one is typing'}
      </div>
    </div>
  );
}

// ─── Section 8: Connection Status ───────────────────────────────────────────

function ConnectionSection() {
  const status = db.useConnectionStatus();

  const statusLabel =
    status === 'connecting' || status === 'opened'
      ? 'authenticating'
      : status === 'authenticated'
        ? 'connected'
        : status === 'closed'
          ? 'closed'
          : status === 'errored'
            ? 'errored'
            : 'unknown';

  return (
    <div data-testid="connection-section">
      <h2>Connection</h2>
      <div data-testid="connection-raw-status">Raw: {status}</div>
      <div data-testid="connection-status">Status: {statusLabel}</div>
    </div>
  );
}

// ─── Section 9: Batch Transactions ──────────────────────────────────────────

function BatchSection() {
  const [batchCount, setBatchCount] = useState(5);
  const [batchResult, setBatchResult] = useState('');
  const { data } = db.useQuery({ todos: {} });

  const runBatch = async () => {
    const start = Date.now();
    const txns = [];
    for (let i = 0; i < batchCount; i++) {
      txns.push(
        tx.todos[id()].update({
          text: `Batch item ${i + 1}`,
          done: false,
          createdAt: Date.now() + i,
          priority: (i % 5) + 1,
        }),
      );
    }
    await db.transact(txns);
    const elapsed = Date.now() - start;
    setBatchResult(`Created ${batchCount} todos in ${elapsed}ms`);
  };

  const updateAllPriority = async () => {
    const todos = (data?.todos || []) as any[];
    if (todos.length === 0) return;
    const start = Date.now();
    await db.transact(
      todos.map((t: any) => tx.todos[t.id].update({ priority: 5 })),
    );
    const elapsed = Date.now() - start;
    setBatchResult(`Updated ${todos.length} todos in ${elapsed}ms`);
  };

  return (
    <div data-testid="batch-section">
      <h2>Batch Transactions</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
        <label>Count:</label>
        <input
          data-testid="batch-count"
          type="number"
          value={batchCount}
          onChange={(e) => setBatchCount(Number(e.target.value))}
          min={1}
          max={100}
          style={{ width: 60, padding: '6px 10px' }}
        />
        <button data-testid="batch-create-btn" onClick={runBatch}>
          Batch Create
        </button>
        <button data-testid="batch-update-btn" onClick={updateAllPriority}>
          Update All p5
        </button>
      </div>
      <div data-testid="batch-result" style={{ fontSize: 13, color: '#666' }}>
        {batchResult}
      </div>
    </div>
  );
}

// ─── Main App ───────────────────────────────────────────────────────────────

export default function App() {
  const [activeTab, setActiveTab] = useState('todos');

  const tabs = [
    { id: 'todos', label: 'Todos' },
    { id: 'linking', label: 'Linking' },
    { id: 'queries', label: 'Queries' },
    { id: 'auth', label: 'Auth' },
    { id: 'presence', label: 'Presence' },
    { id: 'broadcast', label: 'Broadcast' },
    { id: 'typing', label: 'Typing' },
    { id: 'batch', label: 'Batch' },
    { id: 'connection', label: 'Connection' },
  ];

  return (
    <div
      data-testid="app-root"
      style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 800, margin: '0 auto', padding: 20 }}
    >
      <h1 data-testid="app-title">Instant Feature Test</h1>

      {/* Connection status bar */}
      <ConnectionSection />

      {/* Tab navigation */}
      <div
        data-testid="tab-nav"
        style={{
          display: 'flex',
          gap: 0,
          borderBottom: '2px solid #ddd',
          marginBottom: 16,
          marginTop: 16,
          flexWrap: 'wrap',
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            data-testid={`tab-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderBottom:
                activeTab === tab.id ? '2px solid #4f46e5' : '2px solid transparent',
              marginBottom: -2,
              background: 'none',
              cursor: 'pointer',
              fontWeight: activeTab === tab.id ? 'bold' : 'normal',
              color: activeTab === tab.id ? '#4f46e5' : '#666',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div data-testid="tab-content" style={{ minHeight: 300 }}>
        {activeTab === 'todos' && <TodosSection />}
        {activeTab === 'linking' && <LinkingSection />}
        {activeTab === 'queries' && <QueriesSection />}
        {activeTab === 'auth' && <AuthSection />}
        {activeTab === 'presence' && <PresenceSection />}
        {activeTab === 'broadcast' && <BroadcastSection />}
        {activeTab === 'typing' && <TypingSection />}
        {activeTab === 'batch' && <BatchSection />}
        {activeTab === 'connection' && <ConnectionSection />}
      </div>
    </div>
  );
}
