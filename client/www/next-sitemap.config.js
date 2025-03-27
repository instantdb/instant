/** @type {import('next-sitemap').IConfig} */
module.exports = {
  siteUrl: 'https://instantdb.com',
  generateRobotsTxt: false,
  generateIndexSitemap: false,

  transform: async (config, path) => {
    const exactPaths = ['/', '/privacy', '/terms', '/tutorial'];

    if (exactPaths.includes(path)) {
      return {
        loc: path,
        changefreq: config.changefreq,
        priority: config.priority,
        lastmod: config.autoLastmod ? new Date().toISOString() : undefined,
      };
    }

    if (path.startsWith('/essays/') || path.startsWith('/docs/')) {
      return {
        loc: path,
        changefreq: config.changefreq,
        priority: config.priority,
        lastmod: config.autoLastmod ? new Date().toISOString() : undefined,
      };
    }

    // exclude other paths
    return null;
  },
};
