// SPDX-License-Identifier: MIT
// Copyright (c) 2026 PiperLiu
// This standalone runner contains no third-party renderer code or TeX assets.
import { createRequire } from 'module';
import * as path from 'path';
import {
  MAX_TIKZ_INPUT_BYTES,
  MAX_TIKZ_OUTPUT_BYTES,
  sanitizeTikzOptions,
  validateTikzSource,
  isSvgOutput,
} from './tikz-protocol';

const chunks: Buffer[] = [];
let inputBytes = 0;
let rejected = false;
function fail(error: unknown) {
  if (rejected) return;
  rejected = true;
  process.stderr.write(
    (error instanceof Error ? error.message : String(error)).slice(0, 2048) +
      '\n',
  );
  process.exit(1);
}
process.stdin.on('data', (chunk: Buffer) => {
  inputBytes += chunk.length;
  if (inputBytes > MAX_TIKZ_INPUT_BYTES)
    return fail(new Error('TikZ request exceeds 1 MiB.'));
  chunks.push(chunk);
});
process.stdin.on('error', fail);
process.stdin.on('end', async () => {
  try {
    const modulePath = process.argv[2];
    if (!modulePath || !path.isAbsolute(modulePath))
      throw new Error('Expected an absolute renderer module path.');
    const request = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    validateTikzSource(request.source);
    const options = sanitizeTikzOptions(request.options);
    // Keep stdout exclusively for the SVG protocol even if the external tool logs.
    for (const name of ['log', 'info', 'debug', 'warn'] as const) {
      console[name] = (...values: unknown[]) =>
        process.stderr.write(values.map(String).join(' ') + '\n');
    }
    const loaded = createRequire(__filename)(modulePath);
    const render = typeof loaded === 'function' ? loaded : loaded?.default;
    if (typeof render !== 'function')
      throw new Error('The selected module does not export tex2svg.');
    const svg = await render(request.source, options);
    if (
      typeof svg !== 'string' ||
      Buffer.byteLength(svg, 'utf8') > MAX_TIKZ_OUTPUT_BYTES ||
      !isSvgOutput(svg)
    ) {
      throw new Error(
        'The selected renderer returned invalid or oversized SVG.',
      );
    }
    process.stdout.write(svg, () => process.exit(0));
  } catch (error) {
    fail(error);
  }
});
