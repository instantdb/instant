import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors'; // Import cors module
import { init, tx, id } from '@instantdb/admin';
import { assert } from 'console';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const config = {
  apiURI: 'http://localhost:8888',
  appId: process.env.INSTANT_APP_ID!,
  adminToken: process.env.INSTANT_ADMIN_TOKEN!,
};

const PERSONAL_ACCESS_TOKEN = process.env.INSTANT_PERSONAL_ACCESS_TOKEN!;

const db = init(config);

const { query, transact, auth } = db;

// ----------------
// Basic Server

const app = express();
const port = 3005;

app.use(cors());
app.use(bodyParser.json());

app.post('/signin', async (req, res) => {
  const { email } = req.body;
  return res.status(200).send({ token: await auth.createToken(email) });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// ----------------------------
// Some handy tester functions

async function testQuery() {
  const res = await query({ goals: { todos: {} } });

  console.log(JSON.stringify(res, null, 2));
}

async function testTransact() {
  const todoAId = id();
  const todoBId = id();
  const user = { id: '3c32701d-f4a2-40e8-b83c-077dd4cb5cec' };
  const res = await transact([
    tx.todos[todoAId].create({ title: 'Go on a run', creatorId: user.id }),
    tx.todos[todoBId].update({
      title: 'Drink a protein shake',
      creatorId: user.id,
    }),
    tx.goals[id()]
      .update({
        title: 'Get six pack abs',
        priority6: 1,
        creatorId: user.id,
      })
      .link({ todos: todoAId })
      .link({ todos: todoBId }),
  ]);
  console.log(JSON.stringify(res, null, 2));
}

async function testCreateToken() {
  const token = await auth.createToken('stopa@instantdb.com');
  console.log('custom token!', token);
  const user = await auth.verifyToken(token);
  console.log('user', user);
}

async function testScoped() {
  const scoped = db.asUser({ email: 'stopa@instantdb.com' });
  const res = await scoped.query({ goals: { todos: {} } });
  console.log('scoped', JSON.stringify(res, null, 2));
}

async function testSignOut() {
  const email = 'stopa@instantdb.com';
  const token = await auth.createToken(email);
  const user = await auth.verifyToken(token);

  // Token should exist
  assert(user);

  await auth.signOut({ email: user.email });
  console.log('signed out!');

  // Token should no longer exist
  const errorMessage =
    '[admin sign out] Expected token verification to fail, but it succeeded';
  try {
    await auth.verifyToken(token);
    throw new Error(errorMessage);
  } catch (err) {
    if (err instanceof Error && err.message === errorMessage) {
      throw err;
    } else {
      console.log('Token verification failed as expected!');
    }
  }
}

async function testFetchUser() {
  const email = 'stopa@instantdb.com';
  const user = await db.auth.getUser({ email });
  console.log('user', user);
}

async function testDeleteUser() {
  try {
    const email = 'test@example.com';
    const token = await auth.createToken(email);
    const user = await db.auth.getUser({ email });
    console.log('found', user);
    const deleted = await db.auth.deleteUser({
      email,
      // id: user.id,
      // refresh_token: token,
    });
    console.log('deleted', deleted);
  } catch (err: any) {
    console.error('Failed to delete:', err);
  }
}

// testCreateToken();
// testQuery();
// testTransact();
// testScoped();
// testSignOut();
// testFetchUser();
// testDeleteUser();

/**
 * Storage API tests
 */

async function testUploadFile(src: string, dest: string, contentType?: string) {
  const buffer = fs.readFileSync(path.join(__dirname, src));
  const data = await db.storage.uploadFile(dest, buffer, {
    contentType: contentType,
  });
  console.log('Uploaded:', data);
}

async function testQueryFiles() {
  const res = await query({ $files: {} });
  console.log(JSON.stringify(res, null, 2));
}

async function testDeleteSingleFile(filepath: string) {
  console.log('Before:', await db.storage.list());
  await db.storage.delete(filepath);
  console.log('After:', await db.storage.list());
}

async function testDeleteBulkFile(filenames: string[]) {
  console.log('Before:', await db.storage.list());
  await db.storage.deleteMany(filenames);
  console.log('After:', await db.storage.list());
}

async function testUpdateFileFails() {
  const fileId = 'cbda1941-d192-4f7d-b0a7-f9d428e1ca0b';
  const prefix = 'Update on $files';
  const message = `${prefix} should not be supported`;
  try {
    await transact(tx.$files[fileId].update({ metadata: { new: 'first' } }));
    throw new Error(message);
  } catch (err) {
    if (err instanceof Error && err.message === message) {
      throw err;
    } else {
      console.log(`${prefix} failed as expected!`);
    }
  }
}

async function testMergeFileFails() {
  const fileId = 'cbda1941-d192-4f7d-b0a7-f9d428e1ca0b';
  const prefix = 'Merge on $files';
  const message = `${prefix} should not be supported`;
  try {
    await transact(tx.$files[fileId].merge({ metadata: { new: 'second' } }));
    throw new Error(message);
  } catch (err) {
    if (err instanceof Error && err.message === message) {
      throw err;
    } else {
      console.log(`${prefix} failed as expected!`);
    }
  }
}

async function testDeleteFileTransactFails() {
  const prefix = 'Delete on $files';
  const message = `${prefix} should not be supported`;
  try {
    await transact(tx['$files'][id()].delete());
    throw new Error(message);
  } catch (err) {
    if (err instanceof Error && err.message === message) {
      throw err;
    } else {
      console.log(`${prefix} failed as expected!`);
    }
  }
}

async function testDeleteAllowedInTx(
  src: string,
  dest: string,
  contentType?: string,
) {
  const buffer = fs.readFileSync(path.join(__dirname, src));
  const { data } = await db.storage.uploadFile(dest, buffer, {
    contentType: contentType,
  });
  const fileId = data.id;
  const q = {
    $files: {
      $: {
        where: { id: fileId },
      },
    },
  };
  const before = await query(q);
  console.log('Before', JSON.stringify(before, null, 2));

  await transact(tx['$files'][fileId].delete());

  const after = await query(q);
  console.log('After', JSON.stringify(after, null, 2));
}

// testUploadFile('circle_blue.jpg', 'circle_blue.jpg', 'image/jpeg');
// testUploadFile("circle_blue.jpg", "circle_blue2.jpg", "image/jpeg");
// testQueryFiles()
// testDeleteSingleFile("circle_blue.jpg");
// testDeleteBulkFile(["circle_blue.jpg", "circle_blue2.jpg"]);
// testUpdateFileFails()
// testMergeFileFails()
// testDeleteAllowedInTx('circle_blue.jpg', 'circle_blue.jpg', 'image/jpeg');

/**
 * Legacy Storage API tests (deprecated Jan 2025)
 */
async function testAdminStorage(
  src: string,
  dest: string,
  contentType?: string,
) {
  const buffer = fs.readFileSync(src);
  const ok = await db.storage.upload(dest, buffer, {
    contentType: contentType,
  });
  const url = await db.storage.getDownloadUrl(dest);
  console.log('Uploaded:', url);
}

async function testAdminStorageFiles() {
  const files = await db.storage.list();
  console.log('Files:', files);
}

async function testAdminStorageDelete(filepath: string) {
  console.log('Before:', await db.storage.list());
  await db.storage.delete(filepath);
  console.log('After:', await db.storage.list());
}

async function testAdminStorageBulkDelete(keyword: string) {
  const files = await db.storage.list();
  const deletable = files
    .map((f) => f.name)
    .filter((name) => name.includes(keyword));
  console.log({ deletable });
  await db.storage.deleteMany(deletable);
  console.log('After:', await db.storage.list());
}

async function testGetDownloadUrl(filename: string) {
  const url = await db.storage.getDownloadUrl(filename);
  console.log('URL:', url);
}

// testAdminStorage("src/circle_blue.jpg", "admin/demo.jpeg", "image/jpeg");
// testAdminStorageFiles();
// testAdminStorageDelete("admin/demo.jpeg");
// testAdminStorageBulkDelete("admin/demo");
// testGetDownloadUrl("admin/demo.jpeg");

/**
 * Superadmin
 */

async function testSuperadminListApps() {
  const response = await fetch(`${config.apiURI}/superadmin/apps`, {
    headers: {
      Authorization: `Bearer ${PERSONAL_ACCESS_TOKEN}`,
    },
  });
  const data: any = await response.json();
  console.log(data);
  return data.apps;
}

async function testSuperadminCreateApp(title: string) {
  const response = await fetch(`${config.apiURI}/superadmin/apps`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PERSONAL_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title }),
  });
  const data: any = await response.json();
  console.log(data);
  return data.app;
}

async function testSuperadminDeleteApp(appId: string) {
  const response = await fetch(`${config.apiURI}/superadmin/apps/${appId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${PERSONAL_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });
  const data: any = await response.json();
  console.log(data);
  return data.app;
}

async function testSuperadminAppsFlow() {
  const app = await testSuperadminCreateApp('Test App');
  await testSuperadminListApps();
  await testSuperadminDeleteApp(app.id);
  await testSuperadminListApps();
}

async function testGenerateMagicCode() {
  const r = await db.auth.generateMagicCode('stopa@instantdb.com');
  console.log(r);
}

async function testSendMagicCode() {
  const r = await db.auth.sendMagicCode('stopa@instantdb.com');
  console.log(r);
}

async function testVerifyMagicCode() {
  const r = await db.auth.verifyMagicCode('stopa@instantdb.com', '123456');
  console.log(r);
}

// testGenerateMagicCode();
// testSendMagicCode();
// testVerifyMagicCode();

// testSuperadminListApps();
// testSuperadminCreateApp("Test App");
// testSuperadminDeleteApp("a3203638-7869-40cb-b21f-bb093342a461");
// testSuperadminAppsFlow();

async function testGetPresence() {
  const res = await db.rooms.getPresence('chat', 'foo');
  console.log(JSON.stringify(res, null, 2));
}

// testGetPresence();
