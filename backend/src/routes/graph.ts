import { Router, Request, Response } from 'express';
import {
  findDrugByName,
  findManufacturerByName,
  getGraph,
  getGraphStats,
  getRiskCluster,
  getSubgraph,
  getSupplyChainGraph,
  serialize,
  serializeNode,
} from '../services/graph';

const router = Router();

// GET /api/graph/stats — health + sizing info
router.get('/stats', (_req: Request, res: Response) => {
  try {
    getGraph(); // ensure built
    res.json(getGraphStats());
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/graph/drug/:name?depth=2 — supply chain subgraph for a drug
router.get('/drug/:name', (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const depth = Math.min(Math.max(parseInt(String(req.query.depth ?? '2'), 10) || 2, 1), 4);

    const drugNode = findDrugByName(decodeURIComponent(name));
    if (!drugNode) {
      res.status(404).json({ error: `Drug not found: ${name}` });
      return;
    }

    // Extract numeric db id from nodeId like "drug:123"
    const dbId = parseInt(drugNode.id.split(':')[1], 10);
    const subgraph = getSupplyChainGraph(dbId, depth);
    res.json(serialize(subgraph));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/graph/manufacturer/:name/risk — drugs/establishments/regulatory exposure
router.get('/manufacturer/:name/risk', (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const mfrNode = findManufacturerByName(decodeURIComponent(name));
    if (!mfrNode) {
      res.status(404).json({ error: `Manufacturer not found: ${name}` });
      return;
    }

    const dbId = parseInt(mfrNode.id.split(':')[1], 10);
    const cluster = getRiskCluster(dbId);
    res.json({
      manufacturer: cluster.mfr ? serializeNode(cluster.mfr) : null,
      drugs: cluster.drugs.map(serializeNode),
      establishments: cluster.establishments.map(serializeNode),
      warnings: cluster.warnings.map(serializeNode),
      importAlerts: cluster.importAlerts.map(serializeNode),
      recalls: cluster.recalls.map(serializeNode),
      counts: {
        drugs: cluster.drugs.length,
        establishments: cluster.establishments.length,
        warnings: cluster.warnings.length,
        importAlerts: cluster.importAlerts.length,
        recalls: cluster.recalls.length,
      },
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/graph/node/:id?depth=2 — generic subgraph from any node id
router.get('/node/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const depth = Math.min(Math.max(parseInt(String(req.query.depth ?? '2'), 10) || 2, 1), 4);
    const subgraph = getSubgraph(decodeURIComponent(id), depth);
    if (subgraph.rootId === null) {
      res.status(404).json({ error: `Node not found: ${id}` });
      return;
    }
    res.json(serialize(subgraph));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
