// Piper integration, MIT.
const { join, dirname } = require('node:path');
module.exports = {
  name: 'piper-cjk-friendly-markdown',
  setup(build) {
    build.onResolve({ filter: /^markdown-it$/ }, () => ({
      path: join(__dirname, 'markdown-it-cjk.mjs'),
    }));
    build.onResolve({ filter: /^piper-markdown-it-original$/ }, () => ({
      path: require.resolve('markdown-it', {
        paths: [dirname(require.resolve('crossnote'))],
      }),
    }));
  },
};
