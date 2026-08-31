<p align="center">
  <a href="https://instantdb.com">
    <img alt="Shows the Instant logo" src="https://instantdb.com/img/icon/android-chrome-512x512.png" width="10%">
  </a>
  <h1 align="center">@instantdb/solidjs</h1>
</p>

<p align="center">
  <img src="https://img.shields.io/github/stars/instantdb/instant" alt="stars">
</p>

<p align="center">
   <a href="https://www.instantdb.com/docs/start-solidjs">Get Started</a> ·
   <a href="https://instantdb.com/examples">Examples</a> ·
   <a href="https://www.instantdb.com/docs/start-solidjs">Docs</a>
</p>

Welcome to [Instant's](http://instantdb.com) SolidJS SDK.

```javascript
// ༼ つ ◕_◕ ༽つ Real-time Chat
// ----------------------------------
// * Updates instantly
// * Multiplayer
// * Works offline

import { init, id } from '@instantdb/solidjs';

const db = init({
  appId: import.meta.env.VITE_INSTANT_APP_ID,
});

function Chat() {
  // 1. Read
  const query = db.useQuery({ messages: {} });

  // 2. Write
  const addMessage = (message) => {
    db.transact(db.tx.messages[id()].update(message));
  };

  // 3. Render!
  return <UI data={query().data} onAdd={addMessage} />;
}
```

# Get Started

Follow the [getting started](https://www.instantdb.com/docs/start-solidjs) tutorial to set up a live SolidJS app in under 5 minutes!

# Questions?

If you have any questions, email [support@instantdb.com](mailto:support@instantdb.com).
