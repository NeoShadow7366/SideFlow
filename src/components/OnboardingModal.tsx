import React, { useRef, useState } from 'react';
import {
  Keyboard,
  Monitor,
  CheckCircle2,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  PanelLeft,
  PanelRight,
  Grid,
  GitBranch,
  Mic,
} from 'lucide-react';
import {
  MonitorMode,
  MonitorSettings,
  PanelEdge,
  ShortcutConfig,
} from '../types/sideflow';
import { PANEL_WIDTH_PRESETS } from '../utils/defaults';
import { Modal } from './Modal';
import { SideFlowIcon } from './SideFlowIcon';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
  shortcut: ShortcutConfig;
  isRecordingHotkey: boolean;
  onStartRecordingHotkey: () => void;
  onSelectShortcutPreset: (preset: ShortcutConfig) => void;
  isPinned: boolean;
  onTogglePin: (forcePin?: boolean) => void;
  openAtLogin: boolean;
  onToggleOpenAtLogin: (enabled: boolean) => void;
  panelEdge: PanelEdge;
  onChangePanelEdge: (edge: PanelEdge) => void;
  panelWidthPercent: number;
  onChangePanelWidthPercent: (percent: number) => void;
  monitorSettings: MonitorSettings;
  onChangeMonitorSettings: (next: MonitorSettings) => void;
}

const SHORTCUT_PRESETS: Array<{
  id: string;
  config: ShortcutConfig;
  badge: string;
}> = [
  {
    id: 'alt-space',
    config: {
      ctrl: false,
      alt: true,
      shift: false,
      code: 'Space',
      key: ' ',
      label: 'Alt + Space',
    },
    badge: 'Recommended',
  },
  {
    id: 'ctrl-space',
    config: {
      ctrl: true,
      alt: false,
      shift: false,
      code: 'Space',
      key: ' ',
      label: 'Ctrl + Space',
    },
    badge: 'Power User',
  },
  {
    id: 'alt-q',
    config: {
      ctrl: false,
      alt: true,
      shift: false,
      code: 'KeyQ',
      key: 'Q',
      label: 'Alt + Q',
    },
    badge: 'Single Hand',
  },
];

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  onClose,
  onComplete,
  shortcut,
  isRecordingHotkey,
  onStartRecordingHotkey,
  onSelectShortcutPreset,
  isPinned,
  onTogglePin,
  openAtLogin,
  onToggleOpenAtLogin,
  panelEdge,
  onChangePanelEdge,
  panelWidthPercent,
  onChangePanelWidthPercent,
  monitorSettings,
  onChangeMonitorSettings,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const nextBtnRef = useRef<HTMLButtonElement>(null);

  const handleSetMonitorMode = (mode: MonitorMode) => {
    onChangeMonitorSettings({
      ...monitorSettings,
      mode,
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      ariaLabel="SideFlow First-Run Setup Wizard"
      dataTestId="onboarding-wizard-modal"
      initialFocusRef={nextBtnRef}
      maxWidthClass="max-w-lg"
      panelClassName="border-indigo-500/40 space-y-4"
    >
      {/* Wizard Header */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 via-blue-500 to-cyan-400 border border-cyan-300/30 flex items-center justify-center text-white shadow-md">
            <SideFlowIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white">
                Welcome to SideFlow
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-[10px] font-mono text-indigo-300">
                Step {step} of 3
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              60-second setup for your slide-out desktop workspace
            </p>
          </div>
        </div>

        {/* Step Indicator Pills */}
        <div
          role="group"
          aria-label="Setup Wizard Steps"
          className="flex items-center gap-1"
        >
          {([1, 2, 3] as const).map((s) => (
            <button
              key={s}
              type="button"
              data-testid={`onboarding-step-${s}`}
              aria-label={`Go to setup step ${s}`}
              aria-current={step === s ? 'step' : undefined}
              onClick={() => setStep(s)}
              className={`w-6 h-6 rounded-lg font-mono text-[11px] font-semibold transition ${
                step === s
                  ? 'bg-indigo-600 text-white shadow'
                  : step > s
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Step 1: Global Shortcut & Startup Preferences */}
      {step === 1 && (
        <div data-testid="onboarding-panel-step-1" className="space-y-3.5">
          <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
                <Keyboard
                  className="w-4 h-4 text-indigo-400"
                  aria-hidden="true"
                />
                <span>1. Choose Your Global Toggle Shortcut</span>
              </div>
              <span
                data-testid="onboarding-active-shortcut"
                className="px-2.5 py-0.5 rounded-md bg-indigo-500/20 border border-indigo-400/40 font-mono text-xs text-indigo-200 font-semibold"
              >
                {shortcut.label}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Press this shortcut from any app to slide SideFlow open or closed:
            </p>

            <div className="grid grid-cols-3 gap-2">
              {SHORTCUT_PRESETS.map((preset) => {
                const isSelected = shortcut.label === preset.config.label;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    data-testid={`onboarding-shortcut-preset-${preset.id}`}
                    aria-pressed={isSelected}
                    onClick={() => onSelectShortcutPreset(preset.config)}
                    className={`p-2 rounded-xl border text-left transition ${
                      isSelected
                        ? 'bg-indigo-600/25 border-indigo-400 text-white'
                        : 'bg-slate-950/80 hover:bg-slate-800 border-slate-800 text-slate-300'
                    }`}
                  >
                    <div className="font-mono text-xs font-semibold">
                      {preset.config.label}
                    </div>
                    <div className="text-[10px] text-indigo-300/90 mt-0.5">
                      {preset.badge}
                    </div>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              data-testid="onboarding-record-hotkey-btn"
              aria-pressed={isRecordingHotkey}
              onClick={onStartRecordingHotkey}
              className={`w-full py-2 px-3 rounded-xl text-xs font-medium text-white transition flex items-center justify-center gap-1.5 ${
                isRecordingHotkey
                  ? 'bg-rose-600 hover:bg-rose-500'
                  : 'bg-slate-800 hover:bg-slate-700 border border-slate-700'
              }`}
            >
              <Keyboard className="w-3.5 h-3.5" aria-hidden="true" />
              <span>
                {isRecordingHotkey
                  ? 'Press any key combo now...'
                  : 'Or Click to Record Custom Shortcut'}
              </span>
            </button>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2.5">
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <div>
                <div className="text-xs font-medium text-slate-200">
                  Auto-Hide When Clicking Outside
                </div>
                <div className="text-[11px] text-slate-400">
                  Automatically retract the panel when you focus another window
                </div>
              </div>
              <input
                type="checkbox"
                data-testid="onboarding-autohide-toggle"
                checked={!isPinned}
                onChange={(e) => onTogglePin(!e.target.checked)}
                className="w-4 h-4 accent-indigo-500 rounded cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between gap-3 pt-2.5 border-t border-slate-800 cursor-pointer">
              <div>
                <div className="text-xs font-medium text-slate-200">
                  Start SideFlow Automatically at Login
                </div>
                <div className="text-[11px] text-slate-400">
                  Launch quietly in the system tray when you sign in
                </div>
              </div>
              <input
                type="checkbox"
                data-testid="onboarding-login-toggle"
                checked={openAtLogin}
                onChange={(e) => onToggleOpenAtLogin(e.target.checked)}
                className="w-4 h-4 accent-indigo-500 rounded cursor-pointer"
              />
            </label>
          </div>
        </div>
      )}

      {/* Step 2: Screen Edge, Multi-Monitor & Panel Width */}
      {step === 2 && (
        <div data-testid="onboarding-panel-step-2" className="space-y-3.5">
          <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2.5">
            <div className="text-xs font-semibold text-white">
              2. Screen Edge &amp; Multi-Monitor Behavior
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                data-testid="onboarding-edge-left"
                aria-pressed={panelEdge === 'left'}
                onClick={() => onChangePanelEdge('left')}
                className={`p-2.5 rounded-xl border text-xs flex items-center gap-2 transition ${
                  panelEdge === 'left'
                    ? 'bg-indigo-600/25 border-indigo-400 text-white'
                    : 'bg-slate-950/80 hover:bg-slate-800 border-slate-800 text-slate-300'
                }`}
              >
                <PanelLeft
                  className="w-4 h-4 text-indigo-400 shrink-0"
                  aria-hidden="true"
                />
                <div className="text-left">
                  <div className="font-semibold">Left Screen Edge</div>
                  <div className="text-[10px] text-slate-400">
                    Slide out from left bezel
                  </div>
                </div>
              </button>

              <button
                type="button"
                data-testid="onboarding-edge-right"
                aria-pressed={panelEdge === 'right'}
                onClick={() => onChangePanelEdge('right')}
                className={`p-2.5 rounded-xl border text-xs flex items-center gap-2 transition ${
                  panelEdge === 'right'
                    ? 'bg-indigo-600/25 border-indigo-400 text-white'
                    : 'bg-slate-950/80 hover:bg-slate-800 border-slate-800 text-slate-300'
                }`}
              >
                <PanelRight
                  className="w-4 h-4 text-indigo-400 shrink-0"
                  aria-hidden="true"
                />
                <div className="text-left">
                  <div className="font-semibold">Right Screen Edge</div>
                  <div className="text-[10px] text-slate-400">
                    Slide out from right bezel
                  </div>
                </div>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                data-testid="onboarding-monitor-primary"
                aria-pressed={monitorSettings.mode === 'primary'}
                onClick={() => handleSetMonitorMode('primary')}
                className={`p-2.5 rounded-xl border text-xs text-left transition ${
                  monitorSettings.mode === 'primary'
                    ? 'bg-indigo-600/25 border-indigo-400 text-white'
                    : 'bg-slate-950/80 hover:bg-slate-800 border-slate-800 text-slate-300'
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold">
                  <Monitor
                    className="w-3.5 h-3.5 text-cyan-400"
                    aria-hidden="true"
                  />
                  <span>Primary Monitor Only</span>
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Always dock on main display
                </div>
              </button>

              <button
                type="button"
                data-testid="onboarding-monitor-all"
                aria-pressed={monitorSettings.mode === 'all'}
                onClick={() => handleSetMonitorMode('all')}
                className={`p-2.5 rounded-xl border text-xs text-left transition ${
                  monitorSettings.mode === 'all'
                    ? 'bg-indigo-600/25 border-indigo-400 text-white'
                    : 'bg-slate-950/80 hover:bg-slate-800 border-slate-800 text-slate-300'
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold">
                  <Sparkles
                    className="w-3.5 h-3.5 text-amber-400"
                    aria-hidden="true"
                  />
                  <span>All Monitors (Follow Mouse)</span>
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Open on active cursor screen
                </div>
              </button>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-white">
                Default Panel Width
              </span>
              <span className="font-mono text-indigo-300">
                {panelWidthPercent}% of screen
              </span>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {PANEL_WIDTH_PRESETS.map((pct) => (
                <button
                  key={pct}
                  type="button"
                  data-testid={`onboarding-width-${pct}`}
                  aria-pressed={panelWidthPercent === pct}
                  onClick={() => onChangePanelWidthPercent(pct)}
                  className={`py-1.5 px-2 rounded-lg border text-[11px] font-medium transition ${
                    panelWidthPercent === pct
                      ? 'bg-indigo-600 border-indigo-400 text-white'
                      : 'bg-slate-950/80 hover:bg-slate-800 border-slate-800 text-slate-300'
                  }`}
                >
                  {pct}%
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Summary & Quick Tour */}
      {step === 3 && (
        <div data-testid="onboarding-panel-step-3" className="space-y-3.5">
          <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
              <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
              <span>Your SideFlow Workspace is Ready!</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
              <div className="px-2.5 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800">
                <span className="text-slate-400">Toggle Shortcut:</span>{' '}
                <strong className="font-mono text-indigo-300">
                  {shortcut.label}
                </strong>
              </div>
              <div className="px-2.5 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800">
                <span className="text-slate-400">Screen Edge:</span>{' '}
                <strong className="text-white capitalize">
                  {panelEdge} ({panelWidthPercent}%)
                </strong>
              </div>
              <div className="px-2.5 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800">
                <span className="text-slate-400">Monitors:</span>{' '}
                <strong className="text-white">
                  {monitorSettings.mode === 'all'
                    ? 'Follow Mouse'
                    : 'Primary Only'}
                </strong>
              </div>
              <div className="px-2.5 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800">
                <span className="text-slate-400">Login Startup:</span>{' '}
                <strong className="text-white">
                  {openAtLogin ? 'Enabled' : 'Manual'}
                </strong>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-[11px]">
            <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-sky-300">
                <Grid className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Dock Drawers</span>
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                Drag &amp; drop apps, scripts, folders, or URLs onto drawers for
                1-click launch.
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-indigo-300">
                <GitBranch className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Flow Studio</span>
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                Sketch diagrams with 14 vector shapes, Quick Shape Palette &amp;
                Mermaid sync.
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-emerald-300">
                <Mic className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Voice Notes</span>
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                Author Markdown &amp; Jira Cloud ADF notes with live speech
                dictation.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Wizard Footer Controls */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800">
        {step > 1 ? (
          <button
            type="button"
            data-testid="onboarding-back-btn"
            onClick={() => setStep((prev) => (prev === 3 ? 2 : 1))}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 flex items-center gap-1 transition"
          >
            <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Back</span>
          </button>
        ) : (
          <button
            type="button"
            data-testid="onboarding-skip-btn"
            onClick={onComplete}
            className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-xs text-slate-400 hover:text-slate-200 transition"
          >
            Skip Setup
          </button>
        )}

        {step < 3 ? (
          <button
            ref={nextBtnRef}
            type="button"
            data-testid="onboarding-next-btn"
            onClick={() => setStep((prev) => (prev === 1 ? 2 : 3))}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white flex items-center gap-1 transition shadow-lg shadow-indigo-600/25"
          >
            <span>Next Step</span>
            <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        ) : (
          <button
            ref={nextBtnRef}
            type="button"
            data-testid="onboarding-finish-btn"
            onClick={onComplete}
            className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-xs font-semibold text-slate-950 flex items-center gap-1.5 transition shadow-lg shadow-emerald-500/25"
          >
            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Complete Setup</span>
          </button>
        )}
      </div>
    </Modal>
  );
};
