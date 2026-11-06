import type { NotebookConfig } from 'crossnote';

// Host-only provenance survives Notebook's config spreads but never serializes
// into the document/webview configuration or changes a saved user setting.
export const EXPLICIT_MERMAID_STYLE = Symbol('piper.explicitMermaidStyle');
export type ExportAppearanceConfig = Partial<NotebookConfig> & {
  [EXPLICIT_MERMAID_STYLE]?: boolean;
};
const darkThemes = new Set([
  'atom-dark.css',
  'atom-material.css',
  'github-dark.css',
  'monokai.css',
  'night.css',
  'one-dark.css',
  'solarized-dark.css',
]);
export function hasMermaidStyleChoice(config: Partial<NotebookConfig>) {
  const custom = config.mermaidConfig;
  if (custom && (typeof custom !== 'object' || Array.isArray(custom)))
    return true;
  return (
    config.mermaidTheme !== undefined ||
    (!!custom &&
      ['theme', 'themeVariables', 'themeCSS', 'darkMode'].some(
        (key) => key in custom,
      ))
  );
}
export function automaticMermaidExportAppearance(
  config: ExportAppearanceConfig,
  yaml: Record<string, unknown>,
  options: { isForPrint?: boolean; isForPrince?: boolean },
  markdown: string,
): { theme: 'default' | 'dark'; backdrop: boolean } | undefined {
  // Preserve explicitly chosen defaults as well as custom themes/variables.
  if (
    config[EXPLICIT_MERMAID_STYLE] ||
    (config.mermaidTheme && config.mermaidTheme !== 'default') ||
    hasMermaidStyleChoice({ mermaidConfig: config.mermaidConfig })
  )
    return;
  // Per-diagram init/frontmatter can intentionally select its own palette.
  if (
    /%%\s*\{\s*init\s*:/i.test(markdown) ||
    /\btheme(?:Variables|CSS)?\s*:/i.test(markdown)
  )
    return;
  const paper = !!(options.isForPrint || options.isForPrince);
  const forceLight = paper && !config.printBackground && !yaml.print_background;
  if (forceLight && !yaml.isPresentationMode)
    return { theme: 'default', backdrop: false };
  const html =
    yaml.html && typeof yaml.html === 'object' && !Array.isArray(yaml.html)
      ? (yaml.html as Record<string, unknown>)
      : {};
  // Adaptive HTML and presentations can change background independently of the
  // chosen preview theme. A light diagram canvas keeps the default palette
  // legible without guessing at those pages' final background.
  if (
    yaml.isPresentationMode ||
    (!paper &&
      (html.export_color_scheme ?? config.exportColorScheme) === 'auto')
  ) {
    return { theme: 'default', backdrop: true };
  }
  return {
    theme: darkThemes.has(config.previewTheme ?? '') ? 'dark' : 'default',
    backdrop: false,
  };
}
