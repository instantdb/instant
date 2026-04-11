/**
 * Comprehensive E2E tests for ALL features of the Go + SQLite backend
 * using REAL @instantdb/react in a headless browser via Playwright.
 *
 * Features tested:
 * 1. CRUD operations (create, read, update, delete)
 * 2. Entity linking / unlinking
 * 3. Complex queries (where, order, limit, comparison)
 * 4. Real-time cross-tab sync
 * 5. Authentication (guest)
 * 6. Presence & rooms
 * 7. Broadcasts / topics
 * 8. Typing indicators
 * 9. Connection status
 * 10. Batch transactions
 * 11. Data persistence
 */
import { test, expect, type Page } from '@playwright/test';
import {
  setupTestApp,
  seedTodos,
  seedMessages,
  clearAll,
  clearTodos,
  clearEntities,
  adminQuery,
  type TestAppInfo,
} from './setup';

let app: TestAppInfo;

test.beforeAll(async () => {
  app = await setupTestApp();
});

test.beforeEach(async () => {
  await clearAll(app.appId, app.adminToken);
});

// ---- Helpers ----

async function waitForApp(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('app-title')).toBeVisible({ timeout: 15000 });
}

async function navigateTab(page: Page, tabId: string) {
  await page.getByTestId(`tab-${tabId}`).click();
}

async function addTodoViaUI(page: Page, text: string) {
  const input = page.getByTestId('todo-input');
  await input.fill(text);
  await page.getByTestId('todo-add-btn').click();
}

// ─── 1. Connection Status ───────────────────────────────────────────────────

test.describe('Connection Status', () => {
  test('shows connected status after init', async ({ page }) => {
    await waitForApp(page);
    // Connection section is always visible at the top
    await expect(page.getByTestId('connection-raw-status')).toContainText(
      'authenticated',
      { timeout: 15000 },
    );
    await expect(page.getByTestId('connection-status')).toContainText(
      'connected',
    );
  });
});

// ─── 2. Todos CRUD ──────────────────────────────────────────────────────────

test.describe('Todos CRUD', () => {
  test('app loads and shows empty todo list', async ({ page }) => {
    await waitForApp(page);
    await expect(page.getByTestId('todos-section')).toBeVisible();
    await expect(page.getByTestId('todos-count')).toHaveText('Count: 0');
  });

  test('adds a todo via input', async ({ page }) => {
    await waitForApp(page);
    await addTodoViaUI(page, 'Buy groceries');
    await expect(page.getByTestId('todo-item')).toHaveCount(1, {
      timeout: 5000,
    });
    await expect(page.getByTestId('todo-text').first()).toHaveText(
      'Buy groceries',
    );
    await expect(page.getByTestId('todos-count')).toHaveText('Count: 1');
  });

  test('adds a todo by pressing Enter', async ({ page }) => {
    await waitForApp(page);
    const input = page.getByTestId('todo-input');
    await input.fill('Press enter todo');
    await input.press('Enter');
    await expect(page.getByTestId('todo-item')).toHaveCount(1, {
      timeout: 5000,
    });
    await expect(page.getByTestId('todo-text').first()).toHaveText(
      'Press enter todo',
    );
  });

  test('input clears after adding', async ({ page }) => {
    await waitForApp(page);
    await addTodoViaUI(page, 'Clear test');
    await expect(page.getByTestId('todo-input')).toHaveValue('');
  });

  test('adds multiple todos', async ({ page }) => {
    await waitForApp(page);
    await addTodoViaUI(page, 'First');
    await expect(page.getByTestId('todo-item')).toHaveCount(1, {
      timeout: 5000,
    });
    await addTodoViaUI(page, 'Second');
    await expect(page.getByTestId('todo-item')).toHaveCount(2, {
      timeout: 5000,
    });
    await addTodoViaUI(page, 'Third');
    await expect(page.getByTestId('todo-item')).toHaveCount(3, {
      timeout: 5000,
    });
  });

  test('toggles todo done state', async ({ page }) => {
    await waitForApp(page);
    await addTodoViaUI(page, 'Toggle me');
    await expect(page.getByTestId('todo-item')).toHaveCount(1, {
      timeout: 5000,
    });

    await page.getByTestId('todo-checkbox').first().click();
    await expect(page.getByTestId('todo-text').first()).toHaveCSS(
      'text-decoration-line',
      'line-through',
      { timeout: 5000 },
    );

    await page.getByTestId('todo-checkbox').first().click();
    await expect(page.getByTestId('todo-text').first()).toHaveCSS(
      'text-decoration-line',
      'none',
      { timeout: 5000 },
    );
  });

  test('deletes a single todo', async ({ page }) => {
    await waitForApp(page);
    await addTodoViaUI(page, 'Delete me');
    await expect(page.getByTestId('todo-item')).toHaveCount(1, {
      timeout: 5000,
    });

    await page.getByTestId('todo-delete-btn').first().click();
    await expect(page.getByTestId('todo-item')).toHaveCount(0, {
      timeout: 5000,
    });
  });

  test('deletes all todos', async ({ page }) => {
    await waitForApp(page);
    await addTodoViaUI(page, 'A');
    await addTodoViaUI(page, 'B');
    await addTodoViaUI(page, 'C');
    await expect(page.getByTestId('todo-item')).toHaveCount(3, {
      timeout: 5000,
    });

    await page.getByTestId('todo-delete-all-btn').click();
    await expect(page.getByTestId('todo-item')).toHaveCount(0, {
      timeout: 5000,
    });
  });

  test('renders seeded todos from server', async ({ page }) => {
    await seedTodos(app.appId, app.adminToken, 3);
    await waitForApp(page);
    await expect(page.getByTestId('todo-item').first()).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByTestId('todo-item')).toHaveCount(3);
  });

  test('empty input does not add todo', async ({ page }) => {
    await waitForApp(page);
    await page.getByTestId('todo-add-btn').click();
    // Small wait to verify nothing was added
    await page.waitForTimeout(500);
    await expect(page.getByTestId('todo-item')).toHaveCount(0);
  });
});

// ─── 3. Projects & Linking ──────────────────────────────────────────────────

test.describe('Projects & Linking', () => {
  test('creates a project', async ({ page }) => {
    await waitForApp(page);
    await navigateTab(page, 'linking');
    await expect(page.getByTestId('linking-section')).toBeVisible();

    const input = page.getByTestId('project-input');
    await input.fill('Work');
    await page.getByTestId('project-add-btn').click();

    await expect(page.getByTestId('project-item')).toHaveCount(1, {
      timeout: 5000,
    });
    await expect(page.getByTestId('project-name').first()).toHaveText('Work');
  });

  test('creates multiple projects', async ({ page }) => {
    await waitForApp(page);
    await navigateTab(page, 'linking');

    for (const name of ['Work', 'Personal', 'Hobby']) {
      const input = page.getByTestId('project-input');
      await input.fill(name);
      await page.getByTestId('project-add-btn').click();
    }
    await expect(page.getByTestId('project-item')).toHaveCount(3, {
      timeout: 5000,
    });
  });

  test('deletes a project', async ({ page }) => {
    await waitForApp(page);
    await navigateTab(page, 'linking');

    const input = page.getByTestId('project-input');
    await input.fill('Temp');
    await page.getByTestId('project-add-btn').click();
    await expect(page.getByTestId('project-item')).toHaveCount(1, {
      timeout: 5000,
    });

    await page.getByTestId('project-delete-btn').first().click();
    await expect(page.getByTestId('project-item')).toHaveCount(0, {
      timeout: 5000,
    });
  });

  test('links a todo to a project and shows it', async ({ page }) => {
    await waitForApp(page);

    // First create a todo
    await addTodoViaUI(page, 'Linked task');
    await expect(page.getByTestId('todo-item')).toHaveCount(1, {
      timeout: 5000,
    });

    // Switch to linking tab and create a project
    await navigateTab(page, 'linking');
    const projInput = page.getByTestId('project-input');
    await projInput.fill('MyProject');
    await page.getByTestId('project-add-btn').click();
    await expect(page.getByTestId('project-item')).toHaveCount(1, {
      timeout: 5000,
    });

    // Link the todo to the project
    await expect(page.getByTestId('link-controls')).toBeVisible({
      timeout: 5000,
    });
    await page.getByTestId('link-btn-MyProject').first().click();

    // Verify the link shows in the current project display
    await expect(page.getByTestId('link-current-project').first()).toHaveText(
      'MyProject',
      { timeout: 5000 },
    );

    // Verify project shows todo count
    await expect(page.getByTestId('project-todo-count').first()).toHaveText(
      '(1 todos)',
      { timeout: 5000 },
    );
  });

  test('unlinks a todo from a project', async ({ page }) => {
    await waitForApp(page);

    // Create todo and project
    await addTodoViaUI(page, 'Unlinkable');
    await expect(page.getByTestId('todo-item')).toHaveCount(1, {
      timeout: 5000,
    });

    await navigateTab(page, 'linking');
    const projInput = page.getByTestId('project-input');
    await projInput.fill('Temp Project');
    await page.getByTestId('project-add-btn').click();
    await expect(page.getByTestId('project-item')).toHaveCount(1, {
      timeout: 5000,
    });

    // Link then unlink
    await expect(page.getByTestId('link-controls')).toBeVisible({
      timeout: 5000,
    });
    await page.getByTestId('link-btn-Temp Project').first().click();
    await expect(page.getByTestId('link-current-project').first()).toHaveText(
      'Temp Project',
      { timeout: 5000 },
    );

    await page.getByTestId('unlink-btn').first().click();
    await expect(page.getByTestId('link-current-project').first()).toHaveText(
      'none',
      { timeout: 5000 },
    );
  });
});

// ─── 4. Complex Queries ─────────────────────────────────────────────────────

test.describe('Complex Queries', () => {
  test('shows all messages', async ({ page }) => {
    await seedMessages(app.appId, app.adminToken, [
      { content: 'Hello', sender: 'alice', category: 'feature', priority: 1 },
      {
        content: 'Bug report',
        sender: 'bob',
        category: 'bug',
        priority: 5,
      },
      { content: 'Docs update', sender: 'carol', category: 'docs', priority: 2 },
    ]);
    await waitForApp(page);
    await navigateTab(page, 'queries');

    await expect(page.getByTestId('message-item').first()).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByTestId('total-message-count')).toHaveText(
      'Total: 3',
    );
    await expect(page.getByTestId('filtered-message-count')).toHaveText(
      'Showing: 3',
    );
  });

  test('filters by category (where clause)', async ({ page }) => {
    await seedMessages(app.appId, app.adminToken, [
      { content: 'Feature A', sender: 'alice', category: 'feature', priority: 1 },
      {
        content: 'Bug A',
        sender: 'bob',
        category: 'bug',
        priority: 5,
      },
      { content: 'Bug B', sender: 'carol', category: 'bug', priority: 3 },
    ]);
    await waitForApp(page);
    await navigateTab(page, 'queries');

    // Wait for messages to load
    await expect(page.getByTestId('total-message-count')).toHaveText(
      'Total: 3',
      { timeout: 10000 },
    );

    // Switch to filtered view (category=bug)
    await page.getByTestId('query-btn-filtered').click();
    await expect(page.getByTestId('query-type-display')).toHaveText(
      'Query: filtered',
    );
    await expect(page.getByTestId('filtered-message-count')).toHaveText(
      'Showing: 2',
      { timeout: 5000 },
    );
  });

  test('filters by comparison ($gt)', async ({ page }) => {
    await seedMessages(app.appId, app.adminToken, [
      { content: 'Low', sender: 'alice', category: 'feature', priority: 1 },
      { content: 'Med', sender: 'bob', category: 'bug', priority: 3 },
      { content: 'High', sender: 'carol', category: 'docs', priority: 5 },
    ]);
    await waitForApp(page);
    await navigateTab(page, 'queries');

    // Wait for all messages to load
    await expect(page.getByTestId('total-message-count')).toHaveText(
      'Total: 3',
      { timeout: 10000 },
    );

    // Switch to comparison query (priority > 3)
    await page.getByTestId('query-btn-comparison').click();
    await expect(page.getByTestId('filtered-message-count')).toHaveText(
      'Showing: 1',
      { timeout: 5000 },
    );
    await expect(page.getByTestId('message-content').first()).toHaveText(
      'High',
    );
  });

  test('adds messages via UI and they appear in queries', async ({ page }) => {
    await waitForApp(page);
    await navigateTab(page, 'queries');

    // Add a message
    await page.getByTestId('msg-input').fill('Test message');
    await page.getByTestId('msg-category').selectOption('bug');
    await page.getByTestId('msg-priority').fill('4');
    await page.getByTestId('msg-add-btn').click();

    await expect(page.getByTestId('message-item')).toHaveCount(1, {
      timeout: 5000,
    });
    await expect(page.getByTestId('message-content').first()).toHaveText(
      'Test message',
    );
    await expect(page.getByTestId('message-category').first()).toHaveText(
      '[bug]',
    );
    await expect(page.getByTestId('message-priority').first()).toHaveText(
      'p4',
    );
  });

  test('clears all messages', async ({ page }) => {
    await seedMessages(app.appId, app.adminToken, [
      { content: 'A', sender: 'alice', category: 'feature', priority: 1 },
      { content: 'B', sender: 'bob', category: 'bug', priority: 2 },
    ]);
    await waitForApp(page);
    await navigateTab(page, 'queries');

    await expect(page.getByTestId('total-message-count')).toHaveText(
      'Total: 2',
      { timeout: 10000 },
    );

    await page.getByTestId('msg-delete-all-btn').click();
    await expect(page.getByTestId('total-message-count')).toHaveText(
      'Total: 0',
      { timeout: 5000 },
    );
  });

  test('ordered query returns limited results', async ({ page }) => {
    await seedMessages(app.appId, app.adminToken, [
      { content: 'M1', sender: 'a', category: 'feature', priority: 1 },
      { content: 'M2', sender: 'b', category: 'bug', priority: 2 },
      { content: 'M3', sender: 'c', category: 'docs', priority: 3 },
      { content: 'M4', sender: 'd', category: 'feature', priority: 4 },
      { content: 'M5', sender: 'e', category: 'bug', priority: 5 },
      { content: 'M6', sender: 'f', category: 'docs', priority: 1 },
      { content: 'M7', sender: 'g', category: 'feature', priority: 2 },
    ]);
    await waitForApp(page);
    await navigateTab(page, 'queries');

    await expect(page.getByTestId('total-message-count')).toHaveText(
      'Total: 7',
      { timeout: 10000 },
    );

    // Ordered query with limit 5
    await page.getByTestId('query-btn-ordered').click();
    await expect(page.getByTestId('filtered-message-count')).toHaveText(
      'Showing: 5',
      { timeout: 5000 },
    );
  });
});

// ─── 5. Authentication ──────────────────────────────────────────────────────

test.describe('Authentication', () => {
  test('shows signed-out state initially', async ({ page }) => {
    await waitForApp(page);
    await navigateTab(page, 'auth');
    await expect(page.getByTestId('auth-section')).toBeVisible();
    await expect(page.getByTestId('auth-signed-out')).toBeVisible({
      timeout: 10000,
    });
  });

  test('signs in as guest', async ({ page }) => {
    await waitForApp(page);
    await navigateTab(page, 'auth');
    await expect(page.getByTestId('auth-signed-out')).toBeVisible({
      timeout: 10000,
    });

    await page.getByTestId('auth-guest-btn').click();
    await expect(page.getByTestId('auth-user')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('auth-user-id')).toContainText('User ID:');
    await expect(page.getByTestId('auth-user-email')).toContainText('guest');
  });

  test('signs out after guest login', async ({ page }) => {
    await waitForApp(page);
    await navigateTab(page, 'auth');
    await expect(page.getByTestId('auth-signed-out')).toBeVisible({
      timeout: 10000,
    });

    // Sign in
    await page.getByTestId('auth-guest-btn').click();
    await expect(page.getByTestId('auth-user')).toBeVisible({ timeout: 10000 });

    // Sign out
    await page.getByTestId('auth-signout-btn').click();
    await expect(page.getByTestId('auth-signed-out')).toBeVisible({
      timeout: 10000,
    });
  });
});

// ─── 6. Presence & Rooms ────────────────────────────────────────────────────

test.describe('Presence & Rooms', () => {
  test('shows presence section with nickname input', async ({ page }) => {
    await waitForApp(page);
    await navigateTab(page, 'presence');
    await expect(page.getByTestId('presence-section')).toBeVisible();
    await expect(page.getByTestId('presence-nickname')).toBeVisible();
    await expect(page.getByTestId('presence-peer-count')).toBeVisible();
  });

  test('cursor position updates on mouse move', async ({ page }) => {
    await waitForApp(page);
    await navigateTab(page, 'presence');
    await expect(page.getByTestId('cursor-canvas')).toBeVisible();

    const canvas = page.getByTestId('cursor-canvas');
    const box = await canvas.boundingBox();
    if (box) {
      await page.mouse.move(box.x + 50, box.y + 30);
      // Cursor position should update
      await expect(page.getByTestId('cursor-position')).not.toHaveText(
        'Cursor: (0, 0)',
        { timeout: 3000 },
      );
    }
  });

  test('two tabs see each other in presence', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    await page1.goto('/');
    await page2.goto('/');

    await expect(page1.getByTestId('app-title')).toBeVisible({ timeout: 15000 });
    await expect(page2.getByTestId('app-title')).toBeVisible({ timeout: 15000 });

    // Both navigate to presence tab
    await page1.getByTestId('tab-presence').click();
    await page2.getByTestId('tab-presence').click();

    // Set nicknames
    await page1.getByTestId('presence-nickname').fill('Alice');
    await page2.getByTestId('presence-nickname').fill('Bob');

    // Move mouse in canvas to trigger presence publish
    const canvas1 = page1.getByTestId('cursor-canvas');
    const box1 = await canvas1.boundingBox();
    if (box1) {
      await page1.mouse.move(box1.x + 20, box1.y + 20);
    }
    const canvas2 = page2.getByTestId('cursor-canvas');
    const box2 = await canvas2.boundingBox();
    if (box2) {
      await page2.mouse.move(box2.x + 40, box2.y + 40);
    }

    // Each tab should see the other as a peer
    // Wait for peer count > 0 on page2 (sees page1)
    await expect(page2.getByTestId('presence-peer-count')).not.toHaveText(
      'Peers online: 0',
      { timeout: 10000 },
    );

    await ctx1.close();
    await ctx2.close();
  });
});

// ─── 7. Broadcasts / Topics ────────────────────────────────────────────────

test.describe('Broadcasts / Topics', () => {
  test('shows broadcast section', async ({ page }) => {
    await waitForApp(page);
    await navigateTab(page, 'broadcast');
    await expect(page.getByTestId('broadcast-section')).toBeVisible();
    await expect(page.getByTestId('broadcast-log')).toBeVisible();
  });

  test('two tabs can broadcast emoji to each other', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    await page1.goto('/');
    await page2.goto('/');

    await expect(page1.getByTestId('app-title')).toBeVisible({ timeout: 15000 });
    await expect(page2.getByTestId('app-title')).toBeVisible({ timeout: 15000 });

    // Set up presence first so rooms are joined
    await page1.getByTestId('tab-presence').click();
    await page2.getByTestId('tab-presence').click();
    const canvas1 = page1.getByTestId('cursor-canvas');
    const box1 = await canvas1.boundingBox();
    if (box1) await page1.mouse.move(box1.x + 10, box1.y + 10);
    const canvas2 = page2.getByTestId('cursor-canvas');
    const box2 = await canvas2.boundingBox();
    if (box2) await page2.mouse.move(box2.x + 10, box2.y + 10);

    // Wait a moment for rooms to be established
    await page1.waitForTimeout(1000);

    // Navigate both to broadcast tab
    await page1.getByTestId('tab-broadcast').click();
    await page2.getByTestId('tab-broadcast').click();

    // Page1 sends an emoji, page2 should receive it
    await page1.getByTestId('emoji-btn-🔥').click();

    await expect(page2.getByTestId('broadcast-entry').first()).toBeVisible({
      timeout: 10000,
    });
    await expect(page2.getByTestId('broadcast-entry').first()).toContainText(
      '🔥',
    );

    await ctx1.close();
    await ctx2.close();
  });

  test('two tabs can broadcast chat messages', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    await page1.goto('/');
    await page2.goto('/');

    await expect(page1.getByTestId('app-title')).toBeVisible({ timeout: 15000 });
    await expect(page2.getByTestId('app-title')).toBeVisible({ timeout: 15000 });

    // Join presence rooms first
    await page1.getByTestId('tab-presence').click();
    await page2.getByTestId('tab-presence').click();
    const canvas1 = page1.getByTestId('cursor-canvas');
    const box1 = await canvas1.boundingBox();
    if (box1) await page1.mouse.move(box1.x + 10, box1.y + 10);
    const canvas2 = page2.getByTestId('cursor-canvas');
    const box2 = await canvas2.boundingBox();
    if (box2) await page2.mouse.move(box2.x + 10, box2.y + 10);
    await page1.waitForTimeout(1000);

    // Navigate to broadcast
    await page1.getByTestId('tab-broadcast').click();
    await page2.getByTestId('tab-broadcast').click();

    // Page1 sends a chat message
    await page1.getByTestId('broadcast-input').fill('Hello from page1');
    await page1.getByTestId('broadcast-send-btn').click();

    // Page2 should receive it
    await expect(page2.getByTestId('broadcast-entry').first()).toBeVisible({
      timeout: 10000,
    });
    await expect(page2.getByTestId('broadcast-entry').first()).toContainText(
      'Hello from page1',
    );

    await ctx1.close();
    await ctx2.close();
  });
});

// ─── 8. Typing Indicator ────────────────────────────────────────────────────

test.describe('Typing Indicator', () => {
  test('shows typing section', async ({ page }) => {
    await waitForApp(page);
    await navigateTab(page, 'typing');
    await expect(page.getByTestId('typing-section')).toBeVisible();
    await expect(page.getByTestId('typing-input')).toBeVisible();
    await expect(page.getByTestId('typing-peers')).toHaveText(
      'No one is typing',
    );
  });

  test('typing indicator shows in other tab', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    await page1.goto('/');
    await page2.goto('/');

    await expect(page1.getByTestId('app-title')).toBeVisible({ timeout: 15000 });
    await expect(page2.getByTestId('app-title')).toBeVisible({ timeout: 15000 });

    // Join rooms first via presence
    await page1.getByTestId('tab-presence').click();
    await page2.getByTestId('tab-presence').click();
    const canvas1 = page1.getByTestId('cursor-canvas');
    const box1 = await canvas1.boundingBox();
    if (box1) await page1.mouse.move(box1.x + 10, box1.y + 10);
    const canvas2 = page2.getByTestId('cursor-canvas');
    const box2 = await canvas2.boundingBox();
    if (box2) await page2.mouse.move(box2.x + 10, box2.y + 10);
    await page1.waitForTimeout(1000);

    // Both to typing tab
    await page1.getByTestId('tab-typing').click();
    await page2.getByTestId('tab-typing').click();

    // Page1 types in the input — page2 should see typing indicator
    await page1.getByTestId('typing-input').focus();
    await page1.getByTestId('typing-input').pressSequentially('hello', {
      delay: 50,
    });

    // Check that page2 sees someone typing
    await expect(page2.getByTestId('typing-active-count')).not.toHaveText(
      'Typing: 0',
      { timeout: 5000 },
    );

    await ctx1.close();
    await ctx2.close();
  });
});

// ─── 9. Batch Transactions ──────────────────────────────────────────────────

test.describe('Batch Transactions', () => {
  test('batch creates multiple todos at once', async ({ page }) => {
    await waitForApp(page);
    await navigateTab(page, 'batch');
    await expect(page.getByTestId('batch-section')).toBeVisible();

    await page.getByTestId('batch-count').fill('10');
    await page.getByTestId('batch-create-btn').click();

    await expect(page.getByTestId('batch-result')).toContainText(
      'Created 10 todos',
      { timeout: 10000 },
    );

    // Verify via todos tab
    await navigateTab(page, 'todos');
    await expect(page.getByTestId('todos-count')).toHaveText('Count: 10', {
      timeout: 5000,
    });
  });

  test('batch updates all todos', async ({ page }) => {
    await seedTodos(app.appId, app.adminToken, 5);
    await waitForApp(page);

    await navigateTab(page, 'batch');
    await page.getByTestId('batch-update-btn').click();

    await expect(page.getByTestId('batch-result')).toContainText(
      'Updated 5 todos',
      { timeout: 10000 },
    );

    // Verify priorities are all 5
    await navigateTab(page, 'todos');
    const priorities = page.getByTestId('todo-priority');
    const count = await priorities.count();
    for (let i = 0; i < count; i++) {
      await expect(priorities.nth(i)).toHaveText('p5');
    }
  });
});

// ─── 10. Real-time Cross-Tab Sync ───────────────────────────────────────────

test.describe('Real-time Cross-Tab Sync', () => {
  test('todo added in one tab appears in another', async ({ browser }) => {
    await seedTodos(app.appId, app.adminToken, 1);

    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    await page1.goto('/');
    await page2.goto('/');

    await expect(page1.getByTestId('app-title')).toBeVisible({ timeout: 15000 });
    await expect(page2.getByTestId('app-title')).toBeVisible({ timeout: 15000 });

    // Both should see the seeded todo
    await expect(page1.getByTestId('todo-item')).toHaveCount(1, {
      timeout: 10000,
    });
    await expect(page2.getByTestId('todo-item')).toHaveCount(1, {
      timeout: 10000,
    });

    // Add a new todo in page1
    await addTodoViaUI(page1, 'Synced todo');
    await expect(page1.getByTestId('todo-item')).toHaveCount(2, {
      timeout: 5000,
    });

    // Page2 should see it in real-time
    await expect(page2.getByTestId('todo-item')).toHaveCount(2, {
      timeout: 10000,
    });

    await ctx1.close();
    await ctx2.close();
  });

  test('toggle done syncs across tabs', async ({ browser }) => {
    await seedTodos(app.appId, app.adminToken, 1);

    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    await page1.goto('/');
    await page2.goto('/');

    await expect(page1.getByTestId('todo-item')).toHaveCount(1, {
      timeout: 15000,
    });
    await expect(page2.getByTestId('todo-item')).toHaveCount(1, {
      timeout: 15000,
    });

    // Toggle in page1
    await page1.getByTestId('todo-checkbox').first().click();
    await expect(page1.getByTestId('todo-text').first()).toHaveCSS(
      'text-decoration-line',
      'line-through',
      { timeout: 5000 },
    );

    // Page2 should see it
    await expect(page2.getByTestId('todo-text').first()).toHaveCSS(
      'text-decoration-line',
      'line-through',
      { timeout: 10000 },
    );

    await ctx1.close();
    await ctx2.close();
  });

  test('delete syncs across tabs', async ({ browser }) => {
    await seedTodos(app.appId, app.adminToken, 2);

    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    await page1.goto('/');
    await page2.goto('/');

    await expect(page1.getByTestId('todo-item')).toHaveCount(2, {
      timeout: 15000,
    });
    await expect(page2.getByTestId('todo-item')).toHaveCount(2, {
      timeout: 15000,
    });

    // Delete one in page1
    await page1.getByTestId('todo-delete-btn').first().click();
    await expect(page1.getByTestId('todo-item')).toHaveCount(1, {
      timeout: 5000,
    });

    // Page2 should see it disappear
    await expect(page2.getByTestId('todo-item')).toHaveCount(1, {
      timeout: 10000,
    });

    await ctx1.close();
    await ctx2.close();
  });
});

// ─── 11. Data Persistence ───────────────────────────────────────────────────

test.describe('Data Persistence', () => {
  test('todo persists across page reload', async ({ page }) => {
    await waitForApp(page);
    await addTodoViaUI(page, 'Persistent');
    await expect(page.getByTestId('todo-item')).toHaveCount(1, {
      timeout: 5000,
    });

    await page.reload();
    await expect(page.getByTestId('app-title')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('todo-item')).toHaveCount(1, {
      timeout: 10000,
    });
    await expect(page.getByTestId('todo-text').first()).toHaveText(
      'Persistent',
    );
  });

  test('done state persists across reload', async ({ page }) => {
    await waitForApp(page);
    await addTodoViaUI(page, 'Toggle persist');
    await expect(page.getByTestId('todo-item')).toHaveCount(1, {
      timeout: 5000,
    });

    await page.getByTestId('todo-checkbox').first().click();
    await expect(page.getByTestId('todo-text').first()).toHaveCSS(
      'text-decoration-line',
      'line-through',
      { timeout: 5000 },
    );

    await page.reload();
    await expect(page.getByTestId('app-title')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('todo-text').first()).toHaveCSS(
      'text-decoration-line',
      'line-through',
      { timeout: 10000 },
    );
  });

  test('deleted item stays gone after reload', async ({ page }) => {
    await waitForApp(page);
    await addTodoViaUI(page, 'Delete persist');
    await expect(page.getByTestId('todo-item')).toHaveCount(1, {
      timeout: 5000,
    });

    await page.getByTestId('todo-delete-btn').first().click();
    await expect(page.getByTestId('todo-item')).toHaveCount(0, {
      timeout: 5000,
    });

    await page.reload();
    await expect(page.getByTestId('app-title')).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(2000);
    await expect(page.getByTestId('todo-item')).toHaveCount(0);
  });

  test('data seeded via admin API is visible in the UI', async ({ page }) => {
    await seedTodos(app.appId, app.adminToken, 5);
    await waitForApp(page);
    await expect(page.getByTestId('todo-item')).toHaveCount(5, {
      timeout: 10000,
    });
    await expect(page.getByTestId('todos-count')).toHaveText('Count: 5');
  });

  test('admin API confirms data created via UI', async ({ page }) => {
    await waitForApp(page);
    await addTodoViaUI(page, 'Admin check');
    await expect(page.getByTestId('todo-item')).toHaveCount(1, {
      timeout: 5000,
    });

    // Query via admin API to verify
    const result = await adminQuery(app.appId, app.adminToken, { todos: {} });
    expect(result.todos.length).toBe(1);
    expect(result.todos[0].text).toBe('Admin check');
  });
});
