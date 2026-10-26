import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react';
import App from '../App';
import { SettingsView } from '../components/Settings/SettingsView';
import {
  defaultMonitorSettings,
  defaultShortcut,
  resolveEffectiveEdge,
  resolveEnabledDisplays,
  resolveShortcutTargetDisplay,
  sanitizeMonitorSettings,
  simulatedDisplays,
} from '../utils/defaults';
import {
  DisplayStatePayload,
  MonitorDisplayInfo,
  MonitorSettings,
  PanelEdge,
  SideFlowElectronBridge,
} from '../types/sideflow';

const THREE_DISPLAYS: MonitorDisplayInfo[] = [
  {
    id: 1,
    index: 1,
    label: 'Primary Laptop Screen',
    isPrimary: true,
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    workArea: { x: 0, y: 0, width: 1920, height: 1040 },
    scaleFactor: 1,
  },
  {
    id: 2,
    index: 2,
    label: 'Ultrawide Center Display',
    isPrimary: false,
    bounds: { x: 1920, y: 0, width: 3440, height: 1440 },
    workArea: { x: 1920, y: 0, width: 3440, height: 1400 },
    scaleFactor: 1.25,
  },
  {
    id: 3,
    index: 3,
    label: 'Portrait Right Display',
    isPrimary: false,
    bounds: { x: 5360, y: 0, width: 1440, height: 2560 },
    workArea: { x: 5360, y: 0, width: 1440, height: 2520 },
    scaleFactor: 1,
  },
];

function createStatefulSideFlowBridge(options?: {
  isElectron?: boolean;
  initialDisplays?: MonitorDisplayInfo[];
  initialActiveDisplayId?: number;
  initialMonitorSettings?: MonitorSettings;
  defaultEdge?: PanelEdge;
  includeSetMonitorSettings?: boolean;
}) {
  let currentDisplays = options?.initialDisplays ?? simulatedDisplays;
  let currentSettings = sanitizeMonitorSettings(
    options?.initialMonitorSettings ?? defaultMonitorSettings
  );
  let currentActiveId =
    options?.initialActiveDisplayId ?? currentDisplays[0]?.id ?? 1;
  let currentGlobalEdge: PanelEdge = options?.defaultEdge ?? 'right';
  const displayListeners = new Set<(state: DisplayStatePayload) => void>();

  const buildPayload = (): DisplayStatePayload => ({
    displays: currentDisplays,
    activeDisplayId: currentActiveId,
    effectiveEdge: resolveEffectiveEdge(
      currentActiveId,
      currentSettings,
      currentGlobalEdge
    ),
    monitorSettings: currentSettings,
  });

  const getDisplayState = vi.fn(async () => buildPayload());

  const setMonitorSettings = vi.fn(async (next: MonitorSettings) => {
    currentSettings = sanitizeMonitorSettings(next);
    const enabled = resolveEnabledDisplays(currentDisplays, currentSettings);
    if (enabled.length > 0 && !enabled.some((d) => d.id === currentActiveId)) {
      currentActiveId = enabled[0].id;
    }
    return buildPayload();
  });

  const activateDisplay = vi.fn(async (displayId: number, _openPanel?: boolean) => {
    if (currentDisplays.some((d) => d.id === displayId)) {
      currentActiveId = displayId;
    }
    return buildPayload();
  });

  const setPanelVisibility = vi.fn();
  const setPanelEdge = vi.fn((edge: PanelEdge) => {
    currentGlobalEdge = edge;
  });
  const setPanelWidthPercent = vi.fn();
  const setEdgeHandleState = vi.fn();
  const updateGlobalShortcut = vi.fn(async () => true);

  const onDisplayStateChanged = vi.fn(
    (cb: (state: DisplayStatePayload) => void) => {
      displayListeners.add(cb);
      return () => {
        displayListeners.delete(cb);
      };
    }
  );

  const bridge: SideFlowElectronBridge = {
    isElectron: options?.isElectron ?? false,
    launchNativeApp: vi.fn(async () => ({ success: true })),
    updateGlobalShortcut,
    setPanelVisibility,
    setPanelEdge,
    setPanelWidthPercent,
    setEdgeHandleState,
    getDisplayState,
    ...(options?.includeSetMonitorSettings === false
      ? {}
      : { setMonitorSettings }),
    activateDisplay,
    onDisplayStateChanged,
    openFileDialog: vi.fn(async () => []),
    getPathForFile: vi.fn((file: File) => file.name),
    onSetPanelVisibility: vi.fn(() => () => {}),
    onSwitchTab: vi.fn(() => () => {}),
    onWindowBlur: vi.fn(() => () => {}),
    storeGetAll: vi.fn(async () => ({})),
    storeSet: vi.fn(),
  };

  return {
    bridge,
    spies: {
      getDisplayState,
      setMonitorSettings,
      activateDisplay,
      setPanelVisibility,
      setPanelEdge,
      setEdgeHandleState,
      updateGlobalShortcut,
      onDisplayStateChanged,
    },
    emitDisplayStateChanged(nextState: Partial<DisplayStatePayload>) {
      if (nextState.displays) currentDisplays = nextState.displays;
      if (typeof nextState.activeDisplayId === 'number') {
        currentActiveId = nextState.activeDisplayId;
      }
      if (nextState.monitorSettings) {
        currentSettings = sanitizeMonitorSettings(nextState.monitorSettings);
      }
      const payload = {
        ...buildPayload(),
        ...nextState,
      };
      displayListeners.forEach((cb) => cb(payload));
    },
  };
}

function openSettingsTab() {
  fireEvent.click(
    screen.getByRole('tab', { name: /Shortcut & Tray Settings/i })
  );
}

function pressAltSpace() {
  fireEvent.keyDown(window, {
    key: ' ',
    code: 'Space',
    altKey: true,
  });
}

describe('Multi-Monitor Pure Helper Unit Tests', () => {
  describe('sanitizeMonitorSettings', () => {
    it('returns defaultMonitorSettings clone for null, undefined, primitives, and arrays', () => {
      for (const invalid of [null, undefined, '', 42, true, [1, 2]]) {
        const result = sanitizeMonitorSettings(invalid);
        expect(result).toEqual(defaultMonitorSettings);
        expect(result.edgeOverrides).not.toBe(
          defaultMonitorSettings.edgeOverrides
        );
      }
    });

    it('preserves valid modes and falls back to primary for invalid modes', () => {
      expect(sanitizeMonitorSettings({ mode: 'primary' }).mode).toBe('primary');
      expect(sanitizeMonitorSettings({ mode: 'single' }).mode).toBe('single');
      expect(sanitizeMonitorSettings({ mode: 'all' }).mode).toBe('all');
      expect(sanitizeMonitorSettings({ mode: 'custom' }).mode).toBe('custom');
      expect(sanitizeMonitorSettings({ mode: 'mirror' }).mode).toBe('primary');
      expect(sanitizeMonitorSettings({ mode: 123 }).mode).toBe('primary');
    });

    it('normalizes targetDisplayId, deduplicates enabledDisplayIds, and filters invalid edgeOverrides', () => {
      const sanitized = sanitizeMonitorSettings({
        mode: 'custom',
        targetDisplayId: 2,
        enabledDisplayIds: [1, 2, 2, '3', NaN, Infinity, -Infinity, null, 3],
        edgeOverrides: {
          '1': 'left',
          '2': 'right',
          '3': 'top',
          '4': 123,
          '5': null,
          foo: 'left',
          '1.5': 'right',
        },
      });

      expect(sanitized).toEqual({
        mode: 'custom',
        targetDisplayId: 2,
        enabledDisplayIds: [1, 2, 3],
        edgeOverrides: {
          '1': 'left',
          '2': 'right',
        },
      });

      expect(
        sanitizeMonitorSettings({ mode: 'single', targetDisplayId: NaN })
          .targetDisplayId
      ).toBeNull();
      expect(
        sanitizeMonitorSettings({ mode: 'single', targetDisplayId: Infinity })
          .targetDisplayId
      ).toBeNull();
      expect(
        sanitizeMonitorSettings({ mode: 'single', targetDisplayId: '2' })
          .targetDisplayId
      ).toBeNull();
      expect(
        sanitizeMonitorSettings({
          mode: 'all',
          edgeOverrides: ['left', 'right'],
        }).edgeOverrides
      ).toEqual({});
    });

    it('rejects prototype-pollution keys (__proto__, constructor, prototype) in edgeOverrides', () => {
      const maliciousPayload = JSON.parse(
        '{"mode":"all","edgeOverrides":{"__proto__":"left","constructor":"right","prototype":"left","1":"left","2":"right"}}'
      );

      const sanitized = sanitizeMonitorSettings(maliciousPayload);

      expect(sanitized.edgeOverrides).toEqual({
        '1': 'left',
        '2': 'right',
      });
      expect(
        Object.prototype.hasOwnProperty.call(
          sanitized.edgeOverrides,
          '__proto__'
        )
      ).toBe(false);
      expect(
        Object.prototype.hasOwnProperty.call(
          sanitized.edgeOverrides,
          'constructor'
        )
      ).toBe(false);
      expect(
        Object.prototype.hasOwnProperty.call(
          sanitized.edgeOverrides,
          'prototype'
        )
      ).toBe(false);
      expect(({} as Record<string, unknown>).__proto__).toBe(Object.prototype);
    });
  });

  describe('resolveEnabledDisplays', () => {
    it('returns an empty array when displays list is empty', () => {
      expect(resolveEnabledDisplays([], defaultMonitorSettings)).toEqual([]);
    });

    it('resolves primary display in primary mode and falls back to first display when none is marked primary', () => {
      const resolved = resolveEnabledDisplays(THREE_DISPLAYS, {
        mode: 'primary',
      });
      expect(resolved.map((d) => d.id)).toEqual([1]);

      const nonPrimaryDisplays = THREE_DISPLAYS.map((d) => ({
        ...d,
        isPrimary: false,
      }));
      expect(
        resolveEnabledDisplays(nonPrimaryDisplays, { mode: 'primary' }).map(
          (d) => d.id
        )
      ).toEqual([1]);
    });

    it('resolves target display in single mode and falls back to primary if disconnected or unset', () => {
      expect(
        resolveEnabledDisplays(THREE_DISPLAYS, {
          mode: 'single',
          targetDisplayId: 2,
        }).map((d) => d.id)
      ).toEqual([2]);

      // Disconnected targetDisplayId fallback
      expect(
        resolveEnabledDisplays(THREE_DISPLAYS, {
          mode: 'single',
          targetDisplayId: 999,
        }).map((d) => d.id)
      ).toEqual([1]);

      // Null targetDisplayId fallback
      expect(
        resolveEnabledDisplays(THREE_DISPLAYS, {
          mode: 'single',
          targetDisplayId: null,
        }).map((d) => d.id)
      ).toEqual([1]);
    });

    it('resolves all connected displays as a shallow copy in all mode', () => {
      const resolved = resolveEnabledDisplays(THREE_DISPLAYS, { mode: 'all' });
      expect(resolved.map((d) => d.id)).toEqual([1, 2, 3]);
      expect(resolved).not.toBe(THREE_DISPLAYS);
    });

    it('resolves selected displays in custom mode and falls back to primary if all selected displays are disconnected', () => {
      expect(
        resolveEnabledDisplays(THREE_DISPLAYS, {
          mode: 'custom',
          enabledDisplayIds: [2, 3],
        }).map((d) => d.id)
      ).toEqual([2, 3]);

      // Partial disconnect keeps remaining connected selected display
      expect(
        resolveEnabledDisplays(THREE_DISPLAYS, {
          mode: 'custom',
          enabledDisplayIds: [3, 999],
        }).map((d) => d.id)
      ).toEqual([3]);

      // All selected displays disconnected -> fallback to primary
      expect(
        resolveEnabledDisplays(THREE_DISPLAYS, {
          mode: 'custom',
          enabledDisplayIds: [888, 999],
        }).map((d) => d.id)
      ).toEqual([1]);

      // Empty custom selection -> fallback to primary
      expect(
        resolveEnabledDisplays(THREE_DISPLAYS, {
          mode: 'custom',
          enabledDisplayIds: [],
        }).map((d) => d.id)
      ).toEqual([1]);
    });
  });

  describe('resolveEffectiveEdge', () => {
    it('returns per-monitor edge override when present and falls back to defaultEdge otherwise', () => {
      const settings: MonitorSettings = {
        mode: 'all',
        edgeOverrides: {
          '1': 'left',
          '2': 'right',
        },
      };

      expect(resolveEffectiveEdge(1, settings, 'right')).toBe('left');
      expect(resolveEffectiveEdge(2, settings, 'left')).toBe('right');
      expect(resolveEffectiveEdge(3, settings, 'left')).toBe('left');
      expect(resolveEffectiveEdge(3, settings, 'right')).toBe('right');
      expect(resolveEffectiveEdge(null, settings, 'left')).toBe('left');
      expect(resolveEffectiveEdge(undefined, undefined, 'right')).toBe('right');
    });
  });

  describe('resolveShortcutTargetDisplay', () => {
    it('handles open, move, and close in primary and single monitor modes regardless of cursor monitor', () => {
      const singleMonitor2: MonitorSettings = {
        mode: 'single',
        targetDisplayId: 2,
      };

      // Closed -> open on Monitor 2 even if cursor is on Monitor 3
      expect(
        resolveShortcutTargetDisplay({
          displays: THREE_DISPLAYS,
          settings: singleMonitor2,
          cursorDisplayId: 3,
          activeDisplayId: 1,
          isPanelOpen: false,
        })
      ).toEqual({ action: 'open', targetDisplayId: 2 });

      // Open on Monitor 1 while configured for Monitor 2 -> move to Monitor 2
      expect(
        resolveShortcutTargetDisplay({
          displays: THREE_DISPLAYS,
          settings: singleMonitor2,
          cursorDisplayId: 1,
          activeDisplayId: 1,
          isPanelOpen: true,
        })
      ).toEqual({ action: 'move', targetDisplayId: 2 });

      // Open on Monitor 2 -> close
      expect(
        resolveShortcutTargetDisplay({
          displays: THREE_DISPLAYS,
          settings: singleMonitor2,
          cursorDisplayId: 3,
          activeDisplayId: 2,
          isPanelOpen: true,
        })
      ).toEqual({ action: 'close', targetDisplayId: 2 });
    });

    it('routes open, move-to-cursor-monitor, and close in all monitors mode', () => {
      const allMonitors: MonitorSettings = { mode: 'all' };

      // Closed + cursor on Monitor 2 -> open on Monitor 2
      expect(
        resolveShortcutTargetDisplay({
          displays: THREE_DISPLAYS,
          settings: allMonitors,
          cursorDisplayId: 2,
          activeDisplayId: 1,
          isPanelOpen: false,
        })
      ).toEqual({ action: 'open', targetDisplayId: 2 });

      // Open on Monitor 1 + cursor on Monitor 2 -> move immediately to Monitor 2
      expect(
        resolveShortcutTargetDisplay({
          displays: THREE_DISPLAYS,
          settings: allMonitors,
          cursorDisplayId: 2,
          activeDisplayId: 1,
          isPanelOpen: true,
        })
      ).toEqual({ action: 'move', targetDisplayId: 2 });

      // Open on Monitor 2 + cursor still on Monitor 2 -> close
      expect(
        resolveShortcutTargetDisplay({
          displays: THREE_DISPLAYS,
          settings: allMonitors,
          cursorDisplayId: 2,
          activeDisplayId: 2,
          isPanelOpen: true,
        })
      ).toEqual({ action: 'close', targetDisplayId: 2 });
    });

    it('falls back safely when cursor is on an excluded monitor in custom mode', () => {
      const customMonitors1And2: MonitorSettings = {
        mode: 'custom',
        enabledDisplayIds: [1, 2],
      };

      // Cursor on enabled Monitor 2 works normally
      expect(
        resolveShortcutTargetDisplay({
          displays: THREE_DISPLAYS,
          settings: customMonitors1And2,
          cursorDisplayId: 2,
          activeDisplayId: 1,
          isPanelOpen: true,
        })
      ).toEqual({ action: 'move', targetDisplayId: 2 });

      // Cursor on excluded Monitor 3 when closed & activeDisplayId is enabled (2) -> open on 2
      expect(
        resolveShortcutTargetDisplay({
          displays: THREE_DISPLAYS,
          settings: customMonitors1And2,
          cursorDisplayId: 3,
          activeDisplayId: 2,
          isPanelOpen: false,
        })
      ).toEqual({ action: 'open', targetDisplayId: 2 });

      // Cursor on excluded Monitor 3 when closed & activeDisplayId is not enabled (3) -> open on first enabled (1)
      expect(
        resolveShortcutTargetDisplay({
          displays: THREE_DISPLAYS,
          settings: customMonitors1And2,
          cursorDisplayId: 3,
          activeDisplayId: 3,
          isPanelOpen: false,
        })
      ).toEqual({ action: 'open', targetDisplayId: 1 });

      // Cursor on excluded Monitor 3 when open on Monitor 2 -> close on Monitor 2
      expect(
        resolveShortcutTargetDisplay({
          displays: THREE_DISPLAYS,
          settings: customMonitors1And2,
          cursorDisplayId: 3,
          activeDisplayId: 2,
          isPanelOpen: true,
        })
      ).toEqual({ action: 'close', targetDisplayId: 2 });
    });

    it('handles empty displays array gracefully', () => {
      expect(
        resolveShortcutTargetDisplay({
          displays: [],
          settings: { mode: 'all' },
          cursorDisplayId: 1,
          activeDisplayId: 1,
          isPanelOpen: false,
        })
      ).toEqual({ action: 'open', targetDisplayId: 1 });

      expect(
        resolveShortcutTargetDisplay({
          displays: [],
          settings: { mode: 'all' },
          cursorDisplayId: 1,
          activeDisplayId: 2,
          isPanelOpen: true,
        })
      ).toEqual({ action: 'close', targetDisplayId: 2 });
    });
  });
});

describe('SettingsView Multi-Monitor Standalone Controls', () => {
  it('renders monitor cards, mode badge, refresh button, and disables edge overrides for excluded monitors', () => {
    const onChangeMonitorSettings = vi.fn();
    const onActivateDisplay = vi.fn();
    const onRefreshDisplays = vi.fn();

    render(
      <SettingsView
        shortcut={defaultShortcut}
        isRecordingHotkey={false}
        onStartRecordingHotkey={vi.fn()}
        onResetHotkey={vi.fn()}
        isPinned={true}
        onTogglePin={vi.fn()}
        showEdgeHandle={true}
        onToggleEdgeHandle={vi.fn()}
        onOpenElectronModal={vi.fn()}
        displays={THREE_DISPLAYS}
        activeDisplayId={1}
        monitorSettings={{
          mode: 'custom',
          enabledDisplayIds: [1, 2],
          edgeOverrides: {},
        }}
        onChangeMonitorSettings={onChangeMonitorSettings}
        onActivateDisplay={onActivateDisplay}
        onRefreshDisplays={onRefreshDisplays}
      />
    );

    expect(screen.getByTestId('active-monitor-mode-badge')).toHaveTextContent(
      '2 of 3 Active'
    );
    expect(screen.getByTestId('multi-monitor-behavior-hint')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('refresh-displays-btn'));
    expect(onRefreshDisplays).toHaveBeenCalledTimes(1);

    // Enabled non-active Monitor 2 shows "Move Here" button and enabled bezel buttons
    fireEvent.click(screen.getByTestId('monitor-move-here-2'));
    expect(onActivateDisplay).toHaveBeenCalledWith(2);
    expect(screen.getByTestId('monitor-edge-left-2')).not.toBeDisabled();

    // Excluded Monitor 3 has disabled bezel override controls and no "Move Here" button
    expect(
      screen.queryByTestId('monitor-move-here-3')
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('monitor-edge-left-3')).toBeDisabled();
    expect(screen.getByTestId('monitor-edge-right-3')).toBeDisabled();
  });
});

describe('App Multi-Monitor Integration Suite', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete window.sideflow;
    vi.restoreAllMocks();
  });

  it('moves #side-panel to Monitor 2 and invokes setMonitorSettings / activateDisplay in Single Monitor mode', async () => {
    const { bridge, spies } = createStatefulSideFlowBridge({
      isElectron: false,
      initialDisplays: simulatedDisplays,
      initialActiveDisplayId: 1,
    });
    window.sideflow = bridge;

    render(<App />);

    const sidePanel = screen.getByTestId('side-panel');
    expect(sidePanel).toHaveAttribute('data-active-display-id', '1');

    openSettingsTab();
    expect(screen.getByTestId('active-monitor-mode-badge')).toHaveTextContent(
      'Primary Only'
    );

    // Switch to Single Monitor mode
    fireEvent.click(screen.getByTestId('monitor-mode-single'));
    await waitFor(() => {
      expect(spies.setMonitorSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'single',
          targetDisplayId: 1,
        })
      );
    });
    expect(screen.getByTestId('monitor-mode-single')).toHaveAttribute(
      'aria-checked',
      'true'
    );

    // Choose Monitor 2 via monitor-select-2
    fireEvent.click(screen.getByTestId('monitor-select-2'));

    await waitFor(() => {
      expect(sidePanel).toHaveAttribute('data-active-display-id', '2');
    });

    expect(spies.setMonitorSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({
        mode: 'single',
        targetDisplayId: 2,
      })
    );
    expect(spies.activateDisplay).toHaveBeenCalledWith(2, true);
    expect(screen.getByTestId('active-monitor-mode-badge')).toHaveTextContent(
      'Monitor 2'
    );
    expect(screen.getByTestId('monitor-active-badge-2')).toHaveTextContent(
      'Open Here'
    );
  });

  it('routes Alt + Space in All Monitors mode to open on cursor monitor, move immediately from Monitor 1 to Monitor 2, and close on second press', async () => {
    const { bridge, spies } = createStatefulSideFlowBridge({
      isElectron: false,
      initialDisplays: simulatedDisplays,
      initialActiveDisplayId: 1,
    });
    window.sideflow = bridge;

    render(<App />);
    const sidePanel = screen.getByTestId('side-panel');

    openSettingsTab();
    fireEvent.click(screen.getByTestId('monitor-mode-all'));

    await waitFor(() => {
      expect(screen.getByTestId('active-monitor-mode-badge')).toHaveTextContent(
        'All Monitors (2)'
      );
    });

    // 1. Close panel while on Monitor 1, move simulated mouse cursor to Monitor 2, press Alt + Space -> opens ONLY on Monitor 2
    fireEvent.click(
      screen.getByRole('button', { name: /Hide to System Tray/i })
    );
    expect(sidePanel).toHaveAttribute('aria-hidden', 'true');

    fireEvent.click(screen.getByTestId('sim-cursor-monitor-2'));
    expect(screen.getByTestId('sim-cursor-monitor-2')).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    pressAltSpace();

    await waitFor(() => {
      expect(sidePanel).toHaveAttribute('aria-hidden', 'false');
      expect(sidePanel).toHaveAttribute('data-active-display-id', '2');
    });
    expect(screen.getByTestId('monitor-active-badge-2')).toBeInTheDocument();
    expect(
      screen.queryByTestId('monitor-active-badge-1')
    ).not.toBeInTheDocument();
    expect(spies.activateDisplay).toHaveBeenLastCalledWith(2, true);

    // 2. Move active panel back to Monitor 1 while keeping it open, then put mouse cursor on Monitor 2 and press Alt + Space -> immediately moves open panel onto Monitor 2
    fireEvent.click(screen.getByTestId('monitor-move-here-1'));
    await waitFor(() => {
      expect(sidePanel).toHaveAttribute('data-active-display-id', '1');
      expect(sidePanel).toHaveAttribute('aria-hidden', 'false');
    });

    fireEvent.click(screen.getByTestId('sim-cursor-monitor-2'));
    expect(sidePanel).toHaveAttribute('data-active-display-id', '1');

    pressAltSpace();

    await waitFor(() => {
      expect(sidePanel).toHaveAttribute('aria-hidden', 'false');
      expect(sidePanel).toHaveAttribute('data-active-display-id', '2');
    });

    // 3. Press Alt + Space again while mouse is still on Monitor 2 -> closes the panel
    pressAltSpace();

    expect(sidePanel).toHaveAttribute('aria-hidden', 'true');
    expect(sidePanel.className).toContain('translate-x-full');
  });

  it('opens SideFlow on Monitor 2 when clicking companion-edge-tab-2', async () => {
    render(<App />);
    const sidePanel = screen.getByTestId('side-panel');

    openSettingsTab();
    fireEvent.click(screen.getByTestId('monitor-mode-all'));

    // Close panel while Monitor 1 is active
    fireEvent.click(
      screen.getByRole('button', { name: /Hide to System Tray/i })
    );
    expect(sidePanel).toHaveAttribute('aria-hidden', 'true');
    expect(sidePanel).toHaveAttribute('data-active-display-id', '1');

    // Companion edge tab is rendered for Monitor 2 (the non-active enabled monitor)
    const companionTab2 = screen.getByTestId('companion-edge-tab-2');
    expect(companionTab2).toHaveTextContent('Click Monitor 2 Right Edge Tab');

    fireEvent.click(companionTab2);

    expect(sidePanel).toHaveAttribute('aria-hidden', 'false');
    expect(sidePanel).toHaveAttribute('data-active-display-id', '2');

    // Now Monitor 1 becomes the companion monitor with its own edge tab
    expect(
      screen.queryByTestId('companion-edge-tab-2')
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('companion-edge-tab-1')).toBeInTheDocument();
  });

  it('supports Selected Monitors (monitor-mode-custom) across 3 displays via getDisplayState, prevents unchecking the last monitor, and enforces excluded-monitor shortcut fallback', async () => {
    const { bridge, spies } = createStatefulSideFlowBridge({
      isElectron: false,
      initialDisplays: THREE_DISPLAYS,
      initialActiveDisplayId: 1,
      includeSetMonitorSettings: false,
    });
    window.sideflow = bridge;

    render(<App />);
    const sidePanel = screen.getByTestId('side-panel');

    await waitFor(() => {
      expect(spies.getDisplayState).toHaveBeenCalledTimes(1);
    });

    openSettingsTab();
    await waitFor(() => {
      expect(screen.getByTestId('monitor-card-3')).toBeInTheDocument();
    });
    expect(screen.getByText('3 displays detected')).toBeInTheDocument();

    // Enable Selected Monitors (custom mode) -> all 3 displays initially enabled
    fireEvent.click(screen.getByTestId('monitor-mode-custom'));
    expect(screen.getByTestId('active-monitor-mode-badge')).toHaveTextContent(
      '3 of 3 Active'
    );

    const toggle1 = screen.getByTestId('monitor-toggle-1') as HTMLInputElement;
    const toggle2 = screen.getByTestId('monitor-toggle-2') as HTMLInputElement;
    const toggle3 = screen.getByTestId('monitor-toggle-3') as HTMLInputElement;

    expect(toggle1.checked).toBe(true);
    expect(toggle2.checked).toBe(true);
    expect(toggle3.checked).toBe(true);

    // Exclude Monitor 3
    fireEvent.click(toggle3);
    expect(toggle3.checked).toBe(false);
    expect(screen.getByTestId('active-monitor-mode-badge')).toHaveTextContent(
      '2 of 3 Active'
    );
    expect(
      screen.queryByTestId('companion-edge-tab-3')
    ).not.toBeInTheDocument();

    // Move panel to enabled Monitor 2, close panel, place cursor on excluded Monitor 3, and press Alt + Space
    await act(async () => {
      fireEvent.click(screen.getByTestId('monitor-move-here-2'));
    });
    expect(sidePanel).toHaveAttribute('data-active-display-id', '2');

    fireEvent.click(
      screen.getByRole('button', { name: /Hide to System Tray/i })
    );
    expect(sidePanel).toHaveAttribute('aria-hidden', 'true');

    fireEvent.click(screen.getByTestId('sim-cursor-monitor-3'));
    await act(async () => {
      pressAltSpace();
    });

    // Opens on fallback enabled Monitor 2 (never on excluded Monitor 3)
    expect(sidePanel).toHaveAttribute('aria-hidden', 'false');
    expect(sidePanel).toHaveAttribute('data-active-display-id', '2');

    // Pressing Alt + Space again with cursor still on excluded Monitor 3 closes panel cleanly
    pressAltSpace();
    expect(sidePanel).toHaveAttribute('aria-hidden', 'true');
    expect(sidePanel).toHaveAttribute('data-active-display-id', '2');

    // Re-open panel and uncheck Monitor 2 (currently active) -> active display migrates to remaining enabled Monitor 1
    fireEvent.click(screen.getByTestId('edge-peek-handle'));
    expect(sidePanel).toHaveAttribute('aria-hidden', 'false');

    fireEvent.click(toggle2);
    expect(toggle2.checked).toBe(false);
    expect(screen.getByTestId('active-monitor-mode-badge')).toHaveTextContent(
      '1 of 3 Active'
    );
    expect(sidePanel).toHaveAttribute('data-active-display-id', '1');

    // Last remaining enabled monitor (Monitor 1) cannot be unchecked
    expect(toggle1).toBeDisabled();
    fireEvent.click(toggle1);
    expect(toggle1.checked).toBe(true);
    expect(screen.getByTestId('active-monitor-mode-badge')).toHaveTextContent(
      '1 of 3 Active'
    );
  });

  it('applies per-monitor bezel edge overrides, 1-click Outer Bezels, Backup JSON import, and Reset Defaults', async () => {
    const { bridge, spies } = createStatefulSideFlowBridge({
      isElectron: false,
      initialDisplays: simulatedDisplays,
      initialActiveDisplayId: 1,
    });
    window.sideflow = bridge;

    render(<App />);
    const sidePanel = screen.getByTestId('side-panel');
    const edgePeekHandle = screen.getByTestId('edge-peek-handle');

    // Default global edge is right
    expect(sidePanel).toHaveAttribute('data-effective-edge', 'right');
    expect(sidePanel.className).toContain('right-0');
    expect(edgePeekHandle.className).toContain('right-0');

    openSettingsTab();
    fireEvent.click(screen.getByTestId('monitor-mode-all'));

    // Set Monitor 1 -> Left edge, Monitor 2 -> Right edge
    fireEvent.click(screen.getByTestId('monitor-edge-left-1'));
    fireEvent.click(screen.getByTestId('monitor-edge-right-2'));

    expect(screen.getByTestId('monitor-bezel-indicator-1')).toHaveAttribute(
      'data-edge',
      'left'
    );
    expect(screen.getByTestId('monitor-bezel-indicator-2')).toHaveAttribute(
      'data-edge',
      'right'
    );

    // Active display is Monitor 1 -> #side-panel and #edge-peek-handle immediately switch to left edge
    expect(sidePanel).toHaveAttribute('data-active-display-id', '1');
    expect(sidePanel).toHaveAttribute('data-effective-edge', 'left');
    expect(sidePanel.className).toContain('left-0');
    expect(edgePeekHandle.className).toContain('left-0');
    expect(screen.getByTestId('companion-edge-tab-2')).toHaveTextContent(
      'Click Monitor 2 Right Edge Tab'
    );

    // Move to Monitor 2 -> #side-panel and #edge-peek-handle dynamically switch to right edge
    fireEvent.click(screen.getByTestId('monitor-move-here-2'));
    await waitFor(() => {
      expect(sidePanel).toHaveAttribute('data-active-display-id', '2');
    });
    expect(sidePanel).toHaveAttribute('data-effective-edge', 'right');
    expect(sidePanel.className).toContain('right-0');
    expect(edgePeekHandle.className).toContain('right-0');
    expect(screen.getByTestId('companion-edge-tab-1')).toHaveTextContent(
      'Click Monitor 1 Left Edge Tab'
    );

    // Clear overrides via "Use Default Edges", then test 1-click "Use Outer Bezels"
    fireEvent.click(screen.getByTestId('clear-edge-overrides-btn'));
    fireEvent.click(screen.getByTestId('monitor-move-here-1'));
    await waitFor(() => {
      expect(sidePanel).toHaveAttribute('data-active-display-id', '1');
    });
    expect(sidePanel).toHaveAttribute('data-effective-edge', 'right');

    fireEvent.click(screen.getByTestId('use-outer-bezels-btn'));
    expect(screen.getByTestId('monitor-bezel-indicator-1')).toHaveAttribute(
      'data-edge',
      'left'
    );
    expect(screen.getByTestId('monitor-bezel-indicator-2')).toHaveAttribute(
      'data-edge',
      'right'
    );
    expect(sidePanel).toHaveAttribute('data-effective-edge', 'left');
    expect(edgePeekHandle.className).toContain('left-0');

    // Import Backup JSON restoring Single Monitor 2 with left edge override
    const backupPayload = JSON.stringify({
      version: '1.0.0',
      monitorSettings: {
        mode: 'single',
        targetDisplayId: 2,
        enabledDisplayIds: [2],
        edgeOverrides: { '2': 'left' },
      },
    });
    const backupFile = new File([backupPayload], 'sideflow-backup.json', {
      type: 'application/json',
    });

    fireEvent.change(screen.getByTestId('import-backup-input'), {
      target: { files: [backupFile] },
    });

    await waitFor(() => {
      expect(screen.getByTestId('active-monitor-mode-badge')).toHaveTextContent(
        'Monitor 2'
      );
      expect(sidePanel).toHaveAttribute('data-active-display-id', '2');
      expect(sidePanel).toHaveAttribute('data-effective-edge', 'left');
    });

    expect(spies.setMonitorSettings).toHaveBeenCalledWith({
      mode: 'single',
      targetDisplayId: 2,
      enabledDisplayIds: [2],
      edgeOverrides: { '2': 'left' },
    });

    // Click Reset Defaults -> confirm alertdialog -> restores defaultMonitorSettings (Primary Only, Monitor 1, Right Edge)
    fireEvent.click(screen.getByRole('button', { name: /Reset Defaults/i }));
    fireEvent.click(screen.getByTestId('confirm-reset-defaults-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('active-monitor-mode-badge')).toHaveTextContent(
        'Primary Only'
      );
      expect(sidePanel).toHaveAttribute('data-active-display-id', '1');
      expect(sidePanel).toHaveAttribute('data-effective-edge', 'right');
    });

    expect(screen.getByTestId('monitor-mode-primary')).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(
      screen.queryByTestId('clear-edge-overrides-btn')
    ).not.toBeInTheDocument();
    expect(
      JSON.parse(
        window.localStorage.getItem('sideflow_monitor_settings') || '{}'
      )
    ).toEqual(defaultMonitorSettings);
    expect(spies.setMonitorSettings).toHaveBeenLastCalledWith(
      defaultMonitorSettings
    );
  });

  it('reacts to Electron onDisplayStateChanged hotplug events and syncs setEdgeHandleState', async () => {
    const { bridge, spies, emitDisplayStateChanged } =
      createStatefulSideFlowBridge({
        isElectron: true,
        initialDisplays: simulatedDisplays,
        initialActiveDisplayId: 1,
      });
    window.sideflow = bridge;

    render(<App />);
    const sidePanel = screen.getByTestId('side-panel');

    expect(spies.setEdgeHandleState).toHaveBeenCalledWith({
      showEdgeHandle: true,
      isDictating: false,
      shortcutLabel: 'Alt + Space',
    });

    openSettingsTab();

    // Simulate docking a 3rd monitor and Electron activating Monitor 3 in All Monitors mode
    act(() => {
      emitDisplayStateChanged({
        displays: THREE_DISPLAYS,
        activeDisplayId: 3,
        effectiveEdge: 'left',
        monitorSettings: {
          mode: 'all',
          targetDisplayId: null,
          enabledDisplayIds: [],
          edgeOverrides: { '3': 'left' },
        },
      });
    });

    await waitFor(() => {
      expect(sidePanel).toHaveAttribute('data-active-display-id', '3');
      expect(sidePanel).toHaveAttribute('data-effective-edge', 'left');
      expect(screen.getByTestId('active-monitor-mode-badge')).toHaveTextContent(
        'All Monitors (3)'
      );
    });

    // Toggling Show Screen-Edge Peek Handle syncs companion edge handle state over IPC
    fireEvent.click(screen.getByLabelText(/Show Screen-Edge Peek Handle/i));
    expect(spies.setEdgeHandleState).toHaveBeenLastCalledWith({
      showEdgeHandle: false,
      isDictating: false,
      shortcutLabel: 'Alt + Space',
    });
  });
});
