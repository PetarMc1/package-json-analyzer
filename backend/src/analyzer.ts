import npa from 'npm-package-arg';
import semver from 'semver';

export type DependencyGroup =
  | 'dependencies'
  | 'devDependencies'
  | 'peerDependencies'
  | 'optionalDependencies';

export type UpdateType = 'major' | 'minor' | 'patch' | 'prerelease' | 'none' | 'unknown';
export type UpdateSeverity = 'high' | 'medium' | 'low' | 'none' | 'unknown';

type PackageJson = {
  name?: string;
  version?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

type DepCounts = {
  scripts: number;
  dependencies: number;
  devDependencies: number;
  peerDependencies: number;
  optionalDependencies: number;
  total: number;
};

type PackageReference = {
  name: string;
  spec: string;
  group: DependencyGroup;
};

type ScriptGraph = {
  nodes: Array<{ id: string; label: string }>;
  edges: Array<{ from: string; to: string }>;
};

type SizePackageEstimate = {
  name: string;
  group: DependencyGroup;
  spec: string;
  resolvedVersion: string | null;
  installBytes: number;
  publishBytes: number;
  transitiveBytes: number;
  packageUrl: string;
};

type SizeDistributionEntry = {
  group: DependencyGroup;
  directPackages: number;
  installBytes: number;
  transitiveBytes: number;
};

type EstimatedSize = {
  totalPackages: number;
  totalInstallBytes: number;
  totalPublishBytes: number;
  totalTransitiveBytes: number;
  status: 'resolved' | 'partial' | 'unavailable';
  largestPackages: SizePackageEstimate[];
  distribution: SizeDistributionEntry[];
  note: string;
};

type OutdatedPackage = {
  name: string;
  packageUrl: string;
  group: DependencyGroup;
  sourceName: string;
  currentSpec: string;
  installedVersion: string | null;
  wantedVersion: string | null;
  latestVersion: string | null;
  updateType: UpdateType;
  severity: UpdateSeverity;
  recommendation: string;
  registry: 'npm';
};

type OutdatedResult = {
  status: 'resolved' | 'partial' | 'unavailable';
  note: string;
  packages: OutdatedPackage[];
  summary: {
    checked: number;
    outdated: number;
    bySeverity: Record<UpdateSeverity, number>;
  };
};

export type AnalysisResult = {
  name: string | null;
  version: string | null;
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
  optionalDependencies: Record<string, string>;
  counts: DepCounts;
  categories: Record<string, string[]>;
  estimatedInstallSize: EstimatedSize;
  scriptGraph: ScriptGraph;
  outdated: OutdatedResult;
};

export type FetchPackageJsonRequest = {
  source: 'github' | 'link';
  repo?: string;
  url?: string;
  ref?: string;
  path?: string;
};

export type FetchPackageJsonResult = {
  content: string;
  fetchedFrom: string;
};

type Packument = {
  versions?: Record<string, unknown>;
  'dist-tags'?: Record<string, string>;
};

type PackagePhobiaResponse = {
  install?: { bytes?: number };
  publish?: { bytes?: number };
};

type AliasResult = ReturnType<typeof npa> & {
  subSpec?: {
    name?: string;
    rawSpec?: string;
    fetchSpec?: string;
  };
};

const scriptRunPattern = /(?:npm|pnpm|yarn) run ([\w:.-]+)/g;

const catgoryRules: Array<{ category: string; patterns: RegExp[] }> = [
  {
    category: 'Framework',
    patterns: [/^react(-dom)?$/, /^next$/, /^vue$/, /^nuxt/, /^svelte/, /^@angular\//, /^solid-js$/],
  },
  {
    category: 'TypeScript',
    patterns: [/^typescript$/, /^ts-node$/, /^tsx$/, /^@types\//],
  },
  {
    category: 'Build',
    patterns: [/^vite$/, /^webpack/, /^rollup/, /^esbuild/, /^parcel/, /^@vitejs\//, /^turbo$/],
  },
  {
    category: 'Testing',
    patterns: [/^jest/, /^vitest/, /^mocha$/, /^chai$/, /^@testing-library\//, /^playwright/, /^cypress/, /^supertest$/],
  },
  {
    category: 'Linting',
    patterns: [/^eslint/, /^prettier/, /^stylelint/, /^@eslint\//],
  },
  {
    category: 'CSS',
    patterns: [/^tailwindcss/, /^sass$/, /^postcss/, /^less$/, /^styled-components$/, /^@emotion\//],
  },
  {
    category: 'HTTP',
    patterns: [/^axios$/, /^got$/, /^node-fetch/, /^ky$/, /^undici$/],
  },
  {
    category: 'Database',
    patterns: [/^prisma$/, /^@prisma\//, /^typeorm$/, /^mongoose$/, /^sequelize/, /^pg$/, /^mysql/, /^drizzle-orm$/],
  },
  {
    category: 'Runtime / Server',
    patterns: [/^express$/, /^fastify$/, /^koa$/, /^hono$/],
  },
  {
    category: 'Utilities',
    patterns: [/^lodash/, /^ramda$/, /^date-fns$/, /^dayjs$/, /^zod$/, /^yup$/],
  },
];

const packumentCache = new Map<string, Promise<Packument>>();
const sizeCache = new Map<string, Promise<PackagePhobiaResponse>>();

export async function analyzePackageJson(raw: string): Promise<AnalysisResult> {
  const pkg = parsePackageJson(raw);

  const scripts = safeRecord(pkg.scripts);
  const dependencies = safeRecord(pkg.dependencies);
  const devDependencies = safeRecord(pkg.devDependencies);
  const peerDependencies = safeRecord(pkg.peerDependencies);
  const optionalDependencies = safeRecord(pkg.optionalDependencies);

  const allDeps = {
    ...dependencies,
    ...devDependencies,
    ...peerDependencies,
    ...optionalDependencies,
  };

  const counts: DepCounts = {
    scripts: Object.keys(scripts).length,
    dependencies: Object.keys(dependencies).length,
    devDependencies: Object.keys(devDependencies).length,
    peerDependencies: Object.keys(peerDependencies).length,
    optionalDependencies: Object.keys(optionalDependencies).length,
    total: Object.keys(allDeps).length,
  };

  const packageReferences: PackageReference[] = [
    ...toPackageReferences('dependencies', dependencies),
    ...toPackageReferences('devDependencies', devDependencies),
    ...toPackageReferences('peerDependencies', peerDependencies),
    ...toPackageReferences('optionalDependencies', optionalDependencies),
  ];

  const [categories, scriptGraph, outdated, estimatedInstallSize] = await Promise.all([
    Promise.resolve(categorizePackages(allDeps)),
    Promise.resolve(buildScriptGraph(scripts)),
    checkOutdated(packageReferences),
    estimateInstallSize(packageReferences),
  ]);

  return {
    name: typeof pkg.name === 'string' ? pkg.name : null,
    version: typeof pkg.version === 'string' ? pkg.version : null,
    scripts,
    dependencies,
    devDependencies,
    peerDependencies,
    optionalDependencies,
    counts,
    categories,
    estimatedInstallSize,
    scriptGraph,
    outdated,
  };
}

export async function fetchPackageJson(
  request: FetchPackageJsonRequest,
): Promise<FetchPackageJsonResult> {
  if (request.source === 'github') {
    return fetchFromGithub(request);
  }

  return fetchFromLink(request);
}

function parsePackageJson(raw: string): PackageJson {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Invalid JSON: could not parse package.json content.');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Invalid package.json: root must be a JSON object.');
  }

  return parsed as PackageJson;
}

function safeRecord(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }

  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === 'string') {
      result[k] = v;
    }
  }

  return result;
}

function toPackageReferences(
  group: DependencyGroup,
  packages: Record<string, string>,
): PackageReference[] {
  return Object.entries(packages).map(([name, spec]) => ({ name, spec, group }));
}

function categorizePackages(allDeps: Record<string, string>): Record<string, string[]> {
  const result: Record<string, string[]> = { Other: [] };

  for (const name of Object.keys(allDeps)) {
    const matched = catgoryRules.find((rule) => rule.patterns.some((pattern) => pattern.test(name)));
    if (matched) {
      (result[matched.category] ??= []).push(name);
    } else {
      result.Other.push(name);
    }
  }

  for (const key of Object.keys(result)) {
    if (result[key].length === 0) {
      delete result[key];
    }
  }

  return result;
}

function buildScriptGraph(scripts: Record<string, string>): ScriptGraph {
  const scriptNames = new Set(Object.keys(scripts));
  const nodes = Object.keys(scripts).map((id) => ({ id, label: id }));
  const edges: Array<{ from: string; to: string }> = [];

  for (const [scriptName, scriptValue] of Object.entries(scripts)) {
    scriptRunPattern.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = scriptRunPattern.exec(scriptValue)) !== null) {
      const target = match[1];
      if (scriptNames.has(target) && target !== scriptName) {
        edges.push({ from: scriptName, to: target });
      }
    }
  }

  return { nodes, edges };
}

async function checkOutdated(packages: PackageReference[]): Promise<OutdatedResult> {
  if (packages.length === 0) {
    return buildOutdatedResult('resolved', 'No dependencies to compare.', [], 0);
  }

  try {
    const inspections = await Promise.all(packages.map((pkg) => inspectOutdatedPackage(pkg)));
    const comparable = inspections.filter((item): item is OutdatedPackage => item !== null);
    const hadUnknowns = comparable.length !== inspections.length;

    comparable.sort((left, right) => {
      const severityWeight = getSeverityWeight(right.severity) - getSeverityWeight(left.severity);
      if (severityWeight !== 0) {
        return severityWeight;
      }

      const typeWeight = getTypeWeight(right.updateType) - getTypeWeight(left.updateType);
      if (typeWeight !== 0) {
        return typeWeight;
      }

      return left.name.localeCompare(right.name);
    });

    return buildOutdatedResult(
      hadUnknowns ? 'partial' : 'resolved',
      hadUnknowns
        ? 'Compared npm registry versions where semver resolution was possible. Some dependency specs could not be resolved automatically.'
        : 'Compared declared dependency specs against the npm registry latest release.',
      comparable,
      packages.length,
    );
  } catch {
    return buildOutdatedResult(
      'unavailable',
      'Outdated analysis could not reach the npm registry.',
      [],
      packages.length,
    );
  }
}

async function inspectOutdatedPackage(pkg: PackageReference): Promise<OutdatedPackage | null> {
  let parsed: ReturnType<typeof npa>;

  try {
    parsed = npa(`${pkg.name}@${pkg.spec}`);
  } catch {
    return null;
  }

  const aliasParsed = parsed as AliasResult;
  const registryName = parsed.type === 'alias' ? aliasParsed.subSpec?.name : parsed.name;
  if (!registryName || parsed.registry === false) {
    return null;
  }

  const registrySpec =
    parsed.type === 'alias'
      ? aliasParsed.subSpec?.rawSpec ?? aliasParsed.subSpec?.fetchSpec
      : parsed.rawSpec ?? parsed.fetchSpec;
  if (!registrySpec || typeof registrySpec !== 'string') {
    return null;
  }

  const packument = await getPackument(registryName);
  const availableVersions = Object.keys(packument.versions ?? {}).filter((version) => semver.valid(version));
  const latestVersion = packument['dist-tags']?.latest ?? null;
  const installedVersion = resolveInstalledVersion(
    parsed.type,
    registrySpec,
    availableVersions,
    packument['dist-tags'],
  );
  const wantedVersion = resolveWantedVersion(parsed.type, registrySpec, availableVersions, packument['dist-tags']);

  if (!latestVersion || !installedVersion || latestVersion === installedVersion) {
    return null;
  }

  const updateType = resolveUpdateType(installedVersion, latestVersion);
  const severity = resolveSeverity(updateType);

  return {
    name: pkg.name,
    packageUrl: npmPackageUrl(registryName),
    group: pkg.group,
    sourceName: registryName,
    currentSpec: pkg.spec,
    installedVersion,
    wantedVersion,
    latestVersion,
    updateType,
    severity,
    recommendation: buildRecommendation(pkg.group, updateType),
    registry: 'npm',
  };
}

async function estimateInstallSize(packages: PackageReference[]): Promise<EstimatedSize> {
  if (packages.length === 0) {
    return buildSizeResult('resolved', [], 'No dependencies to estimate.', 0);
  }

  try {
    const resolvedPackages = await Promise.all(packages.map((pkg) => resolveSizePackage(pkg)));
    const comparable = resolvedPackages.filter(
      (item): item is { packageName: string; version: string; group: DependencyGroup; spec: string } =>
        item !== null,
    );

    const estimates = await Promise.all(comparable.map((pkg) => estimatePackageSize(pkg)));
    const successful = estimates.filter((item): item is SizePackageEstimate => item !== null);

    const status =
      successful.length === 0 ? 'unavailable' : successful.length === packages.length ? 'resolved' : 'partial';
    const note =
      status === 'resolved'
        ? 'Estimated install footprint from npm package metadata and Package Phobia install sizes.'
        : status === 'partial'
          ? 'Estimated install footprint where npm metadata and package size data were available.'
          : 'Package size services were unavailable for this dependency set.';

    return buildSizeResult(status, successful, note, packages.length);
  } catch {
    return buildSizeResult('unavailable', [], 'Package size services were unavailable.', packages.length);
  }
}

async function resolveSizePackage(
  pkg: PackageReference,
): Promise<{ packageName: string; version: string; group: DependencyGroup; spec: string } | null> {
  let parsed: ReturnType<typeof npa>;

  try {
    parsed = npa(`${pkg.name}@${pkg.spec}`);
  } catch {
    return null;
  }

  const aliasParsed = parsed as AliasResult;
  const registryName = parsed.type === 'alias' ? aliasParsed.subSpec?.name : parsed.name;
  if (!registryName || parsed.registry === false) {
    return null;
  }

  const registrySpec =
    parsed.type === 'alias'
      ? aliasParsed.subSpec?.rawSpec ?? aliasParsed.subSpec?.fetchSpec
      : parsed.rawSpec ?? parsed.fetchSpec;
  if (!registrySpec || typeof registrySpec !== 'string') {
    return null;
  }

  const packument = await getPackument(registryName);
  const availableVersions = Object.keys(packument.versions ?? {}).filter((version) => semver.valid(version));
  const version = resolveInstalledVersion(parsed.type, registrySpec, availableVersions, packument['dist-tags']);
  if (!version) {
    return null;
  }

  return { packageName: registryName, version, group: pkg.group, spec: pkg.spec };
}

async function estimatePackageSize(pkg: {
  packageName: string;
  version: string;
  group: DependencyGroup;
  spec: string;
}): Promise<SizePackageEstimate | null> {
  try {
    const key = `${pkg.packageName}@${pkg.version}`;
    let cached = sizeCache.get(key);
    if (!cached) {
      const query = encodeURIComponent(key);
      cached = fetch(`https://packagephobia.com/v2/api.json?p=${query}`).then(async (response) => {
        if (!response.ok) {
          throw new Error(`Size lookup failed for ${key}.`);
        }

        return response.json() as Promise<PackagePhobiaResponse>;
      });
      sizeCache.set(key, cached);
    }

    const data = await cached;
    const installBytes = normalizeBytes(data.install?.bytes);
    const publishBytes = normalizeBytes(data.publish?.bytes);

    return {
      name: pkg.packageName,
      group: pkg.group,
      spec: pkg.spec,
      resolvedVersion: pkg.version,
      installBytes,
      publishBytes,
      transitiveBytes: Math.max(installBytes - publishBytes, 0),
      packageUrl: npmPackageUrl(pkg.packageName),
    };
  } catch {
    return null;
  }
}

function buildSizeResult(
  status: EstimatedSize['status'],
  packages: SizePackageEstimate[],
  note: string,
  totalPackages = packages.length,
): EstimatedSize {
  const totalInstallBytes = packages.reduce((sum, item) => sum + item.installBytes, 0);
  const totalPublishBytes = packages.reduce((sum, item) => sum + item.publishBytes, 0);
  const totalTransitiveBytes = packages.reduce((sum, item) => sum + item.transitiveBytes, 0);

  const distributionMap = packages.reduce<Record<DependencyGroup, SizeDistributionEntry>>(
    (acc, item) => {
      const current = acc[item.group] ?? {
        group: item.group,
        directPackages: 0,
        installBytes: 0,
        transitiveBytes: 0,
      };

      current.directPackages += 1;
      current.installBytes += item.installBytes;
      current.transitiveBytes += item.transitiveBytes;
      acc[item.group] = current;
      return acc;
    },
    {
      dependencies: { group: 'dependencies', directPackages: 0, installBytes: 0, transitiveBytes: 0 },
      devDependencies: { group: 'devDependencies', directPackages: 0, installBytes: 0, transitiveBytes: 0 },
      peerDependencies: { group: 'peerDependencies', directPackages: 0, installBytes: 0, transitiveBytes: 0 },
      optionalDependencies: { group: 'optionalDependencies', directPackages: 0, installBytes: 0, transitiveBytes: 0 },
    },
  );

  return {
    totalPackages,
    totalInstallBytes,
    totalPublishBytes,
    totalTransitiveBytes,
    status,
    largestPackages: [...packages]
      .sort((left, right) => right.installBytes - left.installBytes || left.name.localeCompare(right.name))
      .slice(0, 8),
    distribution: Object.values(distributionMap),
    note,
  };
}

function buildOutdatedResult(
  status: OutdatedResult['status'],
  note: string,
  packages: OutdatedPackage[],
  checked = packages.length,
): OutdatedResult {
  const bySeverity: Record<UpdateSeverity, number> = {
    high: 0,
    medium: 0,
    low: 0,
    none: 0,
    unknown: 0,
  };

  for (const item of packages) {
    bySeverity[item.severity] += 1;
  }

  return {
    status,
    note,
    packages,
    summary: {
      checked,
      outdated: packages.length,
      bySeverity,
    },
  };
}

async function getPackument(packageName: string): Promise<Packument> {
  let cached = packumentCache.get(packageName);
  if (!cached) {
    cached = fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}`).then(async (response) => {
      if (!response.ok) {
        throw new Error(`Registry lookup failed for ${packageName}.`);
      }

      return response.json() as Promise<Packument>;
    });
    packumentCache.set(packageName, cached);
  }

  return cached;
}

function resolveInstalledVersion(
  type: string,
  spec: string,
  versions: string[],
  distTags: Record<string, string> | undefined,
): string | null {
  if (type === 'version') {
    return semver.valid(spec) ?? null;
  }

  if (type === 'tag') {
    return distTags?.[spec] ?? null;
  }

  if (type === 'range') {
    return semver.maxSatisfying(versions, spec, { includePrerelease: true }) ?? null;
  }

  return null;
}

function resolveWantedVersion(
  type: string,
  spec: string,
  versions: string[],
  distTags: Record<string, string> | undefined,
): string | null {
  if (type === 'tag') {
    return distTags?.[spec] ?? null;
  }

  if (type === 'version') {
    return semver.valid(spec) ?? null;
  }

  if (type === 'range') {
    return semver.maxSatisfying(versions, spec, { includePrerelease: true }) ?? null;
  }

  return null;
}

function resolveUpdateType(installedVersion: string, latestVersion: string): UpdateType {
  if (installedVersion === latestVersion) {
    return 'none';
  }

  return (semver.diff(installedVersion, latestVersion) as UpdateType | null) ?? 'unknown';
}

function resolveSeverity(updateType: UpdateType): UpdateSeverity {
  switch (updateType) {
    case 'major':
      return 'high';
    case 'minor':
      return 'medium';
    case 'patch':
    case 'prerelease':
      return 'low';
    case 'none':
      return 'none';
    default:
      return 'unknown';
  }
}

function buildRecommendation(group: DependencyGroup, updateType: UpdateType): string {
  if (updateType === 'major') {
    return group === 'dependencies'
      ? 'Review changelog and test runtime flows before upgrading.'
      : 'Review release notes before updating this non-runtime dependency.';
  }

  if (updateType === 'minor') {
    return group === 'dependencies'
      ? 'Safe candidate for a scheduled update with regression checks.'
      : 'Low-friction maintenance update; verify build and tests after bumping.';
  }

  if (updateType === 'patch' || updateType === 'prerelease') {
    return 'Routine maintenance update. Verify lockfile and CI output.';
  }

  return 'Manual review recommended.';
}

function getSeverityWeight(severity: UpdateSeverity): number {
  switch (severity) {
    case 'high':
      return 4;
    case 'medium':
      return 3;
    case 'low':
      return 2;
    case 'unknown':
      return 1;
    default:
      return 0;
  }
}

function getTypeWeight(type: UpdateType): number {
  switch (type) {
    case 'major':
      return 4;
    case 'minor':
      return 3;
    case 'patch':
      return 2;
    case 'prerelease':
      return 1;
    default:
      return 0;
  }
}

function normalizeBytes(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function npmPackageUrl(name: string): string {
  return `https://www.npmjs.com/package/${encodeURIComponent(name).replace('%2F', '/')}`;
}

async function fetchFromLink(request: FetchPackageJsonRequest): Promise<FetchPackageJsonResult> {
  const rawUrl = (request.url ?? '').trim();
  if (!rawUrl) {
    throw new Error('Missing URL for link source.');
  }

  const url = parseHttpUrl(rawUrl, 'Invalid URL. Use http:// or https://');
  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Could not fetch package.json from link (HTTP ${response.status}).`);
  }

  const content = await response.text();
  validatePackageJsonContent(content);
  return { content, fetchedFrom: url.toString() };
}

async function fetchFromGithub(request: FetchPackageJsonRequest): Promise<FetchPackageJsonResult> {
  const parsed = parseGithubRepo((request.repo ?? '').trim());
  if (!parsed) {
    throw new Error('Invalid GitHub repo. Use owner/repo or a github.com URL.');
  }

  const targetPath = normalizePackagePath(request.path ?? 'package.json');
  const refs = request.ref?.trim() ? [request.ref.trim()] : ['main', 'master'];

  for (const ref of refs) {
    const rawUrl = `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${encodeURIComponent(ref)}/${targetPath}`;
    const response = await fetch(rawUrl);
    if (!response.ok) {
      continue;
    }

    const content = await response.text();
    validatePackageJsonContent(content);
    return { content, fetchedFrom: rawUrl };
  }

  throw new Error('Could not find package.json in the GitHub repository (checked main/master).');
}

function parseHttpUrl(value: string, errorMessage: string): URL {
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error(errorMessage);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(errorMessage);
  }

  return parsed;
}

function parseGithubRepo(input: string): { owner: string; repo: string } | null {
  if (!input) {
    return null;
  }

  if (input.includes('github.com')) {
    const url = parseHttpUrl(input, 'Invalid GitHub URL.');
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 2) {
      return null;
    }

    return {
      owner: sanitizeSegment(parts[0]),
      repo: sanitizeSegment(parts[1].replace(/\.git$/i, '')),
    };
  }

  const match = /^([\w.-]+)\/([\w.-]+)$/.exec(input);
  if (!match) {
    return null;
  }

  return {
    owner: sanitizeSegment(match[1]),
    repo: sanitizeSegment(match[2]),
  };
}

function sanitizeSegment(value: string): string {
  return value.trim().replace(/[^\w.-]/g, '');
}

function normalizePackagePath(value: string): string {
  const cleaned = value.trim().replace(/^\/+/, '').replace(/\/+/, '/');
  if (!cleaned) {
    return 'package.json';
  }

  if (!cleaned.toLowerCase().endsWith('.json')) {
    return `${cleaned.replace(/\/$/, '')}/package.json`;
  }

  return cleaned;
}

function validatePackageJsonContent(content: string): void {
  if (!content.trim()) {
    throw new Error('Fetched file is empty.');
  }

  try {
    const parsed = JSON.parse(content) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('Fetched content is not an object.');
    }
  } catch {
    throw new Error('Fetched content is not a valid package.json JSON object.');
  }
}
