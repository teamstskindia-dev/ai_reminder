export type TemplateVars = Record<string, string | number | boolean | null | undefined>;

const VAR_PATTERN = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

/**
 * Replaces `{{var}}` placeholders. Unknown/null variables render as an empty string.
 * `escape` is applied to every substituted value (e.g. escapeHtml for email bodies), never to the template.
 */
export function renderTemplate(template: string, vars: TemplateVars, escape?: (value: string) => string): string {
  return template.replace(VAR_PATTERN, (_match, name: string) => {
    const value = vars[name];
    const text = value === null || value === undefined ? '' : String(value);
    return escape ? escape(text) : text;
  });
}

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

/** Escapes characters with meaning in markdown so variable values render as plain text. */
export function escapeMarkdown(value: string): string {
  return value.replace(/([\\`*_{}[\]()#+!|>~])/g, '\\$1');
}

/** Names of the `{{variables}}` used in a template (deduplicated, in order). */
export function templateVariables(template: string): string[] {
  const names = new Set<string>();
  for (const m of template.matchAll(VAR_PATTERN)) names.add(m[1]);
  return [...names];
}

export function truncate(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}
