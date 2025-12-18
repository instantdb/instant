---
title: Explorer Component
description: Use the Explorer Component in your own apps
---

The explorer page from the Instant Dashboard is available as an installable React component that you can use in your own apps. This is especially useful if you're building **a platform or app builder** powered by Instant

```tsx
import './App.css';
import { Explorer, Toaster } from '@instantdb/components';

function App() {
  return (
    <>
      <Explorer
        className="h-full"
        useShadowDOM={false}
        darkMode={false}
        appId={import.meta.env.VITE_INSTANT_APP_ID}
        adminToken={import.meta.env.VITE_INSTANT_ADMIN_TOKEN}
      />
      <Toaster position="top-right" />
    </>
  );
}
```

The Toaster component is required for pop-up alerts, unless you are already using [Sonner](https://sonner.emilkowal.ski/) in your project.

{% callout %}
The component accepts `explorerState` and `setExplorerState` props for manual control over the state of the Explorer.
{% /callout %}

# CSS

## Projects Using Tailwind

For projects using Tailwind, add the component library to your Tailwind configuration.

Tailwind V3:

```js
// tailwind.config.js
module.exports = {
  content: [
    './lib/**/*.{js,ts,jsx,tsx}',
    './pages/**/*.{js,ts,jsx,tsx,md}',
    './_posts/**/*.{js,ts,jsx,tsx,md}',
    './components/**/*.{js,ts,jsx,tsx}',
    './utils/**/*.{js,ts,jsx,tsx}',
    './node_modules/@instantdb/components/src/**/*.{js,ts,jsx,tsx,md}',
  ],
};
```

Tailwind V4:

```css
@import 'tailwindcss';
@source '../node_modules/@instantdb/components';
```

---

## Projects Without Tailwind

For projects without Tailwind, to avoid CSS conflicts, the [Shadow DOM](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM) is used to isolate styles of the explorer.

```tsx
import './App.css';
import { Explorer, Toaster } from '@instantdb/components';

function App() {
  return (
    <>
      <Explorer
        className="h-full"
        useShadowDOM // this prop automatically applies styles
        appId={import.meta.env.VITE_INSTANT_APP_ID}
        adminToken={import.meta.env.VITE_INSTANT_ADMIN_TOKEN}
      />
      <Toaster position="top-right" />
    </>
  );
}
```
