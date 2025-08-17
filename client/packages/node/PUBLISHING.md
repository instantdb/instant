# Publishing @instantdb/node to npm

## Pre-publish Checklist

✅ **Package Structure**
- [x] Source code in `src/`
- [x] Built files in `dist/` (CommonJS and ESM)
- [x] TypeScript definitions included
- [x] README.md with comprehensive documentation
- [x] CHANGELOG.md for version history
- [x] .npmignore to exclude unnecessary files

✅ **Package.json**
- [x] Name: `@instantdb/node`
- [x] Version: `0.1.0`
- [x] Description, keywords, author, license
- [x] Repository and homepage links
- [x] Main, module, and types fields configured
- [x] Exports for dual package support
- [x] Dependencies properly specified
- [x] Engine requirements (Node.js >=14.0.0)

✅ **Build & Tests**
- [x] Build passes without errors
- [x] All tests pass
- [x] Export validation passes (attw)
- [x] Both CommonJS and ESM formats work

✅ **Features Implemented**
- [x] Core API compatibility with @instantdb/core
- [x] Node.js-specific adapters (FileSystem, WebSocket, etc.)
- [x] Production optimizations (connection pooling, memory management)
- [x] Comprehensive examples
- [x] TypeScript support

## Publishing Steps

1. **Login to npm** (if not already logged in):
   ```bash
   npm login --scope=@instantdb
   ```

2. **Dry run** to see what will be published:
   ```bash
   npm publish --dry-run
   ```

3. **Publish to npm**:
   ```bash
   npm publish --access public
   ```
   
   Or using the package script:
   ```bash
   npm run publish-package
   ```

## Post-publish

1. **Verify on npm**:
   - Check https://www.npmjs.com/package/@instantdb/node
   - Test installation: `npm install @instantdb/node`

2. **Create GitHub Release**:
   - Tag the commit: `git tag node-v0.1.0`
   - Push tag: `git push origin node-v0.1.0`
   - Create release on GitHub with changelog

3. **Update Documentation**:
   - Add Node.js client to main Instant documentation
   - Update examples in the main repository

## Notes

- The package uses workspace dependencies (`@instantdb/core`: "workspace:*"`), which will be resolved during publishing
- The package is scoped under `@instantdb` organization
- Access is set to public for the initial release
- Version follows semantic versioning (0.1.0 for initial release)