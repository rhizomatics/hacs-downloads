import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectsPath = path.join(projectRoot, 'src', 'projects.json');
const historyPath = path.join(projectRoot, 'public', 'download-history.json');
const githubApiVersion = '2022-11-28';
const retentionDays = 400;

function resolveAssetName(project, tag) {
  if (project.assetName) return project.assetName;
  const version = tag.replace(/^v/i, '');
  return project.assetNameTemplate
    .replaceAll('{tag}', tag)
    .replaceAll('{version}', version);
}

function buildHeaders(token) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'hacs-downloads-history',
    'X-GitHub-Api-Version': githubApiVersion,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

const releaseHeaders = buildHeaders(process.env.GITHUB_TOKEN);
// Traffic stats require push access to the target repo, which the default
// Actions GITHUB_TOKEN doesn't have for repos outside this one, so a
// separate PAT is needed there. Falls back to GITHUB_TOKEN for local runs.
const trafficHeaders = buildHeaders(process.env.TRAFFIC_GITHUB_TOKEN || process.env.GITHUB_TOKEN);

async function fetchReleaseStats(project) {
  const response = await fetch(`https://api.github.com/repos/${project.owner}/${project.repo}/releases?per_page=100`, { headers: releaseHeaders });
  if (!response.ok) throw new Error(`${project.owner}/${project.repo}: GitHub returned ${response.status}`);

  const payload = await response.json();
  const releases = Object.fromEntries(payload.flatMap((release) => {
    if (release.draft || !release.published_at) return [];
    const expectedAssetName = resolveAssetName(project, release.tag_name);
    const asset = release.assets.find((candidate) => candidate.name === expectedAssetName);
    return asset ? [[release.tag_name, asset.download_count]] : [];
  }));

  return {
    total: Object.values(releases).reduce((sum, downloads) => sum + downloads, 0),
    releases,
  };
}

async function fetchCloneStats(project, capturedDate) {
  const response = await fetch(`https://api.github.com/repos/${project.owner}/${project.repo}/traffic/clones`, { headers: trafficHeaders });
  if (response.status === 403 || response.status === 404) {
    console.warn(`${project.owner}/${project.repo}: no access to traffic stats (${response.status}), skipping clone stats.`);
    return null;
  }
  if (!response.ok) throw new Error(`${project.owner}/${project.repo}: traffic API returned ${response.status}`);

  const payload = await response.json();
  // The most recent entry can be a partial "today", so only count completed days.
  const completedDays = payload.clones.filter((day) => day.timestamp.slice(0, 10) !== capturedDate);
  const latest = completedDays.at(-1);
  return latest ? { date: latest.timestamp.slice(0, 10), count: latest.count, uniques: latest.uniques } : null;
}

async function fetchProject(project, capturedDate) {
  const [releaseStats, clones] = await Promise.all([
    fetchReleaseStats(project),
    fetchCloneStats(project, capturedDate),
  ]);
  return { ...releaseStats, clones };
}

const projects = JSON.parse(await readFile(projectsPath, 'utf8'));
const history = JSON.parse(await readFile(historyPath, 'utf8'));
const capturedAt = new Date().toISOString();
const capturedDate = capturedAt.slice(0, 10);
const projectEntries = await Promise.all(projects.map(async (project) => [project.id, await fetchProject(project, capturedDate)]));
const nextSnapshot = { capturedAt, projects: Object.fromEntries(projectEntries) };
const retentionStart = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
const retainedSnapshots = history.snapshots.filter((snapshot) => (
  Date.parse(snapshot.capturedAt) >= retentionStart
  && snapshot.capturedAt.slice(0, 10) !== capturedDate
));

retainedSnapshots.push(nextSnapshot);
retainedSnapshots.sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt));

await writeFile(historyPath, `${JSON.stringify({ schemaVersion: 1, snapshots: retainedSnapshots }, null, 2)}\n`);
console.log(`Captured ${capturedDate}: ${projectEntries.length} projects, ${retainedSnapshots.length} retained snapshots.`);
