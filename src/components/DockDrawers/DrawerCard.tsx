import React, { useState } from 'react';
import {
  Folder,
  FolderOpen,
  Upload,
  Trash2,
  ChevronRight,
  ChevronDown,
  UploadCloud,
} from 'lucide-react';
import { AppDrawer, AppItem } from '../../types/sideflow';
import { AppTile } from './AppTile';
import {
  inferAppMetaFromFilename,
  resolveDroppedFilePath,
} from '../../utils/fileMeta';

interface DrawerCardProps {
  drawer: AppDrawer;
  filteredApps: AppItem[];
  onToggleCollapse: (drawerId: string) => void;
  onDeleteDrawer: (drawerId: string) => void;
  onRenameDrawer: (drawerId: string, newTitle: string) => void;
  onBrowseFiles: (drawerId: string) => void;
  onDropItems: (drawerId: string, newApps: AppItem[]) => void;
  onLaunchApp: (app: AppItem, drawerId: string) => void;
  onDeleteApp: (drawerId: string, appId: string) => void;
  onEditApp: (app: AppItem, drawerId: string) => void;
}

export const DrawerCard: React.FC<DrawerCardProps> = ({
  drawer,
  filteredApps,
  onToggleCollapse,
  onDeleteDrawer,
  onRenameDrawer,
  onBrowseFiles,
  onDropItems,
  onLaunchApp,
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
      e.dataTransfer.dropEffect = 'copy';
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

    const files = e.dataTransfer?.files;
    const newApps: AppItem[] = [];

    if (files && files.length > 0) {
      Array.from(files).forEach((file) => {
        const nativePath = resolveDroppedFilePath(file);
        const meta = inferAppMetaFromFilename(file.name);
        newApps.push({
          id: `app-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: meta.name,
          cmd: nativePath,
          icon: meta.icon,
          color: meta.color,
        });
      });
    } else if (e.dataTransfer) {
      const droppedUrl =
        e.dataTransfer.getData('text/uri-list') ||
        e.dataTransfer.getData('text/plain');
      if (droppedUrl && droppedUrl.trim()) {
        const cleanUrl = droppedUrl.trim();
        const label =
          cleanUrl.replace(/^https?:\/\//, '').split('/')[0] || 'Web Shortcut';
        newApps.push({
          id: `app-${Date.now()}`,
          name: label,
          cmd: cleanUrl,
          icon: 'globe',
          color: 'cyan',
        });
      }
    }

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
          }
        }}
        className="px-4 py-2.5 bg-slate-900/60 border-b border-slate-800/60 flex items-center justify-between cursor-pointer hover:bg-slate-900 transition"
      >
        <div className="flex items-center gap-2">
          {drawer.collapsed ? (
            <Folder className="w-4 h-4 text-amber-400" aria-hidden="true" />
          ) : (
            <FolderOpen className="w-4 h-4 text-amber-400" aria-hidden="true" />
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
              tabIndex={0}
              role="button"
              aria-label={`Rename ${drawer.title} drawer`}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setTitleDraft(drawer.title);
                setIsEditingTitle(true);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'F2') {
                  e.stopPropagation();
                  e.preventDefault();
                  setTitleDraft(drawer.title);
                  setIsEditingTitle(true);
                }
              }}
              title="Double-click to rename drawer"
              className="text-xs font-semibold text-white"
            >
              {drawer.title}
            </span>
          )}

          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono">
            {filteredApps.length}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
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
              onDeleteDrawer(drawer.id);
            }}
            aria-label={`Delete ${drawer.title}`}
            title="Delete Drawer"
            className="p-1 text-slate-400 hover:text-rose-400"
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
        <div className="px-3 pt-4 pb-3 grid grid-cols-3 sm:grid-cols-4 gap-2.5">
          {filteredApps.length > 0 ? (
            filteredApps.map((app) => (
              <AppTile
                key={app.id}
                app={app}
                drawerId={drawer.id}
                onLaunch={onLaunchApp}
                onDelete={onDeleteApp}
                onEdit={onEditApp}
              />
            ))
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
