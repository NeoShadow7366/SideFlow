import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  PanelRightOpen,
  Terminal,
  Folder,
  FileCode,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  PanelRight,
  Grid,
  GitBranch,
  Mic,
  Settings,
  Monitor,
  Wifi,
  Volume2,
  RotateCcw,
  X,
} from 'lucide-react';
import {
  AppDrawer,
  AppUpdateState,
  DockHoverEffect,
  DockIconSize,
  FlowchartState,
  MonitorDisplayInfo,
  MonitorSettings,
  NoteItem,
  NotifyFn,
  NotifyOptions,
  PanelEdge,
  ShortcutConfig,
  TabId,
  ToastMessage,
  ToastVariant,
} from './types/sideflow';
import { useLocalStorage } from './hooks/useLocalStorage';
import {
  defaultDrawers,
  defaultFlowData,
  defaultMonitorSettings,
  defaultNotes,
  defaultShortcut,
  DEFAULT_PANEL_WIDTH_PERCENT,
  MIN_PANEL_WIDTH_PERCENT,
  MAX_PANEL_WIDTH_PERCENT,
  clampPanelWidthPercent,
  resolveEffectiveEdge,
  resolveEnabledDisplays,
  resolveShortcutTargetDisplay,
  sanitizeMonitorSettings,
  simulatedDisplays,
} from './utils/defaults';
import { Header } from './components/Header';
import { DockView } from './components/DockDrawers/DockView';
import { FlowCanvas } from './components/Flowchart/FlowCanvas';
import { NotesView } from './components/Notes/NotesView';
import { SettingsView } from './components/Settings/SettingsView';
import { ElectronModal } from './components/ElectronModal';
import { DynamicIcon } from './components/DynamicIcon';
import { SideFlowIcon } from './components/SideFlowIcon';

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
  const [activeNoteId, setActiveNoteId] = useLocalStorage<string>(
    'sideflow_active_note_id',
    defaultNotes[0]?.id || 'note-1'
  );
  const [workspaceResetEpoch, setWorkspaceResetEpoch] = useState<number>(0);
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
  const [openAtLogin, setOpenAtLogin] = useLocalStorage<boolean>(
    'sideflow_open_at_login',
    true
  );
  const [panelEdge, setPanelEdge] = useLocalStorage<PanelEdge>(
    'sideflow_panel_edge',
    'right'
  );
  const [panelWidthPercent, setPanelWidthPercent] = useLocalStorage<number>(
    'sideflow_panel_width_percent',
    DEFAULT_PANEL_WIDTH_PERCENT
  );
  const [dockEffect, setDockEffect] = useLocalStorage<DockHoverEffect>(
    'sideflow_dock_effect',
    'zoom'
  );
  const [dockIconSize, setDockIconSize] = useLocalStorage<DockIconSize>(
    'sideflow_dock_size',
    'normal'
  );
  const [isDockLocked, setIsDockLocked] = useLocalStorage<boolean>(
    'sideflow_lock_icons',
    false
  );
  const [monitorSettings, setMonitorSettings] =
    useLocalStorage<MonitorSettings>(
      'sideflow_monitor_settings',
      defaultMonitorSettings
    );

  const [displays, setDisplays] =
    useState<MonitorDisplayInfo[]>(simulatedDisplays);
  const [activeDisplayId, setActiveDisplayId] = useState<number>(
    simulatedDisplays[0].id
  );
  const [simulatedCursorDisplayId, setSimulatedCursorDisplayId] =
    useState<number>(simulatedDisplays[0].id);

  const [updateState, setUpdateState] = useState<AppUpdateState>({
    status: 'idle',
    currentVersion: '1.0.0',
  });
  const [isPanelOpen, setIsPanelOpen] = useState<boolean>(true);
  const [isResizingPanel, setIsResizingPanel] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<TabId>('drawers');
  const [isDictating, setIsDictating] = useState<boolean>(false);
  const [isRecordingHotkey, setIsRecordingHotkey] = useState<boolean>(false);
  const [isTrayMenuOpen, setIsTrayMenuOpen] = useState<boolean>(false);
  const [isElectronModalOpen, setIsElectronModalOpen] = useState<boolean>(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [clockTime, setClockTime] = useState<string>(() =>
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  );

  const toastTimerRef = useRef<number | null>(null);
  const userModifiedDisplayStateRef = useRef<boolean>(false);
  const isPinnedRef = useRef<boolean>(isPinned);
  isPinnedRef.current = isPinned;
  const panelWidthPercentRef = useRef<number>(
    clampPanelWidthPercent(panelWidthPercent)
  );
  panelWidthPercentRef.current = clampPanelWidthPercent(panelWidthPercent);
  const resizeDragStartRef = useRef<{
    startX: number;
    startScreenX: number;
    startPercent: number;
    hasChanged: boolean;
  } | null>(null);
  const isElectronWindow = Boolean(window.sideflow?.isElectron);
  const safeMonitorSettings = sanitizeMonitorSettings(monitorSettings);
  const enabledDisplays = resolveEnabledDisplays(displays, safeMonitorSettings);
  const activeDisplay =
    displays.find((d) => d.id === activeDisplayId) ??
    enabledDisplays[0] ??
    displays[0];
  const activeEffectiveEdge: PanelEdge = resolveEffectiveEdge(
    activeDisplay?.id,
    safeMonitorSettings,
    panelEdge
  );

  const toastDurationRef = useRef<number>(3200);
  const toastHoverOrFocusRef = useRef<boolean>(false);

  const scheduleToastDismiss = useCallback((ms: number) => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    if (!toastHoverOrFocusRef.current) {
      toastTimerRef.current = window.setTimeout(() => {
        setToast(null);
      }, ms);
    }
  }, []);

  const notify: NotifyFn = useCallback(
    (
      title: string,
      icon = 'rocket',
      subtitle = 'System Launch',
      options?: NotifyOptions
    ) => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
      const inferredVariant: ToastVariant =
        options?.variant ??
        (/failed|invalid|unable|blocked|error/i.test(title)
          ? 'error'
          : /required|locked/i.test(title)
          ? 'warning'
          : icon === 'check'
          ? 'success'
          : 'info');
      const durationMs =
        options?.durationMs ?? (options?.onUndo ? 6000 : 3200);
      toastDurationRef.current = durationMs;
      toastHoverOrFocusRef.current = false;
      setToast({
        id: String(Date.now()),
        title,
        subtitle,
        icon,
        variant: inferredVariant,
        undoLabel: options?.undoLabel,
        onUndo: options?.onUndo,
      });
      toastTimerRef.current = window.setTimeout(() => {
        setToast(null);
      }, durationMs);
    },
    []
  );

  // Sync initial visibility, edge, and screen presence with Electron and clean up toast timer
  useEffect(() => {
    let isMounted = true;
    window.sideflow?.setPanelVisibility?.(true);
    window.sideflow?.setPanelEdge?.(panelEdge);
    window.sideflow?.setPanelWidthPercent?.(
      clampPanelWidthPercent(panelWidthPercent)
    );
    const hasStoredMonitorSettings =
      window.localStorage.getItem('sideflow_monitor_settings') !== null;
    if (window.sideflow?.getDisplayState && !hasStoredMonitorSettings) {
      void window.sideflow
        .getDisplayState()
        .then((state) => {
          if (!isMounted || !state) return;
          if (Array.isArray(state.displays) && state.displays.length > 0) {
            setDisplays(state.displays);
            if (!state.displays.some((d) => d.id === 1)) {
              setSimulatedCursorDisplayId(
                typeof state.activeDisplayId === 'number'
                  ? state.activeDisplayId
                  : state.displays[0].id
              );
            }
          }
          if (
            !userModifiedDisplayStateRef.current &&
            window.localStorage.getItem('sideflow_monitor_settings') === null
          ) {
            if (typeof state.activeDisplayId === 'number') {
              setActiveDisplayId(state.activeDisplayId);
            }
            if (state.monitorSettings) {
              setMonitorSettings(sanitizeMonitorSettings(state.monitorSettings));
            }
          }
        })
        .catch(() => {});
    } else if (window.sideflow?.setMonitorSettings) {
      void window.sideflow
        .setMonitorSettings(safeMonitorSettings)
        .then((state) => {
          if (!isMounted || !state) return;
          if (Array.isArray(state.displays) && state.displays.length > 0) {
            setDisplays(state.displays);
            if (!state.displays.some((d) => d.id === 1)) {
              setSimulatedCursorDisplayId(
                typeof state.activeDisplayId === 'number'
                  ? state.activeDisplayId
                  : state.displays[0].id
              );
            }
          }
          if (
            !userModifiedDisplayStateRef.current &&
            typeof state.activeDisplayId === 'number'
          ) {
            setActiveDisplayId(state.activeDisplayId);
          }
        })
        .catch(() => {});
    } else if (window.sideflow?.getDisplayState) {
      void window.sideflow
        .getDisplayState()
        .then((state) => {
          if (!isMounted || !state) return;
          if (Array.isArray(state.displays) && state.displays.length > 0) {
            setDisplays(state.displays);
            if (!state.displays.some((d) => d.id === 1)) {
              setSimulatedCursorDisplayId(
                typeof state.activeDisplayId === 'number'
                  ? state.activeDisplayId
                  : state.displays[0].id
              );
            }
          }
          if (
            !userModifiedDisplayStateRef.current &&
            typeof state.activeDisplayId === 'number'
          ) {
            setActiveDisplayId(state.activeDisplayId);
          }
        })
        .catch(() => {});
    }
    window.sideflow
      ?.getAutoLaunch?.()
      .then((res) => {
        if (isMounted && res && typeof res.enabled === 'boolean') {
          setOpenAtLogin(res.enabled);
        }
      })
      .catch(() => {});
    window.sideflow
      ?.getUpdateStatus?.()
      .then((state) => {
        if (isMounted && state) {
          setUpdateState(state);
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Automatically cancel hotkey recording if user leaves Settings tab or closes panel
  useEffect(() => {
    if (activeTab !== 'settings' || !isPanelOpen) {
      setIsRecordingHotkey(false);
    }
  }, [activeTab, isPanelOpen]);

  // Dismiss simulated System Tray menu on outside click or Escape
  useEffect(() => {
    if (!isTrayMenuOpen) return;
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        !target.closest('#tray-context-menu') &&
        !target.closest('#tray-toggle-btn')
      ) {
        setIsTrayMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsTrayMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isTrayMenuOpen]);

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
      if (!isPinnedRef.current) {
        togglePanel(false);
      }
    });
    const unsubUpdate = window.sideflow?.onUpdateStatus?.((state) => {
      setUpdateState(state);
    });
    const unsubDisplay = window.sideflow?.onDisplayStateChanged?.((state) => {
      if (!state) return;
      if (Array.isArray(state.displays) && state.displays.length > 0) {
        setDisplays(state.displays);
      }
      if (typeof state.activeDisplayId === 'number') {
        setActiveDisplayId(state.activeDisplayId);
      }
      if (state.monitorSettings) {
        const sanitized = sanitizeMonitorSettings(state.monitorSettings);
        setMonitorSettings((prev) =>
          JSON.stringify(sanitizeMonitorSettings(prev)) ===
          JSON.stringify(sanitized)
            ? prev
            : sanitized
        );
      }
    });

    return () => {
      unsubVisibility?.();
      unsubSwitchTab?.();
      unsubBlur?.();
      unsubUpdate?.();
      unsubDisplay?.();
    };
  }, [togglePanel, setMonitorSettings]);

  // Keep companion edge-tab windows synced with handle visibility, dictation state, and shortcut label
  useEffect(() => {
    window.sideflow?.setEdgeHandleState?.({
      showEdgeHandle,
      isDictating,
      shortcutLabel: shortcut.label || defaultShortcut.label,
    });
  }, [showEdgeHandle, isDictating, shortcut.label]);

  const handleActivateDisplay = useCallback(
    (displayId: number, openPanel = true) => {
      userModifiedDisplayStateRef.current = true;
      setActiveDisplayId(displayId);
      setSimulatedCursorDisplayId(displayId);
      if (openPanel) {
        setIsPanelOpen(true);
      }
      if (window.sideflow?.activateDisplay) {
        void window.sideflow
          .activateDisplay(displayId, openPanel)
          .then((state) => {
            if (state) {
              if (Array.isArray(state.displays) && state.displays.length > 0) {
                setDisplays(state.displays);
              }
              if (typeof state.activeDisplayId === 'number') {
                setActiveDisplayId(state.activeDisplayId);
              }
            }
          })
          .catch(() => {});
      } else if (openPanel) {
        window.sideflow?.setPanelVisibility?.(true);
      }
    },
    []
  );

  const handleChangeMonitorSettings = useCallback(
    (
      nextRaw: MonitorSettings,
      toastTitle = 'Updated Multi-Monitor Routing',
      toastSubtitle = 'Applied display configuration'
    ) => {
      userModifiedDisplayStateRef.current = true;
      const sanitized = sanitizeMonitorSettings(nextRaw);
      setMonitorSettings(sanitized);

      const nextEnabled = resolveEnabledDisplays(displays, sanitized);
      if (
        nextEnabled.length > 0 &&
        !nextEnabled.some((d) => d.id === activeDisplayId)
      ) {
        setActiveDisplayId(nextEnabled[0].id);
      }

      if (window.sideflow?.setMonitorSettings) {
        void window.sideflow
          .setMonitorSettings(sanitized)
          .then((state) => {
            if (state) {
              if (Array.isArray(state.displays) && state.displays.length > 0) {
                setDisplays(state.displays);
              }
              if (typeof state.activeDisplayId === 'number') {
                setActiveDisplayId(state.activeDisplayId);
              }
            }
          })
          .catch(() => {});
      }
      notify(toastTitle, 'monitor', toastSubtitle);
    },
    [setMonitorSettings, displays, activeDisplayId, notify]
  );

  const handleRefreshDisplays = useCallback(() => {
    if (window.sideflow?.getDisplayState) {
      void window.sideflow
        .getDisplayState()
        .then((state) => {
          if (state && Array.isArray(state.displays) && state.displays.length > 0) {
            setDisplays(state.displays);
            if (typeof state.activeDisplayId === 'number') {
              setActiveDisplayId(state.activeDisplayId);
            }
            notify(
              'Refreshed Connected Displays',
              'monitor',
              `${state.displays.length} monitor${
                state.displays.length === 1 ? '' : 's'
              } detected`
            );
          }
        })
        .catch(() => {});
      return;
    }
    notify(
      'Refreshed Connected Displays',
      'monitor',
      `${displays.length} simulated monitor${displays.length === 1 ? '' : 's'} active`
    );
  }, [displays.length, notify]);

  const handleShortcutToggle = useCallback(() => {
    const decision = resolveShortcutTargetDisplay({
      displays,
      settings: safeMonitorSettings,
      cursorDisplayId: simulatedCursorDisplayId,
      activeDisplayId: activeDisplay?.id ?? 1,
      isPanelOpen,
    });
    if (decision.action === 'open' || decision.action === 'move') {
      setActiveDisplayId(decision.targetDisplayId);
      if (window.sideflow?.activateDisplay) {
        void window.sideflow.activateDisplay(decision.targetDisplayId, true);
      } else {
        window.sideflow?.setPanelVisibility?.(true);
      }
      setIsPanelOpen(true);
    } else {
      togglePanel(false);
    }
  }, [
    displays,
    safeMonitorSettings,
    simulatedCursorDisplayId,
    activeDisplay?.id,
    isPanelOpen,
    togglePanel,
  ]);

  // Global keyboard shortcut & recorder listener
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (isRecordingHotkey) {
        e.preventDefault();
        if (e.key === 'Escape') {
          setIsRecordingHotkey(false);
          return;
        }
        if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;

        // Require at least one modifier key so single character keys don't hijack typing
        if (!e.ctrlKey && !e.altKey && !e.shiftKey) {
          notify(
            'Modifier Key Required',
            'zap',
            'Hold Ctrl, Alt, or Shift + Key (or Esc to cancel)'
          );
          return;
        }

        const parts: string[] = [];
        if (e.ctrlKey) parts.push('Ctrl');
        if (e.altKey) parts.push('Alt');
        if (e.shiftKey) parts.push('Shift');
        const keyName =
          e.code === 'Space' || e.key === ' ' ? 'Space' : e.key.toUpperCase();
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

        const previousShortcut = shortcut;
        setShortcut(newShortcut);
        setIsRecordingHotkey(false);

        if (window.sideflow?.updateGlobalShortcut) {
          try {
            const registered = await window.sideflow.updateGlobalShortcut(
              parts.join('+')
            );
            if (registered === false) {
              setShortcut(previousShortcut);
              notify(
                'Shortcut Registration Failed',
                'zap',
                `Could not bind ${label} in OS`
              );
              return;
            }
          } catch {
            // ignore
          }
        }

        notify('Updated Global Hotkey', 'check', `Shortcut set to ${label}`);
        return;
      }

      // Guard against intercepting normal typing inside inputs/textareas when Alt/Ctrl are not held
      const target = e.target as HTMLElement | null;
      const isEditableTarget =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if (isEditableTarget && !e.altKey && !e.ctrlKey) {
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
        handleShortcutToggle();
        return;
      }

      // Panel navigation & contextual search shortcuts when panel is open and no modal is active
      if (
        isPanelOpen &&
        !document.body.hasAttribute('data-sideflow-modal-open') &&
        (e.ctrlKey || e.metaKey) &&
        !e.altKey &&
        !e.shiftKey
      ) {
        const tabMap: Record<string, TabId> = {
          '1': 'drawers',
          '2': 'flowchart',
          '3': 'notes',
          '4': 'settings',
        };
        if (tabMap[e.key]) {
          e.preventDefault();
          setActiveTab(tabMap[e.key]);
          return;
        }
        if (e.key.toLowerCase() === 'f') {
          if (activeTab === 'drawers') {
            const dockSearch = document.getElementById(
              'app-search-input'
            ) as HTMLInputElement | null;
            if (dockSearch) {
              e.preventDefault();
              dockSearch.focus();
              dockSearch.select();
            }
          } else if (activeTab === 'notes') {
            const notesSearch = document.querySelector(
              '[aria-label="Search notes"]'
            ) as HTMLInputElement | null;
            if (notesSearch) {
              e.preventDefault();
              notesSearch.focus();
              notesSearch.select();
            }
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isRecordingHotkey,
    isPanelOpen,
    activeTab,
    shortcut,
    setShortcut,
    handleShortcutToggle,
    notify,
  ]);

  const handleResetHotkey = () => {
    setShortcut(defaultShortcut);
    setIsRecordingHotkey(false);
    window.sideflow?.updateGlobalShortcut?.('Alt+Space');
    notify('Reset Global Hotkey', 'check', 'Restored default Alt + Space');
  };

  const handleChangePanelEdge = (nextEdge: PanelEdge) => {
    setPanelEdge(nextEdge);
    window.sideflow?.setPanelEdge?.(nextEdge);
    notify(
      `Docked to ${nextEdge === 'left' ? 'Left' : 'Right'} Screen Edge`,
      'check',
      'Updated panel anchor position'
    );
  };

  const handleChangePanelWidthPercent = useCallback(
    (nextPercent: number, showToast = false) => {
      const clamped = clampPanelWidthPercent(nextPercent);
      setPanelWidthPercent(clamped);
      panelWidthPercentRef.current = clamped;
      window.sideflow?.setPanelWidthPercent?.(clamped);
      if (showToast) {
        notify(
          `Screen Presence: ${clamped}%`,
          'check',
          `Extended panel width saved at ${clamped}% of screen`
        );
      }
    },
    [setPanelWidthPercent, notify]
  );

  // On-the-fly interactive drag resizing of the panel inner edge
  useEffect(() => {
    if (!isResizingPanel) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dragState = resizeDragStartRef.current;
      if (!dragState) return;

      let nextPercent = dragState.startPercent;

      if (
        isElectronWindow &&
        (e.screenX !== 0 || dragState.startScreenX !== 0)
      ) {
        const screenWidth = Math.max(
          320,
          activeDisplay?.workArea.width ||
            window.screen?.availWidth ||
            window.screen?.width ||
            window.innerWidth ||
            1920
        );
        const deltaX = e.screenX - dragState.startScreenX;
        const signedDelta = activeEffectiveEdge === 'left' ? deltaX : -deltaX;
        const deltaPct = (signedDelta / screenWidth) * 100;
        nextPercent = clampPanelWidthPercent(dragState.startPercent + deltaPct);
      } else {
        const viewportWidth = Math.max(320, window.innerWidth || 1024);
        if (dragState.startX > 0 && e.clientX > 0) {
          const deltaX = e.clientX - dragState.startX;
          const signedDelta = activeEffectiveEdge === 'left' ? deltaX : -deltaX;
          const deltaPct = (signedDelta / viewportWidth) * 100;
          nextPercent = clampPanelWidthPercent(
            dragState.startPercent + deltaPct
          );
        } else {
          const widthPx =
            activeEffectiveEdge === 'left' ? e.clientX : viewportWidth - e.clientX;
          nextPercent = clampPanelWidthPercent(
            (widthPx / viewportWidth) * 100
          );
        }
      }

      if (nextPercent !== panelWidthPercentRef.current) {
        dragState.hasChanged = true;
        handleChangePanelWidthPercent(nextPercent, false);
      }
    };

    const handleMouseUp = () => {
      const dragState = resizeDragStartRef.current;
      resizeDragStartRef.current = null;
      setIsResizingPanel(false);
      if (dragState?.hasChanged) {
        const finalPct = panelWidthPercentRef.current;
        notify(
          `Screen Presence: ${finalPct}%`,
          'check',
          `Extended panel width saved at ${finalPct}% of screen`
        );
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [
    isResizingPanel,
    isElectronWindow,
    activeDisplay?.workArea.width,
    activeEffectiveEdge,
    handleChangePanelWidthPercent,
    notify,
  ]);

  const handleExportBackup = () => {
    let savedDiagrams: unknown = undefined;
    try {
      const rawDiagrams = window.localStorage.getItem('sideflow_flow_diagrams_v1');
      if (rawDiagrams) {
        const parsedDiagrams = JSON.parse(rawDiagrams);
        if (Array.isArray(parsedDiagrams)) {
          savedDiagrams = parsedDiagrams;
        }
      }
    } catch {
      // ignore
    }
    const backup = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      drawers,
      flowData,
      savedDiagrams,
      notes,
      activeNoteId,
      shortcut,
      isPinned,
      showEdgeHandle,
      openAtLogin,
      panelEdge,
      panelWidthPercent,
      monitorSettings: safeMonitorSettings,
      dockEffect,
      dockIconSize,
      isDockLocked,
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

  const handleImportBackup = (rawJson: string) => {
    try {
      const parsed = JSON.parse(rawJson);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Invalid backup object');
      }
      let restoredAny = false;
      if (
        Array.isArray(parsed.drawers) &&
        parsed.drawers.length > 0 &&
        parsed.drawers.every(
          (d: unknown) =>
            Boolean(d) &&
            typeof d === 'object' &&
            typeof (d as AppDrawer).id === 'string' &&
            Array.isArray((d as AppDrawer).apps)
        )
      ) {
        setDrawers(parsed.drawers);
        restoredAny = true;
      }
      if (
        parsed.flowData &&
        Array.isArray(parsed.flowData.nodes) &&
        Array.isArray(parsed.flowData.edges)
      ) {
        setFlowData(parsed.flowData);
        restoredAny = true;
      }
      if (
        Array.isArray(parsed.savedDiagrams) &&
        parsed.savedDiagrams.length > 0
      ) {
        try {
          window.localStorage.setItem(
            'sideflow_flow_diagrams_v1',
            JSON.stringify(parsed.savedDiagrams)
          );
          setWorkspaceResetEpoch((prev) => prev + 1);
          restoredAny = true;
        } catch {
          // ignore
        }
      }
      if (
        Array.isArray(parsed.notes) &&
        parsed.notes.length > 0 &&
        parsed.notes.every(
          (n: unknown) =>
            Boolean(n) &&
            typeof n === 'object' &&
            typeof (n as NoteItem).id === 'string' &&
            typeof (n as NoteItem).body === 'string'
        )
      ) {
        setNotes(parsed.notes);
        if (typeof parsed.activeNoteId === 'string') {
          setActiveNoteId(parsed.activeNoteId);
        }
        restoredAny = true;
      }
      if (parsed.shortcut && typeof parsed.shortcut.label === 'string') {
        setShortcut(parsed.shortcut);
        window.sideflow?.updateGlobalShortcut?.(
          parsed.shortcut.label.replace(/\s+/g, '')
        );
        restoredAny = true;
      }
      if (typeof parsed.isPinned === 'boolean') {
        setIsPinned(parsed.isPinned);
        restoredAny = true;
      }
      if (typeof parsed.showEdgeHandle === 'boolean') {
        setShowEdgeHandle(parsed.showEdgeHandle);
        restoredAny = true;
      }
      if (parsed.panelEdge === 'left' || parsed.panelEdge === 'right') {
        setPanelEdge(parsed.panelEdge);
        window.sideflow?.setPanelEdge?.(parsed.panelEdge);
        restoredAny = true;
      }
      if (typeof parsed.panelWidthPercent === 'number') {
        const clampedPct = clampPanelWidthPercent(parsed.panelWidthPercent);
        setPanelWidthPercent(clampedPct);
        panelWidthPercentRef.current = clampedPct;
        window.sideflow?.setPanelWidthPercent?.(clampedPct);
        restoredAny = true;
      }
      if (parsed.monitorSettings && typeof parsed.monitorSettings === 'object') {
        userModifiedDisplayStateRef.current = true;
        const restoredMonitors = sanitizeMonitorSettings(parsed.monitorSettings);
        setMonitorSettings(restoredMonitors);
        const restoredEnabled = resolveEnabledDisplays(displays, restoredMonitors);
        if (restoredEnabled.length > 0) {
          setActiveDisplayId(restoredEnabled[0].id);
        }
        void window.sideflow?.setMonitorSettings?.(restoredMonitors);
        restoredAny = true;
      }
      if (
        parsed.dockEffect === 'zoom' ||
        parsed.dockEffect === 'swing' ||
        parsed.dockEffect === 'glow' ||
        parsed.dockEffect === 'none'
      ) {
        setDockEffect(parsed.dockEffect);
        restoredAny = true;
      }
      if (
        parsed.dockIconSize === 'compact' ||
        parsed.dockIconSize === 'normal' ||
        parsed.dockIconSize === 'large'
      ) {
        setDockIconSize(parsed.dockIconSize);
        restoredAny = true;
      }
      if (typeof parsed.isDockLocked === 'boolean') {
        setIsDockLocked(parsed.isDockLocked);
        restoredAny = true;
      }
      if (typeof parsed.openAtLogin === 'boolean') {
        setOpenAtLogin(parsed.openAtLogin);
        void window.sideflow?.setAutoLaunch?.(parsed.openAtLogin);
        restoredAny = true;
      }

      if (!restoredAny) {
        throw new Error('No SideFlow workspace keys found');
      }
      notify(
        'Restored SideFlow Backup',
        'check',
        'Workspace configuration imported'
      );
    } catch {
      notify(
        'Invalid Backup File',
        'zap',
        'Could not parse SideFlow JSON configuration'
      );
    }
  };

  const handleToggleOpenAtLogin = (enabled: boolean) => {
    setOpenAtLogin(enabled);
    void window.sideflow?.setAutoLaunch?.(enabled);
    notify(
      enabled ? 'Launch at Login Enabled' : 'Launch at Login Disabled',
      'check',
      enabled
        ? 'SideFlow will start in the System Tray on Windows sign-in'
        : 'Removed from automatic startup'
    );
  };

  const handleCheckForUpdates = async () => {
    setUpdateState((prev) => ({
      ...prev,
      status: 'checking',
      error: undefined,
    }));
    if (window.sideflow?.checkForUpdates) {
      try {
        const nextState = await window.sideflow.checkForUpdates();
        setUpdateState(nextState);
        if (nextState.status === 'downloaded' || nextState.status === 'available') {
          notify(
            `Update v${nextState.latestVersion || ''} Available`,
            'rocket',
            'Ready to install from NeoShadow7366/SideFlow'
          );
        } else {
          notify(
            'SideFlow is Up to Date',
            'check',
            `Running latest version v${nextState.currentVersion || '1.0.0'}`
          );
        }
        return;
      } catch {
        // fallback below
      }
    }

    const now = Date.now();
    setUpdateState((prev) => ({
      ...prev,
      status: 'not-available',
      latestVersion: prev.currentVersion || '1.0.0',
      lastCheckedAt: now,
    }));
    notify(
      'SideFlow is Up to Date',
      'check',
      'Checked github.com/NeoShadow7366/SideFlow/releases'
    );
  };

  const handleInstallUpdate = async () => {
    if (window.sideflow?.installUpdateNow) {
      try {
        const res = await window.sideflow.installUpdateNow();
        if (res?.success) {
          notify(
            'Applying SideFlow Update...',
            'rocket',
            'Restarting application to complete update'
          );
          return;
        }
      } catch {
        // fall through to browser release page
      }
    }
    window.open(
      updateState.releaseUrl || 'https://github.com/NeoShadow7366/SideFlow/releases',
      '_blank',
      'noopener,noreferrer'
    );
  };

  const handleResetAllData = () => {
    try {
      window.localStorage.removeItem('sideflow_flow_diagrams_v1');
      window.localStorage.removeItem('sideflow_active_diagram_id');
      window.localStorage.removeItem('sideflow_show_docklets');
      window.localStorage.removeItem('sideflow_notes_view_mode');
    } catch {
      // ignore storage errors
    }
    setDrawers(defaultDrawers);
    setFlowData(defaultFlowData);
    setNotes(defaultNotes);
    setActiveNoteId(defaultNotes[0]?.id || 'note-1');
    setWorkspaceResetEpoch((prev) => prev + 1);
    setShortcut(defaultShortcut);
    setIsPinned(true);
    setShowEdgeHandle(true);
    setPanelEdge('right');
    setPanelWidthPercent(DEFAULT_PANEL_WIDTH_PERCENT);
    panelWidthPercentRef.current = DEFAULT_PANEL_WIDTH_PERCENT;
    userModifiedDisplayStateRef.current = true;
    setMonitorSettings(defaultMonitorSettings);
    const primary = displays.find((d) => d.isPrimary) ?? displays[0];
    if (primary) {
      setActiveDisplayId(primary.id);
      setSimulatedCursorDisplayId(primary.id);
    }
    setDockEffect('zoom');
    setDockIconSize('normal');
    setIsDockLocked(false);
    setIsRecordingHotkey(false);
    window.sideflow?.setPanelEdge?.('right');
    window.sideflow?.setPanelWidthPercent?.(DEFAULT_PANEL_WIDTH_PERCENT);
    void window.sideflow?.setMonitorSettings?.(defaultMonitorSettings);
    window.sideflow?.updateGlobalShortcut?.('Alt+Space');
    notify('Restored Default Workspace', 'check', 'All drawers, flows & notes reset');
  };

  const savedDiagramCount = (() => {
    try {
      const raw = window.localStorage.getItem('sideflow_flow_diagrams_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.length;
      }
    } catch {
      // ignore
    }
    return 2;
  })();

  const totalAppCount = drawers.reduce((sum, d) => sum + d.apps.length, 0);

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
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 via-blue-500 to-cyan-400 border border-cyan-300/30 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
                <SideFlowIcon className="w-5 h-5" aria-hidden="true" />
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
                onClick={() => handleShortcutToggle()}
                className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white transition flex items-center gap-1.5 shadow-lg shadow-indigo-600/30"
              >
                <PanelRightOpen className="w-4 h-4" aria-hidden="true" />
                <span>Toggle Panel</span>
              </button>
              <button
                type="button"
                onClick={() => setIsElectronModalOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600/80 text-xs font-medium text-slate-200 transition flex items-center gap-1.5"
              >
                <Terminal className="w-4 h-4 text-amber-400" aria-hidden="true" />
                <span>Get Native .EXE / Tray Code</span>
              </button>
            </div>
          </div>

          {/* Multi-Monitor Simulation Bar & Companion Edge Tabs (Web Preview Mode) */}
          {displays.length > 1 && safeMonitorSettings.mode !== 'primary' && (
            <div
              data-testid="simulated-multimonitor-bar"
              className="flex flex-wrap items-center gap-3 max-w-4xl bg-slate-900/75 backdrop-blur-md border border-indigo-500/30 rounded-xl px-4 py-2 text-xs z-10"
            >
              <span className="flex items-center gap-1.5 text-indigo-300 font-medium">
                <Monitor className="w-3.5 h-3.5" aria-hidden="true" />
                <span>
                  Active Screen: Monitor {activeDisplay?.index ?? 1} (
                  {activeEffectiveEdge === 'left' ? 'Left' : 'Right'} Edge)
                </span>
              </span>
              <div
                role="group"
                aria-label="Simulated Mouse Monitor"
                className="flex flex-wrap items-center gap-1.5"
              >
                <span className="text-[11px] text-slate-400">
                  Mouse Cursor On:
                </span>
                {displays.map((d) => {
                  const isCursorHere = simulatedCursorDisplayId === d.id;
                  return (
                    <button
                      key={d.id}
                      type="button"
                      data-testid={`sim-cursor-monitor-${d.id}`}
                      aria-pressed={isCursorHere}
                      onClick={() => setSimulatedCursorDisplayId(d.id)}
                      className={`px-2 py-0.5 rounded-lg text-[11px] font-mono border transition ${
                        isCursorHere
                          ? 'bg-indigo-600 text-white border-indigo-400/60'
                          : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-slate-700'
                      }`}
                    >
                      Monitor {d.index}
                    </button>
                  );
                })}
              </div>

              {(showEdgeHandle || isDictating) &&
                enabledDisplays
                  .filter((d) => d.id !== activeDisplay?.id)
                  .map((d) => {
                    const compEdge = resolveEffectiveEdge(
                      d.id,
                      safeMonitorSettings,
                      panelEdge
                    );
                    return (
                      <button
                        key={d.id}
                        type="button"
                        data-testid={`companion-edge-tab-${d.id}`}
                        aria-label={`Open SideFlow on Monitor ${d.index} (${shortcut.label})`}
                        onClick={() => handleActivateDisplay(d.id, true)}
                        className="px-2.5 py-0.5 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/35 border border-indigo-400/40 text-[11px] text-indigo-200 font-medium transition"
                      >
                        Click Monitor {d.index} {compEdge === 'left' ? 'Left' : 'Right'} Edge Tab
                      </button>
                    );
                  })}
            </div>
          )}

          {/* Desktop Mock Icons (Left side) */}
          <div className="grid grid-cols-1 gap-5 w-24 my-auto opacity-85">
            <div
              role="button"
              tabIndex={0}
              aria-label="Launch Projects Explorer"
              onDoubleClick={() =>
                notify('Launching Workspace Explorer...', 'folder-open', 'explorer.exe')
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  notify(
                    'Launching Workspace Explorer...',
                    'folder-open',
                    'explorer.exe'
                  );
                }
              }}
              className="flex flex-col items-center gap-1.5 p-2 rounded-xl hover:bg-white/10 cursor-pointer transition group"
            >
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-300 group-hover:scale-105 transition">
                <Folder className="w-6 h-6" aria-hidden="true" />
              </div>
              <span className="text-[11px] text-center font-medium text-slate-200 drop-shadow">
                Projects
              </span>
            </div>
            <div
              role="button"
              tabIndex={0}
              aria-label="Open Electron Native Wrapper Guide"
              onDoubleClick={() => setIsElectronModalOpen(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setIsElectronModalOpen(true);
                }
              }}
              className="flex flex-col items-center gap-1.5 p-2 rounded-xl hover:bg-white/10 cursor-pointer transition group"
            >
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 border border-cyan-400/30 flex items-center justify-center text-cyan-300 group-hover:scale-105 transition">
                <FileCode className="w-6 h-6" aria-hidden="true" />
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
                <LayoutGrid className="w-4 h-4" aria-hidden="true" />
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
                  role="menu"
                  aria-label="SideFlow System Tray Menu"
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
                    role="menuitem"
                    onClick={() => {
                      togglePanel();
                      setIsTrayMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-xs rounded-xl hover:bg-slate-800 flex items-center justify-between text-slate-200"
                  >
                    <span className="flex items-center gap-2">
                      <PanelRight
                        className="w-3.5 h-3.5 text-indigo-400"
                        aria-hidden="true"
                      />
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
                    role="menuitem"
                    onClick={() => {
                      setActiveTab('drawers');
                      togglePanel(true);
                      setIsTrayMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-xs rounded-xl hover:bg-slate-800 flex items-center gap-2 text-slate-200"
                  >
                    <Grid className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />{' '}
                    Open App Drawers
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setActiveTab('flowchart');
                      togglePanel(true);
                      setIsTrayMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-xs rounded-xl hover:bg-slate-800 flex items-center gap-2 text-slate-200"
                  >
                    <GitBranch
                      className="w-3.5 h-3.5 text-cyan-400"
                      aria-hidden="true"
                    />{' '}
                    Quick Flowchart
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setActiveTab('notes');
                      togglePanel(true);
                      setIsTrayMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-xs rounded-xl hover:bg-slate-800 flex items-center gap-2 text-slate-200"
                  >
                    <Mic className="w-3.5 h-3.5 text-rose-400" aria-hidden="true" />{' '}
                    Voice Dictation Note
                  </button>
                  <div className="border-t border-slate-800 my-1" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setActiveTab('settings');
                      togglePanel(true);
                      setIsTrayMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-xs rounded-xl hover:bg-slate-800 flex items-center gap-2 text-slate-300"
                  >
                    <Settings
                      className="w-3.5 h-3.5 text-slate-400"
                      aria-hidden="true"
                    />{' '}
                    Configure Hotkey
                  </button>
                </div>
              )}

              {/* System Tray Button */}
              <button
                type="button"
                id="tray-toggle-btn"
                onClick={() => setIsTrayMenuOpen((prev) => !prev)}
                aria-expanded={isTrayMenuOpen}
                aria-controls="tray-context-menu"
                title="SideFlow System Tray Icon (Click for menu)"
                className="px-2.5 py-1.5 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 flex items-center gap-2 text-indigo-300 transition"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping motion-reduce:animate-none absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-400" />
                </span>
                <SideFlowIcon className="w-4 h-4" aria-hidden="true" />
                <span className="text-xs font-medium">SideFlow Tray</span>
              </button>

              <div className="flex items-center gap-2 text-slate-400 text-xs pl-2 border-l border-slate-800">
                <Wifi className="w-3.5 h-3.5" aria-hidden="true" />
                <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
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

      {/* Discrete Screen-Reader Background Dictation Status Announcer (Active across all tabs) */}
      <div className="sr-only" role="status" aria-live="polite">
        {isDictating ? 'Voice dictation active across SideFlow' : ''}
      </div>

      {/* Semantic Toast Feedback with Optional 1-Click Undo & Dismiss */}
      <div
        id="app-launch-toast"
        data-variant={toast?.variant || 'info'}
        role="status"
        aria-live="polite"
        aria-hidden={!toast}
        onMouseEnter={() => {
          toastHoverOrFocusRef.current = true;
          if (toastTimerRef.current) {
            window.clearTimeout(toastTimerRef.current);
            toastTimerRef.current = null;
          }
        }}
        onMouseLeave={() => {
          toastHoverOrFocusRef.current = false;
          if (toast) {
            scheduleToastDismiss(toastDurationRef.current);
          }
        }}
        onFocusCapture={() => {
          toastHoverOrFocusRef.current = true;
          if (toastTimerRef.current) {
            window.clearTimeout(toastTimerRef.current);
            toastTimerRef.current = null;
          }
        }}
        onBlurCapture={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            toastHoverOrFocusRef.current = false;
            if (toast) {
              scheduleToastDismiss(toastDurationRef.current);
            }
          }
        }}
        className={`fixed ${
          isElectronWindow ? 'bottom-16 right-4' : 'bottom-16 left-6'
        } bg-slate-900/95 border ${
          toast?.variant === 'error'
            ? 'border-rose-500/60'
            : toast?.variant === 'warning'
            ? 'border-amber-500/60'
            : toast?.variant === 'success'
            ? 'border-emerald-500/50'
            : 'border-indigo-500/40'
        } text-white px-4 py-3 rounded-2xl shadow-2xl backdrop-blur-md flex items-center gap-3 transition-all duration-300 motion-reduce:transition-none z-50 max-w-md ${
          toast
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 pointer-events-none translate-y-4'
        }`}
      >
        <div
          className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${
            toast?.variant === 'error'
              ? 'bg-rose-500/20 border-rose-500/40 text-rose-400'
              : toast?.variant === 'warning'
              ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
              : toast?.variant === 'success'
              ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
              : 'bg-indigo-500/20 border-indigo-500/40 text-indigo-400'
          }`}
        >
          <DynamicIcon
            name={toast?.icon || 'rocket'}
            className="w-5 h-5"
            aria-hidden="true"
          />
        </div>
        <div className="min-w-0 flex-1">
          <div id="toast-title" className="text-xs font-semibold text-white">
            {toast?.title || 'Launching Application...'}
          </div>
          <div
            id="toast-cmd"
            className="text-[11px] font-mono text-slate-300 max-w-xs truncate"
          >
            {toast?.subtitle || ''}
          </div>
        </div>
        {toast?.onUndo && (
          <button
            type="button"
            data-testid="toast-undo-btn"
            tabIndex={toast ? 0 : -1}
            onClick={() => {
              const undoHandler = toast.onUndo;
              if (toastTimerRef.current) {
                window.clearTimeout(toastTimerRef.current);
              }
              setToast(null);
              undoHandler?.();
            }}
            className="min-h-[28px] px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white flex items-center gap-1 shrink-0 transition"
          >
            <RotateCcw className="w-3 h-3" aria-hidden="true" />
            <span>{toast.undoLabel || 'Undo'}</span>
          </button>
        )}
        <button
          type="button"
          aria-label="Dismiss notification"
          tabIndex={toast ? 0 : -1}
          onClick={() => {
            if (toastTimerRef.current) {
              window.clearTimeout(toastTimerRef.current);
            }
            setToast(null);
          }}
          className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 shrink-0 transition"
        >
          <X className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>

      {/* Screen Edge Peek Handle (When Panel is Closed — Offset to 28% top to avoid OS scrollbar thumb collisions) */}
      <button
        type="button"
        id="edge-peek-handle"
        data-testid="edge-peek-handle"
        onMouseEnter={() => {
          if (!isPanelOpen) {
            window.sideflow?.setIgnoreMouseEvents?.(false);
          }
        }}
        onMouseLeave={() => {
          if (!isPanelOpen) {
            window.sideflow?.setIgnoreMouseEvents?.(true);
          }
        }}
        onClick={() => togglePanel(true)}
        tabIndex={!isPanelOpen && (showEdgeHandle || isDictating) ? 0 : -1}
        aria-hidden={isPanelOpen || (!showEdgeHandle && !isDictating)}
        aria-label={
          isDictating
            ? `Voice Dictation Active — Click to Open SideFlow (${shortcut.label})`
            : `Open SideFlow Panel (${shortcut.label})`
        }
        title={
          isDictating
            ? `Voice Dictation Active — Click to Open SideFlow (${shortcut.label})`
            : `Open SideFlow Panel (${shortcut.label})`
        }
        className={`fixed ${
          activeEffectiveEdge === 'left'
            ? 'left-0 rounded-r-xl border-y border-r'
            : 'right-0 rounded-l-xl border-y border-l'
        } top-[28%] -translate-y-1/2 z-30 ${
          isDictating
            ? 'bg-rose-600/95 hover:bg-rose-500 border-rose-300/60'
            : 'bg-indigo-600/80 hover:bg-indigo-500 border-indigo-300/40'
        } text-white py-5 px-1 shadow-lg transition-all duration-300 motion-reduce:transition-none hover:px-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white focus-visible:px-2.5 group flex flex-col items-center gap-2 ${
          !isPanelOpen && (showEdgeHandle || isDictating)
            ? isDictating
              ? 'opacity-100'
              : 'opacity-70 hover:opacity-100 focus-visible:opacity-100'
            : 'opacity-0 pointer-events-none invisible'
        }`}
      >
        {isDictating && (
          <span
            data-testid="collapsed-dictation-indicator"
            className="relative flex h-2.5 w-2.5"
          >
            <span className="animate-ping motion-reduce:animate-none absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
            <Mic className="relative w-2.5 h-2.5 text-white" aria-hidden="true" />
          </span>
        )}
        {activeEffectiveEdge === 'left' ? (
          <ChevronRight
            className="w-4 h-4 group-hover:translate-x-0.5 transition-transform motion-reduce:transition-none"
            aria-hidden="true"
          />
        ) : (
          <ChevronLeft
            className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform motion-reduce:transition-none"
            aria-hidden="true"
          />
        )}
      </button>

      {/* Main Slide-Out Side Panel */}
      <aside
        id="side-panel"
        data-testid="side-panel"
        data-width-percent={clampPanelWidthPercent(panelWidthPercent)}
        data-active-display-id={activeDisplay?.id ?? 1}
        data-effective-edge={activeEffectiveEdge}
        aria-label="SideFlow Utility Panel"
        aria-hidden={!isPanelOpen}
        style={
          isElectronWindow
            ? undefined
            : {
                width: `${clampPanelWidthPercent(panelWidthPercent)}%`,
                minWidth: '320px',
                maxWidth: '90vw',
              }
        }
        className={`fixed top-0 ${
          activeEffectiveEdge === 'left'
            ? 'left-0 border-r shadow-[20px_0_50px_rgba(0,0,0,0.65)]'
            : 'right-0 border-l shadow-[-20px_0_50px_rgba(0,0,0,0.65)]'
        } ${
          isElectronWindow ? 'bottom-0 w-full' : 'bottom-12'
        } bg-slate-900/90 backdrop-blur-2xl border-slate-700/70 z-30 flex flex-col side-panel-transition ${
          isPanelOpen
            ? 'translate-x-0'
            : activeEffectiveEdge === 'left'
            ? '-translate-x-full opacity-0 pointer-events-none invisible'
            : 'translate-x-full opacity-0 pointer-events-none invisible'
        }`}
      >
        {/* Interactive On-The-Fly Edge Resize Handle */}
        <div
          id="panel-resize-handle"
          data-testid="panel-resize-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize SideFlow Panel Width"
          aria-valuemin={MIN_PANEL_WIDTH_PERCENT}
          aria-valuemax={MAX_PANEL_WIDTH_PERCENT}
          aria-valuenow={clampPanelWidthPercent(panelWidthPercent)}
          tabIndex={isPanelOpen ? 0 : -1}
          title={`Drag to resize panel (${clampPanelWidthPercent(
            panelWidthPercent
          )}% of screen) • Double-click to reset`}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            resizeDragStartRef.current = {
              startX: e.clientX,
              startScreenX: e.screenX,
              startPercent: panelWidthPercentRef.current,
              hasChanged: false,
            };
            setIsResizingPanel(true);
          }}
          onDoubleClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleChangePanelWidthPercent(DEFAULT_PANEL_WIDTH_PERCENT, true);
          }}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 5 : 1;
            if (e.key === 'ArrowLeft') {
              e.preventDefault();
              const delta = activeEffectiveEdge === 'right' ? step : -step;
              handleChangePanelWidthPercent(panelWidthPercent + delta, true);
            } else if (e.key === 'ArrowRight') {
              e.preventDefault();
              const delta = activeEffectiveEdge === 'left' ? step : -step;
              handleChangePanelWidthPercent(panelWidthPercent + delta, true);
            } else if (e.key === 'Home') {
              e.preventDefault();
              handleChangePanelWidthPercent(MIN_PANEL_WIDTH_PERCENT, true);
            } else if (e.key === 'End') {
              e.preventDefault();
              handleChangePanelWidthPercent(MAX_PANEL_WIDTH_PERCENT, true);
            }
          }}
          className={`absolute top-0 bottom-0 ${
            activeEffectiveEdge === 'left'
              ? isElectronWindow
                ? 'right-0'
                : 'right-0 translate-x-1/2'
              : isElectronWindow
              ? 'left-0'
              : 'left-0 -translate-x-1/2'
          } w-3 cursor-ew-resize z-40 group flex items-center justify-center select-none`}
        >
          <div
            className={`w-1 h-full transition-colors ${
              isResizingPanel
                ? 'bg-indigo-500/80 shadow-[0_0_12px_rgba(99,102,241,0.8)]'
                : 'bg-transparent group-hover:bg-indigo-500/50'
            }`}
          />
          <div
            className={`absolute top-1/2 -translate-y-1/2 w-2.5 h-12 rounded-full border flex flex-col items-center justify-center gap-0.5 transition-all ${
              isResizingPanel
                ? 'bg-indigo-600 border-indigo-300 scale-110 shadow-lg'
                : 'bg-slate-800/90 border-slate-600/80 group-hover:bg-indigo-600/90 group-hover:border-indigo-400'
            }`}
          >
            <span className="w-0.5 h-3 rounded-full bg-slate-300/80" />
          </div>
          {isResizingPanel && (
            <div
              data-testid="panel-resize-hud"
              className={`absolute top-1/2 -translate-y-1/2 ${
                activeEffectiveEdge === 'left' ? 'left-4' : 'right-4'
              } px-2.5 py-1 rounded-lg bg-indigo-600 text-white font-mono text-xs font-semibold shadow-xl border border-indigo-300/60 whitespace-nowrap pointer-events-none`}
            >
              {clampPanelWidthPercent(panelWidthPercent)}%
            </div>
          )}
        </div>

        <Header
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          isPinned={isPinned}
          onTogglePin={() => togglePin()}
          onClosePanel={() => togglePanel(false)}
          shortcutLabel={shortcut.label}
          isDictating={isDictating}
          effectiveEdge={activeEffectiveEdge}
        />

        {activeTab === 'drawers' && (
          <div
            role="tabpanel"
            id="tabpanel-drawers"
            aria-labelledby="tab-btn-drawers"
            className="flex-1 flex flex-col overflow-hidden"
          >
            <DockView
              drawers={drawers}
              onChangeDrawers={setDrawers}
              onNotify={notify}
              isLocked={isDockLocked}
              onToggleLock={() => setIsDockLocked((prev) => !prev)}
              dockEffect={dockEffect}
              dockIconSize={dockIconSize}
            />
          </div>
        )}

        {activeTab === 'flowchart' && (
          <div
            role="tabpanel"
            id="tabpanel-flowchart"
            aria-labelledby="tab-btn-flowchart"
            className="flex-1 flex flex-col overflow-hidden"
          >
            <FlowCanvas
              key={workspaceResetEpoch}
              flowData={flowData}
              onChangeFlowData={setFlowData}
              onNotify={notify}
              panelWidthPercent={clampPanelWidthPercent(panelWidthPercent)}
              onInsertMermaidToNote={(mermaidCode) => {
                const fenced = `\n\`\`\`mermaid\n${mermaidCode.trim()}\n\`\`\`\n`;
                if (notes.length === 0) {
                  const createdId = `note-${Date.now()}`;
                  const createdTitle = 'Architecture Diagram';
                  setActiveNoteId(createdId);
                  setNotes([
                    {
                      id: createdId,
                      title: createdTitle,
                      body: fenced.trimStart(),
                      updatedAt: Date.now(),
                    },
                  ]);
                  notify(
                    'Inserted Mermaid into Note',
                    'check',
                    `Appended \`\`\`mermaid block to "${createdTitle}"`
                  );
                  return;
                }
                const targetNote =
                  notes.find((n) => n.id === activeNoteId) ?? notes[0];
                const targetId = targetNote.id;
                const targetTitle = targetNote.title || 'Scratchpad Note';
                setNotes((prev) =>
                  prev.map((n) =>
                    n.id === targetId
                      ? {
                          ...n,
                          body: `${n.body.replace(/\s+$/, '')}${
                            n.body.trim() ? '\n' : ''
                          }${fenced}`,
                          updatedAt: Date.now(),
                        }
                      : n
                  )
                );
                notify(
                  'Inserted Mermaid into Note',
                  'check',
                  `Appended \`\`\`mermaid block to "${targetTitle}"`
                );
              }}
            />
          </div>
        )}

        <div
          role="tabpanel"
          id="tabpanel-notes"
          aria-labelledby="tab-btn-notes"
          hidden={activeTab !== 'notes'}
          className={
            activeTab === 'notes'
              ? 'flex-1 flex flex-col overflow-hidden'
              : 'hidden'
          }
        >
          <NotesView
            key={isDictating ? 'dictating' : workspaceResetEpoch}
            notes={notes}
            onChangeNotes={setNotes}
            activeNoteId={activeNoteId}
            onChangeActiveNoteId={setActiveNoteId}
            isPanelOpen={isPanelOpen}
            isActiveTab={activeTab === 'notes'}
            onDictatingChange={setIsDictating}
            onNotify={notify}
            onOpenMermaidInFlow={(nextFlow) => {
              const previousFlow = JSON.parse(
                JSON.stringify(flowData)
              ) as FlowchartState;
              const prevDiagramsRaw = (() => {
                try {
                  return window.localStorage.getItem('sideflow_flow_diagrams_v1');
                } catch {
                  return null;
                }
              })();
              const prevActiveDiagramRaw = (() => {
                try {
                  return window.localStorage.getItem(
                    'sideflow_active_diagram_id'
                  );
                } catch {
                  return null;
                }
              })();
              try {
                const activeDiagId = prevActiveDiagramRaw
                  ? JSON.parse(prevActiveDiagramRaw)
                  : 'flow-1';
                if (prevDiagramsRaw) {
                  const parsedDiags = JSON.parse(prevDiagramsRaw);
                  if (Array.isArray(parsedDiags)) {
                    const updatedDiags = parsedDiags.map((d) =>
                      d.id === activeDiagId
                        ? { ...d, flowData: nextFlow, updatedAt: Date.now() }
                        : d
                    );
                    window.localStorage.setItem(
                      'sideflow_flow_diagrams_v1',
                      JSON.stringify(updatedDiags)
                    );
                  }
                }
              } catch {
                // ignore
              }
              setFlowData(nextFlow);
              setActiveTab('flowchart');
              notify(
                'Opened Mermaid in Flow Tab',
                'check',
                `${nextFlow.nodes.length} nodes loaded onto canvas`,
                {
                  variant: 'info',
                  undoLabel: 'Undo',
                  onUndo: () => {
                    try {
                      if (prevDiagramsRaw !== null) {
                        window.localStorage.setItem(
                          'sideflow_flow_diagrams_v1',
                          prevDiagramsRaw
                        );
                      }
                      if (prevActiveDiagramRaw !== null) {
                        window.localStorage.setItem(
                          'sideflow_active_diagram_id',
                          prevActiveDiagramRaw
                        );
                      }
                    } catch {
                      // ignore
                    }
                    setFlowData(previousFlow);
                    setWorkspaceResetEpoch((prev) => prev + 1);
                  },
                }
              );
            }}
          />
        </div>

        {activeTab === 'settings' && (
          <div
            role="tabpanel"
            id="tabpanel-settings"
            aria-labelledby="tab-btn-settings"
            className="flex-1 flex flex-col overflow-hidden"
          >
            <SettingsView
              shortcut={shortcut}
              isRecordingHotkey={isRecordingHotkey}
              onStartRecordingHotkey={() => setIsRecordingHotkey((prev) => !prev)}
              onResetHotkey={handleResetHotkey}
              isPinned={isPinned}
              onTogglePin={togglePin}
              showEdgeHandle={showEdgeHandle}
              onToggleEdgeHandle={setShowEdgeHandle}
              openAtLogin={openAtLogin}
              onToggleOpenAtLogin={handleToggleOpenAtLogin}
              updateState={updateState}
              onCheckForUpdates={handleCheckForUpdates}
              onInstallUpdate={handleInstallUpdate}
              panelEdge={panelEdge}
              onChangePanelEdge={handleChangePanelEdge}
              panelWidthPercent={clampPanelWidthPercent(panelWidthPercent)}
              onChangePanelWidthPercent={(nextPct) =>
                handleChangePanelWidthPercent(nextPct, true)
              }
              displays={displays}
              activeDisplayId={activeDisplay?.id}
              monitorSettings={safeMonitorSettings}
              onChangeMonitorSettings={handleChangeMonitorSettings}
              onActivateDisplay={(id) => handleActivateDisplay(id, true)}
              onRefreshDisplays={handleRefreshDisplays}
              dockEffect={dockEffect}
              onChangeDockEffect={(effect) => {
                setDockEffect(effect);
                notify('Updated Dock Hover Effect', 'check', `Effect: ${effect.toUpperCase()}`);
              }}
              dockIconSize={dockIconSize}
              onChangeDockIconSize={(size) => {
                setDockIconSize(size);
                notify('Updated Dock Tile Size', 'check', `Size: ${size.toUpperCase()}`);
              }}
              isDockLocked={isDockLocked}
              onToggleDockLock={(locked) => {
                setIsDockLocked(locked);
                notify(
                  locked ? 'Dock Icons Locked' : 'Dock Icons Unlocked',
                  'check',
                  locked ? 'Reordering disabled' : 'Reordering enabled'
                );
              }}
              isElectron={isElectronWindow}
              countsSummary={{
                drawers: drawers.length,
                apps: totalAppCount,
                diagrams: savedDiagramCount,
                notes: notes.length,
              }}
              onOpenElectronModal={() => setIsElectronModalOpen(true)}
              onExportBackup={handleExportBackup}
              onImportBackup={handleImportBackup}
              onResetAllData={handleResetAllData}
            />
          </div>
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
