import React from 'react';
import { Keyboard, Cpu, Code, Download, RotateCcw } from 'lucide-react';
import { ShortcutConfig } from '../../types/sideflow';
import { defaultShortcut } from '../../utils/defaults';

interface SettingsViewProps {
  shortcut: ShortcutConfig;
  isRecordingHotkey: boolean;
  onStartRecordingHotkey: () => void;
  onResetHotkey: () => void;
  isPinned: boolean;
  onTogglePin: (forcePin?: boolean) => void;
  showEdgeHandle: boolean;
  onToggleEdgeHandle: (show: boolean) => void;
  onOpenElectronModal: () => void;
  onExportBackup?: () => void;
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
  onOpenElectronModal,
  onExportBackup,
  onResetAllData,
}) => {
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
            onClick={onStartRecordingHotkey}
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-medium text-white transition flex items-center justify-center gap-2 ${
              isRecordingHotkey
                ? 'bg-rose-600 hover:bg-rose-500'
                : 'bg-indigo-600 hover:bg-indigo-500'
            }`}
          >
            <Keyboard className="w-4 h-4" />
            <span id="record-hotkey-label">
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
              Keep a subtle tab on the right monitor edge when minimized to tray
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
      </div>

      {/* Data Backup & Reset */}
      {(onExportBackup || onResetAllData) && (
        <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3">
          <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
            Workspace Data &amp; Backup
          </h3>
          <div className="flex items-center gap-2">
            {onExportBackup && (
              <button
                type="button"
                onClick={onExportBackup}
                className="flex-1 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-slate-200 flex items-center justify-center gap-1.5 transition"
              >
                <Download className="w-3.5 h-3.5 text-indigo-400" />
                <span>Export Config JSON</span>
              </button>
            )}
            {onResetAllData && (
              <button
                type="button"
                onClick={onResetAllData}
                className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-rose-950/60 border border-slate-700 hover:border-rose-500/40 text-xs text-slate-300 hover:text-rose-300 flex items-center justify-center gap-1.5 transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Defaults</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Native Desktop Packaging Guide Card */}
      <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-950/70 to-slate-900 border border-indigo-500/30 space-y-2.5">
        <div className="flex items-center gap-2 text-indigo-300 font-semibold text-xs">
          <Cpu className="w-4 h-4" />
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
          <Code className="w-4 h-4" />
          <span>View Electron System Tray &amp; App Launcher Script</span>
        </button>
      </div>
    </section>
  );
};
