import React, { useState, useRef, useEffect } from 'react';
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
} from 'lucide-react';
import {
  AccentColor,
  FlowchartState,
  FlowNode,
  FlowNodeType,
  FlowEdgeStyle,
  FlowEdgeArrow,
  FlowDirection,
  FlowSubgraph,
  MermaidDiagramType,
} from '../../types/sideflow';
import { defaultFlowData } from '../../utils/defaults';
import {
  computeDagLayout,
  computeEdgeGeometry,
  computeSubgraphBounds,
  formatMermaidEdgeOperator,
  formatSequenceMessageOperator,
  generateMermaidCode,
  generateStandaloneSVG,
  getMermaidTemplatePreset,
  MERMAID_TEMPLATES,
  MermaidTemplateId,
  parseMermaidCode,
} from '../../utils/mermaid';
import { LucidModal } from './LucidModal';

interface FlowCanvasProps {
  flowData: FlowchartState;
  onChangeFlowData: (
    updater: FlowchartState | ((prev: FlowchartState) => FlowchartState)
  ) => void;
  onNotify: (title: string, icon?: string, subtitle?: string) => void;
  onInsertMermaidToNote?: (mermaidCode: string) => void;
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

const ACCENT_CYCLE: Array<AccentColor | undefined> = [
  undefined,
  'indigo',
  'cyan',
  'emerald',
  'amber',
  'rose',
  'purple',
];

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

export const FlowCanvas: React.FC<FlowCanvasProps> = ({
  flowData,
  onChangeFlowData,
  onNotify,
  onInsertMermaidToNote,
}) => {
  const [connectMode, setConnectMode] = useState(false);
  const [connectSourceNodeId, setConnectSourceNodeId] = useState<string | null>(
    null
  );
  const [activeEdgeStyle, setActiveEdgeStyle] =
    useState<FlowEdgeStyle>('solid');
  const [activeEdgeArrow, setActiveEdgeArrow] =
    useState<FlowEdgeArrow>('arrow');

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
  const [isLucidModalOpen, setIsLucidModalOpen] = useState(false);
  const [isLiveCodeOpen, setIsLiveCodeOpen] = useState(false);
  const [liveMermaidInput, setLiveMermaidInput] = useState('');
  const [liveParseError, setLiveParseError] = useState<string | null>(null);

  // Option 3: Zoom & Pan state + Undo/Redo history stack
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const [, setHistoryTick] = useState<number>(0);
  const historyRef = useRef<{
    past: FlowchartState[];
    future: FlowchartState[];
  }>({ past: [], future: [] });

  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const draggingNodeIdRef = useRef<string | null>(null);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const draggingSubgraphRef = useRef<{
    id: string;
    lastClientX: number;
    lastClientY: number;
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
  const isSequenceDiagram = currentDiagramType === 'sequenceDiagram';

  // Helper that records undo history on discrete flowchart edits
  const commitFlowUpdate = (
    updater: FlowchartState | ((prev: FlowchartState) => FlowchartState)
  ) => {
    const next =
      typeof updater === 'function' ? updater(flowData) : updater;
    if (next !== flowData) {
      const snapshot = JSON.parse(JSON.stringify(flowData)) as FlowchartState;
      historyRef.current.past = [
        ...historyRef.current.past.slice(-29),
        snapshot,
      ];
      historyRef.current.future = [];
      setHistoryTick((t) => t + 1);
      onChangeFlowData(next);
    }
  };

  const handleUndo = () => {
    if (historyRef.current.past.length === 0) return;
    const previous =
      historyRef.current.past[historyRef.current.past.length - 1];
    historyRef.current.past = historyRef.current.past.slice(0, -1);
    historyRef.current.future = [
      JSON.parse(JSON.stringify(flowData)) as FlowchartState,
      ...historyRef.current.future.slice(0, 29),
    ];
    setHistoryTick((t) => t + 1);
    onChangeFlowData(previous);
  };

  const handleRedo = () => {
    if (historyRef.current.future.length === 0) return;
    const next = historyRef.current.future[0];
    historyRef.current.future = historyRef.current.future.slice(1);
    historyRef.current.past = [
      ...historyRef.current.past.slice(-29),
      JSON.parse(JSON.stringify(flowData)) as FlowchartState,
    ];
    setHistoryTick((t) => t + 1);
    onChangeFlowData(next);
  };

  const handleZoomIn = () => {
    setZoomLevel((z) => Math.min(1.75, Math.round((z + 0.15) * 100) / 100));
  };

  const handleZoomOut = () => {
    setZoomLevel((z) => Math.max(0.55, Math.round((z - 0.15) * 100) / 100));
  };

  const handleResetZoom = () => {
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
  };

  // Keep live Mermaid code drawer in sync when flowData changes on canvas
  useEffect(() => {
    if (isLiveCodeOpen) {
      setLiveMermaidInput(generateMermaidCode(flowData));
      setLiveParseError(null);
    }
  }, [flowData, isLiveCodeOpen]);

  // Allow Escape key to cancel Connect Mode or inline editing
  useEffect(() => {
    if (
      !connectMode &&
      editingEdgeIdx === null &&
      editingSubgraphId === null &&
      compartmentNodeId === null
    ) {
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setConnectMode(false);
        setConnectSourceNodeId(null);
        setEditingEdgeIdx(null);
        setEditingSubgraphId(null);
        setCompartmentNodeId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [connectMode, editingEdgeIdx, editingSubgraphId, compartmentNodeId]);

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

      if (draggingSubgraphRef.current) {
        const sgDrag = draggingSubgraphRef.current;
        const dx = Math.round((e.clientX - sgDrag.lastClientX) / zoomLevel);
        const dy = Math.round((e.clientY - sgDrag.lastClientY) / zoomLevel);
        if (dx === 0 && dy === 0) return;
        sgDrag.lastClientX = e.clientX;
        sgDrag.lastClientY = e.clientY;

        onChangeFlowData((prev) => {
          const targetSg = (prev.subgraphs || []).find(
            (s) => s.id === sgDrag.id
          );
          if (!targetSg) return prev;
          const memberSet = new Set(targetSg.nodeIds);
          return {
            ...prev,
            nodes: prev.nodes.map((n) =>
              memberSet.has(n.id)
                ? {
                    ...n,
                    x: Math.max(8, n.x + dx),
                    y: Math.max(8, n.y + dy),
                  }
                : n
            ),
          };
        });
        return;
      }

      const draggingId = draggingNodeIdRef.current;
      if (!draggingId || !canvasWrapperRef.current) return;

      const wrapperRect = canvasWrapperRef.current.getBoundingClientRect();
      const maxX = Math.max(160, (wrapperRect.width - 150) / zoomLevel);
      const maxY = Math.max(80, (wrapperRect.height - 64) / zoomLevel);

      const nextX = Math.max(
        8,
        Math.min(
          maxX,
          (e.clientX - wrapperRect.left - panOffset.x) / zoomLevel -
            dragOffsetRef.current.x
        )
      );
      const nextY = Math.max(
        8,
        Math.min(
          maxY,
          (e.clientY - wrapperRect.top - panOffset.y) / zoomLevel -
            dragOffsetRef.current.y
        )
      );

      onChangeFlowData((prev) => ({
        ...prev,
        nodes: prev.nodes.map((n) =>
          n.id === draggingId
            ? { ...n, x: Math.round(nextX), y: Math.round(nextY) }
            : n
        ),
      }));
    };

    const handleMouseUp = () => {
      draggingNodeIdRef.current = null;
      draggingSubgraphRef.current = null;
      panningCanvasRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [onChangeFlowData, zoomLevel, panOffset]);

  const handleAddNode = (type: FlowNodeType) => {
    commitFlowUpdate((prev) => {
      const existingIds = new Set(prev.nodes.map((n) => n.id));
      let candidateId = `n${prev.nodes.length + nodeCounterRef.current}`;
      while (existingIds.has(candidateId)) {
        nodeCounterRef.current += 1;
        candidateId = `n${prev.nodes.length + nodeCounterRef.current}`;
      }
      nodeCounterRef.current += 1;

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
  };

  const handleAddSubgraph = () => {
    commitFlowUpdate((prev) => {
      const existingSubgraphs = prev.subgraphs || [];
      const existingSgIds = new Set(existingSubgraphs.map((s) => s.id));
      let sgId = `sg_${existingSubgraphs.length + subgraphCounterRef.current}`;
      while (existingSgIds.has(sgId)) {
        subgraphCounterRef.current += 1;
        sgId = `sg_${existingSubgraphs.length + subgraphCounterRef.current}`;
      }
      const sgTitle = `Subgraph ${existingSubgraphs.length + 1}`;

      const alreadyGroupedIds = new Set(
        existingSubgraphs.flatMap((s) => s.nodeIds)
      );
      const ungroupedNodes = prev.nodes.filter(
        (n) => !alreadyGroupedIds.has(n.id)
      );

      let nextNodes = prev.nodes;
      let memberIds: string[];

      if (ungroupedNodes.length > 0) {
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
    currentCardinality?: string
  ) => {
    setEditingEdgeIdx(index);
    setEditingEdgeLabel(currentLabel || '');
    setEditingEdgeStyle(currentStyle || 'solid');
    setEditingEdgeArrow(currentArrow || 'arrow');
    setEditingEdgeCardinality(currentCardinality || '');
  };

  const commitEditingEdge = (
    index: number,
    overrideStyle?: FlowEdgeStyle,
    overrideArrow?: FlowEdgeArrow,
    overrideCardinality?: string
  ) => {
    const trimmed = editingEdgeLabel.trim();
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
        };
        return updated;
      }),
    }));
    setEditingEdgeIdx(null);
  };

  const createEdgeBetween = (sourceId: string, targetId: string) => {
    commitFlowUpdate((prev) => {
      const isSeq = prev.diagramType === 'sequenceDiagram';
      const exists =
        !isSeq &&
        prev.edges.some(
          (edge) => edge.from === sourceId && edge.to === targetId
        );
      if (exists) return prev;
      return {
        ...prev,
        edges: [
          ...prev.edges,
          {
            from: sourceId,
            to: targetId,
            ...(activeEdgeStyle !== 'solid' ? { style: activeEdgeStyle } : {}),
            ...(activeEdgeArrow !== 'arrow' ? { arrow: activeEdgeArrow } : {}),
          },
        ],
      };
    });
    setConnectSourceNodeId(null);
    setConnectMode(false);
  };

  const handleNodeMouseDown = (
    e: React.MouseEvent<HTMLDivElement>,
    node: FlowNode
  ) => {
    if (editingNodeId === node.id) return;

    if (connectMode) {
      e.stopPropagation();
      if (!connectSourceNodeId) {
        setConnectSourceNodeId(node.id);
      } else if (connectSourceNodeId !== node.id) {
        createEdgeBetween(connectSourceNodeId, node.id);
      }
      return;
    }

    draggingNodeIdRef.current = node.id;
    const wrapperRect = canvasWrapperRef.current?.getBoundingClientRect();
    if (wrapperRect) {
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

    const step = e.shiftKey ? 20 : 10;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
      const wrapperRect = canvasWrapperRef.current?.getBoundingClientRect();
      const maxX =
        wrapperRect && wrapperRect.width > 0
          ? Math.max(160, wrapperRect.width - 150)
          : 420;
      const maxY =
        wrapperRect && wrapperRect.height > 0
          ? Math.max(80, wrapperRect.height - 64)
          : 500;
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
                x: Math.max(8, Math.min(maxX, n.x + dx)),
                y: Math.max(8, Math.min(maxY, n.y + dy)),
              }
            : n
        ),
      }));
      return;
    }

    if (e.key === 'Enter' || e.key === ' ') {
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
    }
  };

  const startEditingNode = (node: FlowNode) => {
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
    setEditingEdgeIdx(null);
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
    onNotify('Restored Demo Flowchart', 'check', '4 nodes • 3 connections');
  };

  const handleClearCanvas = () => {
    commitFlowUpdate({ nodes: [], edges: [] });
    setConnectMode(false);
    setConnectSourceNodeId(null);
    setEditingEdgeIdx(null);
    onNotify('Cleared Flowchart Canvas', 'check', 'Ready for a new diagram');
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

  const sourceNode = connectSourceNodeId
    ? flowData.nodes.find((n) => n.id === connectSourceNodeId)
    : null;

  const activeOpPreview = isSequenceDiagram
    ? formatSequenceMessageOperator(activeEdgeStyle, activeEdgeArrow)
    : formatMermaidEdgeOperator(activeEdgeStyle, activeEdgeArrow);

  const statusMessage = connectMode
    ? sourceNode
      ? `Selected "${sourceNode.text}". Click destination node (${activeOpPreview}) or Esc to cancel.`
      : `Click source node first, then destination node (${activeOpPreview}, Esc to cancel).`
    : "Drag nodes to move • Double-click text to edit • Click 'Connect' to link nodes";

  const subgraphBoundsList = (flowData.subgraphs || [])
    .map((sg) => computeSubgraphBounds(sg, flowData.nodes))
    .filter((b): b is NonNullable<typeof b> => b !== null);

  const canUndo = historyRef.current.past.length > 0;
  const canRedo = historyRef.current.future.length > 0;

  return (
    <section
      id="tab-flowchart"
      aria-label="Flowchart Scratchpad"
      className="tab-content flex-1 flex flex-col overflow-hidden"
    >
      {/* Primary Flowchart Toolbar */}
      <div className="p-3 border-b border-slate-800 bg-slate-950/50 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
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
            title="Undo Flowchart Edit"
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 text-xs"
          >
            <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={handleRedo}
            disabled={!canRedo}
            aria-label="Redo Flowchart Edit"
            title="Redo Flowchart Edit"
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 text-xs"
          >
            <Redo2 className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setIsLiveCodeOpen((prev) => !prev)}
            aria-label="Toggle Live Mermaid Editor"
            aria-pressed={isLiveCodeOpen}
            title="Toggle Live Mermaid Code Drawer"
            className={`p-1.5 rounded-lg text-xs transition ${
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
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
          >
            <LayoutGrid className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={handleResetDemo}
            aria-label="Reset Demo Flowchart"
            title="Reset Demo Flowchart"
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={handleClearCanvas}
            aria-label="Clear Canvas"
            title="Clear Canvas"
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 hover:text-rose-300 text-slate-300 text-xs"
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

      {/* Secondary Mermaid Primitives Bar: Extra Shapes, Subgraphs, Diagram Type, Templates & Direction */}
      <div
        id="flow-primitives-bar"
        className="px-3 py-1.5 border-b border-slate-800/80 bg-slate-900/60 flex flex-wrap items-center justify-between gap-2 text-[11px]"
      >
        {/* Additional Mermaid Node Shapes + Subgraph Group */}
        <div
          role="group"
          aria-label="Additional Mermaid Shapes"
          className="flex items-center gap-1 flex-wrap"
        >
          {EXTRA_SHAPE_BUTTONS.map(
            ({ type, label, title, colorClass, Icon }) => (
              <button
                key={type}
                type="button"
                onClick={() => handleAddNode(type)}
                title={title}
                className={`px-2 py-1 rounded-md bg-slate-800/90 hover:bg-slate-700 border border-slate-700/80 ${colorClass} flex items-center gap-1 transition`}
              >
                <Icon className="w-3 h-3" aria-hidden="true" />
                <span>{label}</span>
              </button>
            )
          )}
          <button
            type="button"
            onClick={handleAddSubgraph}
            aria-label="Add Subgraph Group"
            title="Wrap nodes in a Mermaid subgraph ... end container"
            className="px-2 py-1 rounded-md bg-slate-800/90 hover:bg-slate-700 border border-dashed border-slate-600 text-slate-200 flex items-center gap-1 transition"
          >
            <BoxSelect className="w-3 h-3 text-indigo-300" aria-hidden="true" />
            <span>Subgraph</span>
          </button>
        </div>

        {/* Diagram Mode + Templates + Edge Style/Arrow + Flow Direction Controls */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <select
            aria-label="Mermaid Diagram Type"
            title="Mermaid Diagram Syntax Mode"
            value={currentDiagramType}
            onChange={(e) =>
              handleChangeDiagramType(e.target.value as MermaidDiagramType)
            }
            className="bg-slate-800 border border-indigo-500/40 text-indigo-200 rounded-md px-1.5 py-0.5 text-[11px] font-medium focus:outline-none focus:border-indigo-500"
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
            className="bg-slate-800 border border-slate-700 text-slate-200 rounded-md px-1.5 py-0.5 text-[11px] focus:outline-none focus:border-indigo-500"
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
            aria-label="Connector Line Style"
            title="Connector Line Style"
            value={activeEdgeStyle}
            onChange={(e) =>
              setActiveEdgeStyle(e.target.value as FlowEdgeStyle)
            }
            className="bg-slate-800 border border-slate-700 text-slate-200 rounded-md px-1.5 py-0.5 text-[11px] focus:outline-none focus:border-indigo-500"
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
            className="bg-slate-800 border border-slate-700 text-slate-200 rounded-md px-1.5 py-0.5 text-[11px] focus:outline-none focus:border-indigo-500"
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
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold transition ${
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

      {/* Helper Subbar + Zoom Controls + Insert to Note + SVG Export */}
      <div
        id="flow-helper-bar"
        className="px-3.5 py-1.5 bg-indigo-950/40 border-b border-indigo-500/20 flex flex-wrap items-center justify-between gap-2 text-[11px] text-indigo-200"
      >
        <span
          id="flow-status-msg"
          role="status"
          aria-live="polite"
          className="truncate max-w-[260px] sm:max-w-xs"
        >
          {statusMessage}
        </span>
        <div className="flex items-center gap-2">
          <div
            role="group"
            aria-label="Canvas Zoom Controls"
            className="flex items-center gap-0.5 bg-slate-900/80 border border-slate-700/80 rounded-md px-1 py-0.5"
          >
            <button
              type="button"
              onClick={handleZoomOut}
              aria-label="Zoom Out Flowchart"
              title="Zoom Out"
              className="p-0.5 text-slate-300 hover:text-white"
            >
              <ZoomOut className="w-3 h-3" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={handleResetZoom}
              aria-label="Reset Flowchart Zoom"
              title="Reset Zoom & Pan (100%)"
              className="px-1 font-mono text-[10px] text-indigo-300 hover:text-white"
            >
              {Math.round(zoomLevel * 100)}%
            </button>
            <button
              type="button"
              onClick={handleZoomIn}
              aria-label="Zoom In Flowchart"
              title="Zoom In"
              className="p-0.5 text-slate-300 hover:text-white"
            >
              <ZoomIn className="w-3 h-3" aria-hidden="true" />
            </button>
          </div>

          {onInsertMermaidToNote && (
            <button
              type="button"
              aria-label="Insert Mermaid into Note"
              onClick={() =>
                onInsertMermaidToNote(generateMermaidCode(flowData))
              }
              title="Append fenced ```mermaid code block into active Note"
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-400/40 text-indigo-200 hover:text-white transition"
            >
              <FileText className="w-3 h-3" aria-hidden="true" />
              <span>To Note</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleExportSVG}
            className="underline hover:text-white"
          >
            Download SVG
          </button>
        </div>
      </div>

      {/* Interactive SVG + HTML Flowchart Canvas */}
      <div
        ref={canvasWrapperRef}
        id="flow-canvas-wrapper"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) {
            if (connectMode) {
              setConnectMode(false);
              setConnectSourceNodeId(null);
            } else {
              panningCanvasRef.current = {
                lastClientX: e.clientX,
                lastClientY: e.clientY,
              };
            }
          }
        }}
        className="relative flex-1 canvas-grid overflow-hidden bg-slate-950"
      >
        {flowData.nodes.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center z-10 pointer-events-none">
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 max-w-xs space-y-3 pointer-events-auto shadow-xl">
              <p className="text-xs font-semibold text-white">
                Flowchart Canvas is Empty
              </p>
              <p className="text-[11px] text-slate-400">
                Add a Process, Decision, Terminal, or specialized Mermaid shape
                from the toolbar above, or restore the starter diagram.
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
                className="absolute rounded-2xl bg-slate-900/45 border border-dashed border-indigo-400/40 pointer-events-none transition-all"
              >
                <div
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    draggingSubgraphRef.current = {
                      id: bounds.id,
                      lastClientX: e.clientX,
                      lastClientY: e.clientY,
                    };
                  }}
                  className="pointer-events-auto cursor-move px-3 py-1 rounded-t-2xl bg-slate-900/80 border-b border-slate-800/80 flex items-center justify-between gap-2 group"
                >
                  {editingSubgraphId === bounds.id ? (
                    <input
                      type="text"
                      aria-label="Edit subgraph title"
                      value={editingSubgraphTitle}
                      onChange={(e) => setEditingSubgraphTitle(e.target.value)}
                      onBlur={() => commitEditingSubgraph(bounds.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitEditingSubgraph(bounds.id);
                        if (e.key === 'Escape') setEditingSubgraphId(null);
                      }}
                      autoFocus
                      className="bg-slate-950 text-indigo-200 text-[10px] px-1.5 py-0.5 rounded border border-indigo-400 focus:outline-none"
                    />
                  ) : (
                    <span
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setEditingSubgraphId(bounds.id);
                        setEditingSubgraphTitle(bounds.title);
                      }}
                      title="Double-click to rename subgraph • Drag to move group"
                      className="text-[10px] font-semibold uppercase tracking-wider text-indigo-300/90 truncate"
                    >
                      {bounds.title}
                    </span>
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

          {/* SVG Layer for Sequence Lifelines & Directed Arrows */}
          <svg
            id="flow-svg-layer"
            className="absolute inset-0 w-full h-full pointer-events-none"
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

            {isSequenceDiagram && (
              <g id="flow-lifelines-group" data-testid="flow-lifelines-group">
                {flowData.nodes.map((n) => {
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
              {flowData.edges.map((edge, idx) => {
                const fromNode = flowData.nodes.find((n) => n.id === edge.from);
                const toNode = flowData.nodes.find((n) => n.id === edge.to);
                if (!fromNode || !toNode) return null;

                let pathData: string;
                let midX: number;
                let midY: number;

                if (isSequenceDiagram) {
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

                return (
                  <g
                    key={`${edge.from}-${edge.to}-${idx}`}
                    data-testid={`flow-edge-${idx}`}
                    onClick={() => handleDeleteEdge(idx)}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      startEditingEdge(
                        idx,
                        edge.label,
                        edge.style,
                        edge.arrow,
                        edge.cardinality
                      );
                    }}
                    className="pointer-events-auto cursor-pointer group"
                  >
                    <title>
                      Click to remove connector • Double-click to label
                    </title>
                    <path
                      d={pathData}
                      stroke="transparent"
                      strokeWidth="12"
                      fill="none"
                    />
                    <path
                      d={pathData}
                      stroke="#818cf8"
                      strokeWidth={strokeWidth}
                      strokeDasharray={strokeDasharray}
                      fill="none"
                      markerStart={markerStart}
                      markerEnd={markerEnd}
                      className="group-hover:stroke-rose-400 transition-colors"
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
          </svg>

          {/* HTML Layer for Edge Label Badges & Inline Editor */}
          <div
            id="flow-edge-labels-layer"
            className="absolute inset-0 w-full h-full pointer-events-none"
          >
            {flowData.edges.map((edge, idx) => {
              const fromNode = flowData.nodes.find((n) => n.id === edge.from);
              const toNode = flowData.nodes.find((n) => n.id === edge.to);
              if (!fromNode || !toNode) return null;

              let midX: number;
              let midY: number;
              if (isSequenceDiagram) {
                const x1 = fromNode.x + 72;
                const x2 = toNode.x + 72;
                midX = Math.round((x1 + x2) / 2);
                midY = 115 + idx * 46;
              } else {
                const geom = computeEdgeGeometry(
                  fromNode,
                  toNode,
                  144,
                  52,
                  flowData.direction
                );
                midX = geom.midX;
                midY = geom.midY;
              }

              if (editingEdgeIdx === idx) {
                return (
                  <div
                    key={`edge-editor-${idx}`}
                    data-testid="uml-edge-toolbar"
                    role="toolbar"
                    aria-label="Edge Relationship Toolbar"
                    style={{ left: `${midX}px`, top: `${midY}px` }}
                    className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 z-20 bg-slate-900/95 border border-indigo-400 rounded-xl p-1.5 shadow-xl flex flex-col gap-1 items-center"
                  >
                    <input
                      type="text"
                      aria-label="Edit connector label"
                      value={editingEdgeLabel}
                      onChange={(e) => setEditingEdgeLabel(e.target.value)}
                      onBlur={(e) => {
                        if (
                          e.relatedTarget &&
                          e.currentTarget.parentElement?.contains(
                            e.relatedTarget as Node
                          )
                        ) {
                          return;
                        }
                        commitEditingEdge(idx);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitEditingEdge(idx);
                        if (e.key === 'Escape') setEditingEdgeIdx(null);
                      }}
                      placeholder="Label..."
                      autoFocus
                      className="w-28 bg-slate-950 text-indigo-200 text-[10px] px-2 py-0.5 rounded-full border border-indigo-500/60 focus:outline-none text-center"
                    />
                    <div className="flex items-center gap-1 flex-wrap justify-center">
                      <select
                        aria-label="Edit edge line style"
                        value={editingEdgeStyle}
                        onChange={(e) => {
                          const nextStyle = e.target.value as FlowEdgeStyle;
                          setEditingEdgeStyle(nextStyle);
                          commitEditingEdge(idx, nextStyle, editingEdgeArrow);
                        }}
                        className="bg-slate-800 border border-slate-700 text-slate-200 rounded px-1 py-0.5 text-[9px]"
                      >
                        <option value="solid">Solid</option>
                        <option value="dotted">Dotted</option>
                        <option value="thick">Thick</option>
                      </select>
                      <select
                        aria-label="Edit edge arrow type"
                        value={editingEdgeArrow}
                        onChange={(e) => {
                          const nextArrow = e.target.value as FlowEdgeArrow;
                          setEditingEdgeArrow(nextArrow);
                          commitEditingEdge(idx, editingEdgeStyle, nextArrow);
                        }}
                        className="bg-slate-800 border border-slate-700 text-slate-200 rounded px-1 py-0.5 text-[9px]"
                      >
                        <option value="arrow">--&gt;</option>
                        <option value="bidirectional">&lt;--&gt;</option>
                        <option value="none">---</option>
                        <option value="circle">--o</option>
                        <option value="cross">--x</option>
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
                            nextCard
                          );
                        }}
                        className="bg-slate-800 border border-indigo-500/40 text-cyan-300 font-mono rounded px-1 py-0.5 text-[9px]"
                      >
                        <option value="">Standard</option>
                        <option value="<|--">&lt;|-- Inherits</option>
                        <option value="*--">*-- Composes</option>
                        <option value="o--">o-- Aggregates</option>
                        <option value="<|..">&lt;|.. Implements</option>
                        <option value="..>">..&gt; Depends</option>
                        <option value="-->">--&gt; Associates</option>
                        <option value="||--o{">||--o&#123; 1 : 0..N</option>
                        <option value="||--|{">||--|&#123; 1 : 1..N</option>
                        <option value="||--||">||--|| 1 : 1</option>
                        <option value="}|..|{">&#125;|..|&#123; N : M</option>
                        <option value="|o..o|">|o..o| 0..1 : 0..1</option>
                      </select>
                    </div>
                  </div>
                );
              }

              const badgeText =
                edge.cardinality && edge.label
                  ? `${edge.cardinality} ${edge.label}`
                  : edge.label || edge.cardinality || '+';

              return (
                <button
                  key={`edge-badge-${idx}`}
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
                      edge.cardinality
                    );
                  }}
                  style={{ left: `${midX}px`, top: `${midY}px` }}
                  className={`pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 z-10 rounded-full transition ${
                    edge.label || edge.cardinality
                      ? 'px-2 py-0.5 bg-slate-900/95 border border-indigo-500/50 text-[10px] font-medium text-indigo-200 hover:border-indigo-400 shadow'
                      : 'w-4 h-4 bg-slate-900/80 border border-slate-700 text-[9px] text-slate-400 opacity-0 hover:opacity-100 focus:opacity-100 flex items-center justify-center'
                  }`}
                >
                  {badgeText}
                </button>
              );
            })}
          </div>

          {/* HTML Layer for Draggable Nodes */}
          <div
            id="flow-nodes-layer"
            className="absolute inset-0 w-full h-full pointer-events-none"
          >
            {flowData.nodes.map((node) => {
              let radiusAndBorder = 'rounded-xl border-2';
              let colorTheme = 'bg-sky-950/90 border-sky-400/70 text-sky-100';

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
                colorTheme = 'bg-cyan-950/90 border-cyan-400/80 text-cyan-100';
              } else if (node.type === 'circle') {
                radiusAndBorder =
                  'rounded-full border-2 ring-1 ring-rose-400/30';
                colorTheme = 'bg-rose-950/90 border-rose-400/80 text-rose-100';
              } else if (node.type === 'hexagon') {
                radiusAndBorder = 'rounded-xl border-2 border-x-[6px]';
                colorTheme =
                  'bg-orange-950/90 border-orange-400/80 text-orange-100';
              } else if (node.type === 'asymmetric') {
                radiusAndBorder =
                  'rounded-r-2xl rounded-l-sm border-2 border-l-[6px]';
                colorTheme = 'bg-teal-950/90 border-teal-400/80 text-teal-100';
              }

              if (node.color && NODE_COLOR_CLASSES[node.color]) {
                colorTheme = NODE_COLOR_CLASSES[node.color];
              }

              let shapeClasses = `${radiusAndBorder} ${colorTheme}`;
              if (connectMode && connectSourceNodeId === node.id) {
                shapeClasses += ' ring-4 ring-indigo-500';
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
                  data-testid={`flow-node-${node.id}`}
                  style={{ left: `${node.x}px`, top: `${node.y}px` }}
                  onMouseDown={(e) => handleNodeMouseDown(e, node)}
                  onKeyDown={(e) => handleNodeKeyDown(e, node)}
                  className={`pointer-events-auto absolute w-36 min-h-[52px] px-3 py-2 shadow-xl flex flex-col items-center justify-center text-center text-xs font-medium cursor-move select-none transition-shadow group ${shapeClasses}`}
                >
                  {node.stereotype && (
                    <span
                      data-testid={`flow-node-stereotype-${node.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setCompartmentNodeId(node.id);
                      }}
                      title="Click to edit UML stereotype & members"
                      className="text-[9px] italic text-amber-300/90 leading-tight mb-0.5 cursor-pointer hover:underline"
                    >
                      &lt;&lt;{node.stereotype}&gt;&gt;
                    </span>
                  )}

                  {editingNodeId === node.id ? (
                    <input
                      type="text"
                      aria-label="Edit node label"
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      onBlur={() => commitEditingNode(node.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitEditingNode(node.id);
                        if (e.key === 'Escape') setEditingNodeId(null);
                      }}
                      autoFocus
                      className={`w-full bg-slate-900 text-white text-xs px-1.5 py-0.5 rounded border border-indigo-400 focus:outline-none text-center ${
                        node.type === 'io' ? 'skew-x-6' : ''
                      }`}
                    />
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
                      className="w-full mt-1.5 pt-1 border-t border-slate-500/40 text-left font-mono text-[9px] text-slate-200/90 space-y-0.5 cursor-pointer hover:text-white"
                    >
                      {node.members.map((member, mIdx) => (
                        <div key={`${node.id}-m-${mIdx}`} className="truncate">
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
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCycleNodeColor(node.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 absolute -top-2 -left-2 w-5 h-5 rounded-full bg-slate-800 border border-slate-600 text-slate-200 hover:text-indigo-300 flex items-center justify-center shadow"
                  >
                    <Palette className="w-2.5 h-2.5" aria-hidden="true" />
                  </button>

                  <button
                    type="button"
                    aria-label={`Edit compartment for ${node.text}`}
                    data-testid={`edit-compartment-btn-${node.id}`}
                    title="Edit UML stereotype & class/ER members"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCompartmentNodeId((prev) =>
                        prev === node.id ? null : node.id
                      );
                      setNewMemberInput('');
                    }}
                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 absolute -top-2 left-4 w-5 h-5 rounded-full bg-slate-800 border border-slate-600 text-slate-200 hover:text-cyan-300 flex items-center justify-center shadow"
                  >
                    <ListPlus className="w-2.5 h-2.5" aria-hidden="true" />
                  </button>

                  <button
                    type="button"
                    aria-label={`Delete node ${node.text}`}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteNode(node.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 absolute -top-2 -right-2 w-5 h-5 rounded-full bg-rose-600 text-white flex items-center justify-center text-[10px] shadow"
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
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === 'Escape') {
                          setCompartmentNodeId(null);
                        }
                      }}
                      className="pointer-events-auto absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 w-64 rounded-xl border border-indigo-500/60 bg-slate-900/95 p-2.5 shadow-2xl text-left text-[10px] text-slate-100 flex flex-col gap-2 cursor-default"
                    >
                      <div className="flex items-center justify-between border-b border-slate-800 pb-1">
                        <span className="font-semibold text-indigo-300 truncate">
                          {node.text} Compartment
                        </span>
                        <button
                          type="button"
                          aria-label="Close compartment editor"
                          onClick={() => setCompartmentNodeId(null)}
                          className="text-slate-400 hover:text-white px-1 text-xs leading-none"
                        >
                          ×
                        </button>
                      </div>

                      <div className="flex items-center justify-between gap-1.5">
                        <label
                          htmlFor={`stereo-select-${node.id}`}
                          className="text-slate-400 text-[9px]"
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
                          className="bg-slate-800 border border-slate-700 text-amber-300 font-mono rounded px-1.5 py-0.5 text-[9px] focus:outline-none focus:border-indigo-500"
                        >
                          <option value="">None</option>
                          <option value="interface">&lt;&lt;interface&gt;&gt;</option>
                          <option value="abstract">&lt;&lt;abstract&gt;&gt;</option>
                          <option value="service">&lt;&lt;service&gt;&gt;</option>
                          <option value="enumeration">&lt;&lt;enumeration&gt;&gt;</option>
                          <option value="entity">&lt;&lt;entity&gt;&gt;</option>
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
                                className="flex-1 bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 font-mono text-[9px] text-slate-200 focus:outline-none focus:border-indigo-500"
                              />
                              <button
                                type="button"
                                aria-label={`Remove member ${member}`}
                                data-testid={`uml-member-remove-${mIdx}`}
                                onClick={() =>
                                  handleRemoveNodeMember(node.id, mIdx)
                                }
                                className="text-slate-400 hover:text-rose-400 px-1 text-xs leading-none"
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
                          className="flex-1 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 font-mono text-[9px] text-emerald-300 focus:outline-none focus:border-indigo-500"
                        />
                        <button
                          type="submit"
                          aria-label="Add node member"
                          data-testid="uml-member-add-btn"
                          className="px-1.5 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[9px] font-medium"
                        >
                          + Add
                        </button>
                      </form>

                      <div className="flex items-center gap-1 flex-wrap pt-0.5 border-t border-slate-800/80">
                        <span className="text-[8px] text-slate-400">Quick:</span>
                        <button
                          type="button"
                          onClick={() =>
                            handleAddNodeMember(node.id, '+String id')
                          }
                          className="px-1 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[8px] font-mono text-sky-300"
                        >
                          +Field
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleAddNodeMember(node.id, '+execute() bool')
                          }
                          className="px-1 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[8px] font-mono text-indigo-300"
                        >
                          +Method()
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleAddNodeMember(node.id, 'uuid id PK')
                          }
                          className="px-1 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[8px] font-mono text-purple-300"
                        >
                          +PK
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleAddNodeMember(node.id, 'uuid ref_id FK')
                          }
                          className="px-1 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[8px] font-mono text-amber-300"
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

      {/* Collapsible Live Mermaid Code Split-Drawer */}
      {isLiveCodeOpen && (
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
              Live Mermaid Syntax (flowchart, stateDiagram-v2, sequenceDiagram, classDiagram, erDiagram)
            </span>
            <button
              type="button"
              onClick={handleApplyLiveMermaid}
              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-medium flex items-center gap-1 transition"
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
