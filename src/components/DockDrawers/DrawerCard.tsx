import React, { useState } from 'react';
import {
  Folder,
  FolderOpen,
  FolderSync,
  ArrowUpDown,
  Upload,
  Trash2,
  Pencil,
  ChevronRight,
  ChevronDown,
  UploadCloud,
  SearchX,
} from 'lucide-react';
import {
  AppDrawer,
  AppItem,
  DockHoverEffect,
  DockIconSize,
  DrawerSortMode,
} from '../../types/sideflow';
import { AppTile } from './AppTile';
import {
  isAppProcessRunning,
  parseDroppedShortcutItems,
} from '../../utils/fileMeta';

interface DrawerCardProps {
  drawer: AppDrawer;
  filteredApps: AppItem[];
  isFiltering?: boolean;
  canDeleteDrawer?: boolean;
  isLocked?: boolean;
  dockEffect?: DockHoverEffect;
  dockIconSize?: DockIconSize;
  runningProcesses?: string[];
  launchedAppIds?: string[];
  quickHotkeyMap?: Record<string, string>;
  onToggleCollapse: (drawerId: string) => void;
  onDeleteDrawer: (drawerId: string) => void;
  onRenameDrawer: (drawerId: string, newTitle: string) => void;
  onChangeSort?: (drawerId: string, sortBy: DrawerSortMode) => void;
  onSyncFolder?: (drawerId: string) => void;
  onBrowseFiles: (drawerId: string) => void;
  onDropItems: (drawerId: string, newApps: AppItem[]) => void;
  onLaunchApp: (app: AppItem, drawerId: string) => void;
  onLaunchWithFile?: (
    app: AppItem,
    filePath: string,
    fileName: string
  ) => void;
  onReorderApp?: (
    sourceDrawerId: string,
    draggedAppId: string,
    targetDrawerId: string,
    targetAppId?: string
  ) => void;
  onDeleteApp: (drawerId: string, appId: string) => void;
  onEditApp: (app: AppItem, drawerId: string) => void;
}

export const DrawerCard: React.FC<DrawerCardProps> = ({
  drawer,
  filteredApps,
  isFiltering = false,
  canDeleteDrawer = true,
  isLocked = false,
  dockEffect = 'zoom',
  dockIconSize = 'normal',
  runningProcesses = [],
  launchedAppIds = [],
  quickHotkeyMap = {},
  onToggleCollapse,
  onDeleteDrawer,
  onRenameDrawer,
  onChangeSort,
  onSyncFolder,
  onBrowseFiles,
  onDropItems,
  onLaunchApp,
  onLaunchWithFile,
  onReorderApp,
  onDeleteApp,
  onEditApp,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(drawer.title);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      const hasInternal = e.dataTransfer.types?.includes(
        'application/x-sideflow-app'
      );
      e.dataTransfer.dropEffect = hasInternal ? 'move' : 'copy';
    }
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const related = e.relatedTarget as Node | null;
    if (!related || !e.currentTarget.contains(related)) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    // 1. Check for internal AppTile drag-and-drop across drawers
    const internalPayload = e.dataTransfer?.getData('application/x-sideflow-app');
    if (internalPayload) {
      if (isLocked || !onReorderApp) return;
      try {
        const parsed = JSON.parse(internalPayload) as {
          appId?: string;
          sourceDrawerId?: string;
        };
        if (parsed.appId && parsed.sourceDrawerId) {
          onReorderApp(parsed.sourceDrawerId, parsed.appId, drawer.id);
        }
      } catch {
        // Ignore malformed drag payload
      }
      return;
    }

    // 2. Parse Taskbar, Start Menu, Desktop shortcut, or file drops and populate shortcut/application image
    const newApps = parseDroppedShortcutItems(e.dataTransfer);
    if (newApps.length > 0) {
      onDropItems(drawer.id, newApps);
    }
  };

  const commitTitleRename = () => {
    setIsEditingTitle(false);
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== drawer.title) {
      onRenameDrawer(drawer.id, trimmed);
    } else {
      setTitleDraft(drawer.title);
    }
  };

  const currentSort: DrawerSortMode = drawer.sortBy || 'manual';
  const cycleSortMode = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onChangeSort) return;
    const nextSort: DrawerSortMode =
      currentSort === 'manual'
        ? 'name'
        : currentSort === 'name'
        ? 'type'
        : 'manual';
    onChangeSort(drawer.id, nextSort);
  };

  const gridColsClass =
    dockIconSize === 'compact'
      ? 'grid-cols-4 sm:grid-cols-5 gap-2'
      : dockIconSize === 'large'
      ? 'grid-cols-2 sm:grid-cols-3 gap-3'
      : 'grid-cols-3 sm:grid-cols-4 gap-2.5';

  return (
    <div
      data-testid={`drawer-card-${drawer.id}`}
      data-drawer-id={drawer.id}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`rounded-2xl bg-slate-950/60 border border-slate-800/90 overflow-hidden transition relative ${
        isDragOver ? 'drawer-drop-active' : ''
      }`}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={!drawer.collapsed}
        aria-label={`${drawer.title} drawer (${filteredApps.length} apps)`}
        onClick={() => onToggleCollapse(drawer.id)}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggleCollapse(drawer.id);
          } else if (e.key === 'F2') {
            e.preventDefault();
            setTitleDraft(drawer.title);
            setIsEditingTitle(true);
          }
        }}
        className="px-4 py-2.5 bg-slate-900/60 border-b border-slate-800/60 flex items-center justify-between cursor-pointer hover:bg-slate-900 transition"
      >
        <div className="flex items-center gap-2 min-w-0">
          {drawer.collapsed ? (
            <Folder className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
          ) : (
            <FolderOpen className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
          )}

          {isEditingTitle ? (
            <input
              type="text"
              aria-label="Edit drawer title"
              value={titleDraft}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitleRename}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') commitTitleRename();
                if (e.key === 'Escape') {
                  setTitleDraft(drawer.title);
                  setIsEditingTitle(false);
                }
              }}
              autoFocus
              className="bg-slate-950 text-xs font-semibold text-white px-2 py-0.5 rounded border border-indigo-500 focus:outline-none"
            />
          ) : (
            <span
              onDoubleClick={(e) => {
                e.stopPropagation();
                setTitleDraft(drawer.title);
                setIsEditingTitle(true);
              }}
              title="Double-click to rename drawer"
              className="text-xs font-semibold text-white truncate"
            >
              {drawer.title}
            </span>
          )}

          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono shrink-0">
            {filteredApps.length}
          </span>

          {drawer.folderPath && (
            <span
              title={`ObjectDock Folder-View synced to: ${drawer.folderPath}`}
              className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-mono truncate max-w-[140px] hidden sm:inline-block"
            >
              Folder: {drawer.folderPath}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {drawer.folderPath && onSyncFolder && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSyncFolder(drawer.id);
              }}
              aria-label={`Sync folder for ${drawer.title}`}
              title={`Refresh Live Folder (${drawer.folderPath})`}
              className="px-2 py-0.5 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-500/30 text-[10px] text-emerald-300 flex items-center gap-1 transition"
            >
              <FolderSync className="w-3 h-3" aria-hidden="true" />
              <span>Sync</span>
            </button>
          )}
          {onChangeSort && (
            <button
              type="button"
              onClick={cycleSortMode}
              aria-label={`Sort ${drawer.title} drawer`}
              title={`Sort order: ${currentSort.toUpperCase()} (Click to cycle Manual / Name / Type)`}
              className={`px-2 py-0.5 rounded-lg border text-[10px] flex items-center gap-1 transition ${
                currentSort !== 'manual'
                  ? 'bg-indigo-600/25 border-indigo-500/40 text-indigo-200'
                  : 'bg-slate-800/90 border-slate-700 text-slate-300 hover:text-indigo-200'
              }`}
            >
              <ArrowUpDown className="w-3 h-3" aria-hidden="true" />
              <span className="capitalize">{currentSort}</span>
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onBrowseFiles(drawer.id);
            }}
            title="Browse & Add Local Files to this Drawer"
            className="px-2 py-0.5 rounded-lg bg-slate-800/90 hover:bg-indigo-600/30 border border-slate-700 hover:border-indigo-500/40 text-[10px] text-slate-300 hover:text-indigo-200 flex items-center gap-1 transition"
          >
            <Upload className="w-3 h-3" aria-hidden="true" />
            <span>Drop / Browse</span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setTitleDraft(drawer.title);
              setIsEditingTitle(true);
            }}
            aria-label={`Rename ${drawer.title} drawer`}
            title="Rename Drawer"
            className="p-1 text-slate-400 hover:text-indigo-400 transition"
          >
            <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            disabled={!canDeleteDrawer || isLocked}
            onClick={(e) => {
              e.stopPropagation();
              onDeleteDrawer(drawer.id);
            }}
            aria-label={`Delete ${drawer.title}`}
            title={
              isLocked
                ? 'Unlock dock icons to delete drawers'
                : canDeleteDrawer
                ? 'Delete Drawer'
                : 'Cannot delete the last remaining drawer'
            }
            className="p-1 text-slate-400 hover:text-rose-400 disabled:opacity-30 disabled:pointer-events-none transition"
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          {drawer.collapsed ? (
            <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" aria-hidden="true" />
          )}
        </div>
      </div>

      {!drawer.collapsed && (
        <div className={`px-3 pt-4 pb-3 grid ${gridColsClass}`}>
          {filteredApps.length > 0 ? (
            filteredApps.map((app) => (
              <AppTile
                key={app.id}
                app={app}
                drawerId={drawer.id}
                isLocked={isLocked}
                isRunning={isAppProcessRunning(
                  app,
                  runningProcesses,
                  launchedAppIds
                )}
                hotkeyBadge={app.hotkey || quickHotkeyMap[app.id]}
                dockEffect={dockEffect}
                dockIconSize={dockIconSize}
                onLaunch={onLaunchApp}
                onLaunchWithFile={onLaunchWithFile}
                onReorderApp={onReorderApp}
                onDelete={onDeleteApp}
                onEdit={onEditApp}
              />
            ))
          ) : isFiltering && drawer.apps.length > 0 ? (
            <div className="col-span-full rounded-xl py-4 px-3 text-center bg-slate-900/20 border border-slate-800/60">
              <SearchX
                className="w-4 h-4 text-slate-400 mx-auto mb-1"
                aria-hidden="true"
              />
              <p className="text-xs text-slate-400">
                No apps in <span className="text-slate-300">{drawer.title}</span> match
                your filter
              </p>
            </div>
          ) : (
            <div
              role="button"
              tabIndex={0}
              aria-label={`Browse files to add to ${drawer.title}`}
              onClick={() => onBrowseFiles(drawer.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onBrowseFiles(drawer.id);
                }
              }}
              className="col-span-full border border-dashed border-slate-700/80 hover:border-indigo-500/60 rounded-xl py-5 px-3 text-center cursor-pointer transition bg-slate-900/30 hover:bg-indigo-950/20"
            >
              <UploadCloud
                className="w-5 h-5 text-indigo-400 mx-auto mb-1"
                aria-hidden="true"
              />
              <p className="text-xs font-medium text-slate-300">
                Drag &amp; drop local apps, shortcuts, or files here
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Or click to browse your computer
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
