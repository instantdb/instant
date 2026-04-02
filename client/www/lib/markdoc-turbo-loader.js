// Wrapper around @markdoc/next.js loader that:
// 1. Injects the dir/appDir options Turbopack can't pass natively
// 2. Rewrites absolute import paths to relative ones (Turbopack requirement)
const path = require('path');

const wwwDir = path.resolve(__dirname, '..');
const markdocLoaderPath = path.join(
  wwwDir,
  'node_modules/@markdoc/next.js/src/loader.js',
);
const markdocLoader = require(markdocLoaderPath);

module.exports = async function turboMarkdocLoader(source) {
  const original = this.getOptions;
  this.getOptions = () => ({
    dir: wwwDir,
    appDir: true,
    options: { allowComments: true },
  });

  // Run the real Markdoc loader
  const self = this;
  const result = await new Promise((resolve, reject) => {
    const originalAsync = self.async;
    self.async = () => (err, result) => {
      if (err) reject(err);
      else resolve(result);
    };
    markdocLoader.call(self, source);
  });

  // Turbopack doesn't support absolute-path imports.
  // Replace them with paths relative to the .md file being processed.
  const fileDir = path.dirname(this.resourcePath);
  const fixed = result.replace(
    /from '(\/[^']+)'/g,
    (match, absPath) => {
      let rel = path.relative(fileDir, absPath);
      if (!rel.startsWith('.')) rel = './' + rel;
      return `from '${rel}'`;
    },
  );

  return fixed;
};
