export interface ScriptNode {
  id: string;
  label: string;
}

export interface ScriptEdge {
  from: string;
  to: string;
}

export interface ScriptGraph {
  nodes: ScriptNode[];
  edges: ScriptEdge[];
}

export interface DepCounts {
  scripts: number;
  dependencies: number;
  devDependencies: number;
  peerDependencies: number;
  optionalDependencies: number;
  total: number;
}

export interface EstimatedSize {
  totalPackages: number;
  totalInstallBytes: number;
  totalPublishBytes: number;
  totalTransitiveBytes: number;
  status: 'resolved' | 'partial' | 'unavailable';
  largestPackages: SizePackageEstimate[];
  distribution: SizeDistributionEntry[];
  note: string;
}

export interface SizePackageEstimate {
  name: string;
  group: DependencyGroup;
  spec: string;
  resolvedVersion: string | null;
  installBytes: number;
  publishBytes: number;
  transitiveBytes: number;
  packageUrl: string;
}

export interface SizeDistributionEntry {
  group: DependencyGroup;
  directPackages: number;
  installBytes: number;
  transitiveBytes: number;
}

export type DependencyGroup =
  | 'dependencies'
  | 'devDependencies'
  | 'peerDependencies'
  | 'optionalDependencies';

export type UpdateType = 'major' | 'minor' | 'patch' | 'prerelease' | 'none' | 'unknown';

export type UpdateSeverity = 'high' | 'medium' | 'low' | 'none' | 'unknown';

export interface OutdatedPackage {
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
}

export interface OutdatedSummary {
  checked: number;
  outdated: number;
  bySeverity: Record<UpdateSeverity, number>;
}

export interface OutdatedResult {
  status: 'resolved' | 'partial' | 'unavailable';
  note: string;
  packages: OutdatedPackage[];
  summary: OutdatedSummary;
}

export interface AnalysisResult {
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
}
