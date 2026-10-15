import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Search,
  FolderPlus,
  Plus,
  UploadCloud,
  AppWindow,
  X,
  FolderSearch,
  Lock,
  Unlock,
  Image as ImageIcon,
  Activity,
  Trash2,
  Clock,
  FolderDown,
  Sparkles,
  ChevronsDownUp,
  ChevronsUpDown,
  AlertTriangle,
} from 'lucide-react';
import {
  AccentColor,
  AppDrawer,
  AppItem,
  DockHoverEffect,
  DockIconSize,
  DrawerSortMode,
  SystemMetrics,
} from '../../types/sideflow';
import { DrawerCard } from './DrawerCard';
import {
  buildFolderDrawerApps,
  executeAppCommand,
  extractFilenameFromPath,
  fetchNativeFileIcon,
  formatQuickHotkeyBadge,
  generateShortcutIconDataUrl,
  inferAppMetaFromFilename,
  resolveDroppedFilePath,
  resolveShortcutMetadata,
  sortDrawerApps,
} from '../../utils/fileMeta';

interface DockViewProps {
  drawers: AppDrawer[];
  onChangeDrawers: (updater: AppDrawer[] | ((prev: AppDrawer[]) => AppDrawer[])) => void;
  onNotify: (title: string, icon?: string, subtitle?: string) => void;
  isLocked?: boolean;
  onToggleLock?: () => void;
  dockEffect?: DockHoverEffect;
  dockIconSize?: DockIconSize;
}

export const DockView: React.FC<DockViewProps> = ({
  drawers,
  onChangeDrawers,
  onNotify,
  isLocked: controlledLocked,
  onToggleLock,
  dockEffect = 'zoom',
  dockIconSize = 'normal',
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [internalLocked, setInternalLocked] = useState(false);
  const [showDocklets, setShowDocklets] = useState(true);
  const [isTrashDragOver, setIsTrashDragOver] = useState(false);
  const [pendingDeleteDrawerId, setPendingDeleteDrawerId] = useState<
    string | null
  >(null);

  // Live ObjectDock System Metrics & Running Processes state
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics>({
    cpuPercent: 18,
    memPercent: 46,
    memUsedGb: 14.7,
    memTotalGb: 32,
    uptimeHours: 16.4,
  });
  const [runningProcesses, setRunningProcesses] = useState<string[]>([
    'code.exe',
    'docker desktop.exe',
    'spotify.exe',
  ]);
  const [launchedAppIds, setLaunchedAppIds] = useState<string[]>([]);
  const [dockletTime, setDockletTime] = useState<string>(() =>
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  );

  const isLocked =
    typeof controlledLocked === 'boolean' ? controlledLocked : internalLocked;

  const handleToggleLock = () => {
    if (onToggleLock) {
      onToggleLock();
    } else {
      setInternalLocked((prev) => !prev);
    }
    onNotify(
      !isLocked ? 'Dock Icons Locked' : 'Dock Icons Unlocked',
      'check',
      !isLocked
        ? 'Drag-and-drop reordering disabled'
        : 'Drag-and-drop reordering enabled'
    );
  };

  // Add / Edit App Modal state
  const [isAppModalOpen, setIsAppModalOpen] = useState(false);
  const [editingAppInfo, setEditingAppInfo] = useState<{
    drawerId: string;
    appId: string;
  } | null>(null);
  const [appName, setAppName] = useState('');
  const [appDrawerId, setAppDrawerId] = useState('');
  const [appCmd, setAppCmd] = useState('');
  const [appIcon, setAppIcon] = useState('terminal');
  const [appColor, setAppColor] = useState<AccentColor>('indigo');
  const [appCustomIconUrl, setAppCustomIconUrl] = useState('');
  const [appHotkey, setAppHotkey] = useState('');

  // New Drawer Modal state
  const [isDrawerModalOpen, setIsDrawerModalOpen] = useState(false);
  const [newDrawerTitle, setNewDrawerTitle] = useState('');
  const [newDrawerFolder, setNewDrawerFolder] = useState('');

  // File input refs for browser fallback
  const drawerFileInputRef = useRef<HTMLInputElement>(null);
  const modalFileInputRef = useRef<HTMLInputElement>(null);
  const customIconInputRef = useRef<HTMLInputElement>(null);
  const [targetBrowseDrawerId, setTargetBrowseDrawerId] = useState<string | null>(
    null
  );

  const refreshSystemTelemetry = useCallback(async () => {
    setDockletTime(
      new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    );
    if (window.sideflow?.getSystemMetrics) {
      try {
        const m = await window.sideflow.getSystemMetrics();
        if (m && typeof m.cpuPercent === 'number') {
          setSystemMetrics(m);
        }
      } catch {
        // Ignore telemetry error
      }
    }
    if (window.sideflow?.getRunningProcesses) {
      try {
        const procs = await window.sideflow.getRunningProcesses();
        if (Array.isArray(procs) && procs.length > 0) {
          setRunningProcesses(procs);
        }
      } catch {
        // Ignore process list error
      }
    }
  }, []);

  useEffect(() => {
    refreshSystemTelemetry();
    const interval = window.setInterval(refreshSystemTelemetry, 10000);
    return () => window.clearInterval(interval);
  }, [refreshSystemTelemetry]);

  // Close open modals on Escape at window level
  useEffect(() => {
    if (!isAppModalOpen && !isDrawerModalOpen && !pendingDeleteDrawerId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsAppModalOpen(false);
        setIsDrawerModalOpen(false);
        setPendingDeleteDrawerId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAppModalOpen, isDrawerModalOpen, pendingDeleteDrawerId]);

  const filterText = searchQuery.toLowerCase().trim();

  // Calculate visible drawers and total matching apps
  const visibleDrawers = drawers.filter(
    (d) => activeFilter === 'all' || activeFilter === d.id
  );
  const totalApps = visibleDrawers.reduce((sum, d) => {
    const matched = d.apps.filter(
      (a) =>
        a.name.toLowerCase().includes(filterText) ||
        a.cmd.toLowerCase().includes(filterText)
    );
    return sum + matched.length;
  }, 0);

  // Build ordered visible apps and Alt+1..Alt+9 quick-launch hotkey map
  const orderedVisibleApps: AppItem[] = [];
  visibleDrawers.forEach((d) => {
    if (d.collapsed) return;
    const matched = d.apps.filter(
      (a) =>
        a.name.toLowerCase().includes(filterText) ||
        a.cmd.toLowerCase().includes(filterText)
    );
    const sorted = sortDrawerApps(matched, d.sortBy);
    orderedVisibleApps.push(...sorted);
  });

  const quickHotkeyMap: Record<string, string> = {};
  orderedVisibleApps.slice(0, 9).forEach((app, idx) => {
    const badge = formatQuickHotkeyBadge(idx, app.hotkey);
    if (badge) {
      quickHotkeyMap[app.id] = badge;
    }
  });

  const enrichAppsWithNativeIcons = (drawerId: string, appsToEnrich: AppItem[]) => {
    if (
      !window.sideflow?.resolveShortcutItem &&
      !window.sideflow?.extractFileIcon
    ) {
      return;
    }
    appsToEnrich.forEach((item) => {
      if (window.sideflow?.resolveShortcutItem) {
        window.sideflow
          .resolveShortcutItem(item.cmd)
          .then((resolved) => {
            if (!resolved) return;
            onChangeDrawers((prev) =>
              prev.map((d) =>
                d.id === drawerId
                  ? {
                      ...d,
                      apps: d.apps.map((a) =>
                        a.id === item.id
                          ? {
                              ...a,
                              ...(resolved.cmd ? { cmd: resolved.cmd } : {}),
                              ...(resolved.iconDataUrl
                                ? { customIconUrl: resolved.iconDataUrl }
                                : {}),
                            }
                          : a
                      ),
                    }
                  : d
              )
            );
          })
          .catch(() => {});
        return;
      }

      fetchNativeFileIcon(item.cmd).then((iconUrl) => {
        if (!iconUrl) return;
        onChangeDrawers((prev) =>
          prev.map((d) =>
            d.id === drawerId
              ? {
                  ...d,
                  apps: d.apps.map((a) =>
                    a.id === item.id ? { ...a, customIconUrl: iconUrl } : a
                  ),
                }
              : d
          )
        );
      });
    });
  };

  const allDrawersCollapsed =
    visibleDrawers.length > 0 && visibleDrawers.every((d) => d.collapsed);

  const handleToggleCollapseAllDrawers = () => {
    const nextCollapsed = !allDrawersCollapsed;
    onChangeDrawers((prev) =>
      prev.map((d) =>
        activeFilter === 'all' || activeFilter === d.id
          ? { ...d, collapsed: nextCollapsed }
          : d
      )
    );
    onNotify(
      nextCollapsed ? 'Collapsed All Drawers' : 'Expanded All Drawers',
      'check',
      nextCollapsed
        ? `${visibleDrawers.length} drawers collapsed`
        : `${visibleDrawers.length} drawers expanded`
    );
  };

  const handleToggleCollapse = (drawerId: string) => {
    onChangeDrawers((prev) =>
      prev.map((d) => (d.id === drawerId ? { ...d, collapsed: !d.collapsed } : d))
    );
  };

  const handleRequestDeleteDrawer = (drawerId: string) => {
    if (drawers.length <= 1 || isLocked) return;
    setPendingDeleteDrawerId(drawerId);
  };

  const handleConfirmDeleteDrawer = () => {
    if (!pendingDeleteDrawerId || drawers.length <= 1 || isLocked) {
      setPendingDeleteDrawerId(null);
      return;
    }
    const target = drawers.find((d) => d.id === pendingDeleteDrawerId);
    const deleteId = pendingDeleteDrawerId;
    setPendingDeleteDrawerId(null);
    onChangeDrawers((prev) => prev.filter((d) => d.id !== deleteId));
    if (activeFilter === deleteId) {
      setActiveFilter('all');
    }
    if (target) {
      onNotify(`Removed Drawer "${target.title}"`, 'check', 'Workspace updated');
    }
  };

  const handleRenameDrawer = (drawerId: string, newTitle: string) => {
    onChangeDrawers((prev) =>
      prev.map((d) => (d.id === drawerId ? { ...d, title: newTitle } : d))
    );
    onNotify(`Renamed Drawer to "${newTitle}"`, 'check', 'Drawer updated');
  };

  const handleChangeSort = (drawerId: string, sortBy: DrawerSortMode) => {
    const target = drawers.find((d) => d.id === drawerId);
    onChangeDrawers((prev) =>
      prev.map((d) => (d.id === drawerId ? { ...d, sortBy } : d))
    );
    if (target) {
      onNotify(
        `Sorted "${target.title}"`,
        'check',
        `Order: ${sortBy.toUpperCase()}`
      );
    }
  };

  const handleSyncFolder = async (drawerId: string) => {
    const target = drawers.find((d) => d.id === drawerId);
    if (!target || !target.folderPath) return;
    const folderApps = await buildFolderDrawerApps(target.folderPath);
    onChangeDrawers((prev) =>
      prev.map((d) =>
        d.id === drawerId ? { ...d, collapsed: false, apps: folderApps } : d
      )
    );
    onNotify(
      `Synced Folder "${target.title}"`,
      'folder-open',
      `${folderApps.length} items from ${target.folderPath}`
    );
  };

  const handleReorderDrawer = (sourceDrawerId: string, targetDrawerId: string) => {
    if (isLocked || sourceDrawerId === targetDrawerId) return;
    const sourceDrawer = drawers.find((d) => d.id === sourceDrawerId);
    onChangeDrawers((prev) => {
      const srcIdx = prev.findIndex((d) => d.id === sourceDrawerId);
      const tgtIdx = prev.findIndex((d) => d.id === targetDrawerId);
      if (srcIdx === -1 || tgtIdx === -1) return prev;
      const next = [...prev];
      const [moved] = next.splice(srcIdx, 1);
      next.splice(tgtIdx, 0, moved);
      return next;
    });
    if (sourceDrawer) {
      onNotify(
        `Reordered Drawer "${sourceDrawer.title}"`,
        'check',
        'Updated drawer tab order'
      );
    }
  };

  const handleReorderApp = (
    sourceDrawerId: string,
    draggedAppId: string,
    targetDrawerId: string,
    targetAppId?: string
  ) => {
    if (isLocked) return;
    const srcDrawer = drawers.find((d) => d.id === sourceDrawerId);
    const tgtDrawer = drawers.find((d) => d.id === targetDrawerId);
    const draggedApp = srcDrawer?.apps.find((a) => a.id === draggedAppId);
    if (!srcDrawer || !tgtDrawer || !draggedApp) return;

    if (sourceDrawerId === targetDrawerId && draggedAppId === targetAppId) {
      return;
    }

    onChangeDrawers((prev) => {
      if (sourceDrawerId === targetDrawerId) {
        return prev.map((d) => {
          if (d.id !== sourceDrawerId) return d;
          const remaining = d.apps.filter((a) => a.id !== draggedAppId);
          const targetIdx = targetAppId
            ? remaining.findIndex((a) => a.id === targetAppId)
            : -1;
          if (targetIdx === -1) {
            remaining.push(draggedApp);
          } else {
            remaining.splice(targetIdx, 0, draggedApp);
          }
          return { ...d, sortBy: 'manual', apps: remaining };
        });
      }

      return prev.map((d) => {
        if (d.id === sourceDrawerId) {
          return {
            ...d,
            apps: d.apps.filter((a) => a.id !== draggedAppId),
          };
        }
        if (d.id === targetDrawerId) {
          const nextApps = [...d.apps.filter((a) => a.id !== draggedAppId)];
          const targetIdx = targetAppId
            ? nextApps.findIndex((a) => a.id === targetAppId)
            : -1;
          if (targetIdx === -1) {
            nextApps.push(draggedApp);
          } else {
            nextApps.splice(targetIdx, 0, draggedApp);
          }
          return {
            ...d,
            collapsed: false,
            sortBy: 'manual',
            apps: nextApps,
          };
        }
        return d;
      });
    });

    if (sourceDrawerId !== targetDrawerId) {
      onNotify(
        `Moved ${draggedApp.name} to "${tgtDrawer.title}"`,
        'check',
        'Updated drawer assignment'
      );
    } else {
      onNotify(
        `Reordered ${draggedApp.name}`,
        'check',
        `In "${srcDrawer.title}"`
      );
    }
  };

  const handleLaunchApp = useCallback(
    async (app: AppItem) => {
      setLaunchedAppIds((prev) =>
        prev.includes(app.id) ? prev : [...prev, app.id]
      );
      onNotify(`Launching ${app.name}...`, app.icon || 'rocket', app.cmd);
      const res = await executeAppCommand(app.cmd);
      if (res && !res.success && res.error) {
        onNotify(`Unable to Launch ${app.name}`, 'zap', res.error);
      }
    },
    [onNotify]
  );

  // Alt + 1..9 Quick-Launch & Per-App Custom Hotkey Listener
  useEffect(() => {
    if (isAppModalOpen || isDrawerModalOpen) return;

    const handleQuickHotkey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditable =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if (isEditable) return;

      const pressedParts: string[] = [];
      if (e.ctrlKey) pressedParts.push('ctrl');
      if (e.altKey) pressedParts.push('alt');
      if (e.shiftKey) pressedParts.push('shift');
      if (pressedParts.length === 0) return;

      const digitMatch = e.code.match(/^(?:Digit|Numpad)([1-9])$/);
      const rawKey = digitMatch ? digitMatch[1] : e.key.toLowerCase();
      if (['control', 'alt', 'shift', 'meta'].includes(rawKey)) return;
      const combo = [...pressedParts, rawKey].join('+');

      // 1. Check custom per-app hotkeys across all drawers first
      for (const d of drawers) {
        const customMatch = d.apps.find(
          (a) =>
            a.hotkey &&
            a.hotkey.replace(/\s+/g, '').toLowerCase() === combo
        );
        if (customMatch) {
          e.preventDefault();
          handleLaunchApp(customMatch);
          return;
        }
      }

      // 2. Check Alt + 1..9 quick launch on visible apps
      if (e.altKey && !e.ctrlKey && !e.shiftKey && /^[1-9]$/.test(rawKey)) {
        const idx = parseInt(rawKey, 10) - 1;
        const targetApp = orderedVisibleApps[idx];
        if (targetApp) {
          e.preventDefault();
          handleLaunchApp(targetApp);
        }
      }
    };

    window.addEventListener('keydown', handleQuickHotkey);
    return () => window.removeEventListener('keydown', handleQuickHotkey);
  }, [
    isAppModalOpen,
    isDrawerModalOpen,
    drawers,
    orderedVisibleApps,
    handleLaunchApp,
  ]);

  const handleLaunchWithFile = async (
    app: AppItem,
    filePath: string,
    fileName: string
  ) => {
    setLaunchedAppIds((prev) =>
      prev.includes(app.id) ? prev : [...prev, app.id]
    );
    onNotify(
      `Opening ${fileName} with ${app.name}...`,
      app.icon || 'rocket',
      `${app.cmd} "${filePath}"`
    );
    const res = await executeAppCommand(app.cmd, [filePath]);
    if (res && !res.success && res.error) {
      onNotify(`Unable to Open ${fileName}`, 'zap', res.error);
    }
  };

  const handleDeleteApp = (drawerId: string, appId: string) => {
    if (isLocked) return;
    const drawer = drawers.find((d) => d.id === drawerId);
    const app = drawer?.apps.find((a) => a.id === appId);
    onChangeDrawers((prev) =>
      prev.map((d) =>
        d.id === drawerId
          ? { ...d, apps: d.apps.filter((a) => a.id !== appId) }
          : d
      )
    );
    if (app) {
      onNotify(`Removed ${app.name}`, 'check', `From ${drawer?.title || 'Drawer'}`);
    }
  };

  const handleTrashDrop = (e: React.DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsTrashDragOver(false);
    if (isLocked) {
      onNotify('Dock Icons Locked', 'zap', 'Unlock dock icons before removing');
      return;
    }
    const internalPayload = e.dataTransfer?.getData('application/x-sideflow-app');
    if (!internalPayload) return;
    try {
      const parsed = JSON.parse(internalPayload) as {
        appId?: string;
        sourceDrawerId?: string;
      };
      if (parsed.appId && parsed.sourceDrawerId) {
        const srcDrawer = drawers.find((d) => d.id === parsed.sourceDrawerId);
        const app = srcDrawer?.apps.find((a) => a.id === parsed.appId);
        onChangeDrawers((prev) =>
          prev.map((d) =>
            d.id === parsed.sourceDrawerId
              ? { ...d, apps: d.apps.filter((a) => a.id !== parsed.appId) }
              : d
          )
        );
        if (app) {
          onNotify(
            `Moved "${app.name}" to Recycle Bin`,
            'check',
            `Removed from ${srcDrawer?.title || 'Dock'}`
          );
        }
      }
    } catch {
      // ignore
    }
  };

  const handleDropItems = (drawerId: string, newApps: AppItem[]) => {
    const targetDrawer = drawers.find((d) => d.id === drawerId);
    if (!targetDrawer) return;

    onChangeDrawers((prev) =>
      prev.map((d) =>
        d.id === drawerId
          ? { ...d, collapsed: false, apps: [...d.apps, ...newApps] }
          : d
      )
    );

    enrichAppsWithNativeIcons(drawerId, newApps);

    onNotify(
      `Added ${newApps.length} item${newApps.length > 1 ? 's' : ''} to "${targetDrawer.title}"`,
      'check',
      'Ready for one-click launch'
    );
  };

  const handleBrowseFilesForDrawer = async (drawerId: string) => {
    if (window.sideflow?.openFileDialog) {
      const filePaths = await window.sideflow.openFileDialog();
      if (!filePaths || filePaths.length === 0) return;

      const newApps: AppItem[] = filePaths.map((fp) => {
        const meta = inferAppMetaFromFilename(fp);
        return {
          id: `app-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: meta.name,
          cmd: fp,
          icon: meta.icon,
          color: meta.color,
          customIconUrl: generateShortcutIconDataUrl(meta.name, meta.color),
        };
      });
      handleDropItems(drawerId, newApps);
      return;
    }

    setTargetBrowseDrawerId(drawerId);
    if (drawerFileInputRef.current) {
      drawerFileInputRef.current.value = '';
      drawerFileInputRef.current.click();
    }
  };

  const handleDrawerFileInputChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !targetBrowseDrawerId) return;

    const newApps: AppItem[] = Array.from(files).map((file) => {
      const nativePath = resolveDroppedFilePath(file, 'C:\\Program Files');
      const meta = inferAppMetaFromFilename(file.name);
      return {
        id: `app-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: meta.name,
        cmd: nativePath,
        icon: meta.icon,
        color: meta.color,
        customIconUrl: generateShortcutIconDataUrl(meta.name, meta.color),
      };
    });

    const targetDrawer = drawers.find((d) => d.id === targetBrowseDrawerId);
    onChangeDrawers((prev) =>
      prev.map((d) =>
        d.id === targetBrowseDrawerId
          ? { ...d, collapsed: false, apps: [...d.apps, ...newApps] }
          : d
      )
    );

    enrichAppsWithNativeIcons(targetBrowseDrawerId, newApps);

    if (targetDrawer) {
      onNotify(
        `Added ${files.length} local file(s) to "${targetDrawer.title}"`,
        'folder-plus',
        'Saved to Dock Drawer'
      );
    }
  };

  const openAddAppModal = () => {
    setEditingAppInfo(null);
    setAppName('');
    const defaultDrawerId =
      activeFilter !== 'all' && drawers.some((d) => d.id === activeFilter)
        ? activeFilter
        : drawers[0]?.id || '';
    setAppDrawerId(defaultDrawerId);
    setAppCmd('');
    setAppIcon('terminal');
    setAppColor('indigo');
    setAppCustomIconUrl('');
    setAppHotkey('');
    setIsAppModalOpen(true);
  };

  const openEditAppModal = (app: AppItem, drawerId: string) => {
    setEditingAppInfo({ drawerId, appId: app.id });
    setAppName(app.name);
    setAppDrawerId(drawerId);
    setAppCmd(app.cmd);
    setAppIcon(app.icon || 'terminal');
    setAppColor(app.color || 'indigo');
    setAppCustomIconUrl(app.customIconUrl || '');
    setAppHotkey(app.hotkey || '');
    setIsAppModalOpen(true);
  };

  const handlePopulateModalIcon = async () => {
    const meta = inferAppMetaFromFilename(appName || appCmd || 'Application');
    const fallbackUrl = generateShortcutIconDataUrl(
      appName.trim() || meta.name,
      appColor || meta.color
    );
    setAppCustomIconUrl(fallbackUrl);

    if (
      window.sideflow?.resolveShortcutItem ||
      window.sideflow?.extractFileIcon
    ) {
      const resolved = await resolveShortcutMetadata(
        appCmd || appName || 'Application',
        appName || undefined,
        appColor
      );
      if (!appName.trim() && resolved.name) {
        setAppName(resolved.name);
      }
      if (resolved.cmd && appCmd.trim().toLowerCase().endsWith('.lnk')) {
        setAppCmd(resolved.cmd);
      }
      setAppCustomIconUrl(resolved.customIconUrl);
    }
  };

  const handleModalBrowseClick = async () => {
    if (window.sideflow?.openFileDialog) {
      const filePaths = await window.sideflow.openFileDialog();
      if (filePaths && filePaths.length > 0) {
        const pickedPath = filePaths[0];
        const filename = extractFilenameFromPath(pickedPath);
        const meta = inferAppMetaFromFilename(filename);
        if (!appName.trim()) {
          setAppName(meta.name);
        }
        setAppCmd(pickedPath);
        setAppIcon(meta.icon);
        setAppColor(meta.color);
        const resolved = await resolveShortcutMetadata(
          pickedPath,
          appName.trim() || meta.name,
          meta.color
        );
        if (resolved.cmd) {
          setAppCmd(resolved.cmd);
        }
        setAppCustomIconUrl(resolved.customIconUrl);
      }
      return;
    }

    if (modalFileInputRef.current) {
      modalFileInputRef.current.value = '';
      modalFileInputRef.current.click();
    }
  };

  const handleModalFileInputChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const nativePath = resolveDroppedFilePath(file, 'C:\\Program Files');
    const meta = inferAppMetaFromFilename(file.name);
    const nextName = appName.trim() || meta.name;
    if (!appName.trim()) {
      setAppName(meta.name);
    }
    setAppCmd(nativePath);
    setAppIcon(meta.icon);
    setAppColor(meta.color);
    setAppCustomIconUrl(generateShortcutIconDataUrl(nextName, meta.color));
    resolveShortcutMetadata(nativePath, nextName, meta.color).then((resolved) => {
      if (resolved.cmd) {
        setAppCmd(resolved.cmd);
      }
      if (resolved.customIconUrl) {
        setAppCustomIconUrl(resolved.customIconUrl);
      }
    });
  };

  const handleCustomIconFileChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setAppCustomIconUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveAppModal = () => {
    const trimmedName = appName.trim();
    if (!trimmedName) return;
    const finalCmd = appCmd.trim() || 'app://launch';
    const finalCustomIcon = appCustomIconUrl.trim() || undefined;
    const finalHotkey = appHotkey.trim() || undefined;
    const targetDrawerId = appDrawerId || drawers[0]?.id;
    if (!targetDrawerId) return;

    if (editingAppInfo) {
      onChangeDrawers((prev) => {
        const updated = prev.map((d) => {
          if (d.id === editingAppInfo.drawerId && d.id !== targetDrawerId) {
            return {
              ...d,
              apps: d.apps.filter((a) => a.id !== editingAppInfo.appId),
            };
          }
          if (d.id === editingAppInfo.drawerId && d.id === targetDrawerId) {
            return {
              ...d,
              apps: d.apps.map((a) =>
                a.id === editingAppInfo.appId
                  ? {
                      ...a,
                      name: trimmedName,
                      cmd: finalCmd,
                      icon: appIcon,
                      color: appColor,
                      customIconUrl: finalCustomIcon,
                      hotkey: finalHotkey,
                    }
                  : a
              ),
            };
          }
          return d;
        });

        if (editingAppInfo.drawerId !== targetDrawerId) {
          return updated.map((d) =>
            d.id === targetDrawerId
              ? {
                  ...d,
                  apps: [
                    ...d.apps,
                    {
                      id: editingAppInfo.appId,
                      name: trimmedName,
                      cmd: finalCmd,
                      icon: appIcon,
                      color: appColor,
                      ...(finalCustomIcon ? { customIconUrl: finalCustomIcon } : {}),
                      ...(finalHotkey ? { hotkey: finalHotkey } : {}),
                    },
                  ],
                }
              : d
          );
        }
        return updated;
      });
      onNotify(`Updated ${trimmedName}`, 'check', finalCmd);
    } else {
      const newApp: AppItem = {
        id: `app-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: trimmedName,
        cmd: finalCmd,
        icon: appIcon,
        color: appColor,
        ...(finalCustomIcon ? { customIconUrl: finalCustomIcon } : {}),
        ...(finalHotkey ? { hotkey: finalHotkey } : {}),
      };
      onChangeDrawers((prev) =>
        prev.map((d) =>
          d.id === targetDrawerId
            ? { ...d, collapsed: false, apps: [...d.apps, newApp] }
            : d
        )
      );
      if (!finalCustomIcon) {
        enrichAppsWithNativeIcons(targetDrawerId, [newApp]);
      }
      onNotify(`Added ${trimmedName}`, 'check', finalCmd);
    }

    setIsAppModalOpen(false);
  };

  const handleBrowseNewDrawerFolder = async () => {
    if (window.sideflow?.openDirectoryDialog) {
      const pickedDir = await window.sideflow.openDirectoryDialog();
      if (pickedDir) {
        setNewDrawerFolder(pickedDir);
        if (!newDrawerTitle.trim()) {
          setNewDrawerTitle(extractFilenameFromPath(pickedDir));
        }
      }
      return;
    }
    const fallbackDir = 'C:\\Users\\Local\\Projects';
    setNewDrawerFolder(fallbackDir);
    if (!newDrawerTitle.trim()) {
      setNewDrawerTitle('Projects');
    }
  };

  const handleSaveNewDrawer = async () => {
    const trimmedTitle = newDrawerTitle.trim();
    if (!trimmedTitle) return;
    const trimmedFolder = newDrawerFolder.trim();
    const initialApps = trimmedFolder
      ? await buildFolderDrawerApps(trimmedFolder)
      : [];

    const newDrawer: AppDrawer = {
      id: `drawer-${Date.now()}`,
      title: trimmedTitle,
      collapsed: false,
      apps: initialApps,
      ...(trimmedFolder ? { folderPath: trimmedFolder } : {}),
    };
    onChangeDrawers((prev) => [...prev, newDrawer]);
    setNewDrawerTitle('');
    setNewDrawerFolder('');
    setIsDrawerModalOpen(false);
    onNotify(
      `Created Drawer "${trimmedTitle}"`,
      'folder-plus',
      trimmedFolder ? `Synced to ${trimmedFolder}` : 'Ready for apps'
    );
  };

  const handleSearchKeyDown = async (
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (e.key === 'Escape' && searchQuery) {
      e.preventDefault();
      setSearchQuery('');
      return;
    }

    if (e.key === 'Enter' && filterText) {
      const rawQuery = searchQuery.trim();
      const isDirectUri =
        /^[a-zA-Z][a-zA-Z0-9+.-]+:/.test(rawQuery) &&
        (rawQuery.includes('://') ||
          rawQuery.startsWith('mailto:') ||
          rawQuery.startsWith('ms-calculator:'));

      // Check for exact match first when a URI is typed, otherwise substring match
      for (const drawer of visibleDrawers) {
        const match = drawer.apps.find((a) =>
          isDirectUri
            ? a.cmd.toLowerCase() === filterText
            : a.name.toLowerCase().includes(filterText) ||
              a.cmd.toLowerCase().includes(filterText)
        );
        if (match) {
          await handleLaunchApp(match);
          return;
        }
      }

      if (isDirectUri) {
        onNotify(`Launching ${rawQuery}...`, 'rocket', rawQuery);
        const res = await executeAppCommand(rawQuery);
        if (res && !res.success && res.error) {
          onNotify('Launch Failed', 'zap', res.error);
        }
      }
    }
  };

  return (
    <section
      id="tab-drawers"
      aria-label="ObjectDock App Drawers"
      className="tab-content flex-1 flex flex-col overflow-hidden p-4 gap-4"
    >
      {/* Search & Quick Add Bar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search
            className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            id="app-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Filter apps or type to launch..."
            aria-label="Filter apps or type to launch"
            className="w-full bg-slate-950/70 border border-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/40 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-slate-400 outline-none transition"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search query"
              title="Clear search (Esc)"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5 rounded-full hover:bg-slate-800 transition"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
        <button
          type="button"
          aria-pressed={showDocklets}
          aria-label="Toggle ObjectDock Docklets"
          title={
            showDocklets
              ? 'Hide ObjectDock Docklets Bar'
              : 'Show ObjectDock Docklets Bar'
          }
          onClick={() => setShowDocklets((prev) => !prev)}
          className={`p-2 rounded-xl border text-xs font-medium flex items-center gap-1 transition shrink-0 ${
            showDocklets
              ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
              : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-pressed={isLocked}
          aria-label="Lock icon dragging"
          title={
            isLocked
              ? 'Dock icons locked (Click to unlock reordering)'
              : 'Lock icon dragging & deletion'
          }
          onClick={handleToggleLock}
          className={`p-2 rounded-xl border text-xs font-medium flex items-center gap-1 transition shrink-0 ${
            isLocked
              ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
              : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
          }`}
        >
          {isLocked ? (
            <Lock className="w-3.5 h-3.5" aria-hidden="true" />
          ) : (
            <Unlock className="w-3.5 h-3.5" aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          onClick={() => {
            setNewDrawerTitle('');
            setNewDrawerFolder('');
            setIsDrawerModalOpen(true);
          }}
          className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-200 flex items-center gap-1.5 transition shrink-0"
        >
          <FolderPlus className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
          <span>New Drawer</span>
        </button>
        <button
          type="button"
          onClick={openAddAppModal}
          className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white flex items-center gap-1.5 transition shrink-0 shadow-lg shadow-indigo-600/20"
        >
          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Add App</span>
        </button>
      </div>

      {/* ObjectDock Built-In Docklets Bar (System Meter, Recycle Bin, Clock/Uptime, Downloads) */}
      {showDocklets && (
        <div
          id="objectdock-docklets-bar"
          data-testid="objectdock-docklets-bar"
          role="region"
          aria-label="ObjectDock Mini Docklets"
          className="grid grid-cols-2 sm:grid-cols-4 gap-2"
        >
          {/* 1. CPU & RAM System Meter Docklet */}
          <button
            type="button"
            data-testid="docklet-sys-meter"
            onClick={async () => {
              await refreshSystemTelemetry();
              onNotify(
                `System Load: CPU ${systemMetrics.cpuPercent}% • RAM ${systemMetrics.memPercent}%`,
                'cpu',
                `${systemMetrics.memUsedGb} GB / ${systemMetrics.memTotalGb} GB used`
              );
            }}
            title="ObjectDock System Meter Docklet (Click to refresh CPU & RAM telemetry)"
            className="p-2 rounded-xl bg-slate-950/75 hover:bg-slate-900 border border-slate-800/90 hover:border-indigo-500/40 flex items-center gap-2 text-left transition"
          >
            <div className="w-7 h-7 rounded-lg bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-300 shrink-0">
              <Activity className="w-3.5 h-3.5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between text-[10px] font-medium text-slate-200">
                <span>CPU {systemMetrics.cpuPercent}%</span>
                <span className="text-slate-400">RAM {systemMetrics.memPercent}%</span>
              </div>
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden mt-1 flex">
                <div
                  style={{ width: `${systemMetrics.cpuPercent}%` }}
                  className="bg-indigo-400 h-full transition-all"
                />
              </div>
            </div>
          </button>

          {/* 2. Recycle Bin Docklet (Supports Drag-and-Drop App Tile Deletion) */}
          <button
            type="button"
            data-testid="docklet-recycle-bin"
            onClick={async () => {
              onNotify(
                'Opening System Recycle Bin...',
                'folder-open',
                'shell:RecycleBinFolder'
              );
              await executeAppCommand('shell:RecycleBinFolder');
            }}
            onDragOver={(e) => {
              if (!isLocked) {
                e.preventDefault();
                setIsTrashDragOver(true);
              }
            }}
            onDragLeave={() => setIsTrashDragOver(false)}
            onDrop={handleTrashDrop}
            title="ObjectDock Recycle Bin Docklet (Click to open OS Recycle Bin, or drag & drop any app tile here to remove it)"
            className={`p-2 rounded-xl border flex items-center gap-2 text-left transition ${
              isTrashDragOver
                ? 'bg-rose-950/60 border-rose-400 ring-2 ring-rose-500/40'
                : 'bg-slate-950/75 hover:bg-slate-900 border-slate-800/90 hover:border-rose-500/40'
            }`}
          >
            <div className="w-7 h-7 rounded-lg bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-300 shrink-0">
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-medium text-slate-200 truncate">
                Recycle Bin
              </div>
              <div className="text-[9px] text-slate-400 truncate">
                {isTrashDragOver ? 'Drop tile to remove' : 'Open or drop tile'}
              </div>
            </div>
          </button>

          {/* 3. Clock & Uptime Docklet */}
          <button
            type="button"
            data-testid="docklet-clock"
            onClick={() => {
              const stamp = new Date().toLocaleString();
              navigator.clipboard?.writeText?.(stamp).catch(() => {});
              onNotify(
                'Copied System Timestamp',
                'check',
                `${stamp} (Uptime: ${systemMetrics.uptimeHours}h)`
              );
            }}
            title="ObjectDock Clock & Uptime Docklet (Click to copy formatted timestamp)"
            className="p-2 rounded-xl bg-slate-950/75 hover:bg-slate-900 border border-slate-800/90 hover:border-cyan-500/40 flex items-center gap-2 text-left transition"
          >
            <div className="w-7 h-7 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-300 shrink-0">
              <Clock className="w-3.5 h-3.5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-mono font-semibold text-slate-200 truncate">
                {dockletTime}
              </div>
              <div className="text-[9px] text-slate-400 truncate">
                Up {systemMetrics.uptimeHours}h • Copy
              </div>
            </div>
          </button>

          {/* 4. Downloads Quick-Folder Docklet */}
          <button
            type="button"
            data-testid="docklet-downloads"
            onClick={async () => {
              onNotify(
                'Opening Downloads Folder...',
                'folder-open',
                'shell:Downloads'
              );
              await executeAppCommand('shell:Downloads');
            }}
            title="ObjectDock Downloads Folder Docklet (One-click open OS Downloads directory)"
            className="p-2 rounded-xl bg-slate-950/75 hover:bg-slate-900 border border-slate-800/90 hover:border-emerald-500/40 flex items-center gap-2 text-left transition"
          >
            <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-300 shrink-0">
              <FolderDown className="w-3.5 h-3.5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-medium text-slate-200 truncate">
                Downloads
              </div>
              <div className="text-[9px] text-slate-400 truncate">
                Quick OS Folder
              </div>
            </div>
          </button>
        </div>
      )}

      {/* ObjectDock Style Drawer Selector Pills (Supports Drag-and-Drop Reordering & Collapse All) */}
      <div
        id="drawer-tabs-bar"
        role="group"
        aria-label="Filter by drawer"
        onWheel={(e) => {
          if (e.deltaY !== 0) {
            e.currentTarget.scrollLeft += e.deltaY;
          }
        }}
        className="flex items-center gap-1.5 overflow-x-auto pb-1"
      >
        <button
          type="button"
          aria-pressed={activeFilter === 'all'}
          onClick={() => setActiveFilter('all')}
          className={`px-3 py-1 rounded-full text-xs font-medium transition shrink-0 ${
            activeFilter === 'all'
              ? 'bg-indigo-600 text-white'
              : 'bg-slate-800/80 text-slate-400 hover:text-white'
          }`}
        >
          All Drawers
        </button>
        {drawers.map((d) => (
          <button
            key={d.id}
            type="button"
            draggable={!isLocked}
            data-testid={`drawer-pill-${d.id}`}
            aria-pressed={activeFilter === d.id}
            onClick={() => setActiveFilter(d.id)}
            onDragStart={(e) => {
              if (isLocked) {
                e.preventDefault();
                return;
              }
              e.dataTransfer?.setData('application/x-sideflow-drawer', d.id);
            }}
            onDragOver={(e) => {
              if (!isLocked) {
                e.preventDefault();
              }
            }}
            onDrop={(e) => {
              const srcDrawerId = e.dataTransfer?.getData(
                'application/x-sideflow-drawer'
              );
              if (srcDrawerId) {
                e.preventDefault();
                e.stopPropagation();
                handleReorderDrawer(srcDrawerId, d.id);
              }
            }}
            className={`px-3 py-1 rounded-full text-xs font-medium transition shrink-0 ${
              activeFilter === d.id
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-800/80 text-slate-400 hover:text-white'
            }`}
          >
            {d.title}
          </button>
        ))}

        <button
          type="button"
          data-testid="collapse-all-drawers-btn"
          aria-pressed={allDrawersCollapsed}
          aria-label={
            allDrawersCollapsed ? 'Expand all drawers' : 'Collapse all drawers'
          }
          title={
            allDrawersCollapsed
              ? 'Expand all drawers'
              : 'Collapse all drawers'
          }
          onClick={handleToggleCollapseAllDrawers}
          className="ml-auto px-2.5 py-1 rounded-full bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-300 hover:text-white flex items-center gap-1 transition shrink-0"
        >
          {allDrawersCollapsed ? (
            <>
              <ChevronsUpDown className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
              <span>Expand All</span>
            </>
          ) : (
            <>
              <ChevronsDownUp className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
              <span>Collapse All</span>
            </>
          )}
        </button>
      </div>

      {/* Drawers Container */}
      <div
        id="drawers-list-container"
        className="flex-1 overflow-y-auto space-y-4 pr-1"
      >
        {filterText && totalApps === 0 && (
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-center justify-between gap-3">
            <div className="text-xs text-slate-300">
              No applications match <span className="font-mono text-indigo-300">"{searchQuery}"</span>.
              {/^[a-zA-Z][a-zA-Z0-9+.-]+:/.test(searchQuery.trim()) && (
                <span className="block text-[11px] text-slate-400 mt-0.5">
                  Press <kbd className="px-1 py-0.5 bg-slate-800 rounded text-indigo-300 font-mono">Enter</kbd> to launch this URI directly.
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 shrink-0"
            >
              Clear Search
            </button>
          </div>
        )}

        {visibleDrawers.map((drawer) => {
          const matchedApps = drawer.apps.filter(
            (a) =>
              a.name.toLowerCase().includes(filterText) ||
              a.cmd.toLowerCase().includes(filterText)
          );
          const sortedApps = sortDrawerApps(matchedApps, drawer.sortBy);
          return (
            <DrawerCard
              key={drawer.id}
              drawer={drawer}
              filteredApps={sortedApps}
              isFiltering={Boolean(filterText)}
              canDeleteDrawer={drawers.length > 1}
              isLocked={isLocked}
              dockEffect={dockEffect}
              dockIconSize={dockIconSize}
              runningProcesses={runningProcesses}
              launchedAppIds={launchedAppIds}
              quickHotkeyMap={quickHotkeyMap}
              onToggleCollapse={handleToggleCollapse}
              onDeleteDrawer={handleRequestDeleteDrawer}
              onRenameDrawer={handleRenameDrawer}
              onChangeSort={handleChangeSort}
              onSyncFolder={handleSyncFolder}
              onBrowseFiles={handleBrowseFilesForDrawer}
              onDropItems={handleDropItems}
              onLaunchApp={handleLaunchApp}
              onLaunchWithFile={handleLaunchWithFile}
              onReorderApp={handleReorderApp}
              onDeleteApp={handleDeleteApp}
              onEditApp={openEditAppModal}
            />
          );
        })}
      </div>

      {/* Bottom Dock Status Footer */}
      <div className="px-3.5 py-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
        <span className="flex items-center gap-1.5">
          <UploadCloud
            className="w-3.5 h-3.5 text-indigo-400 shrink-0"
            aria-hidden="true"
          />
          <span>
            Drag &amp; drop Taskbar / Start Menu icons, <code className="text-slate-300 font-mono">.exe</code>,{' '}
            <code className="text-slate-300 font-mono">.lnk</code> shortcuts, or files
            into any drawer (or drop onto an app tile to open with)
          </span>
        </span>
        <span
          id="drawer-count-summary"
          aria-live="polite"
          className="font-mono text-slate-300 shrink-0 ml-2"
        >
          {drawers.length} Drawers • {totalApps} Apps
        </span>
      </div>

      {/* Hidden File Input for Drawer Browse Fallback */}
      <input
        ref={drawerFileInputRef}
        type="file"
        multiple
        tabIndex={-1}
        aria-hidden="true"
        className="hidden"
        onChange={handleDrawerFileInputChange}
      />

      {/* Modal: Add / Edit App */}
      {isAppModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={
            editingAppInfo
              ? 'Edit Application in Dock Drawer'
              : 'Add Application to Dock Drawer'
          }
          onClick={() => setIsAppModalOpen(false)}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <AppWindow className="w-4 h-4 text-indigo-400" aria-hidden="true" />
                <span>
                  {editingAppInfo
                    ? 'Edit Application in Dock Drawer'
                    : 'Add Application to Dock Drawer'}
                </span>
              </h3>
              <button
                type="button"
                aria-label="Close modal"
                onClick={() => setIsAppModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label
                  htmlFor="new-app-name"
                  className="text-[11px] text-slate-400 block mb-1"
                >
                  Application Name
                </label>
                <input
                  id="new-app-name"
                  type="text"
                  autoFocus
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveAppModal();
                  }}
                  placeholder="e.g., Visual Studio Code, Spotify, Obsidian"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>

              <div>
                <label
                  htmlFor="new-app-drawer"
                  className="text-[11px] text-slate-400 block mb-1"
                >
                  Target Drawer Category
                </label>
                <select
                  id="new-app-drawer"
                  value={appDrawerId}
                  onChange={(e) => setAppDrawerId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                >
                  {drawers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="new-app-cmd"
                  className="text-[11px] text-slate-400 block mb-1"
                >
                  Executable Path / Custom URI Protocol / URL
                </label>
                <div className="flex gap-1.5">
                  <input
                    id="new-app-cmd"
                    type="text"
                    value={appCmd}
                    onChange={(e) => setAppCmd(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveAppModal();
                    }}
                    placeholder="vscode:// or C:\Program Files\App\app.exe or https://..."
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-indigo-300"
                  />
                  <button
                    type="button"
                    onClick={handleModalBrowseClick}
                    title="Browse Local File"
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs text-slate-200 flex items-center gap-1 shrink-0"
                  >
                    <FolderSearch className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                    <span>Browse</span>
                  </button>
                </div>
                <input
                  ref={modalFileInputRef}
                  type="file"
                  tabIndex={-1}
                  aria-hidden="true"
                  className="hidden"
                  onChange={handleModalFileInputChange}
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Tip: You can also drag &amp; drop icons from the Taskbar, Start Menu,
                  or Desktop directly onto any drawer card.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label
                    htmlFor="new-app-icon"
                    className="text-[11px] text-slate-400 block mb-1"
                  >
                    Icon Style
                  </label>
                  <select
                    id="new-app-icon"
                    value={appIcon}
                    onChange={(e) => setAppIcon(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="terminal">Terminal / Code</option>
                    <option value="globe">Browser / Web</option>
                    <option value="music">Media / Audio</option>
                    <option value="message-square">Chat / Social</option>
                    <option value="figma">Design / Creative</option>
                    <option value="database">Database / Tool</option>
                    <option value="cpu">System Utility</option>
                    <option value="git-branch">Git / Version Control</option>
                    <option value="share-2">Diagram / Share</option>
                    <option value="file-text">Document / Note</option>
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="new-app-color"
                    className="text-[11px] text-slate-400 block mb-1"
                  >
                    Tile Accent
                  </label>
                  <select
                    id="new-app-color"
                    value={appColor}
                    onChange={(e) => setAppColor(e.target.value as AccentColor)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="indigo">Indigo</option>
                    <option value="cyan">Cyan</option>
                    <option value="emerald">Emerald</option>
                    <option value="amber">Amber</option>
                    <option value="rose">Rose</option>
                    <option value="purple">Purple</option>
                  </select>
                </div>
              </div>

              <div>
                <label
                  htmlFor="new-app-custom-icon"
                  className="text-[11px] text-slate-400 block mb-1"
                >
                  Custom Icon URL or Data URI (Optional)
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    id="new-app-custom-icon"
                    type="text"
                    value={appCustomIconUrl}
                    onChange={(e) => setAppCustomIconUrl(e.target.value)}
                    placeholder="data:image/png;base64,... or https://.../icon.png"
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-300"
                  />
                  <button
                    type="button"
                    data-testid="populate-app-icon-btn"
                    aria-label="Populate shortcut or application icon"
                    onClick={handlePopulateModalIcon}
                    title="Auto-populate shortcut or application icon image from path/name"
                    className="px-2.5 py-2 rounded-xl bg-indigo-950/70 hover:bg-indigo-900/70 border border-indigo-500/40 text-xs text-indigo-200 flex items-center gap-1 shrink-0"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" aria-hidden="true" />
                    <span>Auto Icon</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (customIconInputRef.current) {
                        customIconInputRef.current.value = '';
                        customIconInputRef.current.click();
                      }
                    }}
                    title="Upload Custom PNG/ICO/SVG Image"
                    className="px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs text-slate-200 flex items-center gap-1 shrink-0"
                  >
                    <ImageIcon className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
                    <span>Icon</span>
                  </button>
                  {appCustomIconUrl && (
                    <button
                      type="button"
                      onClick={() => setAppCustomIconUrl('')}
                      aria-label="Clear custom icon"
                      className="px-2 py-2 rounded-xl bg-slate-800 hover:bg-rose-950/60 text-xs text-slate-400 hover:text-rose-300"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <input
                  ref={customIconInputRef}
                  type="file"
                  accept=".png,.ico,.svg,.jpg,.jpeg,.webp,image/*"
                  tabIndex={-1}
                  aria-hidden="true"
                  className="hidden"
                  onChange={handleCustomIconFileChange}
                />
              </div>

              <div>
                <label
                  htmlFor="new-app-hotkey"
                  className="text-[11px] text-slate-400 block mb-1"
                >
                  Quick-Launch Hotkey (Optional)
                </label>
                <input
                  id="new-app-hotkey"
                  type="text"
                  value={appHotkey}
                  onChange={(e) => setAppHotkey(e.target.value)}
                  placeholder="e.g., Alt+1 or Ctrl+Shift+V (Default: Alt+1..9 by slot)"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-indigo-300"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsAppModalOpen(false)}
                className="px-3.5 py-2 rounded-xl bg-slate-800 text-xs text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!appName.trim()}
                onClick={handleSaveAppModal}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:pointer-events-none text-xs font-medium text-white transition"
              >
                {editingAppInfo ? 'Save Changes' : 'Add to Drawer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Create New Drawer */}
      {isDrawerModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Create New App Drawer"
          onClick={() => setIsDrawerModalOpen(false)}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-900 border border-slate-700 rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <FolderPlus className="w-4 h-4 text-amber-400" aria-hidden="true" />
                <span>Create New App Drawer</span>
              </h3>
              <button
                type="button"
                aria-label="Close modal"
                onClick={() => setIsDrawerModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label
                  htmlFor="new-drawer-title"
                  className="text-[11px] text-slate-400 block mb-1"
                >
                  Drawer Title
                </label>
                <input
                  id="new-drawer-title"
                  type="text"
                  autoFocus
                  value={newDrawerTitle}
                  onChange={(e) => setNewDrawerTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveNewDrawer();
                  }}
                  placeholder="e.g., Daily Dev, Creative Suite, Gaming"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>

              <div>
                <label
                  htmlFor="new-drawer-folder"
                  className="text-[11px] text-slate-400 block mb-1"
                >
                  Live Folder Path (Optional — ObjectDock Folder-View)
                </label>
                <div className="flex gap-1.5">
                  <input
                    id="new-drawer-folder"
                    type="text"
                    value={newDrawerFolder}
                    onChange={(e) => setNewDrawerFolder(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveNewDrawer();
                    }}
                    placeholder="e.g., C:\Users\Dev\Projects"
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-emerald-300"
                  />
                  <button
                    type="button"
                    onClick={handleBrowseNewDrawerFolder}
                    title="Browse Local Directory"
                    className="px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs text-slate-200 flex items-center gap-1 shrink-0"
                  >
                    <FolderSearch className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                    <span>Folder</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsDrawerModalOpen(false)}
                className="px-3.5 py-2 rounded-xl bg-slate-800 text-xs text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!newDrawerTitle.trim()}
                onClick={handleSaveNewDrawer}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:pointer-events-none text-xs font-medium text-white transition"
              >
                Create Drawer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirm Drawer Deletion */}
      {pendingDeleteDrawerId &&
        (() => {
          const pendingDrawer = drawers.find(
            (d) => d.id === pendingDeleteDrawerId
          );
          if (!pendingDrawer) return null;
          return (
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Confirm Drawer Deletion"
              data-testid="confirm-delete-drawer-modal"
              onClick={() => setPendingDeleteDrawerId(null)}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="bg-slate-900 border border-rose-500/40 rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <AlertTriangle
                      className="w-4 h-4 text-rose-400"
                      aria-hidden="true"
                    />
                    <span>Delete Drawer?</span>
                  </h3>
                  <button
                    type="button"
                    aria-label="Close confirmation modal"
                    onClick={() => setPendingDeleteDrawerId(null)}
                    className="text-slate-400 hover:text-white"
                  >
                    <X className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  Are you sure you want to delete the drawer{' '}
                  <span className="font-semibold text-white">
                    "{pendingDrawer.title}"
                  </span>{' '}
                  and remove its{' '}
                  <span className="font-mono text-rose-300">
                    {pendingDrawer.apps.length}
                  </span>{' '}
                  shortcut{pendingDrawer.apps.length === 1 ? '' : 's'} from your
                  dock?
                </p>

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    data-testid="cancel-delete-drawer-btn"
                    onClick={() => setPendingDeleteDrawerId(null)}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    data-testid="confirm-delete-drawer-btn"
                    onClick={handleConfirmDeleteDrawer}
                    className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-medium text-white transition shadow-lg shadow-rose-600/20"
                  >
                    Delete Drawer
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
    </section>
  );
};
