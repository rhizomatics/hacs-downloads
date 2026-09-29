export type HaAnalytics = {
  total: number;
  versions: Record<string, number>;
};

export type InstallVersionColumn = {
  version: string;
  installs: number;
};

function versionParts(version: string) {
  return version.replace(/^v/i, '').split(/[.\-+]/);
}

// Numeric parts compare numerically; a pre-release suffix (e.g. beta1) sorts before the plain release.
export function compareVersions(a: string, b: string) {
  const left = versionParts(a);
  const right = versionParts(b);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const l = left[index];
    const r = right[index];
    const ln = Number(l);
    const rn = Number(r);
    if (l === undefined) return Number.isInteger(rn) ? -1 : 1;
    if (r === undefined) return Number.isInteger(ln) ? 1 : -1;
    if (Number.isInteger(ln) && Number.isInteger(rn)) {
      if (ln !== rn) return ln - rn;
    } else if (l !== r) {
      return l.localeCompare(r);
    }
  }
  return 0;
}

// Oldest to newest, keeping the newest `limit - 1` versions and folding the rest into one "Older" column.
export function buildInstallVersionColumns(versions: Record<string, number>, limit = 12): InstallVersionColumn[] {
  const sorted = Object.entries(versions)
    .map(([version, installs]) => ({ version, installs }))
    .sort((a, b) => compareVersions(a.version, b.version));
  if (sorted.length <= limit) return sorted;
  const older = sorted.slice(0, sorted.length - limit + 1);
  return [
    { version: 'Older', installs: older.reduce((sum, column) => sum + column.installs, 0) },
    ...sorted.slice(sorted.length - limit + 1),
  ];
}
