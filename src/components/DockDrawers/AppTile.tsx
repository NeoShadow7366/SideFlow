import React from 'react';
import { X, Pencil } from 'lucide-react';
import { AccentColor, AppItem } from '../../types/sideflow';
import { DynamicIcon } from '../DynamicIcon';

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
  onLaunch: (app: AppItem, drawerId: string) => void;
  onDelete: (drawerId: string, appId: string) => void;
  onEdit?: (app: AppItem, drawerId: string) => void;
}

export const AppTile: React.FC<AppTileProps> = ({
  app,
  drawerId,
  onLaunch,
  onDelete,
  onEdit,
}) => {
  const styleClass = colorMap[app.color] || colorMap.indigo;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onLaunch(app, drawerId);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Launch ${app.name}`}
      onClick={() => onLaunch(app, drawerId)}
      onKeyDown={handleKeyDown}
      className="dock-item group relative flex flex-col items-center p-3 rounded-2xl bg-slate-900/90 hover:bg-slate-800/90 border border-slate-800 hover:border-slate-600 cursor-pointer text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
    >
      <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 absolute top-1.5 right-1.5 flex items-center gap-0.5 transition z-10">
        {onEdit && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(app, drawerId);
            }}
            aria-label={`Edit ${app.name}`}
            title="Edit App"
            className="w-5 h-5 rounded-full bg-slate-950/80 text-slate-400 hover:text-indigo-400 flex items-center justify-center transition"
          >
            <Pencil className="w-2.5 h-2.5" />
          </button>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(drawerId, app.id);
          }}
          aria-label={`Remove ${app.name}`}
          title="Remove App"
          className="w-5 h-5 rounded-full bg-slate-950/80 text-slate-400 hover:text-rose-400 flex items-center justify-center transition"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      <div
        className={`w-11 h-11 rounded-2xl border ${styleClass} flex items-center justify-center mb-2 shadow-inner`}
      >
        <DynamicIcon name={app.icon || 'app-window'} className="w-5 h-5" />
      </div>

      <span className="text-xs font-medium text-slate-200 line-clamp-1">{app.name}</span>
      <span
        className="text-[10px] font-mono text-slate-500 truncate max-w-full mt-0.5"
        title={app.cmd}
      >
        {app.cmd}
      </span>
    </div>
  );
};
