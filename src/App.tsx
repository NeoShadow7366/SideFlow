import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Layers,
  PanelRightOpen,
  Terminal,
  Folder,
  FileCode,
  ChevronLeft,
  LayoutGrid,
  PanelRight,
  Grid,
  GitBranch,
  Mic,
  Settings,
  Zap,
  Wifi,
  Volume2,
} from 'lucide-react';
import {
  AppDrawer,
  FlowchartState,
  NoteItem,
  ShortcutConfig,
  TabId,
  ToastMessage,
} from './types/sideflow';
import { useLocalStorage } from './hooks/useLocalStorage';
import {
  defaultDrawers,
  defaultFlowData,
  defaultNotes,
  defaultShortcut,
} from './utils/defaults';
import { Header } from './components/Header';
import { DockView } from './components/DockDrawers/DockView';
import { FlowCanvas } from './components/Flowchart/FlowCanvas';
import { NotesView } from './components/Notes/NotesView';
import { SettingsView } from './components/Settings/SettingsView';
import { ElectronModal } from './components/ElectronModal';
import { DynamicIcon } from './components/DynamicIcon';

export const App: React.FC = () => {
  const [drawers, setDrawers] = useLocalStorage<AppDrawer[]>(
    'sideflow_drawers',
    defaultDrawers
  );
  const [flowData, setFlowData] = useLocalStorage<FlowchartState>(
    'sideflow_flow',
    defaultFlowData
  );
  const [notes, setNotes] = useLocalStorage<NoteItem[]>(
    'sideflow_notes',
    defaultNotes
  );
  const [shortcut, setShortcut] = useLocalStorage<ShortcutConfig>(
    'sideflow_shortcut',
    defaultShortcut
  );
  const [isPinned, setIsPinned] = useLocalStorage<boolean>(
    'sideflow_pinned',
    true
  );
  const [showEdgeHandle, setShowEdgeHandle] = useLocalStorage<boolean>(
    'sideflow_edge_handle',
    true
  );

  const [isPanelOpen, setIsPanelOpen] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<TabId>('drawers');
  const [isRecordingHotkey, setIsRecordingHotkey] = useState<boolean>(false);
  const [isTrayMenuOpen, setIsTrayMenuOpen] = useState<boolean>(false);
  const [isElectronModalOpen, setIsElectronModalOpen] = useState<boolean>(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [clockTime, setClockTime] = useState<string>(() =>
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  );

  const toastTimerRef = useRef<number | null>(null);
  const isElectronWindow = Boolean(window.sideflow?.isElectron);

  const notify = useCallback(
    (title: string, icon = 'rocket', subtitle = 'System Launch') => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
      setToast({
        id: String(Date.now()),
        title,
        subtitle,
        icon,
      });
      toastTimerRef.current = window.setTimeout(() => {
        setToast(null);
      }, 3000);
    },
    []
  );

  const togglePanel = useCallback((forceState?: boolean) => {
    setIsPanelOpen((prev) => {
      const next = typeof forceState === 'boolean' ? forceState : !prev;
      window.sideflow?.setPanelVisibility?.(next);
      return next;
    });
  }, []);

  const togglePin = useCallback(
    (forcePin?: boolean) => {
      setIsPinned((prev) => (typeof forcePin === 'boolean' ? forcePin : !prev));
    },
    [setIsPinned]
  );

  // Clock updater
  useEffect(() => {
    const interval = window.setInterval(() => {
      setClockTime(
        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      );
    }, 15000);
    return () => window.clearInterval(interval);
  }, []);

  // Electron IPC listeners
  useEffect(() => {
    const unsubVisibility = window.sideflow?.onSetPanelVisibility?.((visible) => {
      setIsPanelOpen(visible);
    });
    const unsubSwitchTab = window.sideflow?.onSwitchTab?.((tab) => {
      setActiveTab(tab);
      setIsPanelOpen(true);
    });
    const unsubBlur = window.sideflow?.onWindowBlur?.(() => {
      if (!isPinned) {
        setIsPanelOpen(false);
      }
    });

    return () => {
      unsubVisibility?.();
      unsubSwitchTab?.();
      unsubBlur?.();
    };
  }, [isPinned]);

  // Global keyboard shortcut & recorder listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isRecordingHotkey) {
        e.preventDefault();
        if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;

        const parts: string[] = [];
        if (e.ctrlKey) parts.push('Ctrl');
        if (e.altKey) parts.push('Alt');
        if (e.shiftKey) parts.push('Shift');
        const keyName = e.code === 'Space' || e.key === ' ' ? 'Space' : e.key.toUpperCase();
        parts.push(keyName);

        const label = parts.join(' + ');
        const newShortcut: ShortcutConfig = {
          alt: e.altKey,
          ctrl: e.ctrlKey,
          shift: e.shiftKey,
          code: e.code,
          key: e.key.toLowerCase(),
          label,
        };

        setShortcut(newShortcut);
        setIsRecordingHotkey(false);
        window.sideflow?.updateGlobalShortcut?.(parts.join('+'));
        notify('Updated Global Hotkey', 'check', `Shortcut set to ${label}`);
        return;
      }

      const matchAlt = Boolean(shortcut.alt) === e.altKey;
      const matchCtrl = Boolean(shortcut.ctrl) === e.ctrlKey;
      const matchShift = Boolean(shortcut.shift) === e.shiftKey;
      const normalizedKey = (shortcut.key || '').toLowerCase();
      const matchKey =
        (shortcut.code && e.code === shortcut.code) ||
        ((normalizedKey === 'space' || normalizedKey === ' ') &&
          (e.code === 'Space' || e.key === ' ')) ||
        e.key.toLowerCase() === normalizedKey;

      if (matchAlt && matchCtrl && matchShift && matchKey) {
        e.preventDefault();
        togglePanel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRecordingHotkey, shortcut, setShortcut, togglePanel, notify]);

  const handleResetHotkey = () => {
    setShortcut(defaultShortcut);
    setIsRecordingHotkey(false);
    window.sideflow?.updateGlobalShortcut?.('Alt+Space');
    notify('Reset Global Hotkey', 'check', 'Restored default Alt + Space');
  };

  const handleExportBackup = () => {
    const backup = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      drawers,
      flowData,
      notes,
      shortcut,
    };
    try {
      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'sideflow-backup.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      notify('Exported SideFlow Backup', 'check', 'Saved sideflow-backup.json');
    } catch {
      // ignore
    }
  };

  const handleResetAllData = () => {
    setDrawers(defaultDrawers);
    setFlowData(defaultFlowData);
    setNotes(defaultNotes);
    setShortcut(defaultShortcut);
    notify('Restored Default Workspace', 'check', 'All drawers, flows & notes reset');
  };

  return (
    <div
      className={`h-screen w-screen relative select-none overflow-hidden ${
        isElectronWindow ? 'bg-transparent' : 'bg-slate-950 text-slate-100'
      }`}
    >
      {/* Desktop Simulation Environment (Shown in Web/Preview Mode) */}
      {!isElectronWindow && (
        <div
          id="desktop-environment"
          data-testid="desktop-environment"
          onMouseDown={(e) => {
            if (
              !isPinned &&
              isPanelOpen &&
              (e.target as HTMLElement).id === 'desktop-environment'
            ) {
              togglePanel(false);
            }
          }}
          className="absolute inset-0 bg-cover bg-center flex flex-col justify-between p-6"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, rgba(56, 189, 248, 0.18), transparent 45%), radial-gradient(circle at 80% 70%, rgba(139, 92, 246, 0.22), transparent 50%), linear-gradient(135deg, #090d16 0%, #111827 50%, #0f172a 100%)',
          }}
        >
          {/* Top Desktop Helper Banner */}
          <div className="flex flex-wrap items-center justify-between gap-4 max-w-4xl bg-slate-900/80 backdrop-blur-md border border-slate-700/60 rounded-2xl px-5 py-3.5 shadow-2xl z-10">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-400">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-semibold text-sm text-white">
                    SideFlow Desktop Background Utility
                  </h1>
                  <span className="text-[11px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-medium">
                    Running in Tray
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Press{' '}
                  <kbd
                    id="banner-shortcut-display"
                    className="px-1.5 py-0.5 text-[11px] font-mono bg-slate-800 text-indigo-300 rounded border border-slate-600"
                  >
                    {shortcut.label}
                  </kbd>{' '}
                  or click the edge handle / system tray icon to toggle the side
                  panel.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => togglePanel()}
                className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white transition flex items-center gap-1.5 shadow-lg shadow-indigo-600/30"
              >
                <PanelRightOpen className="w-4 h-4" />
                <span>Toggle Panel</span>
              </button>
              <button
                type="button"
                onClick={() => setIsElectronModalOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600/80 text-xs font-medium text-slate-200 transition flex items-center gap-1.5"
              >
                <Terminal className="w-4 h-4 text-amber-400" />
                <span>Get Native .EXE / Tray Code</span>
              </button>
            </div>
          </div>

          {/* Desktop Mock Icons (Left side) */}
          <div className="grid grid-cols-1 gap-5 w-24 my-auto opacity-85">
            <div
              onDoubleClick={() =>
                notify('Launching Workspace Explorer...', 'folder-open', 'explorer.exe')
              }
              className="flex flex-col items-center gap-1.5 p-2 rounded-xl hover:bg-white/10 cursor-pointer transition group"
            >
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-300 group-hover:scale-105 transition">
                <Folder className="w-6 h-6" />
              </div>
              <span className="text-[11px] text-center font-medium text-slate-200 drop-shadow">
                Projects
              </span>
            </div>
            <div
              onDoubleClick={() => setIsElectronModalOpen(true)}
              className="flex flex-col items-center gap-1.5 p-2 rounded-xl hover:bg-white/10 cursor-pointer transition group"
            >
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 border border-cyan-400/30 flex items-center justify-center text-cyan-300 group-hover:scale-105 transition">
                <FileCode className="w-6 h-6" />
              </div>
              <span className="text-[11px] text-center font-medium text-slate-200 drop-shadow">
                Electron Guide
              </span>
            </div>
          </div>

          {/* Simulated OS Taskbar & System Tray */}
          <div className="fixed bottom-0 inset-x-0 h-12 bg-slate-950/90 backdrop-blur-xl border-t border-slate-800/80 px-4 flex items-center justify-between z-40">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-slate-800/90 flex items-center justify-center text-sky-400">
                <LayoutGrid className="w-4 h-4" />
              </div>
              <span className="text-xs text-slate-400 hidden sm:inline">
                Desktop Simulation Mode
              </span>
            </div>

            {/* System Tray Area (Bottom Right) */}
            <div className="flex items-center gap-2">
              {/* Tray Popup Menu */}
              {isTrayMenuOpen && (
                <div
                  id="tray-context-menu"
                  className="absolute bottom-14 right-4 w-56 bg-slate-900/95 backdrop-blur-xl border border-slate-700 rounded-2xl p-2 shadow-2xl z-50"
                >
                  <div className="px-3 py-2 border-b border-slate-800 mb-1">
                    <p className="text-xs font-semibold text-white">
                      SideFlow Background Service
                    </p>
                    <p className="text-[11px] text-emerald-400 flex items-center gap-1 mt-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                      Active in System Tray
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      togglePanel();
                      setIsTrayMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-xs rounded-xl hover:bg-slate-800 flex items-center justify-between text-slate-200"
                  >
                    <span className="flex items-center gap-2">
                      <PanelRight className="w-3.5 h-3.5 text-indigo-400" />
                      Toggle Side Panel
                    </span>
                    <span
                      id="tray-shortcut-label"
                      className="text-[10px] font-mono text-slate-400"
                    >
                      {shortcut.label.replace(/\s+/g, '')}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('drawers');
                      togglePanel(true);
                      setIsTrayMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-xs rounded-xl hover:bg-slate-800 flex items-center gap-2 text-slate-200"
                  >
                    <Grid className="w-3.5 h-3.5 text-amber-400" /> Open App
                    Drawers
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('flowchart');
                      togglePanel(true);
                      setIsTrayMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-xs rounded-xl hover:bg-slate-800 flex items-center gap-2 text-slate-200"
                  >
                    <GitBranch className="w-3.5 h-3.5 text-cyan-400" /> Quick
                    Flowchart
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('notes');
                      togglePanel(true);
                      setIsTrayMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-xs rounded-xl hover:bg-slate-800 flex items-center gap-2 text-slate-200"
                  >
                    <Mic className="w-3.5 h-3.5 text-rose-400" /> Voice Dictation
                    Note
                  </button>
                  <div className="border-t border-slate-800 my-1" />
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('settings');
                      togglePanel(true);
                      setIsTrayMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-xs rounded-xl hover:bg-slate-800 flex items-center gap-2 text-slate-300"
                  >
                    <Settings className="w-3.5 h-3.5 text-slate-400" /> Configure
                    Hotkey
                  </button>
                </div>
              )}

              {/* System Tray Button */}
              <button
                type="button"
                onClick={() => setIsTrayMenuOpen((prev) => !prev)}
                title="SideFlow System Tray Icon (Click for menu)"
                className="px-2.5 py-1.5 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 flex items-center gap-2 text-indigo-300 transition"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-400" />
                </span>
                <Zap className="w-3.5 h-3.5" />
                <span className="text-xs font-medium">SideFlow Tray</span>
              </button>

              <div className="flex items-center gap-2 text-slate-400 text-xs pl-2 border-l border-slate-800">
                <Wifi className="w-3.5 h-3.5" />
                <Volume2 className="w-3.5 h-3.5" />
                <span
                  id="tray-clock"
                  className="font-mono text-[11px] text-slate-300"
                >
                  {clockTime}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Active App Launch Toast Feedback */}
      <div
        id="app-launch-toast"
        role="status"
        aria-live="polite"
        className={`fixed ${
          isElectronWindow ? 'bottom-4 right-4' : 'bottom-16 left-6'
        } bg-slate-900/95 border border-indigo-500/40 text-white px-4 py-3 rounded-2xl shadow-2xl backdrop-blur-md flex items-center gap-3 transition-all duration-300 z-50 ${
          toast
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 pointer-events-none translate-y-4'
        }`}
      >
        <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
          <DynamicIcon name={toast?.icon || 'rocket'} className="w-5 h-5" />
        </div>
        <div>
          <div id="toast-title" className="text-xs font-semibold text-white">
            {toast?.title || 'Launching Application...'}
          </div>
          <div
            id="toast-cmd"
            className="text-[11px] font-mono text-slate-400 max-w-xs truncate"
          >
            {toast?.subtitle || ''}
          </div>
        </div>
      </div>

      {/* Screen Right-Edge Peek Handle (When Panel is Closed) */}
      <button
        type="button"
        id="edge-peek-handle"
        data-testid="edge-peek-handle"
        onClick={() => togglePanel(true)}
        aria-label={`Open SideFlow Panel (${shortcut.label})`}
        title={`Open SideFlow Panel (${shortcut.label})`}
        className={`fixed right-0 top-1/2 -translate-y-1/2 z-30 bg-indigo-600/80 hover:bg-indigo-500 text-white py-6 px-1.5 rounded-l-xl shadow-lg border-y border-l border-indigo-300/40 transition-all duration-300 hover:px-2.5 group ${
          !isPanelOpen && showEdgeHandle
            ? 'opacity-100'
            : 'opacity-0 pointer-events-none'
        }`}
      >
        <ChevronLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
      </button>

      {/* Main Slide-Out Side Panel */}
      <aside
        id="side-panel"
        data-testid="side-panel"
        aria-label="SideFlow Utility Panel"
        className={`fixed top-0 right-0 ${
          isElectronWindow ? 'bottom-0 w-full' : 'bottom-12 w-full sm:w-[500px] md:w-[560px]'
        } bg-slate-900/90 backdrop-blur-2xl border-l border-slate-700/70 shadow-[-20px_0_50px_rgba(0,0,0,0.65)] z-30 flex flex-col side-panel-transition ${
          isPanelOpen
            ? 'translate-x-0'
            : 'translate-x-full opacity-0 pointer-events-none'
        }`}
      >
        <Header
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          isPinned={isPinned}
          onTogglePin={() => togglePin()}
          onClosePanel={() => togglePanel(false)}
          shortcutLabel={shortcut.label}
        />

        {activeTab === 'drawers' && (
          <DockView
            drawers={drawers}
            onChangeDrawers={setDrawers}
            onNotify={notify}
          />
        )}

        {activeTab === 'flowchart' && (
          <FlowCanvas
            flowData={flowData}
            onChangeFlowData={setFlowData}
            onNotify={notify}
          />
        )}

        {activeTab === 'notes' && (
          <NotesView
            notes={notes}
            onChangeNotes={setNotes}
            onNotify={notify}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            shortcut={shortcut}
            isRecordingHotkey={isRecordingHotkey}
            onStartRecordingHotkey={() => setIsRecordingHotkey(true)}
            onResetHotkey={handleResetHotkey}
            isPinned={isPinned}
            onTogglePin={togglePin}
            showEdgeHandle={showEdgeHandle}
            onToggleEdgeHandle={setShowEdgeHandle}
            onOpenElectronModal={() => setIsElectronModalOpen(true)}
            onExportBackup={handleExportBackup}
            onResetAllData={handleResetAllData}
          />
        )}
      </aside>

      {/* Electron Wrapper Modal */}
      <ElectronModal
        isOpen={isElectronModalOpen}
        onClose={() => setIsElectronModalOpen(false)}
        onNotify={notify}
      />
    </div>
  );
};

export default App;
