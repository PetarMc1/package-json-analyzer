import { useDeferredValue, useMemo, useState } from 'react';
import type {
  AnalysisResult,
  DependencyGroup,
  OutdatedPackage,
  ScriptEdge,
  ScriptNode,
  UpdateSeverity,
  UpdateType,
} from '../../types';

interface Props {
  result: AnalysisResult;
  onReset: () => void;
}

type DepGroupKey = 'dependencies' | 'devDependencies' | 'peerDependencies' | 'optionalDependencies';
type DependencySortKey = 'name' | 'group' | 'category' | 'version';
type OutdatedSortKey = 'severity' | 'name' | 'group' | 'latest';
type ScriptTab = 'graph' | 'table';

const GROUPS: Array<{ key: DepGroupKey; label: string }> = [
  { key: 'dependencies', label: 'Dependencies' },
  { key: 'devDependencies', label: 'Dev Dependencies' },
  { key: 'peerDependencies', label: 'Peer Dependencies' },
  { key: 'optionalDependencies', label: 'Optional Dependencies' },
];

const groupLabels: Record<DependencyGroup, string> = {
  dependencies: 'Dependencies',
  devDependencies: 'Dev Dependencies',
  peerDependencies: 'Peer Dependencies',
  optionalDependencies: 'Optional Dependencies',
};

const severityLabels: Record<UpdateSeverity, string> = {
  high: 'High risk',
  medium: 'Medium risk',
  low: 'Low risk',
  none: 'No risk',
  unknown: 'Unknown risk',
};

const scriptNodeWidth = 144;
const scriptNodeHeight = 38;
const scriptHorizontalGap = 88;
const scriptVerticalGap = 16;
const scriptPad = 20;
const maxScriptLabel = 17;

interface DependencyItem {
  name: string;
  version: string;
  group: DepGroupKey;
  groupLabel: string;
  category: string;
  isScoped: boolean;
  versionKind: string;
  normalizedVersion: string;
}

interface PositionedNode extends ScriptNode {
  x: number;
  y: number;
  isolated: boolean;
}

interface GraphLayout {
  nodes: PositionedNode[];
  edges: ScriptEdge[];
  width: number;
  height: number;
}

export function Dashboard({ result, onReset }: Props) {
  const [dependencyGroupFilter, setDependencyGroupFilter] = useState<DepGroupKey | 'all'>('all');
  const [dependencySortKey, setDependencySortKey] = useState<DependencySortKey>('name');
  const [dependencyQuery, setDependencyQuery] = useState('');
  const deferredDependencyQuery = useDeferredValue(dependencyQuery.trim().toLowerCase());

  const [outdatedGroupFilter, setOutdatedGroupFilter] = useState<DependencyGroup | 'all'>('all');
  const [outdatedSeverityFilter, setOutdatedSeverityFilter] = useState<UpdateSeverity | 'all'>('all');
  const [outdatedSortKey, setOutdatedSortKey] = useState<OutdatedSortKey>('severity');

  const hasScriptEdges = result.scriptGraph.edges.length > 0;
  const [scriptTab, setScriptTab] = useState<ScriptTab>(hasScriptEdges ? 'graph' : 'table');

  const dependencyItems = useMemo(
    () => buildDependencyItems(result),
    [result],
  );

  const filteredDependencyItems = useMemo(() => {
    const filtered = dependencyItems.filter((item) => {
      if (dependencyGroupFilter !== 'all' && item.group !== dependencyGroupFilter) {
        return false;
      }

      if (!deferredDependencyQuery) {
        return true;
      }

      const haystack = `${item.name} ${item.category} ${item.groupLabel} ${item.version}`.toLowerCase();
      return haystack.includes(deferredDependencyQuery);
    });

    return sortDependencyItems(filtered, dependencySortKey);
  }, [dependencyItems, dependencyGroupFilter, deferredDependencyQuery, dependencySortKey]);

  const dependencyGroupCounts = useMemo(
    () => ({
      dependencies: Object.keys(result.dependencies).length,
      devDependencies: Object.keys(result.devDependencies).length,
      peerDependencies: Object.keys(result.peerDependencies).length,
      optionalDependencies: Object.keys(result.optionalDependencies).length,
    }),
    [result.dependencies, result.devDependencies, result.peerDependencies, result.optionalDependencies],
  );

  const largestDependencyGroupSize = Math.max(...Object.values(dependencyGroupCounts), 0);

  const visibleDependencyCategoryCount = new Set(filteredDependencyItems.map((item) => item.category)).size;
  const scopedDependencyCount = filteredDependencyItems.filter((item) => item.isScoped).length;

  const topDependencyCategories = useMemo(
    () => Object.entries(
      filteredDependencyItems.reduce<Record<string, number>>((acc, item) => {
        acc[item.category] = (acc[item.category] ?? 0) + 1;
        return acc;
      }, {}),
    )
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 6),
    [filteredDependencyItems],
  );

  const filteredOutdatedPackages = useMemo(() => {
    const next = result.outdated.packages.filter((item) => {
      if (outdatedGroupFilter !== 'all' && item.group !== outdatedGroupFilter) {
        return false;
      }

      if (outdatedSeverityFilter !== 'all' && item.severity !== outdatedSeverityFilter) {
        return false;
      }

      return true;
    });

    next.sort((left, right) => compareOutdatedPackages(left, right, outdatedSortKey));
    return next;
  }, [result.outdated.packages, outdatedGroupFilter, outdatedSeverityFilter, outdatedSortKey]);

  const scriptEntries = Object.entries(result.scripts);
  const scriptLayout = useMemo(
    () => computeScriptLayout(result.scriptGraph.nodes, result.scriptGraph.edges),
    [result.scriptGraph.nodes, result.scriptGraph.edges],
  );
  const [selectedScriptId, setSelectedScriptId] = useState<string | null>(null);
  const [hoveredScriptId, setHoveredScriptId] = useState<string | null>(null);

  const scriptFocusId = selectedScriptId ?? hoveredScriptId;
  const focusedScriptNodeIds = new Set<string>();
  const focusedScriptEdgeIdxs = new Set<number>();

  if (scriptFocusId) {
    focusedScriptNodeIds.add(scriptFocusId);
    scriptLayout.edges.forEach((edge, index) => {
      if (edge.from === scriptFocusId || edge.to === scriptFocusId) {
        focusedScriptNodeIds.add(edge.from);
        focusedScriptNodeIds.add(edge.to);
        focusedScriptEdgeIdxs.add(index);
      }
    });
  }

  const hasScriptFocus = scriptFocusId !== null;
  const hasScriptRelationships = scriptLayout.edges.length > 0;
  const scriptDetailId = selectedScriptId ?? hoveredScriptId;

  const measuredPackages = result.estimatedInstallSize.distribution.reduce(
    (sum, item) => sum + item.directPackages,
    0,
  );
  const largestInstallBytes = Math.max(
    ...result.estimatedInstallSize.largestPackages.map((item) => item.installBytes),
    1,
  );
  const largestDistributionBytes = Math.max(
    ...result.estimatedInstallSize.distribution.map((item) => item.installBytes),
    1,
  );

  return (
    <div className="dashboard">
      <div className="dashboard-toolbar">
        <button className="btn btn--ghost btn--sm" onClick={onReset} type="button">
          ← New analysis
        </button>
      </div>

      <section className="output-section" aria-label="Summary">
        <div className="panel-header">
          <h2 className="panel-title">
            {result.name ?? '(unnamed)'}
            {result.version && <span className="panel-title_version">v{result.version}</span>}
          </h2>
        </div>

        <div className="summary-grid">
          <StatCard label="Dependencies" value={result.counts.dependencies} />
          <StatCard label="Dev" value={result.counts.devDependencies} />
          <StatCard label="Peer" value={result.counts.peerDependencies} />
          <StatCard label="Optional" value={result.counts.optionalDependencies} />
          <StatCard label="Scripts" value={result.counts.scripts} />
          <StatCard label="Total packages" value={result.estimatedInstallSize.totalPackages} />
          <StatCard label="Install footprint" value={formatBytes(result.estimatedInstallSize.totalInstallBytes)} />
          <StatCard label="Transitive impact" value={formatBytes(result.estimatedInstallSize.totalTransitiveBytes)} />
        </div>
      </section>

      {dependencyItems.length > 0 && (
        <section className="output-section" aria-label="Dependencies">
          <div className="panel-header">
            <h3 className="panel-title">
              Dependencies <span className="panel-title_count">({dependencyItems.length})</span>
            </h3>
          </div>

          <div className="tab-group dependency-group-tabs" role="tablist" aria-label="Dependency groups">
            <button
              className={`tab${dependencyGroupFilter === 'all' ? ' tab--active' : ''}`}
              onClick={() => setDependencyGroupFilter('all')}
              role="tab"
              aria-selected={dependencyGroupFilter === 'all'}
              type="button"
            >
              All <span className="dependency-tab_count">{dependencyItems.length}</span>
            </button>
            {GROUPS.map(({ key, label }) => (
              <button
                key={key}
                className={`tab${dependencyGroupFilter === key ? ' tab--active' : ''}`}
                onClick={() => setDependencyGroupFilter(key)}
                role="tab"
                aria-selected={dependencyGroupFilter === key}
                type="button"
              >
                {label} <span className="dependency-tab_count">{dependencyGroupCounts[key]}</span>
              </button>
            ))}
          </div>

          <div className="dependency-controls">
            <div className="field">
              <label className="label" htmlFor="dependency-search">Search packages</label>
              <input
                id="dependency-search"
                className="input"
                placeholder="Search by name, category, or range"
                value={dependencyQuery}
                onChange={(event) => setDependencyQuery(event.target.value)}
              />
            </div>

            <div className="field dependency-controls_field">
              <label className="label" htmlFor="dependency-sort">Sort</label>
              <select
                id="dependency-sort"
                className="input"
                value={dependencySortKey}
                onChange={(event) => setDependencySortKey(event.target.value as DependencySortKey)}
              >
                <option value="name">Name</option>
                <option value="group">Group</option>
                <option value="category">Category</option>
                <option value="version">Version</option>
              </select>
            </div>
          </div>

          <div className="summary-grid">
            <StatCard label="Visible packages" value={filteredDependencyItems.length} />
            <StatCard label="Categories" value={visibleDependencyCategoryCount} />
            <StatCard label="Scoped packages" value={scopedDependencyCount} />
            <StatCard label="Largest group" value={largestDependencyGroupSize} />
          </div>

          {topDependencyCategories.length > 0 && (
            <div className="categories-grid">
              {topDependencyCategories.map(([category, count]) => (
                <div key={category} className="category-card">
                  <span className="category-card_name">{category}</span>
                  <span className="category-card_count">{count} package{count === 1 ? '' : 's'}</span>
                </div>
              ))}
            </div>
          )}

          <div className="deps-table-wrap">
            <table className="deps-table deps-table--detailed">
              <thead>
                <tr>
                  <th>Package</th>
                  <th>Metadata</th>
                  <th>Version</th>
                </tr>
              </thead>
              <tbody>
                {filteredDependencyItems.map((item) => (
                  <tr key={`${item.group}:${item.name}`}>
                    <td>
                      <div className="dependency-name-cell">
                        <a
                          href={`https://www.npmjs.com/package/${item.name}`}
                          target="_blank"
                          rel="noreferrer"
                          className="deps-table_link"
                        >
                          {item.name}
                        </a>
                        <div className="dependency-badges">
                          <span className="dependency-badge dependency-badge--group">{item.groupLabel}</span>
                          <span className="dependency-badge">{item.category}</span>
                          {item.isScoped && <span className="dependency-badge">scoped</span>}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="dependency-meta-cell">
                        <span className="dependency-meta_label">Range style</span>
                        <span className="dependency-meta_value">{item.versionKind}</span>
                      </div>
                    </td>
                    <td>
                      <div className="dependency-version-cell">
                        <span className="deps-table_version">{item.version}</span>
                        {item.normalizedVersion && item.normalizedVersion !== item.version && (
                          <span className="dependency-version_compare">Base: {item.normalizedVersion}</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredDependencyItems.length === 0 && (
            <p className="static-page_empty">No packages match the current filters.</p>
          )}
        </section>
      )}

      <section className="output-section" aria-label="Package size analysis">
        <div className="panel-header">
          <h3 className="panel-title">Package Size</h3>
        </div>

        <p className="static-page_updated">{result.estimatedInstallSize.note}</p>

        <div className="summary-grid">
          <StatCard label="Install footprint" value={formatBytes(result.estimatedInstallSize.totalInstallBytes)} />
          <StatCard label="Transitive impact" value={formatBytes(result.estimatedInstallSize.totalTransitiveBytes)} />
          <StatCard label="Published bytes" value={formatBytes(result.estimatedInstallSize.totalPublishBytes)} />
          <StatCard label="Measured packages" value={measuredPackages} />
        </div>

        {result.estimatedInstallSize.largestPackages.length > 0 && (
          <div className="size-section">
            <div className="panel-header">
              <h4 className="panel-title">Largest Packages</h4>
            </div>
            <ul className="size-list" aria-label="Largest packages">
              {result.estimatedInstallSize.largestPackages.map((item) => {
                const width = `${Math.max((item.installBytes / largestInstallBytes) * 100, 8)}%`;

                return (
                  <li key={`${item.group}:${item.name}`} className="size-list_item">
                    <div className="size-list_header">
                      <div className="dependency-name-cell">
                        <a href={item.packageUrl} target="_blank" rel="noreferrer" className="deps-table_link">
                          {item.name}
                        </a>
                        <div className="dependency-badges">
                          <span className="dependency-badge dependency-badge--group">{groupLabels[item.group]}</span>
                          {item.resolvedVersion && <span className="dependency-badge">v{item.resolvedVersion}</span>}
                        </div>
                      </div>
                      <div className="size-list_meta">
                        <span className="deps-table_version">{formatBytes(item.installBytes)}</span>
                        <span className="dependency-version_compare">{formatBytes(item.transitiveBytes)} transitive</span>
                      </div>
                    </div>
                    <div className="dependency-meter size-meter" aria-hidden="true">
                      <span className="dependency-meter_fill size-meter_fill" style={{ width }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="size-section">
          <div className="panel-header">
            <h4 className="panel-title">Dependency Weight Distribution</h4>
          </div>

          <div className="dependency-group-summary">
            {result.estimatedInstallSize.distribution.map((item) => {
              const width = `${Math.max((item.installBytes / largestDistributionBytes) * 100, item.installBytes > 0 ? 10 : 0)}%`;

              return (
                <div key={item.group} className="stat-card dependency-group-card">
                  <span className="stat-card_label">{groupLabels[item.group]}</span>
                  <strong className="stat-card_value">{formatBytes(item.installBytes)}</strong>
                  <span className="category-card_count">
                    {item.directPackages} package{item.directPackages === 1 ? '' : 's'}
                  </span>
                  <div className="dependency-meter" aria-hidden="true">
                    <span className="dependency-meter_fill" style={{ width }} />
                  </div>
                  <span className="dependency-version_compare">{formatBytes(item.transitiveBytes)} transitive</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {scriptEntries.length > 0 && (
        <section className="output-section" aria-label="Scripts">
          <div className="panel-header">
            <h3 className="panel-title">
              Scripts <span className="panel-title_count">({scriptEntries.length})</span>
            </h3>
            <div className="tab-group" role="tablist">
              <button
                role="tab"
                aria-selected={scriptTab === 'graph'}
                className={`tab tab--sm${scriptTab === 'graph' ? ' tab--active' : ''}`}
                onClick={() => setScriptTab('graph')}
                type="button"
              >
                Graph
              </button>
              <button
                role="tab"
                aria-selected={scriptTab === 'table'}
                className={`tab tab--sm${scriptTab === 'table' ? ' tab--active' : ''}`}
                onClick={() => setScriptTab('table')}
                type="button"
              >
                Table
              </button>
            </div>
          </div>

          {scriptTab === 'graph' ? (
            <div className="graph-wrap" onClick={() => setSelectedScriptId(null)}>
              <div className="graph-scroll">
                <svg
                  className="graph-svg"
                  width={scriptLayout.width}
                  height={scriptLayout.height}
                  viewBox={`0 0 ${scriptLayout.width} ${scriptLayout.height}`}
                  aria-label="Script relationship graph"
                  role="img"
                >
                  <defs>
                    <marker id="gm-default" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto" markerUnits="userSpaceOnUse">
                      <polygon points="0 0, 8 3, 0 6" className="graph-arrowhead" />
                    </marker>
                    <marker id="gm-active" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto" markerUnits="userSpaceOnUse">
                      <polygon points="0 0, 8 3, 0 6" className="graph-arrowhead--active" />
                    </marker>
                    <marker id="gm-dimmed" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto" markerUnits="userSpaceOnUse">
                      <polygon points="0 0, 8 3, 0 6" className="graph-arrowhead--dimmed" />
                    </marker>
                  </defs>

                  {hasScriptRelationships && scriptLayout.nodes.some((node) => node.isolated) && (() => {
                    const firstIsolated = scriptLayout.nodes.find((node) => node.isolated);
                    if (!firstIsolated) {
                      return null;
                    }
                    const separatorY = firstIsolated.y - 12;
                    return (
                      <line x1={0} y1={separatorY} x2={scriptLayout.width} y2={separatorY} className="graph-separator" />
                    );
                  })()}

                  {scriptLayout.edges.map((edge, index) => {
                    const source = scriptLayout.nodes.find((node) => node.id === edge.from);
                    const target = scriptLayout.nodes.find((node) => node.id === edge.to);
                    if (!source || !target) {
                      return null;
                    }

                    const sx = source.x + scriptNodeWidth;
                    const sy = source.y + scriptNodeHeight / 2;
                    const tx = target.x;
                    const ty = target.y + scriptNodeHeight / 2;
                    const cx = (sx + tx) / 2;

                    const isActive = focusedScriptEdgeIdxs.has(index);
                    const isDimmed = hasScriptFocus && !isActive;

                    const edgeClass = [
                      'graph-edge',
                      isActive ? 'graph-edge--active' : '',
                      isDimmed ? 'graph-edge--dimmed' : '',
                    ].filter(Boolean).join(' ');

                    const marker = isActive ? 'url(#gm-active)' : isDimmed ? 'url(#gm-dimmed)' : 'url(#gm-default)';

                    return (
                      <path
                        key={index}
                        d={`M${sx},${sy} C${cx},${sy} ${cx},${ty} ${tx},${ty}`}
                        className={edgeClass}
                        markerEnd={marker}
                      />
                    );
                  })}

                  {scriptLayout.nodes.map((node) => {
                    const isSelected = selectedScriptId === node.id;
                    const isConnected = focusedScriptNodeIds.has(node.id) && node.id !== scriptFocusId;
                    const isDimmed = hasScriptFocus && !focusedScriptNodeIds.has(node.id);

                    const rectClass = [
                      'graph-node',
                      node.isolated ? 'graph-node--isolated' : '',
                      isSelected ? 'graph-node--selected' : '',
                      isConnected ? 'graph-node--connected' : '',
                      isDimmed ? 'graph-node--dimmed' : '',
                    ].filter(Boolean).join(' ');

                    const labelClass = [
                      'graph-node-label',
                      isSelected ? 'graph-node-label--selected' : '',
                    ].filter(Boolean).join(' ');

                    return (
                      <g
                        key={node.id}
                        className="graph-node-group"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedScriptId((prev) => (prev === node.id ? null : node.id));
                        }}
                        onMouseEnter={() => setHoveredScriptId(node.id)}
                        onMouseLeave={() => setHoveredScriptId(null)}
                        role="button"
                        aria-label={node.label}
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            setSelectedScriptId((prev) => (prev === node.id ? null : node.id));
                          }
                        }}
                      >
                        <rect
                          x={node.x}
                          y={node.y}
                          width={scriptNodeWidth}
                          height={scriptNodeHeight}
                          rx={6}
                          ry={6}
                          className={rectClass}
                        />
                        <text
                          x={node.x + scriptNodeWidth / 2}
                          y={node.y + scriptNodeHeight / 2}
                          textAnchor="middle"
                          dominantBaseline="central"
                          className={labelClass}
                        >
                          {truncateScriptLabel(node.label)}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>

              {scriptDetailId && result.scripts[scriptDetailId] ? (
                <div className="graph-detail">
                  <code className="script-name">{scriptDetailId}</code>
                  <span className="graph-detail_cmd">{result.scripts[scriptDetailId]}</span>
                </div>
              ) : (
                <p className="graph-hint">
                  {hasScriptRelationships
                    ? 'Click or hover a node to highlight its relationships.'
                    : 'No script relationships detected.'}
                </p>
              )}
            </div>
          ) : (
            <div className="deps-table-wrap">
              <table className="deps-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Command</th>
                  </tr>
                </thead>
                <tbody>
                  {scriptEntries.map(([name, command]) => (
                    <tr key={name}>
                      <td><code className="script-name">{name}</code></td>
                      <td className="script-cmd">{command}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <section className="output-section" aria-label="Outdated packages">
        <div className="panel-header">
          <h3 className="panel-title">
            Outdated Packages <span className="panel-title_count">({result.outdated.summary.outdated})</span>
          </h3>
        </div>

        <p className="static-page_updated">{result.outdated.note}</p>

        <div className="summary-grid">
          <StatCard label="Checked" value={result.outdated.summary.checked} />
          <StatCard label="Outdated" value={result.outdated.summary.outdated} />
          <StatCard label="High risk" value={result.outdated.summary.bySeverity.high} />
          <StatCard label="Medium risk" value={result.outdated.summary.bySeverity.medium} />
        </div>

        <div className="tab-group" role="tablist" aria-label="Outdated package groups">
          <button
            className={`tab${outdatedGroupFilter === 'all' ? ' tab--active' : ''}`}
            type="button"
            onClick={() => setOutdatedGroupFilter('all')}
            role="tab"
            aria-selected={outdatedGroupFilter === 'all'}
          >
            All
          </button>
          {Object.entries(groupLabels).map(([group, label]) => (
            <button
              key={group}
              className={`tab${outdatedGroupFilter === group ? ' tab--active' : ''}`}
              type="button"
              onClick={() => setOutdatedGroupFilter(group as DependencyGroup)}
              role="tab"
              aria-selected={outdatedGroupFilter === group}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="dependency-controls">
          <div className="field dependency-controls_field">
            <label className="label" htmlFor="outdated-severity">Risk filter</label>
            <select
              id="outdated-severity"
              className="input"
              value={outdatedSeverityFilter}
              onChange={(event) => setOutdatedSeverityFilter(event.target.value as UpdateSeverity | 'all')}
            >
              <option value="all">All severities</option>
              <option value="high">High risk</option>
              <option value="medium">Medium risk</option>
              <option value="low">Low risk</option>
              <option value="unknown">Unknown risk</option>
            </select>
          </div>

          <div className="field dependency-controls_field">
            <label className="label" htmlFor="outdated-sort">Sort</label>
            <select
              id="outdated-sort"
              className="input"
              value={outdatedSortKey}
              onChange={(event) => setOutdatedSortKey(event.target.value as OutdatedSortKey)}
            >
              <option value="severity">Severity</option>
              <option value="name">Name</option>
              <option value="group">Group</option>
              <option value="latest">Latest version</option>
            </select>
          </div>
        </div>

        {filteredOutdatedPackages.length > 0 ? (
          <div className="deps-table-wrap">
            <table className="deps-table deps-table--detailed">
              <thead>
                <tr>
                  <th>Package</th>
                  <th>Current</th>
                  <th>Latest</th>
                  <th>Change</th>
                  <th>Recommendation</th>
                </tr>
              </thead>
              <tbody>
                {filteredOutdatedPackages.map((item) => (
                  <tr key={`${item.group}:${item.name}`}>
                    <td>
                      <div className="dependency-name-cell">
                        <a href={item.packageUrl} target="_blank" rel="noreferrer" className="deps-table_link">
                          {item.name}
                        </a>
                        <div className="dependency-badges">
                          <span className="dependency-badge dependency-badge--group">{groupLabels[item.group]}</span>
                          <span className={`risk-badge risk-badge--${item.severity}`}>{severityLabels[item.severity]}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="dependency-version-cell">
                        <span className="deps-table_version">{item.installedVersion ?? item.currentSpec}</span>
                        <span className="dependency-version_compare">Spec: {item.currentSpec}</span>
                        {item.wantedVersion && item.wantedVersion !== item.installedVersion && (
                          <span className="dependency-version_compare">Wanted: {item.wantedVersion}</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="dependency-version-cell">
                        <span className="deps-table_version">{item.latestVersion ?? 'unavailable'}</span>
                        <span className="dependency-version_compare">Registry: npm</span>
                      </div>
                    </td>
                    <td>
                      <div className="dependency-meta-cell outdated-change-cell">
                        <span className="dependency-meta_label">Difference</span>
                        <span className="dependency-meta_value">{formatUpdateType(item.updateType)}</span>
                        <span className="dependency-meta_label">Risk</span>
                        <span className="dependency-meta_value">{severityLabels[item.severity]}</span>
                      </div>
                    </td>
                    <td>
                      <p className="outdated-recommendation">{item.recommendation}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="static-page_empty">
            {result.outdated.packages.length === 0
              ? 'No outdated packages detected.'
              : 'No outdated packages match the current filters.'}
          </p>
        )}
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="stat-card">
      <span className="stat-card_label">{label}</span>
      <strong className="stat-card_value">{value}</strong>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${bytes} B`;
}

function getCategoryMap(categories: Record<string, string[]>): Map<string, string> {
  const result = new Map<string, string>();

  for (const [category, packages] of Object.entries(categories)) {
    for (const packageName of packages) {
      result.set(packageName, category);
    }
  }

  return result;
}

function getVersionKind(version: string): string {
  if (version.startsWith('workspace:')) return 'workspace';
  if (version.startsWith('file:')) return 'file';
  if (version.startsWith('link:')) return 'link';
  if (version.startsWith('github:')) return 'github';
  if (version.startsWith('npm:')) return 'alias';
  if (version.startsWith('^')) return 'caret';
  if (version.startsWith('~')) return 'tilde';
  if (/^[<>]=?/.test(version) || version.includes('||')) return 'range';
  if (/^\d/.test(version)) return 'exact';
  return 'tag';
}

function normalizeVersion(version: string): string {
  return version.replace(/^(workspace:|file:|link:|github:|npm:|\^|~|>=|<=|>|<|=)/, '');
}

function buildDependencyItems(result: AnalysisResult): DependencyItem[] {
  const categoryMap = getCategoryMap(result.categories);

  return GROUPS.flatMap(({ key, label }) =>
    Object.entries(result[key]).map(([name, version]) => ({
      name,
      version,
      group: key,
      groupLabel: label,
      category: categoryMap.get(name) ?? 'Other',
      isScoped: name.startsWith('@'),
      versionKind: getVersionKind(version),
      normalizedVersion: normalizeVersion(version),
    })),
  );
}

function sortDependencyItems(items: DependencyItem[], sortKey: DependencySortKey): DependencyItem[] {
  const next = [...items];

  next.sort((left, right) => {
    if (sortKey === 'group') {
      return left.groupLabel.localeCompare(right.groupLabel) || left.name.localeCompare(right.name);
    }

    if (sortKey === 'category') {
      return left.category.localeCompare(right.category) || left.name.localeCompare(right.name);
    }

    if (sortKey === 'version') {
      return left.normalizedVersion.localeCompare(right.normalizedVersion) || left.name.localeCompare(right.name);
    }

    return left.name.localeCompare(right.name);
  });

  return next;
}

function compareOutdatedPackages(left: OutdatedPackage, right: OutdatedPackage, sortKey: OutdatedSortKey): number {
  if (sortKey === 'severity') {
    const severityDiff = getSeverityWeight(right.severity) - getSeverityWeight(left.severity);
    if (severityDiff !== 0) {
      return severityDiff;
    }
  }

  if (sortKey === 'group') {
    return groupLabels[left.group].localeCompare(groupLabels[right.group]) || left.name.localeCompare(right.name);
  }

  if (sortKey === 'latest') {
    return (right.latestVersion ?? '').localeCompare(left.latestVersion ?? '') || left.name.localeCompare(right.name);
  }

  return left.name.localeCompare(right.name);
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

function formatUpdateType(type: UpdateType): string {
  if (type === 'prerelease') {
    return 'Prerelease';
  }

  if (type === 'unknown') {
    return 'Unknown';
  }

  return `${type.charAt(0).toUpperCase()}${type.slice(1)}`;
}

function truncateScriptLabel(value: string): string {
  return value.length > maxScriptLabel ? `${value.slice(0, maxScriptLabel - 1)}…` : value;
}

function computeScriptLayout(nodes: ScriptNode[], edges: ScriptEdge[]): GraphLayout {
  if (nodes.length === 0) {
    return { nodes: [], edges: [], width: 0, height: 0 };
  }

  const nodeIds = new Set(nodes.map((node) => node.id));
  const validEdges = edges.filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to) && edge.from !== edge.to);

  const connectedIds = new Set<string>();
  for (const edge of validEdges) {
    connectedIds.add(edge.from);
    connectedIds.add(edge.to);
  }

  const graphNodes = nodes.filter((node) => connectedIds.has(node.id));
  const isolatedNodes = nodes.filter((node) => !connectedIds.has(node.id));

  const outEdges = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const node of graphNodes) {
    outEdges.set(node.id, []);
    inDegree.set(node.id, 0);
  }

  for (const edge of validEdges) {
    outEdges.get(edge.from)?.push(edge.to);
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
  }

  const level = new Map<string, number>();
  const inDegCopy = new Map(inDegree);
  const queue: string[] = [];

  for (const node of graphNodes) {
    if ((inDegCopy.get(node.id) ?? 0) === 0) {
      queue.push(node.id);
      level.set(node.id, 0);
    }
  }

  let head = 0;
  while (head < queue.length) {
    const id = queue[head++];
    const currentLevel = level.get(id) ?? 0;

    for (const target of outEdges.get(id) ?? []) {
      const nextLevel = currentLevel + 1;
      if ((level.get(target) ?? -1) < nextLevel) {
        level.set(target, nextLevel);
      }

      const degree = (inDegCopy.get(target) ?? 1) - 1;
      inDegCopy.set(target, degree);
      if (degree === 0) {
        queue.push(target);
      }
    }
  }

  for (const node of graphNodes) {
    if (!level.has(node.id)) {
      level.set(node.id, 0);
    }
  }

  const byLevel = new Map<number, string[]>();
  for (const [id, lv] of level.entries()) {
    const col = byLevel.get(lv) ?? [];
    col.push(id);
    byLevel.set(lv, col);
  }

  const sortedLevels = [...byLevel.keys()].sort((a, b) => a - b);
  const colCount = sortedLevels.length > 0 ? sortedLevels[sortedLevels.length - 1] + 1 : 0;
  const maxRows = Math.max(...[...byLevel.values()].map((arr) => arr.length), 1);

  const posMap = new Map<string, { x: number; y: number }>();
  for (const lv of sortedLevels) {
    const ids = byLevel.get(lv) ?? [];
    const colX = scriptPad + lv * (scriptNodeWidth + scriptHorizontalGap);
    const colHeight = ids.length * scriptNodeHeight + (ids.length - 1) * scriptVerticalGap;
    const totalHeight = maxRows * scriptNodeHeight + (maxRows - 1) * scriptVerticalGap;
    const startY = scriptPad + (totalHeight - colHeight) / 2;

    ids.forEach((id, index) => {
      posMap.set(id, {
        x: colX,
        y: startY + index * (scriptNodeHeight + scriptVerticalGap),
      });
    });
  }

  const hierW = scriptPad * 2 + colCount * scriptNodeWidth + Math.max(colCount - 1, 0) * scriptHorizontalGap;
  const hierH = graphNodes.length > 0
    ? scriptPad * 2 + maxRows * scriptNodeHeight + (maxRows - 1) * scriptVerticalGap
    : 0;

  const isoCols = 5;
  const isoGapH = 10;
  const isoSep = graphNodes.length > 0 ? 24 : 0;
  const isoBaseY = hierH + isoSep;

  isolatedNodes.forEach((node, index) => {
    const col = index % isoCols;
    const row = Math.floor(index / isoCols);
    posMap.set(node.id, {
      x: scriptPad + col * (scriptNodeWidth + isoGapH),
      y: isoBaseY + scriptPad + row * (scriptNodeHeight + scriptVerticalGap),
    });
  });

  const isoRows = Math.ceil(isolatedNodes.length / isoCols);
  const isoH = isolatedNodes.length > 0
    ? scriptPad + isoRows * scriptNodeHeight + (isoRows - 1) * scriptVerticalGap + isoSep
    : 0;

  const isoColsUsed = Math.min(isolatedNodes.length, isoCols);
  const isoW = isoColsUsed > 0
    ? scriptPad * 2 + isoColsUsed * scriptNodeWidth + (isoColsUsed - 1) * isoGapH
    : 0;

  const svgWidth = Math.max(hierW, isoW, 300);
  const svgHeight = hierH + isoH + scriptPad;

  const positioned: PositionedNode[] = nodes.map((node) => ({
    ...node,
    ...(posMap.get(node.id) ?? { x: scriptPad, y: scriptPad }),
    isolated: !connectedIds.has(node.id),
  }));

  return {
    nodes: positioned,
    edges: validEdges,
    width: svgWidth,
    height: Math.max(svgHeight, scriptNodeHeight + scriptPad * 2),
  };
}
