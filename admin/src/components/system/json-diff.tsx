import { JsonView } from '@/components/forms/json-editor';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type Flat = Map<string, unknown>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Flatten nested objects/arrays to dot paths ("selectors.joinButtonText", "items.2.title"). */
function flatten(value: unknown, prefix = '', out: Flat = new Map()): Flat {
  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    if (keys.length === 0 && prefix) out.set(prefix, {});
    for (const key of keys) flatten(value[key], prefix ? `${prefix}.${key}` : key, out);
  } else if (Array.isArray(value)) {
    if (value.length === 0 && prefix) out.set(prefix, []);
    value.forEach((item, i) => flatten(item, prefix ? `${prefix}.${i}` : String(i), out));
  } else {
    out.set(prefix || '(value)', value);
  }
  return out;
}

function show(value: unknown): string {
  if (value === undefined) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

/** Extract `{ before, after }` (or `{ old, new }` / `{ from, to }`) from an audit log `changes` payload. */
function beforeAfter(changes: unknown): { before: unknown; after: unknown } | null {
  if (!isPlainObject(changes)) return null;
  for (const [a, b] of [
    ['before', 'after'],
    ['old', 'new'],
    ['from', 'to'],
  ] as const) {
    if (a in changes || b in changes) return { before: changes[a], after: changes[b] };
  }
  return null;
}

/** Changed paths between two values, with removed (red) and added (green) values side by side. */
export function JsonDiff({ changes }: { changes: unknown }) {
  const pair = beforeAfter(changes);
  if (!pair) {
    if (changes === null || changes === undefined) {
      return <p className="text-sm text-muted-foreground">No change details were recorded.</p>;
    }
    return <JsonView value={changes} />;
  }

  const before = flatten(pair.before);
  const after = flatten(pair.after);
  const paths = [...new Set([...before.keys(), ...after.keys()])].sort();
  const changed = paths.filter((p) => JSON.stringify(before.get(p)) !== JSON.stringify(after.get(p)));

  if (changed.length === 0) {
    return <p className="text-sm text-muted-foreground">No field values changed.</p>;
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-1/4">Field</TableHead>
            <TableHead>Before</TableHead>
            <TableHead>After</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {changed.map((path) => {
            const hasBefore = before.has(path);
            const hasAfter = after.has(path);
            return (
              <TableRow key={path} className="align-top">
                <TableCell className="font-mono text-xs whitespace-normal break-all">{path}</TableCell>
                <TableCell className="whitespace-normal">
                  {hasBefore ? (
                    <code className="block rounded bg-red-500/10 px-1.5 py-1 font-mono text-xs break-all whitespace-pre-wrap text-red-700 line-through decoration-red-700/40 dark:text-red-300">
                      {show(before.get(path))}
                    </code>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="whitespace-normal">
                  {hasAfter ? (
                    <code className="block rounded bg-emerald-500/10 px-1.5 py-1 font-mono text-xs break-all whitespace-pre-wrap text-emerald-700 dark:text-emerald-300">
                      {show(after.get(path))}
                    </code>
                  ) : (
                    <span className="text-xs text-muted-foreground">removed</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
