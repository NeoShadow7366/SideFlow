import { FlowchartState, FlowNode, FlowEdge, FlowNodeType } from '../types/sideflow';

export function generateMermaidCode(flowData: FlowchartState): string {
  let mermaid = 'flowchart TD\n';
  flowData.nodes.forEach((n) => {
    const cleanText = n.text.replace(/"/g, "'");
    if (n.type === 'decision') {
      mermaid += `    ${n.id}{"${cleanText}"}\n`;
    } else if (n.type === 'start') {
      mermaid += `    ${n.id}(["${cleanText}"])\n`;
    } else {
      mermaid += `    ${n.id}["${cleanText}"]\n`;
    }
  });
  flowData.edges.forEach((e) => {
    if (e.label && e.label.trim()) {
      const cleanLabel = e.label.trim().replace(/\|/g, '/');
      mermaid += `    ${e.from} -->|${cleanLabel}| ${e.to}\n`;
    } else {
      mermaid += `    ${e.from} --> ${e.to}\n`;
    }
  });
  return mermaid;
}

export function parseMermaidCode(mermaidText: string): FlowchartState | null {
  const lines = mermaidText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('%%'));

  if (lines.length === 0) return null;

  const nodesMap = new Map<string, FlowNode>();
  const edges: FlowEdge[] = [];

  const ensureNode = (id: string, type: FlowNodeType = 'process', text?: string) => {
    const cleanId = id.trim();
    if (!cleanId) return;
    const existing = nodesMap.get(cleanId);
    if (existing) {
      if (text) {
        existing.text = text;
        existing.type = type;
      }
      return;
    }
    const index = nodesMap.size;
    const col = index % 2;
    const row = Math.floor(index / 2);
    nodesMap.set(cleanId, {
      id: cleanId,
      type,
      text: text || cleanId,
      x: 45 + col * 210,
      y: 35 + row * 105,
    });
  };

  for (const line of lines) {
    if (/^(flowchart|graph)\s+/i.test(line)) continue;

    // Match edges first: e.g. n1 --> n2 or n1 -->|Yes| n2
    const edgeMatch = line.match(
      /^([A-Za-z0-9_-]+)\s*--+>(?:\|([^|]+)\|)?\s*([A-Za-z0-9_-]+)$/
    );
    if (edgeMatch) {
      const [, fromId, edgeLabel, toId] = edgeMatch;
      ensureNode(fromId);
      ensureNode(toId);
      edges.push({
        from: fromId,
        to: toId,
        ...(edgeLabel ? { label: edgeLabel.trim() } : {}),
      });
      continue;
    }

    // Match terminal node: id(["Label"])
    const startMatch = line.match(/^([A-Za-z0-9_-]+)\(\["?([^"\]]+)"?\]\)$/);
    if (startMatch) {
      ensureNode(startMatch[1], 'start', startMatch[2]);
      continue;
    }

    // Match decision node: id{"Label"}
    const decisionMatch = line.match(/^([A-Za-z0-9_-]+)\{"?([^"}]+)"?\}$/);
    if (decisionMatch) {
      ensureNode(decisionMatch[1], 'decision', decisionMatch[2]);
      continue;
    }

    // Match process node: id["Label"]
    const processMatch = line.match(/^([A-Za-z0-9_-]+)\["?([^"\]]+)"?\]$/);
    if (processMatch) {
      ensureNode(processMatch[1], 'process', processMatch[2]);
      continue;
    }
  }

  if (nodesMap.size === 0) return null;
  return {
    nodes: Array.from(nodesMap.values()),
    edges,
  };
}

export function generateStandaloneSVG(flowData: FlowchartState): string {
  const width = 600;
  const height = 460;

  const escapeXml = (unsafe: string) =>
    unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

  const edgesSvg = flowData.edges
    .map((edge) => {
      const fromNode = flowData.nodes.find((n) => n.id === edge.from);
      const toNode = flowData.nodes.find((n) => n.id === edge.to);
      if (!fromNode || !toNode) return '';
      const x1 = fromNode.x + 72;
      const y1 = fromNode.y + 26;
      const x2 = toNode.x + 72;
      const y2 = toNode.y + 26;
      const dy = y2 - y1;
      const pathData = `M ${x1} ${y1} C ${x1} ${y1 + dy * 0.45}, ${x2} ${y2 - dy * 0.45}, ${x2} ${y2}`;
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;
      return `<path d="${pathData}" stroke="#818cf8" stroke-width="2.2" fill="none" marker-end="url(#arrowhead)" />${
        edge.label
          ? `<text x="${midX}" y="${midY - 6}" fill="#c7d2fe" font-family="Inter, sans-serif" font-size="10" text-anchor="middle">${escapeXml(edge.label)}</text>`
          : ''
      }`;
    })
    .join('\n    ');

  const nodesSvg = flowData.nodes
    .map((node) => {
      const w = 144;
      const h = 52;
      let fill = '#082f49';
      let stroke = '#38bdf8';
      let rx = 12;
      let dash = '';

      if (node.type === 'decision') {
        fill = '#451a03';
        stroke = '#fbbf24';
        rx = 16;
        dash = 'stroke-dasharray="5,4"';
      } else if (node.type === 'start') {
        fill = '#022c22';
        stroke = '#34d399';
        rx = 26;
      }

      return `<g transform="translate(${node.x}, ${node.y})">
      <rect width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="2" ${dash} />
      <text x="${w / 2}" y="${h / 2 + 4}" fill="#f1f5f9" font-family="Inter, sans-serif" font-size="12" font-weight="500" text-anchor="middle">${escapeXml(node.text)}</text>
    </g>`;
    })
    .join('\n    ');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="#818cf8" />
    </marker>
  </defs>
  <rect width="100%" height="100%" fill="#020617" />
  <g id="edges">
    ${edgesSvg}
  </g>
  <g id="nodes">
    ${nodesSvg}
  </g>
</svg>`;
}
