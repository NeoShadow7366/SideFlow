import React from 'react';
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vitest';
import {
  render,
  screen,
  fireEvent,
  within,
  waitFor,
} from '@testing-library/react';
import App from '../App';
import { isSafeCustomIconUrl } from '../components/CommandPalette';
import { FlowCanvas } from '../components/Flowchart/FlowCanvas';
import { FlowchartState } from '../types/sideflow';

describe('SideFlow Phase 5 UX Suite — Global Command Palette & Flowchart Minimap', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete window.sideflow;
    document.body.removeAttribute('data-sideflow-modal-open');
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete window.sideflow;
    document.body.removeAttribute('data-sideflow-modal-open');
  });

  describe('1. Global Ctrl+K Command Palette (ARIA Combobox + Unified Search)', () => {
    it('opens via Header button, exposes WAI-ARIA 1.2 combobox/listbox semantics, keeps empty state outside role="listbox", and restores focus on Escape', async () => {
      render(<App />);

      const headerBtn = screen.getByTestId('open-command-palette-btn');
      expect(headerBtn).toHaveAttribute('aria-haspopup', 'dialog');
      expect(headerBtn).toHaveAttribute('aria-keyshortcuts', 'Control+K');
      headerBtn.focus();
      expect(document.activeElement).toBe(headerBtn);

      fireEvent.click(headerBtn);

      const dialog = screen.getByRole('dialog', {
        name: /SideFlow Command Palette/i,
      });
      expect(dialog).toBeInTheDocument();

      const combobox = screen.getByTestId('command-palette-input');
      const listbox = screen.getByTestId('command-palette-listbox');
      expect(combobox).toHaveAttribute('role', 'combobox');
      expect(combobox).toHaveAttribute('aria-expanded', 'true');
      expect(combobox).toHaveAttribute(
        'aria-controls',
        'command-palette-listbox'
      );
      expect(listbox).toHaveAttribute('role', 'listbox');

      await waitFor(() => {
        expect(document.activeElement).toBe(combobox);
      });

      const firstActiveId = combobox.getAttribute('aria-activedescendant');
      expect(firstActiveId).toBeTruthy();
      expect(document.getElementById(firstActiveId!)).toHaveAttribute(
        'aria-selected',
        'true'
      );

      // ArrowDown advances active option; ArrowUp returns to first option
      fireEvent.keyDown(combobox, { key: 'ArrowDown' });
      const secondActiveId = combobox.getAttribute('aria-activedescendant');
      expect(secondActiveId).toBeTruthy();
      expect(secondActiveId).not.toBe(firstActiveId);
      expect(document.getElementById(secondActiveId!)).toHaveAttribute(
        'aria-selected',
        'true'
      );

      fireEvent.keyDown(combobox, { key: 'ArrowUp' });
      expect(combobox.getAttribute('aria-activedescendant')).toBe(
        firstActiveId
      );

      // Zero-match query sets aria-expanded="false", hides listbox, and renders empty state OUTSIDE role="listbox"
      fireEvent.change(combobox, {
        target: { value: 'zzzz-nonexistent-query-9999' },
      });
      expect(combobox).toHaveAttribute('aria-expanded', 'false');
      expect(listbox).toHaveAttribute('hidden');
      const emptyState = screen.getByTestId('command-palette-empty');
      expect(emptyState).toBeInTheDocument();
      expect(listbox.contains(emptyState)).toBe(false);

      // Escape dismisses Command Palette and restores focus to Header button
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(
        screen.queryByRole('dialog', { name: /SideFlow Command Palette/i })
      ).not.toBeInTheDocument();
      expect(document.activeElement).toBe(headerBtn);
    });

    it('opens via Ctrl+K from inside a text input or when hidden, closes when panel hides via Alt+Space, and reserves Ctrl+K during hotkey recording', () => {
      render(<App />);

      // 1. Focus inside Dock search input and press Ctrl+K
      const dockSearch = document.getElementById(
        'app-search-input'
      ) as HTMLInputElement;
      dockSearch.focus();
      expect(document.activeElement).toBe(dockSearch);

      fireEvent.keyDown(dockSearch, { key: 'k', ctrlKey: true });
      expect(
        screen.getByRole('dialog', { name: /SideFlow Command Palette/i })
      ).toBeInTheDocument();

      // 2. Pressing global panel toggle (Alt+Space) collapses the panel AND closes CommandPalette cleanly
      fireEvent.keyDown(window, { key: ' ', code: 'Space', altKey: true });
      const sidePanel = document.getElementById('side-panel')!;
      expect(sidePanel.className).toContain('opacity-0');
      expect(
        screen.queryByRole('dialog', { name: /SideFlow Command Palette/i })
      ).not.toBeInTheDocument();

      // 3. Summon via Ctrl+K while panel is hidden -> re-opens panel + palette
      fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
      expect(sidePanel.className).toContain('translate-x-0');
      expect(sidePanel.className).not.toContain('opacity-0');
      expect(
        screen.getByRole('dialog', { name: /SideFlow Command Palette/i })
      ).toBeInTheDocument();
      fireEvent.keyDown(window, { key: 'k', ctrlKey: true });

      // 4. Start recording global hotkey in Config tab -> Ctrl+K is reserved and not bound
      fireEvent.click(
        screen.getByRole('tab', { name: /Config — Shortcut & Tray Settings/i })
      );
      fireEvent.click(
        screen.getByRole('button', {
          name: /Click & Press New Shortcut Combo/i,
        })
      );
      fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
      expect(
        JSON.parse(window.localStorage.getItem('sideflow_shortcut') || '{}')
          .label ?? 'Alt + Space'
      ).toBe('Alt + Space');
      expect(
        screen.queryByRole('dialog', { name: /SideFlow Command Palette/i })
      ).not.toBeInTheDocument();
    });

    it('searches and launches a native application on Enter via Command Palette', () => {
      const launchNativeApp = vi.fn().mockResolvedValue({ success: true });
      window.sideflow = {
        isElectron: true,
        launchNativeApp,
      } as unknown as NonNullable<Window['sideflow']>;

      render(<App />);
      fireEvent.keyDown(window, { key: 'k', ctrlKey: true });

      const combobox = screen.getByTestId('command-palette-input');
      fireEvent.change(combobox, { target: { value: 'Docker Engine' } });
      fireEvent.keyDown(combobox, { key: 'Enter' });

      expect(launchNativeApp).toHaveBeenCalledWith(
        'C:\\Program Files\\Docker\\Docker Desktop.exe'
      );
      expect(
        screen.queryByRole('dialog', { name: /SideFlow Command Palette/i })
      ).not.toBeInTheDocument();
    });

    it('switches, creates, and auto-layouts diagrams while FlowCanvas is mounted, tolerates malformed localStorage entries, and jumps to notes', () => {
      // Seed a mix of valid and malformed diagram entries to verify schema resilience
      window.localStorage.setItem(
        'sideflow_flow_diagrams_v1',
        JSON.stringify([
          { id: 'bad-1', title: 'Corrupt Diagram', flowData: {} },
          {
            id: 'flow-valid',
            title: 'Production Microservices Mesh',
            flowData: {
              nodes: [
                { id: 'm1', type: 'start', text: 'API Gateway', x: 50, y: 50 },
                { id: 'm2', type: 'database', text: 'Postgres', x: 250, y: 180 },
              ],
              edges: [{ from: 'm1', to: 'm2' }],
            },
            updatedAt: Date.now(),
          },
        ])
      );

      render(<App />);

      // Mount FlowCanvas first
      fireEvent.click(screen.getByRole('tab', { name: /^Flow$/i }));

      // Switch to valid saved diagram via Ctrl+K while FlowCanvas is mounted
      fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
      const combobox1 = screen.getByTestId('command-palette-input');
      const listbox1 = screen.getByTestId('command-palette-listbox');
      expect(
        within(listbox1).queryByText('Corrupt Diagram')
      ).not.toBeInTheDocument();
      fireEvent.change(combobox1, {
        target: { value: 'Production Microservices Mesh' },
      });
      fireEvent.keyDown(combobox1, { key: 'Enter' });

      expect(screen.getByTestId('flow-node-m1')).toBeInTheDocument();
      expect(
        JSON.parse(
          window.localStorage.getItem('sideflow_active_diagram_id') || '""'
        )
      ).toBe('flow-valid');

      // Run Auto-Layout Active Flowchart via Ctrl+K without crashing
      fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
      const comboboxLayout = screen.getByTestId('command-palette-input');
      fireEvent.change(comboboxLayout, {
        target: { value: 'Auto-Layout Active Flowchart' },
      });
      fireEvent.keyDown(comboboxLayout, { key: 'Enter' });
      expect(screen.getByTestId('flow-node-m1')).toBeInTheDocument();

      // Re-open Command Palette, filter Notes, search body phrase "voice capture", and jump to Note 2
      fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
      fireEvent.click(screen.getByTestId('cmd-filter-notes'));
      const combobox2 = screen.getByTestId('command-palette-input');
      fireEvent.change(combobox2, { target: { value: 'voice capture' } });
      fireEvent.keyDown(combobox2, { key: 'Enter' });

      expect(screen.getByRole('tab', { name: /^Notes$/i })).toHaveAttribute(
        'aria-selected',
        'true'
      );
      expect(
        JSON.parse(
          window.localStorage.getItem('sideflow_active_note_id') || '""'
        )
      ).toBe('note-2');
    });

    it('validates customIconUrl schemes to block javascript:, file:, and UNC paths', () => {
      expect(isSafeCustomIconUrl('javascript:alert(1)')).toBe(false);
      expect(isSafeCustomIconUrl('file:////evil.example.com/share/a.png')).toBe(
        false
      );
      expect(isSafeCustomIconUrl('\\\\evil.example.com\\share\\a.png')).toBe(
        false
      );
      expect(
        isSafeCustomIconUrl(
          'data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%3E%3C/svg%3E'
        )
      ).toBe(true);
      expect(isSafeCustomIconUrl('https://cdn.example.com/icon.png')).toBe(
        true
      );
    });

    it('filters Workspace Commands and executes Dock Left Screen Edge action', () => {
      render(<App />);

      fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
      fireEvent.click(screen.getByTestId('cmd-filter-actions'));

      const combobox = screen.getByTestId('command-palette-input');
      fireEvent.change(combobox, {
        target: { value: 'Dock Panel to Left Screen Edge' },
      });
      fireEvent.keyDown(combobox, { key: 'Enter' });

      expect(
        JSON.parse(window.localStorage.getItem('sideflow_panel_edge') || '""')
      ).toBe('left');
    });
  });

  describe('2. Interactive Flowchart Minimap Radar', () => {
    it('renders node silhouettes and viewport indicator, pans on left-click & Arrow keys, ignores right-click, and restores focus to HUD toggle on close', async () => {
      render(<App />);

      // Switch to Flow tab
      fireEvent.click(screen.getByRole('tab', { name: /^Flow$/i }));

      const minimap = screen.getByTestId('flow-minimap');
      const minimapSvg = screen.getByTestId('flow-minimap-svg');
      const viewportRect = screen.getByTestId('flow-minimap-viewport');
      const stage = screen.getByTestId('flow-canvas-stage');

      expect(minimap).toBeInTheDocument();
      expect(minimapSvg).toHaveAttribute('role', 'application');
      expect(viewportRect).toBeInTheDocument();
      expect(within(minimap).getByTestId('mini-node-n1')).toBeInTheDocument();
      expect(within(minimap).getByTestId('mini-node-n2')).toBeInTheDocument();
      expect(stage.style.transform).toBe('translate(0px, 0px) scale(1)');

      // Right-click (button: 2) on minimap SVG is ignored
      fireEvent.mouseDown(minimapSvg, { button: 2, clientX: 145, clientY: 90 });
      expect(stage.style.transform).toBe('translate(0px, 0px) scale(1)');

      // Left-click (button: 0) on minimap SVG pans the viewport away from (0, 0)
      fireEvent.mouseDown(minimapSvg, { button: 0, clientX: 145, clientY: 90 });
      fireEvent.mouseUp(window);
      const afterClickTransform = stage.style.transform;
      expect(afterClickTransform).not.toBe('translate(0px, 0px) scale(1)');

      // Keyboard ArrowRight on minimap SVG shifts panOffset horizontally and updates polite live region
      minimapSvg.focus();
      fireEvent.keyDown(minimapSvg, { key: 'ArrowRight' });
      expect(stage.style.transform).not.toBe(afterClickTransform);
      expect(within(minimap).getByRole('status')).toHaveTextContent(
        /Viewport centered at/i
      );

      // Escape on minimap SVG hides minimap and restores focus to HUD toggle button
      const toggleBtn = screen.getByTestId('toggle-flow-minimap-btn');
      fireEvent.keyDown(minimapSvg, { key: 'Escape' });
      expect(toggleBtn).toHaveAttribute('aria-pressed', 'false');
      expect(screen.queryByTestId('flow-minimap')).not.toBeInTheDocument();
      expect(window.localStorage.getItem('sideflow_flow_minimap')).toBe(
        'false'
      );
      await waitFor(() => {
        expect(document.activeElement).toBe(toggleBtn);
      });

      // Toggle minimap back on via HUD button
      fireEvent.click(toggleBtn);
      expect(toggleBtn).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByTestId('flow-minimap')).toBeInTheDocument();
      expect(window.localStorage.getItem('sideflow_flow_minimap')).toBe('true');
    });
  });

  describe('3. Lucidchart-Style Quick Shape Palette, Vector SVG Node Silhouettes & Connector UX', () => {
    it('renders inline SVG shape silhouettes, opens Quick Shape Palette with search/category filtering & drag-and-drop creation, morphs shapes & colors via floating toolbar, and avoids duplicate edge labels', () => {
      render(<App />);

      fireEvent.click(screen.getByRole('tab', { name: /^Flow$/i }));

      // 1. Verify true inline SVG shape silhouettes render on canvas nodes
      expect(screen.getByTestId('node-shape-svg-n1')).toBeInTheDocument();
      expect(screen.getByTestId('node-shape-svg-n2')).toBeInTheDocument();

      // 2. Open floating Quick Shape Palette from primary toolbar
      const paletteToggleBtn = screen.getByTestId('toggle-shape-palette-btn');
      expect(paletteToggleBtn).toHaveAttribute('aria-pressed', 'false');
      fireEvent.click(paletteToggleBtn);
      expect(paletteToggleBtn).toHaveAttribute('aria-pressed', 'true');

      const palettePopover = screen.getByTestId('quick-shape-palette-popover');
      expect(palettePopover).toBeInTheDocument();

      // Filter by category 'data' and search 'Doc'
      fireEvent.click(screen.getByTestId('palette-category-data'));
      const searchInput = screen.getByTestId('shape-palette-search');
      fireEvent.change(searchInput, { target: { value: 'Doc' } });
      expect(screen.getByTestId('palette-shape-document')).toBeInTheDocument();
      expect(
        screen.queryByTestId('palette-shape-process')
      ).not.toBeInTheDocument();

      // Click Document stencil in Quick Shape Palette to spawn a Document node
      fireEvent.click(screen.getByTestId('palette-shape-document'));
      expect(screen.getByTestId('flow-node-n5')).toHaveAttribute(
        'data-shape',
        'document'
      );

      // Drag and drop a Callout Note ('note') onto the canvas wrapper
      const canvasWrapper = document.getElementById('flow-canvas-wrapper')!;
      fireEvent.drop(canvasWrapper, {
        clientX: 280,
        clientY: 220,
        dataTransfer: {
          types: ['application/x-sideflow-shape'],
          getData: (type: string) =>
            type === 'application/x-sideflow-shape' ? 'note' : '',
        },
      });
      // Commit inline edit on newly dropped node
      const editInput = screen.getByLabelText('Edit node label');
      fireEvent.keyDown(editInput, { key: 'Enter' });

      const noteNode = screen.getByRole('group', { name: /Node: Sticky Note/i });
      const noteId = noteNode.getAttribute('data-id')!;
      expect(noteNode).toHaveAttribute('data-shape', 'note');

      // 3. Select noteNode and test floating node context toolbar 1-click quick morph & color dot
      fireEvent.mouseDown(noteNode, { button: 0 });
      fireEvent.mouseUp(window);
      const nodeToolbar = screen.getByTestId(`selected-node-toolbar-${noteId}`);
      expect(nodeToolbar).toBeInTheDocument();

      fireEvent.click(screen.getByTestId(`quick-morph-database-${noteId}`));
      expect(noteNode).toHaveAttribute('data-shape', 'database');

      fireEvent.click(screen.getByTestId(`quick-color-emerald-${noteId}`));
      expect(noteNode).toHaveAttribute('data-color', 'emerald');

      // 4. Hover an edge to verify endpoint anchor dots appear and no duplicate SVG <text> is rendered inside #flow-svg-layer
      const firstEdge = screen.getByTestId('flow-edge-0');
      fireEvent.mouseEnter(firstEdge);
      expect(screen.getByTestId('edge-anchor-start-0')).toBeInTheDocument();
      expect(screen.getByTestId('edge-anchor-end-0')).toBeInTheDocument();
      expect(firstEdge.querySelector('text')).toBeNull();
    });

    it('supports precision multi-align, batch shape/color/clone, canvas node spotlight search, reverse connector direction, and 1-click Swimlane creation', () => {
      let currentFlow: FlowchartState = {
        nodes: [
          { id: 'n1', type: 'start', text: 'Auth Request', x: 40, y: 30 },
          { id: 'n2', type: 'process', text: 'Verify Token', x: 180, y: 110 },
          { id: 'n3', type: 'decision', text: 'Token Valid?', x: 90, y: 210 },
        ],
        edges: [
          { from: 'n1', to: 'n2' },
          { from: 'n2', to: 'n3', label: 'Checked' },
        ],
      };

      const Wrapper = () => {
        const [flow, setFlow] = React.useState(currentFlow);
        return (
          <FlowCanvas
            flowData={flow}
            onChangeFlowData={(updater) => {
              setFlow((prev) => {
                const next =
                  typeof updater === 'function' ? updater(prev) : updater;
                currentFlow = next;
                return next;
              });
            }}
            onNotify={vi.fn()}
            panelWidthPercent={65}
          />
        );
      };

      render(<Wrapper />);

      // 1. Canvas Node Search & Spotlight
      const searchInput = screen.getByTestId('flow-search-nodes-input');
      fireEvent.change(searchInput, { target: { value: 'Token' } });
      expect(screen.getByTestId('flow-search-match-count')).toHaveTextContent(
        '2'
      );
      expect(screen.getByTestId('flow-node-n2')).toHaveAttribute(
        'data-search-match',
        'true'
      );
      expect(screen.getByTestId('flow-node-n3')).toHaveAttribute(
        'data-search-match',
        'true'
      );
      expect(screen.getByTestId('flow-node-n1')).toHaveAttribute(
        'data-search-match',
        'false'
      );
      fireEvent.click(screen.getByTestId('flow-search-focus-btn'));
      // Clear search with Escape
      fireEvent.keyDown(searchInput, { key: 'Escape' });
      expect(
        screen.queryByTestId('flow-search-match-count')
      ).not.toBeInTheDocument();

      // 2. Select all nodes (Ctrl+A) and test Precision Alignment, Batch Shape, Batch Color, and Batch Clone
      fireEvent.keyDown(window, { key: 'a', ctrlKey: true });
      expect(screen.getByTestId('multi-select-toolbar')).toBeInTheDocument();

      // Align Left (min X = 40)
      fireEvent.click(screen.getByTestId('multi-align-left'));
      expect(currentFlow.nodes.every((n) => n.x === 40)).toBe(true);

      // Batch morph all selected nodes to 'hexagon'
      fireEvent.change(screen.getByTestId('multi-shape-select'), {
        target: { value: 'hexagon' },
      });
      expect(currentFlow.nodes.every((n) => n.type === 'hexagon')).toBe(true);

      // Batch set color to 'rose'
      fireEvent.click(screen.getByTestId('multi-color-rose'));
      expect(currentFlow.nodes.every((n) => n.color === 'rose')).toBe(true);

      // Batch Clone selected nodes + internal edges
      fireEvent.click(screen.getByTestId('multi-duplicate-btn'));
      expect(currentFlow.nodes.length).toBe(6);
      expect(currentFlow.edges.length).toBe(4);

      // 3. 1-Click Reverse Connector Direction
      const edgePill = screen.getByTestId('edge-label-pill-1');
      fireEvent.click(edgePill);
      expect(screen.getByTestId('uml-edge-toolbar')).toBeInTheDocument();
      expect(currentFlow.edges[1].from).toBe('n2');
      expect(currentFlow.edges[1].to).toBe('n3');
      fireEvent.click(screen.getByTestId('reverse-edge-btn'));
      expect(currentFlow.edges[1].from).toBe('n3');
      expect(currentFlow.edges[1].to).toBe('n2');

      // 4. 1-Click Parallel Swimlane creation
      const swimlaneBtn = screen.getByTestId('add-swimlane-btn');
      fireEvent.click(swimlaneBtn);
      expect(currentFlow.subgraphs?.length).toBe(1);
      expect(currentFlow.subgraphs?.[0].title).toContain('Customer');
      expect(currentFlow.nodes.length).toBe(8);
    });

    it('supports 1-click Split Yes/No Decision branching, interactive connector bend waypoints, collapsible/auto-fit subgraphs, and Diagram Health Linter + Critical-Path tracing', () => {
      let currentFlow: FlowchartState = {
        nodes: [
          { id: 'n1', type: 'start', text: 'API Request', x: 120, y: 40 },
          { id: 'n2', type: 'decision', text: 'Is Authorized?', x: 120, y: 150 },
          { id: 'n_orphan', type: 'process', text: 'Isolated Step', x: 380, y: 40 },
        ],
        edges: [{ from: 'n1', to: 'n2' }],
        subgraphs: [
          {
            id: 'sg_auth',
            title: 'Auth Layer',
            nodeIds: ['n1', 'n2'],
          },
        ],
      };

      const Wrapper = () => {
        const [flow, setFlow] = React.useState(currentFlow);
        return (
          <FlowCanvas
            flowData={flow}
            onChangeFlowData={(updater) => {
              setFlow((prev) => {
                const next =
                  typeof updater === 'function' ? updater(prev) : updater;
                currentFlow = next;
                return next;
              });
            }}
            onNotify={vi.fn()}
            panelWidthPercent={65}
          />
        );
      };

      render(<Wrapper />);

      // 1. Diagram Health Linter detects unbranched Decision ('n2') and Orphan Node ('n_orphan')
      expect(screen.getByTestId('flow-health-issue-count')).toHaveTextContent(
        '2'
      );
      fireEvent.click(screen.getByTestId('toggle-flow-health-btn'));
      expect(screen.getByTestId('flow-health-popover')).toBeInTheDocument();
      expect(
        screen.getByTestId('health-issue-orphan-n_orphan')
      ).toBeInTheDocument();
      expect(
        screen.getByTestId('health-issue-decision-n2')
      ).toBeInTheDocument();

      // Auto-Fix orphan node via 1-click Health Linter action
      fireEvent.click(screen.getByTestId('health-issue-fix-n_orphan'));
      expect(
        currentFlow.edges.some((e) => e.to === 'n_orphan')
      ).toBe(true);

      // 2. Select Decision node 'n2' and click 1-Click 'Yes/No' Split button
      const decisionNode = screen.getByTestId('flow-node-n2');
      fireEvent.mouseDown(decisionNode, { button: 0 });
      fireEvent.mouseUp(window);
      fireEvent.click(screen.getByTestId('split-yes-no-btn-n2'));
      expect(
        currentFlow.edges.filter((e) => e.from === 'n2' && e.label === 'Yes')
          .length
      ).toBe(1);
      expect(
        currentFlow.edges.filter((e) => e.from === 'n2' && e.label === 'No')
          .length
      ).toBe(1);

      // 3. Critical-Path Dependency Chain Highlighter ('Trace Path')
      fireEvent.click(screen.getByTestId('toggle-critical-path-btn'));
      expect(screen.getByTestId('flow-node-n1')).toHaveAttribute(
        'data-path-highlighted',
        'true'
      );
      expect(screen.getByTestId('flow-edge-0')).toHaveAttribute(
        'data-path-highlighted',
        'true'
      );

      // 4. Interactive Connector Bend Waypoints (Add Bend & Reset Bend)
      fireEvent.click(screen.getByTestId('edge-label-pill-0'));
      fireEvent.click(screen.getByTestId('edge-set-waypoint-btn'));
      expect(currentFlow.edges[0].waypoint).toBeDefined();
      expect(
        screen.getByTestId('edge-waypoint-handle-0')
      ).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('edge-reset-waypoint-btn'));
      expect(currentFlow.edges[0].waypoint).toBeUndefined();

      // 5. Collapsible Subgraph & 1-Click Auto-Fit Subgraph
      fireEvent.click(screen.getByTestId('subgraph-autofit-sg_auth'));
      fireEvent.click(screen.getByTestId('subgraph-collapse-sg_auth'));
      expect(
        screen.getByTestId('subgraph-collapsed-badge-sg_auth')
      ).toBeInTheDocument();
      expect(screen.queryByTestId('flow-node-n1')).not.toBeInTheDocument();
      // Expand subgraph back
      fireEvent.click(screen.getByTestId('subgraph-collapse-sg_auth'));
      expect(screen.getByTestId('flow-node-n1')).toBeInTheDocument();

      // 6. Custom Subgraph Accent Color Swatches (v1.9.0)
      fireEvent.click(screen.getByTestId('subgraph-color-sg_auth-emerald'));
      expect(currentFlow.subgraphs?.[0]?.color).toBe('emerald');
      expect(screen.getByTestId('flow-subgraph-sg_auth')).toHaveAttribute(
        'data-subgraph-color',
        'emerald'
      );
    });

    it('supports v1.9.0 cross-module enhancements: Dock Launch All, Favorites, Drawer Move, Running Filter, Notes List->Flow, Tag Filter, Duplicate, Checklist Progress, LucidModal Preview, and Wide Studio Toggle', () => {
      render(<App />);

      // Area 4: Global Panel & Header Wide Studio Toggle (35% <-> 65%)
      const sidePanel = screen.getByTestId('side-panel');
      expect(sidePanel).toHaveAttribute('data-width-percent', '35');
      const studioToggleBtn = screen.getByTestId('toggle-wide-studio-btn');
      fireEvent.click(studioToggleBtn);
      expect(sidePanel).toHaveAttribute('data-width-percent', '65');
      fireEvent.click(studioToggleBtn);
      expect(sidePanel).toHaveAttribute('data-width-percent', '35');

      // Area 1: ObjectDock Drawers — Star Favorite App, Launch All, Move Drawer, Running Filter
      fireEvent.click(screen.getByTestId('app-favorite-btn-app-1'));
      expect(screen.getByTestId('dock-favorites-bar')).toBeInTheDocument();
      expect(screen.getByTestId('favorite-chip-app-1')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('drawer-launch-all-drawer-dev'));
      fireEvent.click(screen.getByTestId('drawer-move-down-drawer-dev'));

      const runningFilterBtn = screen.getByTestId('filter-running-apps-btn');
      fireEvent.click(runningFilterBtn);
      expect(runningFilterBtn).toHaveAttribute('aria-pressed', 'true');
      fireEvent.click(runningFilterBtn);

      // Area 2: Voice & Markdown Notes — Checklist Progress, Reset Tasks, Tag Filter, Duplicate Note, and List -> Flow
      fireEvent.click(screen.getByRole('tab', { name: /Notes/i }));
      const noteEditor = screen.getByLabelText(/Note Body/i);
      fireEvent.change(noteEditor, {
        target: {
          value: '- [x] Start Release\n- [ ] Smoke Test Pass?\n- [ ] Ship v1.9.0',
        },
      });
      expect(screen.getByTestId('md-task-progress-badge')).toHaveTextContent(
        '1/3 Done'
      );
      fireEvent.click(screen.getByTestId('reset-md-tasks-btn'));
      expect(screen.getByTestId('md-task-progress-badge')).toHaveTextContent(
        '0/3 Done'
      );

      // Add a tag and filter by clicking the #tag pill
      fireEvent.click(screen.getByRole('button', { name: /Add Tag/i }));
      const tagInput = screen.getByLabelText(/New Note Tag/i);
      fireEvent.change(tagInput, { target: { value: 'release' } });
      fireEvent.submit(tagInput.closest('form')!);
      fireEvent.click(screen.getByTestId('note-tag-filter-release'));
      expect(screen.getByTestId('active-tag-filter-pill')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('active-tag-filter-pill'));

      // Duplicate Note
      fireEvent.click(screen.getByTestId('duplicate-note-btn'));
      expect(
        (screen.getByLabelText(/Note Title/i) as HTMLInputElement).value
      ).toContain('(Copy)');

      // Convert List -> Flow (switches to Flow tab and loads 3 nodes onto canvas)
      fireEvent.click(screen.getByTestId('convert-note-to-flow-btn'));
      expect(screen.getByTestId('flow-node-n1')).toHaveTextContent(
        'Start Release'
      );
      expect(screen.getByTestId('flow-node-n2')).toHaveTextContent(
        'Smoke Test Pass?'
      );

      // Area 3: LucidModal Live SVG Preview & .mmd Download
      fireEvent.click(
        screen.getByRole('button', { name: /Lucidchart Sync/i })
      );
      expect(screen.getByTestId('lucid-live-svg-preview')).toBeInTheDocument();
      expect(screen.getByTestId('lucid-download-mmd-btn')).toBeInTheDocument();
    });
  });
});
