import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import {
  extractFilenameFromPath,
  inferAppMetaFromFilename,
  resolveDroppedFilePath,
  fetchNativeFileIcon,
  generateShortcutIconDataUrl,
  resolveShortcutMetadata,
  parseDroppedShortcutItems,
  sortDrawerApps,
  buildFolderDrawerApps,
  isAppProcessRunning,
  formatQuickHotkeyBadge,
  executeAppCommand,
} from '../utils/fileMeta';
import {
  computeDagLayout,
  computeEdgeGeometry,
  computeSubgraphBounds,
  formatMermaidEdgeOperator,
  formatSequenceMessageOperator,
  generateMermaidCode,
  getMermaidTemplatePreset,
  parseMermaidCode,
  generateStandaloneSVG,
} from '../utils/mermaid';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { FlowchartState } from '../types/sideflow';
import {
  computeRmsLevel,
  normalizeAudioFloat32,
  trimSilenceFloat32,
  mergeFloat32Chunks,
  resampleTo16kHz,
  float32ToPcm16Base64,
  transcribeAudioChunkHybrid,
} from '../utils/localSttEngine';
import {
  clampPanelWidthPercent,
  DEFAULT_PANEL_WIDTH_PERCENT,
  MIN_PANEL_WIDTH_PERCENT,
  MAX_PANEL_WIDTH_PERCENT,
} from '../utils/defaults';

describe('fileMeta utilities', () => {
  afterEach(() => {
    delete window.sideflow;
    vi.restoreAllMocks();
  });

  describe('extractFilenameFromPath', () => {
    it('extracts filename from Windows paths with backslashes', () => {
      expect(
        extractFilenameFromPath('C:\\Program Files\\Docker\\Docker Desktop.exe')
      ).toBe('Docker Desktop.exe');
    });

    it('extracts filename from POSIX paths with forward slashes', () => {
      expect(extractFilenameFromPath('/Applications/Spotify.app')).toBe(
        'Spotify.app'
      );
    });

    it('returns plain filename when no path separators exist', () => {
      expect(extractFilenameFromPath('obsidian.exe')).toBe('obsidian.exe');
    });
  });

  describe('inferAppMetaFromFilename', () => {
    it('infers cpu icon and indigo color for executables and shortcuts (.exe, .app, .lnk)', () => {
      expect(inferAppMetaFromFilename('C:\\Apps\\code.exe')).toEqual({
        name: 'Code',
        icon: 'cpu',
        color: 'indigo',
      });
      expect(inferAppMetaFromFilename('/Applications/Slack.app')).toEqual({
        name: 'Slack',
        icon: 'cpu',
        color: 'indigo',
      });
      expect(inferAppMetaFromFilename('Discord.lnk')).toEqual({
        name: 'Discord',
        icon: 'cpu',
        color: 'indigo',
      });
    });

    it('infers terminal icon and emerald color for scripts and code files (.bat, .cmd, .sh, .ps1, .py, .js, .ts)', () => {
      expect(inferAppMetaFromFilename('deploy_prod.sh')).toEqual({
        name: 'Deploy_prod',
        icon: 'terminal',
        color: 'emerald',
      });
      expect(inferAppMetaFromFilename('C:\\scripts\\start.ps1')).toEqual({
        name: 'Start',
        icon: 'terminal',
        color: 'emerald',
      });
      expect(inferAppMetaFromFilename('build.py')).toEqual({
        name: 'Build',
        icon: 'terminal',
        color: 'emerald',
      });
    });

    it('infers globe icon and cyan color for web shortcuts and HTML files (.url, .html, .htm)', () => {
      expect(inferAppMetaFromFilename('dashboard.url')).toEqual({
        name: 'Dashboard',
        icon: 'globe',
        color: 'cyan',
      });
      expect(inferAppMetaFromFilename('index.html')).toEqual({
        name: 'Index',
        icon: 'globe',
        color: 'cyan',
      });
    });

    it('infers music icon and rose color for media files (.mp3, .wav, .flac, .mp4, .mkv)', () => {
      expect(inferAppMetaFromFilename('podcast.mp3')).toEqual({
        name: 'Podcast',
        icon: 'music',
        color: 'rose',
      });
      expect(inferAppMetaFromFilename('demo.mp4')).toEqual({
        name: 'Demo',
        icon: 'music',
        color: 'rose',
      });
    });

    it('infers figma icon and amber color for design & image files (.fig, .psd, .ai, .png, .svg, .jpg, .jpeg)', () => {
      expect(inferAppMetaFromFilename('system-architecture.fig')).toEqual({
        name: 'System-architecture',
        icon: 'figma',
        color: 'amber',
      });
      expect(inferAppMetaFromFilename('logo.svg')).toEqual({
        name: 'Logo',
        icon: 'figma',
        color: 'amber',
      });
    });

    it('infers file-text icon and purple color for documents and unknown extensions', () => {
      expect(inferAppMetaFromFilename('spec.pdf')).toEqual({
        name: 'Spec',
        icon: 'file-text',
        color: 'purple',
      });
      expect(inferAppMetaFromFilename('notes.txt')).toEqual({
        name: 'Notes.txt',
        icon: 'file-text',
        color: 'purple',
      });
    });
  });

  describe('resolveDroppedFilePath', () => {
    it('uses window.sideflow.getPathForFile when available in Electron', () => {
      const mockGetPath = vi
        .fn()
        .mockReturnValue('D:\\Tools\\Postman\\Postman.exe');
      window.sideflow = {
        isElectron: true,
        getPathForFile: mockGetPath,
      } as unknown as typeof window.sideflow;

      const file = new File(['binary'], 'Postman.exe');
      expect(resolveDroppedFilePath(file)).toBe(
        'D:\\Tools\\Postman\\Postman.exe'
      );
      expect(mockGetPath).toHaveBeenCalledWith(file);
    });

    it('uses nativeFile.path property when available', () => {
      const file = new File(['binary'], 'Figma.exe') as File & { path?: string };
      Object.defineProperty(file, 'path', {
        value: 'C:\\Users\\Dev\\AppData\\Local\\Figma\\Figma.exe',
      });

      expect(resolveDroppedFilePath(file)).toBe(
        'C:\\Users\\Dev\\AppData\\Local\\Figma\\Figma.exe'
      );
    });

    it('falls back to synthesized desktop path in browser sandbox', () => {
      const file = new File(['binary'], ' Notion.exe '.trim());
      expect(resolveDroppedFilePath(file)).toBe(
        'C:\\Users\\Local\\Desktop\\Notion.exe'
      );
      expect(resolveDroppedFilePath(file, 'C:\\Program Files')).toBe(
        'C:\\Program Files\\Notion.exe'
      );
    });
  });

  describe('executeAppCommand', () => {
    it('delegates to window.sideflow.launchNativeApp and strips surrounding quotes', async () => {
      const launchMock = vi.fn().mockResolvedValue({ success: true });
      window.sideflow = {
        isElectron: true,
        launchNativeApp: launchMock,
      } as unknown as typeof window.sideflow;

      const res = await executeAppCommand(
        '  "C:\\Program Files\\App\\app.exe"  '
      );
      expect(launchMock).toHaveBeenCalledWith('C:\\Program Files\\App\\app.exe');
      expect(res).toEqual({ success: true });
    });

    it('opens http/https URLs in a new tab in browser mode', async () => {
      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
      const res = await executeAppCommand('https://lucid.app/documents');
      expect(openSpy).toHaveBeenCalledWith(
        'https://lucid.app/documents',
        '_blank',
        'noopener,noreferrer'
      );
      expect(res).toEqual({ success: true });
    });

    it('supports colon-only safe protocols (mailto:, app://) and blocks disallowed protocols', async () => {
      const mailRes = await executeAppCommand('mailto:dev@sideflow.app');
      expect(mailRes).toEqual({ success: true });

      const appRes = await executeAppCommand('app://launch');
      expect(appRes).toEqual({ success: true });

      const blockedRes = await executeAppCommand('ftp://files.example.com');
      expect(blockedRes.success).toBe(false);
      expect(blockedRes.error).toContain('Blocked disallowed URI protocol');
    });

    it('passes CLI argument array to window.sideflow.launchNativeApp for Open-With file drops', async () => {
      const launchMock = vi.fn().mockResolvedValue({ success: true });
      window.sideflow = {
        isElectron: true,
        launchNativeApp: launchMock,
      } as unknown as typeof window.sideflow;

      const res = await executeAppCommand('C:\\Apps\\code.exe', [
        'D:\\Projects\\README.md',
      ]);
      expect(launchMock).toHaveBeenCalledWith('C:\\Apps\\code.exe', [
        'D:\\Projects\\README.md',
      ]);
      expect(res).toEqual({ success: true });
    });
  });

  describe('ObjectDock folder & icon utilities', () => {
    it('fetches native OS file icon via window.sideflow.extractFileIcon when available', async () => {
      const extractMock = vi
        .fn()
        .mockResolvedValue('data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==');
      window.sideflow = {
        isElectron: true,
        extractFileIcon: extractMock,
      } as unknown as typeof window.sideflow;

      const iconUrl = await fetchNativeFileIcon('C:\\Tools\\app.exe');
      expect(extractMock).toHaveBeenCalledWith('C:\\Tools\\app.exe');
      expect(iconUrl).toBe('data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==');
    });

    it('sorts drawer apps by manual order, alphabetical name, or command/file type', () => {
      const apps = [
        {
          id: '1',
          name: 'Zed Editor',
          cmd: 'C:\\Apps\\zed.exe',
          icon: 'cpu',
          color: 'indigo' as const,
        },
        {
          id: '2',
          name: 'Arc Browser',
          cmd: 'https://arc.net',
          icon: 'globe',
          color: 'cyan' as const,
        },
        {
          id: '3',
          name: 'Build Script',
          cmd: 'C:\\Scripts\\build.ps1',
          icon: 'terminal',
          color: 'emerald' as const,
        },
      ];

      expect(sortDrawerApps(apps, 'manual').map((a) => a.id)).toEqual([
        '1',
        '2',
        '3',
      ]);
      expect(sortDrawerApps(apps, 'name').map((a) => a.name)).toEqual([
        'Arc Browser',
        'Build Script',
        'Zed Editor',
      ]);
      // Type sort: .exe ("exe"), .ps1 ("ps1"), https:// ("url")
      expect(sortDrawerApps(apps, 'type').map((a) => a.name)).toEqual([
        'Zed Editor',
        'Build Script',
        'Arc Browser',
      ]);
    });

    it('builds folder drawer apps from Electron readDirectoryItems or simulated fallback', async () => {
      // Browser fallback when window.sideflow is absent
      const fallbackApps = await buildFolderDrawerApps('C:\\Projects\\MyTools');
      expect(fallbackApps.length).toBe(4);
      expect(fallbackApps[0].cmd).toContain('C:\\Projects\\MyTools\\');

      // Electron bridge readDirectoryItems
      window.sideflow = {
        isElectron: true,
        readDirectoryItems: vi.fn().mockResolvedValue([
          {
            name: 'SubFolder',
            path: 'C:\\Projects\\SubFolder',
            isDirectory: true,
          },
          {
            name: 'launcher.exe',
            path: 'C:\\Projects\\launcher.exe',
            isDirectory: false,
            iconDataUrl: 'data:image/png;base64,AAA=',
          },
        ]),
      } as unknown as typeof window.sideflow;

      const electronApps = await buildFolderDrawerApps('C:\\Projects');
      expect(electronApps).toHaveLength(2);
      expect(electronApps[0]).toMatchObject({
        name: 'SubFolder',
        icon: 'folder',
      });
      expect(electronApps[1]).toMatchObject({
        name: 'Launcher',
        customIconUrl: 'data:image/png;base64,AAA=',
      });
    });

    it('detects running app processes via protocol mapping, executable filename, or session launch IDs and formats Alt+1..9 hotkey badges', () => {
      const vscodeApp = {
        id: 'app-1',
        name: 'VS Code',
        cmd: 'vscode://',
        icon: 'terminal',
        color: 'indigo' as const,
      };
      const dockerApp = {
        id: 'app-4',
        name: 'Docker Engine',
        cmd: 'C:\\Program Files\\Docker\\Docker Desktop.exe',
        icon: 'database',
        color: 'cyan' as const,
      };
      const figmaApp = {
        id: 'app-6',
        name: 'Figma Desktop',
        cmd: 'figma://',
        icon: 'figma',
        color: 'rose' as const,
      };

      expect(isAppProcessRunning(vscodeApp, ['code.exe'])).toBe(true);
      expect(isAppProcessRunning(dockerApp, ['docker desktop.exe'])).toBe(true);
      expect(isAppProcessRunning(figmaApp, ['code.exe'])).toBe(false);
      expect(isAppProcessRunning(figmaApp, [], ['app-6'])).toBe(true);

      expect(formatQuickHotkeyBadge(0)).toBe('Alt+1');
      expect(formatQuickHotkeyBadge(8)).toBe('Alt+9');
      expect(formatQuickHotkeyBadge(9)).toBeUndefined();
      expect(formatQuickHotkeyBadge(0, 'Ctrl+Shift+V')).toBe('Ctrl+Shift+V');
    });

    it('parses Taskbar and Start Menu dragged shortcuts (.lnk, .appref-ms, file:// URI, bare names) and populates shortcut/application icon images', async () => {
      // 1. Verify SVG shortcut icon badge generator produces valid data:image/svg+xml URI
      const badgeUrl = generateShortcutIconDataUrl('Visual Studio Code', 'indigo');
      expect(badgeUrl).toMatch(/^data:image\/svg\+xml;utf8,/);
      expect(decodeURIComponent(badgeUrl)).toContain('VS');

      // 2. Verify parseDroppedShortcutItems with a Start Menu file:// .lnk URI
      const startMenuDrop = parseDroppedShortcutItems({
        files: [] as unknown as FileList,
        getData: (type: string) =>
          type === 'text/uri-list'
            ? 'file:///C:/ProgramData/Microsoft/Windows/Start%20Menu/Programs/Google%20Chrome.lnk'
            : '',
      } as unknown as DataTransfer);
      expect(startMenuDrop).toHaveLength(1);
      expect(startMenuDrop[0]).toMatchObject({
        name: 'Google Chrome',
        cmd: 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\Google Chrome.lnk',
        icon: 'cpu',
        color: 'indigo',
      });
      expect(startMenuDrop[0].customIconUrl).toMatch(/^data:image\/svg\+xml/);

      // 3. Verify parseDroppedShortcutItems with a Taskbar Pinned .lnk file
      const taskbarFile = new File(['lnk'], 'Spotify.lnk');
      Object.defineProperty(taskbarFile, 'path', {
        value:
          'C:\\Users\\Dev\\AppData\\Roaming\\Microsoft\\Internet Explorer\\Quick Launch\\User Pinned\\TaskBar\\Spotify.lnk',
      });
      const taskbarDrop = parseDroppedShortcutItems({
        files: [taskbarFile] as unknown as FileList,
        getData: () => '',
      } as unknown as DataTransfer);
      expect(taskbarDrop).toHaveLength(1);
      expect(taskbarDrop[0].name).toBe('Spotify');
      expect(taskbarDrop[0].cmd).toContain('User Pinned\\TaskBar\\Spotify.lnk');
      expect(taskbarDrop[0].customIconUrl).toMatch(/^data:image\/svg\+xml/);

      // 4. Verify resolveShortcutMetadata uses Electron resolveShortcutItem when available
      window.sideflow = {
        isElectron: true,
        resolveShortcutItem: vi.fn().mockResolvedValue({
          name: 'Visual Studio Code',
          cmd: 'C:\\Program Files\\Microsoft VS Code\\Code.exe',
          iconDataUrl: 'data:image/png;base64,VSCODE_ICON_PNG==',
        }),
      } as unknown as typeof window.sideflow;

      const resolvedMeta = await resolveShortcutMetadata(
        'C:\\Users\\Dev\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Visual Studio Code.lnk'
      );
      expect(resolvedMeta).toEqual({
        name: 'Visual Studio Code',
        cmd: 'C:\\Program Files\\Microsoft VS Code\\Code.exe',
        customIconUrl: 'data:image/png;base64,VSCODE_ICON_PNG==',
      });
    });
  });
});

describe('Mermaid & SVG Flowchart utilities', () => {
  const sampleFlow: FlowchartState = {
    nodes: [
      { id: 'n1', type: 'start', text: 'Hotkey Pressed', x: 45, y: 35 },
      { id: 'n2', type: 'decision', text: 'Need "Diagram"?', x: 195, y: 120 },
      { id: 'n3', type: 'process', text: 'Launch from Dock', x: 40, y: 245 },
    ],
    edges: [
      { from: 'n1', to: 'n2' },
      { from: 'n2', to: 'n3', label: 'Yes' },
    ],
  };

  describe('computeEdgeGeometry', () => {
    it('anchors vertical edges to top/bottom node boundary ports and horizontal edges to left/right ports', () => {
      const topNode = { id: 'a', type: 'start' as const, text: 'A', x: 50, y: 20 };
      const bottomNode = { id: 'b', type: 'process' as const, text: 'B', x: 50, y: 180 };
      const vGeom = computeEdgeGeometry(topNode, bottomNode);
      expect(vGeom.y1).toBe(20 + 52);
      expect(vGeom.y2).toBe(180);

      const leftNode = { id: 'l', type: 'start' as const, text: 'L', x: 20, y: 100 };
      const rightNode = { id: 'r', type: 'process' as const, text: 'R', x: 280, y: 100 };
      const hGeom = computeEdgeGeometry(leftNode, rightNode);
      expect(hGeom.x1).toBe(20 + 144);
      expect(hGeom.x2).toBe(280);
    });
  });

  describe('generateMermaidCode', () => {
    it('generates valid Mermaid flowchart TD syntax with proper node shapes and edge labels', () => {
      const code = generateMermaidCode(sampleFlow);
      expect(code).toContain('flowchart TD');
      expect(code).toContain('n1(["Hotkey Pressed"])');
      expect(code).toContain("n2{\"Need 'Diagram'?\"}");
      expect(code).toContain('n3["Launch from Dock"]');
      expect(code).toContain('n1 --> n2');
      expect(code).toContain('n2 -->|Yes| n3');
    });
  });

  describe('parseMermaidCode', () => {
    it('parses Mermaid flowchart syntax back into nodes and edges', () => {
      const mermaidInput = `
        flowchart TD
        %% Comment line to ignore
        n1(["Start Flow"])
        n2{"Is Ready?"}
        n3["Execute Task"]
        n1 --> n2
        n2 -->|Confirmed| n3
      `;
      const parsed = parseMermaidCode(mermaidInput);
      expect(parsed).not.toBeNull();
      expect(parsed!.nodes).toHaveLength(3);
      expect(parsed!.nodes[0]).toMatchObject({
        id: 'n1',
        type: 'start',
        text: 'Start Flow',
      });
      expect(parsed!.nodes[1]).toMatchObject({
        id: 'n2',
        type: 'decision',
        text: 'Is Ready?',
      });
      expect(parsed!.nodes[2]).toMatchObject({
        id: 'n3',
        type: 'process',
        text: 'Execute Task',
      });
      expect(parsed!.edges).toEqual([
        { from: 'n1', to: 'n2' },
        { from: 'n2', to: 'n3', label: 'Confirmed' },
      ]);
    });

    it('parses inline node definitions on edges, -- label --> syntax, trailing semicolons, and preserves existing coordinates', () => {
      const inlineMermaid = `
        flowchart TD;
        a(["Entry Point"]) --> b{"Valid Token?"};
        b -- Approved --> c["Grant Access"];
      `;
      const existing = [
        { id: 'a', type: 'start' as const, text: 'Old', x: 111, y: 222 },
      ];
      const parsed = parseMermaidCode(inlineMermaid, existing);
      expect(parsed).not.toBeNull();
      expect(parsed!.nodes).toHaveLength(3);
      expect(parsed!.nodes[0]).toEqual({
        id: 'a',
        type: 'start',
        text: 'Entry Point',
        x: 111,
        y: 222,
      });
      expect(parsed!.edges).toEqual([
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c', label: 'Approved' },
      ]);
    });

    it('returns null for empty or comment-only Mermaid strings', () => {
      expect(parseMermaidCode('   \n  %% only comment \n ')).toBeNull();
      expect(parseMermaidCode('flowchart TD')).toBeNull();
    });

    it('round-trips generateMermaidCode and parseMermaidCode accurately', () => {
      const generated = generateMermaidCode(sampleFlow);
      const parsed = parseMermaidCode(generated);
      expect(parsed).not.toBeNull();
      expect(parsed!.nodes.map((n) => ({ id: n.id, type: n.type }))).toEqual([
        { id: 'n1', type: 'start' },
        { id: 'n2', type: 'decision' },
        { id: 'n3', type: 'process' },
      ]);
      expect(parsed!.edges).toEqual(sampleFlow.edges);
    });

    it('supports all 9 Mermaid node shapes, edge line styles, arrow markers, and flow directions', () => {
      const richFlow: FlowchartState = {
        direction: 'LR',
        nodes: [
          { id: 'n1', type: 'start', text: 'Start', x: 10, y: 10 },
          { id: 'n2', type: 'process', text: 'Step', x: 50, y: 10 },
          { id: 'n3', type: 'decision', text: 'Branch?', x: 90, y: 10 },
          { id: 'n4', type: 'database', text: 'Postgres', x: 130, y: 10 },
          { id: 'n5', type: 'subroutine', text: 'AuthWorker', x: 170, y: 10 },
          { id: 'n6', type: 'io', text: 'Payload', x: 210, y: 10 },
          { id: 'n7', type: 'circle', text: 'Hub', x: 250, y: 10 },
          { id: 'n8', type: 'hexagon', text: 'InitEnv', x: 290, y: 10 },
          { id: 'n9', type: 'asymmetric', text: 'EmitEvent', x: 330, y: 10 },
        ],
        edges: [
          { from: 'n1', to: 'n2', style: 'solid', arrow: 'arrow' },
          { from: 'n2', to: 'n3', label: 'Async', style: 'dotted', arrow: 'arrow' },
          { from: 'n3', to: 'n4', label: 'Write', style: 'thick', arrow: 'bidirectional' },
          { from: 'n4', to: 'n5', style: 'solid', arrow: 'none' },
          { from: 'n5', to: 'n6', style: 'dotted', arrow: 'circle' },
          { from: 'n6', to: 'n7', style: 'thick', arrow: 'cross' },
          { from: 'n7', to: 'n8', style: 'solid', arrow: 'bidirectional' },
          { from: 'n8', to: 'n9', style: 'solid', arrow: 'circle' },
        ],
      };

      const code = generateMermaidCode(richFlow);
      expect(code).toContain('flowchart LR');
      expect(code).toContain('n4[("Postgres")]');
      expect(code).toContain('n5[["AuthWorker"]]');
      expect(code).toContain('n6[/"Payload"/]');
      expect(code).toContain('n7(("Hub"))');
      expect(code).toContain('n8{{"InitEnv"}}');
      expect(code).toContain('n9>"EmitEvent"]');
      expect(code).toContain('n2 -.->|Async| n3');
      expect(code).toContain('n3 <==>|Write| n4');
      expect(code).toContain('n4 --- n5');
      expect(code).toContain('n5 -.-o n6');
      expect(code).toContain('n6 ==x n7');
      expect(code).toContain('n7 <--> n8');
      expect(code).toContain('n8 --o n9');

      const roundTripped = parseMermaidCode(code);
      expect(roundTripped).not.toBeNull();
      expect(roundTripped!.direction).toBe('LR');
      expect(roundTripped!.nodes.map((n) => ({ id: n.id, type: n.type, text: n.text }))).toEqual(
        richFlow.nodes.map((n) => ({ id: n.id, type: n.type, text: n.text }))
      );
      expect(roundTripped!.edges).toEqual([
        { from: 'n1', to: 'n2' },
        { from: 'n2', to: 'n3', label: 'Async', style: 'dotted' },
        { from: 'n3', to: 'n4', label: 'Write', style: 'thick', arrow: 'bidirectional' },
        { from: 'n4', to: 'n5', arrow: 'none' },
        { from: 'n5', to: 'n6', style: 'dotted', arrow: 'circle' },
        { from: 'n6', to: 'n7', style: 'thick', arrow: 'cross' },
        { from: 'n7', to: 'n8', arrow: 'bidirectional' },
        { from: 'n8', to: 'n9', arrow: 'circle' },
      ]);
    });

    it('parses inline dotted and thick labels, backslash parallelograms, and TB/BT/RL directions', () => {
      const mermaidSnippet = `
        graph BT
        a[\\"Read Stream"\\] -. Retry .-> b[("Cache")]
        b == FastPath ==> c{{"Transform"}}
      `;
      const parsed = parseMermaidCode(mermaidSnippet);
      expect(parsed).not.toBeNull();
      expect(parsed!.direction).toBe('BT');
      expect(parsed!.nodes.map((n) => ({ id: n.id, type: n.type }))).toEqual([
        { id: 'a', type: 'io' },
        { id: 'b', type: 'database' },
        { id: 'c', type: 'hexagon' },
      ]);
      expect(parsed!.edges).toEqual([
        { from: 'a', to: 'b', label: 'Retry', style: 'dotted' },
        { from: 'b', to: 'c', label: 'FastPath', style: 'thick' },
      ]);

      const rlParsed = parseMermaidCode('flowchart RL\n  r1(["Right"]) --> l1["Left"]');
      expect(rlParsed?.direction).toBe('RL');

      const tbParsed = parseMermaidCode('graph TB\n  t1["Top"] --> b1["Bottom"]');
      expect(tbParsed?.direction).toBeUndefined();

      expect(formatMermaidEdgeOperator('dotted', 'bidirectional')).toBe('<-.->');
      expect(formatMermaidEdgeOperator('thick', 'none')).toBe('===');
      expect(formatMermaidEdgeOperator('solid', 'cross')).toBe('--x');
    });

    it('parses and round-trips subgraphs, chained edges, ampersand (&) multi-node links, and style/classDef directives', () => {
      const advancedMermaid = `
        flowchart LR
        classDef critical fill:#f43f5e,stroke:#fb7185
        subgraph sg_auth ["Auth Service"]
          n1(["Client"]) & n2(["Mobile"]) -->|TLS| n3{"Gateway"}
          n3 -->|Verify| n4[["TokenCheck"]] -.->|Audit| n5[("AuditDB")]
        end
        n4 ==> n6["Dashboard"]:::emerald
        class n3 critical
        style n5 fill:#a78bfa,stroke:#8b5cf6
      `;

      const parsed = parseMermaidCode(advancedMermaid);
      expect(parsed).not.toBeNull();
      expect(parsed!.direction).toBe('LR');
      expect(parsed!.subgraphs).toEqual([
        {
          id: 'sg_auth',
          title: 'Auth Service',
          nodeIds: ['n1', 'n2', 'n3', 'n4', 'n5'],
        },
      ]);

      // Verify chained and & fan-in/fan-out edges (2 + 2 + 1 = 5 edges)
      expect(parsed!.edges).toEqual([
        { from: 'n1', to: 'n3', label: 'TLS' },
        { from: 'n2', to: 'n3', label: 'TLS' },
        { from: 'n3', to: 'n4', label: 'Verify' },
        { from: 'n4', to: 'n5', label: 'Audit', style: 'dotted' },
        { from: 'n4', to: 'n6', style: 'thick' },
      ]);

      // Verify classDef, :::className, and style color resolution
      const byId = new Map(parsed!.nodes.map((n) => [n.id, n]));
      expect(byId.get('n3')?.color).toBe('rose');
      expect(byId.get('n5')?.color).toBe('purple');
      expect(byId.get('n6')?.color).toBe('emerald');

      // Verify generateMermaidCode outputs subgraph block and style directives
      const regenerated = generateMermaidCode(parsed!);
      expect(regenerated).toContain('subgraph sg_auth ["Auth Service"]');
      expect(regenerated).toContain('end');
      expect(regenerated).toContain('style n3 ');
      expect(regenerated).toContain('style n6 ');

      // Verify computeDagLayout orders topological layers along LR axis
      const laidOut = computeDagLayout(parsed!);
      const layoutById = new Map(laidOut.map((n) => [n.id, n]));
      expect(layoutById.get('n1')!.x).toBeLessThan(layoutById.get('n3')!.x);
      expect(layoutById.get('n3')!.x).toBeLessThan(layoutById.get('n4')!.x);
      expect(layoutById.get('n4')!.x).toBeLessThan(layoutById.get('n6')!.x);

      // Verify computeSubgraphBounds and SVG subgraph rendering
      const bounds = computeSubgraphBounds(parsed!.subgraphs![0], laidOut);
      expect(bounds).not.toBeNull();
      expect(bounds!.width).toBeGreaterThan(180);

      const svg = generateStandaloneSVG({ ...parsed!, nodes: laidOut });
      expect(svg).toContain('<g id="subgraphs">');
      expect(svg).toContain('Auth Service');
    });

    it('parses and round-trips stateDiagram-v2 with [*] pseudo-states, <<choice>>, composite states, and transition labels', () => {
      const stateCode = [
        'stateDiagram-v2',
        '    direction LR',
        '    state "Active Cluster" as cluster {',
        '        state "Idle Worker" as Idle',
        '        state Verify <<choice>>',
        '    }',
        '    state "Verify Gate" as Verify',
        '    Done : Completed',
        '    [*] --> Idle',
        '    Idle --> Verify : Dispatch',
        '    Verify --> Done : Exit 0',
        '    Done --> [*]',
      ].join('\n');

      const parsed = parseMermaidCode(stateCode);
      expect(parsed).not.toBeNull();
      expect(parsed!.diagramType).toBe('stateDiagram-v2');
      expect(parsed!.direction).toBe('LR');
      expect(parsed!.subgraphs).toEqual([
        {
          id: 'cluster',
          title: 'Active Cluster',
          nodeIds: ['Idle', 'Verify'],
        },
      ]);

      const byId = new Map(parsed!.nodes.map((n) => [n.id, n]));
      expect(byId.get('state_start')?.type).toBe('start');
      expect(byId.get('state_end')?.type).toBe('start');
      expect(byId.get('Verify')?.type).toBe('decision');
      expect(byId.get('Verify')?.text).toBe('Verify Gate');
      expect(byId.get('Done')?.text).toBe('Completed');

      const regenerated = generateMermaidCode(parsed!);
      expect(regenerated).toContain('stateDiagram-v2');
      expect(regenerated).toContain('direction LR');
      expect(regenerated).toContain('state "Active Cluster" as cluster {');
      expect(regenerated).toContain('state Verify <<choice>>');
      expect(regenerated).toContain('[*] --> Idle');
      expect(regenerated).toContain('Idle --> Verify : Dispatch');
      expect(regenerated).toContain('Done --> [*]');
    });

    it('parses and round-trips sequenceDiagram participants, actors, message operators (->>, -->>, -x, --x), and SVG lifelines', () => {
      const seqCode = [
        'sequenceDiagram',
        '    autonumber',
        '    actor user as End User',
        '    participant api as API Gateway',
        '    participant db as Auth DB',
        '    user->>+api: POST /login',
        '    api->>db: SELECT user',
        '    db-->>api: Row Found',
        '    api--xuser: 429 Rate Limit',
      ].join('\n');

      const parsed = parseMermaidCode(seqCode);
      expect(parsed).not.toBeNull();
      expect(parsed!.diagramType).toBe('sequenceDiagram');
      expect(parsed!.nodes.map((n) => ({ id: n.id, type: n.type, text: n.text }))).toEqual([
        { id: 'user', type: 'circle', text: 'End User' },
        { id: 'api', type: 'process', text: 'API Gateway' },
        { id: 'db', type: 'process', text: 'Auth DB' },
      ]);
      expect(parsed!.edges).toEqual([
        { from: 'user', to: 'api', label: 'POST /login' },
        { from: 'api', to: 'db', label: 'SELECT user' },
        { from: 'db', to: 'api', label: 'Row Found', style: 'dotted' },
        { from: 'api', to: 'user', label: '429 Rate Limit', style: 'dotted', arrow: 'cross' },
      ]);

      expect(formatSequenceMessageOperator('solid', 'arrow')).toBe('->>');
      expect(formatSequenceMessageOperator('dotted', 'arrow')).toBe('-->>');
      expect(formatSequenceMessageOperator('dotted', 'cross')).toBe('--x');

      const regenerated = generateMermaidCode(parsed!);
      expect(regenerated).toContain('sequenceDiagram');
      expect(regenerated).toContain('actor user as End User');
      expect(regenerated).toContain('participant api as API Gateway');
      expect(regenerated).toContain('db-->>api: Row Found');
      expect(regenerated).toContain('api--xuser: 429 Rate Limit');

      const svg = generateStandaloneSVG(parsed!);
      expect(svg).toContain('<g id="lifelines">');
      expect(svg).toContain('1. POST /login');
      expect(svg).toContain('3. Row Found');

      // Verify starter template presets load cleanly
      const cicdPreset = getMermaidTemplatePreset('ci-cd');
      expect(cicdPreset?.subgraphs?.length).toBe(2);
      const microPreset = getMermaidTemplatePreset('microservice');
      expect(microPreset?.diagramType).toBe('sequenceDiagram');
    });

    it('parses and round-trips classDiagram with namespaces, <<interface>> stereotypes, members, and UML relationships', () => {
      const classCode = [
        'classDiagram',
        '    direction LR',
        '    namespace AuthDomain {',
        '        class IAuthenticator {',
        '            <<interface>>',
        '            +verify(token) bool',
        '        }',
        '        class JwtAuthService["JWT Auth Service"] {',
        '            -String secretKey',
        '            +verify(token) bool',
        '        }',
        '    }',
        '    class SessionStore',
        '    SessionStore : +saveSession(id)',
        '    IAuthenticator <|.. JwtAuthService : implements',
        '    JwtAuthService "1" *-- "many" SessionStore : manages',
      ].join('\n');

      const parsed = parseMermaidCode(classCode);
      expect(parsed).not.toBeNull();
      expect(parsed!.diagramType).toBe('classDiagram');
      expect(parsed!.direction).toBe('LR');
      expect(parsed!.subgraphs).toEqual([
        {
          id: 'AuthDomain',
          title: 'AuthDomain',
          nodeIds: ['IAuthenticator', 'JwtAuthService'],
        },
      ]);

      const byId = new Map(parsed!.nodes.map((n) => [n.id, n]));
      expect(byId.get('IAuthenticator')).toMatchObject({
        id: 'IAuthenticator',
        type: 'hexagon',
        stereotype: 'interface',
        members: ['+verify(token) bool'],
      });
      expect(byId.get('JwtAuthService')).toMatchObject({
        id: 'JwtAuthService',
        text: 'JWT Auth Service',
        members: ['-String secretKey', '+verify(token) bool'],
      });
      expect(byId.get('SessionStore')?.members).toEqual(['+saveSession(id)']);

      expect(parsed!.edges).toEqual([
        {
          from: 'IAuthenticator',
          to: 'JwtAuthService',
          cardinality: '<|..',
          label: 'implements',
          style: 'dotted',
          arrow: 'bidirectional',
        },
        {
          from: 'JwtAuthService',
          to: 'SessionStore',
          cardinality: '*--',
          label: 'manages',
          arrow: 'circle',
        },
      ]);

      const regenerated = generateMermaidCode(parsed!);
      expect(regenerated).toContain('classDiagram');
      expect(regenerated).toContain('namespace AuthDomain {');
      expect(regenerated).toContain('<<interface>>');
      expect(regenerated).toContain('+verify(token) bool');
      expect(regenerated).toContain('IAuthenticator <|.. JwtAuthService : implements');
      expect(regenerated).toContain('JwtAuthService *-- SessionStore : manages');

      const svg = generateStandaloneSVG(parsed!);
      expect(svg).toContain('&lt;&lt;interface&gt;&gt;');
      expect(svg).toContain('+verify(token) bool');

      const umlPreset = getMermaidTemplatePreset('uml-class');
      expect(umlPreset?.diagramType).toBe('classDiagram');
      expect(umlPreset?.nodes.length).toBe(3);
    });

    it('parses and round-trips erDiagram entity attribute blocks (PK/FK/UK) and Crow-Foot cardinality operators', () => {
      const erCode = [
        'erDiagram',
        '    USER["User Account"] {',
        '        uuid id PK',
        '        string email UK',
        '    }',
        '    ORDER {',
        '        uuid id PK',
        '        uuid user_id FK',
        '    }',
        '    TAG {',
        '        int id PK',
        '    }',
        '    USER ||--o{ ORDER : "places"',
        '    ORDER }|..|{ TAG : tagged_with',
      ].join('\n');

      const parsed = parseMermaidCode(erCode);
      expect(parsed).not.toBeNull();
      expect(parsed!.diagramType).toBe('erDiagram');
      expect(parsed!.nodes.map((n) => ({
        id: n.id,
        type: n.type,
        text: n.text,
        members: n.members,
      }))).toEqual([
        {
          id: 'USER',
          type: 'database',
          text: 'User Account',
          members: ['uuid id PK', 'string email UK'],
        },
        {
          id: 'ORDER',
          type: 'database',
          text: 'ORDER',
          members: ['uuid id PK', 'uuid user_id FK'],
        },
        {
          id: 'TAG',
          type: 'database',
          text: 'TAG',
          members: ['int id PK'],
        },
      ]);

      expect(parsed!.edges).toEqual([
        {
          from: 'USER',
          to: 'ORDER',
          cardinality: '||--o{',
          label: 'places',
        },
        {
          from: 'ORDER',
          to: 'TAG',
          cardinality: '}|..|{',
          label: 'tagged_with',
          style: 'dotted',
        },
      ]);

      const regenerated = generateMermaidCode(parsed!);
      expect(regenerated).toContain('erDiagram');
      expect(regenerated).toContain('USER["User Account"] {');
      expect(regenerated).toContain('uuid id PK');
      expect(regenerated).toContain('USER ||--o{ ORDER : places');
      expect(regenerated).toContain('ORDER }|..|{ TAG : tagged_with');

      const erPreset = getMermaidTemplatePreset('er-schema');
      expect(erPreset?.diagramType).toBe('erDiagram');
      expect(erPreset?.nodes.length).toBe(3);
    });
  });

  describe('generateStandaloneSVG', () => {
    it('renders standalone XML SVG markup with escaped text, boundary port edges, and dynamic bounding box', () => {
      const flowWithSpecialChars: FlowchartState = {
        nodes: [
          { id: 'a', type: 'start', text: 'Init & <Load>', x: 20, y: 30 },
          { id: 'b', type: 'decision', text: 'Check?', x: 680, y: 520 },
        ],
        edges: [{ from: 'a', to: 'b', label: 'A & B' }],
      };
      const svg = generateStandaloneSVG(flowWithSpecialChars);
      expect(svg).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(svg).toContain('viewBox="0 0 872 620"');
      expect(svg).toContain('Init &amp; &lt;Load&gt;');
      expect(svg).toContain('A &amp; B');
      expect(svg).toContain('marker-end="url(#arrowhead)"');
      expect(svg).toContain('stroke-dasharray="5,4"');
    });

    it('renders SVG geometry for database, subroutine, io, hexagon, asymmetric shapes and dotted/thick/marker edges', () => {
      const richSvgFlow: FlowchartState = {
        direction: 'LR',
        nodes: [
          { id: 'd', type: 'database', text: 'DB', x: 10, y: 20 },
          { id: 's', type: 'subroutine', text: 'Sub', x: 200, y: 20 },
          { id: 'i', type: 'io', text: 'IO', x: 10, y: 120 },
          { id: 'h', type: 'hexagon', text: 'Hex', x: 200, y: 120 },
          { id: 'f', type: 'asymmetric', text: 'Flag', x: 100, y: 220 },
        ],
        edges: [
          { from: 'd', to: 's', style: 'dotted', arrow: 'bidirectional' },
          { from: 's', to: 'i', style: 'thick', arrow: 'circle' },
          { from: 'i', to: 'h', style: 'solid', arrow: 'cross' },
          { from: 'h', to: 'f', style: 'solid', arrow: 'none' },
        ],
      };
      const svg = generateStandaloneSVG(richSvgFlow);
      expect(svg).toContain('<ellipse');
      expect(svg).toContain('<polygon');
      expect(svg).toContain('stroke-dasharray="6,4"');
      expect(svg).toContain('stroke-width="4"');
      expect(svg).toContain('marker-start="url(#arrowhead-start)"');
      expect(svg).toContain('marker-end="url(#circlehead)"');
      expect(svg).toContain('marker-end="url(#crosshead)"');
    });
  });
});

describe('useLocalStorage hook', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete window.sideflow;
  });

  it('returns initialValue when localStorage is empty and persists updates', () => {
    const { result } = renderHook(() =>
      useLocalStorage('sideflow_test_key', { count: 1 })
    );

    expect(result.current[0]).toEqual({ count: 1 });

    act(() => {
      result.current[1]({ count: 5 });
    });

    expect(result.current[0]).toEqual({ count: 5 });
    expect(
      JSON.parse(window.localStorage.getItem('sideflow_test_key') || '{}')
    ).toEqual({ count: 5 });
  });

  it('supports functional updater and reads pre-existing localStorage value', () => {
    window.localStorage.setItem('sideflow_counter', JSON.stringify(10));

    const { result } = renderHook(() => useLocalStorage('sideflow_counter', 0));
    expect(result.current[0]).toBe(10);

    act(() => {
      result.current[1]((prev) => prev + 15);
    });

    expect(result.current[0]).toBe(25);
    expect(window.localStorage.getItem('sideflow_counter')).toBe('25');
  });

  it('hydrates from Electron storeGetAll once across multiple hooks and syncs to storeSet', async () => {
    const storeSetMock = vi.fn();
    const storeGetAllMock = vi.fn().mockResolvedValue({
      sideflow_electron_key: 'hydrated-from-electron',
      sideflow_second_key: 'second-hydrated',
    });

    window.sideflow = {
      isElectron: true,
      storeGetAll: storeGetAllMock,
      storeSet: storeSetMock,
    } as unknown as typeof window.sideflow;

    const { result: res1 } = renderHook(() =>
      useLocalStorage('sideflow_electron_key', 'default-val')
    );
    const { result: res2 } = renderHook(() =>
      useLocalStorage('sideflow_second_key', 'default-2')
    );

    await waitFor(() => {
      expect(res1.current[0]).toBe('hydrated-from-electron');
      expect(res2.current[0]).toBe('second-hydrated');
    });

    expect(storeGetAllMock).toHaveBeenCalledTimes(1);

    act(() => {
      res1.current[1]('updated-val');
    });

    expect(storeSetMock).toHaveBeenCalledWith(
      'sideflow_electron_key',
      'updated-val'
    );
  });
});

describe('localSttEngine DSP & Hybrid Multi-Engine Router', () => {
  afterEach(() => {
    delete window.sideflow;
    vi.restoreAllMocks();
  });

  it('computes normalized RMS audio level and merges Float32 chunks accurately', () => {
    expect(computeRmsLevel(new Float32Array(0))).toBe(0);
    expect(computeRmsLevel(new Float32Array([0, 0, 0]))).toBe(0);

    const activeWave = new Float32Array([0.1, -0.1, 0.1, -0.1]);
    expect(computeRmsLevel(activeWave)).toBeCloseTo(0.42, 2);

    const merged = mergeFloat32Chunks([
      new Float32Array([0.1, 0.2]),
      new Float32Array([0.3]),
    ]);
    expect(Array.from(merged)).toEqual([
      expect.closeTo(0.1, 5),
      expect.closeTo(0.2, 5),
      expect.closeTo(0.3, 5),
    ]);
  });

  it('resamples 48kHz audio down to 16kHz and encodes PCM16 Base64', () => {
    const input48k = new Float32Array(4800).fill(0.5);
    const resampled16k = resampleTo16kHz(input48k, 48000);
    expect(resampled16k.length).toBe(1600);
    expect(resampled16k[0]).toBeCloseTo(0.5, 4);

    const b64 = float32ToPcm16Base64(new Float32Array([0, 0.5, -0.5, 1.0]));
    expect(typeof b64).toBe('string');
    expect(b64.length).toBeGreaterThan(4);
  });

  it('routes audio to Electron Native CUDA bridge in auto/native-cuda modes', async () => {
    const transcribeMock = vi.fn().mockResolvedValue({
      success: true,
      text: 'Transcribed on RTX 3090 Ti via faster-whisper',
      engineUsed: 'faster-whisper CUDA (NVIDIA GeForce RTX 3090 Ti)',
      durationMs: 92,
    });

    window.sideflow = {
      isElectron: true,
      transcribeAudioLocal: transcribeMock,
    } as unknown as typeof window.sideflow;

    const audio16k = new Float32Array(3200).fill(0.15);
    const res = await transcribeAudioChunkHybrid({
      audio16k,
      lang: 'en-US',
      engineMode: 'auto',
      modelSize: 'base.en',
    });

    expect(transcribeMock).toHaveBeenCalledTimes(1);
    expect(res.success).toBe(true);
    expect(res.text).toBe('Transcribed on RTX 3090 Ti via faster-whisper');
    expect(res.engineUsed).toContain('RTX 3090 Ti');
  });

  it('trims leading and trailing silence for CPU efficiency and skips all-silent buffers', async () => {
    const pureSilence = new Float32Array(8000).fill(0.001);
    expect(trimSilenceFloat32(pureSilence).length).toBe(0);

    // 4000 silent samples + 2000 active voice samples + 4000 silent samples
    const padded = new Float32Array(10000).fill(0);
    for (let i = 4000; i < 6000; i++) {
      padded[i] = 0.25;
    }
    const trimmed = trimSilenceFloat32(padded, 0.012, 500);
    // Should keep 2000 active + 500 pad on each side = 3000 samples (saving 70% of CPU work)
    expect(trimmed.length).toBe(3000);

    // Verify transcribeAudioChunkHybrid short-circuits on pure silence without invoking engine
    const transcribeMock = vi.fn();
    window.sideflow = {
      isElectron: true,
      transcribeAudioLocal: transcribeMock,
    } as unknown as typeof window.sideflow;

    const silentRes = await transcribeAudioChunkHybrid({
      audio16k: pureSilence,
      lang: 'en-US',
      engineMode: 'native-cpu',
      modelSize: 'moonshine-tiny',
    });
    expect(silentRes.success).toBe(true);
    expect(silentRes.text).toBe('');
    expect(transcribeMock).not.toHaveBeenCalled();
  });

  it('normalizes quiet laptop microphone audio gain and forwards promptContext to local STT worker', async () => {
    // Quiet signal with peak ~0.15 and slight DC offset
    const quietWave = new Float32Array([0.16, -0.14, 0.16, -0.14, 0.16, -0.14]);
    const normalized = normalizeAudioFloat32(quietWave, 0.85, 8.0);
    let maxPeak = 0;
    for (let i = 0; i < normalized.length; i++) {
      const a = Math.abs(normalized[i]);
      if (a > maxPeak) maxPeak = a;
    }
    expect(maxPeak).toBeCloseTo(0.85, 2);

    const transcribeMock = vi.fn().mockResolvedValue({
      success: true,
      text: 'Core i9 11950H INT8 transcription',
      engineUsed: 'faster-whisper CPU INT8 (8 threads)',
      durationMs: 140,
    });
    window.sideflow = {
      isElectron: true,
      transcribeAudioLocal: transcribeMock,
    } as unknown as typeof window.sideflow;

    const activeSamples = new Float32Array(3200).fill(0.12);
    const res = await transcribeAudioChunkHybrid({
      audio16k: activeSamples,
      lang: 'en-US',
      engineMode: 'native-cpu',
      modelSize: 'distil-medium.en',
      promptContext: 'SideFlow Core i9 11950H',
    });

    expect(res.success).toBe(true);
    expect(transcribeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        modelSize: 'distil-medium.en',
        preferEngine: 'native-cpu',
        promptContext: 'SideFlow Core i9 11950H',
      })
    );
  });
});

describe('Screen Presence clampPanelWidthPercent utility', () => {
  it('clamps percentage values within [15, 90], rounds decimals, and falls back to default 35% on invalid input', () => {
    expect(clampPanelWidthPercent(50)).toBe(50);
    expect(clampPanelWidthPercent(42.6)).toBe(43);
    expect(clampPanelWidthPercent(5)).toBe(MIN_PANEL_WIDTH_PERCENT);
    expect(clampPanelWidthPercent(120)).toBe(MAX_PANEL_WIDTH_PERCENT);
    expect(clampPanelWidthPercent('65')).toBe(65);
    expect(clampPanelWidthPercent(NaN)).toBe(DEFAULT_PANEL_WIDTH_PERCENT);
    expect(clampPanelWidthPercent(undefined)).toBe(DEFAULT_PANEL_WIDTH_PERCENT);
    expect(clampPanelWidthPercent(null)).toBe(DEFAULT_PANEL_WIDTH_PERCENT);
    expect(clampPanelWidthPercent('')).toBe(DEFAULT_PANEL_WIDTH_PERCENT);
    expect(clampPanelWidthPercent(false)).toBe(DEFAULT_PANEL_WIDTH_PERCENT);
  });
});

