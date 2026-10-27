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
});
