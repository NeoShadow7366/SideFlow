import React, { useState } from 'react';
import { X, Pencil } from 'lucide-react';
import {
  AccentColor,
  AppItem,
  DockHoverEffect,
  DockIconSize,
} from '../../types/sideflow';
import { DynamicIcon } from '../DynamicIcon';
import { resolveDroppedFilePath } from '../../utils/fileMeta';

export const colorMap: Record<AccentColor, string> = {
  indigo: 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300',
  cyan: 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300',
  emerald: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300',
  amber: 'bg-amber-500/20 border-amber-500/40 text-amber-300',
  rose: 'bg-rose-500/20 border-rose-500/40 text-rose-300',
  purple: 'bg-purple-500/20 border-purple-500/40 text-purple-300',
};

interface AppTileProps {
  app: AppItem;
  drawerId: string;
  isLocked?: boolean;
  isRunning?: boolean;
  hotkeyBadge?: string;
  dockEffect?: DockHoverEffect;
  dockIconSize?: DockIconSize;
  onLaunch: (app: AppItem, drawerId: string) => void;
  onLaunchWithFile?: (
    app: AppItem,
    filePath: string,
    fileName: string
  ) => void;
  onReorderApp?: (
    sourceDrawerId: string,
    draggedAppId: string,
    targetDrawerId: string,
    targetAppId: string
  ) => void;
  onDelete: (drawerId: string, appId: string) => void;
  onEdit?: (app: AppItem, drawerId: string) => void;
}

export const AppTile: React.FC<AppTileProps> = ({
  app,
  drawerId,
  isLocked = false,
  isRunning = false,
  hotkeyBadge,
  dockEffect = 'zoom',
  dockIconSize = 'normal',
  onLaunch,
  onLaunchWithFile,
  onReorderApp,
  onDelete,
  onEdit,
}) => {
  const [isDragOverTile, setIsDragOverTile] = useState(false);
  const styleClass = colorMap[app.color] || colorMap.indigo;

  const effectClass =
    dockEffect === 'swing'
      ? 'dock-effect-swing'
      : dockEffect === 'glow'
      ? 'dock-effect-glow'
      : dockEffect === 'none'
      ? 'dock-effect-none'
      : '';

  const boxSizeClass =
    dockIconSize === 'compact'
      ? 'w-9 h-9 rounded-xl'
      : dockIconSize === 'large'
      ? 'w-14 h-14 rounded-2xl'
      : 'w-11 h-11 rounded-2xl';

  const iconSizeClass =
    dockIconSize === 'compact'
      ? 'w-4 h-4'
      : dockIconSize === 'large'
      ? 'w-7 h-7'
      : 'w-5 h-5';

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    const targetEl = e.target as HTMLElement | null;
    if (
      isLocked ||
      targetEl?.closest?.('[data-tile-actions="true"]')
    ) {
      e.preventDefault();
      return;
    }
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData(
        'application/x-sideflow-app',
        JSON.stringify({ appId: app.id, sourceDrawerId: drawerId })
      );
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragOverTile) {
      setIsDragOverTile(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const related = e.relatedTarget as Node | null;
    if (!related || !e.currentTarget.contains(related)) {
      setIsDragOverTile(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    const internalPayload = e.dataTransfer?.getData('application/x-sideflow-app');
    if (internalPayload) {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOverTile(false);
      if (isLocked || !onReorderApp) return;
      try {
        const parsed = JSON.parse(internalPayload) as {
          appId?: string;
          sourceDrawerId?: string;
        };
        if (
          parsed.appId &&
          parsed.sourceDrawerId &&
          (parsed.appId !== app.id || parsed.sourceDrawerId !== drawerId)
        ) {
          onReorderApp(parsed.sourceDrawerId, parsed.appId, drawerId, app.id);
        }
      } catch {
        // Ignore malformed drag payload
      }
      return;
    }

    const files = e.dataTransfer?.files;
    if (files && files.length > 0 && onLaunchWithFile) {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOverTile(false);
      const firstFile = files[0];
      const filePath = resolveDroppedFilePath(firstFile);
      onLaunchWithFile(app, filePath, firstFile.name);
      return;
    }

    setIsDragOverTile(false);
  };

  return (
    <div
      draggable={!isLocked}
      data-testid={`app-tile-${app.id}`}
      data-app-cmd={app.cmd}
      title={`${app.name} — ${app.cmd}`}
      onContextMenu={(e) => {
        if (onEdit) {
          e.preventDefault();
          e.stopPropagation();
          onEdit(app, drawerId);
        }
      }}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`dock-item ${effectClass} group relative rounded-2xl bg-slate-900/90 hover:bg-slate-800/90 border transition ${
        isDragOverTile
          ? 'border-indigo-400 ring-2 ring-indigo-500/40 bg-indigo-950/30'
          : 'border-slate-800 hover:border-slate-600'
      }`}
    >
      {/* Primary Un-Nested Launch Button (WCAG 4.1.2) */}
      <button
        type="button"
        aria-label={`Launch ${app.name}`}
        title={`${app.name} — ${app.cmd}`}
        onClick={() => onLaunch(app, drawerId)}
        className="w-full flex flex-col items-center p-3 rounded-2xl text-center cursor-pointer focus:outline-none"
      >
        {hotkeyBadge && (
          <span
            data-testid={`hotkey-badge-${app.id}`}
            title={`Quick Launch Shortcut: ${hotkeyBadge}`}
            className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-slate-950/90 border border-slate-700/80 text-[10px] font-mono text-indigo-300 leading-none pointer-events-none"
          >
            {hotkeyBadge}
          </span>
        )}

        <div
          className={`relative ${boxSizeClass} border ${styleClass} flex items-center justify-center mb-2 shadow-inner overflow-hidden`}
        >
          {app.customIconUrl ? (
            <img
              src={app.customIconUrl}
              alt={`${app.name} icon`}
              data-testid={`custom-icon-${app.id}`}
              className={`${iconSizeClass} object-contain`}
            />
          ) : (
            <DynamicIcon
              name={app.icon || 'app-window'}
              className={iconSizeClass}
              aria-hidden="true"
            />
          )}
        </div>

        <div className="flex items-center justify-center gap-1 max-w-full">
          {isRunning && (
            <span
              data-testid={`running-indicator-${app.id}`}
              title={`${app.name} is currently running`}
              className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)] shrink-0"
            />
          )}
          <span className="text-xs font-medium text-slate-100 line-clamp-1">
            {app.name}
          </span>
        </div>
      </button>

      {/* Sibling Quick-Action Overlay Buttons (Edit / Remove — >= 24x24px hit targets) */}
      <div
        data-tile-actions="true"
        draggable={false}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onDragStart={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 absolute top-1 right-1 flex items-center gap-1 transition z-30 pointer-events-auto"
      >
        {onEdit && (
          <button
            type="button"
            draggable={false}
            data-testid={`edit-app-btn-${app.id}`}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onEdit(app, drawerId);
            }}
            aria-label={`Edit ${app.name}`}
            title={`Edit ${app.name} (or right-click tile)`}
            className="w-6 h-6 rounded-full bg-slate-950/95 border border-slate-700/80 hover:border-indigo-400 text-slate-300 hover:text-indigo-300 hover:bg-indigo-950/90 flex items-center justify-center shadow-md transition cursor-pointer"
          >
            <Pencil className="w-3 h-3 pointer-events-none" aria-hidden="true" />
          </button>
        )}
        {!isLocked && (
          <button
            type="button"
            draggable={false}
            data-testid={`remove-app-btn-${app.id}`}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDelete(drawerId, app.id);
            }}
            aria-label={`Remove ${app.name}`}
            title={`Remove ${app.name}`}
            className="w-6 h-6 rounded-full bg-slate-950/95 border border-slate-700/80 hover:border-rose-400 text-slate-300 hover:text-rose-300 hover:bg-rose-950/90 flex items-center justify-center shadow-md transition cursor-pointer"
          >
            <X className="w-3.5 h-3.5 pointer-events-none" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
};
