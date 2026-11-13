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
  Map as MapIcon,
  Search,
  ArrowLeftRight,
  GitBranch,
  Activity,
  ChevronDown,
  ChevronRight,
  Minimize2,
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
  ACCENT_HEX_PALETTE,
  alignOrDistributeNodes,
  analyzeFlowchartHealth,
  autoFitSubgraphNodes,
  branchDecisionYesNo,
  computeConnectedPath,
  computeDagLayout,
  computeEdgeGeometry,
  computeParallelEdgeOffsets,
  computeSubgraphBounds,
  FlowAlignmentMode,
  FlowchartHealthIssue,
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
import { FlowMinimap } from './FlowMinimap';

interface FlowCanvasProps {
  flowData: FlowchartState;
  onChangeFlowData: (
    updater: FlowchartState | ((prev: FlowchartState) => FlowchartState)
  ) => void;
  onNotify: NotifyFn;
  onInsertMermaidToNote?: (mermaidCode: string) => void;
  panelWidthPercent?: number;
}

export type ShapeCategoryId = 'all' | 'basic' | 'process' | 'data';

const SHAPE_CATEGORIES: Array<{ id: ShapeCategoryId; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'basic', label: 'Basic' },
  { id: 'process', label: 'Process' },
  { id: 'data', label: 'Data' },
];

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
  document: 'Document',
  manual: 'Manual Op',
  trapezoid: 'Priority Op',
  delay: 'Wait / Delay',
  note: 'Sticky Note',
};

const ALL_NODE_SHAPES: Array<{
  type: FlowNodeType;
  label: string;
  shortLabel: string;
  category: Exclude<ShapeCategoryId, 'all'>;
  syntaxHint: string;
}> = [
  {
    type: 'process',
    label: 'Process Box',
    shortLabel: 'Process',
    category: 'basic',
    syntaxHint: '["..."]',
  },
  {
    type: 'decision',
    label: 'Decision Diamond',
    shortLabel: 'Decision',
    category: 'basic',
    syntaxHint: '{"..."}',
  },
  {
    type: 'start',
    label: 'Start / End Terminal',
    shortLabel: 'Terminal',
    category: 'basic',
    syntaxHint: '(["..."])',
  },
  {
    type: 'circle',
    label: 'Circle Node',
    shortLabel: 'Circle',
    category: 'basic',
    syntaxHint: '(("..."))',
  },
  {
    type: 'subroutine',
    label: 'Subroutine',
    shortLabel: 'Sub',
    category: 'process',
    syntaxHint: '[["..."]]',
  },
  {
    type: 'hexagon',
    label: 'Hexagon Prepare',
    shortLabel: 'Hex',
    category: 'process',
    syntaxHint: '{{"..."}}',
  },
  {
    type: 'manual',
    label: 'Manual Operation',
    shortLabel: 'Manual',
    category: 'process',
    syntaxHint: '[\\"..."/]',
  },
  {
    type: 'trapezoid',
    label: 'Priority Trapezoid',
    shortLabel: 'Trap',
    category: 'process',
    syntaxHint: '[/"..."\\]',
  },
  {
    type: 'delay',
    label: 'Delay / Wait Gate',
    shortLabel: 'Delay',
    category: 'process',
    syntaxHint: '@{delay}',
  },
  {
    type: 'asymmetric',
    label: 'Signal / Flag',
    shortLabel: 'Flag',
    category: 'process',
    syntaxHint: '>"..."]',
  },
  {
    type: 'database',
    label: 'Database Cylinder',
    shortLabel: 'DB',
    category: 'data',
    syntaxHint: '[("...")]',
  },
  {
    type: 'io',
    label: 'Input / Output',
    shortLabel: 'I/O',
    category: 'data',
    syntaxHint: '[/"..."/]',
  },
  {
    type: 'document',
    label: 'Document Wave',
    shortLabel: 'Doc',
    category: 'data',
    syntaxHint: '@{doc}',
  },
  {
    type: 'note',
    label: 'Callout / Note',
    shortLabel: 'Note',
    category: 'data',
    syntaxHint: '@{note}',
  },
];

const SHAPE_DEFAULT_THEME_HEX: Record<
  FlowNodeType,
  { fill: string; stroke: string }
> = {
  process: { fill: '#082f49', stroke: '#38bdf8' },
  decision: { fill: '#451a03', stroke: '#fbbf24' },
  start: { fill: '#022c22', stroke: '#34d399' },
  database: { fill: '#2e1065', stroke: '#a78bfa' },
  subroutine: { fill: '#1e1b4b', stroke: '#818cf8' },
  io: { fill: '#083344', stroke: '#22d3ee' },
  circle: { fill: '#4c0519', stroke: '#fb7185' },
  hexagon: { fill: '#431407', stroke: '#fb923c' },
  asymmetric: { fill: '#042f2e', stroke: '#2dd4bf' },
  document: { fill: '#1e1b4b', stroke: '#818cf8' },
  manual: { fill: '#451a03', stroke: '#fbbf24' },
  trapezoid: { fill: '#022c22', stroke: '#34d399' },
  delay: { fill: '#4c0519', stroke: '#fb7185' },
  note: { fill: '#422006', stroke: '#facc15' },
};

const MiniShapeIcon: React.FC<{
  type: FlowNodeType;
  className?: string;
}> = ({ type, className = 'w-6 h-4' }) => {
  const { fill, stroke } =
    SHAPE_DEFAULT_THEME_HEX[type] || SHAPE_DEFAULT_THEME_HEX.process;
  return (
    <svg
      viewBox="0 0 36 22"
      aria-hidden="true"
      className={`shrink-0 overflow-visible ${className}`}
    >
      {type === 'decision' && (
        <polygon
          points="18,1 35,11 18,21 1,11"
          fill={fill}
          stroke={stroke}
          strokeWidth="2"
          strokeLinejoin="round"
        />
      )}
      {type === 'start' && (
        <rect
          x="1"
          y="2"
          width="34"
          height="18"
          rx="9"
          fill={fill}
          stroke={stroke}
          strokeWidth="2"
        />
      )}
      {type === 'circle' && (
        <>
          <circle
            cx="18"
            cy="11"
            r="9.5"
            fill={fill}
            stroke={stroke}
            strokeWidth="2"
          />
          <circle
            cx="18"
            cy="11"
            r="6.5"
            fill="none"
            stroke={stroke}
            strokeWidth="1"
            strokeOpacity="0.55"
          />
        </>
      )}
      {type === 'database' && (
        <>
          <path
            d="M 3,5 V 17 A 15,3.5 0 0,0 33,17 V 5 Z"
            fill={fill}
            stroke={stroke}
            strokeWidth="1.8"
          />
          <ellipse
            cx="18"
            cy="5"
            rx="15"
            ry="3.5"
            fill={fill}
            stroke={stroke}
            strokeWidth="1.8"
          />
        </>
      )}
      {type === 'subroutine' && (
        <>
          <rect
            x="1"
            y="2"
            width="34"
            height="18"
            rx="3"
            fill={fill}
            stroke={stroke}
            strokeWidth="1.8"
          />
          <line
            x1="6"
            y1="2"
            x2="6"
            y2="20"
            stroke={stroke}
            strokeWidth="1.6"
          />
          <line
            x1="30"
            y1="2"
            x2="30"
            y2="20"
            stroke={stroke}
            strokeWidth="1.6"
          />
        </>
      )}
      {type === 'io' && (
        <polygon
          points="6,2 35,2 30,20 1,20"
          fill={fill}
          stroke={stroke}
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      )}
      {type === 'hexagon' && (
        <polygon
          points="7,2 29,2 35,11 29,20 7,20 1,11"
          fill={fill}
          stroke={stroke}
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      )}
      {type === 'asymmetric' && (
        <polygon
          points="1,2 29,2 35,11 29,20 1,20 6,11"
          fill={fill}
          stroke={stroke}
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      )}
      {type === 'document' && (
        <path
          d="M 2,2 H 34 V 16 Q 26,22 18,17 T 2,17 Z"
          fill={fill}
          stroke={stroke}
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      )}
      {type === 'manual' && (
        <polygon
          points="1,2 35,2 30,20 6,20"
          fill={fill}
          stroke={stroke}
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      )}
      {type === 'trapezoid' && (
        <polygon
          points="6,2 30,2 35,20 1,20"
          fill={fill}
          stroke={stroke}
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      )}
      {type === 'delay' && (
        <path
          d="M 2,2 H 24 A 10,9 0 0,1 24,20 H 2 Z"
          fill={fill}
          stroke={stroke}
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      )}
      {type === 'note' && (
        <>
          <path
            d="M 2,2 H 28 L 34,8 V 20 H 2 Z"
            fill={fill}
            stroke={stroke}
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path
            d="M 28,2 V 8 H 34"
            fill="none"
            stroke={stroke}
            strokeWidth="1.5"
          />
        </>
      )}
      {type === 'process' && (
        <rect
          x="1"
          y="2"
          width="34"
          height="18"
          rx="4"
          fill={fill}
          stroke={stroke}
          strokeWidth="2"
        />
      )}
    </svg>
  );
};

const NodeShapeSvg: React.FC<{
  nodeId: string;
  type: FlowNodeType;
  color?: AccentColor;
  hasCompartment?: boolean;
}> = ({ nodeId, type, color, hasCompartment }) => {
  const defaultTheme =
    SHAPE_DEFAULT_THEME_HEX[type] || SHAPE_DEFAULT_THEME_HEX.process;
  const palette = color ? ACCENT_HEX_PALETTE[color] : defaultTheme;
  const fill = palette.fill;
  const stroke = palette.stroke;

  return (
    <svg
      data-testid={`node-shape-svg-${nodeId}`}
      aria-hidden="true"
      viewBox="0 0 144 52"
      preserveAspectRatio="none"
      className="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
    >
      {hasCompartment ? (
        <rect
          x="1"
          y="1"
          width="142"
          height="50"
          rx="10"
          fill={fill}
          fillOpacity="0.92"
          stroke={stroke}
          strokeWidth="2"
        />
      ) : type === 'decision' ? (
        <>
          <polygon
            points="72,1 143,26 72,51 1,26"
            fill={fill}
            fillOpacity="0.94"
            stroke={stroke}
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <polygon
            points="72,5 135,26 72,47 9,26"
            fill="none"
            stroke={stroke}
            strokeOpacity="0.35"
            strokeWidth="1"
            strokeDasharray="4,3"
          />
        </>
      ) : type === 'start' ? (
        <rect
          x="1"
          y="1"
          width="142"
          height="50"
          rx="25"
          fill={fill}
          fillOpacity="0.92"
          stroke={stroke}
          strokeWidth="2"
        />
      ) : type === 'circle' ? (
        <>
          <rect
            x="1"
            y="1"
            width="142"
            height="50"
            rx="25"
            fill={fill}
            fillOpacity="0.92"
            stroke={stroke}
            strokeWidth="2"
          />
          <rect
            x="5"
            y="5"
            width="134"
            height="42"
            rx="21"
            fill="none"
            stroke={stroke}
            strokeOpacity="0.4"
            strokeWidth="1.2"
          />
        </>
      ) : type === 'database' ? (
        <>
          <path
            d="M 1,9 V 43 A 71,8 0 0,0 143,43 V 9 Z"
            fill={fill}
            fillOpacity="0.94"
            stroke={stroke}
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <ellipse
            cx="72"
            cy="9"
            rx="71"
            ry="8"
            fill={fill}
            stroke={stroke}
            strokeWidth="2"
          />
          <path
            d="M 10,15 A 62,6 0 0,0 134,15"
            fill="none"
            stroke={stroke}
            strokeOpacity="0.35"
            strokeWidth="1"
          />
        </>
      ) : type === 'subroutine' ? (
        <>
          <rect
            x="1"
            y="1"
            width="142"
            height="50"
            rx="8"
            fill={fill}
            fillOpacity="0.92"
            stroke={stroke}
            strokeWidth="2"
          />
          <line
            x1="13"
            y1="1"
            x2="13"
            y2="51"
            stroke={stroke}
            strokeWidth="1.8"
            strokeOpacity="0.85"
          />
          <line
            x1="131"
            y1="1"
            x2="131"
            y2="51"
            stroke={stroke}
            strokeWidth="1.8"
            strokeOpacity="0.85"
          />
        </>
      ) : type === 'io' ? (
        <polygon
          points="14,1 143,1 130,51 1,51"
          fill={fill}
          fillOpacity="0.92"
          stroke={stroke}
          strokeWidth="2"
          strokeLinejoin="round"
        />
      ) : type === 'hexagon' ? (
        <polygon
          points="16,1 128,1 143,26 128,51 16,51 1,26"
          fill={fill}
          fillOpacity="0.92"
          stroke={stroke}
          strokeWidth="2"
          strokeLinejoin="round"
        />
      ) : type === 'asymmetric' ? (
        <polygon
          points="1,1 126,1 143,26 126,51 1,51 13,26"
          fill={fill}
          fillOpacity="0.92"
          stroke={stroke}
          strokeWidth="2"
          strokeLinejoin="round"
        />
      ) : type === 'document' ? (
        <path
          d="M 1,7 Q 1,1 7,1 H 137 Q 143,1 143,7 V 42 Q 108,54 72,44 T 1,44 Z"
          fill={fill}
          fillOpacity="0.92"
          stroke={stroke}
          strokeWidth="2"
          strokeLinejoin="round"
        />
      ) : type === 'manual' ? (
        <polygon
          points="1,1 143,1 129,51 15,51"
          fill={fill}
          fillOpacity="0.92"
          stroke={stroke}
          strokeWidth="2"
          strokeLinejoin="round"
        />
      ) : type === 'trapezoid' ? (
        <polygon
          points="15,1 129,1 143,51 1,51"
          fill={fill}
          fillOpacity="0.92"
          stroke={stroke}
          strokeWidth="2"
          strokeLinejoin="round"
        />
      ) : type === 'delay' ? (
        <path
          d="M 7,1 H 116 A 27,25 0 0,1 116,51 H 7 Q 1,51 1,45 V 7 Q 1,1 7,1 Z"
          fill={fill}
          fillOpacity="0.92"
          stroke={stroke}
          strokeWidth="2"
          strokeLinejoin="round"
        />
      ) : type === 'note' ? (
        <>
          <path
            d="M 7,1 H 128 L 143,16 V 45 Q 143,51 137,51 H 7 Q 1,51 1,45 V 7 Q 1,1 7,1 Z"
            fill={fill}
            fillOpacity="0.92"
            stroke={stroke}
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path
            d="M 128,1 V 16 H 143"
            fill="none"
            stroke={stroke}
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </>
      ) : (
        <rect
          x="1"
          y="1"
          width="142"
          height="50"
          rx="11"
          fill={fill}
          fillOpacity="0.92"
          stroke={stroke}
          strokeWidth="2"
        />
      )}
    </svg>
  );
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
  {
    type: 'document',
    label: 'Doc',
    title: 'Add Document Node @{ shape: doc }',
    colorClass: 'text-blue-300',
    Icon: FileText,
  },
  {
    type: 'manual',
    label: 'Manual',
    title: 'Add Manual Input Node [\\.../]',
    colorClass: 'text-amber-300',
    Icon: SlidersHorizontal,
  },
  {
    type: 'trapezoid',
    label: 'Trap',
    title: 'Add Manual Operation Trapezoid [/...\\]',
    colorClass: 'text-violet-300',
    Icon: Columns,
  },
  {
    type: 'delay',
    label: 'Delay',
    title: 'Add Delay / Wait Gate @{ shape: delay }',
    colorClass: 'text-pink-300',
    Icon: CircleDot,
  },
  {
    type: 'note',
    label: 'Note',
    title: 'Add Callout Note Card @{ shape: note }',
    colorClass: 'text-yellow-300',
    Icon: FileText,
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

  // Snap-to-grid, minimap & alignment guides state
  const [snapToGrid, setSnapToGrid] = useState<boolean>(true);
  const [showMinimap, setShowMinimap] = useLocalStorage<boolean>(
    'sideflow_flow_minimap',
    true
  );
  const [viewportSize, setViewportSize] = useState<{
    width: number;
    height: number;
  }>({ width: 640, height: 420 });
  const [snapGuides, setSnapGuides] = useState<{
    x?: number;
    y?: number;
  } | null>(null);
  const [isStudioSidebarOpen, setIsStudioSidebarOpen] = useState<boolean>(true);
  const [hoveredEdgeIdx, setHoveredEdgeIdx] = useState<number | null>(null);
  const [isShapePaletteOpen, setIsShapePaletteOpen] = useState<boolean>(false);
  const [shapeSearchQuery, setShapeSearchQuery] = useState<string>('');
  const [shapeCategory, setShapeCategory] = useState<ShapeCategoryId>('all');
  const [nodeSearchQuery, setNodeSearchQuery] = useState<string>('');
  const [nodeSearchFocusIdx, setNodeSearchFocusIdx] = useState<number>(0);
  const [tracePathMode, setTracePathMode] = useState<boolean>(false);
  const [isHealthPopoverOpen, setIsHealthPopoverOpen] = useState<boolean>(false);
  const draggingWaypointRef = useRef<{ edgeIdx: number } | null>(null);
  const [dragWaypoint, setDragWaypoint] = useState<{
    edgeIdx: number;
    x: number;
    y: number;
  } | null>(null);
  const dragWaypointRef = useRef<{
    edgeIdx: number;
    x: number;
    y: number;
  } | null>(null);
  const dragWaypointRafRef = useRef<number | null>(null);

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
    const parallelOffsets = computeParallelEdgeOffsets(flowData.edges);
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
          x1,
          y1: y,
          x2,
          y2: y,
          pathData: `M ${x1} ${y} L ${x2} ${y}`,
          midX: Math.round((x1 + x2) / 2),
          midY: y,
        };
      }

      const activeCurve = edge.curve || currentEdgeCurve;
      const effectiveWaypoint =
        dragWaypoint && dragWaypoint.edgeIdx === idx
          ? { x: dragWaypoint.x, y: dragWaypoint.y }
          : edge.waypoint;
      const geom = computeEdgeGeometry(
        fromEntry.node,
        toEntry.node,
        fromEntry.width,
        fromEntry.height,
        flowData.direction,
        activeCurve,
        toEntry.width,
        toEntry.height,
        parallelOffsets[idx] || 0,
        effectiveWaypoint,
        activeCurve === 'orthogonal' ? effectiveNodes : undefined
      );
      return {
        edge,
        idx,
        x1: geom.x1,
        y1: geom.y1,
        x2: geom.x2,
        y2: geom.y2,
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
    dragWaypoint,
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

  // Measure Flowchart viewport dimensions for accurate Minimap camera frame
  useEffect(() => {
    const el = canvasWrapperRef.current;
    if (!el) return;

    const syncSize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) {
        setViewportSize((prev) =>
          prev.width === w && prev.height === h ? prev : { width: w, height: h }
        );
      }
    };

    syncSize();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(syncSize);
      observer.observe(el);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', syncSize);
    return () => window.removeEventListener('resize', syncSize);
  }, []);

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
  const handleSplitDecisionYesNo = useCallback(
    (decisionNodeId: string) => {
      let spawnedYesId = '';
      commitFlowUpdate((prev) => {
        const yesId = allocateUniqueNodeId(prev.nodes);
        const noId = allocateUniqueNodeId([
          ...prev.nodes,
          { id: yesId, type: 'process', text: '', x: 0, y: 0 },
        ]);
        const res = branchDecisionYesNo(prev, decisionNodeId, yesId, noId);
        if (!res) return prev;
        spawnedYesId = res.yesId;
        return res.state;
      });
      if (spawnedYesId) {
        setSelectedNodeId(spawnedYesId);
        setSelectedNodeIds([spawnedYesId]);
        onNotify(
          'Split Decision into Yes / No',
          'check',
          'Created Yes and No branch steps'
        );
      }
    },
    [commitFlowUpdate, onNotify]
  );

  const handleQuickAddSibling = useCallback(
    (node: FlowNode) => {
      const parentEdge = flowDataRef.current.edges.find((e) => e.to === node.id);
      const parentNode = parentEdge
        ? flowDataRef.current.nodes.find((n) => n.id === parentEdge.from)
        : null;
      if (parentNode) {
        handleQuickAddDirection(
          parentNode,
          directionToPort(flowDataRef.current.direction || 'TD'),
          node.type
        );
        return;
      }
      const isHoriz =
        flowDataRef.current.direction === 'LR' ||
        flowDataRef.current.direction === 'RL';
      handleQuickAddDirection(node, isHoriz ? 'bottom' : 'right', node.type);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [commitFlowUpdate]
  );

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
      if (draggingWaypointRef.current && canvasWrapperRef.current) {
        const { edgeIdx } = draggingWaypointRef.current;
        const rect =
          cachedWrapperRectRef.current ||
          canvasWrapperRef.current.getBoundingClientRect();
        const wx = Math.round(
          (e.clientX - rect.left - panRef.current.x) / zoomRef.current
        );
        const wy = Math.round(
          (e.clientY - rect.top - panRef.current.y) / zoomRef.current
        );
        const snappedX = snapToGridRef.current ? Math.round(wx / 8) * 8 : wx;
        const snappedY = snapToGridRef.current ? Math.round(wy / 8) * 8 : wy;
        const prevWp = dragWaypointRef.current;
        if (
          !prevWp ||
          prevWp.edgeIdx !== edgeIdx ||
          prevWp.x !== snappedX ||
          prevWp.y !== snappedY
        ) {
          dragWaypointRef.current = { edgeIdx, x: snappedX, y: snappedY };
          if (dragWaypointRafRef.current === null) {
            dragWaypointRafRef.current = window.requestAnimationFrame(() => {
              dragWaypointRafRef.current = null;
              setDragWaypoint(dragWaypointRef.current);
            });
          }
        }
        return;
      }

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

      // Commit transient connector bend waypoint drag once to Undo history & persistent state
      if (dragWaypointRafRef.current !== null) {
        window.cancelAnimationFrame(dragWaypointRafRef.current);
        dragWaypointRafRef.current = null;
      }
      if (dragWaypointRef.current) {
        const finalWp = dragWaypointRef.current;
        dragWaypointRef.current = null;
        setDragWaypoint(null);
        commitFlowUpdate((prev) => {
          const targetEdge = prev.edges[finalWp.edgeIdx];
          if (!targetEdge) return prev;
          if (
            targetEdge.waypoint &&
            targetEdge.waypoint.x === finalWp.x &&
            targetEdge.waypoint.y === finalWp.y
          ) {
            return prev;
          }
          return {
            ...prev,
            edges: prev.edges.map((ed, idx) =>
              idx === finalWp.edgeIdx
                ? { ...ed, waypoint: { x: finalWp.x, y: finalWp.y } }
                : ed
            ),
          };
        });
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
      draggingWaypointRef.current = null;
      panningCanvasRef.current = null;
      cachedWrapperRectRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      if (dragWaypointRafRef.current !== null) {
        window.cancelAnimationFrame(dragWaypointRafRef.current);
        dragWaypointRafRef.current = null;
      }
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
    (mode: FlowAlignmentMode) => {
      if (selectedNodeIdsRef.current.length < 2) return;
      commitFlowUpdate((prev) =>
        alignOrDistributeNodes(prev, selectedNodeIdsRef.current, mode)
      );
      const labelMap: Record<FlowAlignmentMode, string> = {
        'align-left': 'Aligned Left Edges',
        'align-x': 'Aligned Columns (Center X)',
        'align-right': 'Aligned Right Edges',
        'align-top': 'Aligned Top Edges',
        'align-y': 'Aligned Rows (Middle Y)',
        'align-bottom': 'Aligned Bottom Edges',
        distribute: 'Distributed Spacing Evenly',
        'distribute-h': 'Distributed Horizontally',
        'distribute-v': 'Distributed Vertically',
      };
      onNotify(
        labelMap[mode] || 'Aligned Selection',
        'check',
        `${selectedNodeIdsRef.current.length} nodes`
      );
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

  const handleBatchSetColor = useCallback(
    (color: AccentColor) => {
      if (selectedNodeIdsRef.current.length === 0) return;
      const idSet = new Set(selectedNodeIdsRef.current);
      commitFlowUpdate((prev) => ({
        ...prev,
        nodes: prev.nodes.map((n) => (idSet.has(n.id) ? { ...n, color } : n)),
      }));
      onNotify(
        `Applied ${color.toUpperCase()} Accent`,
        'check',
        `${selectedNodeIdsRef.current.length} nodes updated`
      );
    },
    [commitFlowUpdate, onNotify]
  );

  const handleBatchSetShape = useCallback(
    (nextShape: FlowNodeType) => {
      if (selectedNodeIdsRef.current.length === 0) return;
      const idSet = new Set(selectedNodeIdsRef.current);
      commitFlowUpdate((prev) => ({
        ...prev,
        nodes: prev.nodes.map((n) =>
          idSet.has(n.id) ? { ...n, type: nextShape } : n
        ),
      }));
      onNotify(
        `Morphed Selection to ${NODE_DEFAULT_LABELS[nextShape]}`,
        'check',
        `${selectedNodeIdsRef.current.length} nodes updated`
      );
    },
    [commitFlowUpdate, onNotify]
  );

  const handleBatchDuplicateSelected = useCallback(() => {
    const ids = selectedNodeIdsRef.current;
    if (ids.length === 0) return;
    if (ids.length === 1) {
      handleDuplicateNode(ids[0]);
      return;
    }
    const idSet = new Set(ids);
    let clonedIds: string[] = [];
    commitFlowUpdate((prev) => {
      const idMap = new Map<string, string>();
      const workingNodes = [...prev.nodes];
      const newNodes: FlowNode[] = [];

      for (const orig of prev.nodes) {
        if (!idSet.has(orig.id)) continue;
        const nextId = allocateUniqueNodeId([...workingNodes, ...newNodes]);
        idMap.set(orig.id, nextId);
        newNodes.push({
          ...orig,
          id: nextId,
          text: `${orig.text} Copy`,
          x: orig.x + 32,
          y: orig.y + 32,
          ...(orig.members ? { members: [...orig.members] } : {}),
        });
      }

      const newEdges = prev.edges
        .filter((e) => idMap.has(e.from) && idMap.has(e.to))
        .map((e) => ({
          ...e,
          from: idMap.get(e.from)!,
          to: idMap.get(e.to)!,
        }));

      clonedIds = Array.from(idMap.values());
      return {
        ...prev,
        nodes: [...prev.nodes, ...newNodes],
        edges: [...prev.edges, ...newEdges],
      };
    });
    if (clonedIds.length > 0) {
      setSelectedNodeIds(clonedIds);
      setSelectedNodeId(clonedIds[0]);
      onNotify(
        `Duplicated ${clonedIds.length} Nodes`,
        'check',
        'Cloned selected nodes and their internal connectors'
      );
    }
  }, [commitFlowUpdate, handleDuplicateNode, onNotify]);

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
          isShapePaletteOpen ||
          Boolean(editingNodeId) ||
          editingEdgeIdx !== null ||
          Boolean(editingSubgraphId) ||
          Boolean(compartmentNodeId) ||
          Boolean(draftConnection);

        setConnectMode(false);
        setConnectSourceNodeId(null);
        setMarqueeMode(false);
        setMarqueeBox(null);
        setIsShapePaletteOpen(false);
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

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        const searchEl = document.getElementById(
          'flow-node-search-input'
        ) as HTMLInputElement | null;
        searchEl?.focus();
        searchEl?.select();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        if (selectedNodeIdsRef.current.length > 1) {
          e.preventDefault();
          handleBatchDuplicateSelected();
          return;
        }
        if (selectedNodeId) {
          e.preventDefault();
          handleDuplicateNode(selectedNodeId);
          return;
        }
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
    isShapePaletteOpen,
    editingNodeId,
    editingEdgeIdx,
    editingSubgraphId,
    compartmentNodeId,
    draftConnection,
    handleUndo,
    handleRedo,
    handleDuplicateNode,
    handleBatchDuplicateSelected,
    handleBatchDeleteSelected,
    selectedNodeId,
  ]);

  const matchedSearchNodeIds = useMemo(() => {
    const q = nodeSearchQuery.trim().toLowerCase();
    if (!q) return [];
    return flowData.nodes
      .filter(
        (n) =>
          n.text.toLowerCase().includes(q) ||
          n.id.toLowerCase().includes(q) ||
          n.type.toLowerCase().includes(q) ||
          (n.stereotype && n.stereotype.toLowerCase().includes(q)) ||
          (n.members && n.members.some((m) => m.toLowerCase().includes(q)))
      )
      .map((n) => n.id);
  }, [flowData.nodes, nodeSearchQuery]);

  const handleFocusNextSearchMatch = useCallback(() => {
    if (matchedSearchNodeIds.length === 0) return;
    const nextIdx = (nodeSearchFocusIdx + 1) % matchedSearchNodeIds.length;
    setNodeSearchFocusIdx(nextIdx);
    const targetId = matchedSearchNodeIds[nextIdx];
    const targetNode = flowData.nodes.find((n) => n.id === targetId);
    if (!targetNode) return;
    setSelectedNodeId(targetId);
    setSelectedNodeIds([targetId]);
    const rect = canvasWrapperRef.current?.getBoundingClientRect();
    const viewW = rect && rect.width > 80 ? rect.width : 540;
    const viewH = rect && rect.height > 80 ? rect.height : 340;
    setPanOffset({
      x: Math.round(viewW / 2 - (targetNode.x + 72) * zoomLevel),
      y: Math.round(viewH / 2 - (targetNode.y + 26) * zoomLevel),
    });
  }, [matchedSearchNodeIds, nodeSearchFocusIdx, flowData.nodes, zoomLevel]);

  const filteredPaletteShapes = useMemo(() => {
    const query = shapeSearchQuery.trim().toLowerCase();
    return ALL_NODE_SHAPES.filter((item) => {
      if (shapeCategory !== 'all' && item.category !== shapeCategory) {
        return false;
      }
      if (!query) return true;
      return (
        item.label.toLowerCase().includes(query) ||
        item.shortLabel.toLowerCase().includes(query) ||
        item.type.toLowerCase().includes(query) ||
        item.syntaxHint.toLowerCase().includes(query)
      );
    });
  }, [shapeSearchQuery, shapeCategory]);

  const handleDropShapeOnCanvas = (
    type: FlowNodeType,
    clientX: number,
    clientY: number
  ) => {
    const rect = canvasWrapperRef.current?.getBoundingClientRect();
    let dropX = 64;
    let dropY = 64;
    if (rect && rect.width > 0 && rect.height > 0) {
      dropX = Math.max(
        16,
        Math.round((clientX - rect.left - panOffset.x) / zoomLevel - 72)
      );
      dropY = Math.max(
        16,
        Math.round((clientY - rect.top - panOffset.y) / zoomLevel - 26)
      );
      if (snapToGrid) {
        dropX = Math.round(dropX / 8) * 8;
        dropY = Math.round(dropY / 8) * 8;
      }
    }

    // Check if dropped within 42px of an existing edge midpoint -> splice into edge!
    const dropCenterX = dropX + 72;
    const dropCenterY = dropY + 26;
    const nearEdge = computedEdges.find(
      (item) =>
        item &&
        Math.hypot(item.midX - dropCenterX, item.midY - dropCenterY) <= 42
    );

    if (nearEdge) {
      let createdId = '';
      let createdText = '';
      commitFlowUpdate((prev) => {
        const candidateId = allocateUniqueNodeId(prev.nodes);
        const res = insertNodeOnEdge(
          prev,
          nearEdge.idx,
          candidateId,
          type,
          NODE_DEFAULT_LABELS[type]
        );
        if (!res) return prev;
        createdId = res.createdNode.id;
        createdText = res.createdNode.text;
        return res.state;
      });
      if (createdId) {
        setSelectedNodeId(createdId);
        setSelectedNodeIds([createdId]);
        setEditingNodeId(createdId);
        setEditingText(createdText);
        onNotify(
          `Spliced ${NODE_DEFAULT_LABELS[type]} on Connector`,
          'check',
          'Dropped shape directly onto connector midpoint'
        );
      }
      return;
    }

    let createdId = '';
    const defaultLabel = NODE_DEFAULT_LABELS[type];
    commitFlowUpdate((prev) => {
      const candidateId = allocateUniqueNodeId(prev.nodes);
      createdId = candidateId;
      const newNode: FlowNode = {
        id: candidateId,
        type,
        text: defaultLabel,
        x: dropX,
        y: dropY,
      };
      return {
        ...prev,
        nodes: [...prev.nodes, newNode],
      };
    });
    if (createdId) {
      setSelectedNodeId(createdId);
      setSelectedNodeIds([createdId]);
      setEditingNodeId(createdId);
      setEditingText(defaultLabel);
    }
  };

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

  const handleAddSwimlane = () => {
    let createdIds: string[] = [];
    let laneTitle = '';
    commitFlowUpdate((prev) => {
      const existingSubgraphs = prev.subgraphs || [];
      const laneIdx = existingSubgraphs.length + 1;
      const sgId = `lane_${laneIdx}_${Date.now().toString(36).slice(-2)}`;
      const defaultLaneNames = [
        'Customer / Client',
        'Application Tier',
        'Data & Storage',
        'External Services',
      ];
      laneTitle =
        defaultLaneNames[(laneIdx - 1) % defaultLaneNames.length] ||
        `Swimlane ${laneIdx}`;

      const maxX =
        prev.nodes.length > 0
          ? Math.max(...prev.nodes.map((n) => n.x))
          : -190;
      const laneX = Math.max(40, maxX + 220);

      const id1 = allocateUniqueNodeId(prev.nodes);
      const id2 = allocateUniqueNodeId([
        ...prev.nodes,
        { id: id1, type: 'process', text: '', x: 0, y: 0 },
      ]);
      createdIds = [id1, id2];

      const laneNodes: FlowNode[] = [
        {
          id: id1,
          type: 'process',
          text: `${laneTitle.split(' ')[0]} Entry`,
          x: laneX,
          y: 64,
        },
        {
          id: id2,
          type: 'process',
          text: `${laneTitle.split(' ')[0]} Action`,
          x: laneX,
          y: 184,
        },
      ];

      const newSubgraph: FlowSubgraph = {
        id: sgId,
        title: laneTitle,
        nodeIds: createdIds,
      };

      return {
        ...prev,
        nodes: [...prev.nodes, ...laneNodes],
        edges: [
          ...prev.edges,
          {
            from: id1,
            to: id2,
            style: activeEdgeStyle,
            arrow: activeEdgeArrow,
            curve: currentEdgeCurve,
          },
        ],
        subgraphs: [...existingSubgraphs, newSubgraph],
      };
    });
    if (createdIds.length > 0) {
      setSelectedNodeIds(createdIds);
      setSelectedNodeId(createdIds[0]);
      onNotify(
        `Added Swimlane: ${laneTitle}`,
        'check',
        'Parallel lane created with starter flow steps'
      );
    }
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

  const handleToggleCollapseSubgraph = (subgraphId: string) => {
    commitFlowUpdate((prev) => ({
      ...prev,
      subgraphs: (prev.subgraphs || []).map((sg) =>
        sg.id === subgraphId ? { ...sg, collapsed: !sg.collapsed } : sg
      ),
    }));
  };

  const handleSetSubgraphColor = (subgraphId: string, color: AccentColor) => {
    commitFlowUpdate((prev) => ({
      ...prev,
      subgraphs: (prev.subgraphs || []).map((sg) =>
        sg.id === subgraphId ? { ...sg, color } : sg
      ),
    }));
  };

  const handleAutoFitSubgraph = (subgraphId: string) => {
    commitFlowUpdate((prev) => autoFitSubgraphNodes(prev, subgraphId));
    onNotify(
      'Auto-Fitted Subgraph',
      'check',
      'Compacted and aligned member nodes inside container'
    );
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

  const handleReverseEdge = (index: number) => {
    commitFlowUpdate((prev) => ({
      ...prev,
      edges: prev.edges.map((edge, idx) =>
        idx === index ? { ...edge, from: edge.to, to: edge.from } : edge
      ),
    }));
    onNotify(
      'Reversed Connector Direction',
      'check',
      'Swapped source and target nodes'
    );
  };

  const handleSetEdgeWaypoint = (
    index: number,
    waypoint?: { x: number; y: number }
  ) => {
    commitFlowUpdate((prev) => ({
      ...prev,
      edges: prev.edges.map((edge, idx) => {
        if (idx !== index) return edge;
        if (!waypoint) {
          const { waypoint: _removed, ...rest } = edge;
          return rest;
        }
        return { ...edge, waypoint };
      }),
    }));
    onNotify(
      waypoint ? 'Added Connector Bend Waypoint' : 'Reset Connector Waypoint',
      'check',
      waypoint
        ? 'Drag the cyan midpoint handle to customize routing'
        : 'Restored automatic connector routing'
    );
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

    // Alt+Shift+Enter spawns a connected sibling step sharing the same parent
    if (
      e.key === 'Enter' &&
      e.shiftKey &&
      (e.altKey || e.ctrlKey || e.metaKey)
    ) {
      e.preventDefault();
      handleQuickAddSibling(node);
      return;
    }

    // Alt+Enter or Ctrl/Cmd+Enter quick-branches a connected node in the current flow direction
    // (Plain Tab / Shift+Tab navigates focus naturally across nodes & controls per WCAG 2.1.2)
    if (e.key === 'Enter' && (e.altKey || e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleQuickAddDirection(node, directionToPort(currentDirection));
      return;
    }

    // Alt+B splits node into Yes / No decision branches
    if (e.altKey && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      handleSplitDecisionYesNo(node.id);
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

  const collapsedSubgraphNodeIds = useMemo(() => {
    const hidden = new Set<string>();
    for (const sg of flowData.subgraphs || []) {
      if (sg.collapsed) {
        for (const id of sg.nodeIds) {
          hidden.add(id);
        }
      }
    }
    return hidden;
  }, [flowData.subgraphs]);

  const healthReport = useMemo(
    () => analyzeFlowchartHealth(flowData),
    [flowData]
  );

  const connectedPath = useMemo(() => {
    if (!tracePathMode || !selectedNodeId) return null;
    return computeConnectedPath(flowData, selectedNodeId);
  }, [tracePathMode, selectedNodeId, flowData]);

  const handleFocusHealthIssue = (issue: FlowchartHealthIssue) => {
    const targetNode = flowData.nodes.find((n) => n.id === issue.nodeId);
    if (!targetNode) return;
    setSelectedNodeId(targetNode.id);
    setSelectedNodeIds([targetNode.id]);
    const rect = canvasWrapperRef.current?.getBoundingClientRect();
    const viewW = rect && rect.width > 80 ? rect.width : 540;
    const viewH = rect && rect.height > 80 ? rect.height : 340;
    setPanOffset({
      x: Math.round(viewW / 2 - (targetNode.x + 72) * zoomLevel),
      y: Math.round(viewH / 2 - (targetNode.y + 26) * zoomLevel),
    });
  };

  const handleFixHealthIssue = (issue: FlowchartHealthIssue) => {
    if (issue.kind === 'unbranched-decision') {
      handleSplitDecisionYesNo(issue.nodeId);
      return;
    }
    if (issue.kind === 'dead-end') {
      commitFlowUpdate((prev) => ({
        ...prev,
        nodes: prev.nodes.map((n) =>
          n.id === issue.nodeId ? { ...n, type: 'start', color: 'emerald' } : n
        ),
      }));
      onNotify(
        'Converted Dead-End to Terminal',
        'check',
        'Marked end step as a Terminal shape'
      );
      return;
    }
    if (issue.kind === 'orphan') {
      commitFlowUpdate((prev) => {
        const anchor = prev.nodes.find((n) => n.id !== issue.nodeId);
        if (!anchor) return prev;
        return {
          ...prev,
          edges: [...prev.edges, { from: anchor.id, to: issue.nodeId }],
        };
      });
      onNotify(
        'Connected Orphan Node',
        'check',
        'Linked isolated node into diagram flow'
      );
    }
  };

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
          <button
            type="button"
            data-testid="toggle-shape-palette-btn"
            aria-label="Toggle Quick Shape Palette"
            aria-pressed={isShapePaletteOpen}
            onClick={() => setIsShapePaletteOpen((prev) => !prev)}
            title="Open Lucidchart-Style Shape Stencil Palette (Search & Drag to Canvas)"
            className={`px-2.5 py-1.5 rounded-lg border text-xs flex items-center gap-1.5 transition ${
              isShapePaletteOpen
                ? 'bg-indigo-600/35 border-indigo-400 text-indigo-100 shadow'
                : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-indigo-200'
            }`}
          >
            <Hexagon className="w-3.5 h-3.5 text-indigo-400" aria-hidden="true" />
            <span>Shapes</span>
            <span className="px-1 py-0.2 rounded bg-slate-900/90 text-[10px] font-mono text-indigo-300">
              {ALL_NODE_SHAPES.length}
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
                  className={`group flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border shrink-0 cursor-pointer transition ${
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
                    className="min-w-0 flex-1 text-left rounded px-0.5 cursor-pointer"
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
          <button
            type="button"
            data-testid="add-swimlane-btn"
            onClick={() => handleAddSwimlane()}
            aria-label="Add Parallel Swimlane"
            title="Create a parallel Swimlane column with starter steps"
            className="min-h-[24px] px-2 py-0.5 rounded-md bg-indigo-950/80 hover:bg-indigo-900/80 border border-dashed border-indigo-400/60 text-indigo-200 flex items-center gap-1 transition"
          >
            <Columns className="w-3 h-3 text-cyan-300" aria-hidden="true" />
            <span>+ Swimlane</span>
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
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="relative flex items-center">
            <Search
              className="w-3 h-3 text-indigo-300/70 absolute left-2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              id="flow-node-search-input"
              data-testid="flow-search-nodes-input"
              type="text"
              aria-label="Find node on canvas"
              value={nodeSearchQuery}
              onChange={(e) => {
                setNodeSearchQuery(e.target.value);
                setNodeSearchFocusIdx(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleFocusNextSearchMatch();
                } else if (e.key === 'Escape') {
                  setNodeSearchQuery('');
                }
              }}
              placeholder="Find node (Ctrl+F)..."
              className="min-h-[24px] w-32 sm:w-40 bg-slate-900/90 border border-indigo-500/30 focus:border-cyan-400 rounded-md pl-6 pr-6 py-0.5 text-[11px] text-white placeholder-indigo-300/50 focus:outline-none"
            />
            {nodeSearchQuery && (
              <div className="flex items-center gap-1 ml-1">
                <span
                  data-testid="flow-search-match-count"
                  className="px-1.5 py-0.5 rounded bg-cyan-500/20 border border-cyan-400/40 text-[10px] font-mono text-cyan-200"
                >
                  {matchedSearchNodeIds.length}
                </span>
                {matchedSearchNodeIds.length > 0 && (
                  <button
                    type="button"
                    data-testid="flow-search-focus-btn"
                    onClick={handleFocusNextSearchMatch}
                    title="Center and select next matching node (Enter)"
                    className="min-h-[22px] px-1.5 py-0.5 rounded bg-cyan-600/40 hover:bg-cyan-500/60 text-cyan-100 text-[10px] font-medium transition"
                  >
                    Jump
                  </button>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            data-testid="toggle-critical-path-btn"
            aria-pressed={tracePathMode}
            onClick={() => setTracePathMode((prev) => !prev)}
            title="Highlight upstream & downstream dependency chain for the selected node"
            className={`min-h-[24px] flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] transition ${
              tracePathMode
                ? 'bg-emerald-600/35 border-emerald-400/70 text-emerald-100 shadow'
                : 'bg-slate-900/80 hover:bg-slate-800 border-indigo-500/30 text-indigo-200'
            }`}
          >
            <GitBranch className="w-3 h-3 text-emerald-300" aria-hidden="true" />
            <span>Trace Path</span>
          </button>

          <div className="relative">
            <button
              type="button"
              data-testid="toggle-flow-health-btn"
              aria-expanded={isHealthPopoverOpen}
              onClick={() => setIsHealthPopoverOpen((prev) => !prev)}
              title="Inspect diagram structure (orphan nodes, unbranched decisions, dead ends, cycles)"
              className={`min-h-[24px] flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] transition ${
                healthReport.issues.length > 0
                  ? 'bg-amber-950/60 hover:bg-amber-900/70 border-amber-400/50 text-amber-200'
                  : 'bg-emerald-950/50 hover:bg-emerald-900/60 border-emerald-500/40 text-emerald-200'
              }`}
            >
              <Activity className="w-3 h-3" aria-hidden="true" />
              <span>Health</span>
              <span
                data-testid="flow-health-issue-count"
                className="px-1 rounded bg-slate-950/80 font-mono text-[10px]"
              >
                {healthReport.issues.length}
              </span>
            </button>

            {isHealthPopoverOpen && (
              <div
                data-testid="flow-health-popover"
                role="dialog"
                aria-label="Diagram Health Inspector"
                className="absolute right-0 top-7 z-40 w-72 bg-slate-950/95 border border-slate-700 rounded-xl p-2.5 shadow-2xl text-xs text-slate-200 space-y-2"
              >
                <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                  <span className="font-semibold text-[11px] uppercase tracking-wider text-indigo-300">
                    Diagram Health Linter
                  </span>
                  <button
                    type="button"
                    aria-label="Close Diagram Health Inspector"
                    onClick={() => setIsHealthPopoverOpen(false)}
                    className="text-slate-400 hover:text-white px-1"
                  >
                    ×
                  </button>
                </div>
                {healthReport.issues.length === 0 ? (
                  <p
                    data-testid="flow-health-all-clear"
                    className="text-[11px] text-emerald-300 py-1"
                  >
                    All Checks Passed — 0 Structural Issues
                  </p>
                ) : (
                  <ul className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
                    {healthReport.issues.map((issue) => (
                      <li
                        key={issue.id}
                        data-testid={`health-issue-${issue.id}`}
                        className="p-2 rounded-lg bg-slate-900/90 border border-slate-800 space-y-1"
                      >
                        <div className="font-medium text-[11px] text-amber-200">
                          {issue.title}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {issue.suggestion}
                        </div>
                        <div className="flex items-center gap-1.5 pt-0.5">
                          <button
                            type="button"
                            data-testid={`health-issue-focus-${issue.nodeId}`}
                            onClick={() => handleFocusHealthIssue(issue)}
                            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-cyan-200 transition"
                          >
                            Jump
                          </button>
                          {issue.kind !== 'cycle' && (
                            <button
                              type="button"
                              data-testid={`health-issue-fix-${issue.nodeId}`}
                              onClick={() => handleFixHealthIssue(issue)}
                              className="px-2 py-0.5 rounded bg-indigo-600/50 hover:bg-indigo-600 text-[10px] text-white transition"
                            >
                              Auto-Fix
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

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
                  {ALL_NODE_SHAPES.length} Shapes
                </span>
              </div>
              <input
                type="text"
                data-testid="studio-shape-search"
                aria-label="Search flowchart shapes"
                value={shapeSearchQuery}
                onChange={(e) => setShapeSearchQuery(e.target.value)}
                placeholder="Filter shapes..."
                className="w-full mb-1.5 bg-slate-900 border border-slate-800 focus:border-indigo-500 rounded-lg px-2 py-1 text-[11px] text-white placeholder-slate-500 focus:outline-none"
              />
              <div
                role="group"
                aria-label="Shape Categories"
                className="flex items-center gap-1 mb-2"
              >
                {SHAPE_CATEGORIES.map((cat) => (
                  <button
                    key={`studio-cat-${cat.id}`}
                    type="button"
                    aria-pressed={shapeCategory === cat.id}
                    onClick={() => setShapeCategory(cat.id)}
                    className={`flex-1 py-0.5 rounded text-[10px] font-medium transition ${
                      shapeCategory === cat.id
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {filteredPaletteShapes.map((item) => (
                  <button
                    key={`studio-add-${item.type}`}
                    type="button"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(
                        'application/x-sideflow-shape',
                        item.type
                      );
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    aria-label={`Studio: Add ${item.label}`}
                    title={`${item.label} ${item.syntaxHint} • Click to add or Drag onto canvas`}
                    onClick={() => handleAddNode(item.type)}
                    className="px-2 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-indigo-500/50 text-slate-200 text-[11px] flex items-center gap-1.5 truncate transition cursor-grab active:cursor-grabbing"
                  >
                    <MiniShapeIcon type={item.type} />
                    <span className="truncate">{item.shortLabel}</span>
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
          onDragOver={(e) => {
            if (
              e.dataTransfer.types.includes('application/x-sideflow-shape')
            ) {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
            }
          }}
          onDrop={(e) => {
            const rawShape = e.dataTransfer.getData(
              'application/x-sideflow-shape'
            ) as FlowNodeType;
            if (
              rawShape &&
              ALL_NODE_SHAPES.some((s) => s.type === rawShape)
            ) {
              e.preventDefault();
              handleDropShapeOnCanvas(rawShape, e.clientX, e.clientY);
            }
          }}
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
          {/* Floating Lucidchart-Style Quick Shape Palette Popover (Available in all panel widths) */}
          {isShapePaletteOpen && (
            <div
              data-testid="quick-shape-palette-popover"
              role="dialog"
              aria-label="Quick Shape Palette"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              className="absolute top-3 left-3 z-40 w-64 max-h-[82%] bg-slate-950/95 backdrop-blur-md border border-indigo-500/40 rounded-2xl p-3 shadow-2xl flex flex-col gap-2 text-xs overflow-hidden"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Hexagon
                    className="w-3.5 h-3.5 text-indigo-400"
                    aria-hidden="true"
                  />
                  <span className="font-semibold text-[11px] uppercase tracking-wider text-indigo-200">
                    Shape Library
                  </span>
                  <span className="font-mono text-[10px] text-slate-400">
                    ({filteredPaletteShapes.length})
                  </span>
                </div>
                <button
                  type="button"
                  data-testid="close-shape-palette-btn"
                  aria-label="Close Quick Shape Palette"
                  onClick={() => setIsShapePaletteOpen(false)}
                  className="w-6 h-6 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center text-xs"
                >
                  ×
                </button>
              </div>

              <input
                type="text"
                data-testid="shape-palette-search"
                aria-label="Search shapes in palette"
                value={shapeSearchQuery}
                onChange={(e) => setShapeSearchQuery(e.target.value)}
                placeholder="Search shapes (e.g. Doc, Note, DB)..."
                className="w-full bg-slate-900 border border-slate-700 focus:border-indigo-500 rounded-lg px-2.5 py-1 text-[11px] text-white placeholder-slate-500 focus:outline-none"
              />

              <div
                role="group"
                aria-label="Palette Shape Categories"
                className="flex items-center gap-1"
              >
                {SHAPE_CATEGORIES.map((cat) => (
                  <button
                    key={`palette-cat-${cat.id}`}
                    type="button"
                    data-testid={`palette-category-${cat.id}`}
                    aria-pressed={shapeCategory === cat.id}
                    onClick={() => setShapeCategory(cat.id)}
                    className={`flex-1 py-1 rounded-md text-[10px] font-medium transition ${
                      shapeCategory === cat.id
                        ? 'bg-indigo-600 text-white shadow'
                        : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-1.5 overflow-y-auto pr-0.5 max-h-64">
                {filteredPaletteShapes.map((item) => (
                  <button
                    key={`palette-shape-${item.type}`}
                    type="button"
                    data-testid={`palette-shape-${item.type}`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(
                        'application/x-sideflow-shape',
                        item.type
                      );
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    onClick={() => {
                      handleAddNode(item.type);
                    }}
                    title={`${item.label} ${item.syntaxHint} • Click to spawn or Drag onto canvas / connector`}
                    className="min-h-[34px] px-2 py-1.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 hover:border-indigo-500/60 text-slate-100 text-[11px] flex items-center gap-2 transition cursor-grab active:cursor-grabbing group"
                  >
                    <MiniShapeIcon type={item.type} />
                    <div className="min-w-0 flex-1 text-left">
                      <div className="font-medium truncate leading-tight">
                        {item.shortLabel}
                      </div>
                      <div className="text-[9px] font-mono text-slate-400 truncate">
                        {item.syntaxHint}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              <div className="text-[10px] text-slate-400 border-t border-slate-800/80 pt-1.5 flex items-center justify-between">
                <span>Drag onto canvas or connector</span>
                <span className="font-mono text-indigo-300">14 stencils</span>
              </div>
            </div>
          )}

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
              aria-label="Grid & Smart Alignment Snap"
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

            <button
              type="button"
              data-testid="toggle-flow-minimap-btn"
              aria-label="Flowchart Minimap"
              aria-pressed={showMinimap}
              onClick={() => setShowMinimap((prev) => !prev)}
              title="Toggle Interactive Flowchart Minimap Radar"
              className={`w-6 h-6 flex items-center justify-center rounded-lg transition ${
                showMinimap
                  ? 'bg-indigo-600/30 border border-indigo-500/50 text-indigo-300'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <MapIcon className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>

          {/* Interactive Bird's-Eye Flowchart Minimap Radar */}
          {showMinimap &&
            effectiveNodes.length > 0 &&
            viewportSize.height >= 190 && (
              <FlowMinimap
                nodes={effectiveNodes}
                edges={flowData.edges}
                subgraphs={subgraphBoundsList}
                selectedNodeIds={selectedNodeIds}
                selectedNodeId={selectedNodeId}
                panOffset={panOffset}
                zoomLevel={zoomLevel}
                viewportWidth={viewportSize.width}
                viewportHeight={viewportSize.height}
                compact={layoutMode === 'compact' || viewportSize.height < 340}
                dimmedForPopover={
                  compartmentNodeId !== null || editingEdgeIdx !== null
                }
                onPanToOffset={(nextOffset) => setPanOffset(nextOffset)}
                onClose={() => {
                  setShowMinimap(false);
                  window.requestAnimationFrame(() => {
                    document
                      .querySelector<HTMLButtonElement>(
                        '[data-testid="toggle-flow-minimap-btn"]'
                      )
                      ?.focus();
                  });
                }}
              />
            )}
          {/* Floating Multi-Select Action Bar */}
          {selectedNodeIds.length > 1 && (
            <div
              data-testid="multi-select-toolbar"
              role="toolbar"
              aria-label="Multi-Select Actions"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              className="absolute top-3 left-1/2 -translate-x-1/2 z-30 bg-slate-900/95 border border-cyan-400/60 rounded-xl px-2.5 py-1.5 shadow-2xl flex items-center gap-1.5 flex-wrap text-[11px] max-w-[95%]"
            >
              <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-200 font-mono text-[10px] font-semibold">
                {selectedNodeIds.length} Selected
              </span>
              <div
                role="group"
                aria-label="Precision Alignment"
                className="flex items-center gap-0.5 bg-slate-950/80 border border-slate-800 rounded-lg p-0.5"
              >
                <button
                  type="button"
                  data-testid="multi-align-left"
                  onClick={() => handleAlignOrDistribute('align-left')}
                  title="Align Left Edges"
                  className="px-1.5 py-0.5 rounded hover:bg-slate-800 text-slate-300 hover:text-white transition text-[10px]"
                >
                  Left
                </button>
                <button
                  type="button"
                  data-testid="multi-align-x"
                  onClick={() => handleAlignOrDistribute('align-x')}
                  title="Align Horizontal Center (same X column)"
                  className="px-1.5 py-0.5 rounded hover:bg-slate-800 text-slate-200 hover:text-white transition text-[10px]"
                >
                  Align X
                </button>
                <button
                  type="button"
                  data-testid="multi-align-right"
                  onClick={() => handleAlignOrDistribute('align-right')}
                  title="Align Right Edges"
                  className="px-1.5 py-0.5 rounded hover:bg-slate-800 text-slate-300 hover:text-white transition text-[10px]"
                >
                  Right
                </button>
                <span className="text-slate-700 px-0.5">|</span>
                <button
                  type="button"
                  data-testid="multi-align-top"
                  onClick={() => handleAlignOrDistribute('align-top')}
                  title="Align Top Edges"
                  className="px-1.5 py-0.5 rounded hover:bg-slate-800 text-slate-300 hover:text-white transition text-[10px]"
                >
                  Top
                </button>
                <button
                  type="button"
                  data-testid="multi-align-y"
                  onClick={() => handleAlignOrDistribute('align-y')}
                  title="Align Vertical Middle (same Y row)"
                  className="px-1.5 py-0.5 rounded hover:bg-slate-800 text-slate-200 hover:text-white transition text-[10px]"
                >
                  Align Y
                </button>
                <button
                  type="button"
                  data-testid="multi-align-bottom"
                  onClick={() => handleAlignOrDistribute('align-bottom')}
                  title="Align Bottom Edges"
                  className="px-1.5 py-0.5 rounded hover:bg-slate-800 text-slate-300 hover:text-white transition text-[10px]"
                >
                  Bottom
                </button>
              </div>
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
              <select
                aria-label="Batch change shape for selected nodes"
                data-testid="multi-shape-select"
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) {
                    handleBatchSetShape(e.target.value as FlowNodeType);
                    e.target.value = '';
                  }
                }}
                className="min-h-[22px] bg-slate-800 border border-slate-700 text-slate-200 rounded px-1.5 py-0.5 text-[10px] focus:outline-none focus:border-cyan-400"
              >
                <option value="" disabled>
                  Shape...
                </option>
                {ALL_NODE_SHAPES.map((s) => (
                  <option key={`multi-shape-${s.type}`} value={s.type}>
                    {s.label}
                  </option>
                ))}
              </select>
              <div
                role="group"
                aria-label="Batch Color Swatches"
                className="flex items-center gap-1 px-1 py-0.5 rounded bg-slate-950/70 border border-slate-800"
              >
                {(['emerald', 'amber', 'rose', 'purple', 'cyan'] as const).map(
                  (c) => (
                    <button
                      key={`multi-color-${c}`}
                      type="button"
                      data-testid={`multi-color-${c}`}
                      aria-label={`Set selected nodes color to ${c}`}
                      onClick={() => handleBatchSetColor(c)}
                      className={`w-3 h-3 rounded-full border ${ACCENT_SWATCH_CLASSES[c]} hover:scale-125 transition`}
                    />
                  )
                )}
                <button
                  type="button"
                  data-testid="multi-color-btn"
                  onClick={handleBatchCycleColor}
                  title="Cycle accent color for all selected nodes"
                  className="p-0.5 rounded hover:bg-slate-800 text-slate-300 transition"
                >
                  <Palette className="w-3 h-3" aria-hidden="true" />
                </button>
              </div>
              <button
                type="button"
                data-testid="multi-duplicate-btn"
                onClick={handleBatchDuplicateSelected}
                title="Duplicate all selected nodes and their internal connectors (Ctrl+D)"
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-cyan-200 flex items-center gap-1 transition"
              >
                <Copy className="w-3 h-3" aria-hidden="true" />
                <span>Clone</span>
              </button>
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
            className={`absolute inset-0 w-full h-full pointer-events-none ${
              compartmentNodeId !== null || editingEdgeIdx !== null
                ? 'z-40'
                : ''
            }`}
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
              {subgraphBoundsList.map((bounds) => {
                const sgColor = bounds.color || 'indigo';
                const sgBorderMap: Record<AccentColor, string> = {
                  indigo: 'border-indigo-400/40 bg-slate-900/45',
                  cyan: 'border-cyan-400/50 bg-cyan-950/20',
                  emerald: 'border-emerald-400/50 bg-emerald-950/20',
                  amber: 'border-amber-400/50 bg-amber-950/20',
                  rose: 'border-rose-400/50 bg-rose-950/20',
                  purple: 'border-purple-400/50 bg-purple-950/20',
                };
                return (
                <div
                  key={bounds.id}
                  data-testid={`flow-subgraph-${bounds.id}`}
                  data-subgraph-color={sgColor}
                  style={{
                    left: `${bounds.x}px`,
                    top: `${bounds.y}px`,
                    width: `${bounds.width}px`,
                    height: `${bounds.height}px`,
                  }}
                  className={`absolute rounded-2xl border border-dashed pointer-events-none ${sgBorderMap[sgColor]}`}
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
                    <div className="flex items-center gap-1">
                      <div
                        role="group"
                        aria-label={`Color theme for subgraph ${bounds.title}`}
                        className="flex items-center gap-0.5 mr-0.5"
                      >
                        {(
                          ['indigo', 'cyan', 'emerald', 'amber', 'rose'] as const
                        ).map((c) => (
                          <button
                            key={`sg-color-${bounds.id}-${c}`}
                            type="button"
                            data-testid={`subgraph-color-${bounds.id}-${c}`}
                            aria-label={`Set subgraph ${bounds.title} color to ${c}`}
                            aria-pressed={sgColor === c}
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSetSubgraphColor(bounds.id, c);
                            }}
                            className={`w-2.5 h-2.5 rounded-full border ${ACCENT_SWATCH_CLASSES[c]} ${
                              sgColor === c
                                ? 'ring-1 ring-white scale-110'
                                : 'opacity-60 hover:opacity-100'
                            } transition`}
                          />
                        ))}
                      </div>
                      {bounds.collapsed && (
                        <span
                          data-testid={`subgraph-collapsed-badge-${bounds.id}`}
                          className="px-1.5 py-0.5 rounded bg-indigo-500/20 border border-indigo-400/30 text-[9px] font-mono text-indigo-200"
                        >
                          {bounds.memberCount || 0} nodes
                        </span>
                      )}
                      <button
                        type="button"
                        data-testid={`subgraph-autofit-${bounds.id}`}
                        aria-label={`Auto-fit nodes in subgraph ${bounds.title}`}
                        title="Compact and align member nodes inside this subgraph"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAutoFitSubgraph(bounds.id);
                        }}
                        className="p-0.5 rounded hover:bg-slate-800 text-cyan-300 hover:text-white transition"
                      >
                        <Minimize2 className="w-3 h-3" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        data-testid={`subgraph-collapse-${bounds.id}`}
                        aria-label={`${bounds.collapsed ? 'Expand' : 'Collapse'} subgraph ${bounds.title}`}
                        aria-expanded={!bounds.collapsed}
                        title={
                          bounds.collapsed
                            ? 'Expand subgraph container'
                            : 'Collapse subgraph into compact summary bar'
                        }
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleCollapseSubgraph(bounds.id);
                        }}
                        className="p-0.5 rounded hover:bg-slate-800 text-slate-300 hover:text-white transition"
                      >
                        {bounds.collapsed ? (
                          <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                        )}
                      </button>
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
                </div>
                );
              })}
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
                  markerHeight="8"
                  refX="8.5"
                  refY="4"
                  orient="auto"
                >
                  <path
                    d="M 0 0.5 L 9.5 4 L 0 7.5 L 2.3 4 Z"
                    fill="#818cf8"
                  />
                </marker>
                <marker
                  id="arrowhead-hover"
                  markerWidth="10"
                  markerHeight="8"
                  refX="8.5"
                  refY="4"
                  orient="auto"
                >
                  <path
                    d="M 0 0.5 L 9.5 4 L 0 7.5 L 2.3 4 Z"
                    fill="#67e8f9"
                  />
                </marker>
                <marker
                  id="arrowhead-selected"
                  markerWidth="10"
                  markerHeight="8"
                  refX="8.5"
                  refY="4"
                  orient="auto"
                >
                  <path
                    d="M 0 0.5 L 9.5 4 L 0 7.5 L 2.3 4 Z"
                    fill="#38bdf8"
                  />
                </marker>
                <marker
                  id="arrowhead-start"
                  markerWidth="10"
                  markerHeight="8"
                  refX="1.5"
                  refY="4"
                  orient="auto"
                >
                  <path
                    d="M 10 0.5 L 0.5 4 L 10 7.5 L 7.7 4 Z"
                    fill="#818cf8"
                  />
                </marker>
                <marker
                  id="arrowhead-start-hover"
                  markerWidth="10"
                  markerHeight="8"
                  refX="1.5"
                  refY="4"
                  orient="auto"
                >
                  <path
                    d="M 10 0.5 L 0.5 4 L 10 7.5 L 7.7 4 Z"
                    fill="#67e8f9"
                  />
                </marker>
                <marker
                  id="arrowhead-start-selected"
                  markerWidth="10"
                  markerHeight="8"
                  refX="1.5"
                  refY="4"
                  orient="auto"
                >
                  <path
                    d="M 10 0.5 L 0.5 4 L 10 7.5 L 7.7 4 Z"
                    fill="#38bdf8"
                  />
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
                  id="circlehead-hover"
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
                    stroke="#67e8f9"
                    strokeWidth="1.8"
                  />
                </marker>
                <marker
                  id="circlehead-selected"
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
                    stroke="#38bdf8"
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
                <marker
                  id="crosshead-hover"
                  markerWidth="9"
                  markerHeight="9"
                  refX="6"
                  refY="4.5"
                  orient="auto"
                >
                  <path
                    d="M 1.5 1.5 L 7.5 7.5 M 7.5 1.5 L 1.5 7.5"
                    stroke="#67e8f9"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </marker>
                <marker
                  id="crosshead-selected"
                  markerWidth="9"
                  markerHeight="9"
                  refX="6"
                  refY="4.5"
                  orient="auto"
                >
                  <path
                    d="M 1.5 1.5 L 7.5 7.5 M 7.5 1.5 L 1.5 7.5"
                    stroke="#38bdf8"
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
                  const { edge, idx, x1, y1, x2, y2, midX, midY, pathData } = item;
                  if (
                    collapsedSubgraphNodeIds.has(edge.from) &&
                    collapsedSubgraphNodeIds.has(edge.to)
                  ) {
                    return null;
                  }

                  const isEdgeSelected = editingEdgeIdx === idx;
                  const isEdgeHovered = hoveredEdgeIdx === idx;
                  const isPathHighlighted = Boolean(
                    connectedPath &&
                      connectedPath.highlightedEdgeIndices.includes(idx)
                  );
                  const markerSuffix = isEdgeSelected
                    ? '-selected'
                    : isEdgeHovered || isPathHighlighted
                      ? '-hover'
                      : '';

                  const strokeWidth =
                    edge.style === 'thick'
                      ? '4'
                      : isPathHighlighted
                        ? '3.2'
                        : '2.2';
                  const strokeDasharray =
                    edge.style === 'dotted' ? '6,4' : undefined;
                  const markerStart =
                    edge.arrow === 'bidirectional'
                      ? `url(#arrowhead-start${markerSuffix})`
                      : undefined;
                  let markerEnd: string | undefined = `url(#arrowhead${markerSuffix})`;
                  if (edge.arrow === 'none') {
                    markerEnd = undefined;
                  } else if (edge.arrow === 'circle') {
                    markerEnd = `url(#circlehead${markerSuffix})`;
                  } else if (edge.arrow === 'cross') {
                    markerEnd = `url(#crosshead${markerSuffix})`;
                  }

                  const strokeColor = isEdgeSelected
                    ? '#38bdf8'
                    : isPathHighlighted
                      ? '#34d399'
                      : isEdgeHovered
                        ? '#67e8f9'
                        : '#818cf8';

                  return (
                    <g
                      key={`${edge.from}-${edge.to}-${idx}`}
                      data-testid={`flow-edge-${idx}`}
                      data-path-highlighted={
                        isPathHighlighted ? 'true' : 'false'
                      }
                      onMouseEnter={() => setHoveredEdgeIdx(idx)}
                      onMouseLeave={() =>
                        setHoveredEdgeIdx((prev) => (prev === idx ? null : prev))
                      }
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
                        strokeWidth="16"
                        fill="none"
                      />
                      <path
                        d={pathData}
                        stroke={strokeColor}
                        strokeWidth={strokeWidth}
                        strokeDasharray={strokeDasharray}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                        markerStart={markerStart}
                        markerEnd={markerEnd}
                        className="transition-colors"
                      />
                      {(isEdgeHovered || isEdgeSelected) && (
                        <>
                          <circle
                            data-testid={`edge-anchor-start-${idx}`}
                            cx={x1}
                            cy={y1}
                            r="3.2"
                            fill="#020617"
                            stroke={strokeColor}
                            strokeWidth="1.8"
                          />
                          <circle
                            data-testid={`edge-anchor-end-${idx}`}
                            cx={x2}
                            cy={y2}
                            r="3.2"
                            fill="#020617"
                            stroke={strokeColor}
                            strokeWidth="1.8"
                          />
                          <circle
                            data-testid={`edge-waypoint-handle-${idx}`}
                            cx={midX}
                            cy={midY}
                            r="5"
                            fill="#22d3ee"
                            stroke="#020617"
                            strokeWidth="1.8"
                            className="cursor-move"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              if (canvasWrapperRef.current) {
                                cachedWrapperRectRef.current =
                                  canvasWrapperRef.current.getBoundingClientRect();
                              }
                              draggingWaypointRef.current = { edgeIdx: idx };
                            }}
                          />
                        </>
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
                      data-testid={`edge-label-pill-${idx}`}
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
                            className="min-h-[24px] px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-[10px] font-medium text-white flex items-center gap-0.5 transition"
                          >
                            <Plus className="w-2.5 h-2.5" aria-hidden="true" />
                            <span>Insert Step</span>
                          </button>
                          <button
                            type="button"
                            data-testid="reverse-edge-btn"
                            aria-label="Reverse connector direction"
                            title="Swap connector source and target direction (From ↔ To)"
                            onClick={() => handleReverseEdge(idx)}
                            className="min-h-[24px] px-2 py-0.5 rounded bg-slate-800 hover:bg-cyan-600 text-[10px] font-medium text-cyan-200 hover:text-white flex items-center gap-1 transition"
                          >
                            <ArrowLeftRight
                              className="w-2.5 h-2.5"
                              aria-hidden="true"
                            />
                            <span>Reverse</span>
                          </button>
                          <button
                            type="button"
                            data-testid="edge-set-waypoint-btn"
                            aria-label="Bend connector waypoint"
                            title="Add or offset a custom bend waypoint on this connector"
                            onClick={() =>
                              handleSetEdgeWaypoint(idx, {
                                x: Math.round((midX + 48) / 8) * 8,
                                y: Math.round((midY - 24) / 8) * 8,
                              })
                            }
                            className="min-h-[24px] px-2 py-0.5 rounded bg-slate-800 hover:bg-indigo-600 text-[10px] font-medium text-indigo-200 hover:text-white flex items-center gap-1 transition"
                          >
                            <Spline className="w-2.5 h-2.5" aria-hidden="true" />
                            <span>Bend</span>
                          </button>
                          {edge.waypoint && (
                            <button
                              type="button"
                              data-testid="edge-reset-waypoint-btn"
                              aria-label="Reset connector waypoint"
                              title="Remove custom waypoint bend and restore automatic routing"
                              onClick={() => handleSetEdgeWaypoint(idx, undefined)}
                              className="min-h-[24px] px-1.5 py-0.5 rounded bg-slate-800 hover:bg-rose-600 text-[10px] text-rose-200 hover:text-white transition"
                            >
                              Reset Bend
                            </button>
                          )}
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
                              className="min-h-[24px] px-2 py-0.5 rounded bg-slate-800 hover:bg-indigo-600 text-[10px] text-slate-300 hover:text-white transition"
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
                            className="min-h-[24px] bg-slate-800 border border-slate-700 text-slate-200 rounded px-1 py-0.5 text-[10px]"
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
                            className="min-h-[24px] bg-slate-800 border border-slate-700 text-slate-200 rounded px-1 py-0.5 text-[10px]"
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
                            className="min-h-[24px] bg-slate-800 border border-slate-700 text-cyan-200 rounded px-1 py-0.5 text-[10px]"
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
                            className="min-h-[24px] bg-slate-800 border border-indigo-500/40 text-cyan-300 font-mono rounded px-1 py-0.5 text-[10px]"
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
                if (collapsedSubgraphNodeIds.has(node.id)) {
                  return null;
                }
                let textTheme = 'text-sky-100';
                if (node.type === 'decision' || node.type === 'manual') {
                  textTheme = 'text-amber-100';
                } else if (node.type === 'start') {
                  textTheme = 'text-emerald-100';
                } else if (
                  node.type === 'database' ||
                  node.type === 'trapezoid'
                ) {
                  textTheme = 'text-purple-100';
                } else if (node.type === 'subroutine') {
                  textTheme = 'text-indigo-100';
                } else if (node.type === 'io' || node.type === 'document') {
                  textTheme = 'text-cyan-100';
                } else if (node.type === 'circle' || node.type === 'delay') {
                  textTheme = 'text-rose-100';
                } else if (node.type === 'hexagon') {
                  textTheme = 'text-orange-100';
                } else if (node.type === 'asymmetric') {
                  textTheme = 'text-teal-100';
                } else if (node.type === 'note') {
                  textTheme = 'text-yellow-100';
                }

                if (node.color && NODE_COLOR_CLASSES[node.color]) {
                  const colorTokens = NODE_COLOR_CLASSES[node.color]
                    .split(' ')
                    .filter((cls) => cls.startsWith('text-'));
                  if (colorTokens[0]) textTheme = colorTokens[0];
                }

                const isSelected =
                  selectedNodeId === node.id ||
                  selectedNodeIds.includes(node.id);
                const isDropTarget =
                  draftConnection?.hoverTargetId === node.id;
                const hasActiveSearch = nodeSearchQuery.trim().length > 0;
                const isSearchMatch =
                  hasActiveSearch && matchedSearchNodeIds.includes(node.id);
                const isPathHighlighted = Boolean(
                  connectedPath &&
                    connectedPath.highlightedNodeIds.includes(node.id)
                );

                let shapeClasses = `rounded-xl ${textTheme}`;
                if (connectMode && connectSourceNodeId === node.id) {
                  shapeClasses += ' ring-4 ring-indigo-500';
                } else if (isDropTarget) {
                  shapeClasses += ' ring-4 ring-cyan-400 scale-105';
                } else if (isSearchMatch) {
                  shapeClasses +=
                    ' ring-4 ring-amber-400 shadow-lg shadow-amber-500/30 z-20';
                } else if (isPathHighlighted) {
                  shapeClasses +=
                    ' ring-4 ring-emerald-400 shadow-lg shadow-emerald-500/25 z-20';
                } else if (isSelected) {
                  shapeClasses += ' ring-2 ring-indigo-400/90';
                }
                if (
                  (hasActiveSearch && !isSearchMatch) ||
                  (connectedPath && !isPathHighlighted)
                ) {
                  shapeClasses += ' opacity-35';
                }

                const hasCompartment =
                  Boolean(node.stereotype) ||
                  Boolean(node.members && node.members.length > 0);

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
                    data-search-match={isSearchMatch ? 'true' : 'false'}
                    data-path-highlighted={isPathHighlighted ? 'true' : 'false'}
                    data-testid={`flow-node-${node.id}`}
                    style={{ left: `${node.x}px`, top: `${node.y}px` }}
                    onMouseDown={(e) => handleNodeMouseDown(e, node)}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      startEditingNode(node);
                    }}
                    onKeyDown={(e) => handleNodeKeyDown(e, node)}
                    className={`pointer-events-auto absolute w-36 min-h-[52px] px-3 py-2 flex flex-col items-center justify-center text-center text-xs font-medium cursor-move select-none transition-transform group ${shapeClasses}`}
                  >
                    {/* True Vector SVG Silhouette Layer */}
                    <NodeShapeSvg
                      nodeId={node.id}
                      type={node.type}
                      color={node.color}
                      hasCompartment={hasCompartment}
                    />

                    {/* Floating In-Place Shape Switcher, Quick Morph Icons, Color Dots & Quick Action Pill when a Single Node is Selected */}
                    {isSelected &&
                      selectedNodeIds.length <= 1 &&
                      !connectMode &&
                      compartmentNodeId !== node.id && (
                        <div
                          data-testid={`selected-node-toolbar-${node.id}`}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                          onDoubleClick={(e) => e.stopPropagation()}
                          className="pointer-events-auto absolute -top-10 left-1/2 -translate-x-1/2 z-30 bg-slate-900/95 border border-indigo-500/50 rounded-xl px-1.5 py-0.5 shadow-2xl flex items-center gap-1 whitespace-nowrap"
                        >
                          {(
                            [
                              { type: 'process', morphLabel: 'Box' },
                              { type: 'decision', morphLabel: 'Diamond' },
                              { type: 'database', morphLabel: 'Cylinder' },
                              { type: 'document', morphLabel: 'Wave' },
                              { type: 'note', morphLabel: 'Callout' },
                            ] as Array<{
                              type: FlowNodeType;
                              morphLabel: string;
                            }>
                          ).map(({ type: quickType, morphLabel }) => (
                            <button
                              key={`quick-morph-${node.id}-${quickType}`}
                              type="button"
                              data-testid={`quick-morph-${quickType}-${node.id}`}
                              aria-label={`Quick morph to ${morphLabel}`}
                              title={`Quick morph to ${NODE_DEFAULT_LABELS[quickType]}`}
                              onClick={() =>
                                handleChangeNodeShape(node.id, quickType)
                              }
                              className={`w-6 h-6 rounded-md flex items-center justify-center transition ${
                                node.type === quickType
                                  ? 'bg-indigo-600/40 ring-1 ring-indigo-400'
                                  : 'hover:bg-slate-800'
                              }`}
                            >
                              <MiniShapeIcon
                                type={quickType}
                                className="w-3.5 h-3"
                              />
                            </button>
                          ))}
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
                            title="Switch node shape in-place (14 shapes)"
                            className="min-h-[24px] bg-slate-800 border border-slate-700 text-indigo-200 rounded px-1.5 py-0.5 text-[10px] focus:outline-none"
                          >
                            {ALL_NODE_SHAPES.map((s) => (
                              <option key={s.type} value={s.type}>
                                {s.shortLabel}
                              </option>
                            ))}
                          </select>
                          <div className="flex items-center gap-0.5 px-0.5 border-x border-slate-700/80">
                            {(
                              [
                                'indigo',
                                'cyan',
                                'emerald',
                                'amber',
                                'rose',
                                'purple',
                              ] as AccentColor[]
                            ).map((c) => (
                              <button
                                key={`quick-color-${node.id}-${c}`}
                                type="button"
                                data-testid={`quick-color-${c}-${node.id}`}
                                aria-label={`Quick accent ${c}`}
                                title={`Set ${c} accent`}
                                onClick={() =>
                                  handleSetNodeColor(
                                    node.id,
                                    node.color === c ? undefined : c
                                  )
                                }
                                className="w-4 h-6 flex items-center justify-center rounded hover:bg-slate-800"
                              >
                                <span
                                  className={`w-2.5 h-2.5 rounded-full border ${
                                    ACCENT_SWATCH_CLASSES[c]
                                  } ${
                                    node.color === c
                                      ? 'ring-1 ring-white scale-110'
                                      : ''
                                  }`}
                                />
                              </button>
                            ))}
                          </div>
                          <button
                            type="button"
                            data-testid={`split-yes-no-btn-${node.id}`}
                            aria-label={`Split ${node.text} into Yes and No branches`}
                            title="1-Click Split Yes / No Branches (Alt+B)"
                            onClick={() => handleSplitDecisionYesNo(node.id)}
                            className="h-6 px-1.5 flex items-center gap-0.5 rounded bg-emerald-600/35 hover:bg-emerald-600/60 border border-emerald-400/50 text-[10px] font-medium text-emerald-100 transition"
                          >
                            <GitBranch className="w-3 h-3" aria-hidden="true" />
                            <span>Yes/No</span>
                          </button>
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
                          className={`pointer-events-auto absolute ${positionClass} w-6 h-6 rounded-full bg-indigo-600 hover:bg-cyan-400 text-white hover:text-slate-950 border border-indigo-300/80 shadow flex items-center justify-center transition-all z-20 focus:opacity-100 ${
                            isSelected
                              ? 'opacity-95 scale-100'
                              : 'opacity-0 group-hover:opacity-95 group-focus-within:opacity-95 scale-90 group-hover:scale-100'
                          }`}
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
                        className="relative z-10 text-[10px] italic text-amber-300/90 leading-tight mb-0.5 cursor-pointer hover:underline"
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
                          className="relative z-10 w-full bg-slate-900 text-white text-xs px-1.5 py-0.5 rounded border border-indigo-400 focus:outline-none text-center"
                        />
                      </>
                    ) : (
                      <span
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          startEditingNode(node);
                        }}
                        className="relative z-10 leading-snug break-words pointer-events-auto"
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
                        className="relative z-10 w-full mt-1.5 pt-1 border-t border-slate-500/40 text-left font-mono text-[10px] text-slate-200/90 space-y-0.5 cursor-pointer hover:text-white"
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
                      className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 absolute -top-2.5 -left-2.5 w-6 h-6 rounded-full bg-slate-800 border border-slate-600 text-slate-200 hover:text-indigo-300 flex items-center justify-center shadow z-20"
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
                      className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 absolute -bottom-2.5 -left-2.5 w-6 h-6 rounded-full bg-slate-800 border border-slate-600 text-slate-200 hover:text-cyan-300 flex items-center justify-center shadow z-20"
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
                      className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 absolute -top-2.5 -right-2.5 w-6 h-6 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center text-xs shadow z-20"
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
                        className="pointer-events-auto absolute top-full mt-2 z-50 w-64 rounded-xl border border-indigo-500/60 bg-slate-900/95 p-2.5 shadow-2xl text-left text-[10px] text-slate-100 flex flex-col gap-2 cursor-default"
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
                            className="min-h-[24px] bg-slate-800 border border-slate-700 text-amber-300 font-mono rounded px-1.5 py-0.5 text-[10px] focus:outline-none focus:border-indigo-500"
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
                                  className="flex-1 min-h-[24px] bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 font-mono text-[10px] text-slate-200 focus:outline-none focus:border-indigo-500"
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
                            className="min-h-[24px] px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-mono text-sky-300"
                          >
                            +Field
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleAddNodeMember(node.id, '+execute() bool')
                            }
                            className="min-h-[24px] px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-mono text-indigo-300"
                          >
                            +Method()
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleAddNodeMember(node.id, 'uuid id PK')
                            }
                            className="min-h-[24px] px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-mono text-purple-300"
                          >
                            +PK
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleAddNodeMember(node.id, 'uuid ref_id FK')
                            }
                            className="min-h-[24px] px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-mono text-amber-300"
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
