import React, { useRef, useState } from 'react';
import {
  Keyboard,
  Cpu,
  Code,
  Download,
  Upload,
  RotateCcw,
  Maximize2,
  Monitor,
  RefreshCw,
  CheckCircle2,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';
import {
  AppUpdateState,
  DockHoverEffect,
  DockIconSize,
  MonitorDisplayInfo,
  MonitorMode,
  MonitorSettings,
  PanelEdge,
  ShortcutConfig,
} from '../../types/sideflow';
import {
  defaultMonitorSettings,
  defaultShortcut,
  DEFAULT_PANEL_WIDTH_PERCENT,
  MIN_PANEL_WIDTH_PERCENT,
  MAX_PANEL_WIDTH_PERCENT,
  PANEL_WIDTH_PRESETS,
  clampPanelWidthPercent,
  resolveEffectiveEdge,
  resolveEnabledDisplays,
  sanitizeMonitorSettings,
  simulatedDisplays,
} from '../../utils/defaults';
import { Modal } from '../Modal';

type SettingsCategory = 'all' | 'shortcuts' | 'monitors' | 'dock' | 'system';

const MONITOR_MODE_OPTIONS = [
  { id: 'primary', label: 'Primary Only' },
  { id: 'single', label: 'Single Monitor' },
  { id: 'all', label: 'All Monitors' },
  { id: 'custom', label: 'Selected Monitors' },
] as const;

const PILL_SWITCH_TRACK_CLASS =
  "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-slate-800 border border-slate-700 transition-colors peer-checked:bg-indigo-600 peer-checked:border-indigo-500 peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-400 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-slate-950 peer-disabled:opacity-45 after:content-[''] after:h-3.5 after:w-3.5 after:translate-x-0.5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4";

interface SettingsViewProps {
  shortcut: ShortcutConfig;
  isRecordingHotkey: boolean;
  onStartRecordingHotkey: () => void;
  onResetHotkey: () => void;
  isPinned: boolean;
  onTogglePin: (forcePin?: boolean) => void;
  showEdgeHandle: boolean;
  onToggleEdgeHandle: (show: boolean) => void;
  openAtLogin?: boolean;
  onToggleOpenAtLogin?: (enabled: boolean) => void;
  updateState?: AppUpdateState;
  onCheckForUpdates?: () => void;
  onInstallUpdate?: () => void;
  panelEdge?: PanelEdge;
  onChangePanelEdge?: (edge: PanelEdge) => void;
  panelWidthPercent?: number;
  onChangePanelWidthPercent?: (percent: number) => void;
  displays?: MonitorDisplayInfo[];
  activeDisplayId?: number;
  monitorSettings?: MonitorSettings;
  onChangeMonitorSettings?: (
    next: MonitorSettings,
    toastTitle?: string,
    toastSub?: string
  ) => void;
  onActivateDisplay?: (displayId: number) => void;
  onRefreshDisplays?: () => void;
  dockEffect?: DockHoverEffect;
  onChangeDockEffect?: (effect: DockHoverEffect) => void;
  dockIconSize?: DockIconSize;
  onChangeDockIconSize?: (size: DockIconSize) => void;
  isDockLocked?: boolean;
  onToggleDockLock?: (locked: boolean) => void;
  isElectron?: boolean;
  countsSummary?: {
    drawers: number;
    apps: number;
    diagrams: number;
    notes: number;
  };
  onOpenElectronModal: () => void;
  onExportBackup?: () => void;
  onImportBackup?: (rawJson: string) => void;
  onResetAllData?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  shortcut,
  isRecordingHotkey,
  onStartRecordingHotkey,
  onResetHotkey,
  isPinned,
  onTogglePin,
  showEdgeHandle,
  onToggleEdgeHandle,
  openAtLogin = true,
  onToggleOpenAtLogin,
  updateState,
  onCheckForUpdates,
  onInstallUpdate,
  panelEdge = 'right',
  onChangePanelEdge,
  panelWidthPercent = DEFAULT_PANEL_WIDTH_PERCENT,
  onChangePanelWidthPercent,
  displays = simulatedDisplays,
  activeDisplayId,
  monitorSettings = defaultMonitorSettings,
  onChangeMonitorSettings,
  onActivateDisplay,
  onRefreshDisplays,
  dockEffect = 'zoom',
  onChangeDockEffect,
  dockIconSize = 'normal',
  onChangeDockIconSize,
  isDockLocked = false,
  onToggleDockLock,
  isElectron,
  countsSummary,
  onOpenElectronModal,
  onExportBackup,
  onImportBackup,
  onResetAllData,
}) => {
  const backupFileInputRef = useRef<HTMLInputElement>(null);
  const monitorRadioRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const cancelResetBtnRef = useRef<HTMLButtonElement>(null);
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('all');
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);

  const runningInElectron = isElectron ?? Boolean(window.sideflow?.isElectron);
  const showSection = (cat: Exclude<SettingsCategory, 'all'>) =>
    activeCategory === 'all' || activeCategory === cat;
  const safeMonitorSettings = sanitizeMonitorSettings(monitorSettings);
  const safeDisplays = displays.length > 0 ? displays : simulatedDisplays;
  const enabledDisplays = resolveEnabledDisplays(
    safeDisplays,
    safeMonitorSettings
  );
  const enabledDisplayIds = new Set(enabledDisplays.map((d) => d.id));
  const resolvedActiveDisplayId =
    activeDisplayId ?? enabledDisplays[0]?.id ?? safeDisplays[0]?.id;
  const hasEdgeOverrides =
    Object.keys(safeMonitorSettings.edgeOverrides ?? {}).length > 0;

  const activeModeBadgeText = (() => {
    switch (safeMonitorSettings.mode) {
      case 'primary':
        return 'Primary Only';
      case 'single': {
        const chosen = safeDisplays.find(
          (d) => d.id === safeMonitorSettings.targetDisplayId
        );
        return chosen ? `Monitor ${chosen.index}` : 'Single Monitor';
      }
      case 'all':
        return `All Monitors (${safeDisplays.length})`;
      case 'custom':
        return `${enabledDisplays.length} of ${safeDisplays.length} Active`;
      default:
        return 'Primary Only';
    }
  })();

  const handleSelectMonitorMode = (nextMode: MonitorMode) => {
    if (!onChangeMonitorSettings) return;
    if (nextMode === 'primary') {
      onChangeMonitorSettings(
        { ...safeMonitorSettings, mode: 'primary' },
        'Monitor Routing: Primary Only',
        'SideFlow stays on your primary OS display'
      );
      return;
    }
    if (nextMode === 'single') {
      const targetId =
        safeMonitorSettings.targetDisplayId ??
        resolvedActiveDisplayId ??
        (safeDisplays.find((d) => d.isPrimary) ?? safeDisplays[0]).id;
      const chosen = safeDisplays.find((d) => d.id === targetId);
      onChangeMonitorSettings(
        {
          ...safeMonitorSettings,
          mode: 'single',
          targetDisplayId: targetId,
        },
        `Pinned to Monitor ${chosen?.index ?? 1}`,
        chosen ? `${chosen.label} (${chosen.bounds.width}×${chosen.bounds.height})` : 'Dedicated single-screen mode'
      );
      return;
    }
    if (nextMode === 'all') {
      onChangeMonitorSettings(
        { ...safeMonitorSettings, mode: 'all' },
        `Enabled on All ${safeDisplays.length} Monitors`,
        'Opens on the screen under your mouse via shortcut or edge tab'
      );
      return;
    }
    // 'custom'
    const currentEnabled = safeMonitorSettings.enabledDisplayIds ?? [];
    const validIds = currentEnabled.filter((id) =>
      safeDisplays.some((d) => d.id === id)
    );
    const nextEnabledIds =
      validIds.length > 0 ? validIds : safeDisplays.map((d) => d.id);
    onChangeMonitorSettings(
      {
        ...safeMonitorSettings,
        mode: 'custom',
        enabledDisplayIds: nextEnabledIds,
      },
      'Custom Multi-Monitor Selection',
      `${nextEnabledIds.length} monitors enabled • Opens at mouse cursor`
    );
  };

  const handleSetDisplayEdgeOverride = (
    display: MonitorDisplayInfo,
    choice: 'default' | PanelEdge
  ) => {
    if (!onChangeMonitorSettings) return;
    const nextOverrides = { ...(safeMonitorSettings.edgeOverrides ?? {}) };
    if (choice === 'default') {
      delete nextOverrides[String(display.id)];
      onChangeMonitorSettings(
        { ...safeMonitorSettings, edgeOverrides: nextOverrides },
        `Monitor ${display.index}: Default Edge`,
        `Following global ${panelEdge === 'left' ? 'Left' : 'Right'} Edge setting`
      );
    } else {
      nextOverrides[String(display.id)] = choice;
      onChangeMonitorSettings(
        { ...safeMonitorSettings, edgeOverrides: nextOverrides },
        `Monitor ${display.index}: ${choice === 'left' ? 'Left' : 'Right'} Edge`,
        'Saved per-monitor bezel edge override'
      );
    }
  };

  const handleUseOuterBezels = () => {
    if (!onChangeMonitorSettings || safeDisplays.length < 2) return;
    const bezelPool =
      enabledDisplays.length >= 2 ? enabledDisplays : safeDisplays;
    const leftmost = bezelPool[0];
    const rightmost = bezelPool[bezelPool.length - 1];
    const nextOverrides: Record<string, PanelEdge> = {
      ...(safeMonitorSettings.edgeOverrides ?? {}),
      [String(leftmost.id)]: 'left',
      [String(rightmost.id)]: 'right',
    };
    onChangeMonitorSettings(
      { ...safeMonitorSettings, edgeOverrides: nextOverrides },
      'Applied Outer-Bezel Layout',
      `Monitor ${leftmost.index} → Left Edge • Monitor ${rightmost.index} → Right Edge`
    );
  };

  const handleImportFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file || !onImportBackup) return;
    try {
      if (typeof file.text === 'function') {
        const text = await file.text();
        onImportBackup(text);
      } else {
        const reader = new FileReader();
        reader.onload = () => {
          onImportBackup(String(reader.result || ''));
        };
        reader.readAsText(file);
      }
    } catch {
      onImportBackup('');
    }
  };

  return (
    <section
      id="tab-settings"
      aria-label="Shortcut & Tray Settings"
      className="tab-content flex-1 overflow-y-auto p-4 space-y-4"
    >
      {/* Sticky Settings Category Filter Pills (De-bloats 1,600px vertical scroll while showing All by default) */}
      <div
        role="group"
        aria-label="Settings Categories"
        data-testid="settings-category-bar"
        className="sticky -top-4 -mx-4 px-4 py-2.5 z-20 bg-slate-900/95 backdrop-blur-md border-b border-slate-800/80 flex items-center gap-1.5 overflow-x-auto"
      >
        {(
          [
            { id: 'all', label: 'All' },
            { id: 'shortcuts', label: 'Shortcuts & Tray' },
            { id: 'monitors', label: 'Monitors & Size' },
            { id: 'dock', label: 'Dock Style' },
            { id: 'system', label: 'Updates & Backup' },
          ] as const
        ).map((cat) => {
          const isActive = activeCategory === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              data-testid={`settings-cat-${cat.id}`}
              aria-pressed={isActive}
              onClick={() => setActiveCategory(cat.id)}
              className={`min-h-[28px] px-2.5 py-1 rounded-xl text-[11px] font-medium whitespace-nowrap transition border ${
                isActive
                  ? 'bg-indigo-600 text-white border-indigo-400/60 shadow-sm'
                  : 'bg-slate-950/80 hover:bg-slate-800 text-slate-300 border-slate-800'
              }`}
            >
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Global Toggle Shortcut */}
      {showSection('shortcuts') && (
        <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
                Global Toggle Shortcut
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Slide the panel open or closed at any time
              </p>
            </div>
            <span
              id="current-shortcut-pill"
              data-testid="current-shortcut-pill"
              className="px-3 py-1 rounded-lg bg-indigo-500/20 border border-indigo-500/40 font-mono text-xs text-indigo-300 font-semibold shrink-0"
            >
              {shortcut.label || defaultShortcut.label}
            </span>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              id="record-hotkey-btn"
              aria-pressed={isRecordingHotkey}
              onClick={onStartRecordingHotkey}
              className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-medium text-white transition flex items-center justify-center gap-2 ${
                isRecordingHotkey
                  ? 'bg-rose-600 hover:bg-rose-500'
                  : 'bg-indigo-600 hover:bg-indigo-500'
              }`}
            >
              <Keyboard className="w-4 h-4" aria-hidden="true" />
              <span id="record-hotkey-label" aria-live="polite">
                {isRecordingHotkey
                  ? 'Press any key combo now (e.g. Ctrl + Space, Alt + Q)...'
                  : 'Click & Press New Shortcut Combo'}
              </span>
            </button>
            <button
              type="button"
              onClick={onResetHotkey}
              className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 transition"
            >
              Reset
            </button>
          </div>
        </div>
      )}

      {/* Panel Behavior Settings */}
      {showSection('shortcuts') && (
        <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3">
          <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
            Side Panel &amp; Tray Preferences
          </h3>

          <label className="flex items-center justify-between gap-3 py-1.5 cursor-pointer">
            <div>
              <div className="text-xs font-medium text-slate-200">
                Auto-Hide When Clicking Outside
              </div>
              <div className="text-[11px] text-slate-400">
                Smoothly retract panel when you focus another desktop window
              </div>
            </div>
            <input
              type="checkbox"
              id="setting-autohide"
              checked={!isPinned}
              onChange={(e) => onTogglePin(!e.target.checked)}
              className="sr-only peer"
            />
            <span aria-hidden="true" className={PILL_SWITCH_TRACK_CLASS} />
          </label>

          <label className="flex items-center justify-between gap-3 py-1.5 cursor-pointer border-t border-slate-800/80 pt-3">
            <div>
              <div className="text-xs font-medium text-slate-200">
                Show Screen-Edge Peek Handle
              </div>
              <div className="text-[11px] text-slate-400">
                Keep a subtle tab on enabled monitor edges when minimized to tray
              </div>
            </div>
            <input
              type="checkbox"
              id="setting-edge-handle"
              checked={showEdgeHandle}
              onChange={(e) => onToggleEdgeHandle(e.target.checked)}
              className="sr-only peer"
            />
            <span aria-hidden="true" className={PILL_SWITCH_TRACK_CLASS} />
          </label>

          <label className="flex items-center justify-between gap-3 py-1.5 cursor-pointer border-t border-slate-800/80 pt-3">
            <div>
              <div className="text-xs font-medium text-slate-200">
                Start SideFlow Automatically at Login
              </div>
              <div className="text-[11px] text-slate-400">
                Launch quietly into the System Tray when you sign in to your work laptop (no admin needed)
              </div>
            </div>
            <input
              type="checkbox"
              id="setting-open-at-login"
              data-testid="setting-open-at-login"
              checked={openAtLogin}
              onChange={(e) => onToggleOpenAtLogin?.(e.target.checked)}
              className="sr-only peer"
            />
            <span aria-hidden="true" className={PILL_SWITCH_TRACK_CLASS} />
          </label>
        </div>
      )}

      {/* Multi-Monitor Display & Screen Routing */}
      {showSection('monitors') && (
        <div
          data-testid="multi-monitor-settings-card"
          className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-1.5">
                <Monitor
                  className="w-3.5 h-3.5 text-indigo-400 shrink-0"
                  aria-hidden="true"
                />
                <span>Multi-Monitor Display &amp; Screen Routing</span>
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Choose which screen SideFlow uses, or enable multiple monitors so it only opens on the monitor under your mouse via shortcut or edge tab
              </p>
            </div>
            <div className="shrink-0 flex items-center gap-1.5">
              <span
                data-testid="active-monitor-mode-badge"
                className="px-2.5 py-1 rounded-lg bg-indigo-500/20 border border-indigo-500/40 font-mono text-[11px] text-indigo-300 font-semibold whitespace-nowrap"
              >
                {activeModeBadgeText}
              </span>
              {onRefreshDisplays && (
                <button
                  type="button"
                  data-testid="refresh-displays-btn"
                  aria-label="Refresh connected displays"
                  title="Refresh connected displays"
                  onClick={onRefreshDisplays}
                  className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 transition"
                >
                  <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>

          {/* 4-Mode Selector Grid with WAI-ARIA Radio Group Roving Tabindex & Arrow Keys */}
          <div
            role="radiogroup"
            aria-label="Monitor Routing Mode"
            className="grid grid-cols-[repeat(auto-fit,minmax(112px,1fr))] gap-1.5"
          >
            {MONITOR_MODE_OPTIONS.map((opt, idx) => {
              const isSelected = safeMonitorSettings.mode === opt.id;
              return (
                <button
                  key={opt.id}
                  ref={(el) => {
                    monitorRadioRefs.current[idx] = el;
                  }}
                  type="button"
                  role="radio"
                  tabIndex={isSelected ? 0 : -1}
                  data-testid={`monitor-mode-${opt.id}`}
                  aria-checked={isSelected}
                  onClick={() => handleSelectMonitorMode(opt.id)}
                  onKeyDown={(e) => {
                    const count = MONITOR_MODE_OPTIONS.length;
                    let nextIdx: number | null = null;
                    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                      nextIdx = (idx + 1) % count;
                    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                      nextIdx = (idx - 1 + count) % count;
                    } else if (e.key === 'Home') {
                      nextIdx = 0;
                    } else if (e.key === 'End') {
                      nextIdx = count - 1;
                    }
                    if (nextIdx !== null) {
                      e.preventDefault();
                      handleSelectMonitorMode(MONITOR_MODE_OPTIONS[nextIdx].id);
                      monitorRadioRefs.current[nextIdx]?.focus();
                    }
                  }}
                  className={`min-h-[32px] px-2.5 py-1.5 rounded-xl text-xs font-medium transition border text-center ${
                    isSelected
                      ? 'bg-indigo-600 text-white border-indigo-400/60 shadow-sm'
                      : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Quick Bezel Helpers for 2+ Monitors */}
          {(safeDisplays.length >= 2 || hasEdgeOverrides) && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
              <span className="text-[11px] text-slate-400">
                {safeDisplays.length} displays detected
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {safeDisplays.length >= 2 && (
                  <button
                    type="button"
                    data-testid="use-outer-bezels-btn"
                    onClick={handleUseOuterBezels}
                    className="min-h-[26px] px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[11px] text-indigo-300 font-medium transition"
                  >
                    Use Outer Bezels
                  </button>
                )}
                {hasEdgeOverrides && (
                  <button
                    type="button"
                    data-testid="clear-edge-overrides-btn"
                    onClick={() =>
                      onChangeMonitorSettings?.(
                        { ...safeMonitorSettings, edgeOverrides: {} },
                        'Cleared Edge Overrides',
                        `All monitors now follow ${
                          panelEdge === 'left' ? 'Left' : 'Right'
                        } Edge`
                      )
                    }
                    className="min-h-[26px] px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[11px] text-slate-300 transition"
                  >
                    Use Default Edges
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Connected Monitors Grid */}
          <div
            data-testid="monitor-display-list"
            className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-2.5"
          >
            {safeDisplays.map((display) => {
              const isEnabled = enabledDisplayIds.has(display.id);
              const isOpenHere = display.id === resolvedActiveDisplayId;
              const effectiveEdge = resolveEffectiveEdge(
                display.id,
                safeMonitorSettings,
                panelEdge
              );
              const overrideVal =
                safeMonitorSettings.edgeOverrides?.[String(display.id)];
              const isLastEnabledInCustom =
                safeMonitorSettings.mode === 'custom' &&
                isEnabled &&
                enabledDisplays.length <= 1;

              return (
                <div
                  key={display.id}
                  data-testid={`monitor-card-${display.id}`}
                  className={`p-3 rounded-xl border space-y-2.5 transition ${
                    isOpenHere
                      ? 'bg-slate-900/95 border-indigo-500/50 ring-1 ring-indigo-500/20'
                      : isEnabled
                      ? 'bg-slate-900/80 border-slate-700/80 hover:border-slate-600'
                      : 'bg-slate-950/60 border-slate-800/80 opacity-80'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {/* 16:10 Mini-Monitor Visual Bezel Thumbnail */}
                      <div
                        aria-hidden="true"
                        className="w-11 h-7 rounded-md bg-slate-950 border border-slate-700 relative overflow-hidden shrink-0 flex items-center justify-center"
                      >
                        <span className="text-[10px] font-mono text-slate-300">
                          {display.index}
                        </span>
                        <span
                          data-testid={`monitor-bezel-indicator-${display.id}`}
                          data-edge={effectiveEdge}
                          className={`absolute inset-y-1 w-1 rounded-full ${
                            effectiveEdge === 'left' ? 'left-0.5' : 'right-0.5'
                          } ${
                            isOpenHere
                              ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]'
                              : isEnabled
                              ? 'bg-indigo-400 shadow-[0_0_6px_rgba(129,140,248,0.85)]'
                              : 'bg-slate-700'
                          }`}
                        />
                      </div>

                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-white truncate">
                          Monitor {display.index}
                        </div>
                        <div
                          className="text-[11px] text-slate-300 truncate"
                          title={display.label}
                        >
                          {display.label}
                        </div>
                      </div>
                    </div>

                    {/* Selection / Move Controls */}
                    <div className="shrink-0 flex items-center gap-1.5">
                      {safeMonitorSettings.mode === 'custom' ? (
                        <label
                          className={`inline-flex items-center cursor-pointer ${
                            isLastEnabledInCustom ? 'cursor-not-allowed' : ''
                          }`}
                          title={
                            isLastEnabledInCustom
                              ? 'At least one monitor must remain enabled'
                              : `Toggle SideFlow on Monitor ${display.index}`
                          }
                        >
                          <input
                            type="checkbox"
                            data-testid={`monitor-toggle-${display.id}`}
                            aria-label={`Enable SideFlow on Monitor ${display.index}`}
                            checked={isEnabled}
                            disabled={isLastEnabledInCustom}
                            onChange={(e) => {
                              if (!onChangeMonitorSettings) return;
                              const curr = new Set(
                                enabledDisplays.map((d) => d.id)
                              );
                              if (e.target.checked) {
                                curr.add(display.id);
                              } else if (curr.size > 1) {
                                curr.delete(display.id);
                              }
                              const nextIds = Array.from(curr);
                              onChangeMonitorSettings(
                                {
                                  ...safeMonitorSettings,
                                  mode: 'custom',
                                  enabledDisplayIds: nextIds,
                                },
                                e.target.checked
                                  ? `Enabled Monitor ${display.index}`
                                  : `Excluded Monitor ${display.index}`,
                                `${nextIds.length} of ${safeDisplays.length} monitors active`
                              );
                            }}
                            className="sr-only peer"
                          />
                          <span
                            aria-hidden="true"
                            className={PILL_SWITCH_TRACK_CLASS}
                          />
                        </label>
                      ) : safeMonitorSettings.mode === 'single' ||
                        safeMonitorSettings.mode === 'primary' ? (
                        <button
                          type="button"
                          data-testid={`monitor-select-${display.id}`}
                          aria-label={`Select Monitor ${display.index}`}
                          aria-pressed={isEnabled}
                          onClick={() => {
                            onChangeMonitorSettings?.(
                              {
                                ...safeMonitorSettings,
                                mode: 'single',
                                targetDisplayId: display.id,
                              },
                              `Moved SideFlow to Monitor ${display.index}`,
                              `${display.label} (${display.bounds.width}×${display.bounds.height})`
                            );
                            onActivateDisplay?.(display.id);
                          }}
                          className={`min-h-[26px] px-2 py-1 rounded-lg text-[11px] font-medium border transition ${
                            isEnabled
                              ? 'bg-indigo-600/25 border-indigo-400/60 text-indigo-200'
                              : 'bg-slate-950 hover:bg-slate-800 border-slate-700 text-slate-300'
                          }`}
                        >
                          {isEnabled ? 'Selected' : 'Use Screen'}
                        </button>
                      ) : null}

                      {isEnabled && !isOpenHere && onActivateDisplay && (
                        <button
                          type="button"
                          data-testid={`monitor-move-here-${display.id}`}
                          aria-label={`Move SideFlow to Monitor ${display.index}`}
                          onClick={() => onActivateDisplay(display.id)}
                          className="min-h-[26px] px-2 py-1 rounded-lg bg-slate-950 hover:bg-indigo-600 border border-slate-700 hover:border-indigo-400/60 text-[11px] text-slate-200 hover:text-white transition"
                        >
                          Move Here
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Badges & Resolution Row */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {isOpenHere && (
                      <span
                        data-testid={`monitor-active-badge-${display.id}`}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-semibold text-emerald-300"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        Open Here
                      </span>
                    )}
                    {display.isPrimary && (
                      <span className="px-1.5 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-[10px] font-medium text-amber-300">
                        Primary
                      </span>
                    )}
                    <span className="text-[11px] font-mono text-slate-300">
                      {display.bounds.width}×{display.bounds.height}
                      {display.scaleFactor && display.scaleFactor !== 1
                        ? ` • ${Math.round(display.scaleFactor * 100)}%`
                        : ''}
                    </span>
                  </div>

                  {/* Per-Monitor Left / Right Bezel Edge Override */}
                  <div
                    className={`pt-2 border-t border-slate-800/80 space-y-1 ${
                      !isEnabled ? 'opacity-60 pointer-events-none' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span>Bezel Edge</span>
                      <span className="font-mono text-slate-400">
                        {overrideVal
                          ? `Custom (${overrideVal === 'left' ? 'Left' : 'Right'})`
                          : `Default (${panelEdge === 'left' ? 'Left' : 'Right'})`}
                      </span>
                    </div>
                    <div
                      role="group"
                      aria-label={`Bezel edge override for Monitor ${display.index}`}
                      className="grid grid-cols-3 gap-1 p-0.5 rounded-lg bg-slate-950 border border-slate-800"
                    >
                      {(
                        [
                          { id: 'default', label: 'Default' },
                          { id: 'left', label: 'Left' },
                          { id: 'right', label: 'Right' },
                        ] as const
                      ).map((seg) => {
                        const isSegActive = (overrideVal ?? 'default') === seg.id;
                        return (
                          <button
                            key={seg.id}
                            type="button"
                            data-testid={`monitor-edge-${seg.id}-${display.id}`}
                            aria-pressed={isSegActive}
                            disabled={!isEnabled}
                            onClick={() =>
                              handleSetDisplayEdgeOverride(display, seg.id)
                            }
                            className={`min-h-[26px] py-1 px-1.5 rounded-md text-[11px] font-medium transition text-center ${
                              isSegActive
                                ? 'bg-indigo-600 text-white shadow-sm'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                            }`}
                          >
                            {seg.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {(safeMonitorSettings.mode === 'all' ||
            safeMonitorSettings.mode === 'custom') && (
            <div
              data-testid="multi-monitor-behavior-hint"
              className="px-3 py-2 rounded-xl bg-indigo-950/35 border border-indigo-500/25 text-[11px] text-slate-300 leading-relaxed"
            >
              <strong className="text-indigo-300 font-semibold">
                Follow-Mouse Multi-Monitor Active:
              </strong>{' '}
              Subtle edge tabs appear on each enabled screen. Pressing{' '}
              <code className="font-mono text-indigo-300">
                {shortcut.label || defaultShortcut.label}
              </code>{' '}
              or clicking a monitor&apos;s edge tab opens SideFlow only on that
              monitor.
            </div>
          )}
        </div>
      )}

      {/* Screen Presence & Extended Panel Size */}
      {showSection('monitors') && (
        <div
          data-testid="screen-presence-settings-card"
          className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-1.5">
                <Maximize2 className="w-3.5 h-3.5 text-indigo-400" aria-hidden="true" />
                <span>Screen Presence (Extended Panel Size)</span>
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Set the percentage of screen width used when extended, or drag the inner panel border to resize on the fly
              </p>
            </div>
            <span
              id="panel-width-percent-badge"
              data-testid="panel-width-percent-badge"
              className="px-2.5 py-1 rounded-lg bg-indigo-500/20 border border-indigo-500/40 font-mono text-xs text-indigo-300 font-semibold whitespace-nowrap"
            >
              {panelWidthPercent}%
            </span>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <input
              type="range"
              id="setting-panel-width-slider"
              data-testid="setting-panel-width-slider"
              aria-label="Extended Panel Screen Percentage"
              min={MIN_PANEL_WIDTH_PERCENT}
              max={MAX_PANEL_WIDTH_PERCENT}
              step={1}
              value={panelWidthPercent}
              onChange={(e) =>
                onChangePanelWidthPercent?.(clampPanelWidthPercent(e.target.value))
              }
              className="flex-1 h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
            <div className="flex items-center gap-1 bg-slate-900 border border-slate-700 rounded-xl px-2 py-1">
              <input
                type="number"
                id="setting-panel-width-number"
                data-testid="setting-panel-width-number"
                aria-label="Extended Panel Width Percentage Input"
                min={MIN_PANEL_WIDTH_PERCENT}
                max={MAX_PANEL_WIDTH_PERCENT}
                value={panelWidthPercent}
                onChange={(e) => {
                  const raw = Number(e.target.value);
                  if (Number.isFinite(raw)) {
                    onChangePanelWidthPercent?.(clampPanelWidthPercent(raw));
                  }
                }}
                className="w-11 bg-transparent text-xs font-mono text-white text-right focus:outline-none"
              />
              <span className="text-xs font-mono text-slate-400">%</span>
            </div>
          </div>

          <div
            role="group"
            aria-label="Screen Presence Presets"
            className="flex flex-wrap items-center justify-between gap-1.5 pt-1"
          >
            <span className="text-[11px] text-slate-400">Quick Presets:</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {PANEL_WIDTH_PRESETS.map((preset) => {
                const isSelected = panelWidthPercent === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    data-testid={`panel-width-preset-${preset}`}
                    aria-pressed={isSelected}
                    onClick={() => onChangePanelWidthPercent?.(preset)}
                    className={`min-h-[26px] px-2.5 py-1 rounded-lg text-[11px] font-mono font-medium transition border ${
                      isSelected
                        ? 'bg-indigo-600 text-white border-indigo-400/60 shadow-sm'
                        : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700'
                    }`}
                  >
                    {preset}%
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ObjectDock Appearance & Placement */}
      {showSection('dock') && (
        <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3">
          <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
            ObjectDock Appearance &amp; Placement
          </h3>

          <div className="cq-settings-3col">
            <div>
              <label
                htmlFor="setting-panel-edge"
                className="text-[11px] text-slate-400 flex items-center justify-between gap-1 mb-1"
              >
                <span>Screen Edge Placement</span>
                {hasEdgeOverrides && (
                  <span className="text-[10px] text-indigo-300 font-mono">
                    Overrides active
                  </span>
                )}
              </label>
              <select
                id="setting-panel-edge"
                aria-label="Screen Edge Placement"
                value={panelEdge}
                onChange={(e) =>
                  onChangePanelEdge?.(e.target.value as PanelEdge)
                }
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white"
              >
                <option value="right">Right Edge</option>
                <option value="left">Left Edge</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="setting-dock-effect"
                className="text-[11px] text-slate-400 block mb-1"
              >
                Dock Hover Effect
              </label>
              <select
                id="setting-dock-effect"
                aria-label="Dock Hover Effect"
                value={dockEffect}
                onChange={(e) =>
                  onChangeDockEffect?.(e.target.value as DockHoverEffect)
                }
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white"
              >
                <option value="zoom">Zoom Magnification</option>
                <option value="swing">Pendulum Swing</option>
                <option value="glow">Plateau Glow</option>
                <option value="none">None (Static)</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="setting-dock-size"
                className="text-[11px] text-slate-400 block mb-1"
              >
                Dock Tile Size
              </label>
              <select
                id="setting-dock-size"
                aria-label="Dock Tile Size"
                value={dockIconSize}
                onChange={(e) =>
                  onChangeDockIconSize?.(e.target.value as DockIconSize)
                }
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white"
              >
                <option value="compact">Compact</option>
                <option value="normal">Normal</option>
                <option value="large">Large</option>
              </select>
            </div>
          </div>

          <label className="flex items-center justify-between gap-3 py-1.5 cursor-pointer border-t border-slate-800/80 pt-3">
            <div>
              <div className="text-xs font-medium text-slate-200">
                Lock Dock Icons (Prevent Drag Reordering)
              </div>
              <div className="text-[11px] text-slate-400">
                Prevent accidental rearrangement or deletion of app tiles and drawers
              </div>
            </div>
            <input
              type="checkbox"
              id="setting-lock-icons"
              checked={isDockLocked}
              onChange={(e) => onToggleDockLock?.(e.target.checked)}
              className="sr-only peer"
            />
            <span aria-hidden="true" className={PILL_SWITCH_TRACK_CLASS} />
          </label>
        </div>
      )}

      {/* Work Laptop Install & Seamless Auto-Updates */}
      {showSection('system') && (
        <div
          data-testid="app-updates-settings-card"
          className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                <span>Work Laptop Install &amp; Auto-Updates</span>
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Per-user install (<code className="font-mono text-slate-300">%LOCALAPPDATA%\Programs\SideFlow</code>) • Zero Admin / UAC prompts • Delta updates via{' '}
                <code className="font-mono text-indigo-300">NeoShadow7366/SideFlow</code>
              </p>
            </div>
            <span
              data-testid="app-version-badge"
              className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 font-mono text-xs text-emerald-300 font-semibold whitespace-nowrap"
            >
              v{updateState?.currentVersion || '1.0.0'}
            </span>
          </div>

          {/* Status Banner */}
          <div
            data-testid="update-status-banner"
            className="px-3 py-2 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between gap-2 text-xs"
          >
            <div className="flex items-center gap-2 text-slate-300">
              {updateState?.status === 'checking' ? (
                <>
                  <RefreshCw
                    className="w-3.5 h-3.5 text-indigo-400 animate-spin"
                    aria-hidden="true"
                  />
                  <span>Checking GitHub Releases for updates...</span>
                </>
              ) : updateState?.status === 'downloading' ? (
                <>
                  <RefreshCw
                    className="w-3.5 h-3.5 text-amber-400 animate-spin"
                    aria-hidden="true"
                  />
                  <span>
                    Downloading update v{updateState.latestVersion || ''} (
                    {updateState.downloadPercent ?? 0}%)...
                  </span>
                </>
              ) : updateState?.status === 'downloaded' ? (
                <>
                  <Sparkles
                    className="w-3.5 h-3.5 text-emerald-400"
                    aria-hidden="true"
                  />
                  <span className="text-emerald-300 font-medium">
                    Update v{updateState.latestVersion} downloaded and ready to apply!
                  </span>
                </>
              ) : updateState?.status === 'available' ? (
                <>
                  <Sparkles
                    className="w-3.5 h-3.5 text-amber-400"
                    aria-hidden="true"
                  />
                  <span className="text-amber-300 font-medium">
                    New release v{updateState.latestVersion} is available on GitHub!
                  </span>
                </>
              ) : (
                <>
                  <CheckCircle2
                    className="w-3.5 h-3.5 text-emerald-400"
                    aria-hidden="true"
                  />
                  <span>
                    SideFlow is up to date (v{updateState?.currentVersion || '1.0.0'})
                  </span>
                </>
              )}
            </div>
            {updateState?.lastCheckedAt && (
              <span className="text-[10px] font-mono text-slate-400 whitespace-nowrap">
                Checked{' '}
                {new Date(updateState.lastCheckedAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              id="check-updates-btn"
              data-testid="check-updates-btn"
              disabled={
                updateState?.status === 'checking' ||
                updateState?.status === 'downloading'
              }
              onClick={() => onCheckForUpdates?.()}
              className="flex-1 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 border border-slate-700 text-xs text-slate-200 flex items-center justify-center gap-1.5 transition"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 text-indigo-400 ${
                  updateState?.status === 'checking' ? 'animate-spin' : ''
                }`}
                aria-hidden="true"
              />
              <span>
                {updateState?.status === 'checking'
                  ? 'Checking...'
                  : 'Check for Updates'}
              </span>
            </button>

            {(updateState?.status === 'downloaded' ||
              updateState?.status === 'available') && (
              <button
                type="button"
                id="install-update-btn"
                data-testid="install-update-btn"
                onClick={() => onInstallUpdate?.()}
                className="flex-1 py-2 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-xs font-semibold text-slate-950 flex items-center justify-center gap-1.5 transition shadow-lg shadow-emerald-500/20"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                <span>
                  {updateState.status === 'downloaded'
                    ? `Restart & Install v${updateState.latestVersion || ''}`
                    : `Get Update v${updateState.latestVersion || ''}`}
                </span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Data Backup & Reset */}
      {showSection('system') &&
        (onExportBackup || onImportBackup || onResetAllData) && (
          <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3">
            <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
              Workspace Data &amp; Backup
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              {onExportBackup && (
                <button
                  type="button"
                  onClick={onExportBackup}
                  className="flex-1 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-slate-200 flex items-center justify-center gap-1.5 transition"
                >
                  <Download
                    className="w-3.5 h-3.5 text-indigo-400"
                    aria-hidden="true"
                  />
                  <span>Export Config JSON</span>
                </button>
              )}
              {onImportBackup && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      if (backupFileInputRef.current) {
                        backupFileInputRef.current.value = '';
                        backupFileInputRef.current.click();
                      }
                    }}
                    className="flex-1 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-slate-200 flex items-center justify-center gap-1.5 transition"
                  >
                    <Upload
                      className="w-3.5 h-3.5 text-emerald-400"
                      aria-hidden="true"
                    />
                    <span>Import Config JSON</span>
                  </button>
                  <input
                    ref={backupFileInputRef}
                    data-testid="import-backup-input"
                    type="file"
                    accept=".json,application/json"
                    tabIndex={-1}
                    aria-hidden="true"
                    className="hidden"
                    onChange={handleImportFileChange}
                  />
                </>
              )}
              {onResetAllData && (
                <button
                  type="button"
                  data-testid="reset-defaults-trigger-btn"
                  onClick={() => setIsResetModalOpen(true)}
                  className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-rose-950/60 border border-slate-700 hover:border-rose-500/40 text-xs text-slate-300 hover:text-rose-300 flex items-center justify-center gap-1.5 transition"
                >
                  <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Reset Defaults</span>
                </button>
              )}
            </div>
          </div>
        )}

      {/* Native Desktop Packaging Guide Card — Shown ONLY in Web Browser Preview, hidden in Native Electron */}
      {!runningInElectron && showSection('system') && (
        <div
          data-testid="electron-web-promo-card"
          className="p-4 rounded-2xl bg-gradient-to-br from-indigo-950/70 to-slate-900 border border-indigo-500/30 space-y-2.5"
        >
          <div className="flex items-center gap-2 text-indigo-300 font-semibold text-xs">
            <Cpu className="w-4 h-4" aria-hidden="true" />
            <span>Want to run this natively in Windows / macOS System Tray?</span>
          </div>
          <p className="text-[11px] text-slate-300 leading-relaxed">
            Web browsers sandbox direct <code className="font-mono">.exe</code>{' '}
            launching and OS-level global hotkeys when minimized. Click below to
            copy the ready-to-run{' '}
            <strong>Electron Tray Wrapper (main.ts)</strong> that hosts this exact
            interface as an always-on background utility.
          </p>
          <button
            type="button"
            onClick={onOpenElectronModal}
            className="w-full py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white transition flex items-center justify-center gap-1.5"
          >
            <Code className="w-4 h-4" aria-hidden="true" />
            <span>View Electron System Tray &amp; App Launcher Script</span>
          </button>
        </div>
      )}

      {/* Factory Reset Confirmation AlertDialog Modal */}
      <Modal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        role="alertdialog"
        ariaLabel="Confirm Workspace Factory Reset"
        dataTestId="confirm-reset-defaults-modal"
        initialFocusRef={cancelResetBtnRef}
        maxWidthClass="max-w-md"
        panelClassName="border-rose-500/40 space-y-4"
      >
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center shrink-0">
            <AlertTriangle
              className="w-4 h-4 text-rose-400"
              aria-hidden="true"
            />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-white">
              Reset Entire Workspace to Factory Defaults?
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              This will replace all custom drawers, app launchers, saved
              flowcharts, notes, hotkeys, and monitor routing preferences with
              SideFlow&apos;s factory defaults.
            </p>
            {countsSummary && (
              <p className="text-[11px] font-mono text-rose-300 pt-1">
                Current workspace: {countsSummary.drawers} drawers •{' '}
                {countsSummary.apps} apps • {countsSummary.diagrams} diagrams •{' '}
                {countsSummary.notes} notes
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-800">
          {onExportBackup && (
            <button
              type="button"
              onClick={() => onExportBackup()}
              className="mr-auto px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-indigo-300 font-medium flex items-center gap-1.5 transition"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Export Backup First</span>
            </button>
          )}
          <button
            ref={cancelResetBtnRef}
            type="button"
            onClick={() => setIsResetModalOpen(false)}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="confirm-reset-defaults-btn"
            onClick={() => {
              setIsResetModalOpen(false);
              onResetAllData?.();
            }}
            className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white transition"
          >
            Confirm Reset
          </button>
        </div>
      </Modal>
    </section>
  );
};
