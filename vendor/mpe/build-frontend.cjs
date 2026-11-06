// Rebuild only the pinned Crossnote preview UI. Keep the locked engine package.
const fs = require('node:fs');
const path = require('node:path');
const { build } = require('esbuild');
async function buildFrontend() {
  const crossnote = path.resolve(
    path.dirname(require.resolve('crossnote')),
    '../..',
  );
  const result = await build({
    entryPoints: [path.join(__dirname, 'frontend/src/webview/preview.tsx')],
    outfile: path.join(__dirname, 'crossnote/webview/preview.js'),
    bundle: true,
    minify: true,
    platform: 'browser',
    target: 'es2020',
    write: false,
    metafile: true,
    nodePaths: [path.resolve(crossnote, '../')],
    loader: {
      '.svg': 'dataurl',
      '.png': 'dataurl',
      '.woff': 'dataurl',
      '.woff2': 'dataurl',
      '.ttf': 'dataurl',
    },
    plugins: [
      {
        name: 'upstream-compiled-tailwind',
        setup(b) {
          b.onLoad({ filter: /frontend\/src\/webview\/index\.css$/ }, () => ({
            contents: '',
            loader: 'css',
          }));
        },
      },
    ],
  });
  const output = path.join(__dirname, 'crossnote/webview');
  fs.mkdirSync(output, { recursive: true });
  for (const file of result.outputFiles) {
    if (file.path.endsWith('.css')) {
      const base = fs.readFileSync(
        path.join(crossnote, 'out/webview/preview.css'),
        'utf8',
      );
      fs.writeFileSync(
        path.join(output, 'preview.css'),
        base + '\n' + file.text,
      );
    } else fs.writeFileSync(file.path, file.contents);
  }
  return result.metafile;
}
module.exports = { buildFrontend };
if (require.main === module)
  buildFrontend().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
