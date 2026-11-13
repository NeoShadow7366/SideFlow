import React, { useRef, useState } from 'react';
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
  waitFor,
  act,
} from '@testing-library/react';
import App from '../App';
import {
  FloatingPortal,
  clampFloatingCoordinates,
} from '../components/FloatingPortal';
import { Modal } from '../components/Modal';
import { FlowCanvas } from '../components/Flowchart/FlowCanvas';
import { defaultFlowData } from '../utils/defaults';
import {
  generateMermaidCode,
  generateStandaloneSVG,
  hasSideflowLayoutMetadata,
  parseMermaidCode,
  renderCachedMermaidPreview,
} from '../utils/mermaid';
import {
  adfToMarkdown,
  isSafeAdfMediaUrl,
  markdownToAdf,
  validateAndNormalizeAdfDoc,
} from '../utils/adf';
import { adfInlineToEditorHtml } from '../utils/adfDom';
import { AdfDocNode, AppDrawer, FlowchartState } from '../types/sideflow';

describe('Wave 3: 320px Portals, Stacked Undo Queue, WCAG Roving TabIndex, Lossless SVG/ADF & Phase 0 Quick Wins', () => {
  const originalMediaDevices = navigator.mediaDevices;
  const originalAudioContext = window.AudioContext;

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
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      writable: true,
      value: originalMediaDevices,
    });
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      writable: true,
      value: originalAudioContext,
    });
  });

  describe('1. Blur-to-Close Suppression Guards (Modal Open & Active Dictation)', () => {
    it('suppresses auto-hide on window blur when a modal dialog is open, then auto-hides normally once closed', async () => {
      let blurCallback: (() => void) | null = null;
      const setPanelVisibilityMock = vi.fn();

      window.sideflow = {
        isElectron: true,
        setPanelVisibility: setPanelVisibilityMock,
        onWindowBlur: (cb: () => void) => {
          blurCallback = cb;
          return () => {
            blurCallback = null;
          };
        },
      } as unknown as typeof window.sideflow;

      // Start unpinned (Auto-Hide mode)
      window.localStorage.setItem('sideflow_pinned', JSON.stringify(false));

      render(<App />);
      expect(blurCallback).toBeTypeOf('function');

      // Open Add Application Modal
      fireEvent.click(screen.getByRole('button', { name: /^Add App$/i }));
      expect(document.body).toHaveAttribute('data-sideflow-modal-open', 'true');

      setPanelVisibilityMock.mockClear();
      act(() => {
        blurCallback?.();
      });

      // Panel MUST remain open while modal/dialog is active
      expect(setPanelVisibilityMock).not.toHaveBeenCalledWith(false);
      expect(document.getElementById('side-panel')).not.toHaveClass(
        'translate-x-full'
      );

      // Close modal via Escape, then fire window blur -> panel now retracts
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(document.body).not.toHaveAttribute('data-sideflow-modal-open');

      act(() => {
        blurCallback?.();
      });
      expect(setPanelVisibilityMock).toHaveBeenCalledWith(false);
    });
  });

  describe('2. FloatingPortal Viewport Clamping & Escape Focus Restoration', () => {
    it('clamps horizontal coordinates inside a 320px viewport and auto-flips vertically when overflowing bottom', () => {
      const clampedRight = clampFloatingCoordinates({
        anchorRect: { left: 290, top: 48, width: 24, height: 24 },
        floatingWidth: 288,
        floatingHeight: 180,
        viewportWidth: 320,
        viewportHeight: 640,
        placement: 'bottom-start',
        offsetPx: 6,
        paddingPx: 8,
      });
      expect(clampedRight.maxWidth).toBe(304);
      expect(clampedRight.left).toBeGreaterThanOrEqual(8);
      expect(clampedRight.left + 288).toBeLessThanOrEqual(312);

      const flippedTop = clampFloatingCoordinates({
        anchorRect: { left: 20, top: 580, width: 40, height: 28 },
        floatingWidth: 220,
        floatingHeight: 160,
        viewportWidth: 320,
        viewportHeight: 640,
        placement: 'bottom-start',
        offsetPx: 6,
        paddingPx: 8,
      });
      // Flips above anchor (580 - 160 - 6 = 414) instead of overflowing 640
      expect(flippedTop.top).toBe(414);
    });

    it('renders into document.body with data-sideflow-portal="true" and restores focus to returnFocusRef on Escape', () => {
      const Harness: React.FC = () => {
        const [open, setOpen] = useState(false);
        const btnRef = useRef<HTMLButtonElement | null>(null);
        return (
          <div>
            <button
              ref={btnRef}
              type="button"
              onClick={() => setOpen(true)}
            >
              Open Popover
            </button>
            <FloatingPortal
              isOpen={open}
              anchorRef={btnRef}
              returnFocusRef={btnRef}
              dataTestId="test-floating-portal"
              onClose={() => setOpen(false)}
            >
              <button type="button">Inside Portal Action</button>
            </FloatingPortal>
          </div>
        );
      };

      render(<Harness />);
      const trigger = screen.getByRole('button', { name: 'Open Popover' });
      trigger.focus();
      fireEvent.click(trigger);

      const portalEl = screen.getByTestId('test-floating-portal');
      expect(portalEl).toHaveAttribute('data-sideflow-portal', 'true');
      expect(portalEl.parentElement).toBe(document.body);

      const insideBtn = screen.getByRole('button', {
        name: 'Inside Portal Action',
      });
      insideBtn.focus();
      expect(document.activeElement).toBe(insideBtn);

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(
        screen.queryByTestId('test-floating-portal')
      ).not.toBeInTheDocument();
      expect(document.activeElement).toBe(trigger);
    });
  });

  describe('3. Narrow-Panel FlowCanvas Responsive "Tools" Toggle', () => {
    it('collapses #flow-primitives-bar behind the Tools toggle at panelWidthPercent={22} while keeping it expanded at panelWidthPercent={40}', () => {
      const { rerender } = render(
        <FlowCanvas
          flowData={defaultFlowData}
          onChangeFlowData={vi.fn()}
          onNotify={vi.fn()}
          panelWidthPercent={22}
        />
      );

      const toolsToggle = screen.getByTestId('toggle-compact-flow-tools-btn');
      const primitivesBar = document.getElementById('flow-primitives-bar')!;
      expect(toolsToggle).toHaveAttribute('aria-expanded', 'false');
      expect(primitivesBar).toHaveAttribute('hidden');

      fireEvent.click(toolsToggle);
      expect(toolsToggle).toHaveAttribute('aria-expanded', 'true');
      expect(primitivesBar).not.toHaveAttribute('hidden');

      rerender(
        <FlowCanvas
          flowData={defaultFlowData}
          onChangeFlowData={vi.fn()}
          onNotify={vi.fn()}
          panelWidthPercent={40}
        />
      );
      expect(
        screen.queryByTestId('toggle-compact-flow-tools-btn')
      ).not.toBeInTheDocument();
      expect(
        document.getElementById('flow-primitives-bar')
      ).not.toHaveAttribute('hidden');
    });
  });

  describe('4. 3-Slot Undo-Pinning Toast Queue & Backup Import Undo', () => {
    it('keeps a recoverable Undo toast mounted even when 3 subsequent status toasts fire, and restores state on Undo', async () => {
      render(<App />);

      // Switch to Notes tab, create a 2nd note ("Critical Draft"), then delete it to emit an Undo toast
      fireEvent.click(screen.getByRole('tab', { name: /^Notes$/i }));
      fireEvent.click(screen.getByRole('button', { name: /New Note/i }));
      const titleInput = screen.getByLabelText(/Note Title/i);
      fireEvent.change(titleInput, { target: { value: 'Critical Draft' } });

      fireEvent.click(
        screen.getByRole('button', { name: /^Delete Note$/i })
      );
      expect(screen.getByTestId('toast-undo-btn')).toBeInTheDocument();

      // Fire 3 non-Undo notifications ("Copied Markdown", etc.) in rapid succession
      fireEvent.click(screen.getByRole('button', { name: /^Copy Note$/i }));
      fireEvent.click(screen.getByRole('tab', { name: /^Dock$/i }));
      fireEvent.click(
        screen.getByRole('button', { name: /Lock icon dragging/i })
      );
      fireEvent.click(
        screen.getByRole('button', { name: /Lock icon dragging/i })
      );

      // The Undo button for "Critical Draft" MUST remain pinned and clickable!
      const undoBtn = screen.getByTestId('toast-undo-btn');
      expect(undoBtn).toBeInTheDocument();
      fireEvent.click(undoBtn);

      // Switch back to Notes and verify "Critical Draft" was restored!
      fireEvent.click(screen.getByRole('tab', { name: /^Notes$/i }));
      expect(
        screen.getByRole('button', { name: /Critical Draft/i })
      ).toBeInTheDocument();
    });

    it('creates a full pre-import snapshot on Import Config JSON and restores drawers + notes on Undo', async () => {
      render(<App />);

      // Verify pre-import default drawer exists
      expect(screen.getByTestId('drawer-card-drawer-dev')).toBeInTheDocument();

      fireEvent.click(document.getElementById('tab-btn-settings')!);
      const importInput = (await screen.findByTestId(
        'import-backup-input'
      )) as HTMLInputElement;

      const importedPayload = {
        version: '1.9.1',
        drawers: [
          {
            id: 'imported-drawer-99',
            title: 'Imported Ops Suite',
            collapsed: false,
            apps: [
              {
                id: 'imp-app-1',
                name: 'Grafana Live',
                cmd: 'https://grafana.example.com',
                icon: 'globe',
                color: 'emerald',
              },
            ],
          },
        ],
        notes: [
          {
            id: 'imported-note-99',
            title: 'Imported Incident Playbook',
            body: '# Runbook',
            updatedAt: Date.now(),
            color: 'rose',
          },
        ],
      };

      const jsonText = JSON.stringify(importedPayload);
      const mockFile = {
        name: 'backup.json',
        type: 'application/json',
        text: vi.fn().mockResolvedValue(jsonText),
      } as unknown as File;

      await act(async () => {
        fireEvent.change(importInput, { target: { files: [mockFile] } });
      });

      await waitFor(() => {
        expect(screen.getByTestId('toast-undo-btn')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('tab', { name: /^Dock$/i }));
      expect(
        screen.getByTestId('drawer-card-imported-drawer-99')
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId('drawer-card-drawer-dev')
      ).not.toBeInTheDocument();

      // Click Undo on the Workspace Backup Imported toast -> restores pre-import Development & Code drawer!
      fireEvent.click(screen.getByTestId('toast-undo-btn'));
      expect(screen.getByTestId('drawer-card-drawer-dev')).toBeInTheDocument();
      expect(
        screen.queryByTestId('drawer-card-imported-drawer-99')
      ).not.toBeInTheDocument();
    });
  });

  describe('5. Non-Destructive DockView Folder Sync with Prune Undo', () => {
    it('preserves custom name, hotkey, favorite, and customIconUrl on matching cmd paths during Sync Folder and offers Undo when files are pruned', async () => {
      const readDirMock = vi.fn().mockResolvedValue([
        {
          name: 'code.exe',
          path: 'C:\\Tools\\code.exe',
          isDirectory: false,
        },
        {
          name: 'new-cli.exe',
          path: 'C:\\Tools\\new-cli.exe',
          isDirectory: false,
        },
      ]);

      window.sideflow = {
        isElectron: true,
        readDirectoryItems: readDirMock,
        extractFileIcon: vi.fn().mockResolvedValue(null),
      } as unknown as typeof window.sideflow;

      const customDrawers: AppDrawer[] = [
        {
          id: 'drawer-folder-1',
          title: 'Local Tools',
          collapsed: false,
          folderPath: 'C:\\Tools',
          apps: [
            {
              id: 'app-custom-code',
              name: 'My Custom VS Code',
              cmd: 'C:\\Tools\\code.exe',
              icon: 'terminal',
              color: 'emerald',
              customIconUrl: 'data:image/png;base64,CUSTOMICON',
              hotkey: 'Ctrl + Alt + V',
              favorite: true,
            },
            {
              id: 'app-removed-tool',
              name: 'Old Retired Utility',
              cmd: 'C:\\Tools\\retired.exe',
              icon: 'cpu',
              color: 'rose',
            },
          ],
        },
      ];
      window.localStorage.setItem(
        'sideflow_drawers',
        JSON.stringify(customDrawers)
      );

      render(<App />);

      const syncBtn = screen.getByRole('button', {
        name: /Sync folder for Local Tools/i,
      });
      await act(async () => {
        fireEvent.click(syncBtn);
      });

      await waitFor(() => {
        expect(readDirMock).toHaveBeenCalledWith('C:\\Tools');
        expect(screen.getByText(/new[- ]cli/i)).toBeInTheDocument();
      });

      // Custom name, favorite (rendered in both Favorites shelf and drawer), and hotkey were preserved on C:\Tools\code.exe!
      expect(
        screen.getAllByText('My Custom VS Code').length
      ).toBeGreaterThanOrEqual(1);
      const storedAfterSync = JSON.parse(
        window.localStorage.getItem('sideflow_drawers') || '[]'
      ) as AppDrawer[];
      const syncedCodeApp = storedAfterSync[0].apps.find(
        (a) => a.cmd === 'C:\\Tools\\code.exe'
      );
      expect(syncedCodeApp).toMatchObject({
        id: 'app-custom-code',
        name: 'My Custom VS Code',
        hotkey: 'Ctrl + Alt + V',
        favorite: true,
        customIconUrl: 'data:image/png;base64,CUSTOMICON',
      });

      // Pruned item ("Old Retired Utility") triggered an Undo toast that restores it!
      expect(
        screen.queryByText('Old Retired Utility')
      ).not.toBeInTheDocument();
      fireEvent.click(screen.getByTestId('toast-undo-btn'));
      expect(screen.getByText('Old Retired Utility')).toBeInTheDocument();
    });
  });

  describe('6. WCAG 2.2 AA Roving tabIndex on FlowCanvas & Modal Hidden-Ancestor Exclusion', () => {
    it('renders exactly 1 canvas node with tabIndex=0 and cycles focus + tabIndex=0 via Alt+ArrowRight / Alt+ArrowLeft', () => {
      render(
        <FlowCanvas
          flowData={defaultFlowData}
          onChangeFlowData={vi.fn()}
          onNotify={vi.fn()}
        />
      );

      const n1 = screen.getByTestId('flow-node-n1');
      const n2 = screen.getByTestId('flow-node-n2');
      const n3 = screen.getByTestId('flow-node-n3');

      expect(n1).toHaveAttribute('tabindex', '0');
      expect(n2).toHaveAttribute('tabindex', '-1');
      expect(n3).toHaveAttribute('tabindex', '-1');

      n1.focus();
      fireEvent.keyDown(n1, { key: 'ArrowRight', altKey: true });

      expect(document.activeElement).toBe(n2);
      expect(n2).toHaveAttribute('tabindex', '0');
      expect(n1).toHaveAttribute('tabindex', '-1');

      fireEvent.keyDown(n2, { key: 'ArrowLeft', altKey: true });
      expect(document.activeElement).toBe(n1);
      expect(n1).toHaveAttribute('tabindex', '0');
    });

    it('skips controls inside [hidden] and .hidden containers when Modal wraps Tab focus', () => {
      render(
        <Modal isOpen={true} onClose={vi.fn()} ariaLabel="Hidden Ancestor Test">
          <div>
            <button type="button">First Visible</button>
            <div hidden>
              <button type="button">Hidden Native</button>
            </div>
            <div className="hidden">
              <button type="button">Hidden Class</button>
            </div>
            <button type="button">Last Visible</button>
          </div>
        </Modal>
      );

      const firstBtn = screen.getByRole('button', { name: 'First Visible' });
      const lastBtn = screen.getByRole('button', { name: 'Last Visible' });

      lastBtn.focus();
      fireEvent.keyDown(lastBtn, { key: 'Tab', shiftKey: false });
      expect(document.activeElement).toBe(firstBtn);

      fireEvent.keyDown(firstBtn, { key: 'Tab', shiftKey: true });
      expect(document.activeElement).toBe(lastBtn);
    });
  });

  describe('7. Lossless Standalone SVG Export, @sideflow-layout Round-Trip & Quoted Arrow Parsing', () => {
    it('exports custom waypoints, negative-quadrant viewBox, and excludes collapsed subgraph child nodes in generateStandaloneSVG', () => {
      const flow: FlowchartState = {
        direction: 'LR',
        nodes: [
          { id: 'neg', type: 'start', text: 'Neg Origin', x: -120, y: -80 },
          { id: 'dest', type: 'process', text: 'Target Step', x: 220, y: 60 },
          {
            id: 'secret_child',
            type: 'process',
            text: 'Collapsed Internal Step',
            x: 240,
            y: 220,
          },
        ],
        edges: [
          {
            from: 'neg',
            to: 'dest',
            curve: 'orthogonal',
            waypoint: { x: 55, y: -40 },
          },
          { from: 'dest', to: 'secret_child' },
        ],
        subgraphs: [
          {
            id: 'sg_collapsed',
            title: 'Collapsed Pool',
            nodeIds: ['secret_child'],
            collapsed: true,
          },
        ],
      };

      const svg = generateStandaloneSVG(flow);
      // Negative viewBox origin includes (-120, -80) with 36px margin -> -156 -116
      expect(svg).toContain('viewBox="-156 -116 ');
      // Waypoint coordinate x=55 is routed through in the SVG path
      expect(svg).toContain('L 55 ');
      // Collapsed subgraph child node is omitted while collapsed header remains visible
      expect(svg).not.toContain('Collapsed Internal Step');
      expect(svg).toContain('Collapsed Pool (1 collapsed)');

      // Round-trip via %% @sideflow-layout comment
      const mermaidCode = generateMermaidCode(flow);
      expect(hasSideflowLayoutMetadata(mermaidCode)).toBe(true);
      const reparsed = parseMermaidCode(mermaidCode);
      expect(reparsed).not.toBeNull();
      expect(reparsed!.nodes.find((n) => n.id === 'neg')).toMatchObject({
        x: -120,
        y: -80,
      });
      expect(reparsed!.edges[0].waypoint).toEqual({ x: 55, y: -40 });
      expect(reparsed!.subgraphs?.[0].collapsed).toBe(true);

      // renderCachedMermaidPreview preserves @sideflow-layout coordinates instead of overwriting with DAG auto-layout
      const preview = renderCachedMermaidPreview(mermaidCode);
      expect(preview.laidOut?.nodes.find((n) => n.id === 'neg')).toMatchObject({
        x: -120,
        y: -80,
      });

      // Extreme @sideflow-layout coordinates are clamped to [-50000, 50000]
      const extremeParsed = parseMermaidCode(
        'flowchart LR\n  A["Start"] --> B["End"]\n%% @sideflow-layout {"n":{"A":[99999999,-99999999]}}'
      );
      expect(extremeParsed?.nodes.find((n) => n.id === 'A')).toMatchObject({
        x: 50000,
        y: -50000,
      });
    });

    it('portals uml-edge-toolbar to document.body and preserves edge.waypoint when committing an edge label edit', () => {
      const onChangeFlowData = vi.fn();
      const flowWithWaypoint: FlowchartState = {
        direction: 'LR',
        nodes: [
          { id: 'n1', type: 'start', text: 'Origin', x: -80, y: -40 },
          { id: 'n2', type: 'process', text: 'Target', x: 180, y: 40 },
        ],
        edges: [
          {
            from: 'n1',
            to: 'n2',
            curve: 'orthogonal',
            waypoint: { x: 64, y: -24 },
          },
        ],
      };

      render(
        <FlowCanvas
          flowData={flowWithWaypoint}
          onChangeFlowData={onChangeFlowData}
          onNotify={vi.fn()}
          panelWidthPercent={22}
        />
      );

      fireEvent.click(screen.getByTestId('edge-label-pill-0'));
      const edgeToolbar = screen.getByTestId('uml-edge-toolbar');
      expect(
        edgeToolbar.closest('[data-sideflow-portal="true"]')?.parentElement
      ).toBe(document.body);

      const labelInput = screen.getByLabelText('Edit connector label');
      fireEvent.change(labelInput, { target: { value: 'Approved' } });
      fireEvent.keyDown(labelInput, { key: 'Enter' });

      expect(onChangeFlowData).toHaveBeenCalled();
      const latestArg = onChangeFlowData.mock.calls.at(-1)?.[0];
      const nextState =
        typeof latestArg === 'function'
          ? latestArg(flowWithWaypoint)
          : latestArg;
      expect(nextState.edges[0]).toMatchObject({
        label: 'Approved',
        waypoint: { x: 64, y: -24 },
      });
    });

    it('parses Mermaid edges whose double-quoted labels contain arrow operators (-->) and ampersands (&)', () => {
      const snippet = [
        'flowchart LR',
        '  A["Step 1 --> Step 2"] --> B["Sync & Verify"]',
      ].join('\n');

      const parsed = parseMermaidCode(snippet);
      expect(parsed).not.toBeNull();
      expect(parsed!.nodes).toHaveLength(2);
      expect(parsed!.nodes[0]).toMatchObject({
        id: 'A',
        text: 'Step 1 --> Step 2',
      });
      expect(parsed!.nodes[1]).toMatchObject({
        id: 'B',
        text: 'Sync & Verify',
      });
      expect(parsed!.edges).toEqual([{ from: 'A', to: 'B' }]);
    });
  });

  describe('8. Jira ADF <-> Markdown Escaping, Fence Safety & Strict-Offline /image', () => {
    it('escapes HTML in <summary>/<u>, sizes code fences above embedded triple backticks, round-trips UNDECIDED decisions & mention IDs, and blocks unsafe inlineCard URLs', () => {
      const doc: AdfDocNode = {
        version: 1,
        type: 'doc',
        content: [
          {
            type: 'expand',
            attrs: { title: 'Click <script>alert(1)</script> & Details' },
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: 'a < b',
                    marks: [{ type: 'underline' }],
                  },
                  { type: 'text', text: ' ping ' },
                  {
                    type: 'mention',
                    attrs: { id: 'acct-99', text: '@Jordan' },
                  },
                ],
              },
            ],
          },
          {
            type: 'decisionList',
            attrs: { localId: 'dl-1' },
            content: [
              {
                type: 'decisionItem',
                attrs: { localId: 'di-1', state: 'UNDECIDED' },
                content: [{ type: 'text', text: 'Pending RFC review' }],
              },
            ],
          },
          {
            type: 'codeBlock',
            attrs: { language: 'markdown' },
            content: [
              {
                type: 'text',
                text: 'Example:\n```ts\nconst x = 1;\n```',
              },
            ],
          },
        ],
      };

      const md = adfToMarkdown(doc);
      expect(md).toContain(
        '<summary>Click &lt;script&gt;alert(1)&lt;/script&gt; &amp; Details</summary>'
      );
      expect(md).toContain('<u>a &lt; b</u>');
      expect(md).toContain('@[Jordan](acct-99)');
      expect(md).toContain('<> [?] Pending RFC review');
      expect(md).toContain('````markdown');

      const roundTripped = markdownToAdf(md);
      const expandBlock = roundTripped.content[0];
      expect(expandBlock.type).toBe('expand');
      if (expandBlock.type === 'expand') {
        expect(expandBlock.attrs.title).toBe(
          'Click <script>alert(1)</script> & Details'
        );
      }

      const decisionBlock = roundTripped.content[1];
      expect(decisionBlock.type).toBe('decisionList');
      if (decisionBlock.type === 'decisionList') {
        expect(decisionBlock.content[0].attrs.state).toBe('UNDECIDED');
      }

      const codeBlock = roundTripped.content[2];
      expect(codeBlock.type).toBe('codeBlock');
      if (codeBlock.type === 'codeBlock') {
        expect(codeBlock.content?.[0]?.text).toContain('```ts\nconst x = 1;\n```');
      }

      // Verify unsafe javascript: inlineCard URLs are neutralized into inert plain text (no card pill, data-card-url, or href)
      const unsafeCardHtml = adfInlineToEditorHtml([
        {
          type: 'inlineCard',
          attrs: { url: 'javascript:alert(1)' },
        },
      ]);
      expect(unsafeCardHtml).not.toContain('adf-inline-card');
      expect(unsafeCardHtml).not.toContain('data-card-url');
      expect(unsafeCardHtml).not.toContain('href=');

      // Verify SVG base64, malformed percent-encoding, character entities, foreignObject, and language fence-breakouts are blocked
      expect(
        isSafeAdfMediaUrl('data:image/svg+xml;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==')
      ).toBe(false);
      expect(
        isSafeAdfMediaUrl('data:image/svg+xml,%GG%3Cscript%3Ealert(1)%3C/script%3E')
      ).toBe(false);
      expect(
        isSafeAdfMediaUrl('data:image/svg+xml;charset=utf-8,%3Csvg%3E%3CforeignObject%3E%3C/foreignObject%3E%3C/svg%3E')
      ).toBe(false);
      expect(
        isSafeAdfMediaUrl('data:image/svg+xml;charset=utf-8,%3Csvg%3E&#x3c;script&#x3e;%3C/svg%3E')
      ).toBe(false);
      expect(
        isSafeAdfMediaUrl('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%2210%22%20height%3D%2210%22%2F%3E%3C%2Fsvg%3E')
      ).toBe(true);

      const injectedLangCheck = validateAndNormalizeAdfDoc({
        version: 1,
        type: 'doc',
        content: [
          {
            type: 'codeBlock',
            attrs: { language: 'js\n```\n![pwn](https://evil.example)' },
            content: [{ type: 'text', text: 'const ok = true;' }],
          },
        ],
      });
      expect(injectedLangCheck.valid).toBe(true);
      if (injectedLangCheck.valid) {
        const safeMd = adfToMarkdown(injectedLangCheck.doc);
        expect(safeMd).not.toContain('evil.example');
      }
    });

    it('inserts an offline data:image/svg+xml placeholder when triggering /image in JiraAdfEditor', async () => {
      render(<App />);
      fireEvent.click(screen.getByRole('tab', { name: /^Notes$/i }));
      fireEvent.click(screen.getByTestId('format-mode-adf'));

      const insertBtn = await screen.findByTestId('jira-insert-menu-btn');
      fireEvent.click(insertBtn);

      const imageItem = await screen.findByTestId('jira-insert-item-image');
      fireEvent.click(imageItem);

      const img = await screen.findByAltText(
        'Architecture Diagram Placeholder'
      );
      expect(img.getAttribute('src')).toMatch(
        /^data:image\/svg\+xml;charset=utf-8,/
      );
      expect(img.getAttribute('src')).not.toContain('unsplash.com');
    });
  });

  describe('9. Phase 0 Quick Wins: Jira ADF List -> Flow, OS Per-App Hotkeys & Custom Dictionary Whisper Biasing', () => {
    it('exposes List -> Flow in Jira ADF mode and converts ADF bullet/task items into a Flowchart', async () => {
      const adfNoteDoc: AdfDocNode = {
        version: 1,
        type: 'doc',
        content: [
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Receive Webhook' }],
                  },
                ],
              },
              {
                type: 'listItem',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Validate HMAC?' }],
                  },
                ],
              },
              {
                type: 'listItem',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Enqueue Job' }],
                  },
                ],
              },
            ],
          },
        ],
      };

      window.localStorage.setItem(
        'sideflow_notes',
        JSON.stringify([
          {
            id: 'note-adf-flow',
            title: 'Webhook Pipeline',
            body: '',
            format: 'adf',
            adfDoc: adfNoteDoc,
            updatedAt: Date.now(),
            color: 'indigo',
          },
        ])
      );
      window.localStorage.setItem(
        'sideflow_active_note_id',
        JSON.stringify('note-adf-flow')
      );

      render(<App />);
      fireEvent.click(screen.getByRole('tab', { name: /^Notes$/i }));

      const listToFlowBtn = await screen.findByTestId(
        'convert-note-to-flow-btn'
      );
      fireEvent.click(listToFlowBtn);

      // Automatically switches to Flow tab with the 3 converted steps!
      expect(await screen.findByText('Receive Webhook')).toBeInTheDocument();
      expect(screen.getByText('Validate HMAC?')).toBeInTheDocument();
      expect(screen.getByText('Enqueue Job')).toBeInTheDocument();
    });

    it('syncs per-app global hotkeys via window.sideflow.setAppHotkeys and biases local Whisper promptContext with customDictionary terms', async () => {
      const setAppHotkeysMock = vi.fn();
      const transcribeAudioLocalMock = vi.fn().mockResolvedValue({
        success: true,
        text: 'SideFlow deployed via CTranslate2.',
        engineUsed: 'faster-whisper CUDA',
        durationMs: 18,
      });

      const primaryTrack = { kind: 'audio', stop: vi.fn(), onended: null };
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        writable: true,
        value: {
          getUserMedia: vi.fn().mockResolvedValue({
            getTracks: () => [primaryTrack],
            getAudioTracks: () => [primaryTrack],
            getVideoTracks: () => [],
          }),
          enumerateDevices: vi.fn().mockResolvedValue([
            { kind: 'audioinput', deviceId: 'default', label: 'Studio Mic' },
          ]),
        },
      });

      let audioProcessor: {
        onaudioprocess: ((ev: AudioProcessingEvent) => void) | null;
      } | null = null;

      class MockAudioContext {
        sampleRate = 16000;
        state = 'running';
        destination = {};
        audioWorklet = undefined;
        createMediaStreamSource() {
          return { connect: vi.fn(), disconnect: vi.fn() };
        }
        createGain() {
          return {
            gain: { value: 0 },
            connect: vi.fn(),
            disconnect: vi.fn(),
          };
        }
        createScriptProcessor() {
          audioProcessor = {
            onaudioprocess: null,
            connect: vi.fn(),
            disconnect: vi.fn(),
          } as unknown as {
            onaudioprocess: ((ev: AudioProcessingEvent) => void) | null;
          };
          return audioProcessor;
        }
        resume = vi.fn().mockResolvedValue(undefined);
        close = vi.fn().mockResolvedValue(undefined);
      }

      Object.defineProperty(window, 'AudioContext', {
        configurable: true,
        writable: true,
        value: MockAudioContext,
      });

      window.localStorage.setItem(
        'sideflow_drawers',
        JSON.stringify([
          {
            id: 'd1',
            title: 'Dev',
            collapsed: false,
            apps: [
              {
                id: 'app-hk-1',
                name: 'Terminal Pro',
                cmd: 'wt.exe',
                icon: 'terminal',
                color: 'indigo',
                hotkey: 'Ctrl + Alt + T',
              },
            ],
          },
        ])
      );
      window.localStorage.setItem(
        'sideflow_custom_dictionary',
        JSON.stringify(['SideFlow', 'CTranslate2', 'Moonshine'])
      );

      window.sideflow = {
        isElectron: true,
        setAppHotkeys: setAppHotkeysMock,
        getLocalSttStatus: vi.fn().mockResolvedValue({
          available: true,
          fasterWhisperAvailable: true,
          cudaAvailable: true,
          windowsSapiAvailable: true,
        }),
        warmupLocalStt: vi.fn().mockResolvedValue({
          success: true,
          engineUsed: 'faster-whisper CUDA',
          durationMs: 5,
        }),
        transcribeAudioLocal: transcribeAudioLocalMock,
      } as unknown as typeof window.sideflow;

      let nowMs = 10000;
      vi.spyOn(performance, 'now').mockImplementation(() => nowMs);

      render(<App />);

      expect(setAppHotkeysMock).toHaveBeenCalledWith([
        expect.objectContaining({
          id: 'app-hk-1',
          name: 'Terminal Pro',
          cmd: 'wt.exe',
          hotkey: 'Ctrl + Alt + T',
        }),
      ]);

      // Switch to Notes and speak an utterance to verify customDictionary biases Whisper promptContext
      fireEvent.click(screen.getByRole('tab', { name: /^Notes$/i }));

      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: /Start voice dictation/i })
        );
      });

      await waitFor(() => {
        expect(audioProcessor?.onaudioprocess).toBeTypeOf('function');
      });

      const emitSamples = (amp: number, deltaMs: number) => {
        nowMs += deltaMs;
        const buf = new Float32Array(1024);
        for (let i = 0; i < buf.length; i++) {
          buf[i] = i % 2 === 0 ? amp : -amp;
        }
        audioProcessor?.onaudioprocess?.({
          inputBuffer: { getChannelData: () => buf },
        } as unknown as AudioProcessingEvent);
      };

      await act(async () => {
        emitSamples(0.15, 64);
        emitSamples(0.15, 64);
        emitSamples(0, 500);
        await Promise.resolve();
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(transcribeAudioLocalMock).toHaveBeenCalled();
      });

      expect(transcribeAudioLocalMock).toHaveBeenCalledWith(
        expect.objectContaining({
          promptContext: expect.stringContaining(
            'Vocabulary: SideFlow, CTranslate2, Moonshine.'
          ),
        })
      );
    });
  });
});
