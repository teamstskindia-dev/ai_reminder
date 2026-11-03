interface ParsedVersion {
  core: [number, number, number];
  prerelease: string[];
}

function parse(version: string): ParsedVersion | null {
  const match = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(version.trim());
  if (!match) return null;
  return {
    core: [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)],
    prerelease: match[4] ? match[4].split('.') : [],
  };
}

function compareIdentifiers(a: string, b: string): number {
  const na = /^\d+$/.test(a);
  const nb = /^\d+$/.test(b);
  if (na && nb) return Math.sign(Number(a) - Number(b));
  if (na) return -1;
  if (nb) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Semantic-version comparison (major.minor.patch with prerelease precedence; build metadata ignored).
 * Returns -1, 0 or 1. Unparseable input compares as equal so a bad config never locks users out.
 */
export function compareVersions(a: string, b: string): number {
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 3; i++) {
    if (pa.core[i] !== pb.core[i]) return pa.core[i] > pb.core[i] ? 1 : -1;
  }
  if (!pa.prerelease.length && !pb.prerelease.length) return 0;
  if (!pa.prerelease.length) return 1;
  if (!pb.prerelease.length) return -1;
  const len = Math.max(pa.prerelease.length, pb.prerelease.length);
  for (let i = 0; i < len; i++) {
    const x = pa.prerelease[i];
    const y = pb.prerelease[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const cmp = compareIdentifiers(x, y);
    if (cmp !== 0) return cmp;
  }
  return 0;
}

export function isVersionBelow(current: string, minimum: string | null | undefined): boolean {
  if (!minimum) return false;
  return compareVersions(current, minimum) < 0;
}
