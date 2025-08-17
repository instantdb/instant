# Using the Local @instantdb/node Package in Another Project

## Method 1: Using npm link (Recommended for Development)

### Step 1: Create a global link from the @instantdb/node package
```bash
cd /Users/mlustig/dev/tools/instant/client/packages/node
npm link
```

### Step 2: Link to the package in your other project
```bash
cd /path/to/your/other/project
npm link @instantdb/node
```

### To unlink later:
```bash
cd /path/to/your/other/project
npm unlink @instantdb/node

cd /Users/mlustig/dev/tools/instant/client/packages/node
npm unlink
```

## Method 2: Using file: protocol in package.json

### In your other project's package.json:
```json
{
  "dependencies": {
    "@instantdb/node": "file:/Users/mlustig/dev/tools/instant/client/packages/node"
  }
}
```

Then run:
```bash
cd /path/to/your/other/project
npm install
```

## Method 3: Using pnpm/yarn workspaces (if using monorepo)

### In your other project's package.json:
```json
{
  "dependencies": {
    "@instantdb/node": "workspace:*"
  }
}
```

## Method 4: Pack and install locally

### Step 1: Pack the package
```bash
cd /Users/mlustig/dev/tools/instant/client/packages/node
npm pack
```

This creates a file like `instantdb-node-0.1.0.tgz`

### Step 2: Install in your other project
```bash
cd /path/to/your/other/project
npm install /Users/mlustig/dev/tools/instant/client/packages/node/instantdb-node-0.1.0.tgz
```

## Example Usage in Your Project

Once linked/installed, use it like this:

```javascript
// CommonJS
const { init, tx, id } = require('@instantdb/node');

// ES Modules
import { init, tx, id } from '@instantdb/node';

// Initialize
const db = init({
  appId: 'your-app-id',
});

// Use it!
const userId = id();
await db.transact(
  tx.users[userId].update({
    name: 'From my project!',
    email: 'user@example.com',
    displayName: 'My User',
    status: 'active'
  })
);