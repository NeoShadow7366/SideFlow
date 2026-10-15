import React, { useRef } from 'react';
import {
  Keyboard,
  Cpu,
  Code,
  Download,
  Upload,
  RotateCcw,
  Maximize2,
  RefreshCw,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import {
  AppUpdateState,
  DockHoverEffect,
  DockIconSize,
  PanelEdge,
  ShortcutConfig,
} from '../../types/sideflow';
import {
  defaultShortcut,
  DEFAULT_PANEL_WIDTH_PERCENT,
  MIN_PANEL_WIDTH_PERCENT,
  MAX_PANEL_WIDTH_PERCENT,
  PANEL_WIDTH_PRESETS,
  clampPanelWidthPercent,
} from '../../utils/defaults';

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
  dockEffect?: DockHoverEffect;
  onChangeDockEffect?: (effect: DockHoverEffect) => void;
  dockIconSize?: DockIconSize;
  onChangeDockIconSize?: (size: DockIconSize) => void;
  isDockLocked?: boolean;
  onToggleDockLock?: (locked: boolean) => void;
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
  dockEffect = 'zoom',
  onChangeDockEffect,
  dockIconSize = 'normal',
  onChangeDockIconSize,
  isDockLocked = false,
  onToggleDockLock,
  onOpenElectronModal,
  onExportBackup,
  onImportBackup,
  onResetAllData,
}) => {
  const backupFileInputRef = useRef<HTMLInputElement>(null);

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
      {/* Global Toggle Shortcut */}
      <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
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
            className="px-3 py-1 rounded-lg bg-indigo-500/20 border border-indigo-500/40 font-mono text-xs text-indigo-300 font-semibold"
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
            className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-300"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Panel Behavior Settings */}
      <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3">
        <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
          Side Panel &amp; Tray Preferences
        </h3>

        <label className="flex items-center justify-between py-1.5 cursor-pointer">
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
            className="w-4 h-4 accent-indigo-500 rounded"
          />
        </label>

        <label className="flex items-center justify-between py-1.5 cursor-pointer border-t border-slate-800/80 pt-3">
          <div>
            <div className="text-xs font-medium text-slate-200">
              Show Screen-Edge Peek Handle
            </div>
            <div className="text-[11px] text-slate-400">
              Keep a subtle tab on the active monitor edge when minimized to tray
            </div>
          </div>
          <input
            type="checkbox"
            id="setting-edge-handle"
            checked={showEdgeHandle}
            onChange={(e) => onToggleEdgeHandle(e.target.checked)}
            className="w-4 h-4 accent-indigo-500 rounded"
          />
        </label>

        <label className="flex items-center justify-between py-1.5 cursor-pointer border-t border-slate-800/80 pt-3">
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
            className="w-4 h-4 accent-indigo-500 rounded"
          />
        </label>
      </div>

      {/* Screen Presence & Extended Panel Size */}
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
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-medium transition border ${
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

      {/* ObjectDock Appearance & Placement */}
      <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3">
        <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
          ObjectDock Appearance &amp; Placement
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div>
            <label
              htmlFor="setting-panel-edge"
              className="text-[11px] text-slate-400 block mb-1"
            >
              Screen Edge Placement
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

        <label className="flex items-center justify-between py-1.5 cursor-pointer border-t border-slate-800/80 pt-3">
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
            className="w-4 h-4 accent-indigo-500 rounded"
          />
        </label>
      </div>

      {/* Work Laptop Install & Seamless Auto-Updates */}
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
            <span className="text-[10px] font-mono text-slate-500 whitespace-nowrap">
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
              className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-medium text-white flex items-center justify-center gap-1.5 transition shadow-lg shadow-emerald-600/25"
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

      {/* Data Backup & Reset */}
      {(onExportBackup || onImportBackup || onResetAllData) && (
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
                <Download className="w-3.5 h-3.5 text-indigo-400" aria-hidden="true" />
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
                  <Upload className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
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
                onClick={onResetAllData}
                className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-rose-950/60 border border-slate-700 hover:border-rose-500/40 text-xs text-slate-300 hover:text-rose-300 flex items-center justify-center gap-1.5 transition"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Reset Defaults</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Native Desktop Packaging Guide Card */}
      <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-950/70 to-slate-900 border border-indigo-500/30 space-y-2.5">
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
    </section>
  );
};
