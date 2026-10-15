import {
  AccentColor,
  FlowchartState,
  FlowNode,
  FlowEdge,
  FlowNodeType,
  FlowEdgeStyle,
  FlowEdgeArrow,
  FlowDirection,
  FlowSubgraph,
  MermaidDiagramType,
} from '../types/sideflow';

export interface EdgeGeometry {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  midX: number;
  midY: number;
  pathData: string;
}

export interface SubgraphBounds {
  id: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type MermaidTemplateId =
  | 'default'
  | 'ci-cd'
  | 'state-machine'
  | 'microservice'
  | 'uml-class'
  | 'er-schema';

export interface MermaidTemplatePreset {
  id: MermaidTemplateId;
  name: string;
  diagramType: MermaidDiagramType;
  mermaidCode: string;
}

export const MERMAID_TEMPLATES: MermaidTemplatePreset[] = [
  {
    id: 'default',
    name: 'Hotkey Launch Flow (Flowchart)',
    diagramType: 'flowchart',
    mermaidCode: [
      'flowchart TD',
      '    n1(["Hotkey Pressed"])',
      '    n2{"Panel Open?"}',
      '    n3["Slide In Drawer"]',
      '    n4["Launch Selected App"]',
      '    n1 --> n2',
      '    n2 -->|No| n3',
      '    n3 --> n4',
    ].join('\n'),
  },
  {
    id: 'ci-cd',
    name: 'CI/CD Deployment Pipeline (Subgraphs)',
    diagramType: 'flowchart',
    mermaidCode: [
      'flowchart LR',
      '    subgraph ci ["CI Build & Test"]',
      '        commit(["Git Push"])',
      '        lint[["Lint & Unit Tests"]]',
      '        gate{"Checks Pass?"}',
      '    end',
      '    subgraph prod ["Production Cluster"]',
      '        deploy["Deploy Containers"]',
      '        db[("Primary DB")]',
      '    end',
      '    alert>"Alert Slack"]',
      '    commit --> lint --> gate',
      '    gate -->|Yes| deploy ==> db',
      '    gate -.->|No| alert',
      '    style deploy fill:#022c22,stroke:#34d399,stroke-width:2px',
      '    style alert fill:#4c0519,stroke:#fb7185,stroke-width:2px',
    ].join('\n'),
  },
  {
    id: 'state-machine',
    name: 'Worker Task Lifecycle (State Diagram)',
    diagramType: 'stateDiagram-v2',
    mermaidCode: [
      'stateDiagram-v2',
      '    direction LR',
      '    state "Idle Queue" as Idle',
      '    state "Executing Job" as Running',
      '    state Verify <<choice>>',
      '    state "Completed" as Done',
      '    state "Retry Backoff" as Retry',
      '    [*] --> Idle',
      '    Idle --> Running : Dispatch',
      '    Running --> Verify : Finish',
      '    Verify --> Done : Exit 0',
      '    Verify --> Retry : Timeout',
      '    Retry --> Running : Re-queue',
      '    Done --> [*]',
    ].join('\n'),
  },
  {
    id: 'microservice',
    name: 'OAuth Token Exchange (Sequence Diagram)',
    diagramType: 'sequenceDiagram',
    mermaidCode: [
      'sequenceDiagram',
      '    actor client as Client App',
      '    participant gw as API Gateway',
      '    participant auth as Auth Service',
      '    participant db as Token Store',
      '    client->>gw: POST /oauth/token',
      '    gw->>auth: Validate Credentials',
      '    auth->>db: Lookup Refresh Token',
      '    db-->>auth: Token Active',
      '    auth-->>gw: Signed JWT',
      '    gw-->>client: 200 OK (Bearer JWT)',
    ].join('\n'),
  },
  {
    id: 'uml-class',
    name: 'Domain Service Architecture (Class Diagram)',
    diagramType: 'classDiagram',
    mermaidCode: [
      'classDiagram',
      '    direction LR',
      '    class IRepository {',
      '        <<interface>>',
      '        +findById(id) Entity',
      '        +save(entity) bool',
      '    }',
      '    class UserService {',
      '        -IRepository repo',
      '        +register(email, pass) User',
      '        +authenticate(token) bool',
      '    }',
      '    class User {',
      '        +String id',
      '        +String email',
      '        +Date createdAt',
      '    }',
      '    IRepository <|.. UserService : implements',
      '    UserService --> User : manages',
    ].join('\n'),
  },
  {
    id: 'er-schema',
    name: 'E-Commerce Data Model (ER Diagram)',
    diagramType: 'erDiagram',
    mermaidCode: [
      'erDiagram',
      '    USER {',
      '        uuid id PK',
      '        string email UK',
      '        timestamp created_at',
      '    }',
      '    ORDER {',
      '        uuid id PK',
      '        uuid user_id FK',
      '        decimal total',
      '    }',
      '    LINE_ITEM {',
      '        uuid id PK',
      '        uuid order_id FK',
      '        int quantity',
      '    }',
      '    USER ||--o{ ORDER : places',
      '    ORDER ||--|{ LINE_ITEM : contains',
    ].join('\n'),
  },
];

export function getMermaidTemplatePreset(
  templateId: MermaidTemplateId
): FlowchartState | null {
  const preset = MERMAID_TEMPLATES.find((t) => t.id === templateId);
  if (!preset) return null;
  const parsed = parseMermaidCode(preset.mermaidCode);
  if (!parsed) return null;
  return {
    ...parsed,
    nodes: computeDagLayout(parsed),
  };
}

export const ACCENT_HEX_PALETTE: Record<
  AccentColor,
  { fill: string; stroke: string }
> = {
  indigo: { fill: '#1e1b4b', stroke: '#818cf8' },
  cyan: { fill: '#083344', stroke: '#22d3ee' },
  emerald: { fill: '#022c22', stroke: '#34d399' },
  amber: { fill: '#451a03', stroke: '#fbbf24' },
  rose: { fill: '#4c0519', stroke: '#fb7185' },
  purple: { fill: '#2e1065', stroke: '#a78bfa' },
};

function inferAccentColorFromStyle(raw: string): AccentColor | undefined {
  const lower = raw.toLowerCase();
  if (
    lower.includes('rose') ||
    lower.includes('red') ||
    lower.includes('error') ||
    lower.includes('danger') ||
    lower.includes('critical') ||
    lower.includes('#fb7185') ||
    lower.includes('#f43f5e') ||
    lower.includes('#ef4444') ||
    lower.includes('#4c0519')
  ) {
    return 'rose';
  }
  if (
    lower.includes('emerald') ||
    lower.includes('green') ||
    lower.includes('success') ||
    lower.includes('#34d399') ||
    lower.includes('#10b981') ||
    lower.includes('#22c55e') ||
    lower.includes('#022c22')
  ) {
    return 'emerald';
  }
  if (
    lower.includes('amber') ||
    lower.includes('yellow') ||
    lower.includes('orange') ||
    lower.includes('warn') ||
    lower.includes('#fbbf24') ||
    lower.includes('#f59e0b') ||
    lower.includes('#451a03')
  ) {
    return 'amber';
  }
  if (
    lower.includes('purple') ||
    lower.includes('violet') ||
    lower.includes('#a78bfa') ||
    lower.includes('#8b5cf6') ||
    lower.includes('#2e1065')
  ) {
    return 'purple';
  }
  if (
    lower.includes('cyan') ||
    lower.includes('sky') ||
    lower.includes('blue') ||
    lower.includes('info') ||
    lower.includes('#22d3ee') ||
    lower.includes('#38bdf8') ||
    lower.includes('#083344')
  ) {
    return 'cyan';
  }
  if (
    lower.includes('indigo') ||
    lower.includes('primary') ||
    lower.includes('#818cf8') ||
    lower.includes('#6366f1') ||
    lower.includes('#1e1b4b')
  ) {
    return 'indigo';
  }
  return undefined;
}

export function computeSubgraphBounds(
  subgraph: FlowSubgraph,
  nodes: FlowNode[],
  nodeWidth = 144,
  nodeHeight = 52
): SubgraphBounds | null {
  const memberSet = new Set(subgraph.nodeIds);
  const members = nodes.filter((n) => memberSet.has(n.id));
  if (members.length === 0) return null;

  const padX = 18;
  const padTop = 34;
  const padBottom = 16;

  const minX = Math.min(...members.map((n) => n.x)) - padX;
  const minY = Math.min(...members.map((n) => n.y)) - padTop;
  const maxX = Math.max(...members.map((n) => n.x + nodeWidth)) + padX;
  const maxY = Math.max(...members.map((n) => n.y + nodeHeight)) + padBottom;

  return {
    id: subgraph.id,
    title: subgraph.title,
    x: Math.max(4, minX),
    y: Math.max(4, minY),
    width: Math.max(180, maxX - Math.max(4, minX)),
    height: Math.max(96, maxY - Math.max(4, minY)),
  };
}

export function computeDagLayout(flowData: FlowchartState): FlowNode[] {
  const { nodes, edges } = flowData;
  const dir: FlowDirection = flowData.direction || 'TD';
  if (nodes.length === 0) return [];

  // Sequence diagrams place participants horizontally along the top lifeline header
  if (flowData.diagramType === 'sequenceDiagram') {
    return nodes.map((n, index) => ({
      ...n,
      x: 35 + index * 175,
      y: 35,
    }));
  }

  // Fallback to directional grid if no edges exist
  if (edges.length === 0) {
    const total = nodes.length;
    return nodes.map((n, index) => {
      const orderedIdx = dir === 'BT' || dir === 'RL' ? total - 1 - index : index;
      if (dir === 'LR' || dir === 'RL') {
        const col = Math.floor(orderedIdx / 2);
        const row = orderedIdx % 2;
        return { ...n, x: 35 + col * 185, y: 45 + row * 120 };
      }
      const col = orderedIdx % 2;
      const row = Math.floor(orderedIdx / 2);
      return { ...n, x: 45 + col * 210, y: 35 + row * 105 };
    });
  }

  const nodeIds = new Set(nodes.map((n) => n.id));
  const adj = new Map<string, string[]>();
  const parents = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  nodes.forEach((n) => {
    adj.set(n.id, []);
    parents.set(n.id, []);
    inDegree.set(n.id, 0);
  });

  edges.forEach((e) => {
    if (!nodeIds.has(e.from) || !nodeIds.has(e.to) || e.from === e.to) return;
    adj.get(e.from)!.push(e.to);
    parents.get(e.to)!.push(e.from);
    inDegree.set(e.to, (inDegree.get(e.to) || 0) + 1);
  });

  // Assign topological ranks via BFS with cycle protection
  const rankMap = new Map<string, number>();
  const roots = nodes.filter((n) => (inDegree.get(n.id) || 0) === 0);
  const queue: Array<{ id: string; rank: number }> =
    roots.length > 0
      ? roots.map((r) => ({ id: r.id, rank: 0 }))
      : [{ id: nodes[0].id, rank: 0 }];

  const visitCount = new Map<string, number>();
  const maxRankLimit = nodes.length;

  while (queue.length > 0) {
    const { id, rank } = queue.shift()!;
    const currentRank = rankMap.get(id) ?? -1;
    if (rank <= currentRank) continue;
    rankMap.set(id, rank);

    const visits = (visitCount.get(id) || 0) + 1;
    visitCount.set(id, visits);
    if (visits > maxRankLimit) continue;

    for (const nextId of adj.get(id) || []) {
      const nextRank = Math.min(maxRankLimit - 1, rank + 1);
      if ((rankMap.get(nextId) ?? -1) < nextRank) {
        queue.push({ id: nextId, rank: nextRank });
      }
    }
  }

  // Ensure any disconnected / cycle-isolated nodes get a rank
  nodes.forEach((n, idx) => {
    if (!rankMap.has(n.id)) {
      rankMap.set(n.id, idx % 3);
    }
  });

  const maxRank = Math.max(0, ...Array.from(rankMap.values()));
  const layers = new Map<number, FlowNode[]>();
  for (let r = 0; r <= maxRank; r++) {
    layers.set(r, []);
  }
  nodes.forEach((n) => {
    const r = rankMap.get(n.id) || 0;
    layers.get(r)!.push(n);
  });

  // Barycenter heuristic ordering within each rank to reduce edge crossings
  const orderIndex = new Map<string, number>();
  layers.get(0)?.forEach((n, idx) => orderIndex.set(n.id, idx));

  for (let r = 1; r <= maxRank; r++) {
    const layerNodes = layers.get(r)!;
    layerNodes.sort((a, b) => {
      const aParents = parents.get(a.id) || [];
      const bParents = parents.get(b.id) || [];
      const aBary =
        aParents.length > 0
          ? aParents.reduce((sum, p) => sum + (orderIndex.get(p) ?? 0), 0) /
            aParents.length
          : 0;
      const bBary =
        bParents.length > 0
          ? bParents.reduce((sum, p) => sum + (orderIndex.get(p) ?? 0), 0) /
            bParents.length
          : 0;
      return aBary - bBary;
    });
    layerNodes.forEach((n, idx) => orderIndex.set(n.id, idx));
  }

  const maxSiblings = Math.max(
    1,
    ...Array.from(layers.values()).map((l) => l.length)
  );
  const positionedById = new Map<string, { x: number; y: number }>();

  for (let r = 0; r <= maxRank; r++) {
    const layerNodes = layers.get(r)!;
    const effectiveRank = dir === 'BT' || dir === 'RL' ? maxRank - r : r;
    const count = layerNodes.length;

    layerNodes.forEach((node, siblingIdx) => {
      if (dir === 'LR' || dir === 'RL') {
        const totalSpanY = Math.max(1, maxSiblings - 1) * 105;
        const layerSpanY = Math.max(0, count - 1) * 105;
        const startY = 45 + Math.max(0, (totalSpanY - layerSpanY) / 2);
        positionedById.set(node.id, {
          x: Math.round(35 + effectiveRank * 185),
          y: Math.round(startY + siblingIdx * 105),
        });
      } else {
        const totalSpanX = Math.max(1, maxSiblings - 1) * 195;
        const layerSpanX = Math.max(0, count - 1) * 195;
        const startX = 45 + Math.max(0, (totalSpanX - layerSpanX) / 2);
        positionedById.set(node.id, {
          x: Math.round(startX + siblingIdx * 195),
          y: Math.round(35 + effectiveRank * 105),
        });
      }
    });
  }

  return nodes.map((n) => {
    const pos = positionedById.get(n.id);
    return pos ? { ...n, x: pos.x, y: pos.y } : n;
  });
}

export function computeEdgeGeometry(
  fromNode: FlowNode,
  toNode: FlowNode,
  nodeWidth = 144,
  nodeHeight = 52,
  direction?: FlowDirection
): EdgeGeometry {
  const cx1 = fromNode.x + nodeWidth / 2;
  const cy1 = fromNode.y + nodeHeight / 2;
  const cx2 = toNode.x + nodeWidth / 2;
  const cy2 = toNode.y + nodeHeight / 2;

  let x1 = cx1;
  let y1 = cy1;
  let x2 = cx2;
  let y2 = cy2;
  let pathData: string;

  const isHorizontalFlow = direction === 'LR' || direction === 'RL';
  const verticalBiasRatio = isHorizontalFlow ? 1.15 : 0.35;

  if (Math.abs(cy2 - cy1) >= Math.abs(cx2 - cx1) * verticalBiasRatio) {
    if (cy2 >= cy1) {
      y1 = fromNode.y + nodeHeight;
      y2 = toNode.y;
    } else {
      y1 = fromNode.y;
      y2 = toNode.y + nodeHeight;
    }
    const dy = y2 - y1;
    const controlOffset = Math.max(Math.abs(dy) * 0.45, 24) * (dy >= 0 ? 1 : -1);
    pathData = `M ${x1} ${y1} C ${x1} ${y1 + controlOffset}, ${x2} ${y2 - controlOffset}, ${x2} ${y2}`;
  } else {
    if (cx2 >= cx1) {
      x1 = fromNode.x + nodeWidth;
      x2 = toNode.x;
    } else {
      x1 = fromNode.x;
      x2 = toNode.x + nodeWidth;
    }
    const dx = x2 - x1;
    const controlOffset = Math.max(Math.abs(dx) * 0.45, 24) * (dx >= 0 ? 1 : -1);
    pathData = `M ${x1} ${y1} C ${x1 + controlOffset} ${y1}, ${x2 - controlOffset} ${y2}, ${x2} ${y2}`;
  }

  return {
    x1,
    y1,
    x2,
    y2,
    midX: Math.round((x1 + x2) / 2),
    midY: Math.round((y1 + y2) / 2),
    pathData,
  };
}

export function formatMermaidEdgeOperator(
  style: FlowEdgeStyle = 'solid',
  arrow: FlowEdgeArrow = 'arrow'
): string {
  if (style === 'dotted') {
    switch (arrow) {
      case 'none':
        return '-.-';
      case 'bidirectional':
        return '<-.->';
      case 'circle':
        return '-.-o';
      case 'cross':
        return '-.-x';
      case 'arrow':
      default:
        return '-.->';
    }
  }

  if (style === 'thick') {
    switch (arrow) {
      case 'none':
        return '===';
      case 'bidirectional':
        return '<==>';
      case 'circle':
        return '==o';
      case 'cross':
        return '==x';
      case 'arrow':
      default:
        return '==>';
    }
  }

  switch (arrow) {
    case 'none':
      return '---';
    case 'bidirectional':
      return '<-->';
    case 'circle':
      return '--o';
    case 'cross':
      return '--x';
    case 'arrow':
    default:
      return '-->';
  }
}

export function formatSequenceMessageOperator(
  style: FlowEdgeStyle = 'solid',
  arrow: FlowEdgeArrow = 'arrow'
): string {
  const isDotted = style === 'dotted';
  if (arrow === 'cross') {
    return isDotted ? '--x' : '-x';
  }
  if (arrow === 'none') {
    return isDotted ? '-->' : '->';
  }
  return isDotted ? '-->>' : '->>';
}

function formatNodeMermaidLine(n: FlowNode, indent = '    '): string {
  const cleanText = n.text.replace(/"/g, "'");
  switch (n.type) {
    case 'decision':
      return `${indent}${n.id}{"${cleanText}"}\n`;
    case 'start':
      return `${indent}${n.id}(["${cleanText}"])\n`;
    case 'database':
      return `${indent}${n.id}[("${cleanText}")]\n`;
    case 'subroutine':
      return `${indent}${n.id}[["${cleanText}"]]\n`;
    case 'io':
      return `${indent}${n.id}[/"${cleanText}"/]\n`;
    case 'circle':
      return `${indent}${n.id}(("${cleanText}"))\n`;
    case 'hexagon':
      return `${indent}${n.id}{{"${cleanText}"}}\n`;
    case 'asymmetric':
      return `${indent}${n.id}>"${cleanText}"]\n`;
    case 'process':
    default:
      return `${indent}${n.id}["${cleanText}"]\n`;
  }
}

function formatStateDiagramNodeLine(n: FlowNode, indent = '    '): string {
  if (n.text.trim() === '[*]') return '';
  const cleanText = n.text.replace(/"/g, "'");
  let out = `${indent}state "${cleanText}" as ${n.id}\n`;
  if (n.type === 'decision') {
    out += `${indent}state ${n.id} <<choice>>\n`;
  }
  return out;
}

function formatClassDiagramNodeLine(n: FlowNode, indent = '    '): string {
  const cleanText = n.text.replace(/"/g, "'");
  const hasLabelAlias = cleanText && cleanText !== n.id;
  const headerToken = hasLabelAlias ? `${n.id}["${cleanText}"]` : n.id;
  const members = n.members || [];
  const hasBody = Boolean(n.stereotype) || members.length > 0;

  if (!hasBody) {
    return `${indent}class ${headerToken}\n`;
  }

  let out = `${indent}class ${headerToken} {\n`;
  if (n.stereotype) {
    out += `${indent}    <<${n.stereotype}>>\n`;
  }
  for (const m of members) {
    out += `${indent}    ${m}\n`;
  }
  out += `${indent}}\n`;
  return out;
}

function formatClassRelationOperator(e: FlowEdge): string {
  if (e.cardinality && e.cardinality.trim()) {
    return e.cardinality.trim();
  }
  if (e.style === 'dotted') {
    if (e.arrow === 'none') return '..';
    if (e.arrow === 'bidirectional') return '<|..';
    return '..>';
  }
  if (e.style === 'thick') {
    if (e.arrow === 'circle') return '*--';
    return '--|>';
  }
  if (e.arrow === 'none') return '--';
  if (e.arrow === 'circle') return 'o--';
  if (e.arrow === 'bidirectional') return '<|--';
  return '-->';
}

export function generateMermaidCode(flowData: FlowchartState): string {
  const diagramType: MermaidDiagramType = flowData.diagramType || 'flowchart';

  if (diagramType === 'classDiagram') {
    let mermaid = 'classDiagram\n';
    if (flowData.direction && flowData.direction !== 'TD') {
      mermaid += `    direction ${flowData.direction}\n`;
    }

    const nodesById = new Map<string, FlowNode>(
      flowData.nodes.map((n) => [n.id, n])
    );
    const emittedNodeIds = new Set<string>();

    if (flowData.subgraphs && flowData.subgraphs.length > 0) {
      flowData.subgraphs.forEach((sg) => {
        const validMembers = sg.nodeIds
          .map((id) => nodesById.get(id))
          .filter((n): n is FlowNode => Boolean(n && !emittedNodeIds.has(n.id)));
        if (validMembers.length === 0) return;
        const nsId = sg.id.replace(/[^A-Za-z0-9_.-]/g, '_');
        mermaid += `    namespace ${nsId} {\n`;
        validMembers.forEach((member) => {
          mermaid += formatClassDiagramNodeLine(member, '        ');
          emittedNodeIds.add(member.id);
        });
        mermaid += `    }\n`;
      });
    }

    flowData.nodes.forEach((n) => {
      if (!emittedNodeIds.has(n.id)) {
        mermaid += formatClassDiagramNodeLine(n, '    ');
      }
    });

    flowData.edges.forEach((e) => {
      const op = formatClassRelationOperator(e);
      if (e.label && e.label.trim()) {
        mermaid += `    ${e.from} ${op} ${e.to} : ${e.label.trim()}\n`;
      } else {
        mermaid += `    ${e.from} ${op} ${e.to}\n`;
      }
    });

    return mermaid;
  }

  if (diagramType === 'erDiagram') {
    let mermaid = 'erDiagram\n';
    flowData.nodes.forEach((n) => {
      const cleanText = n.text.replace(/"/g, "'");
      const headerToken =
        cleanText && cleanText !== n.id ? `${n.id}["${cleanText}"]` : n.id;
      const members = n.members || [];
      if (members.length > 0) {
        mermaid += `    ${headerToken} {\n`;
        members.forEach((m) => {
          mermaid += `        ${m}\n`;
        });
        mermaid += `    }\n`;
      } else {
        mermaid += `    ${headerToken} {\n    }\n`;
      }
    });

    flowData.edges.forEach((e) => {
      const op =
        e.cardinality && e.cardinality.trim()
          ? e.cardinality.trim()
          : e.style === 'dotted'
            ? '||..o{'
            : '||--o{';
      const label = e.label && e.label.trim() ? e.label.trim() : 'relates';
      mermaid += `    ${e.from} ${op} ${e.to} : ${label}\n`;
    });

    return mermaid;
  }

  if (diagramType === 'sequenceDiagram') {
    let mermaid = 'sequenceDiagram\n';
    flowData.nodes.forEach((n) => {
      const cleanText = n.text.replace(/"/g, "'");
      const keyword =
        n.type === 'circle' || n.type === 'start' ? 'actor' : 'participant';
      if (cleanText === n.id) {
        mermaid += `    ${keyword} ${n.id}\n`;
      } else {
        mermaid += `    ${keyword} ${n.id} as ${cleanText}\n`;
      }
    });
    flowData.edges.forEach((e) => {
      const op = formatSequenceMessageOperator(e.style, e.arrow);
      const msg = e.label && e.label.trim() ? e.label.trim() : 'Message';
      mermaid += `    ${e.from}${op}${e.to}: ${msg}\n`;
    });
    return mermaid;
  }

  if (diagramType === 'stateDiagram-v2') {
    let mermaid = 'stateDiagram-v2\n';
    if (flowData.direction && flowData.direction !== 'TD') {
      mermaid += `    direction ${flowData.direction}\n`;
    }

    const nodesById = new Map<string, FlowNode>(
      flowData.nodes.map((n) => [n.id, n])
    );
    const emittedNodeIds = new Set<string>();

    if (flowData.subgraphs && flowData.subgraphs.length > 0) {
      flowData.subgraphs.forEach((sg) => {
        const validMembers = sg.nodeIds
          .map((id) => nodesById.get(id))
          .filter((n): n is FlowNode => Boolean(n && !emittedNodeIds.has(n.id)));
        if (validMembers.length === 0) return;
        const cleanTitle = sg.title.replace(/"/g, "'");
        mermaid += `    state "${cleanTitle}" as ${sg.id} {\n`;
        validMembers.forEach((member) => {
          mermaid += formatStateDiagramNodeLine(member, '        ');
          emittedNodeIds.add(member.id);
        });
        mermaid += `    }\n`;
      });
    }

    flowData.nodes.forEach((n) => {
      if (!emittedNodeIds.has(n.id)) {
        mermaid += formatStateDiagramNodeLine(n, '    ');
      }
    });

    flowData.edges.forEach((e) => {
      const fromNode = nodesById.get(e.from);
      const toNode = nodesById.get(e.to);
      const fromToken = fromNode?.text.trim() === '[*]' ? '[*]' : e.from;
      const toToken = toNode?.text.trim() === '[*]' ? '[*]' : e.to;
      if (e.label && e.label.trim()) {
        mermaid += `    ${fromToken} --> ${toToken} : ${e.label.trim()}\n`;
      } else {
        mermaid += `    ${fromToken} --> ${toToken}\n`;
      }
    });

    return mermaid;
  }

  const direction: FlowDirection = flowData.direction || 'TD';
  let mermaid = `flowchart ${direction}\n`;

  const nodesById = new Map<string, FlowNode>(
    flowData.nodes.map((n) => [n.id, n])
  );
  const emittedNodeIds = new Set<string>();

  if (flowData.subgraphs && flowData.subgraphs.length > 0) {
    flowData.subgraphs.forEach((sg) => {
      const validMembers = sg.nodeIds
        .map((id) => nodesById.get(id))
        .filter((n): n is FlowNode => Boolean(n && !emittedNodeIds.has(n.id)));
      if (validMembers.length === 0) return;

      const cleanTitle = sg.title.replace(/"/g, "'");
      mermaid += `    subgraph ${sg.id} ["${cleanTitle}"]\n`;
      validMembers.forEach((member) => {
        mermaid += formatNodeMermaidLine(member, '        ');
        emittedNodeIds.add(member.id);
      });
      mermaid += `    end\n`;
    });
  }

  flowData.nodes.forEach((n) => {
    if (!emittedNodeIds.has(n.id)) {
      mermaid += formatNodeMermaidLine(n, '    ');
    }
  });

  flowData.edges.forEach((e) => {
    const op = formatMermaidEdgeOperator(e.style, e.arrow);
    if (e.label && e.label.trim()) {
      const cleanLabel = e.label.trim().replace(/\|/g, '/');
      mermaid += `    ${e.from} ${op}|${cleanLabel}| ${e.to}\n`;
    } else {
      mermaid += `    ${e.from} ${op} ${e.to}\n`;
    }
  });

  // Emit style directives for nodes with custom AccentColor overrides
  flowData.nodes.forEach((n) => {
    if (n.color && ACCENT_HEX_PALETTE[n.color]) {
      const { fill, stroke } = ACCENT_HEX_PALETTE[n.color];
      mermaid += `    style ${n.id} fill:${fill},stroke:${stroke},stroke-width:2px\n`;
    }
  });

  return mermaid;
}

interface ParsedNodeToken {
  id: string;
  type?: FlowNodeType;
  text?: string;
  className?: string;
}

function parseNodeToken(rawToken: string): ParsedNodeToken | null {
  let token = rawToken.trim();
  if (!token) return null;

  // Strip optional :::className suffix (e.g. n1["API"]:::rose)
  let className: string | undefined;
  const classMatch = token.match(/^(.*?):::([A-Za-z0-9_-]+)$/);
  if (classMatch) {
    token = classMatch[1].trim();
    className = classMatch[2];
  }

  const withClass = (base: ParsedNodeToken): ParsedNodeToken =>
    className ? { ...base, className } : base;

  // 1. Terminal / Stadium: id(["text"])
  const startMatch = token.match(/^([A-Za-z0-9_-]+)\(\[\s*"?(.*?)"?\s*\]\)$/);
  if (startMatch) {
    return withClass({ id: startMatch[1], type: 'start', text: startMatch[2] });
  }

  // 2. Database / Cylinder: id[("text")]
  const dbMatch = token.match(/^([A-Za-z0-9_-]+)\[\(\s*"?(.*?)"?\s*\)\]$/);
  if (dbMatch) {
    return withClass({ id: dbMatch[1], type: 'database', text: dbMatch[2] });
  }

  // 3. Subroutine / Subprocess: id[["text"]]
  const subroutineMatch = token.match(
    /^([A-Za-z0-9_-]+)\[\[\s*"?(.*?)"?\s*\]\]$/
  );
  if (subroutineMatch) {
    return withClass({
      id: subroutineMatch[1],
      type: 'subroutine',
      text: subroutineMatch[2],
    });
  }

  // 4. Circle / Double Circle: id(("text")) or id((("text")))
  const circleMatch = token.match(
    /^([A-Za-z0-9_-]+)\(\(\(?\s*"?(.*?)"?\s*\)?\)\)$/
  );
  if (circleMatch) {
    return withClass({ id: circleMatch[1], type: 'circle', text: circleMatch[2] });
  }

  // 5. Hexagon / Preparation: id{{"text"}}
  const hexagonMatch = token.match(
    /^([A-Za-z0-9_-]+)\{\{\s*"?(.*?)"?\s*\}\}$/
  );
  if (hexagonMatch) {
    return withClass({
      id: hexagonMatch[1],
      type: 'hexagon',
      text: hexagonMatch[2],
    });
  }

  // 6. Parallelogram Input/Output: id[/"text"/] or id[\"text"\]
  const ioMatch = token.match(
    /^([A-Za-z0-9_-]+)\[[/\\]\s*"?(.*?)"?\s*[/\\]\]$/
  );
  if (ioMatch) {
    return withClass({ id: ioMatch[1], type: 'io', text: ioMatch[2] });
  }

  // 7. Asymmetric / Flag: id>"text"]
  const asymmetricMatch = token.match(/^([A-Za-z0-9_-]+)>\s*"?(.*?)"?\s*\]$/);
  if (asymmetricMatch) {
    return withClass({
      id: asymmetricMatch[1],
      type: 'asymmetric',
      text: asymmetricMatch[2],
    });
  }

  // 8. Decision / Rhombus: id{"text"}
  const decisionMatch = token.match(/^([A-Za-z0-9_-]+)\{\s*"?(.*?)"?\s*\}$/);
  if (decisionMatch) {
    return withClass({
      id: decisionMatch[1],
      type: 'decision',
      text: decisionMatch[2],
    });
  }

  // 9. Process / Standard Box: id["text"] or rounded id("text")
  const processMatch =
    token.match(/^([A-Za-z0-9_-]+)\[\s*"?(.*?)"?\s*\]$/) ||
    token.match(/^([A-Za-z0-9_-]+)\(\s*"?(.*?)"?\s*\)$/);
  if (processMatch) {
    return withClass({
      id: processMatch[1],
      type: 'process',
      text: processMatch[2],
    });
  }

  // 10. Bare Node Identifier
  const bareMatch = token.match(/^([A-Za-z0-9_-]+)$/);
  if (bareMatch) {
    return withClass({ id: bareMatch[1] });
  }

  return null;
}

function parseAmpersandNodeGroup(rawSegment: string): ParsedNodeToken[] | null {
  const parts = rawSegment
    .split(/\s+&\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;

  const parsed: ParsedNodeToken[] = [];
  for (const part of parts) {
    const token = parseNodeToken(part);
    if (!token) return null;
    parsed.push(token);
  }
  return parsed;
}

interface EdgeHopOperator {
  label?: string;
  style: FlowEdgeStyle;
  arrow: FlowEdgeArrow;
}

interface ParsedEdgeMatch extends EdgeHopOperator {
  rawFrom: string;
  rawTo: string;
}

function classifyArrowSuffix(
  bidirPrefix: string | undefined,
  endChar: string | undefined
): FlowEdgeArrow {
  if (bidirPrefix === '<') return 'bidirectional';
  if (endChar === 'o') return 'circle';
  if (endChar === 'x') return 'cross';
  if (endChar === '>') return 'arrow';
  return 'none';
}

function parseEdgeLine(line: string): ParsedEdgeMatch | null {
  // 1. Dotted inline label: A -. label .-> B, A <-. label .-> B, A -. label .- B, A -. label .-o B, A -. label .-x B
  const dottedInlineMatch = line.match(
    /^(.+?)\s*(<)?-\.\s*(.+?)\s*\.+-(>|o|x)?(?:\s+|$)(.+)$/
  );
  if (dottedInlineMatch) {
    const [, rawFrom, bidir, label, endChar, rawTo] = dottedInlineMatch;
    return {
      rawFrom,
      rawTo,
      label,
      style: 'dotted',
      arrow: classifyArrowSuffix(bidir, endChar),
    };
  }

  // 2. Thick inline label: A == label ==> B, A <== label ==> B, A == label === B, A == label ==o B, A == label ==x B
  const thickInlineMatch = line.match(
    /^(.+?)\s*(<)?==\s*([^=]+?)\s*==+(>|o|x)?(?:\s+|$)(.+)$/
  );
  if (thickInlineMatch) {
    const [, rawFrom, bidir, label, endChar, rawTo] = thickInlineMatch;
    return {
      rawFrom,
      rawTo,
      label,
      style: 'thick',
      arrow: classifyArrowSuffix(bidir, endChar),
    };
  }

  // 3. Solid inline label: A -- label --> B, A <-- label --> B, A -- label --- B, A -- label --o B, A -- label --x B
  const solidInlineMatch = line.match(
    /^(.+?)\s*(<)?--\s+([^-]+?)\s*--+(>|o|x)?(?:\s+|$)(.+)$/
  );
  if (solidInlineMatch) {
    const [, rawFrom, bidir, label, endChar, rawTo] = solidInlineMatch;
    return {
      rawFrom,
      rawTo,
      label,
      style: 'solid',
      arrow: classifyArrowSuffix(bidir, endChar),
    };
  }

  // 4. Direct operator (with optional |label| pipe syntax)
  // Dotted direct: <-.->, -.->, -.-o, -.-x, -.-
  const dottedDirectMatch = line.match(
    /^(.+?)\s*(<)?-\.+-(>|o|x)?(?:\|([^|]+)\|)?(?:\s+|(?=\|)|$)\s*(.+)$/
  );
  if (dottedDirectMatch) {
    const [, rawFrom, bidir, endChar, label, rawTo] = dottedDirectMatch;
    return {
      rawFrom,
      rawTo,
      label,
      style: 'dotted',
      arrow: classifyArrowSuffix(bidir, endChar),
    };
  }

  // Thick direct: <==>, ==>, ==o, ==x, ===
  const thickDirectMatch = line.match(
    /^(.+?)\s*(<)?==+(>|o|x)?(?:\|([^|]+)\|)?(?:\s+|(?=\|)|$)\s*(.+)$/
  );
  if (thickDirectMatch) {
    const [, rawFrom, bidir, endChar, label, rawTo] = thickDirectMatch;
    if (endChar || bidir || thickDirectMatch[0].includes('===')) {
      return {
        rawFrom,
        rawTo,
        label,
        style: 'thick',
        arrow: classifyArrowSuffix(bidir, endChar),
      };
    }
  }

  // Solid direct: <-->, -->, --o, --x, ---
  const solidDirectMatch = line.match(
    /^(.+?)\s*(<)?(--+)(>|o|x)?(?:\|([^|]+)\|)?(?:\s+|(?=\|)|$)\s*(.+)$/
  );
  if (solidDirectMatch) {
    const [, rawFrom, bidir, dashes, endChar, label, rawTo] = solidDirectMatch;
    if (endChar || bidir || dashes.length >= 3) {
      return {
        rawFrom,
        rawTo,
        label,
        style: 'solid',
        arrow: classifyArrowSuffix(bidir, endChar),
      };
    }
  }

  return null;
}

interface ExpandedEdgeChain {
  segments: string[];
  operators: EdgeHopOperator[];
}

function expandEdgeChain(expr: string): ExpandedEdgeChain {
  const match = parseEdgeLine(expr);
  if (!match) {
    return { segments: [expr], operators: [] };
  }
  const left = expandEdgeChain(match.rawFrom);
  const right = expandEdgeChain(match.rawTo);
  return {
    segments: [...left.segments, ...right.segments],
    operators: [
      ...left.operators,
      { label: match.label, style: match.style, arrow: match.arrow },
      ...right.operators,
    ],
  };
}

function parseStateDiagramCode(
  lines: string[],
  existingById: Map<string, FlowNode>
): FlowchartState | null {
  const nodesMap = new Map<string, FlowNode>();
  const edges: FlowEdge[] = [];
  const subgraphsMap = new Map<string, FlowSubgraph>();
  const subgraphStack: string[] = [];
  let parsedDirection: FlowDirection | undefined;
  let sgAutoIdx = 1;

  const registerInActiveSubgraphs = (nodeId: string) => {
    for (const sgId of subgraphStack) {
      const sg = subgraphsMap.get(sgId);
      if (sg && !sg.nodeIds.includes(nodeId)) {
        sg.nodeIds.push(nodeId);
      }
    }
  };

  const ensureStateNode = (
    id: string,
    type?: FlowNodeType,
    text?: string
  ): string => {
    const cleanId = id.trim();
    registerInActiveSubgraphs(cleanId);
    const existing = nodesMap.get(cleanId);
    if (existing) {
      if (text && (existing.text === existing.id || text !== cleanId)) {
        existing.text = text;
      }
      if (type) existing.type = type;
      return cleanId;
    }
    const prevNode = existingById.get(cleanId);
    const index = nodesMap.size;
    const col = index % 2;
    const row = Math.floor(index / 2);
    nodesMap.set(cleanId, {
      id: cleanId,
      type: type || prevNode?.type || 'process',
      text: text || prevNode?.text || cleanId,
      x: prevNode ? prevNode.x : 45 + col * 210,
      y: prevNode ? prevNode.y : 35 + row * 105,
      ...(prevNode?.color ? { color: prevNode.color } : {}),
    });
    return cleanId;
  };

  for (const line of lines) {
    if (/^stateDiagram(?:-v2)?\b/i.test(line)) continue;

    const dirMatch = line.match(/^direction\s+(TD|TB|BT|LR|RL)\b/i);
    if (dirMatch) {
      const rawDir = dirMatch[1].toUpperCase();
      parsedDirection = (rawDir === 'TB' ? 'TD' : rawDir) as FlowDirection;
      continue;
    }

    // End of composite state block
    if (line === '}' || /^end$/i.test(line)) {
      subgraphStack.pop();
      continue;
    }

    // Composite state block start: state "Title" as id {  OR  state id {
    const compositeMatch =
      line.match(/^state\s+"([^"]+)"\s+as\s+([A-Za-z0-9_-]+)\s*\{$/i) ||
      line.match(/^state\s+([A-Za-z0-9_-]+)\s*\{$/i);
    if (compositeMatch) {
      const isAliased = compositeMatch.length === 3;
      const sgId = isAliased ? compositeMatch[2] : compositeMatch[1];
      const sgTitle = isAliased ? compositeMatch[1] : compositeMatch[1];
      if (!subgraphsMap.has(sgId)) {
        subgraphsMap.set(sgId, {
          id: sgId || `sg${sgAutoIdx++}`,
          title: sgTitle,
          nodeIds: [],
        });
      }
      subgraphStack.push(sgId);
      continue;
    }

    // Stereotype declaration: state id <<choice>> | <<fork>> | <<join>>
    const choiceMatch = line.match(
      /^state\s+(?:"([^"]+)"\s+as\s+)?([A-Za-z0-9_-]+)\s*<<\s*(choice|fork|join)\s*>>$/i
    );
    if (choiceMatch) {
      const [, optLabel, stateId, stereo] = choiceMatch;
      const nodeType: FlowNodeType =
        stereo.toLowerCase() === 'choice' ? 'decision' : 'hexagon';
      ensureStateNode(stateId, nodeType, optLabel);
      continue;
    }

    // State alias declaration: state "Label" as id
    const stateAliasMatch = line.match(
      /^state\s+"([^"]+)"\s+as\s+([A-Za-z0-9_-]+)$/i
    );
    if (stateAliasMatch) {
      const [, label, stateId] = stateAliasMatch;
      ensureStateNode(stateId, undefined, label);
      continue;
    }

    // Transition line: StateA --> StateB : Optional Label
    const transitionMatch = line.match(
      /^(\[\*\]|[A-Za-z0-9_-]+?)\s*(-->|-\.->|==>)\s*(\[\*\]|[A-Za-z0-9_-]+)(?:\s*:\s*(.+))?$/
    );
    if (transitionMatch) {
      const [, rawFrom, op, rawTo, rawLabel] = transitionMatch;
      const fromId =
        rawFrom === '[*]'
          ? ensureStateNode('state_start', 'start', '[*]')
          : ensureStateNode(rawFrom);
      const toId =
        rawTo === '[*]'
          ? ensureStateNode('state_end', 'start', '[*]')
          : ensureStateNode(rawTo);
      const edgeStyle: FlowEdgeStyle =
        op === '-.->' ? 'dotted' : op === '==>' ? 'thick' : 'solid';
      edges.push({
        from: fromId,
        to: toId,
        ...(rawLabel && rawLabel.trim() ? { label: rawLabel.trim() } : {}),
        ...(edgeStyle !== 'solid' ? { style: edgeStyle } : {}),
      });
      continue;
    }

    // State description: StateId : Description
    const stateDescMatch = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.+)$/);
    if (stateDescMatch && !/^note\b/i.test(stateDescMatch[1])) {
      const [, stateId, desc] = stateDescMatch;
      ensureStateNode(stateId, undefined, desc.trim());
    }
  }

  if (nodesMap.size === 0) return null;

  const nonEmptySubgraphs = Array.from(subgraphsMap.values()).filter(
    (sg) => sg.nodeIds.length > 0
  );

  return {
    nodes: Array.from(nodesMap.values()),
    edges,
    diagramType: 'stateDiagram-v2',
    ...(parsedDirection && parsedDirection !== 'TD'
      ? { direction: parsedDirection }
      : {}),
    ...(nonEmptySubgraphs.length > 0 ? { subgraphs: nonEmptySubgraphs } : {}),
  };
}

function parseSequenceDiagramCode(
  lines: string[],
  existingById: Map<string, FlowNode>
): FlowchartState | null {
  const nodesMap = new Map<string, FlowNode>();
  const edges: FlowEdge[] = [];

  const ensureParticipant = (
    id: string,
    kind: 'participant' | 'actor' = 'participant',
    label?: string
  ) => {
    const cleanId = id.trim();
    if (!cleanId) return;
    const nodeType: FlowNodeType = kind === 'actor' ? 'circle' : 'process';
    const existing = nodesMap.get(cleanId);
    if (existing) {
      if (label) existing.text = label;
      if (kind === 'actor') existing.type = 'circle';
      return;
    }
    const prevNode = existingById.get(cleanId);
    const index = nodesMap.size;
    nodesMap.set(cleanId, {
      id: cleanId,
      type: prevNode?.type || nodeType,
      text: label || prevNode?.text || cleanId,
      x: prevNode ? prevNode.x : 35 + index * 175,
      y: prevNode ? prevNode.y : 35,
      ...(prevNode?.color ? { color: prevNode.color } : {}),
    });
  };

  for (const line of lines) {
    if (/^sequenceDiagram\b/i.test(line)) continue;
    if (
      /^(?:autonumber|activate|deactivate|note\s+|loop\b|alt\b|else\b|opt\b|par\b|rect\b|end\b)/i.test(
        line
      )
    ) {
      continue;
    }

    // participant / actor declaration: participant id as Label | participant id
    const partMatch = line.match(
      /^(participant|actor)\s+([A-Za-z0-9_-]+)(?:\s+as\s+(.+))?$/i
    );
    if (partMatch) {
      const kind = partMatch[1].toLowerCase() as 'participant' | 'actor';
      const id = partMatch[2].trim();
      const rawLabel = partMatch[3]?.trim().replace(/^["']|["']$/g, '');
      ensureParticipant(id, kind, rawLabel || id);
      continue;
    }

    // Sequence message: A->>B: Hello, A-->>B: World, A-xB: Error, A--xB: Fail, A->B: Ping, A-->B: Pong
    const msgMatch = line.match(
      /^([A-Za-z0-9_-]+?)\s*(-->>|->>|--x|-x|-->|->|--\)|-\))\s*[+-]?([A-Za-z0-9_-]+)\s*(?::\s*(.*))?$/
    );
    if (msgMatch) {
      const [, fromId, op, toId, rawLabel] = msgMatch;
      ensureParticipant(fromId);
      ensureParticipant(toId);

      const style: FlowEdgeStyle = op.startsWith('--') ? 'dotted' : 'solid';
      let arrow: FlowEdgeArrow = 'arrow';
      if (op.endsWith('x')) {
        arrow = 'cross';
      } else if (op === '->' || op === '-->') {
        arrow = 'none';
      }

      edges.push({
        from: fromId,
        to: toId,
        ...(rawLabel && rawLabel.trim() ? { label: rawLabel.trim() } : {}),
        ...(style !== 'solid' ? { style } : {}),
        ...(arrow !== 'arrow' ? { arrow } : {}),
      });
    }
  }

  if (nodesMap.size === 0) return null;

  return {
    nodes: Array.from(nodesMap.values()),
    edges,
    diagramType: 'sequenceDiagram',
  };
}

function inferNodeTypeFromStereotype(
  stereotype: string | undefined,
  fallback?: FlowNodeType
): FlowNodeType {
  if (!stereotype) return fallback || 'process';
  const lower = stereotype.toLowerCase();
  if (lower.includes('interface') || lower.includes('enum')) {
    return 'hexagon';
  }
  if (lower.includes('abstract') || lower.includes('service')) {
    return 'subroutine';
  }
  return fallback || 'process';
}

function parseClassDiagramCode(
  lines: string[],
  existingById: Map<string, FlowNode>
): FlowchartState | null {
  const nodesMap = new Map<string, FlowNode>();
  const edges: FlowEdge[] = [];
  const subgraphsMap = new Map<string, FlowSubgraph>();
  const subgraphStack: string[] = [];
  let activeClassId: string | null = null;
  let parsedDirection: FlowDirection | undefined;

  const registerInActiveSubgraphs = (nodeId: string) => {
    for (const sgId of subgraphStack) {
      const sg = subgraphsMap.get(sgId);
      if (sg && !sg.nodeIds.includes(nodeId)) {
        sg.nodeIds.push(nodeId);
      }
    }
  };

  const ensureClassNode = (
    id: string,
    opts?: {
      type?: FlowNodeType;
      text?: string;
      stereotype?: string;
      member?: string;
    }
  ): string => {
    const cleanId = id.trim();
    registerInActiveSubgraphs(cleanId);
    const existing = nodesMap.get(cleanId);
    if (existing) {
      if (opts?.text && (existing.text === existing.id || opts.text !== cleanId)) {
        existing.text = opts.text;
      }
      if (opts?.stereotype) {
        existing.stereotype = opts.stereotype;
        existing.type = inferNodeTypeFromStereotype(opts.stereotype, existing.type);
      } else if (opts?.type) {
        existing.type = opts.type;
      }
      if (opts?.member) {
        existing.members = [...(existing.members || []), opts.member];
      }
      return cleanId;
    }

    const prevNode = existingById.get(cleanId);
    const index = nodesMap.size;
    const col = index % 2;
    const row = Math.floor(index / 2);
    const stereo = opts?.stereotype || prevNode?.stereotype;
    const resolvedType =
      opts?.type || inferNodeTypeFromStereotype(stereo, prevNode?.type);

    nodesMap.set(cleanId, {
      id: cleanId,
      type: resolvedType,
      text: opts?.text || prevNode?.text || cleanId,
      x: prevNode ? prevNode.x : 45 + col * 215,
      y: prevNode ? prevNode.y : 35 + row * 125,
      ...(prevNode?.color ? { color: prevNode.color } : {}),
      ...(stereo ? { stereotype: stereo } : {}),
      ...(opts?.member
        ? { members: [opts.member] }
        : prevNode?.members
          ? { members: [...prevNode.members] }
          : {}),
    });
    return cleanId;
  };

  for (const line of lines) {
    if (/^classDiagram\b/i.test(line)) continue;

    // Inside a `class Foo { ... }` body
    if (activeClassId !== null) {
      if (line === '}') {
        activeClassId = null;
        continue;
      }
      const stereoMatch = line.match(/^<<\s*([^>]+?)\s*>>$/);
      if (stereoMatch) {
        ensureClassNode(activeClassId, { stereotype: stereoMatch[1].trim() });
        continue;
      }
      ensureClassNode(activeClassId, { member: line });
      continue;
    }

    const dirMatch = line.match(/^direction\s+(TD|TB|BT|LR|RL)\b/i);
    if (dirMatch) {
      const rawDir = dirMatch[1].toUpperCase();
      parsedDirection = (rawDir === 'TB' ? 'TD' : rawDir) as FlowDirection;
      continue;
    }

    if (line === '}' || /^end$/i.test(line)) {
      subgraphStack.pop();
      continue;
    }

    // Namespace block start: namespace Domain {
    const nsMatch = line.match(/^namespace\s+([A-Za-z0-9_.-]+)\s*\{$/i);
    if (nsMatch) {
      const rawNs = nsMatch[1].trim();
      const sgId = rawNs.replace(/[^A-Za-z0-9_-]/g, '_');
      if (!subgraphsMap.has(sgId)) {
        subgraphsMap.set(sgId, { id: sgId, title: rawNs, nodeIds: [] });
      }
      subgraphStack.push(sgId);
      continue;
    }

    // Empty single-line class block: class Foo["Label"] { }
    const emptyBlockMatch =
      line.match(
        /^class\s+([A-Za-z0-9_-]+)(?:\[\s*"([^"]+)"\s*\])?(?:\s*<<\s*([^>]+?)\s*>>)?\s*\{\s*\}$/i
      ) ||
      line.match(
        /^class\s+"([^"]+)"\s+as\s+([A-Za-z0-9_-]+)(?:\s*<<\s*([^>]+?)\s*>>)?\s*\{\s*\}$/i
      );
    if (emptyBlockMatch) {
      const isAsSyntax = /^class\s+"/i.test(line);
      const classId = isAsSyntax ? emptyBlockMatch[2] : emptyBlockMatch[1];
      const label = isAsSyntax ? emptyBlockMatch[1] : emptyBlockMatch[2];
      const stereo = emptyBlockMatch[3]?.trim();
      ensureClassNode(classId, { text: label, stereotype: stereo });
      continue;
    }

    // Multi-line class block opening: class Foo["Label"] <<interface>> {  OR  class "Label" as Foo {
    const classBlockMatch =
      line.match(
        /^class\s+([A-Za-z0-9_-]+)(?:\[\s*"([^"]+)"\s*\])?(?:\s*<<\s*([^>]+?)\s*>>)?\s*\{$/i
      ) ||
      line.match(
        /^class\s+"([^"]+)"\s+as\s+([A-Za-z0-9_-]+)(?:\s*<<\s*([^>]+?)\s*>>)?\s*\{$/i
      );
    if (classBlockMatch) {
      const isAsSyntax = /^class\s+"/i.test(line);
      const classId = isAsSyntax ? classBlockMatch[2] : classBlockMatch[1];
      const label = isAsSyntax ? classBlockMatch[1] : classBlockMatch[2];
      const stereo = classBlockMatch[3]?.trim();
      ensureClassNode(classId, { text: label, stereotype: stereo });
      activeClassId = classId;
      continue;
    }

    // Single-line class declaration: class "Label" as Foo <<interface>>  OR  class Foo["Label"] <<interface>>
    const classDeclMatch =
      line.match(
        /^class\s+"([^"]+)"\s+as\s+([A-Za-z0-9_-]+)(?:\s*<<\s*([^>]+?)\s*>>)?$/i
      ) ||
      line.match(
        /^class\s+([A-Za-z0-9_-]+)(?:\[\s*"([^"]+)"\s*\])?(?:\s*<<\s*([^>]+?)\s*>>)?$/i
      );
    if (classDeclMatch) {
      const isAsSyntax = /^class\s+"/i.test(line);
      const classId = isAsSyntax ? classDeclMatch[2] : classDeclMatch[1];
      const label = isAsSyntax ? classDeclMatch[1] : classDeclMatch[2];
      const stereo = classDeclMatch[3]?.trim();
      ensureClassNode(classId, { text: label, stereotype: stereo });
      continue;
    }

    // Standalone stereotype line: <<interface>> ClassName
    const standaloneStereoMatch = line.match(
      /^<<\s*([^>]+?)\s*>>\s+([A-Za-z0-9_-]+)$/
    );
    if (standaloneStereoMatch) {
      ensureClassNode(standaloneStereoMatch[2], {
        stereotype: standaloneStereoMatch[1].trim(),
      });
      continue;
    }

    // UML Relationship line: ClassA "1" <|-- "*" ClassB : inherits
    const relMatch = line.match(
      /^([A-Za-z0-9_-]+?)(?:\s+"([^"]+)")?\s*(<\|--|--\|>|\*--|--\*|o--|--o|<\|\.\.|\.\.\|>|<\.\.|\.\.>|-->|<--|--|\.\.)(?:\s+"([^"]+)")?\s*([A-Za-z0-9_-]+)(?:\s*:\s*(.+))?$/
    );
    if (relMatch) {
      const [, fromId, , op, , toId, rawLabel] = relMatch;
      ensureClassNode(fromId);
      ensureClassNode(toId);
      const style: FlowEdgeStyle = op.includes('..') ? 'dotted' : 'solid';
      let arrow: FlowEdgeArrow = 'arrow';
      if (op === '--' || op === '..') {
        arrow = 'none';
      } else if (op.includes('*') || op.includes('o')) {
        arrow = 'circle';
      } else if (op === '<|--' || op === '<|..') {
        arrow = 'bidirectional';
      }

      edges.push({
        from: fromId,
        to: toId,
        cardinality: op,
        ...(rawLabel && rawLabel.trim() ? { label: rawLabel.trim() } : {}),
        ...(style !== 'solid' ? { style } : {}),
        ...(arrow !== 'arrow' ? { arrow } : {}),
      });
      continue;
    }

    // Colon member / stereotype syntax: ClassName : +method()
    const colonMemberMatch = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.+)$/);
    if (colonMemberMatch && !/^note\b/i.test(colonMemberMatch[1])) {
      const [, classId, rhs] = colonMemberMatch;
      const trimmedRhs = rhs.trim();
      const inlineStereo = trimmedRhs.match(/^<<\s*([^>]+?)\s*>>$/);
      if (inlineStereo) {
        ensureClassNode(classId, { stereotype: inlineStereo[1].trim() });
      } else {
        ensureClassNode(classId, { member: trimmedRhs });
      }
    }
  }

  if (nodesMap.size === 0) return null;

  const nonEmptySubgraphs = Array.from(subgraphsMap.values()).filter(
    (sg) => sg.nodeIds.length > 0
  );

  return {
    nodes: Array.from(nodesMap.values()),
    edges,
    diagramType: 'classDiagram',
    ...(parsedDirection && parsedDirection !== 'TD'
      ? { direction: parsedDirection }
      : {}),
    ...(nonEmptySubgraphs.length > 0 ? { subgraphs: nonEmptySubgraphs } : {}),
  };
}

function parseErDiagramCode(
  lines: string[],
  existingById: Map<string, FlowNode>
): FlowchartState | null {
  const nodesMap = new Map<string, FlowNode>();
  const edges: FlowEdge[] = [];
  let activeEntityId: string | null = null;
  let parsedDirection: FlowDirection | undefined;

  const ensureEntityNode = (
    id: string,
    opts?: { text?: string; member?: string }
  ): string => {
    const cleanId = id.trim();
    const existing = nodesMap.get(cleanId);
    if (existing) {
      if (opts?.text && (existing.text === existing.id || opts.text !== cleanId)) {
        existing.text = opts.text;
      }
      if (opts?.member) {
        existing.members = [...(existing.members || []), opts.member];
      }
      return cleanId;
    }

    const prevNode = existingById.get(cleanId);
    const index = nodesMap.size;
    const col = index % 2;
    const row = Math.floor(index / 2);

    nodesMap.set(cleanId, {
      id: cleanId,
      type: prevNode?.type || 'database',
      text: opts?.text || prevNode?.text || cleanId,
      x: prevNode ? prevNode.x : 45 + col * 215,
      y: prevNode ? prevNode.y : 35 + row * 125,
      ...(prevNode?.color ? { color: prevNode.color } : {}),
      ...(opts?.member
        ? { members: [opts.member] }
        : prevNode?.members
          ? { members: [...prevNode.members] }
          : {}),
    });
    return cleanId;
  };

  for (const line of lines) {
    if (/^erDiagram\b/i.test(line)) continue;

    if (activeEntityId !== null) {
      if (line === '}') {
        activeEntityId = null;
        continue;
      }
      ensureEntityNode(activeEntityId, { member: line });
      continue;
    }

    const dirMatch = line.match(/^direction\s+(TD|TB|BT|LR|RL)\b/i);
    if (dirMatch) {
      const rawDir = dirMatch[1].toUpperCase();
      parsedDirection = (rawDir === 'TB' ? 'TD' : rawDir) as FlowDirection;
      continue;
    }

    // Empty entity block on a single line: USER["User Account"] { }
    const emptyEntityMatch = line.match(
      /^([A-Za-z0-9_-]+)(?:\[\s*"([^"]+)"\s*\])?\s*\{\s*\}$/
    );
    if (emptyEntityMatch) {
      ensureEntityNode(emptyEntityMatch[1], { text: emptyEntityMatch[2] });
      continue;
    }

    // Entity block start: USER["User Account"] {
    const entityBlockMatch = line.match(
      /^([A-Za-z0-9_-]+)(?:\[\s*"([^"]+)"\s*\])?\s*\{$/
    );
    if (entityBlockMatch) {
      const entityId = entityBlockMatch[1];
      ensureEntityNode(entityId, { text: entityBlockMatch[2] });
      activeEntityId = entityId;
      continue;
    }

    // Crow's Foot relationship: USER ||--o{ ORDER : places
    const relMatch = line.match(
      /^([A-Za-z0-9_-]+?)\s*((?:\|\||\|o|o\||\}\||\|\{|\}o|o\{)(?:--|\.\.)(?:\|\||o\||\|o|\|\{|\}\||o\{|\}o))\s*([A-Za-z0-9_-]+)\s*:\s*(.+)$/
    );
    if (relMatch) {
      const [, fromId, cardinalityOp, toId, rawLabel] = relMatch;
      ensureEntityNode(fromId);
      ensureEntityNode(toId);
      const cleanLabel = rawLabel.trim().replace(/^["']|["']$/g, '');
      const style: FlowEdgeStyle = cardinalityOp.includes('..')
        ? 'dotted'
        : 'solid';

      edges.push({
        from: fromId,
        to: toId,
        cardinality: cardinalityOp,
        ...(cleanLabel ? { label: cleanLabel } : {}),
        ...(style !== 'solid' ? { style } : {}),
      });
      continue;
    }

    // Standalone entity declaration: USER or USER["User Account"]
    const standaloneEntityMatch = line.match(
      /^([A-Za-z0-9_-]+)(?:\[\s*"([^"]+)"\s*\])?$/
    );
    if (standaloneEntityMatch) {
      ensureEntityNode(standaloneEntityMatch[1], {
        text: standaloneEntityMatch[2],
      });
    }
  }

  if (nodesMap.size === 0) return null;

  return {
    nodes: Array.from(nodesMap.values()),
    edges,
    diagramType: 'erDiagram',
    ...(parsedDirection && parsedDirection !== 'TD'
      ? { direction: parsedDirection }
      : {}),
  };
}

export function parseMermaidCode(
  mermaidText: string,
  existingNodes?: FlowNode[]
): FlowchartState | null {
  const lines = mermaidText
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/;$/, '').trim())
    .filter((l) => l && !l.startsWith('%%'));

  if (lines.length === 0) return null;

  const existingById = new Map<string, FlowNode>(
    (existingNodes || []).map((n) => [n.id, n])
  );

  // Delegate State, Sequence, Class, or ER Diagram syntax to specialized parsers
  if (/^stateDiagram(?:-v2)?\b/i.test(lines[0])) {
    return parseStateDiagramCode(lines, existingById);
  }
  if (/^sequenceDiagram\b/i.test(lines[0])) {
    return parseSequenceDiagramCode(lines, existingById);
  }
  if (/^classDiagram\b/i.test(lines[0])) {
    return parseClassDiagramCode(lines, existingById);
  }
  if (/^erDiagram\b/i.test(lines[0])) {
    return parseErDiagramCode(lines, existingById);
  }

  const nodesMap = new Map<string, FlowNode>();
  const edges: FlowEdge[] = [];
  const subgraphsMap = new Map<string, FlowSubgraph>();
  const subgraphStack: string[] = [];
  const classDefColors = new Map<string, AccentColor>();
  const pendingNodeClasses = new Map<string, string>();
  const pendingNodeColors = new Map<string, AccentColor>();
  let parsedDirection: FlowDirection | undefined;
  let subgraphAutoIdx = 1;

  const registerInActiveSubgraphs = (nodeId: string) => {
    for (const sgId of subgraphStack) {
      const sg = subgraphsMap.get(sgId);
      if (sg && !sg.nodeIds.includes(nodeId)) {
        sg.nodeIds.push(nodeId);
      }
    }
  };

  const ensureNode = (
    id: string,
    type?: FlowNodeType,
    text?: string,
    className?: string
  ) => {
    const cleanId = id.trim();
    if (!cleanId) return;
    if (className) {
      pendingNodeClasses.set(cleanId, className);
    }
    registerInActiveSubgraphs(cleanId);

    const existing = nodesMap.get(cleanId);
    if (existing) {
      if (text) existing.text = text;
      if (type) existing.type = type;
      return;
    }
    const prevNode = existingById.get(cleanId);
    const index = nodesMap.size;
    const col = index % 2;
    const row = Math.floor(index / 2);
    nodesMap.set(cleanId, {
      id: cleanId,
      type: type || prevNode?.type || 'process',
      text: text || prevNode?.text || cleanId,
      x: prevNode ? prevNode.x : 45 + col * 210,
      y: prevNode ? prevNode.y : 35 + row * 105,
      ...(prevNode?.color ? { color: prevNode.color } : {}),
    });
  };

  for (const line of lines) {
    const headerMatch = line.match(/^(?:flowchart|graph)\s+(TD|TB|BT|LR|RL)\b/i);
    if (headerMatch) {
      const rawDir = headerMatch[1].toUpperCase();
      parsedDirection = (rawDir === 'TB' ? 'TD' : rawDir) as FlowDirection;
      continue;
    }
    if (/^(flowchart|graph)\s+/i.test(line)) continue;
    if (/^direction\s+(TD|TB|BT|LR|RL)\b/i.test(line)) continue;

    // Subgraph start: subgraph id ["Title"] | subgraph "Title" | subgraph id
    const subgraphMatch = line.match(/^subgraph\s+(.+)$/i);
    if (subgraphMatch) {
      const rawRest = subgraphMatch[1].trim();
      const bracketMatch = rawRest.match(
        /^([A-Za-z0-9_-]+)\s*\[\s*"?(.*?)"?\s*\]$/
      );
      const quotedOnlyMatch = !bracketMatch
        ? rawRest.match(/^"([^"]+)"$/)
        : null;

      let sgId: string;
      let sgTitle: string;

      if (bracketMatch) {
        sgId = bracketMatch[1];
        sgTitle = bracketMatch[2] || sgId;
      } else if (quotedOnlyMatch) {
        sgId = `sg${subgraphAutoIdx++}`;
        sgTitle = quotedOnlyMatch[1];
      } else {
        const words = rawRest.replace(/^["']|["']$/g, '').trim();
        const slug = words.replace(/[^A-Za-z0-9_-]+/g, '_');
        sgId = slug || `sg${subgraphAutoIdx++}`;
        sgTitle = words || sgId;
      }

      if (!subgraphsMap.has(sgId)) {
        subgraphsMap.set(sgId, { id: sgId, title: sgTitle, nodeIds: [] });
      }
      subgraphStack.push(sgId);
      continue;
    }

    // Subgraph end
    if (/^end$/i.test(line)) {
      subgraphStack.pop();
      continue;
    }

    // classDef <name> <styles>
    const classDefMatch = line.match(/^classDef\s+([A-Za-z0-9_-]+)\s+(.+)$/i);
    if (classDefMatch) {
      const [, className, styleBody] = classDefMatch;
      const inferred =
        inferAccentColorFromStyle(className) ||
        inferAccentColorFromStyle(styleBody);
      if (inferred) {
        classDefColors.set(className, inferred);
      }
      continue;
    }

    // class <node1,node2> <className>
    const classAssignMatch = line.match(
      /^class\s+([A-Za-z0-9_,\s-]+)\s+([A-Za-z0-9_-]+)$/i
    );
    if (classAssignMatch) {
      const [, rawNodeIds, className] = classAssignMatch;
      rawNodeIds
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((id) => pendingNodeClasses.set(id, className));
      continue;
    }

    // style <nodeId> <styleProps>
    const styleMatch = line.match(/^style\s+([A-Za-z0-9_-]+)\s+(.+)$/i);
    if (styleMatch) {
      const [, targetId, styleBody] = styleMatch;
      const inferred = inferAccentColorFromStyle(styleBody);
      if (inferred) {
        pendingNodeColors.set(targetId, inferred);
      }
      continue;
    }

    if (/^(click|linkStyle)\s+/i.test(line)) continue;

    // Expand chained edges (A --> B --> C) and multi-node (&) groups (A & B --> C & D)
    const chain = expandEdgeChain(line);
    if (chain.operators.length > 0) {
      const parsedGroups = chain.segments.map((seg) =>
        parseAmpersandNodeGroup(seg)
      );
      if (parsedGroups.every((g): g is ParsedNodeToken[] => g !== null)) {
        parsedGroups.forEach((group) => {
          group.forEach((token) =>
            ensureNode(token.id, token.type, token.text, token.className)
          );
        });

        for (let i = 0; i < chain.operators.length; i++) {
          const op = chain.operators[i];
          const fromGroup = parsedGroups[i];
          const toGroup = parsedGroups[i + 1];
          for (const fromToken of fromGroup) {
            for (const toToken of toGroup) {
              edges.push({
                from: fromToken.id,
                to: toToken.id,
                ...(op.label && op.label.trim()
                  ? { label: op.label.trim() }
                  : {}),
                ...(op.style !== 'solid' ? { style: op.style } : {}),
                ...(op.arrow !== 'arrow' ? { arrow: op.arrow } : {}),
              });
            }
          }
        }
        continue;
      }
    }

    const standaloneNode = parseNodeToken(line);
    if (
      standaloneNode &&
      (standaloneNode.type || standaloneNode.text || standaloneNode.className)
    ) {
      ensureNode(
        standaloneNode.id,
        standaloneNode.type,
        standaloneNode.text,
        standaloneNode.className
      );
    }
  }

  // Apply resolved classDef / :::className / style colors to nodes
  pendingNodeClasses.forEach((className, nodeId) => {
    const node = nodesMap.get(nodeId);
    if (!node) return;
    const color =
      classDefColors.get(className) || inferAccentColorFromStyle(className);
    if (color) {
      node.color = color;
    }
  });

  pendingNodeColors.forEach((color, nodeId) => {
    const node = nodesMap.get(nodeId);
    if (node) {
      node.color = color;
    }
  });

  if (nodesMap.size === 0) return null;

  const nonEmptySubgraphs = Array.from(subgraphsMap.values()).filter(
    (sg) => sg.nodeIds.length > 0
  );

  return {
    nodes: Array.from(nodesMap.values()),
    edges,
    ...(parsedDirection && parsedDirection !== 'TD'
      ? { direction: parsedDirection }
      : {}),
    ...(nonEmptySubgraphs.length > 0 ? { subgraphs: nonEmptySubgraphs } : {}),
  };
}

export function generateStandaloneSVG(flowData: FlowchartState): string {
  const isSequence = flowData.diagramType === 'sequenceDiagram';
  const subgraphBoundsList = (flowData.subgraphs || [])
    .map((sg) => computeSubgraphBounds(sg, flowData.nodes))
    .filter((b): b is SubgraphBounds => b !== null);

  const maxNodeRight = flowData.nodes.reduce(
    (max, n) => Math.max(max, n.x + 144),
    0
  );
  const maxNodeBottom = flowData.nodes.reduce((max, n) => {
    const memberCount = n.members?.length || 0;
    const nodeH =
      memberCount > 0 || n.stereotype
        ? Math.max(52, 34 + memberCount * 14 + (n.stereotype ? 14 : 0))
        : 52;
    return Math.max(max, n.y + nodeH);
  }, 0);
  const maxSgRight = subgraphBoundsList.reduce(
    (max, b) => Math.max(max, b.x + b.width),
    0
  );
  const maxSgBottom = subgraphBoundsList.reduce(
    (max, b) => Math.max(max, b.y + b.height),
    0
  );

  const seqMinBottom = isSequence
    ? 125 + Math.max(1, flowData.edges.length) * 48
    : 0;
  const maxRight = Math.max(maxNodeRight, maxSgRight);
  const maxBottom = Math.max(maxNodeBottom, maxSgBottom, seqMinBottom);
  const width = Math.max(600, maxRight + 48);
  const height = Math.max(460, maxBottom + 48);

  const escapeXml = (unsafe: string) =>
    unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

  const subgraphsSvg = subgraphBoundsList
    .map(
      (b) => `<g id="subgraph-${escapeXml(b.id)}" transform="translate(${b.x}, ${b.y})">
      <rect width="${b.width}" height="${b.height}" rx="14" fill="#0f172a" fill-opacity="0.65" stroke="#475569" stroke-width="1.5" stroke-dasharray="6,4" />
      <text x="14" y="20" fill="#94a3b8" font-family="Inter, sans-serif" font-size="11" font-weight="600">${escapeXml(b.title)}</text>
    </g>`
    )
    .join('\n    ');

  const lifelinesSvg = isSequence
    ? flowData.nodes
        .map((n) => {
          const cx = n.x + 72;
          const topY = n.y + 52;
          const bottomY = Math.max(topY + 80, seqMinBottom);
          return `<line x1="${cx}" y1="${topY}" x2="${cx}" y2="${bottomY}" stroke="#475569" stroke-width="1.5" stroke-dasharray="5,5" />`;
        })
        .join('\n    ')
    : '';

  const edgesSvg = flowData.edges
    .map((edge, idx) => {
      const fromNode = flowData.nodes.find((n) => n.id === edge.from);
      const toNode = flowData.nodes.find((n) => n.id === edge.to);
      if (!fromNode || !toNode) return '';

      let pathData: string;
      let midX: number;
      let midY: number;

      if (isSequence) {
        const x1 = fromNode.x + 72;
        const x2 = toNode.x + 72;
        const y = 115 + idx * 46;
        pathData = `M ${x1} ${y} L ${x2} ${y}`;
        midX = Math.round((x1 + x2) / 2);
        midY = y;
      } else {
        const geom = computeEdgeGeometry(
          fromNode,
          toNode,
          144,
          52,
          flowData.direction
        );
        pathData = geom.pathData;
        midX = geom.midX;
        midY = geom.midY;
      }

      const strokeWidth = edge.style === 'thick' ? '4' : '2.2';
      const dashAttr =
        edge.style === 'dotted' ? ' stroke-dasharray="6,4"' : '';
      const markerStartAttr =
        edge.arrow === 'bidirectional'
          ? ' marker-start="url(#arrowhead-start)"'
          : '';
      let markerEndAttr = ' marker-end="url(#arrowhead)"';
      if (edge.arrow === 'none') {
        markerEndAttr = '';
      } else if (edge.arrow === 'circle') {
        markerEndAttr = ' marker-end="url(#circlehead)"';
      } else if (edge.arrow === 'cross') {
        markerEndAttr = ' marker-end="url(#crosshead)"';
      }

      const displayLabel = isSequence
        ? `${idx + 1}. ${edge.label || 'Message'}`
        : edge.cardinality && edge.label
          ? `${edge.cardinality} ${edge.label}`
          : edge.label || edge.cardinality;

      return `<path d="${pathData}" stroke="#818cf8" stroke-width="${strokeWidth}" fill="none"${dashAttr}${markerStartAttr}${markerEndAttr} />${
        displayLabel
          ? `<text x="${midX}" y="${midY - 6}" fill="#c7d2fe" font-family="Inter, sans-serif" font-size="10" text-anchor="middle">${escapeXml(displayLabel)}</text>`
          : ''
      }`;
    })
    .join('\n    ');

  const nodesSvg = flowData.nodes
    .map((node) => {
      const w = 144;
      const members = node.members || [];
      const hasCompartment = Boolean(node.stereotype) || members.length > 0;
      const h = hasCompartment
        ? Math.max(52, 34 + members.length * 14 + (node.stereotype ? 14 : 0))
        : 52;
      let fill = '#082f49';
      let stroke = '#38bdf8';
      let rx = 12;
      let dash = '';
      let shapeSvg = '';

      if (node.type === 'decision') {
        fill = '#451a03';
        stroke = '#fbbf24';
        rx = 16;
        dash = 'stroke-dasharray="5,4"';
      } else if (node.type === 'start') {
        fill = '#022c22';
        stroke = '#34d399';
        rx = 26;
      } else if (node.type === 'database') {
        fill = '#2e1065';
        stroke = '#a78bfa';
      } else if (node.type === 'subroutine') {
        fill = '#1e1b4b';
        stroke = '#818cf8';
      } else if (node.type === 'io') {
        fill = '#083344';
        stroke = '#22d3ee';
      } else if (node.type === 'circle') {
        fill = '#4c0519';
        stroke = '#fb7185';
        rx = 26;
      } else if (node.type === 'hexagon') {
        fill = '#431407';
        stroke = '#fb923c';
      } else if (node.type === 'asymmetric') {
        fill = '#042f2e';
        stroke = '#2dd4bf';
      }

      // Override fill/stroke if node has explicit AccentColor styling
      if (node.color && ACCENT_HEX_PALETTE[node.color]) {
        fill = ACCENT_HEX_PALETTE[node.color].fill;
        stroke = ACCENT_HEX_PALETTE[node.color].stroke;
      }

      if (hasCompartment) {
        shapeSvg = `<rect width="${w}" height="${h}" rx="8" fill="${fill}" stroke="${stroke}" stroke-width="2" />`;
      } else if (node.type === 'database') {
        shapeSvg = `<rect x="0" y="6" width="${w}" height="${h - 12}" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="2" />
      <ellipse cx="${w / 2}" cy="8" rx="${w / 2}" ry="7" fill="${fill}" stroke="${stroke}" stroke-width="2" />`;
      } else if (node.type === 'subroutine') {
        shapeSvg = `<rect width="${w}" height="${h}" rx="8" fill="${fill}" stroke="${stroke}" stroke-width="2" />
      <line x1="12" y1="0" x2="12" y2="${h}" stroke="${stroke}" stroke-width="2" />
      <line x1="${w - 12}" y1="0" x2="${w - 12}" y2="${h}" stroke="${stroke}" stroke-width="2" />`;
      } else if (node.type === 'io') {
        shapeSvg = `<polygon points="14,0 ${w},0 ${w - 14},${h} 0,${h}" fill="${fill}" stroke="${stroke}" stroke-width="2" />`;
      } else if (node.type === 'hexagon') {
        shapeSvg = `<polygon points="16,0 ${w - 16},0 ${w},${h / 2} ${w - 16},${h} 16,${h} 0,${h / 2}" fill="${fill}" stroke="${stroke}" stroke-width="2" />`;
      } else if (node.type === 'asymmetric') {
        shapeSvg = `<polygon points="0,0 ${w - 16},0 ${w},${h / 2} ${w - 16},${h} 0,${h} 12,${h / 2}" fill="${fill}" stroke="${stroke}" stroke-width="2" />`;
      }

      if (!shapeSvg) {
        shapeSvg = `<rect width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="2" ${dash} />`;
      }

      if (hasCompartment) {
        const titleY = node.stereotype ? 26 : 18;
        const dividerY = node.stereotype ? 32 : 24;
        const stereoSvg = node.stereotype
          ? `\n      <text x="${w / 2}" y="13" fill="#94a3b8" font-family="Inter, sans-serif" font-size="9" font-style="italic" text-anchor="middle">&lt;&lt;${escapeXml(node.stereotype)}&gt;&gt;</text>`
          : '';
        const dividerSvg =
          members.length > 0
            ? `\n      <line x1="0" y1="${dividerY}" x2="${w}" y2="${dividerY}" stroke="${stroke}" stroke-opacity="0.45" stroke-width="1" />`
            : '';
        const membersSvg = members
          .map(
            (m, mIdx) =>
              `\n      <text x="8" y="${dividerY + 13 + mIdx * 14}" fill="#cbd5e1" font-family="monospace" font-size="9.5">${escapeXml(m)}</text>`
          )
          .join('');
        return `<g transform="translate(${node.x}, ${node.y})">
      ${shapeSvg}${stereoSvg}
      <text x="${w / 2}" y="${titleY}" fill="#f1f5f9" font-family="Inter, sans-serif" font-size="11.5" font-weight="600" text-anchor="middle">${escapeXml(node.text)}</text>${dividerSvg}${membersSvg}
    </g>`;
      }

      return `<g transform="translate(${node.x}, ${node.y})">
      ${shapeSvg}
      <text x="${w / 2}" y="${h / 2 + 4}" fill="#f1f5f9" font-family="Inter, sans-serif" font-size="12" font-weight="500" text-anchor="middle">${escapeXml(node.text)}</text>
    </g>`;
    })
    .join('\n    ');

  const subgraphsGroupBlock = subgraphBoundsSvgBlock(subgraphsSvg);
  const lifelinesGroupBlock = lifelinesSvg
    ? `\n  <g id="lifelines">\n    ${lifelinesSvg}\n  </g>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="#818cf8" />
    </marker>
    <marker id="arrowhead-start" markerWidth="10" markerHeight="7" refX="1" refY="3.5" orient="auto">
      <polygon points="10 0, 0 3.5, 10 7" fill="#818cf8" />
    </marker>
    <marker id="circlehead" markerWidth="8" markerHeight="8" refX="5" refY="4" orient="auto">
      <circle cx="4" cy="4" r="3" fill="#020617" stroke="#818cf8" stroke-width="1.8" />
    </marker>
    <marker id="crosshead" markerWidth="9" markerHeight="9" refX="6" refY="4.5" orient="auto">
      <path d="M 1.5 1.5 L 7.5 7.5 M 7.5 1.5 L 1.5 7.5" stroke="#818cf8" stroke-width="2" stroke-linecap="round" />
    </marker>
  </defs>
  <rect width="100%" height="100%" fill="#020617" />${subgraphsGroupBlock}${lifelinesGroupBlock}
  <g id="edges">
    ${edgesSvg}
  </g>
  <g id="nodes">
    ${nodesSvg}
  </g>
</svg>`;
}

function subgraphBoundsSvgBlock(subgraphsSvg: string): string {
  if (!subgraphsSvg) return '';
  return `\n  <g id="subgraphs">\n    ${subgraphsSvg}\n  </g>`;
}
