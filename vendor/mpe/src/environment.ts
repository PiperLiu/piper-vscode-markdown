/** Kept independent of configuration to avoid module-initialization cycles. */
export function isVSCodeWebExtension() {
  return process.env.IS_VSCODE_WEB_EXTENSION === 'true';
}
