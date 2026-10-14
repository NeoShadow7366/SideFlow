import React, { useState, useRef, useEffect } from 'react';
import {
  Square,
  Diamond,
  CircleDot,
  GitCommit,
  RotateCcw,
  Trash2,
  Share2,
} from 'lucide-react';
import { FlowchartState, FlowNode, FlowNodeType } from '../../types/sideflow';
import { defaultFlowData } from '../../utils/defaults';
import { generateStandaloneSVG } from '../../utils/mermaid';
import { LucidModal } from './LucidModal';

interface FlowCanvasProps {
  flowData: FlowchartState;
  onChangeFlowData: (
    updater: FlowchartState | ((prev: FlowchartState) => FlowchartState)
  ) => void;
  onNotify: (title: string, icon?: string, subtitle?: string) => void;
}

export const FlowCanvas: React.FC<FlowCanvasProps> = ({
  flowData,
  onChangeFlowData,
  onNotify,
}) => {
  const [connectMode, setConnectMode] = useState(false);
  const [connectSourceNodeId, setConnectSourceNodeId] = useState<string | null>(
    null
  );
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [isLucidModalOpen, setIsLucidModalOpen] = useState(false);

  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const draggingNodeIdRef = useRef<string | null>(null);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const draggingId = draggingNodeIdRef.current;
      if (!draggingId || !canvasWrapperRef.current) return;

      const wrapperRect = canvasWrapperRef.current.getBoundingClientRect();
      const maxX = Math.max(160, wrapperRect.width - 150);
      const maxY = Math.max(80, wrapperRect.height - 64);

      const nextX = Math.max(
        8,
        Math.min(maxX, e.clientX - wrapperRect.left - dragOffsetRef.current.x)
      );
      const nextY = Math.max(
        8,
        Math.min(maxY, e.clientY - wrapperRect.top - dragOffsetRef.current.y)
      );

      onChangeFlowData((prev) => ({
        ...prev,
        nodes: prev.nodes.map((n) =>
          n.id === draggingId ? { ...n, x: Math.round(nextX), y: Math.round(nextY) } : n
        ),
      }));
    };

    const handleMouseUp = () => {
      draggingNodeIdRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [onChangeFlowData]);

  const handleAddNode = (type: FlowNodeType) => {
    const labels: Record<FlowNodeType, string> = {
      process: 'New Process',
      decision: 'Condition?',
      start: 'Start / End',
    };
    const newNode: FlowNode = {
      id: `n${Date.now().toString().slice(-5)}`,
      type,
      text: labels[type],
      x: 60 + Math.floor(Math.random() * 180),
      y: 60 + Math.floor(Math.random() * 160),
    };
    onChangeFlowData((prev) => ({
      ...prev,
      nodes: [...prev.nodes, newNode],
    }));
  };

  const handleDeleteNode = (nodeId: string) => {
    onChangeFlowData((prev) => ({
      nodes: prev.nodes.filter((n) => n.id !== nodeId),
      edges: prev.edges.filter((e) => e.from !== nodeId && e.to !== nodeId),
    }));
    if (connectSourceNodeId === nodeId) {
      setConnectSourceNodeId(null);
    }
  };

  const handleDeleteEdge = (index: number) => {
    onChangeFlowData((prev) => ({
      ...prev,
      edges: prev.edges.filter((_, idx) => idx !== index),
    }));
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
        const sourceId = connectSourceNodeId;
        onChangeFlowData((prev) => {
          const exists = prev.edges.some(
            (edge) => edge.from === sourceId && edge.to === node.id
          );
          if (exists) return prev;
          return {
            ...prev,
            edges: [...prev.edges, { from: sourceId, to: node.id }],
          };
        });
        setConnectSourceNodeId(null);
        setConnectMode(false);
      }
      return;
    }

    draggingNodeIdRef.current = node.id;
    const wrapperRect = canvasWrapperRef.current?.getBoundingClientRect();
    if (wrapperRect) {
      dragOffsetRef.current = {
        x: e.clientX - wrapperRect.left - node.x,
        y: e.clientY - wrapperRect.top - node.y,
      };
    }
  };

  const startEditingNode = (node: FlowNode) => {
    setEditingNodeId(node.id);
    setEditingText(node.text);
  };

  const commitEditingNode = (nodeId: string) => {
    const trimmed = editingText.trim();
    if (trimmed) {
      onChangeFlowData((prev) => ({
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

  const handleResetDemo = () => {
    onChangeFlowData(JSON.parse(JSON.stringify(defaultFlowData)));
    setConnectMode(false);
    setConnectSourceNodeId(null);
  };

  const handleClearCanvas = () => {
    onChangeFlowData({ nodes: [], edges: [] });
    setConnectMode(false);
    setConnectSourceNodeId(null);
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

  const statusMessage = connectMode
    ? sourceNode
      ? `Selected "${sourceNode.text}". Now click target node to connect.`
      : 'Click source node first, then click destination node.'
    : "Drag nodes to move • Double-click text to edit • Click 'Connect' to link nodes";

  return (
    <section
      id="tab-flowchart"
      aria-label="Flowchart Scratchpad"
      className="tab-content flex-1 flex flex-col overflow-hidden"
    >
      {/* Flowchart Toolbar */}
      <div className="p-3 border-b border-slate-800 bg-slate-950/50 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => handleAddNode('process')}
            title="Add Process Box"
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-sky-300 flex items-center gap-1 transition"
          >
            <Square className="w-3.5 h-3.5" /> Process
          </button>
          <button
            type="button"
            onClick={() => handleAddNode('decision')}
            title="Add Decision Diamond"
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-amber-300 flex items-center gap-1 transition"
          >
            <Diamond className="w-3.5 h-3.5" /> Decision
          </button>
          <button
            type="button"
            onClick={() => handleAddNode('start')}
            title="Add Start/End Pill"
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-emerald-300 flex items-center gap-1 transition"
          >
            <CircleDot className="w-3.5 h-3.5" /> Terminal
          </button>
          <button
            type="button"
            id="connect-mode-btn"
            onClick={toggleConnectMode}
            title="Connect two nodes with an arrow"
            className={
              connectMode
                ? 'px-2.5 py-1.5 rounded-lg bg-indigo-600 text-xs text-white flex items-center gap-1 transition shadow'
                : 'px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-slate-300 flex items-center gap-1 transition'
            }
          >
            <GitCommit className="w-3.5 h-3.5" />
            <span id="connect-btn-label">
              {connectMode ? 'Connecting...' : 'Connect'}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleResetDemo}
            aria-label="Reset Demo Flowchart"
            title="Reset Demo Flowchart"
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleClearCanvas}
            aria-label="Clear Canvas"
            title="Clear Canvas"
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 hover:text-rose-300 text-slate-300 text-xs"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setIsLucidModalOpen(true)}
            className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-medium flex items-center gap-1.5 transition"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Lucidchart Sync</span>
          </button>
        </div>
      </div>

      {/* Helper Subbar */}
      <div
        id="flow-helper-bar"
        className="px-3.5 py-1.5 bg-indigo-950/40 border-b border-indigo-500/20 flex items-center justify-between text-[11px] text-indigo-200"
      >
        <span id="flow-status-msg">{statusMessage}</span>
        <button
          type="button"
          onClick={handleExportSVG}
          className="underline hover:text-white"
        >
          Download SVG
        </button>
      </div>

      {/* Interactive SVG + HTML Flowchart Canvas */}
      <div
        ref={canvasWrapperRef}
        id="flow-canvas-wrapper"
        className="relative flex-1 canvas-grid overflow-hidden bg-slate-950"
      >
        {/* SVG Layer for Directed Arrows */}
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
          </defs>
          <g id="flow-edges-group">
            {flowData.edges.map((edge, idx) => {
              const fromNode = flowData.nodes.find((n) => n.id === edge.from);
              const toNode = flowData.nodes.find((n) => n.id === edge.to);
              if (!fromNode || !toNode) return null;

              const x1 = fromNode.x + 72;
              const y1 = fromNode.y + 26;
              const x2 = toNode.x + 72;
              const y2 = toNode.y + 26;
              const dy = y2 - y1;
              const pathData = `M ${x1} ${y1} C ${x1} ${
                y1 + dy * 0.45
              }, ${x2} ${y2 - dy * 0.45}, ${x2} ${y2}`;

              return (
                <path
                  key={`${edge.from}-${edge.to}-${idx}`}
                  d={pathData}
                  stroke="#818cf8"
                  strokeWidth="2.2"
                  fill="none"
                  markerEnd="url(#arrowhead)"
                  onClick={() => handleDeleteEdge(idx)}
                  className="pointer-events-auto cursor-pointer hover:stroke-rose-400 transition-colors"
                >
                  <title>Click to remove connector</title>
                </path>
              );
            })}
          </g>
        </svg>

        {/* HTML Layer for Draggable Nodes */}
        <div id="flow-nodes-layer" className="absolute inset-0 w-full h-full">
          {flowData.nodes.map((node) => {
            let shapeClasses =
              'rounded-xl bg-sky-950/90 border-2 border-sky-400/70 text-sky-100';
            if (node.type === 'decision') {
              shapeClasses =
                'rounded-2xl bg-amber-950/90 border-2 border-amber-400/80 text-amber-100 border-dashed';
            } else if (node.type === 'start') {
              shapeClasses =
                'rounded-full bg-emerald-950/90 border-2 border-emerald-400/80 text-emerald-100';
            }

            if (connectMode && connectSourceNodeId === node.id) {
              shapeClasses += ' ring-4 ring-indigo-500';
            }

            return (
              <div
                key={node.id}
                data-id={node.id}
                data-testid={`flow-node-${node.id}`}
                style={{ left: `${node.x}px`, top: `${node.y}px` }}
                onMouseDown={(e) => handleNodeMouseDown(e, node)}
                className={`absolute w-36 min-h-[52px] px-3 py-2 shadow-xl flex items-center justify-center text-center text-xs font-medium cursor-move select-none transition-shadow group ${shapeClasses}`}
              >
                {editingNodeId === node.id ? (
                  <input
                    type="text"
                    value={editingText}
                    onChange={(e) => setEditingText(e.target.value)}
                    onBlur={() => commitEditingNode(node.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitEditingNode(node.id);
                      if (e.key === 'Escape') setEditingNodeId(null);
                    }}
                    autoFocus
                    className="w-full bg-slate-900 text-white text-xs px-1.5 py-0.5 rounded border border-indigo-400 focus:outline-none text-center"
                  />
                ) : (
                  <span
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      startEditingNode(node);
                    }}
                    className="leading-snug break-words pointer-events-auto"
                  >
                    {node.text}
                  </span>
                )}

                <button
                  type="button"
                  aria-label={`Delete node ${node.text}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteNode(node.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 focus:opacity-100 absolute -top-2 -right-2 w-5 h-5 rounded-full bg-rose-600 text-white flex items-center justify-center text-[10px] shadow"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Lucidchart Integration Modal */}
      <LucidModal
        isOpen={isLucidModalOpen}
        flowData={flowData}
        onClose={() => setIsLucidModalOpen(false)}
        onUpdateFlowData={(updated) => onChangeFlowData(updated)}
        onNotify={onNotify}
      />
    </section>
  );
};
