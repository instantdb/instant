<p align="center">
  <a href="https://instantdb.com">
    <img alt="Shows the Instant logo" src="https://instantdb.com/img/icon/android-chrome-512x512.png" width="10%">
  </a>
  <h1 align="center">@instantdb/admin</h1>
</p>

<p align="center">
  <img src="https://img.shields.io/github/stars/instantdb/instant" alt="stars">
</p>

<p align="center">
   <a href="https://www.instantdb.com/docs/backend">Get Started</a> ·
   <a href="https://instantdb.com/examples">Examples</a> ·
   <a href="https://www.instantdb.com/docs/backend">Docs</a>
<p>

Welcome to [Instant's](http://instantdb.com) admin SDK.

```javascript
import { init, tx, id } from '@instantdb/admin';

const adminDB = init({
  appId: 'my-instant-app-id',
  adminToken: process.env.INSTANT_APP_ADMIN_TOKEN,
});

const data = await adminDB.query(
  { bookshelves: { books: {} } }, // wohoo!
);
```

# Get Started

Head on over to the [Instant on the Backend](https://www.instantdb.com/docs/backend) page in the docs to get started!

# Questions?

If you have any questions, email [support@instantdb.com](mailto:support@instantdb.com).
