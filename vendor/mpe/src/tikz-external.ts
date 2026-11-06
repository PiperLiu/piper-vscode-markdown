// SPDX-License-Identifier: MIT
// Copyright (c) 2026 PiperLiu
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  MAX_TIKZ_INPUT_BYTES,
  MAX_TIKZ_OUTPUT_BYTES,
  MAX_TIKZ_DIAGNOSTIC_BYTES,
  TIKZ_TIMEOUT_MS,
  sanitizeTikzOptions,
  validateTikzSource,
  isSvgOutput,
} from './tikz-protocol';

export const TIKZ_RENDERER_ENV = 'PIPER_MARKDOWN_TIKZ_RENDERER_PATH';
let configuredPath: string | undefined;

/** Called by the native host with application/user-scope settings only. */
export function configureTikzRenderer(modulePath: string | undefined) {
  configuredPath = modulePath?.trim() ?? '';
}

export function getTikzRendererModulePath(): string {
  const supplied = configuredPath ?? process.env[TIKZ_RENDERER_ENV] ?? '';
  const candidate = supplied.startsWith('~/')
    ? path.join(os.homedir(), supplied.slice(2))
    : supplied;
  if (candidate && !path.isAbsolute(candidate)) {
    throw new Error(
      'piperMarkdown.enhanced.tikzRendererPath must be an absolute module path.',
    );
  }
  return (
    candidate ||
    path.join(
      os.homedir(),
      '.local/share/piper-markdown-tools/node_modules/node-tikzjax',
    )
  );
}

function installationHint() {
  const prefix = path.join(os.homedir(), '.local/share/piper-markdown-tools');
  return `TikZ is an optional, separately installed tool. Install it with: npm install --prefix ${JSON.stringify(prefix)} node-tikzjax@1.0.5. For another location, set piperMarkdown.enhanced.tikzRendererPath in user settings.`;
}

interface TikzProcessOptions {
  modulePath?: string;
  runnerPath?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

/** Also exported for subprocess boundary tests; document options never enter this argument. */
export async function runTikzProcess(
  source: string,
  options: unknown = {},
  runtime: TikzProcessOptions = {},
): Promise<string> {
  validateTikzSource(source);
  const payload = Buffer.from(
    JSON.stringify({ source, options: sanitizeTikzOptions(options) }),
    'utf8',
  );
  if (payload.length > MAX_TIKZ_INPUT_BYTES)
    throw new Error('TikZ request exceeds 1 MiB.');
  const modulePath = runtime.modulePath ?? getTikzRendererModulePath();
  if (!path.isAbsolute(modulePath))
    throw new Error('TikZ renderer module path must be absolute.');
  if (!fs.existsSync(modulePath)) throw new Error(installationHint());
  const runnerPath =
    runtime.runnerPath ?? path.join(__dirname, 'tikz-runner.cjs');
  if (!fs.existsSync(runnerPath))
    throw new Error(
      'The Piper TikZ runner is missing. Reinstall the extension.',
    );
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [runnerPath, modulePath], {
      shell: false,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let finished = false;
    let outputBytes = 0;
    let diagnosticBytes = 0;
    const chunks: Buffer[] = [];
    const diagnostics: Buffer[] = [];
    const timer = setTimeout(
      () => fail(new Error('TikZ rendering timed out after 30 seconds.')),
      runtime.timeoutMs ?? TIKZ_TIMEOUT_MS,
    );
    function fail(error: Error) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      child.kill('SIGKILL');
      reject(error);
    }
    child.on('error', fail);
    child.stdin.on('error', (error) => {
      if (!finished) fail(error);
    });
    child.stdout.on('data', (chunk: Buffer) => {
      if (finished) return;
      outputBytes += chunk.length;
      if (outputBytes > (runtime.maxOutputBytes ?? MAX_TIKZ_OUTPUT_BYTES))
        return fail(new Error('TikZ SVG exceeds the 8 MiB output limit.'));
      chunks.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (finished) return;
      diagnosticBytes += chunk.length;
      if (diagnosticBytes > MAX_TIKZ_DIAGNOSTIC_BYTES)
        return fail(
          new Error('TikZ diagnostics exceed the 64 KiB output limit.'),
        );
      diagnostics.push(chunk);
    });
    child.on('close', (code) => {
      if (finished) return;
      clearTimeout(timer);
      if (code !== 0) {
        return fail(
          new Error(
            `TikZ renderer failed: ${Buffer.concat(diagnostics).toString('utf8').trim().slice(0, 2048) || `exit ${code}`}. ${installationHint()}`,
          ),
        );
      }
      const svg = Buffer.concat(chunks).toString('utf8');
      if (!isSvgOutput(svg))
        return fail(new Error('TikZ renderer returned invalid SVG.'));
      finished = true;
      resolve(svg);
    });
    child.stdin.end(payload);
  });
}

/** API-compatible substitute for node-tikzjax's default tex2svg export. */
export default function tex2svg(
  source: string,
  options: unknown = {},
): Promise<string> {
  return runTikzProcess(source, options);
}
