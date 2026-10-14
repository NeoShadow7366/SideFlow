import React from 'react';
import {
  Zap,
  Grid,
  GitBranch,
  Mic,
  Sliders,
  Pin,
  PanelRightClose,
} from 'lucide-react';
import { TabId } from '../types/sideflow';

interface HeaderProps {
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
  isPinned: boolean;
  onTogglePin: () => void;
  onClosePanel: () => void;
  shortcutLabel: string;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onSelectTab,
  isPinned,
  onTogglePin,
  onClosePanel,
  shortcutLabel,
}) => {
  const navTabs: { id: TabId; label?: string; title: string; icon: React.ReactNode }[] = [
    {
      id: 'drawers',
      label: 'Dock',
      title: 'App Drawers',
      icon: <Grid className="w-3.5 h-3.5" />,
    },
    {
      id: 'flowchart',
      label: 'Flow',
      title: 'Flowchart Scratchpad',
      icon: <GitBranch className="w-3.5 h-3.5" />,
    },
    {
      id: 'notes',
      label: 'Notes',
      title: 'Voice & Quick Notes',
      icon: <Mic className="w-3.5 h-3.5" />,
    },
    {
      id: 'settings',
      title: 'Shortcut & Tray Settings',
      icon: <Sliders className="w-3.5 h-3.5" />,
    },
  ];

  return (
    <header className="px-4 py-3 border-b border-slate-800/80 flex items-center justify-between bg-slate-950/40">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
          <Zap className="w-4 h-4" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold tracking-tight text-white">SideFlow</h2>
            <span
              data-testid="pin-badge"
              className={`text-[10px] px-1.5 py-0.5 rounded font-medium border ${
                isPinned
                  ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
              }`}
            >
              {isPinned ? 'Pinned' : 'Auto-Hide'}
            </span>
          </div>
          <p className="text-[11px] text-slate-400">
            Hotkey: <span className="font-mono text-slate-300">{shortcutLabel}</span>
          </p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <nav
        role="tablist"
        aria-label="SideFlow Sections"
        className="flex items-center bg-slate-950/80 p-1 rounded-xl border border-slate-800"
      >
        {navTabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              aria-label={tab.label || tab.title}
              title={tab.title}
              onClick={() => onSelectTab(tab.id)}
              className={`tab-btn px-2.5 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
                isActive
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {tab.icon}
              {tab.label && <span>{tab.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Pin & Collapse Controls */}
      <div className="flex items-center gap-1">
        <button
          onClick={onTogglePin}
          aria-label="Pin or Auto-Hide when clicking outside"
          title="Pin / Auto-Hide when clicking outside"
          className={`p-2 rounded-xl hover:bg-slate-800 transition ${
            isPinned ? 'text-indigo-400' : 'text-slate-500'
          }`}
        >
          <Pin className="w-4 h-4" />
        </button>
        <button
          onClick={onClosePanel}
          aria-label="Hide to System Tray"
          title="Hide to System Tray"
          className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
        >
          <PanelRightClose className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
