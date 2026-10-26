import React from 'react';
import {
  Grid,
  GitBranch,
  Mic,
  Sliders,
  Pin,
  PanelLeftClose,
  PanelRightClose,
} from 'lucide-react';
import { PanelEdge, TabId } from '../types/sideflow';
import { SideFlowIcon } from './SideFlowIcon';

interface HeaderProps {
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
  isPinned: boolean;
  onTogglePin: () => void;
  onClosePanel: () => void;
  shortcutLabel: string;
  isDictating?: boolean;
  effectiveEdge?: PanelEdge;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onSelectTab,
  isPinned,
  onTogglePin,
  onClosePanel,
  shortcutLabel,
  isDictating = false,
  effectiveEdge = 'right',
}) => {
  const navTabs: {
    id: TabId;
    label: string;
    title: string;
    icon: React.ReactNode;
  }[] = [
    {
      id: 'drawers',
      label: 'Dock',
      title: 'App Drawers (Ctrl+1)',
      icon: <Grid className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />,
    },
    {
      id: 'flowchart',
      label: 'Flow',
      title: 'Flowchart Scratchpad (Ctrl+2)',
      icon: <GitBranch className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />,
    },
    {
      id: 'notes',
      label: 'Notes',
      title: 'Voice & Quick Notes (Ctrl+3)',
      icon: <Mic className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />,
    },
    {
      id: 'settings',
      label: 'Config',
      title: 'Shortcut & Tray Settings (Ctrl+4)',
      icon: <Sliders className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />,
    },
  ];

  const handleTabKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    index: number
  ) => {
    let nextIndex: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      nextIndex = (index + dir + navTabs.length) % navTabs.length;
    } else if (e.key === 'Home') {
      nextIndex = 0;
    } else if (e.key === 'End') {
      nextIndex = navTabs.length - 1;
    }

    if (nextIndex !== null) {
      e.preventDefault();
      const nextTab = navTabs[nextIndex];
      onSelectTab(nextTab.id);
      document.getElementById(`tab-btn-${nextTab.id}`)?.focus();
    }
  };

  return (
    <header className="panel-cq-header px-3.5 py-2.5 border-b border-slate-800/80 flex items-center justify-between gap-2 bg-slate-950/50">
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-600 via-blue-500 to-cyan-400 border border-cyan-300/30 flex items-center justify-center text-white shadow-md shadow-indigo-500/25 shrink-0">
          <SideFlowIcon className="w-5 h-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h2 className="text-sm font-bold tracking-tight text-white truncate">
              SideFlow
            </h2>
            <button
              type="button"
              data-testid="pin-badge"
              onClick={onTogglePin}
              aria-pressed={isPinned}
              aria-label={
                isPinned
                  ? 'Pinned — Click to Auto-Hide when clicking outside'
                  : 'Auto-Hide — Click to Pin panel open'
              }
              title={
                isPinned
                  ? 'Panel is Pinned Open (Click to switch to Auto-Hide)'
                  : 'Auto-Hide Enabled (Click to Pin panel open)'
              }
              className={`min-h-[24px] text-[10px] px-2 py-0.5 rounded-md font-medium border inline-flex items-center gap-1 transition cursor-pointer shrink-0 ${
                isPinned
                  ? 'bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-200 border-indigo-400/40'
                  : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border-amber-400/40'
              }`}
            >
              <Pin
                className={`w-2.5 h-2.5 ${isPinned ? 'fill-current' : ''}`}
                aria-hidden="true"
              />
              <span>{isPinned ? 'Pinned' : 'Auto-Hide'}</span>
            </button>
          </div>
          <p className="cq-hotkey-subtitle text-[11px] text-slate-400 truncate">
            Hotkey:{' '}
            <span className="font-mono text-slate-300">{shortcutLabel}</span>
          </p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <nav
        role="tablist"
        aria-label="SideFlow Sections"
        className="flex items-center bg-slate-950/85 p-1 rounded-xl border border-slate-800 shrink-0"
      >
        {navTabs.map((tab, idx) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`tab-btn-${tab.id}`}
              type="button"
              role="tab"
              tabIndex={isActive ? 0 : -1}
              aria-selected={isActive}
              aria-controls={`tabpanel-${tab.id}`}
              aria-label={
                tab.id === 'settings'
                  ? 'Config — Shortcut & Tray Settings'
                  : tab.label
              }
              title={tab.title}
              onClick={() => onSelectTab(tab.id)}
              onKeyDown={(e) => handleTabKeyDown(e, idx)}
              className={`tab-btn min-h-[28px] px-2.5 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
                isActive
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {tab.icon}
              <span className={isActive ? '' : 'cq-inactive-tab-label'}>
                {tab.label}
              </span>
              {tab.id === 'notes' && isDictating && (
                <span
                  data-testid="header-dictating-indicator"
                  title="Voice Dictation Active in Background"
                  className="relative flex h-2 w-2 ml-0.5"
                >
                  <span className="animate-ping motion-reduce:animate-none absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Collapse Control (Direction-Aware Left vs Right Bezel) */}
      <div className="flex items-center shrink-0">
        <button
          type="button"
          onClick={onClosePanel}
          aria-label="Hide to System Tray"
          title={`Hide to ${
            effectiveEdge === 'left' ? 'Left' : 'Right'
          } Edge / System Tray (${shortcutLabel})`}
          className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition"
        >
          {effectiveEdge === 'left' ? (
            <PanelLeftClose className="w-4 h-4" aria-hidden="true" />
          ) : (
            <PanelRightClose className="w-4 h-4" aria-hidden="true" />
          )}
        </button>
      </div>
    </header>
  );
};
