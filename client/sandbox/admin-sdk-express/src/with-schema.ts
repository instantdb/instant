import express from "express";
import bodyParser from "body-parser";
import cors from "cors"; // Import cors module
import { id, i, init } from "@instantdb/admin";
import { assert } from "console";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

const schema = i.schema({
  entities: {
    goals: i.entity({
      title: i.string(),
      creatorId: i.string(),
      priorityId: i.string(),
    }),
    todos: i.entity({ title: i.string(), creatorId: i.string() }),
  },
  links: {
    goalsTodos: {
      forward: {
        on: "goals",
        has: "many",
        label: "todos",
      },
      reverse: {
        on: "todos",
        has: "one",
        label: "goal",
      },
    },
  },
});

const db = init({
  apiURI: "http://localhost:8888",
  appId: process.env.INSTANT_APP_ID!,
  adminToken: process.env.INSTANT_ADMIN_TOKEN!,
  schema,
});

const { query, transact, auth, tx } = db;

// ----------------
// Basic Server

const app = express();
const port = 3005;

app.use(cors());
app.use(bodyParser.json());

app.post("/signin", async (req, res) => {
  const { email } = req.body;
  return res.status(200).send({ token: await auth.createToken(email) });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
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
  const user = { id: "3c32701d-f4a2-40e8-b83c-077dd4cb5cec" };
  const res = await transact([
    tx.todos[todoAId].update({ title: "Go on a run", creatorId: user.id }),
    tx.todos[todoBId].update({
      title: "Drink a protein shake",
      creatorId: user.id,
    }),
    tx.goals[id()]
      .update({
        title: "Get six pack abs",
        priorityId: "1",
        creatorId: user.id,
      })
      .link({ todos: todoAId })
      .link({ todos: todoBId }),
  ]);
  console.log(JSON.stringify(res, null, 2));
}

async function testCreateToken() {
  const token = await auth.createToken("stopa@instantdb.com");
  console.log("custom token!", token);
  const user = await auth.verifyToken(token);
  console.log("user", user);
}

async function testScoped() {
  const scoped = db.asUser({ email: "stopa@instantdb.com" });
  const res = await scoped.query({ goals: { todos: {} } });
  console.log("scoped", JSON.stringify(res, null, 2));
}

async function testSignOut() {
  const email = "stopa@instantdb.com";
  const token = await auth.createToken(email);

  // Token should exist
  assert(await auth.verifyToken(token));

  await auth.signOut(email);

  // Token should no longer exist
  const errorMessage =
    "[admin sign out] Expected token verification to fail, but it succeeded";
  try {
    await auth.verifyToken(token);
    throw new Error(errorMessage);
  } catch (err) {
    if (err instanceof Error && err.message === errorMessage) {
      throw err;
    } else {
      console.log("Token verification failed as expected!");
    }
  }
}

async function testFetchUser() {
  const email = "stopa+123@instantdb.com";
  const user = await db.auth.getUser({ email });
  console.log("user", user);
}

async function testDeleteUser() {
  try {
    const email = "test@example.com";
    const token = await auth.createToken(email);
    const user = await db.auth.getUser({ email });
    console.log("found", user);
    const deleted = await db.auth.deleteUser({
      email,
      // id: user.id,
      // refresh_token: token,
    });
    console.log("deleted", deleted);
  } catch (err: any) {
    console.error("Failed to delete:", err);
  }
}

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
  console.log("Uploaded:", url);
}

async function testAdminStorageFiles() {
  const files = await db.storage.list();
  console.log("Files:", files);
}

async function testAdminStorageDelete(filepath: string) {
  console.log("Before:", await db.storage.list());
  await db.storage.delete(filepath);
  console.log("After:", await db.storage.list());
}

async function testAdminStorageBulkDelete(keyword: string) {
  const files = await db.storage.list();
  const deletable = files
    .map((f) => f.name)
    .filter((name) => name.includes(keyword));
  console.log({ deletable });
  await db.storage.deleteMany(deletable);
  console.log("After:", await db.storage.list());
}

// testCreateToken();
// testQuery();
// testTransact();
// testScoped();
// testSignOut();
// testFetchUser();
// testDeleteUser();
// testAdminStorage("src/demo.jpeg", "admin/demo.jpeg", "image/jpeg");
// testAdminStorageFiles();
// testAdminStorageDelete("admin/demo.jpeg");
// testAdminStorageBulkDelete("admin/demo");
