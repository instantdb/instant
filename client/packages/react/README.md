<p align="center">
  <a href="https://instantdb.com">
    <img alt="Shows the Instant logo" src="https://instantdb.com/img/icon/android-chrome-512x512.png" width="10%">
  </a>
  <h1 align="center">@instantdb/react</h1>
</p>

<p align="center">
  <a 
    href="https://discord.com/invite/VU53p7uQcE" >
    <img height=20 src="https://img.shields.io/discord/1031957483243188235" />
  </a>
  <img src="https://img.shields.io/github/stars/instantdb/instant" alt="stars">
</p>

<p align="center">
   <a href="https://instantdb.com/dash">Get Started</a> · 
   <a href="https://instantdb.com/examples">Examples</a> · 
   <a href="https://instantdb.com/tutorial">Try the Demo</a> · 
   <a href="https://instantdb.com/docs">Docs</a> · 
   <a href="https://discord.com/invite/VU53p7uQcE">Discord</a>
<p>

Welcome to [Instant's](http://instantdb.com) React SDK.

```javascript
// ༼ つ ◕_◕ ༽つ Real-time Chat
// ----------------------------------
// * Updates instantly
// * Multiplayer
// * Works offline
function Chat() {
  // 1. Read
  const { isLoading, error, data } = useQuery({
    messages: {},
  });

  // 2. Write
  const addMessage = (message) => {
    transact(tx.messages[id()].update(message));
  };

  // 3. Render!
  return <UI data={data} onAdd={addMessage} />;
}
```

# Get Started

Follow the [getting started](https://www.instantdb.com/docs) tutorial to set up a live React app in under 5 minutes! Or you can try an [interactive demo](https://instantdb.com/tutorial) in your browser :).

# Questions?

If you have any questions, feel free to drop us a line on our [Discord](https://discord.com/invite/VU53p7uQcE)
