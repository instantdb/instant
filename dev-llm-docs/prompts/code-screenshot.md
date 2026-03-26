---
name: carbon
description: |
  Generate beautiful code screenshots using carbon-now-cli.
  TRIGGER when the user wants to create a screenshot of code, export code as an image,
  make a code snippet shareable, or asks for a "carbon" screenshot.
  Produces PNG or SVG images locally via headless browser.
user_invocable: true
---

# Carbon Code Screenshots

- Tool: [carbon-now-cli](https://github.com/mixn/carbon-now-cli) (Playwright + carbon.now.sh)
- Output: PNG (default) or SVG
- Requires network access

## Workflow

### 1. Ensure carbon-now-cli is installed

Run `which carbon-now` to check. If not found, install automatically:

```bash
npm i -g carbon-now-cli && npx --yes playwright install firefox
```

We use **Firefox** because Chromium has a [known bug](https://github.com/carbon-app/carbon/issues/1357) that renders stray "x" characters.

### 2. Determine what code to screenshot

- **A file**: `carbon-now path/to/file.js`
- **Lines from a file**: `carbon-now path/to/file.js --start 10 --end 25`
- **Pasted code**: Pipe it via stdin: `echo '<code>' | carbon-now --engine firefox ...`

### 3. Handle unsupported languages

carbon-now-cli auto-detects language from the file extension, but many are not supported (e.g. `.svelte`, `.astro`, `.mdx`, `.prisma`). When unrecognized, **don't guess**:

1. Tell the user the syntax isn't supported
2. Generate with `text` mode (no highlighting) as a default
3. Offer to open Carbon in the browser so they can pick highlighting visually:
   ```bash
   carbon-now <file> --engine firefox --open-in-browser
   ```
4. If the user specifies a language, apply it via `--settings '{"language":"htmlmixed"}'`

### 4. Build and run the command

**Always use `--engine firefox`**. Build with these flags:

```bash
carbon-now <file> \
  --engine firefox \
  --save-to . \
  --save-as <descriptive-name> \
  --skip-display \
  --settings '{"theme":"one-dark","fontFamily":"JetBrains Mono","windowControls":true,"paddingVertical":"32px","paddingHorizontal":"32px","dropShadow":true}'
```

Apply user customizations via the `--settings` JSON. Report the saved file path when done.

## Settings Reference

### Popular Themes

| Theme | Style |
|-------|-------|
| `one-dark` | Dark, popular with VS Code users |
| `dracula` | Dark purple tones |
| `monokai` | Classic dark theme |
| `nord` | Arctic blue palette |
| `night-owl` | Dark blue, by Sarah Drasner |
| `solarized-dark` | Warm dark tones |
| `solarized-light` | Warm light tones |
| `one-light` | Light companion to One Dark |
| `synthwave-84` | Retro neon |
| `vscode` | VS Code default dark |

### Popular Fonts

`JetBrains Mono`, `Fira Code`, `Cascadia Code`, `Hack`, `Source Code Pro`, `IBM Plex Mono`, `Inconsolata`, `Ubuntu Mono`

### All Settings Keys

| Key | Default | Options/Type |
|-----|---------|-------------|
| `theme` | `seti` | See themes above |
| `backgroundColor` | `#ADB7C1` | Any hex/rgba color |
| `windowTheme` | `none` | `none`, `sharp`, `bw` |
| `windowControls` | `true` | `true`/`false` |
| `fontFamily` | `Hack` | See fonts above |
| `fontSize` | `18px` | Any px value |
| `lineNumbers` | `false` | `true`/`false` |
| `dropShadow` | `false` | `true`/`false` |
| `paddingVertical` | `48px` | Any px value |
| `paddingHorizontal` | `32px` | Any px value |
| `type` | `png` | `png`, `svg` |
| `exportSize` | `2x` | `1x`, `2x`, `4x` |
| `language` | `auto` | Language identifier |
| `widthAdjustment` | `true` | `true`/`false` |
| `watermark` | `false` | `true`/`false` |
| `lineHeight` | `133%` | Percentage string |

## Examples

### Screenshot specific lines with a theme

```bash
carbon-now src/api.ts --start 42 --end 67 \
  --engine firefox \
  --save-to . --save-as api-handler \
  --skip-display \
  --settings '{"theme":"one-dark","fontFamily":"JetBrains Mono","dropShadow":true}'
```

### Screenshot pasted code via stdin

```bash
cat << 'SNIPPET' | carbon-now --engine firefox \
  --save-to . --save-as hello-component \
  --skip-display \
  --settings '{"theme":"dracula","fontFamily":"Fira Code","windowControls":true,"language":"jsx"}'
const App = () => <h1>Hello World</h1>;
SNIPPET
```

Note: When piping via stdin, language auto-detection won't work — set `"language"` explicitly in `--settings`.

### SVG output at 4x resolution

```bash
carbon-now src/index.ts --engine firefox --save-to . --save-as hero-image --skip-display \
  --settings '{"type":"svg","exportSize":"4x","theme":"nord"}'
```
