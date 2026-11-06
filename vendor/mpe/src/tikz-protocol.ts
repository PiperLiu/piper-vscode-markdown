// SPDX-License-Identifier: MIT
// Copyright (c) 2026 PiperLiu
/** The subprocess protocol carries data only; it cannot select a module or executable. */
export const MAX_TIKZ_SOURCE_BYTES = 512 * 1024;
export const MAX_TIKZ_INPUT_BYTES = 1024 * 1024;
export const MAX_TIKZ_OUTPUT_BYTES = 8 * 1024 * 1024;
export const MAX_TIKZ_DIAGNOSTIC_BYTES = 64 * 1024;
export const TIKZ_TIMEOUT_MS = 30_000;

export interface TikzRenderOptions {
  texPackages?: Record<string, string>;
  tikzLibraries?: string;
  addToPreamble?: string;
  embedFontCss?: boolean;
  fontCssUrl?: string;
  showConsole: false;
}

export function sanitizeTikzOptions(input: unknown): TikzRenderOptions {
  const value =
    input && typeof input === 'object'
      ? (input as Record<string, unknown>)
      : {};
  const options: TikzRenderOptions = { showConsole: false };
  if (
    value.texPackages &&
    typeof value.texPackages === 'object' &&
    !Array.isArray(value.texPackages)
  ) {
    const entries = Object.entries(value.texPackages);
    if (entries.length > 64)
      throw new Error('TikZ accepts at most 64 TeX packages.');
    options.texPackages = Object.fromEntries(
      entries.map(([name, flags]) => {
        if (
          !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(name) ||
          typeof flags !== 'string' ||
          flags.length > 4096
        ) {
          throw new Error('Invalid TikZ TeX package options.');
        }
        return [name, flags];
      }),
    );
  }
  for (const key of ['tikzLibraries', 'addToPreamble'] as const) {
    const text = value[key];
    if (text === undefined) continue;
    if (
      typeof text !== 'string' ||
      text.length > (key === 'addToPreamble' ? 65536 : 8192)
    ) {
      throw new Error(`Invalid or oversized TikZ ${key}.`);
    }
    options[key] = text;
  }
  if (typeof value.embedFontCss === 'boolean')
    options.embedFontCss = value.embedFontCss;
  if (value.fontCssUrl !== undefined) {
    if (
      typeof value.fontCssUrl !== 'string' ||
      value.fontCssUrl.length > 4096 ||
      !/^https?:\/\//i.test(value.fontCssUrl)
    ) {
      throw new Error('TikZ fontCssUrl must be an HTTP(S) URL.');
    }
    options.fontCssUrl = value.fontCssUrl;
  }
  return options;
}

export function validateTikzSource(source: unknown): asserts source is string {
  if (
    typeof source !== 'string' ||
    Buffer.byteLength(source, 'utf8') > MAX_TIKZ_SOURCE_BYTES
  ) {
    throw new Error('TikZ source must be text no larger than 512 KiB.');
  }
}

export function isSvgOutput(value: string): boolean {
  return (
    /^\s*(?:<\?xml[^?]*\?>\s*)?<svg(?:\s|>)/i.test(value) &&
    /<\/svg>\s*$/i.test(value)
  );
}
