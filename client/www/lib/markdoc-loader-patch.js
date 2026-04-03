// Patch for @markdoc/next.js loader to fix turbopack schema resolution.
// Two issues:
// 1. Turbopack's resolver doesn't support `preferRelative`, so bare specifiers
//    like 'tags' don't resolve as './tags'. We try './' prefix as fallback.
// 2. Turbopack can't handle absolute paths in generated imports. We convert
//    absolute paths to relative paths in the loader output.
// See: https://github.com/markdoc/next.js/pull/70

const path = require('path');
const fs = require('fs');

function findOriginalLoader() {
  const pkgMain = require.resolve('@markdoc/next.js');
  const loaderPath = path.join(path.dirname(pkgMain), 'loader.js');
  if (fs.existsSync(loaderPath)) return loaderPath;
  throw new Error('Could not find @markdoc/next.js loader');
}

const originalLoader = require(findOriginalLoader());

module.exports = function patchedMarkdocLoader(source) {
  // Monkey-patch this.getResolve to try './' prefix as fallback
  const originalGetResolve = this.getResolve.bind(this);
  this.getResolve = function (opts) {
    const originalResolve = originalGetResolve(opts);
    return async function (context, request) {
      try {
        return await originalResolve(context, request);
      } catch (err) {
        if (!request.startsWith('.') && !request.startsWith('/')) {
          return await originalResolve(context, './' + request);
        }
        throw err;
      }
    };
  };

  // Call the original loader
  const callback = this.async();
  const originalAsync = this.async;

  // Override async to intercept the result and fix absolute paths
  const resourceDir = path.dirname(this.resourcePath);
  this.async = function () {
    return function (err, result) {
      if (err) return callback(err);
      if (result) {
        // Convert absolute import paths to relative
        result = result.replace(
          /from '(\/[^']+)'/g,
          (match, absPath) => {
            let rel = path.relative(resourceDir, absPath);
            if (!rel.startsWith('.')) rel = './' + rel;
            return `from '${rel}'`;
          },
        );
      }
      callback(null, result);
    };
  };

  originalLoader.call(this, source);
};
