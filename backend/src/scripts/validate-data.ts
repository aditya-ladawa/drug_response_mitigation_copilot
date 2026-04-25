import { findDrugByName, getGraph, getGraphStats } from '../services/graph';

const g = getGraph();

// Probe a real drug that always exists
const amox = findDrugByName('Amoxicillin');
if (amox) {
  console.log('\nSample drug node:', JSON.stringify(g.getNodeAttributes(amox.id), null, 2));
}

let shortageCount = 0, isolated = 0, ingCount = 0, blankIngredients = 0;
const isolatedByType: Record<string, number> = {};
g.forEachNode((id, attrs) => {
  if (id.startsWith('shortage:')) shortageCount++;
  if (id.startsWith('ing:')) {
    ingCount++;
    if (!attrs.name) blankIngredients++;
  }
  if (g.degree(id) === 0) {
    isolated++;
    const t = (attrs.type as string) ?? 'unknown';
    isolatedByType[t] = (isolatedByType[t] ?? 0) + 1;
  }
});

console.log(`\nShortage nodes: ${shortageCount}`);
console.log(`Ingredient nodes: ${ingCount}, blank name: ${blankIngredients}`);
console.log(`Isolated nodes (no edges): ${isolated}`);
console.log(`  by type:`, isolatedByType);

const stats = getGraphStats();
console.log(`\nGraph: ${stats.nodes} nodes, ${stats.edges} edges, built in ${stats.buildMs}ms`);
