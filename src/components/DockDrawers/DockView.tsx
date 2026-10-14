import React, { useState, useRef } from 'react';
import {
  Search,
  FolderPlus,
  Plus,
  UploadCloud,
  AppWindow,
  X,
  FolderSearch,
} from 'lucide-react';
import { AccentColor, AppDrawer, AppItem } from '../../types/sideflow';
import { DrawerCard } from './DrawerCard';
import {
  executeAppCommand,
  extractFilenameFromPath,
  inferAppMetaFromFilename,
  resolveDroppedFilePath,
} from '../../utils/fileMeta';

interface DockViewProps {
  drawers: AppDrawer[];
  onChangeDrawers: (updater: AppDrawer[] | ((prev: AppDrawer[]) => AppDrawer[])) => void;
  onNotify: (title: string, icon?: string, subtitle?: string) => void;
}

export const DockView: React.FC<DockViewProps> = ({
  drawers,
  onChangeDrawers,
  onNotify,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<string>('all');

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

  // New Drawer Modal state
  const [isDrawerModalOpen, setIsDrawerModalOpen] = useState(false);
  const [newDrawerTitle, setNewDrawerTitle] = useState('');

  // File input refs for browser fallback
  const drawerFileInputRef = useRef<HTMLInputElement>(null);
  const modalFileInputRef = useRef<HTMLInputElement>(null);
  const [targetBrowseDrawerId, setTargetBrowseDrawerId] = useState<string | null>(
    null
  );

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

  const handleToggleCollapse = (drawerId: string) => {
    onChangeDrawers((prev) =>
      prev.map((d) => (d.id === drawerId ? { ...d, collapsed: !d.collapsed } : d))
    );
  };

  const handleDeleteDrawer = (drawerId: string) => {
    if (drawers.length <= 1) return;
    onChangeDrawers((prev) => prev.filter((d) => d.id !== drawerId));
    if (activeFilter === drawerId) {
      setActiveFilter('all');
    }
  };

  const handleRenameDrawer = (drawerId: string, newTitle: string) => {
    onChangeDrawers((prev) =>
      prev.map((d) => (d.id === drawerId ? { ...d, title: newTitle } : d))
    );
  };

  const handleLaunchApp = (app: AppItem) => {
    onNotify(`Launching ${app.name}...`, app.icon || 'rocket', app.cmd);
    executeAppCommand(app.cmd);
  };

  const handleDeleteApp = (drawerId: string, appId: string) => {
    onChangeDrawers((prev) =>
      prev.map((d) =>
        d.id === drawerId
          ? { ...d, apps: d.apps.filter((a) => a.id !== appId) }
          : d
      )
    );
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

    onNotify(
      `Added ${newApps.length} item${newApps.length > 1 ? 's' : ''} to "${targetDrawer.title}"`,
      'check',
      'Ready for one-click launch'
    );
  };

  const handleBrowseFilesForDrawer = async (drawerId: string) => {
    // Use native Electron file picker if available
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
        };
      });
      handleDropItems(drawerId, newApps);
      return;
    }

    // Fallback to HTML file input
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
    setAppDrawerId(drawers[0]?.id || '');
    setAppCmd('');
    setAppIcon('terminal');
    setAppColor('indigo');
    setIsAppModalOpen(true);
  };

  const openEditAppModal = (app: AppItem, drawerId: string) => {
    setEditingAppInfo({ drawerId, appId: app.id });
    setAppName(app.name);
    setAppDrawerId(drawerId);
    setAppCmd(app.cmd);
    setAppIcon(app.icon || 'terminal');
    setAppColor(app.color || 'indigo');
    setIsAppModalOpen(true);
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
    if (!appName.trim()) {
      setAppName(meta.name);
    }
    setAppCmd(nativePath);
    setAppIcon(meta.icon);
    setAppColor(meta.color);
  };

  const handleSaveAppModal = () => {
    const trimmedName = appName.trim();
    if (!trimmedName) return;
    const finalCmd = appCmd.trim() || 'app://launch';
    const targetDrawerId = appDrawerId || drawers[0]?.id;
    if (!targetDrawerId) return;

    if (editingAppInfo) {
      onChangeDrawers((prev) => {
        // Remove from old drawer if moved
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
                    },
                  ],
                }
              : d
          );
        }
        return updated;
      });
    } else {
      const newApp: AppItem = {
        id: `app-${Date.now()}`,
        name: trimmedName,
        cmd: finalCmd,
        icon: appIcon,
        color: appColor,
      };
      onChangeDrawers((prev) =>
        prev.map((d) =>
          d.id === targetDrawerId
            ? { ...d, collapsed: false, apps: [...d.apps, newApp] }
            : d
        )
      );
    }

    setIsAppModalOpen(false);
  };

  const handleSaveNewDrawer = () => {
    const trimmedTitle = newDrawerTitle.trim();
    if (!trimmedTitle) return;
    const newDrawer: AppDrawer = {
      id: `drawer-${Date.now()}`,
      title: trimmedTitle,
      collapsed: false,
      apps: [],
    };
    onChangeDrawers((prev) => [...prev, newDrawer]);
    setNewDrawerTitle('');
    setIsDrawerModalOpen(false);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && filterText) {
      // Find first matching app across visible drawers
      for (const drawer of visibleDrawers) {
        const match = drawer.apps.find(
          (a) =>
            a.name.toLowerCase().includes(filterText) ||
            a.cmd.toLowerCase().includes(filterText)
        );
        if (match) {
          handleLaunchApp(match);
          return;
        }
      }
      // Or if it looks like a URL/command, launch directly
      if (filterText.includes('://') || filterText.startsWith('http')) {
        onNotify(`Launching ${searchQuery}...`, 'rocket', searchQuery);
        executeAppCommand(searchQuery);
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
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            id="app-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Filter apps or type to launch..."
            aria-label="Filter apps or type to launch"
            className="w-full bg-slate-950/70 border border-slate-800 focus:border-indigo-500 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 outline-none transition"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            setNewDrawerTitle('');
            setIsDrawerModalOpen(true);
          }}
          className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-200 flex items-center gap-1.5 transition shrink-0"
        >
          <FolderPlus className="w-3.5 h-3.5 text-amber-400" />
          <span>New Drawer</span>
        </button>
        <button
          type="button"
          onClick={openAddAppModal}
          className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white flex items-center gap-1.5 transition shrink-0 shadow-lg shadow-indigo-600/20"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add App</span>
        </button>
      </div>

      {/* ObjectDock Style Drawer Selector Pills */}
      <div
        id="drawer-tabs-bar"
        className="flex items-center gap-1.5 overflow-x-auto pb-1"
      >
        <button
          type="button"
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
            onClick={() => setActiveFilter(d.id)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition shrink-0 ${
              activeFilter === d.id
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-800/80 text-slate-400 hover:text-white'
            }`}
          >
            {d.title}
          </button>
        ))}
      </div>

      {/* Drawers Container */}
      <div
        id="drawers-list-container"
        className="flex-1 overflow-y-auto space-y-4 pr-1"
      >
        {visibleDrawers.map((drawer) => {
          const filteredApps = drawer.apps.filter(
            (a) =>
              a.name.toLowerCase().includes(filterText) ||
              a.cmd.toLowerCase().includes(filterText)
          );
          return (
            <DrawerCard
              key={drawer.id}
              drawer={drawer}
              filteredApps={filteredApps}
              onToggleCollapse={handleToggleCollapse}
              onDeleteDrawer={handleDeleteDrawer}
              onRenameDrawer={handleRenameDrawer}
              onBrowseFiles={handleBrowseFilesForDrawer}
              onDropItems={handleDropItems}
              onLaunchApp={handleLaunchApp}
              onDeleteApp={handleDeleteApp}
              onEditApp={openEditAppModal}
            />
          );
        })}
      </div>

      {/* Bottom Dock Status Footer */}
      <div className="px-3.5 py-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
        <span className="flex items-center gap-1.5">
          <UploadCloud className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          <span>
            Drag &amp; drop local <code className="text-slate-300 font-mono">.exe</code>,{' '}
            <code className="text-slate-300 font-mono">.app</code>, shortcuts, or files
            directly into any drawer
          </span>
        </span>
        <span id="drawer-count-summary" className="font-mono text-slate-300 shrink-0 ml-2">
          {drawers.length} Drawers • {totalApps} Apps
        </span>
      </div>

      {/* Hidden File Input for Drawer Browse Fallback */}
      <input
        ref={drawerFileInputRef}
        type="file"
        multiple
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
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        >
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <AppWindow className="w-4 h-4 text-indigo-400" />
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
                <X className="w-4 h-4" />
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
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
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
                    placeholder="vscode:// or C:\Program Files\App\app.exe or https://..."
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-indigo-300"
                  />
                  <button
                    type="button"
                    onClick={handleModalBrowseClick}
                    title="Browse Local File"
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs text-slate-200 flex items-center gap-1 shrink-0"
                  >
                    <FolderSearch className="w-3.5 h-3.5 text-amber-400" />
                    <span>Browse</span>
                  </button>
                </div>
                <input
                  ref={modalFileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleModalFileInputChange}
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Tip: You can also drag &amp; drop files from your desktop directly onto
                  any drawer card.
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
                onClick={handleSaveAppModal}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white"
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
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        >
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <FolderPlus className="w-4 h-4 text-amber-400" />
                <span>Create New App Drawer</span>
              </h3>
              <button
                type="button"
                aria-label="Close modal"
                onClick={() => setIsDrawerModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

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
                value={newDrawerTitle}
                onChange={(e) => setNewDrawerTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveNewDrawer();
                }}
                placeholder="e.g., Daily Dev, Creative Suite, Gaming"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              />
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
                onClick={handleSaveNewDrawer}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white"
              >
                Create Drawer
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
