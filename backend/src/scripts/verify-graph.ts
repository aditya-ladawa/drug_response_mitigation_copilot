/**
 * One-shot graph verification.
 * Builds the graph, prints stats, runs real supply-chain & risk-cluster queries
 * on known drugs/manufacturers to confirm the data is connected.
 *
 * Usage: npx ts-node-dev --transpile-only src/scripts/verify-graph.ts
 */

import {
  findDrugByName,
  findManufacturerByName,
  getGraph,
  getGraphStats,
  getRiskCluster,
  getSupplyChainGraph,
  NODE_TYPES,
} from '../services/graph';

function fmt(obj: Record<string, number>): string {
  return Object.entries(obj)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}=${v.toLocaleString()}`)
    .join('  ');
}

function header(title: string): void {
  console.log(`\n──── ${title} ────`);
}

async function main(): Promise<void> {
  console.log('[1/4] Building graph from SQLite...');
  const t = Date.now();
  getGraph();
  const stats = getGraphStats();
  console.log(`      built in ${Date.now() - t}ms`);

  header('Graph stats');
  console.log(`  total: ${stats.nodes.toLocaleString()} nodes, ${stats.edges.toLocaleString()} edges`);
  console.log(`  nodes by type: ${fmt(stats.nodesByType)}`);
  console.log(`  edges by type: ${fmt(stats.edgesByType)}`);

  // Pick a handful of known drugs (shortages we saw in sample data)
  const probes = ['Amoxicillin', 'Atropine', 'Albuterol', 'Azacitidine'];
  header('Drug supply-chain probes (depth=3)');
  for (const name of probes) {
    const node = findDrugByName(name);
    if (!node) {
      console.log(`  [${name}] not found`);
      continue;
    }
    const dbId = parseInt(node.id.split(':')[1], 10);
    const sub = getSupplyChainGraph(dbId, 3);
    const byType: Record<string, number> = {};
    for (const n of sub.nodes) byType[n.type] = (byType[n.type] ?? 0) + 1;
    console.log(`  ${name.padEnd(14)} → ${sub.nodes.length} nodes, ${sub.links.length} links  (${fmt(byType)})`);
  }

  header('Manufacturer risk probe');
  // Find a manufacturer with warning letters to make the cluster interesting
  const g = getGraph();
  let sampleMfr: string | null = null;
  g.forEachNode((id, attrs) => {
    if (sampleMfr) return;
    if (attrs.type !== NODE_TYPES.MANUFACTURER) return;
    // Look for one with at least one warning
    let hasWarning = false;
    g.forEachOutEdge(id, (_e, ea) => {
      if (ea.type === 'received') hasWarning = true;
    });
    if (hasWarning) sampleMfr = id;
  });

  if (sampleMfr) {
    const nonNullMfr: string = sampleMfr;
    const dbId = parseInt(nonNullMfr.split(':')[1], 10);
    const cluster = getRiskCluster(dbId);
    const name = cluster.mfr?.label ?? '(unknown)';
    console.log(`  ${name}`);
    console.log(`    drugs=${cluster.drugs.length}  establishments=${cluster.establishments.length}  warnings=${cluster.warnings.length}  import_alerts=${cluster.importAlerts.length}  recalls=${cluster.recalls.length}`);
  } else {
    console.log('  (no manufacturer with warnings found)');
  }

  header('Sanity');
  console.log(`  rebuild same graph: ${getGraph() === getGraph() ? '✓ singleton stable' : '❌ different instances'}`);
  console.log('\n✓ Graph verification complete');
}

main().catch((err) => {
  console.error('[Verify] Failed:', err);
  process.exit(1);
});
