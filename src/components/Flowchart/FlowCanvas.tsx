import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Square,
  Diamond,
  CircleDot,
  Database,
  Columns,
  SlidersHorizontal,
  Circle,
  Hexagon,
  Flag,
  GitCommit,
  RotateCcw,
  Trash2,
  Share2,
  LayoutGrid,
  Compass,
  BoxSelect,
  Code2,
  Palette,
  RefreshCw,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  FileText,
  ListPlus,
  Plus,
  Copy,
  Maximize2,
  Magnet,
  Spline,
  PanelLeftClose,
  PanelLeftOpen,
  Image as ImageIcon,
  Layers,
} from 'lucide-react';
import {
  AccentColor,
  FlowchartState,
  FlowDiagramItem,
  FlowNode,
  FlowNodeType,
  FlowEdgeStyle,
  FlowEdgeCurve,
  FlowEdgeArrow,
  FlowDirection,
  FlowPortDirection,
  FlowSubgraph,
  MermaidDiagramType,
  NotifyFn,
} from '../../types/sideflow';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import {
  defaultFlowData,
  DEFAULT_PANEL_WIDTH_PERCENT,
} from '../../utils/defaults';
import {
  alignOrDistributeNodes,
  computeDagLayout,
  computeEdgeGeometry,
  computeSubgraphBounds,
  formatMermaidEdgeOperator,
  formatSequenceMessageOperator,
  generateMermaidCode,
  generateStandaloneSVG,
  getMermaidTemplatePreset,
  getNodeDimensions,
  insertNodeOnEdge,
  MERMAID_TEMPLATES,
  MermaidTemplateId,
  parseMermaidCode,
  renderFlowchartToPngData,
  spliceExistingNodeOnEdge,
} from '../../utils/mermaid';
import { LucidModal } from './LucidModal';

interface FlowCanvasProps {
  flowData: FlowchartState;
  onChangeFlowData: (
    updater: FlowchartState | ((prev: FlowchartState) => FlowchartState)
  ) => void;
  onNotify: NotifyFn;
  onInsertMermaidToNote?: (mermaidCode: string) => void;
  panelWidthPercent?: number;
}

const NODE_DEFAULT_LABELS: Record<FlowNodeType, string> = {
  process: 'New Process',
  decision: 'Condition?',
  start: 'Start / End',
  database: 'Database',
  subroutine: 'Subroutine',
  io: 'Input / Output',
  circle: 'Connector',
  hexagon: 'Prepare',
  asymmetric: 'Signal / Flag',
};

const ALL_NODE_SHAPES: Array<{
  type: FlowNodeType;
  label: string;
  shortLabel: string;
}> = [
  { type: 'process', label: 'Process Box', shortLabel: 'Process' },
  { type: 'decision', label: 'Decision Diamond', shortLabel: 'Decision' },
  { type: 'start', label: 'Start / End Terminal', shortLabel: 'Terminal' },
  { type: 'database', label: 'Database Cylinder', shortLabel: 'DB' },
  { type: 'subroutine', label: 'Subroutine', shortLabel: 'Sub' },
  { type: 'io', label: 'Input / Output', shortLabel: 'I/O' },
  { type: 'circle', label: 'Circle Node', shortLabel: 'Circle' },
  { type: 'hexagon', label: 'Hexagon Prepare', shortLabel: 'Hex' },
  { type: 'asymmetric', label: 'Signal / Flag', shortLabel: 'Flag' },
];

const ACCENT_CYCLE: Array<AccentColor | undefined> = [
  undefined,
  'indigo',
  'cyan',
  'emerald',
  'amber',
  'rose',
  'purple',
];

const ACCENT_SWATCH_CLASSES: Record<AccentColor, string> = {
  indigo: 'bg-indigo-500 border-indigo-300',
  cyan: 'bg-cyan-500 border-cyan-300',
  emerald: 'bg-emerald-500 border-emerald-300',
  amber: 'bg-amber-500 border-amber-300',
  rose: 'bg-rose-500 border-rose-300',
  purple: 'bg-purple-500 border-purple-300',
};

const NODE_COLOR_CLASSES: Record<AccentColor, string> = {
  indigo: 'bg-indigo-950/95 border-indigo-400/90 text-indigo-100',
  cyan: 'bg-cyan-950/95 border-cyan-400/90 text-cyan-100',
  emerald: 'bg-emerald-950/95 border-emerald-400/90 text-emerald-100',
  amber: 'bg-amber-950/95 border-amber-400/90 text-amber-100',
  rose: 'bg-rose-950/95 border-rose-400/90 text-rose-100',
  purple: 'bg-purple-950/95 border-purple-400/90 text-purple-100',
};

const EXTRA_SHAPE_BUTTONS: Array<{
  type: FlowNodeType;
  label: string;
  title: string;
  colorClass: string;
  Icon: React.FC<{
    className?: string;
    'aria-hidden'?: boolean | 'true' | 'false';
  }>;
}> = [
  {
    type: 'database',
    label: 'DB',
    title: 'Add Database Cylinder [(...)]',
    colorClass: 'text-purple-300',
    Icon: Database,
  },
  {
    type: 'subroutine',
    label: 'Sub',
    title: 'Add Subroutine [[...]]',
    colorClass: 'text-indigo-300',
    Icon: Columns,
  },
  {
    type: 'io',
    label: 'I/O',
    title: 'Add Input/Output Parallelogram [/.../]',
    colorClass: 'text-cyan-300',
    Icon: SlidersHorizontal,
  },
  {
    type: 'circle',
    label: 'Circle',
    title: 'Add Circle Node ((...))',
    colorClass: 'text-rose-300',
    Icon: Circle,
  },
  {
    type: 'hexagon',
    label: 'Hex',
    title: 'Add Hexagon Preparation Node {{...}}',
    colorClass: 'text-orange-300',
    Icon: Hexagon,
  },
  {
    type: 'asymmetric',
    label: 'Flag',
    title: 'Add Asymmetric Flag Node >...]',
    colorClass: 'text-teal-300',
    Icon: Flag,
  },
];

const DIRECTIONS: FlowDirection[] = ['TD', 'LR', 'BT', 'RL'];

const QUICK_DIRECTIONS: Array<{
  dir: FlowPortDirection;
  title: string;
  positionClass: string;
}> = [
  {
    dir: 'top',
    title: 'Click to quick-add node above • Drag to connect',
    positionClass: '-top-2.5 left-1/2 -translate-x-1/2',
  },
  {
    dir: 'right',
    title: 'Click to quick-add node to right • Drag to connect',
    positionClass: 'top-1/2 -right-2.5 -translate-y-1/2',
  },
  {
    dir: 'bottom',
    title: 'Click to quick-add node below • Drag to connect',
    positionClass: '-bottom-2.5 left-1/2 -translate-x-1/2',
  },
  {
    dir: 'left',
    title: 'Click to quick-add node to left • Drag to connect',
    positionClass: 'top-1/2 -left-2.5 -translate-y-1/2',
  },
];

function directionToPort(direction: FlowDirection): FlowPortDirection {
  switch (direction) {
    case 'LR':
      return 'right';
    case 'RL':
      return 'left';
    case 'BT':
      return 'top';
    case 'TD':
    default:
      return 'bottom';
  }
}

export const FlowCanvas: React.FC<FlowCanvasProps> = ({
  flowData,
  onChangeFlowData,
  onNotify,
  onInsertMermaidToNote,
  panelWidthPercent = DEFAULT_PANEL_WIDTH_PERCENT,
}) => {
  const [connectMode, setConnectMode] = useState(false);
  const [connectSourceNodeId, setConnectSourceNodeId] = useState<string | null>(
    null
  );
  const [activeEdgeStyle, setActiveEdgeStyle] =
    useState<FlowEdgeStyle>('solid');
  const [activeEdgeArrow, setActiveEdgeArrow] =
    useState<FlowEdgeArrow>('arrow');

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const selectedNodeIdsRef = useRef<string[]>([]);
  selectedNodeIdsRef.current = selectedNodeIds;

  const [marqueeMode, setMarqueeMode] = useState<boolean>(false);
  const marqueeModeRef = useRef<boolean>(false);
  marqueeModeRef.current = marqueeMode;

  const [marqueeBox, setMarqueeBox] = useState<{
    startX: number;
    startY: number;
    currX: number;
    currY: number;
  } | null>(null);
  const marqueeBoxRef = useRef<typeof marqueeBox>(null);
  marqueeBoxRef.current = marqueeBox;

  // Multi-Diagram Workspace Switcher state
  const [savedDiagrams, setSavedDiagrams] = useLocalStorage<FlowDiagramItem[]>(
    'sideflow_flow_diagrams_v1',
    [
      {
        id: 'flow-1',
        title: 'Hotkey Launch Flow',
        flowData: JSON.parse(JSON.stringify(defaultFlowData)),
        updatedAt: Date.now(),
      },
      {
        id: 'flow-2',
        title: 'CI/CD Deployment Pipeline',
        flowData:
          getMermaidTemplatePreset('ci-cd') ||
          JSON.parse(JSON.stringify(defaultFlowData)),
        updatedAt: Date.now() - 60000,
      },
    ]
  );
  const [activeDiagramId, setActiveDiagramId] = useLocalStorage<string>(
    'sideflow_active_diagram_id',
    'flow-1'
  );
  const activeDiagramIdRef = useRef<string>(activeDiagramId);
  activeDiagramIdRef.current = activeDiagramId;
  const [isDiagramSwitcherOpen, setIsDiagramSwitcherOpen] =
    useState<boolean>(false);

  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [compartmentNodeId, setCompartmentNodeId] = useState<string | null>(
    null
  );
  const [newMemberInput, setNewMemberInput] = useState('');
  const [editingSubgraphId, setEditingSubgraphId] = useState<string | null>(
    null
  );
  const [editingSubgraphTitle, setEditingSubgraphTitle] = useState('');
  const [editingEdgeIdx, setEditingEdgeIdx] = useState<number | null>(null);
  const [editingEdgeLabel, setEditingEdgeLabel] = useState('');
  const [editingEdgeStyle, setEditingEdgeStyle] =
    useState<FlowEdgeStyle>('solid');
  const [editingEdgeArrow, setEditingEdgeArrow] =
    useState<FlowEdgeArrow>('arrow');
  const [editingEdgeCardinality, setEditingEdgeCardinality] = useState('');
  const [editingEdgeCurve, setEditingEdgeCurve] =
    useState<FlowEdgeCurve>('bezier');
  const [isLucidModalOpen, setIsLucidModalOpen] = useState(false);
  const [isLiveCodeOpen, setIsLiveCodeOpen] = useState(false);
  const [liveMermaidInput, setLiveMermaidInput] = useState('');
  const [liveParseError, setLiveParseError] = useState<string | null>(null);

  // Snap-to-grid & alignment guides state
  const [snapToGrid, setSnapToGrid] = useState<boolean>(true);
  const [snapGuides, setSnapGuides] = useState<{
    x?: number;
    y?: number;
  } | null>(null);
  const [isStudioSidebarOpen, setIsStudioSidebarOpen] = useState<boolean>(true);

  // Transient drag coordinate map to prevent localStorage/IPC thrashing on mousemove
  const [dragNodePositions, setDragNodePositions] = useState<Record<
    string,
    { x: number; y: number }
  > | null>(null);
  const dragNodePositionsRef = useRef<Record<
    string,
    { x: number; y: number }
  > | null>(null);

  // Port drag-to-connect live rubber-band state
  const [draftConnection, setDraftConnection] = useState<{
    sourceId: string;
    port: FlowPortDirection;
    startX: number;
    startY: number;
    currX: number;
    currY: number;
    hoverTargetId?: string | null;
  } | null>(null);
  const draftConnectionRef = useRef<typeof draftConnection>(null);
  draftConnectionRef.current = draftConnection;

  // Zoom & Pan state + Undo/Redo history stack
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const zoomRef = useRef<number>(1);
  zoomRef.current = zoomLevel;
  const panRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  panRef.current = panOffset;
  const snapToGridRef = useRef<boolean>(true);
  snapToGridRef.current = snapToGrid;

  const [, setHistoryTick] = useState<number>(0);
  const historyRef = useRef<{
    past: FlowchartState[];
    future: FlowchartState[];
  }>({ past: [], future: [] });

  const flowDataRef = useRef<FlowchartState>(flowData);
  flowDataRef.current = flowData;

  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const cachedWrapperRectRef = useRef<DOMRect | null>(null);
  const draggingNodeIdRef = useRef<string | null>(null);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const draggingSubgraphRef = useRef<{
    id: string;
    startClientX: number;
    startClientY: number;
    initialPositions: Record<string, { x: number; y: number }>;
  } | null>(null);
  const panningCanvasRef = useRef<{
    lastClientX: number;
    lastClientY: number;
  } | null>(null);
  const nodeCounterRef = useRef<number>(1);
  const subgraphCounterRef = useRef<number>(1);

  const currentDirection: FlowDirection = flowData.direction || 'TD';
  const currentDiagramType: MermaidDiagramType =
    flowData.diagramType || 'flowchart';
  const currentEdgeCurve: FlowEdgeCurve = flowData.edgeCurve || 'bezier';
  const isSequenceDiagram = currentDiagramType === 'sequenceDiagram';

  // Adaptive Screen-Presence Layout Tier based on panelWidthPercent
  const layoutMode: 'compact' | 'standard' | 'expanded' =
    panelWidthPercent >= 65
      ? 'expanded'
      : panelWidthPercent >= 45
        ? 'standard'
        : 'compact';

  // Effective nodes merging committed flowData.nodes with in-flight transient drag positions
  const effectiveNodes = useMemo(() => {
    if (!dragNodePositions) return flowData.nodes;
    return flowData.nodes.map((n) => {
      const override = dragNodePositions[n.id];
      return override ? { ...n, x: override.x, y: override.y } : n;
    });
  }, [flowData.nodes, dragNodePositions]);

  // Memoized O(1) lookup map with dynamic compartment dimensions
  const nodesById = useMemo(() => {
    const map = new Map<
      string,
      { node: FlowNode; width: number; height: number }
    >();
    for (const n of effectiveNodes) {
      const dim = getNodeDimensions(n);
      map.set(n.id, { node: n, width: dim.width, height: dim.height });
    }
    return map;
  }, [effectiveNodes]);

  // Memoized single-pass edge geometries shared by SVG paths and HTML label badges
  const computedEdges = useMemo(() => {
    return flowData.edges.map((edge, idx) => {
      const fromEntry = nodesById.get(edge.from);
      const toEntry = nodesById.get(edge.to);
      if (!fromEntry || !toEntry) return null;

      if (isSequenceDiagram) {
        const x1 = fromEntry.node.x + 72;
        const x2 = toEntry.node.x + 72;
        const y = 115 + idx * 46;
        return {
          edge,
          idx,
          pathData: `M ${x1} ${y} L ${x2} ${y}`,
          midX: Math.round((x1 + x2) / 2),
          midY: y,
        };
      }

      const geom = computeEdgeGeometry(
        fromEntry.node,
        toEntry.node,
        fromEntry.width,
        fromEntry.height,
        flowData.direction,
        edge.curve || currentEdgeCurve,
        toEntry.width,
        toEntry.height
      );
      return {
        edge,
        idx,
        pathData: geom.pathData,
        midX: geom.midX,
        midY: geom.midY,
      };
    });
  }, [
    flowData.edges,
    nodesById,
    isSequenceDiagram,
    flowData.direction,
    currentEdgeCurve,
  ]);

  // Helper that records undo history on discrete flowchart edits and syncs active saved diagram
  const commitFlowUpdate = useCallback(
    (updater: FlowchartState | ((prev: FlowchartState) => FlowchartState)) => {
      const current = flowDataRef.current;
      const next =
        typeof updater === 'function' ? updater(current) : updater;
      if (next !== current) {
        const snapshot = JSON.parse(
          JSON.stringify(current)
        ) as FlowchartState;
        historyRef.current.past = [
          ...historyRef.current.past.slice(-29),
          snapshot,
        ];
        historyRef.current.future = [];
        flowDataRef.current = next;
        setHistoryTick((t) => t + 1);
        onChangeFlowData(next);
        setSavedDiagrams((prevDiagrams) =>
          prevDiagrams.map((d) =>
            d.id === activeDiagramIdRef.current
              ? { ...d, flowData: next, updatedAt: Date.now() }
              : d
          )
        );
      }
    },
    [onChangeFlowData, setSavedDiagrams]
  );

  const handleUndo = useCallback(() => {
    if (historyRef.current.past.length === 0) return;
    const current = flowDataRef.current;
    const previous =
      historyRef.current.past[historyRef.current.past.length - 1];
    historyRef.current.past = historyRef.current.past.slice(0, -1);
    historyRef.current.future = [
      JSON.parse(JSON.stringify(current)) as FlowchartState,
      ...historyRef.current.future.slice(0, 29),
    ];
    flowDataRef.current = previous;
    setHistoryTick((t) => t + 1);
    onChangeFlowData(previous);
    setSavedDiagrams((prevDiagrams) =>
      prevDiagrams.map((d) =>
        d.id === activeDiagramIdRef.current
          ? { ...d, flowData: previous, updatedAt: Date.now() }
          : d
      )
    );
  }, [onChangeFlowData, setSavedDiagrams]);

  const handleRedo = useCallback(() => {
    if (historyRef.current.future.length === 0) return;
    const current = flowDataRef.current;
    const next = historyRef.current.future[0];
    historyRef.current.future = historyRef.current.future.slice(1);
    historyRef.current.past = [
      ...historyRef.current.past.slice(-29),
      JSON.parse(JSON.stringify(current)) as FlowchartState,
    ];
    flowDataRef.current = next;
    setHistoryTick((t) => t + 1);
    onChangeFlowData(next);
    setSavedDiagrams((prevDiagrams) =>
      prevDiagrams.map((d) =>
        d.id === activeDiagramIdRef.current
          ? { ...d, flowData: next, updatedAt: Date.now() }
          : d
      )
    );
  }, [onChangeFlowData, setSavedDiagrams]);

  const handleZoomIn = () => {
    setZoomLevel((z) => Math.min(2.25, Math.round((z + 0.15) * 100) / 100));
  };

  const handleZoomOut = () => {
    setZoomLevel((z) => Math.max(0.35, Math.round((z - 0.15) * 100) / 100));
  };

  const handleResetZoom = () => {
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
  };

  const handleFitView = useCallback(() => {
    const nodes = flowDataRef.current.nodes;
    if (nodes.length === 0 || !canvasWrapperRef.current) {
      handleResetZoom();
      return;
    }
    const rect = canvasWrapperRef.current.getBoundingClientRect();
    const viewW = Math.max(320, rect.width || 400);
    const viewH = Math.max(240, rect.height || 360);

    const minX = Math.min(...nodes.map((n) => n.x));
    const minY = Math.min(...nodes.map((n) => n.y));
    const maxX = Math.max(
      ...nodes.map((n) => n.x + getNodeDimensions(n).width)
    );
    const maxY = Math.max(
      ...nodes.map((n) => n.y + getNodeDimensions(n).height)
    );

    const contentW = Math.max(180, maxX - minX + 64);
    const contentH = Math.max(120, maxY - minY + 64);
    const fitScale = Math.min(1.25, Math.max(0.45, Math.min(viewW / contentW, viewH / contentH)));
    const roundedZoom = Math.round(fitScale * 100) / 100;

    const nextPanX = Math.round(
      (viewW - (maxX - minX) * roundedZoom) / 2 - minX * roundedZoom
    );
    const nextPanY = Math.round(
      Math.max(16, (viewH - (maxY - minY) * roundedZoom) / 2 - minY * roundedZoom)
    );

    setZoomLevel(roundedZoom);
    setPanOffset({ x: nextPanX, y: nextPanY });
  }, []);

  // Keep live Mermaid code drawer in sync when non-drag flowData changes on canvas
  useEffect(() => {
    if (isLiveCodeOpen && !dragNodePositions) {
      setLiveMermaidInput(generateMermaidCode(flowData));
      setLiveParseError(null);
    }
  }, [flowData, isLiveCodeOpen, dragNodePositions]);

  const allocateUniqueNodeId = (existingNodes: FlowNode[]): string => {
    const existingIds = new Set(existingNodes.map((n) => n.id));
    let candidateId = `n${existingNodes.length + nodeCounterRef.current}`;
    while (existingIds.has(candidateId)) {
      nodeCounterRef.current += 1;
      candidateId = `n${existingNodes.length + nodeCounterRef.current}`;
    }
    nodeCounterRef.current += 1;
    return candidateId;
  };

  // Compute smart default label for edges leaving a Decision node ("Yes" / "No")
  const getSmartEdgeLabel = (
    prev: FlowchartState,
    sourceId: string
  ): string | undefined => {
    if (
      prev.diagramType &&
      prev.diagramType !== 'flowchart' &&
      prev.diagramType !== 'stateDiagram-v2'
    ) {
      return undefined;
    }
    const sourceNode = prev.nodes.find((n) => n.id === sourceId);
    if (!sourceNode || sourceNode.type !== 'decision') return undefined;
    const existingOutgoing = prev.edges.filter((e) => e.from === sourceId);
    const existingLabels = new Set(
      existingOutgoing.map((e) => (e.label || '').toLowerCase())
    );
    if (!existingLabels.has('yes')) return 'Yes';
    if (!existingLabels.has('no')) return 'No';
    return undefined;
  };

  const createEdgeBetween = useCallback(
    (sourceId: string, targetId: string, explicitLabel?: string) => {
      if (sourceId === targetId) return;
      commitFlowUpdate((prev) => {
        const isSeq = prev.diagramType === 'sequenceDiagram';
        const exists =
          !isSeq &&
          prev.edges.some(
            (edge) => edge.from === sourceId && edge.to === targetId
          );
        if (exists) return prev;
        const autoLabel =
          explicitLabel !== undefined
            ? explicitLabel
            : getSmartEdgeLabel(prev, sourceId);
        return {
          ...prev,
          edges: [
            ...prev.edges,
            {
              from: sourceId,
              to: targetId,
              ...(autoLabel ? { label: autoLabel } : {}),
              ...(activeEdgeStyle !== 'solid' ? { style: activeEdgeStyle } : {}),
              ...(activeEdgeArrow !== 'arrow' ? { arrow: activeEdgeArrow } : {}),
            },
          ],
        };
      });
      setConnectSourceNodeId(null);
      setConnectMode(false);
    },
    [commitFlowUpdate, activeEdgeStyle, activeEdgeArrow]
  );

  // One-click directional quick-add & auto-connect (Lucidchart / draw.io style)
  const handleQuickAddDirection = useCallback(
    (
      sourceNode: FlowNode,
      portDir: FlowPortDirection,
      preferredType?: FlowNodeType
    ) => {
      let createdNodeId = '';
      let createdNodeText = '';

      commitFlowUpdate((prev) => {
        const candidateId = allocateUniqueNodeId(prev.nodes);
        createdNodeId = candidateId;

        const nextType: FlowNodeType =
          preferredType ||
          (prev.diagramType === 'erDiagram'
            ? 'database'
            : sourceNode.type === 'start' || sourceNode.type === 'decision'
              ? 'process'
              : sourceNode.type);
        createdNodeText =
          prev.diagramType === 'sequenceDiagram'
            ? `Service ${prev.nodes.length + 1}`
            : NODE_DEFAULT_LABELS[nextType];

        let targetX = sourceNode.x;
        let targetY = sourceNode.y;

        if (prev.diagramType === 'sequenceDiagram') {
          targetX = 35 + prev.nodes.length * 175;
          targetY = 35;
        } else {
          const stepX = 195;
          const stepY = 105;
          if (portDir === 'right') targetX += stepX;
          if (portDir === 'left') targetX -= stepX;
          if (portDir === 'bottom') targetY += stepY;
          if (portDir === 'top') targetY -= stepY;

          // Nudge perpendicular axis if another node already occupies this slot
          let attempts = 0;
          while (
            attempts < 12 &&
            prev.nodes.some(
              (n) =>
                Math.abs(n.x - targetX) < 130 && Math.abs(n.y - targetY) < 48
            )
          ) {
            attempts += 1;
            const offset =
              Math.ceil(attempts / 2) * (attempts % 2 === 1 ? 1 : -1);
            if (portDir === 'bottom' || portDir === 'top') {
              targetX = sourceNode.x + offset * 180;
            } else {
              targetY = sourceNode.y + offset * 90;
            }
          }
        }

        if (snapToGridRef.current) {
          targetX = Math.round(targetX / 8) * 8;
          targetY = Math.round(targetY / 8) * 8;
        }

        const newNode: FlowNode = {
          id: candidateId,
          type: nextType,
          text: createdNodeText,
          x: targetX,
          y: targetY,
          ...(sourceNode.color ? { color: sourceNode.color } : {}),
        };

        const autoLabel = getSmartEdgeLabel(prev, sourceNode.id);

        return {
          ...prev,
          nodes: [...prev.nodes, newNode],
          edges: [
            ...prev.edges,
            {
              from: sourceNode.id,
              to: candidateId,
              ...(autoLabel ? { label: autoLabel } : {}),
              ...(activeEdgeStyle !== 'solid'
                ? { style: activeEdgeStyle }
                : {}),
              ...(activeEdgeArrow !== 'arrow'
                ? { arrow: activeEdgeArrow }
                : {}),
            },
          ],
        };
      });

      if (createdNodeId) {
        setSelectedNodeId(createdNodeId);
        setEditingNodeId(createdNodeId);
        setEditingText(createdNodeText);
      }
    },
    [commitFlowUpdate, activeEdgeStyle, activeEdgeArrow]
  );

  // Unified high-performance pointer move & up listeners (zero localStorage/IPC writes during drag)
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (panningCanvasRef.current) {
        const pan = panningCanvasRef.current;
        const dx = Math.round(e.clientX - pan.lastClientX);
        const dy = Math.round(e.clientY - pan.lastClientY);
        if (dx === 0 && dy === 0) return;
        pan.lastClientX = e.clientX;
        pan.lastClientY = e.clientY;
        setPanOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
        return;
      }

      // Live Marquee Box Selection
      if (marqueeBoxRef.current && canvasWrapperRef.current) {
        const rect =
          cachedWrapperRectRef.current ||
          canvasWrapperRef.current.getBoundingClientRect();
        const currX = Math.round(
          (e.clientX - rect.left - panRef.current.x) / zoomRef.current
        );
        const currY = Math.round(
          (e.clientY - rect.top - panRef.current.y) / zoomRef.current
        );
        const startX = marqueeBoxRef.current.startX;
        const startY = marqueeBoxRef.current.startY;
        const minX = Math.min(startX, currX);
        const maxX = Math.max(startX, currX);
        const minY = Math.min(startY, currY);
        const maxY = Math.max(startY, currY);

        const hits = flowDataRef.current.nodes
          .filter((n) => {
            const dim = getNodeDimensions(n);
            return (
              n.x + dim.width >= minX &&
              n.x <= maxX &&
              n.y + dim.height >= minY &&
              n.y <= maxY
            );
          })
          .map((n) => n.id);

        setMarqueeBox((prev) => (prev ? { ...prev, currX, currY } : null));
        setSelectedNodeIds(hits);
        setSelectedNodeId(hits[0] || null);
        return;
      }

      // Live rubber-band connector dragging from a directional port
      if (draftConnectionRef.current && canvasWrapperRef.current) {
        const rect =
          cachedWrapperRectRef.current ||
          canvasWrapperRef.current.getBoundingClientRect();
        const currX = Math.round(
          (e.clientX - rect.left - panRef.current.x) / zoomRef.current
        );
        const currY = Math.round(
          (e.clientY - rect.top - panRef.current.y) / zoomRef.current
        );
        const currentNodes = flowDataRef.current.nodes;
        const hovered = currentNodes.find((n) => {
          if (n.id === draftConnectionRef.current?.sourceId) return false;
          const dim = getNodeDimensions(n);
          return (
            currX >= n.x - 10 &&
            currX <= n.x + dim.width + 10 &&
            currY >= n.y - 10 &&
            currY <= n.y + dim.height + 10
          );
        });
        setDraftConnection((prev) =>
          prev
            ? {
                ...prev,
                currX,
                currY,
                hoverTargetId: hovered ? hovered.id : null,
              }
            : null
        );
        return;
      }

      // Subgraph or Multi-Selection group dragging (updates transient positions only)
      if (draggingSubgraphRef.current) {
        const sgDrag = draggingSubgraphRef.current;
        const dx = Math.round(
          (e.clientX - sgDrag.startClientX) / zoomRef.current
        );
        const dy = Math.round(
          (e.clientY - sgDrag.startClientY) / zoomRef.current
        );
        if (dx === 0 && dy === 0) return;

        const nextPositions: Record<string, { x: number; y: number }> = {};
        for (const [nodeId, initPos] of Object.entries(
          sgDrag.initialPositions
        )) {
          let nx = initPos.x + dx;
          let ny = initPos.y + dy;
          if (snapToGridRef.current) {
            nx = Math.round(nx / 8) * 8;
            ny = Math.round(ny / 8) * 8;
          }
          nextPositions[nodeId] = { x: nx, y: ny };
        }
        dragNodePositionsRef.current = nextPositions;
        setDragNodePositions(nextPositions);
        return;
      }

      // Single node dragging with unclamped infinite canvas + smart alignment snap guides
      const draggingId = draggingNodeIdRef.current;
      if (!draggingId || !canvasWrapperRef.current) return;

      const wrapperRect =
        cachedWrapperRectRef.current ||
        canvasWrapperRef.current.getBoundingClientRect();

      let nextX = Math.round(
        (e.clientX - wrapperRect.left - panRef.current.x) / zoomRef.current -
          dragOffsetRef.current.x
      );
      let nextY = Math.round(
        (e.clientY - wrapperRect.top - panRef.current.y) / zoomRef.current -
          dragOffsetRef.current.y
      );

      if (snapToGridRef.current) {
        nextX = Math.round(nextX / 8) * 8;
        nextY = Math.round(nextY / 8) * 8;
      }

      // Check smart alignment guides against stationary nodes (O(N))
      const SNAP_TOLERANCE = 6;
      let guideX: number | undefined;
      let guideY: number | undefined;
      for (const other of flowDataRef.current.nodes) {
        if (other.id === draggingId) continue;
        if (guideX === undefined && Math.abs(other.x - nextX) <= SNAP_TOLERANCE) {
          nextX = other.x;
          guideX = other.x + 72;
        }
        if (guideY === undefined && Math.abs(other.y - nextY) <= SNAP_TOLERANCE) {
          nextY = other.y;
          guideY = other.y + 26;
        }
      }
      setSnapGuides(
        guideX !== undefined || guideY !== undefined
          ? { x: guideX, y: guideY }
          : null
      );

      const nextMap = { [draggingId]: { x: nextX, y: nextY } };
      dragNodePositionsRef.current = nextMap;
      setDragNodePositions(nextMap);
    };

    const handleMouseUp = () => {
      if (marqueeBoxRef.current) {
        marqueeBoxRef.current = null;
        setMarqueeBox(null);
      }

      // Commit port drag-to-connect if active
      if (draftConnectionRef.current) {
        const draft = draftConnectionRef.current;
        draftConnectionRef.current = null;
        setDraftConnection(null);
        if (draft.hoverTargetId && draft.hoverTargetId !== draft.sourceId) {
          createEdgeBetween(draft.sourceId, draft.hoverTargetId);
        } else {
          const dist = Math.hypot(
            draft.currX - draft.startX,
            draft.currY - draft.startY
          );
          if (dist >= 48) {
            // Dropped on empty canvas -> spawn connected node at drop location!
            const sourceNode = flowDataRef.current.nodes.find(
              (n) => n.id === draft.sourceId
            );
            if (sourceNode) {
              let spawnedId = '';
              let spawnedText = '';
              commitFlowUpdate((prev) => {
                const candidateId = allocateUniqueNodeId(prev.nodes);
                spawnedId = candidateId;
                const nextType: FlowNodeType =
                  sourceNode.type === 'start' || sourceNode.type === 'decision'
                    ? 'process'
                    : sourceNode.type;
                spawnedText = NODE_DEFAULT_LABELS[nextType];
                const rawX = draft.currX - 72;
                const rawY = draft.currY - 26;
                const newNode: FlowNode = {
                  id: candidateId,
                  type: nextType,
                  text: spawnedText,
                  x: snapToGridRef.current ? Math.round(rawX / 8) * 8 : rawX,
                  y: snapToGridRef.current ? Math.round(rawY / 8) * 8 : rawY,
                };
                const autoLabel = getSmartEdgeLabel(prev, sourceNode.id);
                return {
                  ...prev,
                  nodes: [...prev.nodes, newNode],
                  edges: [
                    ...prev.edges,
                    {
                      from: sourceNode.id,
                      to: candidateId,
                      ...(autoLabel ? { label: autoLabel } : {}),
                      ...(activeEdgeStyle !== 'solid'
                        ? { style: activeEdgeStyle }
                        : {}),
                      ...(activeEdgeArrow !== 'arrow'
                        ? { arrow: activeEdgeArrow }
                        : {}),
                    },
                  ],
                };
              });
              if (spawnedId) {
                setSelectedNodeId(spawnedId);
                setSelectedNodeIds([spawnedId]);
                setEditingNodeId(spawnedId);
                setEditingText(spawnedText);
              }
            }
          }
        }
      }

      // Commit transient node / subgraph drag once to Undo history & persistent state
      if (dragNodePositionsRef.current) {
        const finalPositions = dragNodePositionsRef.current;
        dragNodePositionsRef.current = null;
        setDragNodePositions(null);
        setSnapGuides(null);
        commitFlowUpdate((prev) => {
          let changed = false;
          const updatedNodes = prev.nodes.map((n) => {
            const pos = finalPositions[n.id];
            if (pos && (pos.x !== n.x || pos.y !== n.y)) {
              changed = true;
              return { ...n, x: pos.x, y: pos.y };
            }
            return n;
          });
          if (!changed) return prev;

          let nextState: FlowchartState = { ...prev, nodes: updatedNodes };

          // Drop-Node-on-Edge Splicing: if a single unconnected node was dropped onto an edge midpoint, splice it in!
          const movedIds = Object.keys(finalPositions);
          if (movedIds.length === 1) {
            const movedId = movedIds[0];
            const pos = finalPositions[movedId];
            const hasEdges = prev.edges.some(
              (e) => e.from === movedId || e.to === movedId
            );
            if (!hasEdges && pos) {
              const dropCenterX = pos.x + 72;
              const dropCenterY = pos.y + 26;
              const nodeLookup = new Map(updatedNodes.map((n) => [n.id, n]));
              const hitEdgeIdx = prev.edges.findIndex((edge) => {
                const fn = nodeLookup.get(edge.from);
                const tn = nodeLookup.get(edge.to);
                if (!fn || !tn) return false;
                const g = computeEdgeGeometry(fn, tn);
                return (
                  Math.hypot(dropCenterX - g.midX, dropCenterY - g.midY) <= 42
                );
              });
              if (hitEdgeIdx !== -1) {
                nextState = spliceExistingNodeOnEdge(
                  nextState,
                  hitEdgeIdx,
                  movedId
                );
              }
            }
          }

          return nextState;
        });
      }

      draggingNodeIdRef.current = null;
      draggingSubgraphRef.current = null;
      panningCanvasRef.current = null;
      cachedWrapperRectRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [commitFlowUpdate, createEdgeBetween, activeEdgeStyle, activeEdgeArrow]);

  const handleDuplicateNode = useCallback(
    (nodeId: string) => {
      const target = flowDataRef.current.nodes.find((n) => n.id === nodeId);
      if (!target) return;
      let duplicatedId = '';
      commitFlowUpdate((prev) => {
        const candidateId = allocateUniqueNodeId(prev.nodes);
        duplicatedId = candidateId;
        const clone: FlowNode = {
          ...target,
          id: candidateId,
          text: `${target.text} Copy`,
          x: target.x + 32,
          y: target.y + 32,
          ...(target.members ? { members: [...target.members] } : {}),
        };
        return {
          ...prev,
          nodes: [...prev.nodes, clone],
        };
      });
      if (duplicatedId) {
        setSelectedNodeId(duplicatedId);
        setSelectedNodeIds([duplicatedId]);
        onNotify('Duplicated Node', 'check', `${target.text} Copy`);
      }
    },
    [commitFlowUpdate, onNotify]
  );

  const handleBatchDeleteSelected = useCallback(() => {
    const idsToDelete = selectedNodeIdsRef.current;
    if (idsToDelete.length === 0) return;
    const deleteSet = new Set(idsToDelete);
    commitFlowUpdate((prev) => {
      const updatedSubgraphs = (prev.subgraphs || [])
        .map((sg) => ({
          ...sg,
          nodeIds: sg.nodeIds.filter((id) => !deleteSet.has(id)),
        }))
        .filter((sg) => sg.nodeIds.length > 0);
      const nextState: FlowchartState = {
        ...prev,
        nodes: prev.nodes.filter((n) => !deleteSet.has(n.id)),
        edges: prev.edges.filter(
          (e) => !deleteSet.has(e.from) && !deleteSet.has(e.to)
        ),
        ...(updatedSubgraphs.length > 0 ? { subgraphs: updatedSubgraphs } : {}),
      };
      if (updatedSubgraphs.length === 0) {
        delete nextState.subgraphs;
      }
      return nextState;
    });
    setSelectedNodeId(null);
    setSelectedNodeIds([]);
    onNotify(
      `Deleted ${idsToDelete.length} Nodes`,
      'check',
      'Removed selected nodes and their connectors'
    );
  }, [commitFlowUpdate, onNotify]);

  const handleAlignOrDistribute = useCallback(
    (mode: 'align-x' | 'align-y' | 'distribute') => {
      if (selectedNodeIdsRef.current.length < 2) return;
      commitFlowUpdate((prev) =>
        alignOrDistributeNodes(prev, selectedNodeIdsRef.current, mode)
      );
      const label =
        mode === 'align-x'
          ? 'Aligned Columns (X)'
          : mode === 'align-y'
            ? 'Aligned Rows (Y)'
            : 'Distributed Spacing Evenly';
      onNotify(label, 'check', `${selectedNodeIdsRef.current.length} nodes`);
    },
    [commitFlowUpdate, onNotify]
  );

  const handleBatchCycleColor = useCallback(() => {
    if (selectedNodeIdsRef.current.length === 0) return;
    const idSet = new Set(selectedNodeIdsRef.current);
    commitFlowUpdate((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => {
        if (!idSet.has(n.id)) return n;
        const currIdx = ACCENT_CYCLE.indexOf(n.color);
        const nextColor = ACCENT_CYCLE[(currIdx + 1) % ACCENT_CYCLE.length];
        if (!nextColor) {
          const { color: _removed, ...rest } = n;
          return rest;
        }
        return { ...n, color: nextColor };
      }),
    }));
  }, [commitFlowUpdate]);

  // Multi-Diagram Workspace Switcher Handlers
  const activeDiagram = useMemo(
    () =>
      savedDiagrams.find((d) => d.id === activeDiagramId) || savedDiagrams[0],
    [savedDiagrams, activeDiagramId]
  );

  const handleSelectDiagram = (diagramId: string) => {
    const target = savedDiagrams.find((d) => d.id === diagramId);
    if (!target) return;
    setActiveDiagramId(diagramId);
    activeDiagramIdRef.current = diagramId;
    historyRef.current = { past: [], future: [] };
    setHistoryTick((t) => t + 1);
    setSelectedNodeId(null);
    setSelectedNodeIds([]);
    setEditingEdgeIdx(null);
    setEditingNodeId(null);
    const cloned = JSON.parse(JSON.stringify(target.flowData)) as FlowchartState;
    flowDataRef.current = cloned;
    onChangeFlowData(cloned);
    onNotify(
      `Switched to "${target.title}"`,
      'check',
      `${cloned.nodes.length} nodes • ${cloned.edges.length} links`
    );
  };

  const handleCreateDiagram = () => {
    const nextNum = savedDiagrams.length + 1;
    const newId = `flow-${Date.now()}-${nextNum}`;
    const starterFlow: FlowchartState = {
      nodes: [
        { id: 'n1', type: 'start', text: 'Start Flow', x: 56, y: 48 },
        { id: 'n2', type: 'process', text: 'Next Step', x: 56, y: 152 },
      ],
      edges: [{ from: 'n1', to: 'n2' }],
    };
    const newItem: FlowDiagramItem = {
      id: newId,
      title: `Flowchart ${nextNum}`,
      flowData: starterFlow,
      updatedAt: Date.now(),
    };
    setSavedDiagrams((prev) => [...prev, newItem]);
    setActiveDiagramId(newId);
    activeDiagramIdRef.current = newId;
    historyRef.current = { past: [], future: [] };
    setHistoryTick((t) => t + 1);
    setSelectedNodeId('n2');
    setSelectedNodeIds(['n2']);
    flowDataRef.current = starterFlow;
    onChangeFlowData(starterFlow);
    onNotify('Created New Flowchart', 'check', newItem.title);
  };

  const handleDuplicateDiagram = () => {
    const sourceTitle = activeDiagram?.title || 'Flowchart';
    const newId = `flow-copy-${Date.now()}`;
    const clonedFlow = JSON.parse(
      JSON.stringify(flowDataRef.current)
    ) as FlowchartState;
    const copyItem: FlowDiagramItem = {
      id: newId,
      title: `${sourceTitle} Copy`,
      flowData: clonedFlow,
      updatedAt: Date.now(),
    };
    setSavedDiagrams((prev) => [...prev, copyItem]);
    setActiveDiagramId(newId);
    activeDiagramIdRef.current = newId;
    onNotify('Duplicated Flowchart', 'check', copyItem.title);
  };

  const handleRenameDiagram = (nextTitle: string) => {
    setSavedDiagrams((prev) =>
      prev.map((d) =>
        d.id === activeDiagramId ? { ...d, title: nextTitle } : d
      )
    );
  };

  const handleDeleteDiagram = (diagramId: string) => {
    if (savedDiagrams.length <= 1) return;
    const deletedDiagram = savedDiagrams.find((d) => d.id === diagramId);
    const deletedIdx = savedDiagrams.findIndex((d) => d.id === diagramId);
    const remaining = savedDiagrams.filter((d) => d.id !== diagramId);
    setSavedDiagrams(remaining);
    if (activeDiagramId === diagramId && remaining[0]) {
      handleSelectDiagram(remaining[0].id);
    }
    if (deletedDiagram) {
      onNotify(
        `Deleted "${deletedDiagram.title}"`,
        'check',
        'Flowchart removed from workspace',
        {
          variant: 'info',
          undoLabel: 'Undo',
          onUndo: () => {
            setSavedDiagrams((prev) => {
              if (prev.some((d) => d.id === deletedDiagram.id)) return prev;
              const next = [...prev];
              const insertAt =
                deletedIdx >= 0
                  ? Math.min(deletedIdx, next.length)
                  : next.length;
              next.splice(insertAt, 0, deletedDiagram);
              return next;
            });
            setActiveDiagramId(deletedDiagram.id);
            activeDiagramIdRef.current = deletedDiagram.id;
            historyRef.current = { past: [], future: [] };
            setHistoryTick((t) => t + 1);
            setSelectedNodeId(null);
            setSelectedNodeIds([]);
            flowDataRef.current = deletedDiagram.flowData;
            onChangeFlowData(deletedDiagram.flowData);
          },
        }
      );
    }
  };

  const handleInsertNodeOnEdge = (edgeIdx: number) => {
    let createdId = '';
    let createdText = '';
    commitFlowUpdate((prev) => {
      const candidateId = allocateUniqueNodeId(prev.nodes);
      const res = insertNodeOnEdge(
        prev,
        edgeIdx,
        candidateId,
        'process',
        'New Step'
      );
      if (!res) return prev;
      createdId = res.createdNode.id;
      createdText = res.createdNode.text;
      return res.state;
    });
    setEditingEdgeIdx(null);
    if (createdId) {
      setSelectedNodeId(createdId);
      setSelectedNodeIds([createdId]);
      setEditingNodeId(createdId);
      setEditingText(createdText);
      onNotify(
        'Inserted Step on Connector',
        'check',
        'Type to name the spliced node'
      );
    }
  };

  const handleCopyPNG = async () => {
    const { blob, dataUrl } = await renderFlowchartToPngData(flowData, 2);
    try {
      const ClipboardItemCtor = (
        window as unknown as {
          ClipboardItem?: new (items: Record<string, Blob>) => ClipboardItem;
        }
      ).ClipboardItem;
      if (blob && ClipboardItemCtor && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItemCtor({ 'image/png': blob }),
        ]);
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(dataUrl);
      }
      onNotify(
        'Copied Flowchart PNG',
        'check',
        'High-DPI diagram copied to clipboard'
      );
    } catch {
      onNotify(
        'Copied Flowchart PNG',
        'check',
        'High-DPI diagram ready'
      );
    }
  };

  // Global keyboard shortcuts (Escape, Ctrl+Z, Ctrl+Y, Ctrl+D, Ctrl+A, Delete/Backspace)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.body.hasAttribute('data-sideflow-modal-open')) {
        return;
      }

      if (e.key === 'Escape') {
        const hasTransientOverlay =
          connectMode ||
          marqueeMode ||
          Boolean(editingNodeId) ||
          editingEdgeIdx !== null ||
          Boolean(editingSubgraphId) ||
          Boolean(compartmentNodeId) ||
          Boolean(draftConnection);

        setConnectMode(false);
        setConnectSourceNodeId(null);
        setMarqueeMode(false);
        setMarqueeBox(null);
        setEditingNodeId(null);
        setEditingEdgeIdx(null);
        setEditingSubgraphId(null);
        setCompartmentNodeId(null);
        setDraftConnection(null);

        if (!hasTransientOverlay) {
          setSelectedNodeIds([]);
          setSelectedNodeId(null);
        }
        return;
      }

      const target = e.target as HTMLElement | null;
      const isEditable =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if (isEditable) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        const allIds = flowDataRef.current.nodes.map((n) => n.id);
        setSelectedNodeIds(allIds);
        setSelectedNodeId(allIds[0] || null);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }

      if (
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === 'd' &&
        selectedNodeId
      ) {
        e.preventDefault();
        handleDuplicateNode(selectedNodeId);
        return;
      }

      if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        selectedNodeIdsRef.current.length > 1
      ) {
        e.preventDefault();
        handleBatchDeleteSelected();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    connectMode,
    marqueeMode,
    editingNodeId,
    editingEdgeIdx,
    editingSubgraphId,
    compartmentNodeId,
    draftConnection,
    handleUndo,
    handleRedo,
    handleDuplicateNode,
    handleBatchDeleteSelected,
    selectedNodeId,
  ]);

  const handleAddNode = (type: FlowNodeType) => {
    let createdId = '';
    commitFlowUpdate((prev) => {
      const candidateId = allocateUniqueNodeId(prev.nodes);
      createdId = candidateId;

      if (prev.diagramType === 'sequenceDiagram') {
        const newNode: FlowNode = {
          id: candidateId,
          type,
          text:
            type === 'circle' || type === 'start'
              ? `Actor ${prev.nodes.length + 1}`
              : `Service ${prev.nodes.length + 1}`,
          x: 35 + prev.nodes.length * 175,
          y: 35,
        };
        return {
          ...prev,
          nodes: [...prev.nodes, newNode],
        };
      }

      // Find first non-overlapping grid slot
      let spawnX = 40;
      let spawnY = 40;
      for (let slot = 0; slot < 24; slot++) {
        const col = slot % 2;
        const row = Math.floor(slot / 2);
        const cx = 40 + col * 210;
        const cy = 40 + row * 95;
        const overlaps = prev.nodes.some(
          (n) => Math.abs(n.x - cx) < 120 && Math.abs(n.y - cy) < 48
        );
        if (!overlaps) {
          spawnX = cx;
          spawnY = cy;
          break;
        }
        spawnX = 40 + ((slot + 1) % 3) * 150;
        spawnY = 40 + Math.floor((slot + 1) / 3) * 85;
      }

      const newNode: FlowNode = {
        id: candidateId,
        type,
        text: NODE_DEFAULT_LABELS[type],
        x: spawnX,
        y: spawnY,
      };

      return {
        ...prev,
        nodes: [...prev.nodes, newNode],
      };
    });
    if (createdId) {
      setSelectedNodeId(createdId);
      setSelectedNodeIds([createdId]);
    }
  };

  const handleChangeNodeShape = (nodeId: string, nextType: FlowNodeType) => {
    commitFlowUpdate((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) =>
        n.id === nodeId ? { ...n, type: nextType } : n
      ),
    }));
  };

  const handleSetNodeColor = (
    nodeId: string,
    nextColor: AccentColor | undefined
  ) => {
    commitFlowUpdate((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => {
        if (n.id !== nodeId) return n;
        if (!nextColor) {
          const { color: _removed, ...rest } = n;
          return rest;
        }
        return { ...n, color: nextColor };
      }),
    }));
  };

  const handleSetGlobalEdgeCurve = (nextCurve: FlowEdgeCurve) => {
    commitFlowUpdate((prev) => {
      const nextState: FlowchartState = {
        ...prev,
        ...(nextCurve === 'bezier'
          ? { edgeCurve: undefined }
          : { edgeCurve: nextCurve }),
      };
      if (nextCurve === 'bezier') {
        delete nextState.edgeCurve;
      }
      return nextState;
    });
  };

  const handleAddSubgraph = (explicitNodeIds?: string[]) => {
    commitFlowUpdate((prev) => {
      const existingSubgraphs = prev.subgraphs || [];
      const existingSgIds = new Set(existingSubgraphs.map((s) => s.id));
      let sgId = `sg_${existingSubgraphs.length + subgraphCounterRef.current}`;
      while (existingSgIds.has(sgId)) {
        subgraphCounterRef.current += 1;
        sgId = `sg_${existingSubgraphs.length + subgraphCounterRef.current}`;
      }
      const sgTitle = `Subgraph ${existingSubgraphs.length + 1}`;

      const preferredIds =
        explicitNodeIds && explicitNodeIds.length > 0
          ? explicitNodeIds
          : selectedNodeIdsRef.current.length > 1
            ? selectedNodeIdsRef.current
            : [];

      const alreadyGroupedIds = new Set(
        existingSubgraphs.flatMap((s) => s.nodeIds)
      );
      const ungroupedNodes = prev.nodes.filter(
        (n) => !alreadyGroupedIds.has(n.id)
      );

      let nextNodes = prev.nodes;
      let memberIds: string[];

      if (preferredIds.length > 0) {
        memberIds = preferredIds;
      } else if (ungroupedNodes.length > 0) {
        memberIds = ungroupedNodes.slice(-2).map((n) => n.id);
      } else if (prev.nodes.length > 0) {
        memberIds = prev.nodes.slice(-2).map((n) => n.id);
      } else {
        const id1 = `n${nodeCounterRef.current++}`;
        const id2 = `n${nodeCounterRef.current++}`;
        nextNodes = [
          { id: id1, type: 'process', text: 'Service A', x: 50, y: 60 },
          { id: id2, type: 'database', text: 'Store B', x: 230, y: 60 },
        ];
        memberIds = [id1, id2];
      }

      const newSubgraph: FlowSubgraph = {
        id: sgId,
        title: sgTitle,
        nodeIds: memberIds,
      };

      return {
        ...prev,
        nodes: nextNodes,
        subgraphs: [...existingSubgraphs, newSubgraph],
      };
    });
    onNotify(
      'Created Mermaid Subgraph',
      'check',
      'Drag subgraph header to move grouped nodes'
    );
  };

  const handleRemoveSubgraph = (subgraphId: string) => {
    commitFlowUpdate((prev) => {
      const remaining = (prev.subgraphs || []).filter(
        (s) => s.id !== subgraphId
      );
      const nextState: FlowchartState = {
        ...prev,
        ...(remaining.length > 0 ? { subgraphs: remaining } : {}),
      };
      if (remaining.length === 0) {
        delete nextState.subgraphs;
      }
      return nextState;
    });
  };

  const commitEditingSubgraph = (subgraphId: string) => {
    const trimmed = editingSubgraphTitle.trim();
    if (trimmed) {
      commitFlowUpdate((prev) => ({
        ...prev,
        subgraphs: (prev.subgraphs || []).map((sg) =>
          sg.id === subgraphId ? { ...sg, title: trimmed } : sg
        ),
      }));
    }
    setEditingSubgraphId(null);
  };

  const handleCycleNodeColor = (nodeId: string) => {
    commitFlowUpdate((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => {
        if (n.id !== nodeId) return n;
        const currIdx = ACCENT_CYCLE.indexOf(n.color);
        const nextColor = ACCENT_CYCLE[(currIdx + 1) % ACCENT_CYCLE.length];
        if (!nextColor) {
          const { color: _removed, ...rest } = n;
          return rest;
        }
        return { ...n, color: nextColor };
      }),
    }));
  };

  const handleSetDirection = (dir: FlowDirection) => {
    commitFlowUpdate((prev) => {
      const nextState: FlowchartState = {
        ...prev,
        ...(dir === 'TD' ? { direction: undefined } : { direction: dir }),
      };
      if (dir === 'TD') {
        delete nextState.direction;
      }
      return nextState;
    });
    onNotify(
      `Flow Direction: ${dir}`,
      'check',
      `Mermaid direction set to ${dir}`
    );
  };

  const handleChangeDiagramType = (nextType: MermaidDiagramType) => {
    commitFlowUpdate((prev) => {
      const nextState: FlowchartState = {
        ...prev,
        ...(nextType === 'flowchart'
          ? { diagramType: undefined }
          : { diagramType: nextType }),
      };
      if (nextType === 'flowchart') {
        delete nextState.diagramType;
      }
      nextState.nodes = computeDagLayout(nextState);
      return nextState;
    });
    onNotify(
      `Diagram Mode: ${nextType}`,
      'check',
      `Switched Mermaid syntax to ${nextType}`
    );
  };

  const handleSelectTemplate = (templateId: string) => {
    if (!templateId) return;
    const presetState = getMermaidTemplatePreset(
      templateId as MermaidTemplateId
    );
    const presetMeta = MERMAID_TEMPLATES.find((t) => t.id === templateId);
    if (!presetState || !presetMeta) return;

    commitFlowUpdate(presetState);
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
    onNotify(
      `Loaded Template: ${presetMeta.name}`,
      'check',
      `${presetState.nodes.length} nodes • ${presetState.edges.length} links`
    );
  };

  const handleAutoAlign = () => {
    if (flowData.nodes.length === 0) return;
    const dir = flowData.direction || 'TD';
    commitFlowUpdate((prev) => ({
      ...prev,
      nodes: computeDagLayout(prev),
    }));
    onNotify(
      'Auto-Aligned Flowchart',
      'check',
      `Arranged nodes into ${dir} hierarchical layout`
    );
  };

  const handleDeleteNode = (nodeId: string) => {
    commitFlowUpdate((prev) => {
      const updatedSubgraphs = (prev.subgraphs || [])
        .map((sg) => ({
          ...sg,
          nodeIds: sg.nodeIds.filter((id) => id !== nodeId),
        }))
        .filter((sg) => sg.nodeIds.length > 0);

      const nextState: FlowchartState = {
        ...prev,
        nodes: prev.nodes.filter((n) => n.id !== nodeId),
        edges: prev.edges.filter((e) => e.from !== nodeId && e.to !== nodeId),
        ...(updatedSubgraphs.length > 0
          ? { subgraphs: updatedSubgraphs }
          : {}),
      };
      if (updatedSubgraphs.length === 0) {
        delete nextState.subgraphs;
      }
      return nextState;
    });
    if (connectSourceNodeId === nodeId) {
      setConnectSourceNodeId(null);
    }
    if (compartmentNodeId === nodeId) {
      setCompartmentNodeId(null);
    }
    if (selectedNodeId === nodeId) {
      setSelectedNodeId(null);
    }
    setSelectedNodeIds((prev) => prev.filter((id) => id !== nodeId));
  };

  const handleSetNodeStereotype = (nodeId: string, rawStereotype: string) => {
    const cleanStereo = rawStereotype.trim();
    commitFlowUpdate((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => {
        if (n.id !== nodeId) return n;
        if (!cleanStereo) {
          const { stereotype: _removed, ...rest } = n;
          return rest;
        }
        return { ...n, stereotype: cleanStereo };
      }),
    }));
  };

  const handleAddNodeMember = (nodeId: string, overrideMember?: string) => {
    const trimmed = (overrideMember ?? newMemberInput).trim();
    if (!trimmed) return;
    commitFlowUpdate((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => {
        if (n.id !== nodeId) return n;
        return {
          ...n,
          members: [...(n.members || []), trimmed],
        };
      }),
    }));
    if (overrideMember === undefined) {
      setNewMemberInput('');
    }
  };

  const handleUpdateNodeMember = (
    nodeId: string,
    memberIdx: number,
    nextValue: string
  ) => {
    commitFlowUpdate((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => {
        if (n.id !== nodeId) return n;
        const current = n.members || [];
        const updated = current
          .map((m, idx) => (idx === memberIdx ? nextValue : m))
          .filter((m) => m.trim().length > 0);
        if (updated.length === 0) {
          const { members: _removed, ...rest } = n;
          return rest;
        }
        return { ...n, members: updated };
      }),
    }));
  };

  const handleRemoveNodeMember = (nodeId: string, memberIdx: number) => {
    commitFlowUpdate((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => {
        if (n.id !== nodeId) return n;
        const updated = (n.members || []).filter((_, idx) => idx !== memberIdx);
        if (updated.length === 0) {
          const { members: _removed, ...rest } = n;
          return rest;
        }
        return { ...n, members: updated };
      }),
    }));
  };

  const handleDeleteEdge = (index: number) => {
    commitFlowUpdate((prev) => ({
      ...prev,
      edges: prev.edges.filter((_, idx) => idx !== index),
    }));
    if (editingEdgeIdx === index) {
      setEditingEdgeIdx(null);
    }
  };

  const startEditingEdge = (
    index: number,
    currentLabel?: string,
    currentStyle?: FlowEdgeStyle,
    currentArrow?: FlowEdgeArrow,
    currentCardinality?: string,
    currentCurve?: FlowEdgeCurve
  ) => {
    setEditingEdgeIdx(index);
    setEditingEdgeLabel(currentLabel || '');
    setEditingEdgeStyle(currentStyle || 'solid');
    setEditingEdgeArrow(currentArrow || 'arrow');
    setEditingEdgeCardinality(currentCardinality || '');
    setEditingEdgeCurve(currentCurve || currentEdgeCurve);
  };

  const commitEditingEdge = (
    index: number,
    overrideStyle?: FlowEdgeStyle,
    overrideArrow?: FlowEdgeArrow,
    overrideCardinality?: string,
    overrideCurve?: FlowEdgeCurve,
    overrideLabel?: string,
    keepOpen = false
  ) => {
    const trimmed = (
      overrideLabel !== undefined ? overrideLabel : editingEdgeLabel
    ).trim();
    const finalCardinality = (
      overrideCardinality !== undefined
        ? overrideCardinality
        : editingEdgeCardinality
    ).trim();
    const inferredStyle: FlowEdgeStyle | undefined =
      overrideCardinality !== undefined && finalCardinality
        ? finalCardinality.includes('..')
          ? 'dotted'
          : 'solid'
        : undefined;
    const finalStyle = overrideStyle ?? inferredStyle ?? editingEdgeStyle;
    const finalArrow = overrideArrow ?? editingEdgeArrow;
    const finalCurve = overrideCurve ?? editingEdgeCurve;
    commitFlowUpdate((prev) => ({
      ...prev,
      edges: prev.edges.map((edge, idx) => {
        if (idx !== index) return edge;
        const updated = {
          from: edge.from,
          to: edge.to,
          ...(trimmed ? { label: trimmed } : {}),
          ...(finalStyle !== 'solid' ? { style: finalStyle } : {}),
          ...(finalArrow !== 'arrow' ? { arrow: finalArrow } : {}),
          ...(finalCardinality ? { cardinality: finalCardinality } : {}),
          ...(finalCurve && finalCurve !== 'bezier'
            ? { curve: finalCurve }
            : {}),
        };
        return updated;
      }),
    }));
    if (!keepOpen) {
      setEditingEdgeIdx(null);
    }
  };

  const handlePortMouseDown = (
    e: React.MouseEvent<HTMLButtonElement>,
    node: FlowNode,
    port: FlowPortDirection
  ) => {
    e.stopPropagation();
    const dim = getNodeDimensions(node);
    const startX =
      port === 'left'
        ? node.x
        : port === 'right'
          ? node.x + dim.width
          : node.x + dim.width / 2;
    const startY =
      port === 'top'
        ? node.y
        : port === 'bottom'
          ? node.y + dim.height
          : node.y + dim.height / 2;

    if (canvasWrapperRef.current) {
      cachedWrapperRectRef.current =
        canvasWrapperRef.current.getBoundingClientRect();
    }
    setDraftConnection({
      sourceId: node.id,
      port,
      startX,
      startY,
      currX: startX,
      currY: startY,
      hoverTargetId: null,
    });
  };

  const handleNodeMouseDown = (
    e: React.MouseEvent<HTMLDivElement>,
    node: FlowNode
  ) => {
    if (editingNodeId === node.id) return;

    if (connectMode) {
      e.stopPropagation();
      setSelectedNodeId(node.id);
      if (!connectSourceNodeId) {
        setConnectSourceNodeId(node.id);
      } else if (connectSourceNodeId !== node.id) {
        createEdgeBetween(connectSourceNodeId, node.id);
      }
      return;
    }

    // Shift+Click toggles multi-selection membership
    if (e.shiftKey) {
      e.stopPropagation();
      setSelectedNodeId(node.id);
      setSelectedNodeIds((prev) =>
        prev.includes(node.id)
          ? prev.filter((id) => id !== node.id)
          : [...prev, node.id]
      );
      return;
    }

    // Group Dragging if clicking a node that is already part of a multi-selection
    if (
      selectedNodeIdsRef.current.length > 1 &&
      selectedNodeIdsRef.current.includes(node.id)
    ) {
      setSelectedNodeId(node.id);
      const initialPositions: Record<string, { x: number; y: number }> = {};
      const selSet = new Set(selectedNodeIdsRef.current);
      for (const n of flowData.nodes) {
        if (selSet.has(n.id)) {
          initialPositions[n.id] = { x: n.x, y: n.y };
        }
      }
      draggingSubgraphRef.current = {
        id: '__multi_select__',
        startClientX: e.clientX,
        startClientY: e.clientY,
        initialPositions,
      };
      return;
    }

    setSelectedNodeId(node.id);
    setSelectedNodeIds([node.id]);

    draggingNodeIdRef.current = node.id;
    const wrapperRect = canvasWrapperRef.current?.getBoundingClientRect();
    if (wrapperRect) {
      cachedWrapperRectRef.current = wrapperRect;
      dragOffsetRef.current = {
        x:
          (e.clientX - wrapperRect.left - panOffset.x) / zoomLevel - node.x,
        y:
          (e.clientY - wrapperRect.top - panOffset.y) / zoomLevel - node.y,
      };
    }
  };

  const handleNodeKeyDown = (
    e: React.KeyboardEvent<HTMLDivElement>,
    node: FlowNode
  ) => {
    if (editingNodeId === node.id || e.target !== e.currentTarget) return;

    // Alt+Enter or Ctrl/Cmd+Enter quick-branches a connected node in the current flow direction
    // (Plain Tab / Shift+Tab navigates focus naturally across nodes & controls per WCAG 2.1.2)
    if (e.key === 'Enter' && (e.altKey || e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleQuickAddDirection(node, directionToPort(currentDirection));
      return;
    }

    const step = e.shiftKey ? 20 : 10;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
      const dx =
        e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0;
      const dy =
        e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0;
      commitFlowUpdate((prev) => ({
        ...prev,
        nodes: prev.nodes.map((n) =>
          n.id === node.id
            ? {
                ...n,
                x: n.x + dx,
                y: n.y + dy,
              }
            : n
        ),
      }));
      return;
    }

    if (e.key === 'Enter' || e.key === ' ' || e.key === 'F2') {
      e.preventDefault();
      if (connectMode) {
        if (!connectSourceNodeId) {
          setConnectSourceNodeId(node.id);
        } else if (connectSourceNodeId !== node.id) {
          createEdgeBetween(connectSourceNodeId, node.id);
        }
      } else {
        startEditingNode(node);
      }
      return;
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      handleDeleteNode(node.id);
      return;
    }

    // Type-on-Select: typing any printable character immediately begins inline editing
    if (
      e.key.length === 1 &&
      !e.ctrlKey &&
      !e.altKey &&
      !e.metaKey &&
      !connectMode
    ) {
      e.preventDefault();
      setEditingNodeId(node.id);
      setEditingText(e.key);
    }
  };

  const startEditingNode = (node: FlowNode) => {
    setSelectedNodeId(node.id);
    setEditingNodeId(node.id);
    setEditingText(node.text);
  };

  const commitEditingNode = (nodeId: string) => {
    const trimmed = editingText.trim();
    if (trimmed) {
      commitFlowUpdate((prev) => ({
        ...prev,
        nodes: prev.nodes.map((n) =>
          n.id === nodeId ? { ...n, text: trimmed } : n
        ),
      }));
    }
    setEditingNodeId(null);
  };

  const toggleConnectMode = () => {
    setConnectMode((prev) => !prev);
    setConnectSourceNodeId(null);
    setEditingNodeId(null);
  };

  const handleApplyLiveMermaid = () => {
    const parsed = parseMermaidCode(liveMermaidInput, flowData.nodes);
    if (!parsed) {
      setLiveParseError(
        'Could not parse Mermaid code. Include at least one valid node or edge.'
      );
      return;
    }
    setLiveParseError(null);
    commitFlowUpdate({
      ...parsed,
      nodes: computeDagLayout(parsed),
    });
    onNotify(
      'Synced Live Mermaid Code',
      'check',
      `${parsed.nodes.length} nodes • ${parsed.edges.length} links`
    );
  };

  const handleResetDemo = () => {
    commitFlowUpdate(JSON.parse(JSON.stringify(defaultFlowData)));
    setConnectMode(false);
    setConnectSourceNodeId(null);
    setSelectedNodeId(null);
    setSelectedNodeIds([]);
    setEditingEdgeIdx(null);
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
    onNotify('Restored Demo Flowchart', 'check', '4 nodes • 3 connections');
  };

  const handleClearCanvas = () => {
    const previousState = JSON.parse(
      JSON.stringify(flowDataRef.current)
    ) as FlowchartState;
    commitFlowUpdate({ nodes: [], edges: [] });
    setConnectMode(false);
    setConnectSourceNodeId(null);
    setSelectedNodeId(null);
    setSelectedNodeIds([]);
    setEditingEdgeIdx(null);
    onNotify('Cleared Flowchart Canvas', 'check', 'Ready for a new diagram', {
      variant: 'info',
      undoLabel: 'Undo',
      onUndo: () => {
        commitFlowUpdate(previousState);
      },
    });
  };

  const handleExportSVG = () => {
    const svgString = generateStandaloneSVG(flowData);
    try {
      const blob = new Blob([svgString], {
        type: 'image/svg+xml;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'sideflow-flowchart.svg';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      onNotify(
        'Downloaded Flowchart SVG',
        'check',
        'Saved as sideflow-flowchart.svg'
      );
    } catch {
      setIsLucidModalOpen(true);
    }
  };

  const handleCanvasWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.12 : -0.12;
      const nextZoom = Math.min(
        2.25,
        Math.max(0.35, Math.round((zoomLevel + delta) * 100) / 100)
      );
      if (nextZoom === zoomLevel) return;
      const rect = canvasWrapperRef.current?.getBoundingClientRect();
      if (rect) {
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const scaleRatio = nextZoom / zoomLevel;
        setPanOffset((prev) => ({
          x: Math.round(mouseX - (mouseX - prev.x) * scaleRatio),
          y: Math.round(mouseY - (mouseY - prev.y) * scaleRatio),
        }));
      }
      setZoomLevel(nextZoom);
    } else {
      setPanOffset((prev) => ({
        x: Math.round(prev.x - e.deltaX),
        y: Math.round(prev.y - e.deltaY),
      }));
    }
  };

  const sourceNode = connectSourceNodeId
    ? nodesById.get(connectSourceNodeId)?.node || null
    : null;

  const selectedNode = selectedNodeId
    ? nodesById.get(selectedNodeId)?.node || null
    : null;

  const activeOpPreview = isSequenceDiagram
    ? formatSequenceMessageOperator(activeEdgeStyle, activeEdgeArrow)
    : formatMermaidEdgeOperator(activeEdgeStyle, activeEdgeArrow);

  const statusMessage = connectMode
    ? sourceNode
      ? `Selected "${sourceNode.text}". Click destination node (${activeOpPreview}) or Esc to cancel.`
      : `Click source node first, then destination node (${activeOpPreview}, Esc to cancel).`
    : "Click '+' on any node or press Alt+Enter to quick-branch • Drag ports to connect";

  const subgraphBoundsList = useMemo(
    () =>
      (flowData.subgraphs || [])
        .map((sg) => computeSubgraphBounds(sg, effectiveNodes))
        .filter((b): b is NonNullable<typeof b> => b !== null),
    [flowData.subgraphs, effectiveNodes]
  );

  const canUndo = historyRef.current.past.length > 0;
  const canRedo = historyRef.current.future.length > 0;

  // Compute live rubber-band SVG path during port drag
  const draftConnectionPath = useMemo(() => {
    if (!draftConnection) return null;
    const { startX, startY, currX, currY, port } = draftConnection;
    if (currentEdgeCurve === 'straight') {
      return `M ${startX} ${startY} L ${currX} ${currY}`;
    }
    if (currentEdgeCurve === 'orthogonal') {
      if (port === 'top' || port === 'bottom') {
        const midY = Math.round((startY + currY) / 2);
        return `M ${startX} ${startY} L ${startX} ${midY} L ${currX} ${midY} L ${currX} ${currY}`;
      }
      const midX = Math.round((startX + currX) / 2);
      return `M ${startX} ${startY} L ${midX} ${startY} L ${midX} ${currY} L ${currX} ${currY}`;
    }
    const dx = currX - startX;
    const dy = currY - startY;
    if (port === 'top' || port === 'bottom') {
      const offset =
        Math.max(Math.abs(dy) * 0.45, 24) * (port === 'bottom' ? 1 : -1);
      return `M ${startX} ${startY} C ${startX} ${startY + offset}, ${currX} ${currY - offset}, ${currX} ${currY}`;
    }
    const offset =
      Math.max(Math.abs(dx) * 0.45, 24) * (port === 'right' ? 1 : -1);
    return `M ${startX} ${startY} C ${startX + offset} ${startY}, ${currX - offset} ${currY}, ${currX} ${currY}`;
  }, [draftConnection, currentEdgeCurve]);

  return (
    <section
      id="tab-flowchart"
      data-layout-mode={layoutMode}
      data-panel-width-percent={panelWidthPercent}
      aria-label="Flowchart Scratchpad"
      className="tab-content flex-1 flex flex-col overflow-hidden"
    >
      {/* Primary Flowchart Toolbar */}
      <div
        className={`${
          layoutMode === 'compact' ? 'px-2.5 py-1.5' : 'p-3'
        } border-b border-slate-800 bg-slate-950/50 flex flex-wrap items-center justify-between gap-2`}
      >
        <div className="flex items-center gap-1.5 flex-wrap">
          {layoutMode === 'expanded' && (
            <button
              type="button"
              data-testid="toggle-studio-sidebar-btn"
              aria-label="Toggle Flowchart Studio Sidebar"
              aria-pressed={isStudioSidebarOpen}
              onClick={() => setIsStudioSidebarOpen((prev) => !prev)}
              title="Toggle Studio Stencil & Inspector Dock"
              className={`p-1.5 rounded-lg border text-xs transition ${
                isStudioSidebarOpen
                  ? 'bg-indigo-600/30 border-indigo-400/50 text-indigo-200'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {isStudioSidebarOpen ? (
                <PanelLeftClose className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <PanelLeftOpen className="w-3.5 h-3.5" aria-hidden="true" />
              )}
            </button>
          )}
          <button
            type="button"
            data-testid="toggle-diagram-switcher-btn"
            aria-label="Toggle Flowchart Diagrams Workspace"
            aria-pressed={isDiagramSwitcherOpen}
            onClick={() => setIsDiagramSwitcherOpen((prev) => !prev)}
            title="Switch, Create, Duplicate or Rename Saved Flowcharts"
            className={`px-2 py-1.5 rounded-lg border text-xs flex items-center gap-1.5 transition ${
              isDiagramSwitcherOpen
                ? 'bg-indigo-600/30 border-indigo-400/60 text-indigo-200'
                : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-indigo-400" aria-hidden="true" />
            <span
              data-testid="active-diagram-title"
              className="max-w-[110px] truncate font-medium"
            >
              {activeDiagram?.title || 'Flowcharts'}
            </span>
            <span className="px-1 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-indigo-300">
              {savedDiagrams.length}
            </span>
          </button>
          {!(layoutMode === 'expanded' && isStudioSidebarOpen) && (
            <>
              <button
                type="button"
                onClick={() => handleAddNode('process')}
                title="Add Process Box"
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-sky-300 flex items-center gap-1 transition"
              >
                <Square className="w-3.5 h-3.5" aria-hidden="true" /> Process
              </button>
              <button
                type="button"
                onClick={() => handleAddNode('decision')}
                title="Add Decision Diamond"
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-amber-300 flex items-center gap-1 transition"
              >
                <Diamond className="w-3.5 h-3.5" aria-hidden="true" /> Decision
              </button>
              <button
                type="button"
                onClick={() => handleAddNode('start')}
                title="Add Start/End Pill"
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-emerald-300 flex items-center gap-1 transition"
              >
                <CircleDot className="w-3.5 h-3.5" aria-hidden="true" /> Terminal
              </button>
            </>
          )}
          <button
            type="button"
            id="connect-mode-btn"
            aria-pressed={connectMode}
            onClick={toggleConnectMode}
            title="Connect two nodes with an arrow"
            className={
              connectMode
                ? 'px-2.5 py-1.5 rounded-lg bg-indigo-600 text-xs text-white flex items-center gap-1 transition shadow'
                : 'px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-slate-300 flex items-center gap-1 transition'
            }
          >
            <GitCommit className="w-3.5 h-3.5" aria-hidden="true" />
            <span id="connect-btn-label">
              {connectMode ? 'Connecting...' : 'Connect'}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-1 flex-wrap">
          <button
            type="button"
            onClick={handleUndo}
            disabled={!canUndo}
            aria-label="Undo Flowchart Edit"
            title="Undo Flowchart Edit (Ctrl+Z)"
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 text-xs"
          >
            <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={handleRedo}
            disabled={!canRedo}
            aria-label="Redo Flowchart Edit"
            title="Redo Flowchart Edit (Ctrl+Y)"
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 text-xs"
          >
            <Redo2 className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            data-testid="marquee-mode-btn"
            aria-label="Toggle Multi-Select Marquee Box"
            aria-pressed={marqueeMode}
            onClick={() => setMarqueeMode((prev) => !prev)}
            title="Marquee Box Multi-Select (or Shift+Drag on canvas)"
            className={`w-7 h-7 flex items-center justify-center rounded-lg text-xs transition ${
              marqueeMode
                ? 'bg-cyan-500/30 border border-cyan-400/60 text-cyan-200'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
            }`}
          >
            <BoxSelect className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setIsLiveCodeOpen((prev) => !prev)}
            aria-label="Toggle Live Mermaid Editor"
            aria-pressed={isLiveCodeOpen}
            title="Toggle Live Mermaid Code Drawer"
            className={`w-7 h-7 flex items-center justify-center rounded-lg text-xs transition ${
              isLiveCodeOpen
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={handleAutoAlign}
            aria-label="Auto-Align Nodes"
            title="Auto-Layout Nodes (Hierarchical DAG)"
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
          >
            <LayoutGrid className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={handleResetDemo}
            aria-label="Reset Demo Flowchart"
            title="Reset Demo Flowchart"
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={handleClearCanvas}
            aria-label="Clear Canvas"
            title="Clear Canvas"
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-rose-950 hover:text-rose-300 text-slate-300 text-xs"
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setIsLucidModalOpen(true)}
            className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-medium flex items-center gap-1.5 transition"
          >
            <Share2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Lucidchart Sync</span>
          </button>
        </div>
      </div>

      {/* Multi-Diagram Workspace Switcher Drawer */}
      {isDiagramSwitcherOpen && (
        <div
          data-testid="flow-diagram-switcher"
          aria-label="Saved Flowcharts Workspace"
          className="px-3 py-2 border-b border-indigo-500/30 bg-slate-950/95 space-y-2 text-xs"
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 flex-1 min-w-[180px]">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-300 shrink-0">
                Active Title:
              </span>
              <input
                type="text"
                data-testid="rename-diagram-input"
                aria-label="Rename active flowchart"
                value={activeDiagram?.title || ''}
                onChange={(e) => handleRenameDiagram(e.target.value)}
                placeholder="Flowchart title..."
                className="flex-1 max-w-xs bg-slate-900 border border-slate-700 focus:border-indigo-500 rounded-md px-2 py-1 text-xs text-white focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                data-testid="new-diagram-btn"
                onClick={handleCreateDiagram}
                className="min-h-[26px] px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-medium flex items-center gap-1 transition"
              >
                <Plus className="w-3 h-3" aria-hidden="true" /> New Flowchart
              </button>
              <button
                type="button"
                data-testid="duplicate-diagram-btn"
                onClick={handleDuplicateDiagram}
                className="min-h-[26px] px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[11px] flex items-center gap-1 transition"
              >
                <Copy className="w-3 h-3" aria-hidden="true" /> Duplicate
              </button>
            </div>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {savedDiagrams.map((d) => {
              const isCurrent = d.id === activeDiagram?.id;
              return (
                <div
                  key={d.id}
                  data-testid={`flow-diagram-card-${d.id}`}
                  onClick={() => handleSelectDiagram(d.id)}
                  className={`group flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border cursor-pointer shrink-0 transition ${
                    isCurrent
                      ? 'bg-indigo-600/25 border-indigo-400 text-white'
                      : 'bg-slate-900/90 hover:bg-slate-800 border-slate-800 text-slate-300'
                  }`}
                >
                  <button
                    type="button"
                    aria-pressed={isCurrent}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelectDiagram(d.id);
                    }}
                    className="min-w-0 text-left rounded px-0.5"
                  >
                    <div className="text-[11px] font-medium truncate max-w-[140px]">
                      {d.title}
                    </div>
                    <div className="text-[10px] font-mono text-slate-400">
                      {d.flowData.nodes.length} nodes • {d.flowData.edges.length}{' '}
                      links
                    </div>
                  </button>
                  {savedDiagrams.length > 1 && (
                    <button
                      type="button"
                      data-testid={`delete-diagram-btn-${d.id}`}
                      aria-label={`Delete flowchart ${d.title}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteDiagram(d.id);
                      }}
                      className="w-6 h-6 flex items-center justify-center rounded hover:bg-rose-600/80 text-slate-400 hover:text-white transition"
                    >
                      <Trash2 className="w-3 h-3" aria-hidden="true" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Secondary Mermaid Primitives Bar: Extra Shapes, Subgraphs, Diagram Type, Templates, Routing & Direction */}
      <div
        id="flow-primitives-bar"
        className={`${
          layoutMode === 'compact' ? 'px-2.5 py-1' : 'px-3 py-1.5'
        } border-b border-slate-800/80 bg-slate-900/60 flex flex-wrap items-center justify-between gap-2 text-[11px]`}
      >
        {/* Additional Mermaid Node Shapes + Subgraph Group (De-duplicated when Studio Sidebar is open) */}
        <div
          role="group"
          aria-label="Additional Mermaid Shapes"
          className="flex items-center gap-1 flex-wrap"
        >
          {!(layoutMode === 'expanded' && isStudioSidebarOpen) &&
            EXTRA_SHAPE_BUTTONS.map(
              ({ type, label, title, colorClass, Icon }) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleAddNode(type)}
                  title={title}
                  className={`min-h-[24px] px-2 py-0.5 rounded-md bg-slate-800/90 hover:bg-slate-700 border border-slate-700/80 ${colorClass} flex items-center gap-1 transition`}
                >
                  <Icon className="w-3 h-3" aria-hidden="true" />
                  <span>{label}</span>
                </button>
              )
            )}
          <button
            type="button"
            onClick={() => handleAddSubgraph()}
            aria-label="Add Subgraph Group"
            title="Wrap nodes in a Mermaid subgraph ... end container"
            className="min-h-[24px] px-2 py-0.5 rounded-md bg-slate-800/90 hover:bg-slate-700 border border-dashed border-slate-600 text-slate-200 flex items-center gap-1 transition"
          >
            <BoxSelect className="w-3 h-3 text-indigo-300" aria-hidden="true" />
            <span>Subgraph</span>
          </button>
        </div>

        {/* Diagram Mode + Templates + Edge Style/Arrow/Curve + Flow Direction Controls */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <select
            aria-label="Mermaid Diagram Type"
            title="Mermaid Diagram Syntax Mode"
            value={currentDiagramType}
            onChange={(e) =>
              handleChangeDiagramType(e.target.value as MermaidDiagramType)
            }
            className="min-h-[24px] bg-slate-800 border border-indigo-500/40 text-indigo-200 rounded-md px-1.5 py-0.5 text-[11px] font-medium focus:outline-none focus:border-indigo-500"
          >
            <option value="flowchart">Flowchart</option>
            <option value="stateDiagram-v2">State Diagram</option>
            <option value="sequenceDiagram">Sequence</option>
            <option value="classDiagram">Class Diagram</option>
            <option value="erDiagram">ER Diagram</option>
          </select>

          <select
            aria-label="Load Mermaid Template"
            title="Load a Starter Mermaid Diagram Template"
            defaultValue=""
            onChange={(e) => {
              handleSelectTemplate(e.target.value);
              e.target.value = '';
            }}
            className="min-h-[24px] bg-slate-800 border border-slate-700 text-slate-200 rounded-md px-1.5 py-0.5 text-[11px] focus:outline-none focus:border-indigo-500"
          >
            <option value="" disabled>
              Templates...
            </option>
            {MERMAID_TEMPLATES.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.name}
              </option>
            ))}
          </select>

          <select
            aria-label="Connector Curve Style"
            data-testid="connector-curve-select"
            title="Connector Routing Geometry (Default: Curved Bezier)"
            value={currentEdgeCurve}
            onChange={(e) =>
              handleSetGlobalEdgeCurve(e.target.value as FlowEdgeCurve)
            }
            className="min-h-[24px] bg-slate-800 border border-slate-700 text-cyan-200 rounded-md px-1.5 py-0.5 text-[11px] focus:outline-none focus:border-indigo-500"
          >
            <option value="bezier">Curved (Bezier)</option>
            <option value="orthogonal">Orthogonal (Elbow)</option>
            <option value="straight">Straight Line</option>
          </select>

          <select
            aria-label="Connector Line Style"
            title="Connector Line Style"
            value={activeEdgeStyle}
            onChange={(e) =>
              setActiveEdgeStyle(e.target.value as FlowEdgeStyle)
            }
            className="min-h-[24px] bg-slate-800 border border-slate-700 text-slate-200 rounded-md px-1.5 py-0.5 text-[11px] focus:outline-none focus:border-indigo-500"
          >
            <option value="solid">Solid (---)</option>
            <option value="dotted">Dotted (-.-)</option>
            <option value="thick">Thick (===)</option>
          </select>

          <select
            aria-label="Connector Arrow Type"
            title="Connector Arrow Type"
            value={activeEdgeArrow}
            onChange={(e) =>
              setActiveEdgeArrow(e.target.value as FlowEdgeArrow)
            }
            className="min-h-[24px] bg-slate-800 border border-slate-700 text-slate-200 rounded-md px-1.5 py-0.5 text-[11px] focus:outline-none focus:border-indigo-500"
          >
            <option value="arrow">Arrow (--&gt;)</option>
            <option value="bidirectional">Bi-Dir (&lt;--&gt;)</option>
            <option value="none">Open (---)</option>
            <option value="circle">Circle (--o)</option>
            <option value="cross">Cross (--x)</option>
          </select>

          <div
            role="group"
            aria-label="Flow Direction"
            className="flex items-center bg-slate-800/90 border border-slate-700 rounded-md p-0.5"
          >
            <Compass
              className="w-3 h-3 text-slate-400 mx-1"
              aria-hidden="true"
            />
            {DIRECTIONS.map((dir) => (
              <button
                key={dir}
                type="button"
                aria-label={`Direction ${dir}`}
                aria-pressed={currentDirection === dir}
                onClick={() => handleSetDirection(dir)}
                title={`Set Mermaid flow direction to ${dir}`}
                className={`min-h-[24px] min-w-[24px] px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold transition ${
                  currentDirection === dir
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {dir}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Slim Status & Export Strip (Zoom/Fit/Snap moved to floating bottom-right Canvas HUD) */}
      <div
        id="flow-helper-bar"
        className="px-3 py-1 bg-indigo-950/35 border-b border-indigo-500/20 flex flex-wrap items-center justify-between gap-2 text-[11px] text-indigo-200"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            id="flow-status-msg"
            role="status"
            aria-live="polite"
            className="truncate cq-flow-status"
          >
            {statusMessage}
          </span>
          {layoutMode !== 'compact' && (
            <span
              data-testid="flow-layout-mode-badge"
              className="px-1.5 py-0.5 rounded bg-indigo-500/20 border border-indigo-400/30 text-[10px] font-mono uppercase tracking-wider text-indigo-300 shrink-0"
            >
              {layoutMode === 'expanded'
                ? `Studio (${panelWidthPercent}%)`
                : `Standard (${panelWidthPercent}%)`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {onInsertMermaidToNote && (
            <button
              type="button"
              aria-label="Insert Mermaid into Note"
              onClick={() =>
                onInsertMermaidToNote(generateMermaidCode(flowData))
              }
              title="Append fenced ```mermaid code block into active Note"
              className="min-h-[24px] flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-400/40 text-indigo-200 hover:text-white transition"
            >
              <FileText className="w-3 h-3" aria-hidden="true" />
              <span>To Note</span>
            </button>
          )}

          <button
            type="button"
            data-testid="copy-png-btn"
            aria-label="Copy Flowchart as PNG"
            onClick={handleCopyPNG}
            title="Copy 2x High-DPI PNG to Clipboard"
            className="min-h-[24px] flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-600/25 hover:bg-emerald-600/40 border border-emerald-400/40 text-emerald-200 hover:text-white transition"
          >
            <ImageIcon className="w-3 h-3" aria-hidden="true" />
            <span>Copy PNG</span>
          </button>

          <button
            type="button"
            onClick={handleExportSVG}
            className="min-h-[24px] px-1.5 rounded underline hover:text-white"
          >
            Download SVG
          </button>
        </div>
      </div>

      {/* Main Workspace Area: Adaptive Studio Sidebar (when >= 65% width) + Interactive Canvas + Side-by-Side Code Split */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Expanded Studio Sidebar (Shown automatically when panelWidthPercent >= 65% and toggled open) */}
        {layoutMode === 'expanded' && isStudioSidebarOpen && (
          <aside
            data-testid="flow-studio-sidebar"
            aria-label="Flowchart Studio Palette & Inspector"
            className="w-56 border-r border-slate-800/90 bg-slate-950/90 p-3 flex flex-col gap-3 overflow-y-auto shrink-0 text-xs"
          >
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center justify-between">
                <span>Quick Stencil Palette</span>
                <span className="font-mono text-[10px] text-indigo-400">
                  9 Shapes
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {ALL_NODE_SHAPES.map((item) => (
                  <button
                    key={`studio-add-${item.type}`}
                    type="button"
                    aria-label={`Studio: Add ${item.label}`}
                    onClick={() => handleAddNode(item.type)}
                    className="px-2 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-indigo-500/40 text-slate-200 text-[11px] text-left truncate transition"
                  >
                    + {item.shortLabel}
                  </button>
                ))}
              </div>
            </div>

            {selectedNode ? (
              <div
                data-testid="studio-node-inspector"
                className="p-2.5 rounded-xl bg-slate-900/90 border border-indigo-500/30 space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-300">
                    Selected Node
                  </span>
                  <span className="font-mono text-[10px] text-slate-400">
                    {selectedNode.id}
                  </span>
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="studio-shape-select"
                    className="text-[10px] text-slate-400 block"
                  >
                    Morph Shape In-Place
                  </label>
                  <select
                    id="studio-shape-select"
                    aria-label="Studio: Change selected node shape"
                    value={selectedNode.type}
                    onChange={(e) =>
                      handleChangeNodeShape(
                        selectedNode.id,
                        e.target.value as FlowNodeType
                      )
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-white"
                  >
                    {ALL_NODE_SHAPES.map((s) => (
                      <option key={s.type} value={s.type}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-400 block">
                    Accent Color
                  </span>
                  <div className="flex items-center gap-1 flex-wrap">
                    <button
                      type="button"
                      aria-label="Studio: Reset node color"
                      onClick={() =>
                        handleSetNodeColor(selectedNode.id, undefined)
                      }
                      className="w-6 h-6 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-600 text-[10px] text-white flex items-center justify-center"
                    >
                      ×
                    </button>
                    {(Object.keys(ACCENT_SWATCH_CLASSES) as AccentColor[]).map(
                      (c) => (
                        <button
                          key={`studio-color-${c}`}
                          type="button"
                          aria-label={`Studio: Set node color ${c}`}
                          onClick={() =>
                            handleSetNodeColor(selectedNode.id, c)
                          }
                          className="w-6 h-6 rounded-md hover:bg-slate-800 flex items-center justify-center"
                        >
                          <span
                            className={`w-3.5 h-3.5 rounded-full border ${
                              ACCENT_SWATCH_CLASSES[c]
                            } ${
                              selectedNode.color === c
                                ? 'ring-2 ring-white scale-110'
                                : ''
                            }`}
                          />
                        </button>
                      )
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 pt-1">
                  <button
                    type="button"
                    aria-label="Studio: Quick branch from selected node"
                    onClick={() =>
                      handleQuickAddDirection(
                        selectedNode,
                        directionToPort(currentDirection)
                      )
                    }
                    className="flex-1 min-h-[26px] px-2 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-medium flex items-center justify-center gap-1"
                  >
                    <Plus className="w-3 h-3" aria-hidden="true" /> Branch
                  </button>
                  <button
                    type="button"
                    aria-label="Studio: Duplicate selected node"
                    onClick={() => handleDuplicateNode(selectedNode.id)}
                    className="min-h-[26px] px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[10px] flex items-center gap-1"
                  >
                    <Copy className="w-3 h-3" aria-hidden="true" /> Copy
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-2.5 rounded-xl bg-slate-900/50 border border-slate-800/80 text-[11px] text-slate-400 space-y-1">
                <p className="font-medium text-slate-300">No Node Selected</p>
                <p className="text-[10px]">
                  Click any node on the canvas to morph its shape, pick a color,
                  or branch with one click.
                </p>
              </div>
            )}

            <div className="mt-auto p-2.5 rounded-xl bg-indigo-950/30 border border-indigo-500/20 space-y-1 text-[10px] text-slate-300">
              <div className="font-semibold text-indigo-300 flex items-center gap-1">
                <Spline className="w-3 h-3" aria-hidden="true" /> Rapid Flow Keys
              </div>
              <div>
                <kbd className="px-1 py-0.5 bg-slate-900 rounded border border-slate-700 font-mono text-[10px]">
                  Alt+Enter
                </kbd>{' '}
                Spawn &amp; link next step
              </div>
              <div>
                <kbd className="px-1 py-0.5 bg-slate-900 rounded border border-slate-700 font-mono text-[10px]">
                  Click +
                </kbd>{' '}
                Directional quick-add
              </div>
              <div>
                <kbd className="px-1 py-0.5 bg-slate-900 rounded border border-slate-700 font-mono text-[10px]">
                  Ctrl+D
                </kbd>{' '}
                Duplicate node
              </div>
              <div>
                <kbd className="px-1 py-0.5 bg-slate-900 rounded border border-slate-700 font-mono text-[10px]">
                  Ctrl+Wheel
                </kbd>{' '}
                Zoom at cursor
              </div>
            </div>
          </aside>
        )}

        {/* Interactive SVG + HTML Flowchart Canvas */}
        <div
          ref={canvasWrapperRef}
          id="flow-canvas-wrapper"
          onWheel={handleCanvasWheel}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setEditingEdgeIdx(null);
              setCompartmentNodeId(null);
              if (connectMode) {
                setConnectMode(false);
                setConnectSourceNodeId(null);
                return;
              }
              if (e.shiftKey || marqueeMode) {
                const rect = canvasWrapperRef.current?.getBoundingClientRect();
                if (rect) {
                  cachedWrapperRectRef.current = rect;
                  const startX = Math.round(
                    (e.clientX - rect.left - panOffset.x) / zoomLevel
                  );
                  const startY = Math.round(
                    (e.clientY - rect.top - panOffset.y) / zoomLevel
                  );
                  setMarqueeBox({
                    startX,
                    startY,
                    currX: startX,
                    currY: startY,
                  });
                }
              } else {
                setSelectedNodeId(null);
                setSelectedNodeIds([]);
                panningCanvasRef.current = {
                  lastClientX: e.clientX,
                  lastClientY: e.clientY,
                };
              }
            }
          }}
          style={{
            backgroundPosition: `${panOffset.x}px ${panOffset.y}px`,
            backgroundSize: `${Math.round(24 * zoomLevel)}px ${Math.round(24 * zoomLevel)}px`,
          }}
          className="relative flex-1 canvas-grid overflow-hidden bg-slate-950"
        >
          {/* Floating Bottom-Right Viewport HUD (Zoom / Fit / Snap-to-Grid) */}
          <div
            data-testid="flow-canvas-hud"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-3 right-3 z-30 flex items-center gap-1 bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-xl p-1 shadow-xl"
          >
            <div
              role="group"
              aria-label="Canvas Zoom Controls"
              className="flex items-center gap-0.5"
            >
              <button
                type="button"
                onClick={handleZoomOut}
                aria-label="Zoom Out Flowchart"
                title="Zoom Out"
                className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition"
              >
                <ZoomOut className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={handleResetZoom}
                aria-label="Reset Flowchart Zoom"
                title="Reset Zoom & Pan (100%)"
                className="min-h-[24px] px-1.5 rounded-lg font-mono text-[10px] text-indigo-300 hover:text-white hover:bg-slate-800 transition"
              >
                {Math.round(zoomLevel * 100)}%
              </button>
              <button
                type="button"
                onClick={handleZoomIn}
                aria-label="Zoom In Flowchart"
                title="Zoom In"
                className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition"
              >
                <ZoomIn className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>

            <div className="h-3.5 w-px bg-slate-700/80 mx-0.5" />

            <button
              type="button"
              data-testid="fit-to-view-btn"
              onClick={handleFitView}
              aria-label="Fit Flowchart to View"
              title="Center & Fit Diagram in Viewport"
              className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition"
            >
              <Maximize2 className="w-3.5 h-3.5" aria-hidden="true" />
            </button>

            <button
              type="button"
              data-testid="snap-grid-toggle-btn"
              aria-label="Toggle Grid & Smart Alignment Snap"
              aria-pressed={snapToGrid}
              onClick={() => setSnapToGrid((prev) => !prev)}
              title="Toggle 8px Grid & Center Alignment Snap Guides"
              className={`w-6 h-6 flex items-center justify-center rounded-lg transition ${
                snapToGrid
                  ? 'bg-indigo-600/30 border border-indigo-500/50 text-indigo-300'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Magnet className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
          {/* Floating Multi-Select Action Bar */}
          {selectedNodeIds.length > 1 && (
            <div
              data-testid="multi-select-toolbar"
              role="toolbar"
              aria-label="Multi-Select Actions"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              className="absolute top-3 left-1/2 -translate-x-1/2 z-30 bg-slate-900/95 border border-cyan-400/60 rounded-xl px-2.5 py-1.5 shadow-2xl flex items-center gap-1.5 flex-wrap text-[11px]"
            >
              <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-200 font-mono text-[10px] font-semibold">
                {selectedNodeIds.length} Selected
              </span>
              <button
                type="button"
                data-testid="multi-align-x"
                onClick={() => handleAlignOrDistribute('align-x')}
                title="Align selected nodes horizontally (same X column)"
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 transition"
              >
                Align X
              </button>
              <button
                type="button"
                data-testid="multi-align-y"
                onClick={() => handleAlignOrDistribute('align-y')}
                title="Align selected nodes vertically (same Y row)"
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 transition"
              >
                Align Y
              </button>
              {selectedNodeIds.length >= 3 && (
                <button
                  type="button"
                  data-testid="multi-distribute-btn"
                  onClick={() => handleAlignOrDistribute('distribute')}
                  title="Distribute selected nodes evenly"
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 transition"
                >
                  Distribute
                </button>
              )}
              <button
                type="button"
                data-testid="multi-wrap-subgraph-btn"
                onClick={() => handleAddSubgraph(selectedNodeIds)}
                title="Wrap selected nodes in a Mermaid Subgraph"
                className="px-2 py-0.5 rounded bg-indigo-600/40 hover:bg-indigo-600/60 border border-indigo-400/50 text-indigo-100 flex items-center gap-1 transition"
              >
                <BoxSelect className="w-3 h-3" aria-hidden="true" />
                <span>Wrap Subgraph</span>
              </button>
              <button
                type="button"
                data-testid="multi-color-btn"
                onClick={handleBatchCycleColor}
                title="Cycle accent color for all selected nodes"
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 transition"
              >
                <Palette className="w-3 h-3" aria-hidden="true" />
              </button>
              <button
                type="button"
                data-testid="multi-delete-btn"
                onClick={handleBatchDeleteSelected}
                title="Delete all selected nodes (Delete)"
                className="p-1 rounded bg-rose-950/80 hover:bg-rose-600 text-rose-300 hover:text-white transition"
              >
                <Trash2 className="w-3 h-3" aria-hidden="true" />
              </button>
            </div>
          )}

          {effectiveNodes.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center z-10 pointer-events-none">
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 max-w-xs space-y-3 pointer-events-auto shadow-xl">
                <p className="text-xs font-semibold text-white">
                  Flowchart Canvas is Empty
                </p>
                <p className="text-[11px] text-slate-400">
                  Add a Process, Decision, Terminal, or specialized Mermaid
                  shape from the toolbar above, or restore the starter diagram.
                </p>
                <div className="flex items-center justify-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleAddNode('start')}
                    className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white transition"
                  >
                    + Add Start Node
                  </button>
                  <button
                    type="button"
                    onClick={handleResetDemo}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 transition"
                  >
                    Restore Demo
                  </button>
                </div>
              </div>
            </div>
          )}

          <div
            data-testid="flow-canvas-stage"
            style={{
              transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`,
              transformOrigin: '0 0',
            }}
            className="absolute inset-0 w-full h-full pointer-events-none"
          >
            {/* Live Marquee Box Selection Overlay */}
            {marqueeBox && (
              <div
                data-testid="flow-marquee-box"
                style={{
                  left: `${Math.min(marqueeBox.startX, marqueeBox.currX)}px`,
                  top: `${Math.min(marqueeBox.startY, marqueeBox.currY)}px`,
                  width: `${Math.max(4, Math.abs(marqueeBox.currX - marqueeBox.startX))}px`,
                  height: `${Math.max(4, Math.abs(marqueeBox.currY - marqueeBox.startY))}px`,
                }}
                className="absolute border border-dashed border-cyan-400 bg-cyan-500/15 rounded-md pointer-events-none z-40"
              />
            )}

            {/* HTML Layer for Subgraph Containers (Behind Edges & Nodes) */}
            <div
              id="flow-subgraphs-layer"
              className="absolute inset-0 w-full h-full pointer-events-none"
            >
              {subgraphBoundsList.map((bounds) => (
                <div
                  key={bounds.id}
                  data-testid={`flow-subgraph-${bounds.id}`}
                  style={{
                    left: `${bounds.x}px`,
                    top: `${bounds.y}px`,
                    width: `${bounds.width}px`,
                    height: `${bounds.height}px`,
                  }}
                  className="absolute rounded-2xl bg-slate-900/45 border border-dashed border-indigo-400/40 pointer-events-none"
                >
                  <div
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      const sg = (flowData.subgraphs || []).find(
                        (s) => s.id === bounds.id
                      );
                      if (!sg) return;
                      const initialPositions: Record<
                        string,
                        { x: number; y: number }
                      > = {};
                      const memberSet = new Set(sg.nodeIds);
                      for (const n of flowData.nodes) {
                        if (memberSet.has(n.id)) {
                          initialPositions[n.id] = { x: n.x, y: n.y };
                        }
                      }
                      draggingSubgraphRef.current = {
                        id: bounds.id,
                        startClientX: e.clientX,
                        startClientY: e.clientY,
                        initialPositions,
                      };
                    }}
                    className="pointer-events-auto cursor-move px-3 py-1 rounded-t-2xl bg-slate-900/80 border-b border-slate-800/80 flex items-center justify-between gap-2 group"
                  >
                    {editingSubgraphId === bounds.id ? (
                      <input
                        type="text"
                        aria-label="Edit subgraph title"
                        value={editingSubgraphTitle}
                        onChange={(e) =>
                          setEditingSubgraphTitle(e.target.value)
                        }
                        onBlur={() => commitEditingSubgraph(bounds.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            commitEditingSubgraph(bounds.id);
                            window.requestAnimationFrame(() => {
                              document
                                .querySelector<HTMLElement>(
                                  `[data-testid="subgraph-title-${bounds.id}"]`
                                )
                                ?.focus();
                            });
                          }
                          if (e.key === 'Escape') {
                            setEditingSubgraphId(null);
                            window.requestAnimationFrame(() => {
                              document
                                .querySelector<HTMLElement>(
                                  `[data-testid="subgraph-title-${bounds.id}"]`
                                )
                                ?.focus();
                            });
                          }
                        }}
                        autoFocus
                        className="bg-slate-950 text-indigo-200 text-[10px] px-1.5 py-0.5 rounded border border-indigo-400 focus:outline-none"
                      />
                    ) : (
                      <button
                        type="button"
                        data-testid={`subgraph-title-${bounds.id}`}
                        aria-label={`Subgraph ${bounds.title} (press F2 or double-click to rename)`}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          setEditingSubgraphId(bounds.id);
                          setEditingSubgraphTitle(bounds.title);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'F2') {
                            e.preventDefault();
                            e.stopPropagation();
                            setEditingSubgraphId(bounds.id);
                            setEditingSubgraphTitle(bounds.title);
                          }
                        }}
                        title="Double-click or press F2 to rename subgraph • Drag header to move group"
                        className="min-h-[24px] px-1 rounded text-left text-[10px] font-semibold uppercase tracking-wider text-indigo-300/90 hover:text-indigo-200 truncate"
                      >
                        {bounds.title}
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label={`Remove subgraph ${bounds.title}`}
                      title="Ungroup subgraph"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveSubgraph(bounds.id);
                      }}
                      className="text-slate-400 hover:text-rose-400 text-xs leading-none px-1"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* SVG Layer for Sequence Lifelines, Snap Guides, Draft Line & Directed Arrows */}
            <svg
              id="flow-svg-layer"
              className="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
            >
              <defs>
                <marker
                  id="arrowhead"
                  markerWidth="10"
                  markerHeight="7"
                  refX="9"
                  refY="3.5"
                  orient="auto"
                >
                  <polygon points="0 0, 10 3.5, 0 7" fill="#818cf8" />
                </marker>
                <marker
                  id="arrowhead-start"
                  markerWidth="10"
                  markerHeight="7"
                  refX="1"
                  refY="3.5"
                  orient="auto"
                >
                  <polygon points="10 0, 0 3.5, 10 7" fill="#818cf8" />
                </marker>
                <marker
                  id="circlehead"
                  markerWidth="8"
                  markerHeight="8"
                  refX="5"
                  refY="4"
                  orient="auto"
                >
                  <circle
                    cx="4"
                    cy="4"
                    r="3"
                    fill="#020617"
                    stroke="#818cf8"
                    strokeWidth="1.8"
                  />
                </marker>
                <marker
                  id="crosshead"
                  markerWidth="9"
                  markerHeight="9"
                  refX="6"
                  refY="4.5"
                  orient="auto"
                >
                  <path
                    d="M 1.5 1.5 L 7.5 7.5 M 7.5 1.5 L 1.5 7.5"
                    stroke="#818cf8"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </marker>
              </defs>

              {/* Smart Center Alignment Snap Guides */}
              {snapGuides?.x !== undefined && (
                <line
                  data-testid="snap-guide-x"
                  x1={snapGuides.x}
                  y1={-1000}
                  x2={snapGuides.x}
                  y2={3000}
                  stroke="#22d3ee"
                  strokeWidth="1.2"
                  strokeDasharray="4,4"
                />
              )}
              {snapGuides?.y !== undefined && (
                <line
                  data-testid="snap-guide-y"
                  x1={-1000}
                  y1={snapGuides.y}
                  x2={3000}
                  y2={snapGuides.y}
                  stroke="#22d3ee"
                  strokeWidth="1.2"
                  strokeDasharray="4,4"
                />
              )}

              {isSequenceDiagram && (
                <g
                  id="flow-lifelines-group"
                  data-testid="flow-lifelines-group"
                >
                  {effectiveNodes.map((n) => {
                    const cx = n.x + 72;
                    const topY = n.y + 52;
                    const bottomY = Math.max(
                      topY + 120,
                      125 + Math.max(1, flowData.edges.length) * 48
                    );
                    return (
                      <line
                        key={`lifeline-${n.id}`}
                        x1={cx}
                        y1={topY}
                        x2={cx}
                        y2={bottomY}
                        stroke="#475569"
                        strokeWidth="1.5"
                        strokeDasharray="5,5"
                      />
                    );
                  })}
                </g>
              )}

              <g id="flow-edges-group">
                {computedEdges.map((item) => {
                  if (!item) return null;
                  const { edge, idx, pathData, midX, midY } = item;

                  const strokeWidth = edge.style === 'thick' ? '4' : '2.2';
                  const strokeDasharray =
                    edge.style === 'dotted' ? '6,4' : undefined;
                  const markerStart =
                    edge.arrow === 'bidirectional'
                      ? 'url(#arrowhead-start)'
                      : undefined;
                  let markerEnd: string | undefined = 'url(#arrowhead)';
                  if (edge.arrow === 'none') {
                    markerEnd = undefined;
                  } else if (edge.arrow === 'circle') {
                    markerEnd = 'url(#circlehead)';
                  } else if (edge.arrow === 'cross') {
                    markerEnd = 'url(#crosshead)';
                  }

                  const isEdgeSelected = editingEdgeIdx === idx;

                  return (
                    <g
                      key={`${edge.from}-${edge.to}-${idx}`}
                      data-testid={`flow-edge-${idx}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        startEditingEdge(
                          idx,
                          edge.label,
                          edge.style,
                          edge.arrow,
                          edge.cardinality,
                          edge.curve
                        );
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        startEditingEdge(
                          idx,
                          edge.label,
                          edge.style,
                          edge.arrow,
                          edge.cardinality,
                          edge.curve
                        );
                      }}
                      className="pointer-events-auto cursor-pointer group"
                    >
                      <title>
                        Click to edit connector label, style, routing or delete
                      </title>
                      <path
                        d={pathData}
                        stroke="transparent"
                        strokeWidth="14"
                        fill="none"
                      />
                      <path
                        d={pathData}
                        stroke={isEdgeSelected ? '#38bdf8' : '#818cf8'}
                        strokeWidth={strokeWidth}
                        strokeDasharray={strokeDasharray}
                        fill="none"
                        markerStart={markerStart}
                        markerEnd={markerEnd}
                        className="group-hover:stroke-cyan-300 transition-colors"
                      />
                      {edge.label && (
                        <text
                          x={midX}
                          y={midY - 8}
                          fill="#c7d2fe"
                          fontSize="10"
                          fontWeight="600"
                          textAnchor="middle"
                          className="pointer-events-none select-none"
                        >
                          {edge.label}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>

              {/* Live Rubber-Band Connector Preview when dragging from a node port */}
              {draftConnectionPath && (
                <path
                  data-testid="draft-connection-path"
                  d={draftConnectionPath}
                  stroke="#38bdf8"
                  strokeWidth="2.5"
                  strokeDasharray="6,4"
                  fill="none"
                  markerEnd="url(#arrowhead)"
                />
              )}
            </svg>

            {/* HTML Layer for Edge Label Badges & Inline Editor */}
            <div
              id="flow-edge-labels-layer"
              className="absolute inset-0 w-full h-full pointer-events-none"
            >
              {computedEdges.map((item) => {
                if (!item) return null;
                const { edge, idx, midX, midY } = item;

                const badgeText =
                  edge.cardinality && edge.label
                    ? `${edge.cardinality} ${edge.label}`
                    : edge.label || edge.cardinality || '+';

                return (
                  <React.Fragment key={`edge-badge-wrap-${idx}`}>
                    <button
                      type="button"
                      aria-label={
                        edge.label
                          ? `Edit edge label ${edge.label}`
                          : `Add label to connection ${edge.from} to ${edge.to}`
                      }
                      title="Click to edit connector label, style & UML/ER cardinality"
                      onClick={(e) => {
                        e.stopPropagation();
                        startEditingEdge(
                          idx,
                          edge.label,
                          edge.style,
                          edge.arrow,
                          edge.cardinality,
                          edge.curve
                        );
                      }}
                      style={{ left: `${midX}px`, top: `${midY}px` }}
                      className={`pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 z-10 rounded-full transition ${
                        edge.label || edge.cardinality
                          ? 'min-h-[24px] px-2 py-0.5 bg-slate-900/95 border border-indigo-500/50 text-[10px] font-medium text-indigo-200 hover:border-indigo-400 shadow inline-flex items-center'
                          : 'w-6 h-6 bg-slate-900/85 border border-slate-700 text-[10px] text-slate-300 opacity-0 hover:opacity-100 focus:opacity-100 flex items-center justify-center'
                      }`}
                    >
                      {badgeText}
                    </button>

                    {editingEdgeIdx === idx && (
                      <div
                        data-testid="uml-edge-toolbar"
                        role="toolbar"
                        aria-label="Edge Relationship Toolbar"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          left: `${Math.max(110, midX)}px`,
                          top: `${Math.max(70, midY)}px`,
                        }}
                        className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 z-30 bg-slate-900/95 border border-indigo-400 rounded-xl p-2 shadow-2xl flex flex-col gap-1.5 items-center min-w-[205px]"
                      >
                        <div className="flex items-center gap-1 w-full">
                          <input
                            type="text"
                            aria-label="Edit connector label"
                            value={editingEdgeLabel}
                            onChange={(e) =>
                              setEditingEdgeLabel(e.target.value)
                            }
                            onBlur={(e) => {
                              if (
                                e.relatedTarget &&
                                e.currentTarget.closest(
                                  '[data-testid="uml-edge-toolbar"]'
                                )?.contains(e.relatedTarget as Node)
                              ) {
                                return;
                              }
                              commitEditingEdge(idx);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitEditingEdge(idx);
                              if (e.key === 'Escape') {
                                e.stopPropagation();
                                setEditingEdgeIdx(null);
                              }
                            }}
                            placeholder="Label..."
                            autoFocus
                            className="flex-1 min-h-[24px] bg-slate-950 text-indigo-200 text-[10px] px-2 py-0.5 rounded-full border border-indigo-500/60 focus:outline-none text-center"
                          />
                          <button
                            type="button"
                            data-testid="delete-edge-btn"
                            aria-label="Delete connector"
                            title="Delete connector"
                            onClick={() => handleDeleteEdge(idx)}
                            className="w-6 h-6 flex items-center justify-center rounded-full bg-rose-950/80 hover:bg-rose-600 text-rose-300 hover:text-white transition"
                          >
                            <Trash2 className="w-3 h-3" aria-hidden="true" />
                          </button>
                        </div>

                        {/* Quick Flowchart Branch Label Chips + 1-Click Insert Step on Edge */}
                        <div className="flex items-center gap-1 flex-wrap justify-center">
                          <button
                            type="button"
                            data-testid="insert-node-on-edge-btn"
                            aria-label="Insert step on connector"
                            title="Splice a new Process node into this connector"
                            onClick={() => handleInsertNodeOnEdge(idx)}
                            className="min-h-[22px] px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-[10px] font-medium text-white flex items-center gap-0.5 transition"
                          >
                            <Plus className="w-2.5 h-2.5" aria-hidden="true" />
                            <span>Insert Step</span>
                          </button>
                          {['Yes', 'No', 'Error'].map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              data-testid={`edge-quick-label-${preset.toLowerCase()}`}
                              onClick={() => {
                                setEditingEdgeLabel(preset);
                                commitEditingEdge(
                                  idx,
                                  undefined,
                                  undefined,
                                  undefined,
                                  undefined,
                                  preset
                                );
                              }}
                              className="min-h-[22px] px-2 py-0.5 rounded bg-slate-800 hover:bg-indigo-600 text-[10px] text-slate-300 hover:text-white transition"
                            >
                              {preset}
                            </button>
                          ))}
                        </div>

                        <div className="flex items-center gap-1 flex-wrap justify-center">
                          <select
                            aria-label="Edit edge line style"
                            value={editingEdgeStyle}
                            onChange={(e) => {
                              const nextStyle =
                                e.target.value as FlowEdgeStyle;
                              setEditingEdgeStyle(nextStyle);
                              commitEditingEdge(
                                idx,
                                nextStyle,
                                editingEdgeArrow,
                                undefined,
                                undefined,
                                undefined,
                                true
                              );
                            }}
                            className="min-h-[22px] bg-slate-800 border border-slate-700 text-slate-200 rounded px-1 py-0.5 text-[10px]"
                          >
                            <option value="solid">Solid</option>
                            <option value="dotted">Dotted</option>
                            <option value="thick">Thick</option>
                          </select>
                          <select
                            aria-label="Edit edge arrow type"
                            value={editingEdgeArrow}
                            onChange={(e) => {
                              const nextArrow =
                                e.target.value as FlowEdgeArrow;
                              setEditingEdgeArrow(nextArrow);
                              commitEditingEdge(
                                idx,
                                editingEdgeStyle,
                                nextArrow,
                                undefined,
                                undefined,
                                undefined,
                                true
                              );
                            }}
                            className="min-h-[22px] bg-slate-800 border border-slate-700 text-slate-200 rounded px-1 py-0.5 text-[10px]"
                          >
                            <option value="arrow">--&gt;</option>
                            <option value="bidirectional">&lt;--&gt;</option>
                            <option value="none">---</option>
                            <option value="circle">--o</option>
                            <option value="cross">--x</option>
                          </select>
                          <select
                            aria-label="Edit edge curve"
                            data-testid="edit-edge-curve-select"
                            value={editingEdgeCurve}
                            onChange={(e) => {
                              const nextCurve =
                                e.target.value as FlowEdgeCurve;
                              setEditingEdgeCurve(nextCurve);
                              commitEditingEdge(
                                idx,
                                undefined,
                                undefined,
                                undefined,
                                nextCurve,
                                undefined,
                                true
                              );
                            }}
                            className="min-h-[22px] bg-slate-800 border border-slate-700 text-cyan-200 rounded px-1 py-0.5 text-[10px]"
                          >
                            <option value="bezier">Curved</option>
                            <option value="orthogonal">Elbow</option>
                            <option value="straight">Straight</option>
                          </select>
                          <select
                            aria-label="Edit edge cardinality"
                            data-testid="edit-edge-cardinality-select"
                            value={editingEdgeCardinality}
                            onChange={(e) => {
                              const nextCard = e.target.value;
                              setEditingEdgeCardinality(nextCard);
                              commitEditingEdge(
                                idx,
                                undefined,
                                undefined,
                                nextCard,
                                undefined,
                                undefined,
                                true
                              );
                            }}
                            className="min-h-[22px] bg-slate-800 border border-indigo-500/40 text-cyan-300 font-mono rounded px-1 py-0.5 text-[10px]"
                          >
                            <option value="">Standard</option>
                            <option value="<|--">&lt;|-- Inherits</option>
                            <option value="*--">*-- Composes</option>
                            <option value="o--">o-- Aggregates</option>
                            <option value="<|..">&lt;|.. Implements</option>
                            <option value="..>">..&gt; Depends</option>
                            <option value="-->">--&gt; Associates</option>
                            <option value="||--o{">
                              ||--o&#123; 1 : 0..N
                            </option>
                            <option value="||--|{">
                              ||--|&#123; 1 : 1..N
                            </option>
                            <option value="||--||">||--|| 1 : 1</option>
                            <option value="}|..|{">
                              &#125;|..|&#123; N : M
                            </option>
                            <option value="|o..o|">|o..o| 0..1 : 0..1</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            {/* HTML Layer for Draggable Nodes */}
            <div
              id="flow-nodes-layer"
              className="absolute inset-0 w-full h-full pointer-events-none"
            >
              {effectiveNodes.map((node) => {
                let radiusAndBorder = 'rounded-xl border-2';
                let colorTheme =
                  'bg-sky-950/90 border-sky-400/70 text-sky-100';

                if (node.type === 'decision') {
                  radiusAndBorder = 'rounded-2xl border-2 border-dashed';
                  colorTheme =
                    'bg-amber-950/90 border-amber-400/80 text-amber-100';
                } else if (node.type === 'start') {
                  radiusAndBorder = 'rounded-full border-2';
                  colorTheme =
                    'bg-emerald-950/90 border-emerald-400/80 text-emerald-100';
                } else if (node.type === 'database') {
                  radiusAndBorder = 'rounded-xl border-2 border-t-[6px]';
                  colorTheme =
                    'bg-purple-950/90 border-purple-400/80 text-purple-100';
                } else if (node.type === 'subroutine') {
                  radiusAndBorder =
                    'rounded-lg border-y-2 border-x-[6px] border-double';
                  colorTheme =
                    'bg-indigo-950/90 border-indigo-400/80 text-indigo-100';
                } else if (node.type === 'io') {
                  radiusAndBorder = 'rounded-lg border-2 -skew-x-6';
                  colorTheme =
                    'bg-cyan-950/90 border-cyan-400/80 text-cyan-100';
                } else if (node.type === 'circle') {
                  radiusAndBorder =
                    'rounded-full border-2 ring-1 ring-rose-400/30';
                  colorTheme =
                    'bg-rose-950/90 border-rose-400/80 text-rose-100';
                } else if (node.type === 'hexagon') {
                  radiusAndBorder = 'rounded-xl border-2 border-x-[6px]';
                  colorTheme =
                    'bg-orange-950/90 border-orange-400/80 text-orange-100';
                } else if (node.type === 'asymmetric') {
                  radiusAndBorder =
                    'rounded-r-2xl rounded-l-sm border-2 border-l-[6px]';
                  colorTheme =
                    'bg-teal-950/90 border-teal-400/80 text-teal-100';
                }

                if (node.color && NODE_COLOR_CLASSES[node.color]) {
                  colorTheme = NODE_COLOR_CLASSES[node.color];
                }

                const isSelected =
                  selectedNodeId === node.id ||
                  selectedNodeIds.includes(node.id);
                const isDropTarget =
                  draftConnection?.hoverTargetId === node.id;

                let shapeClasses = `${radiusAndBorder} ${colorTheme}`;
                if (connectMode && connectSourceNodeId === node.id) {
                  shapeClasses += ' ring-4 ring-indigo-500';
                } else if (isDropTarget) {
                  shapeClasses += ' ring-4 ring-cyan-400 scale-105';
                } else if (isSelected) {
                  shapeClasses += ' ring-2 ring-indigo-400/90';
                }

                return (
                  <div
                    key={node.id}
                    role="group"
                    tabIndex={0}
                    aria-label={`Node: ${node.text}`}
                    data-id={node.id}
                    data-shape={node.type}
                    data-color={node.color || ''}
                    data-selected={isSelected ? 'true' : 'false'}
                    data-testid={`flow-node-${node.id}`}
                    style={{ left: `${node.x}px`, top: `${node.y}px` }}
                    onMouseDown={(e) => handleNodeMouseDown(e, node)}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      startEditingNode(node);
                    }}
                    onKeyDown={(e) => handleNodeKeyDown(e, node)}
                    className={`pointer-events-auto absolute w-36 min-h-[52px] px-3 py-2 shadow-xl flex flex-col items-center justify-center text-center text-xs font-medium cursor-move select-none transition-shadow group ${shapeClasses}`}
                  >
                    {/* Floating In-Place Shape Switcher & Quick Action Pill when a Single Node is Selected */}
                    {isSelected &&
                      selectedNodeIds.length <= 1 &&
                      !connectMode &&
                      compartmentNodeId !== node.id && (
                        <div
                          data-testid={`selected-node-toolbar-${node.id}`}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                          onDoubleClick={(e) => e.stopPropagation()}
                          className={`pointer-events-auto absolute -top-9 left-1/2 -translate-x-1/2 z-30 bg-slate-900/95 border border-indigo-500/50 rounded-lg px-1.5 py-0.5 shadow-xl flex items-center gap-1 ${
                            node.type === 'io' ? 'skew-x-6' : ''
                          }`}
                        >
                          <select
                            aria-label={`Change shape for ${node.text}`}
                            data-testid={`node-shape-switcher-${node.id}`}
                            value={node.type}
                            onChange={(e) =>
                              handleChangeNodeShape(
                                node.id,
                                e.target.value as FlowNodeType
                              )
                            }
                            title="Switch node shape in-place"
                            className="min-h-[22px] bg-slate-800 border border-slate-700 text-indigo-200 rounded px-1.5 py-0.5 text-[10px] focus:outline-none"
                          >
                            {ALL_NODE_SHAPES.map((s) => (
                              <option key={s.type} value={s.type}>
                                {s.shortLabel}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            data-testid={`node-duplicate-btn-${node.id}`}
                            aria-label={`Duplicate node ${node.text}`}
                            title="Duplicate Node (Ctrl+D)"
                            onClick={() => handleDuplicateNode(node.id)}
                            className="w-6 h-6 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white"
                          >
                            <Copy className="w-3 h-3" aria-hidden="true" />
                          </button>
                        </div>
                      )}

                    {/* 4 Directional Quick-Add (+) & Drag-to-Connect Port Handles (Lucidchart / draw.io style) */}
                    {!connectMode &&
                      QUICK_DIRECTIONS.map(({ dir, title, positionClass }) => (
                        <button
                          key={`port-${node.id}-${dir}`}
                          type="button"
                          data-testid={`quick-add-${dir}-${node.id}`}
                          aria-label={`Quick add ${dir} from ${node.text}`}
                          title={title}
                          onMouseDown={(e) => handlePortMouseDown(e, node, dir)}
                          onDoubleClick={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleQuickAddDirection(node, dir);
                          }}
                          className={`pointer-events-auto absolute ${positionClass} w-5 h-5 rounded-full bg-indigo-600 hover:bg-cyan-400 text-white hover:text-slate-950 border border-indigo-300/80 shadow flex items-center justify-center transition-all z-20 focus:opacity-100 ${
                            isSelected
                              ? 'opacity-95 scale-100'
                              : 'opacity-0 group-hover:opacity-95 group-focus-within:opacity-95 scale-90 group-hover:scale-100'
                          } ${node.type === 'io' ? 'skew-x-6' : ''}`}
                        >
                          <Plus
                            className="w-2.5 h-2.5 stroke-[2.5]"
                            aria-hidden="true"
                          />
                        </button>
                      ))}

                    {node.stereotype && (
                      <span
                        data-testid={`flow-node-stereotype-${node.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setCompartmentNodeId(node.id);
                        }}
                        title="Click to edit UML stereotype & members"
                        className={`text-[10px] italic text-amber-300/90 leading-tight mb-0.5 cursor-pointer hover:underline ${
                          node.type === 'io' ? 'skew-x-6' : ''
                        }`}
                      >
                        &lt;&lt;{node.stereotype}&gt;&gt;
                      </span>
                    )}

                    {editingNodeId === node.id ? (
                      <>
                        <span className="sr-only">{node.text}</span>
                        <input
                          type="text"
                          aria-label="Edit node label"
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          onFocus={(e) => e.currentTarget.select()}
                          onBlur={() => commitEditingNode(node.id)}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (
                              e.key === 'Enter' &&
                              (e.altKey || e.ctrlKey || e.metaKey)
                            ) {
                              e.preventDefault();
                              commitEditingNode(node.id);
                              handleQuickAddDirection(
                                node,
                                directionToPort(currentDirection)
                              );
                            } else if (e.key === 'Enter') {
                              commitEditingNode(node.id);
                              window.requestAnimationFrame(() => {
                                document
                                  .querySelector<HTMLElement>(
                                    `[data-testid="flow-node-${node.id}"]`
                                  )
                                  ?.focus();
                              });
                            } else if (e.key === 'Tab') {
                              commitEditingNode(node.id);
                            } else if (e.key === 'Escape') {
                              setEditingNodeId(null);
                              window.requestAnimationFrame(() => {
                                document
                                  .querySelector<HTMLElement>(
                                    `[data-testid="flow-node-${node.id}"]`
                                  )
                                  ?.focus();
                              });
                            }
                          }}
                          autoFocus
                          className={`w-full bg-slate-900 text-white text-xs px-1.5 py-0.5 rounded border border-indigo-400 focus:outline-none text-center ${
                            node.type === 'io' ? 'skew-x-6' : ''
                          }`}
                        />
                      </>
                    ) : (
                      <span
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          startEditingNode(node);
                        }}
                        className={`leading-snug break-words pointer-events-auto ${
                          node.type === 'io' ? 'skew-x-6' : ''
                        }`}
                      >
                        {node.text}
                      </span>
                    )}

                    {node.members && node.members.length > 0 && (
                      <div
                        data-testid={`flow-node-members-${node.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setCompartmentNodeId(node.id);
                        }}
                        title="Click to edit compartment members"
                        className={`w-full mt-1.5 pt-1 border-t border-slate-500/40 text-left font-mono text-[10px] text-slate-200/90 space-y-0.5 cursor-pointer hover:text-white ${
                          node.type === 'io' ? 'skew-x-6' : ''
                        }`}
                      >
                        {node.members.map((member, mIdx) => (
                          <div
                            key={`${node.id}-m-${mIdx}`}
                            className="truncate"
                          >
                            {member}
                          </div>
                        ))}
                      </div>
                    )}

                    <button
                      type="button"
                      aria-label={`Cycle color for ${node.text}`}
                      title="Cycle node accent color (Mermaid style)"
                      onMouseDown={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCycleNodeColor(node.id);
                      }}
                      className={`opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 absolute -top-2.5 -left-2.5 w-6 h-6 rounded-full bg-slate-800 border border-slate-600 text-slate-200 hover:text-indigo-300 flex items-center justify-center shadow z-20 ${
                        node.type === 'io' ? 'skew-x-6' : ''
                      }`}
                    >
                      <Palette className="w-3 h-3" aria-hidden="true" />
                    </button>

                    <button
                      type="button"
                      aria-label={`Edit compartment for ${node.text}`}
                      data-testid={`edit-compartment-btn-${node.id}`}
                      title="Edit UML stereotype & class/ER members"
                      onMouseDown={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        setCompartmentNodeId((prev) =>
                          prev === node.id ? null : node.id
                        );
                        setNewMemberInput('');
                      }}
                      className={`opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 absolute -bottom-2.5 -left-2.5 w-6 h-6 rounded-full bg-slate-800 border border-slate-600 text-slate-200 hover:text-cyan-300 flex items-center justify-center shadow z-20 ${
                        node.type === 'io' ? 'skew-x-6' : ''
                      }`}
                    >
                      <ListPlus className="w-3 h-3" aria-hidden="true" />
                    </button>

                    <button
                      type="button"
                      aria-label={`Delete node ${node.text}`}
                      onMouseDown={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteNode(node.id);
                      }}
                      className={`opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 absolute -top-2.5 -right-2.5 w-6 h-6 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center text-xs shadow z-20 ${
                        node.type === 'io' ? 'skew-x-6' : ''
                      }`}
                    >
                      ×
                    </button>

                    {compartmentNodeId === node.id && (
                      <div
                        role="dialog"
                        aria-label="UML Compartment Editor"
                        data-testid="uml-compartment-popover"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                        onDoubleClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === 'Escape') {
                            setCompartmentNodeId(null);
                          }
                        }}
                        style={{
                          left: node.x < 85 ? '0px' : '50%',
                          transform:
                            node.x < 85 ? 'none' : 'translateX(-50%)',
                        }}
                        className={`pointer-events-auto absolute top-full mt-2 z-50 w-64 rounded-xl border border-indigo-500/60 bg-slate-900/95 p-2.5 shadow-2xl text-left text-[10px] text-slate-100 flex flex-col gap-2 cursor-default ${
                          node.type === 'io' ? 'skew-x-6' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between border-b border-slate-800 pb-1">
                          <span className="font-semibold text-indigo-300 truncate">
                            {node.text} Compartment
                          </span>
                          <button
                            type="button"
                            aria-label="Close compartment editor"
                            onClick={() => setCompartmentNodeId(null)}
                            className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-800 text-slate-300 hover:text-white text-xs leading-none"
                          >
                            ×
                          </button>
                        </div>

                        <div className="flex items-center justify-between gap-1.5">
                          <label
                            htmlFor={`stereo-select-${node.id}`}
                            className="text-slate-300 text-[10px]"
                          >
                            Stereotype:
                          </label>
                          <select
                            id={`stereo-select-${node.id}`}
                            aria-label="UML Stereotype"
                            data-testid="uml-stereotype-select"
                            value={node.stereotype || ''}
                            onChange={(e) =>
                              handleSetNodeStereotype(node.id, e.target.value)
                            }
                            className="min-h-[22px] bg-slate-800 border border-slate-700 text-amber-300 font-mono rounded px-1.5 py-0.5 text-[10px] focus:outline-none focus:border-indigo-500"
                          >
                            <option value="">None</option>
                            <option value="interface">
                              &lt;&lt;interface&gt;&gt;
                            </option>
                            <option value="abstract">
                              &lt;&lt;abstract&gt;&gt;
                            </option>
                            <option value="service">
                              &lt;&lt;service&gt;&gt;
                            </option>
                            <option value="enumeration">
                              &lt;&lt;enumeration&gt;&gt;
                            </option>
                            <option value="entity">
                              &lt;&lt;entity&gt;&gt;
                            </option>
                          </select>
                        </div>

                        {node.members && node.members.length > 0 && (
                          <div
                            role="list"
                            aria-label="Compartment members"
                            data-testid="uml-members-list"
                            className="space-y-1 max-h-28 overflow-y-auto pr-0.5"
                          >
                            {node.members.map((member, mIdx) => (
                              <div
                                key={`${node.id}-edit-m-${mIdx}`}
                                role="listitem"
                                data-testid={`uml-member-row-${mIdx}`}
                                className="flex items-center gap-1"
                              >
                                <input
                                  type="text"
                                  aria-label="Member signature"
                                  data-testid={`uml-member-input-${mIdx}`}
                                  value={member}
                                  onChange={(e) =>
                                    handleUpdateNodeMember(
                                      node.id,
                                      mIdx,
                                      e.target.value
                                    )
                                  }
                                  className="flex-1 min-h-[22px] bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 font-mono text-[10px] text-slate-200 focus:outline-none focus:border-indigo-500"
                                />
                                <button
                                  type="button"
                                  aria-label={`Remove member ${member}`}
                                  data-testid={`uml-member-remove-${mIdx}`}
                                  onClick={() =>
                                    handleRemoveNodeMember(node.id, mIdx)
                                  }
                                  className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-800 text-slate-300 hover:text-rose-400 text-xs leading-none"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            handleAddNodeMember(node.id);
                          }}
                          className="flex items-center gap-1"
                        >
                          <input
                            type="text"
                            aria-label="New node member"
                            data-testid="new-node-member-input"
                            value={newMemberInput}
                            onChange={(e) => setNewMemberInput(e.target.value)}
                            placeholder={
                              currentDiagramType === 'erDiagram'
                                ? 'uuid user_id FK'
                                : '+execute() bool'
                            }
                            className="flex-1 min-h-[24px] bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 font-mono text-[10px] text-emerald-300 focus:outline-none focus:border-indigo-500"
                          />
                          <button
                            type="submit"
                            aria-label="Add node member"
                            data-testid="uml-member-add-btn"
                            className="min-h-[24px] px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-medium"
                          >
                            + Add
                          </button>
                        </form>

                        <div className="flex items-center gap-1 flex-wrap pt-0.5 border-t border-slate-800/80">
                          <span className="text-[10px] text-slate-400">
                            Quick:
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              handleAddNodeMember(node.id, '+String id')
                            }
                            className="min-h-[22px] px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-mono text-sky-300"
                          >
                            +Field
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleAddNodeMember(node.id, '+execute() bool')
                            }
                            className="min-h-[22px] px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-mono text-indigo-300"
                          >
                            +Method()
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleAddNodeMember(node.id, 'uuid id PK')
                            }
                            className="min-h-[22px] px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-mono text-purple-300"
                          >
                            +PK
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleAddNodeMember(node.id, 'uuid ref_id FK')
                            }
                            className="min-h-[22px] px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-mono text-amber-300"
                          >
                            +FK
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Collapsible Live Mermaid Code Split-Drawer (Docks side-by-side when in Expanded mode) */}
        {isLiveCodeOpen && layoutMode === 'expanded' && (
          <div
            id="live-mermaid-drawer"
            data-testid="live-mermaid-drawer"
            aria-label="Live Mermaid Code Drawer"
            className="w-80 border-l border-slate-800 bg-slate-950/95 p-3 flex flex-col gap-2 shrink-0"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                <Code2
                  className="w-3.5 h-3.5 text-emerald-400"
                  aria-hidden="true"
                />
                Live Mermaid Syntax
              </span>
              <button
                type="button"
                onClick={handleApplyLiveMermaid}
                className="min-h-[26px] px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-[11px] font-semibold flex items-center gap-1 transition"
              >
                <RefreshCw className="w-3 h-3" aria-hidden="true" />
                <span>Apply &amp; Layout</span>
              </button>
            </div>
            <textarea
              aria-label="Live Mermaid Code Input"
              value={liveMermaidInput}
              onChange={(e) => {
                setLiveMermaidInput(e.target.value);
                if (liveParseError) setLiveParseError(null);
              }}
              className="flex-1 w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 font-mono text-[11px] text-emerald-300 focus:outline-none focus:border-indigo-500 resize-none"
            />
            {liveParseError && (
              <p role="alert" className="text-[11px] text-rose-400">
                {liveParseError}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Bottom Collapsible Live Mermaid Code Split-Drawer (When not in Expanded mode) */}
      {isLiveCodeOpen && layoutMode !== 'expanded' && (
        <div
          id="live-mermaid-drawer"
          data-testid="live-mermaid-drawer"
          aria-label="Live Mermaid Code Drawer"
          className="border-t border-slate-800 bg-slate-950/95 p-3 space-y-2"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
              <Code2
                className="w-3.5 h-3.5 text-emerald-400"
                aria-hidden="true"
              />
              Live Mermaid Syntax (flowchart, stateDiagram-v2, sequenceDiagram,
              classDiagram, erDiagram)
            </span>
            <button
              type="button"
              onClick={handleApplyLiveMermaid}
              className="min-h-[26px] px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-[11px] font-semibold flex items-center gap-1 transition"
            >
              <RefreshCw className="w-3 h-3" aria-hidden="true" />
              <span>Apply &amp; Layout</span>
            </button>
          </div>
          <textarea
            aria-label="Live Mermaid Code Input"
            value={liveMermaidInput}
            onChange={(e) => {
              setLiveMermaidInput(e.target.value);
              if (liveParseError) setLiveParseError(null);
            }}
            className="w-full h-28 bg-slate-900 border border-slate-800 rounded-xl p-2.5 font-mono text-[11px] text-emerald-300 focus:outline-none focus:border-indigo-500"
          />
          {liveParseError && (
            <p role="alert" className="text-[11px] text-rose-400">
              {liveParseError}
            </p>
          )}
        </div>
      )}

      {/* Lucidchart Integration Modal */}
      <LucidModal
        isOpen={isLucidModalOpen}
        flowData={flowData}
        onClose={() => setIsLucidModalOpen(false)}
        onUpdateFlowData={(updated) => commitFlowUpdate(updated)}
        onNotify={onNotify}
      />
    </section>
  );
};
