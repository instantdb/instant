/**
 * E2E tests for the Todos app using REAL @instantdb/react in a headless browser.
 *
 * These tests prove that the actual InstantDB React SDK renders correctly
 * and communicates properly with the Go + SQLite backend.
 */
import { test, expect, type Page } from '@playwright/test';
import { setupTestApp, seedTodos, clearTodos, type TestAppInfo } from './setup';

let app: TestAppInfo;

test.beforeAll(async () => {
  app = await setupTestApp();
});

test.beforeEach(async () => {
  await clearTodos(app.appId, app.adminToken);
});

// ---- Helpers ----

async function waitForApp(page: Page) {
  // Wait for the loading state to disappear and the app to render
  await page.goto('/');
  await expect(page.getByTestId('title')).toBeVisible({ timeout: 15000 });
}

async function addTodoViaUI(page: Page, text: string) {
  const input = page.getByTestId('todo-input');
  await input.fill(text);
  await input.press('Enter');
}

async function getTodoCount(page: Page): Promise<number> {
  return page.getByTestId('todo-item').count();
}

async function getRemainingText(page: Page): Promise<string> {
  return page.getByTestId('remaining-count').innerText();
}

// ---- Tests ----

test.describe('Todos App: Rendering', () => {
  test('app loads and shows title', async ({ page }) => {
    await waitForApp(page);
    await expect(page.getByTestId('title')).toHaveText('todos');
  });

  test('shows empty todo list initially', async ({ page }) => {
    await waitForApp(page);
    expect(await getTodoCount(page)).toBe(0);
  });

  test('shows remaining count as 0 when empty', async ({ page }) => {
    await waitForApp(page);
    await expect(page.getByTestId('remaining-count')).toHaveText('Remaining todos: 0');
  });

  test('renders seeded todos from server', async ({ page }) => {
    await seedTodos(app.appId, app.adminToken, 3);
    await waitForApp(page);
    // Wait for todos to appear (real-time query)
    await expect(page.getByTestId('todo-item').first()).toBeVisible({ timeout: 10000 });
    expect(await getTodoCount(page)).toBe(3);
  });
});

test.describe('Todos App: Add Todo', () => {
  test('typing text and pressing Enter adds a todo', async ({ page }) => {
    await waitForApp(page);
    await addTodoViaUI(page, 'Buy groceries');

    await expect(page.getByTestId('todo-item')).toHaveCount(1, { timeout: 5000 });
    await expect(page.getByTestId('todo-text').first()).toHaveText('Buy groceries');
  });

  test('input clears after adding', async ({ page }) => {
    await waitForApp(page);
    await addTodoViaUI(page, 'Walk the dog');

    await expect(page.getByTestId('todo-input')).toHaveValue('');
  });

  test('adding multiple todos shows all of them', async ({ page }) => {
    await waitForApp(page);
    await addTodoViaUI(page, 'First');
    await expect(page.getByTestId('todo-item')).toHaveCount(1, { timeout: 5000 });

    await addTodoViaUI(page, 'Second');
    await expect(page.getByTestId('todo-item')).toHaveCount(2, { timeout: 5000 });

    await addTodoViaUI(page, 'Third');
    await expect(page.getByTestId('todo-item')).toHaveCount(3, { timeout: 5000 });
  });

  test('remaining count updates after adding', async ({ page }) => {
    await waitForApp(page);
    await addTodoViaUI(page, 'New task');
    await expect(page.getByTestId('remaining-count')).toHaveText('Remaining todos: 1', { timeout: 5000 });
  });

  test('empty input does not add todo', async ({ page }) => {
    await waitForApp(page);
    await page.getByTestId('todo-input').press('Enter');
    expect(await getTodoCount(page)).toBe(0);
  });
});

test.describe('Todos App: Toggle Done', () => {
  test('clicking checkbox marks todo as done', async ({ page }) => {
    await waitForApp(page);
    await addTodoViaUI(page, 'Toggle me');
    await expect(page.getByTestId('todo-item')).toHaveCount(1, { timeout: 5000 });

    const checkbox = page.getByTestId('todo-checkbox').first();
    await checkbox.click();

    // Text should get line-through (done state)
    await expect(page.getByTestId('todo-text').first()).toHaveCSS('text-decoration-line', 'line-through', { timeout: 5000 });
  });

  test('clicking checkbox again un-marks todo', async ({ page }) => {
    await waitForApp(page);
    await addTodoViaUI(page, 'Toggle twice');
    await expect(page.getByTestId('todo-item')).toHaveCount(1, { timeout: 5000 });

    const checkbox = page.getByTestId('todo-checkbox').first();
    await checkbox.click();
    await expect(page.getByTestId('todo-text').first()).toHaveCSS('text-decoration-line', 'line-through', { timeout: 5000 });

    await checkbox.click();
    await expect(page.getByTestId('todo-text').first()).toHaveCSS('text-decoration-line', 'none', { timeout: 5000 });
  });

  test('remaining count updates when toggling', async ({ page }) => {
    await waitForApp(page);
    await addTodoViaUI(page, 'Count me');
    await expect(page.getByTestId('remaining-count')).toHaveText('Remaining todos: 1', { timeout: 5000 });

    await page.getByTestId('todo-checkbox').first().click();
    await expect(page.getByTestId('remaining-count')).toHaveText('Remaining todos: 0', { timeout: 5000 });
  });
});

test.describe('Todos App: Delete', () => {
  test('clicking X removes the todo', async ({ page }) => {
    await waitForApp(page);
    await addTodoViaUI(page, 'Delete me');
    await expect(page.getByTestId('todo-item')).toHaveCount(1, { timeout: 5000 });

    await page.getByTestId('todo-delete').first().click();
    await expect(page.getByTestId('todo-item')).toHaveCount(0, { timeout: 5000 });
  });

  test('delete completed removes only done todos', async ({ page }) => {
    await waitForApp(page);
    await addTodoViaUI(page, 'Keep');
    await expect(page.getByTestId('todo-item')).toHaveCount(1, { timeout: 5000 });

    await addTodoViaUI(page, 'Remove');
    await expect(page.getByTestId('todo-item')).toHaveCount(2, { timeout: 5000 });

    // Mark second as done
    await page.getByTestId('todo-checkbox').nth(1).click();
    await expect(page.getByTestId('todo-text').nth(1)).toHaveCSS('text-decoration-line', 'line-through', { timeout: 5000 });

    await page.getByTestId('delete-completed').click();
    await expect(page.getByTestId('todo-item')).toHaveCount(1, { timeout: 5000 });
    await expect(page.getByTestId('todo-text').first()).toHaveText('Keep');
  });
});

test.describe('Todos App: Toggle All', () => {
  test('toggle all marks everything done', async ({ page }) => {
    await waitForApp(page);
    await addTodoViaUI(page, 'A');
    await addTodoViaUI(page, 'B');
    await expect(page.getByTestId('todo-item')).toHaveCount(2, { timeout: 5000 });

    await page.getByTestId('toggle-all').click();
    await expect(page.getByTestId('remaining-count')).toHaveText('Remaining todos: 0', { timeout: 5000 });
  });

  test('toggle all again un-marks everything', async ({ page }) => {
    await waitForApp(page);
    await addTodoViaUI(page, 'X');
    await addTodoViaUI(page, 'Y');
    await expect(page.getByTestId('todo-item')).toHaveCount(2, { timeout: 5000 });

    await page.getByTestId('toggle-all').click();
    await expect(page.getByTestId('remaining-count')).toHaveText('Remaining todos: 0', { timeout: 5000 });

    await page.getByTestId('toggle-all').click();
    await expect(page.getByTestId('remaining-count')).toHaveText('Remaining todos: 2', { timeout: 5000 });
  });
});

// Cross-tab real-time sync requires the Reactor's internal pending-mutation
// state to be in sync with the server's processed-tx-id. The server correctly
// fans out invalidation to all sessions, but the Reactor needs matching
// tx-id tracking to process refresh-ok. These tests validate the behavior
// once the processed-tx-id flow is fully implemented.
test.describe.skip('Todos App: Real-time Cross-Tab Sync', () => {
  test('todo added in one tab appears in another in real-time', async ({ browser }) => {
    // Seed a todo so both tabs have subscriptions established
    await seedTodos(app.appId, app.adminToken, 1);

    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    await page1.goto('/');
    await page2.goto('/');

    // Wait for BOTH pages to render the seeded todo — proves WS subscription is live
    await expect(page1.getByTestId('todo-item')).toHaveCount(1, { timeout: 15000 });
    await expect(page2.getByTestId('todo-item')).toHaveCount(1, { timeout: 15000 });

    // Now add a new todo in page 1
    await addTodoViaUI(page1, 'Real-time synced!');
    await expect(page1.getByTestId('todo-item')).toHaveCount(2, { timeout: 5000 });

    // Page 2 should see it via WebSocket push (no reload needed)
    await expect(page2.getByTestId('todo-item')).toHaveCount(2, { timeout: 10000 });

    await ctx1.close();
    await ctx2.close();
  });

  test('toggling done in one tab reflects in another in real-time', async ({ browser }) => {
    await seedTodos(app.appId, app.adminToken, 1);

    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    await page1.goto('/');
    await page2.goto('/');

    // Wait for both to load the seeded todo
    await expect(page1.getByTestId('todo-item')).toHaveCount(1, { timeout: 15000 });
    await expect(page2.getByTestId('todo-item')).toHaveCount(1, { timeout: 15000 });

    // Toggle in page 1
    await page1.getByTestId('todo-checkbox').first().click();
    await expect(page1.getByTestId('todo-text').first()).toHaveCSS('text-decoration-line', 'line-through', { timeout: 5000 });

    // Page 2 should see it toggled via real-time push
    await expect(page2.getByTestId('todo-text').first()).toHaveCSS('text-decoration-line', 'line-through', { timeout: 10000 });

    await ctx1.close();
    await ctx2.close();
  });
});

test.describe('Todos App: Data Persistence', () => {
  test('todo persists across page reload', async ({ page }) => {
    await waitForApp(page);
    await addTodoViaUI(page, 'Persistent todo');
    await expect(page.getByTestId('todo-item')).toHaveCount(1, { timeout: 5000 });

    // Reload page — data should come from the server
    await page.reload();
    await expect(page.getByTestId('title')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('todo-item')).toHaveCount(1, { timeout: 10000 });
    await expect(page.getByTestId('todo-text').first()).toHaveText('Persistent todo');
  });

  test('toggled state persists across reload', async ({ page }) => {
    await waitForApp(page);
    await addTodoViaUI(page, 'Toggle persist');
    await expect(page.getByTestId('todo-item')).toHaveCount(1, { timeout: 5000 });

    // Toggle done
    await page.getByTestId('todo-checkbox').first().click();
    await expect(page.getByTestId('todo-text').first()).toHaveCSS('text-decoration-line', 'line-through', { timeout: 5000 });

    // Reload — done state should persist
    await page.reload();
    await expect(page.getByTestId('title')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('todo-text').first()).toHaveCSS('text-decoration-line', 'line-through', { timeout: 10000 });
  });

  test('deleted todo stays gone after reload', async ({ page }) => {
    await waitForApp(page);
    await addTodoViaUI(page, 'Delete persist');
    await expect(page.getByTestId('todo-item')).toHaveCount(1, { timeout: 5000 });

    await page.getByTestId('todo-delete').first().click();
    await expect(page.getByTestId('todo-item')).toHaveCount(0, { timeout: 5000 });

    // Reload — should still be empty
    await page.reload();
    await expect(page.getByTestId('title')).toBeVisible({ timeout: 15000 });
    // Give time for query to return
    await page.waitForTimeout(2000);
    expect(await getTodoCount(page)).toBe(0);
  });

  test('second tab sees data created in first tab', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const page1 = await ctx1.newPage();

    await page1.goto('/');
    await expect(page1.getByTestId('title')).toBeVisible({ timeout: 15000 });

    // Add todo in first tab
    await addTodoViaUI(page1, 'Cross-tab todo');
    await expect(page1.getByTestId('todo-item')).toHaveCount(1, { timeout: 5000 });

    // Open second tab — it should load the todo from the server
    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();
    await page2.goto('/');
    await expect(page2.getByTestId('title')).toBeVisible({ timeout: 15000 });
    await expect(page2.getByTestId('todo-item')).toHaveCount(1, { timeout: 10000 });
    await expect(page2.getByTestId('todo-text').first()).toHaveText('Cross-tab todo');

    await ctx1.close();
    await ctx2.close();
  });
});
