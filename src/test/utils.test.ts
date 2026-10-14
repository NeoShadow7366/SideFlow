import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import {
  extractFilenameFromPath,
  inferAppMetaFromFilename,
  resolveDroppedFilePath,
  executeAppCommand,
} from '../utils/fileMeta';
import {
  generateMermaidCode,
  parseMermaidCode,
  generateStandaloneSVG,
} from '../utils/mermaid';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { FlowchartState } from '../types/sideflow';

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
    it('delegates to window.sideflow.launchNativeApp when running in Electron', async () => {
      const launchMock = vi.fn().mockResolvedValue({ success: true });
      window.sideflow = {
        isElectron: true,
        launchNativeApp: launchMock,
      } as unknown as typeof window.sideflow;

      await executeAppCommand('  C:\\Program Files\\App\\app.exe  ');
      expect(launchMock).toHaveBeenCalledWith('C:\\Program Files\\App\\app.exe');
    });

    it('opens http/https URLs in a new tab in browser mode', async () => {
      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
      await executeAppCommand('https://lucid.app/documents');
      expect(openSpy).toHaveBeenCalledWith(
        'https://lucid.app/documents',
        '_blank',
        'noopener,noreferrer'
      );
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
  });

  describe('generateStandaloneSVG', () => {
    it('renders standalone XML SVG markup with escaped text, nodes, and directed edges', () => {
      const flowWithSpecialChars: FlowchartState = {
        nodes: [
          { id: 'a', type: 'start', text: 'Init & <Load>', x: 20, y: 30 },
          { id: 'b', type: 'decision', text: 'Check?', x: 180, y: 120 },
        ],
        edges: [{ from: 'a', to: 'b', label: 'A & B' }],
      };
      const svg = generateStandaloneSVG(flowWithSpecialChars);
      expect(svg).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
      expect(svg).toContain('Init &amp; &lt;Load&gt;');
      expect(svg).toContain('A &amp; B');
      expect(svg).toContain('marker-end="url(#arrowhead)"');
      expect(svg).toContain('stroke-dasharray="5,4"');
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

  it('hydrates from Electron storeGetAll and syncs to storeSet when available', async () => {
    const storeSetMock = vi.fn();
    const storeGetAllMock = vi.fn().mockResolvedValue({
      sideflow_electron_key: 'hydrated-from-electron',
    });

    window.sideflow = {
      isElectron: true,
      storeGetAll: storeGetAllMock,
      storeSet: storeSetMock,
    } as unknown as typeof window.sideflow;

    const { result } = renderHook(() =>
      useLocalStorage('sideflow_electron_key', 'default-val')
    );

    await waitFor(() => {
      expect(result.current[0]).toBe('hydrated-from-electron');
    });

    act(() => {
      result.current[1]('updated-val');
    });

    expect(storeSetMock).toHaveBeenCalledWith(
      'sideflow_electron_key',
      'updated-val'
    );
  });
});
