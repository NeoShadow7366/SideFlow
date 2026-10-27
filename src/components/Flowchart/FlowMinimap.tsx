import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { X, Compass } from 'lucide-react';
import { AccentColor, FlowEdge, FlowNode } from '../../types/sideflow';
import { getNodeDimensions } from '../../utils/mermaid';

export interface FlowMinimapSubgraphBounds {
  id: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FlowMinimapProps {
  nodes: FlowNode[];
  edges: FlowEdge[];
  subgraphs?: FlowMinimapSubgraphBounds[];
  selectedNodeIds: string[];
  selectedNodeId: string | null;
  panOffset: { x: number; y: number };
  zoomLevel: number;
  viewportWidth: number;
  viewportHeight: number;
  compact?: boolean;
  dimmedForPopover?: boolean;
  onPanToOffset: (nextOffset: { x: number; y: number }) => void;
  onClose: () => void;
}

const NODE_FILL_HEX: Record<AccentColor, string> = {
  indigo: '#6366f1',
  cyan: '#06b6d4',
  emerald: '#10b981',
  amber: '#f59e0b',
  rose: '#f43f5e',
  purple: '#a855f7',
};

interface MinimapTransformSnapshot {
  worldMinX: number;
  worldMinY: number;
  scale: number;
  offsetX: number;
  offsetY: number;
  svgW: number;
  svgH: number;
  safeViewW: number;
  safeViewH: number;
  safeZoom: number;
}

export const FlowMinimap: React.FC<FlowMinimapProps> = ({
  nodes,
  edges,
  subgraphs = [],
  selectedNodeIds,
  selectedNodeId,
  panOffset,
  zoomLevel,
  viewportWidth,
  viewportHeight,
  compact = false,
  dimmedForPopover = false,
  onPanToOffset,
  onClose,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragSnapshotRef = useRef<MinimapTransformSnapshot | null>(null);
  const onPanToOffsetRef = useRef(onPanToOffset);
  onPanToOffsetRef.current = onPanToOffset;
  const [liveStatus, setLiveStatus] = useState<string>('');

  const svgW = compact ? 136 : 172;
  const svgH = compact ? 86 : 108;

  const safeZoom = Math.max(0.2, zoomLevel || 1);
  const safeViewW = Math.max(200, viewportWidth || 640);
  const safeViewH = Math.max(160, viewportHeight || 420);

  const viewWorldX = -panOffset.x / safeZoom;
  const viewWorldY = -panOffset.y / safeZoom;
  const viewWorldW = safeViewW / safeZoom;
  const viewWorldH = safeViewH / safeZoom;

  const nodeGeomList = useMemo(() => {
    return nodes.map((node) => {
      const dim = getNodeDimensions(node);
      return {
        node,
        x: node.x,
        y: node.y,
        width: dim.width,
        height: dim.height,
        cx: node.x + dim.width / 2,
        cy: node.y + dim.height / 2,
      };
    });
  }, [nodes]);

  const nodeGeomMap = useMemo(() => {
    const map = new Map<string, (typeof nodeGeomList)[number]>();
    for (const item of nodeGeomList) {
      map.set(item.node.id, item);
    }
    return map;
  }, [nodeGeomList]);

  const radarGeometry = useMemo(() => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const item of nodeGeomList) {
      minX = Math.min(minX, item.x);
      minY = Math.min(minY, item.y);
      maxX = Math.max(maxX, item.x + item.width);
      maxY = Math.max(maxY, item.y + item.height);
    }

    for (const sg of subgraphs) {
      minX = Math.min(minX, sg.x);
      minY = Math.min(minY, sg.y);
      maxX = Math.max(maxX, sg.x + sg.width);
      maxY = Math.max(maxY, sg.y + sg.height);
    }

    if (!Number.isFinite(minX)) {
      minX = 0;
      minY = 0;
      maxX = safeViewW;
      maxY = safeViewH;
    }

    // Include viewport bounds so the camera indicator is always visible relative to the graph
    const worldMinX = Math.min(minX, viewWorldX) - 48;
    const worldMinY = Math.min(minY, viewWorldY) - 48;
    const worldMaxX = Math.max(maxX, viewWorldX + viewWorldW) + 48;
    const worldMaxY = Math.max(maxY, viewWorldY + viewWorldH) + 48;

    const worldW = Math.max(160, worldMaxX - worldMinX);
    const worldH = Math.max(120, worldMaxY - worldMinY);

    const scale = Math.min((svgW - 8) / worldW, (svgH - 8) / worldH);
    const offsetX = (svgW - worldW * scale) / 2;
    const offsetY = (svgH - worldH * scale) / 2;

    const graphCenterX = (minX + maxX) / 2;
    const graphCenterY = (minY + maxY) / 2;

    return {
      worldMinX,
      worldMinY,
      scale,
      offsetX,
      offsetY,
      graphCenterX,
      graphCenterY,
    };
  }, [
    nodeGeomList,
    subgraphs,
    viewWorldX,
    viewWorldY,
    viewWorldW,
    viewWorldH,
    safeViewW,
    safeViewH,
    svgW,
    svgH,
  ]);

  const applyPointerPan = useCallback(
    (clientX: number, clientY: number, snapshot: MinimapTransformSnapshot) => {
      const svgEl = svgRef.current;
      if (!svgEl) return;
      const rect = svgEl.getBoundingClientRect();
      const cssW = rect.width > 0 ? rect.width : snapshot.svgW;
      const cssH = rect.height > 0 ? rect.height : snapshot.svgH;

      const localX = ((clientX - rect.left) / cssW) * snapshot.svgW;
      const localY = ((clientY - rect.top) / cssH) * snapshot.svgH;

      const targetWorldX =
        snapshot.worldMinX + (localX - snapshot.offsetX) / snapshot.scale;
      const targetWorldY =
        snapshot.worldMinY + (localY - snapshot.offsetY) / snapshot.scale;

      const nextPanX = Math.round(
        snapshot.safeViewW / 2 - targetWorldX * snapshot.safeZoom
      );
      const nextPanY = Math.round(
        snapshot.safeViewH / 2 - targetWorldY * snapshot.safeZoom
      );

      onPanToOffsetRef.current({ x: nextPanX, y: nextPanY });
    },
    []
  );

  useEffect(() => {
    const handleWindowMouseMove = (e: MouseEvent) => {
      if (!dragSnapshotRef.current) return;
      applyPointerPan(e.clientX, e.clientY, dragSnapshotRef.current);
    };
    const clearDrag = () => {
      dragSnapshotRef.current = null;
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', clearDrag);
    window.addEventListener('blur', clearDrag);
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', clearDrag);
      window.removeEventListener('blur', clearDrag);
    };
  }, [applyPointerPan]);

  const selectedSet = useMemo(() => {
    const s = new Set(selectedNodeIds);
    if (selectedNodeId) s.add(selectedNodeId);
    return s;
  }, [selectedNodeIds, selectedNodeId]);

  const { worldMinX, worldMinY, scale, offsetX, offsetY } = radarGeometry;
  const toMiniX = (wx: number) => offsetX + (wx - worldMinX) * scale;
  const toMiniY = (wy: number) => offsetY + (wy - worldMinY) * scale;

  const vpRectX = toMiniX(viewWorldX);
  const vpRectY = toMiniY(viewWorldY);
  const vpRectW = Math.max(8, viewWorldW * scale);
  const vpRectH = Math.max(6, viewWorldH * scale);

  const announceKeyboardPan = (nextX: number, nextY: number) => {
    const centerWorldX = Math.round((safeViewW / 2 - nextX) / safeZoom);
    const centerWorldY = Math.round((safeViewH / 2 - nextY) / safeZoom);
    setLiveStatus(
      `Viewport centered at (${centerWorldX}, ${centerWorldY}), ${Math.round(
        safeZoom * 100
      )}% zoom`
    );
  };

  return (
    <div
      data-testid="flow-minimap"
      role="region"
      aria-label="Flowchart Minimap Navigator"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      className={`absolute bottom-14 right-3 z-20 rounded-xl bg-slate-900/95 backdrop-blur-md border border-slate-700/80 shadow-2xl overflow-hidden select-none transition-opacity ${
        dimmedForPopover ? 'opacity-20 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* Polite Live Region for Keyboard Pan Feedback */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {liveStatus}
      </div>

      {/* Compact Radar Header */}
      <div className="px-2 py-1 border-b border-slate-800/90 bg-slate-950/75 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-300 inline-flex items-center gap-1">
          <Compass className="w-3 h-3 text-indigo-400" aria-hidden="true" />
          <span>Minimap</span>
          <span className="font-mono text-slate-400">({nodes.length})</span>
        </span>
        <button
          type="button"
          data-testid="close-flow-minimap-btn"
          aria-label="Hide Flowchart Minimap"
          title="Hide Minimap"
          onClick={onClose}
          className="w-6 h-6 -mr-1 rounded-md flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition"
        >
          <X className="w-3 h-3" aria-hidden="true" />
        </button>
      </div>

      {/* Interactive Radar SVG */}
      <svg
        ref={svgRef}
        data-testid="flow-minimap-svg"
        width={svgW}
        height={svgH}
        viewBox={`0 0 ${svgW} ${svgH}`}
        tabIndex={0}
        role="application"
        aria-roledescription="2D flowchart radar"
        aria-label="Interactive Flowchart Radar — Arrow keys to pan, Shift+Arrow to pan faster, Home to center, Escape to hide"
        onMouseDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          e.stopPropagation();
          svgRef.current?.focus({ preventScroll: true });
          const snapshot: MinimapTransformSnapshot = {
            worldMinX,
            worldMinY,
            scale,
            offsetX,
            offsetY,
            svgW,
            svgH,
            safeViewW,
            safeViewH,
            safeZoom,
          };
          dragSnapshotRef.current = snapshot;
          applyPointerPan(e.clientX, e.clientY, snapshot);
        }}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 160 : 80;
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            const nextX = panOffset.x + step;
            onPanToOffset({ x: nextX, y: panOffset.y });
            announceKeyboardPan(nextX, panOffset.y);
          } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            const nextX = panOffset.x - step;
            onPanToOffset({ x: nextX, y: panOffset.y });
            announceKeyboardPan(nextX, panOffset.y);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const nextY = panOffset.y + step;
            onPanToOffset({ x: panOffset.x, y: nextY });
            announceKeyboardPan(panOffset.x, nextY);
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            const nextY = panOffset.y - step;
            onPanToOffset({ x: panOffset.x, y: nextY });
            announceKeyboardPan(panOffset.x, nextY);
          } else if (e.key === 'Home') {
            e.preventDefault();
            const nextX = Math.round(
              safeViewW / 2 - radarGeometry.graphCenterX * safeZoom
            );
            const nextY = Math.round(
              safeViewH / 2 - radarGeometry.graphCenterY * safeZoom
            );
            onPanToOffset({ x: nextX, y: nextY });
            announceKeyboardPan(nextX, nextY);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }
        }}
        className="block cursor-crosshair bg-slate-950/85"
      >
        <g aria-hidden="true">
          {/* Subgraph Enclosures */}
          {subgraphs.map((sg) => (
            <rect
              key={`mini-sg-${sg.id}`}
              x={toMiniX(sg.x)}
              y={toMiniY(sg.y)}
              width={Math.max(4, sg.width * scale)}
              height={Math.max(4, sg.height * scale)}
              rx={3}
              fill="rgba(99, 102, 241, 0.1)"
              stroke="rgba(129, 140, 248, 0.72)"
              strokeWidth={1}
              strokeDasharray="2,2"
            />
          ))}

          {/* Simplified Connector Lines */}
          {edges.map((edge, idx) => {
            const from = nodeGeomMap.get(edge.from);
            const to = nodeGeomMap.get(edge.to);
            if (!from || !to) return null;
            return (
              <line
                key={`mini-edge-${edge.from}-${edge.to}-${idx}`}
                x1={toMiniX(from.cx)}
                y1={toMiniY(from.cy)}
                x2={toMiniX(to.cx)}
                y2={toMiniY(to.cy)}
                stroke="rgba(129, 140, 248, 0.8)"
                strokeWidth={1.1}
              />
            );
          })}

          {/* Color-Coded Node Silhouettes */}
          {nodeGeomList.map((item) => {
            const { node } = item;
            const nx = toMiniX(item.x);
            const ny = toMiniY(item.y);
            const nw = Math.max(5, item.width * scale);
            const nh = Math.max(3.5, item.height * scale);
            const isSelected = selectedSet.has(node.id);
            const fillHex = node.color
              ? NODE_FILL_HEX[node.color]
              : node.type === 'decision'
              ? '#f59e0b'
              : node.type === 'start'
              ? '#10b981'
              : node.type === 'database'
              ? '#a855f7'
              : '#6366f1';

            if (node.type === 'decision') {
              const mx = nx + nw / 2;
              const my = ny + nh / 2;
              return (
                <polygon
                  key={`mini-node-${node.id}`}
                  data-testid={`mini-node-${node.id}`}
                  points={`${mx},${ny} ${nx + nw},${my} ${mx},${ny + nh} ${nx},${my}`}
                  fill={fillHex}
                  fillOpacity={isSelected ? 0.96 : 0.85}
                  stroke={isSelected ? '#ffffff' : 'rgba(226, 232, 240, 0.5)'}
                  strokeWidth={isSelected ? 1.5 : 0.7}
                />
              );
            }

            return (
              <rect
                key={`mini-node-${node.id}`}
                data-testid={`mini-node-${node.id}`}
                x={nx}
                y={ny}
                width={nw}
                height={nh}
                rx={
                  node.type === 'start' || node.type === 'circle'
                    ? Math.min(nw, nh) / 2
                    : 2
                }
                fill={fillHex}
                fillOpacity={isSelected ? 0.96 : 0.85}
                stroke={isSelected ? '#ffffff' : 'rgba(226, 232, 240, 0.5)'}
                strokeWidth={isSelected ? 1.5 : 0.7}
              />
            );
          })}

          {/* Live Camera Viewport Frame */}
          <rect
            data-testid="flow-minimap-viewport"
            x={vpRectX}
            y={vpRectY}
            width={vpRectW}
            height={vpRectH}
            rx={2.5}
            fill="rgba(56, 189, 248, 0.14)"
            stroke="#38bdf8"
            strokeWidth={1.4}
          />
        </g>
      </svg>
    </div>
  );
};
