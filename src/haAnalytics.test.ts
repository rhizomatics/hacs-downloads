import { describe, expect, it } from 'vitest';
import { buildInstallVersionColumns, compareVersions } from './haAnalytics';

describe('compareVersions', () => {
  it.each([
    ['2.9.1', '2.10.0'],
    ['v1.16.5', '2.4.2'],
    ['2.11.0-beta2', '2.11.0'],
    ['2.11.0-beta1', '2.11.0-beta2'],
    ['2.11', '2.11.1'],
  ])('orders %s before %s', (older, newer) => {
    expect(compareVersions(older, newer)).toBeLessThan(0);
    expect(compareVersions(newer, older)).toBeGreaterThan(0);
  });

  it('treats a v prefix as the same version', () => {
    expect(compareVersions('v2.10.3', '2.10.3')).toBe(0);
  });
});

describe('buildInstallVersionColumns', () => {
  it('orders versions oldest to newest', () => {
    expect(buildInstallVersionColumns({ '2.10.0': 1, '2.9.1': 5, '2.10.3': 17 })).toEqual([
      { version: '2.9.1', installs: 5 },
      { version: '2.10.0', installs: 1 },
      { version: '2.10.3', installs: 17 },
    ]);
  });

  it('folds versions beyond the limit into an Older column', () => {
    expect(buildInstallVersionColumns({ '1.0.0': 2, '1.1.0': 3, '1.2.0': 4, '1.3.0': 5 }, 3)).toEqual([
      { version: 'Older', installs: 5 },
      { version: '1.2.0', installs: 4 },
      { version: '1.3.0', installs: 5 },
    ]);
  });
});
