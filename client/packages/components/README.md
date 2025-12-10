# InstantDB Component Library

## Using the Explorer component

```tsx
<Explorer
  className="h-full"
  useShadowDOM // only necessary if your project doesn't use tailwind
  darkMode={false}
  appId="<your-app-id>"
  adminToken="<your-admin-token>"
/>
```

# Styles

### In www/

The tailwind installation in www/ already scans `./node_modules/@instantdb/components/src/**/*.{js,ts,jsx,tsx,md}'`, so all styles should work out of the box.

Most components are rexported in client/www/components/ui.tsx .

### In projects that use tailwind

Make sure you add `./node_modules/@instantdb/components/src/**/*.{js,ts,jsx,tsx,md}'` to the content field in your tailwind config.

### In projects that don't use Tailwind

To use the Explorer

```tsx
<Explorer
  className="h-full"
  useShadowDOM // this scopes and applies all styles with a shadow dom and script tag
  darkMode={false}
  apiURI={'http://localhost:8888'}
  websocketURI={'ws://localhost:8888/runtime/session'}
  appId="<your-app-id>"
  adminToken="<your-admin-token>"
/>
```

To use other components, you can wrap them in a <StyleMe> tag to mount them into a ShadowDOM.
However, doing this for most components is not practical so you can also import the styles separately.

```tsx
import '@instantdb/components/style.css';
```

In projects that don't use Tailwind it's recommended to just use the Explorer component with ShadowDOM and none of the other components.

# Development

Running the Vite Demo
`pnpm run dev:demo`

Runs on port 5173

## Environment Variables

Create a `.env` file in client/packages/components/.env

```
VITE_INSTANT_APP_ID=<your app id>
VITE_INSTANT_ADMIN_TOKEN=<your app id>
```
