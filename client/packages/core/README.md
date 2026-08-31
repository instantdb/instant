<p align="center">
  <a href="https://instantdb.com">
    <img alt="Shows the Instant logo" src="https://instantdb.com/img/icon/android-chrome-512x512.png" width="10%">
  </a>
  <h1 align="center">@instantdb/core</h1>
</p>

<p align="center">
  <img src="https://img.shields.io/github/stars/instantdb/instant" alt="stars">
</p>

<p align="center">
   <a href="https://www.instantdb.com/docs/start-vanilla">Get Started</a> ·
   <a href="https://instantdb.com/examples">Examples</a> ·
   <a href="https://www.instantdb.com/docs/start-vanilla">Docs</a>
<p>

Welcome to [Instant's](http://instantdb.com) vanilla javascript SDK.

```javascript
db.subscribeQuery({ todos: {} }, (resp) => {
  if (resp.error) {
    renderError(resp.error.message);
    return;
  }
  if (resp.data) {
    render(resp.data); // wohoo!
  }
});
```

# Get Started

Follow the [getting started in vanilla Javascript](https://www.instantdb.com/docs/start-vanilla) tutorial to set up a live app in under 5 minutes!

# Questions?

If you have any questions, email [support@instantdb.com](mailto:support@instantdb.com).
