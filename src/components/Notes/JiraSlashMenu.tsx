import React, { useState, useEffect, useRef } from 'react';
import {
  Type,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  GitCommit,
  Info,
  FileText,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Table,
  Code2,
  GitBranch,
  Tag,
  Calendar,
  AtSign,
  Smile,
  ChevronRight,
  Quote,
  Minus,
  Columns,
  Link2,
  Image,
  X,
  ExternalLink,
  Trash2,
} from 'lucide-react';
import { AdfStatusColor } from '../../types/sideflow';
import {
  JIRA_EMOJIS,
  JIRA_HIGHLIGHT_COLORS,
  JIRA_STATUS_COLORS,
  JIRA_TEXT_COLORS,
} from '../../utils/adf';

export type JiraSlashCommandId =
  | 'paragraph'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'h5'
  | 'h6'
  | 'bulletList'
  | 'orderedList'
  | 'taskList'
  | 'decisionList'
  | 'panel-info'
  | 'panel-note'
  | 'panel-success'
  | 'panel-warning'
  | 'panel-error'
  | 'table'
  | 'codeBlock'
  | 'mermaidBlock'
  | 'expand'
  | 'blockquote'
  | 'rule'
  | 'layout2'
  | 'layout3'
  | 'status'
  | 'date'
  | 'mention'
  | 'emoji'
  | 'link'
  | 'inlineCard'
  | 'image';

export interface JiraSlashCommandDef {
  id: JiraSlashCommandId;
  title: string;
  description: string;
  shortcut?: string;
  category: 'Formatting' | 'Lists' | 'Panels & Layout' | 'Inline & Media';
  keywords: string;
  renderIcon: () => React.ReactNode;
}

export const JIRA_SLASH_COMMANDS: JiraSlashCommandDef[] = [
  {
    id: 'taskList',
    title: 'Action item',
    description: 'Create interactive Jira task checkboxes',
    shortcut: '[]',
    category: 'Lists',
    keywords: 'action item task todo checklist checkbox',
    renderIcon: () => <CheckSquare className="w-3.5 h-3.5 text-sky-400" />,
  },
  {
    id: 'status',
    title: 'Status',
    description: 'Insert colored Jira workflow status lozenge',
    shortcut: '/status',
    category: 'Inline & Media',
    keywords: 'status lozenge badge pill workflow done blocked progress',
    renderIcon: () => <Tag className="w-3.5 h-3.5 text-emerald-400" />,
  },
  {
    id: 'table',
    title: 'Table',
    description: 'Insert customizable Jira grid table with headers',
    shortcut: '/table',
    category: 'Panels & Layout',
    keywords: 'table grid rows columns cells spreadsheet',
    renderIcon: () => <Table className="w-3.5 h-3.5 text-indigo-400" />,
  },
  {
    id: 'panel-info',
    title: 'Info panel',
    description: 'Highlight important context in a blue callout box',
    shortcut: '/info',
    category: 'Panels & Layout',
    keywords: 'info panel callout notice box blue',
    renderIcon: () => <Info className="w-3.5 h-3.5 text-sky-400" />,
  },
  {
    id: 'panel-note',
    title: 'Note panel',
    description: 'Add supplementary notes in a purple callout box',
    shortcut: '/note',
    category: 'Panels & Layout',
    keywords: 'note panel callout purple sticky',
    renderIcon: () => <FileText className="w-3.5 h-3.5 text-purple-400" />,
  },
  {
    id: 'panel-success',
    title: 'Success panel',
    description: 'Confirm outcomes or tips in a green callout box',
    shortcut: '/success',
    category: 'Panels & Layout',
    keywords: 'success tip panel green check approved',
    renderIcon: () => <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />,
  },
  {
    id: 'panel-warning',
    title: 'Warning panel',
    description: 'Call attention to risks in an amber warning panel',
    shortcut: '/warning',
    category: 'Panels & Layout',
    keywords: 'warning caution alert panel yellow amber',
    renderIcon: () => <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />,
  },
  {
    id: 'panel-error',
    title: 'Error panel',
    description: 'Flag critical blockers in a red error panel',
    shortcut: '/error',
    category: 'Panels & Layout',
    keywords: 'error danger blocker panel red',
    renderIcon: () => <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />,
  },
  {
    id: 'expand',
    title: 'Expand',
    description: 'Collapsible toggle section to keep long specs tidy',
    shortcut: '/expand',
    category: 'Panels & Layout',
    keywords: 'expand collapse accordion details toggle section',
    renderIcon: () => <ChevronRight className="w-3.5 h-3.5 text-indigo-300" />,
  },
  {
    id: 'codeBlock',
    title: 'Code snippet',
    description: 'Syntax-labeled multi-line code block',
    shortcut: '```',
    category: 'Panels & Layout',
    keywords: 'code block snippet preformatted json typescript sql',
    renderIcon: () => <Code2 className="w-3.5 h-3.5 text-amber-300" />,
  },
  {
    id: 'mermaidBlock',
    title: 'Mermaid diagram',
    description: 'Code block with live Flowchart Studio SVG diagram',
    shortcut: '```mermaid',
    category: 'Panels & Layout',
    keywords: 'mermaid diagram flowchart sequence architecture',
    renderIcon: () => <GitBranch className="w-3.5 h-3.5 text-emerald-400" />,
  },
  {
    id: 'date',
    title: 'Date',
    description: 'Insert formatted inline Jira calendar date chip',
    shortcut: '/date',
    category: 'Inline & Media',
    keywords: 'date calendar due deadline timestamp //',
    renderIcon: () => <Calendar className="w-3.5 h-3.5 text-sky-300" />,
  },
  {
    id: 'mention',
    title: 'Mention',
    description: 'Tag a teammate or stakeholder inline (@user)',
    shortcut: '/mention',
    category: 'Inline & Media',
    keywords: 'mention user assignee tag person @',
    renderIcon: () => <AtSign className="w-3.5 h-3.5 text-indigo-300" />,
  },
  {
    id: 'decisionList',
    title: 'Decision',
    description: 'Record architectural or sprint decisions',
    shortcut: '<>',
    category: 'Lists',
    keywords: 'decision agreed outcome <>',
    renderIcon: () => <GitCommit className="w-3.5 h-3.5 text-emerald-300" />,
  },
  {
    id: 'h1',
    title: 'Heading 1',
    description: 'Large top-level section heading',
    shortcut: '#',
    category: 'Formatting',
    keywords: 'h1 heading 1 title large',
    renderIcon: () => <Heading1 className="w-3.5 h-3.5 text-slate-200" />,
  },
  {
    id: 'h2',
    title: 'Heading 2',
    description: 'Medium section heading',
    shortcut: '##',
    category: 'Formatting',
    keywords: 'h2 heading 2 subtitle medium',
    renderIcon: () => <Heading2 className="w-3.5 h-3.5 text-slate-200" />,
  },
  {
    id: 'h3',
    title: 'Heading 3',
    description: 'Subsection heading',
    shortcut: '###',
    category: 'Formatting',
    keywords: 'h3 heading 3 subsection',
    renderIcon: () => <Heading3 className="w-3.5 h-3.5 text-slate-200" />,
  },
  {
    id: 'bulletList',
    title: 'Bullet list',
    description: 'Unordered bulleted list',
    shortcut: '-',
    category: 'Lists',
    keywords: 'bullet unordered list ul',
    renderIcon: () => <List className="w-3.5 h-3.5 text-slate-200" />,
  },
  {
    id: 'orderedList',
    title: 'Numbered list',
    description: 'Ordered sequential list',
    shortcut: '1.',
    category: 'Lists',
    keywords: 'numbered ordered list ol',
    renderIcon: () => <ListOrdered className="w-3.5 h-3.5 text-slate-200" />,
  },
  {
    id: 'blockquote',
    title: 'Quote',
    description: 'Capture a callout quote or customer verbatim',
    shortcut: '>',
    category: 'Formatting',
    keywords: 'quote blockquote citation',
    renderIcon: () => <Quote className="w-3.5 h-3.5 text-slate-300" />,
  },
  {
    id: 'rule',
    title: 'Divider',
    description: 'Visually separate sections with a horizontal rule',
    shortcut: '---',
    category: 'Panels & Layout',
    keywords: 'divider horizontal rule line separator hr',
    renderIcon: () => <Minus className="w-3.5 h-3.5 text-slate-300" />,
  },
  {
    id: 'layout2',
    title: '2 Columns layout',
    description: 'Side-by-side two-column ADF layout section',
    shortcut: '/layout',
    category: 'Panels & Layout',
    keywords: 'columns layout two split grid section',
    renderIcon: () => <Columns className="w-3.5 h-3.5 text-cyan-400" />,
  },
  {
    id: 'layout3',
    title: '3 Columns layout',
    description: 'Three-column ADF layout section',
    shortcut: '/layout3',
    category: 'Panels & Layout',
    keywords: 'columns layout three 3 grid section',
    renderIcon: () => <Columns className="w-3.5 h-3.5 text-teal-400" />,
  },
  {
    id: 'inlineCard',
    title: 'Smart Link card',
    description: 'Embed URL as an inline Jira Smart Link chip',
    shortcut: '/link',
    category: 'Inline & Media',
    keywords: 'smart link card url jira ticket issue',
    renderIcon: () => <Link2 className="w-3.5 h-3.5 text-sky-400" />,
  },
  {
    id: 'image',
    title: 'Image / Media URL',
    description: 'Embed an external image inside ADF mediaSingle',
    shortcut: '/image',
    category: 'Inline & Media',
    keywords: 'image photo media screenshot url',
    renderIcon: () => <Image className="w-3.5 h-3.5 text-purple-300" />,
  },
  {
    id: 'emoji',
    title: 'Emoji',
    description: 'Insert Jira status/reaction emoji',
    shortcut: '/emoji',
    category: 'Inline & Media',
    keywords: 'emoji icon smile reaction :',
    renderIcon: () => <Smile className="w-3.5 h-3.5 text-amber-300" />,
  },
  {
    id: 'paragraph',
    title: 'Normal text',
    description: 'Standard body paragraph',
    category: 'Formatting',
    keywords: 'normal paragraph text body',
    renderIcon: () => <Type className="w-3.5 h-3.5 text-slate-300" />,
  },
];

export function filterSlashCommands(query: string): JiraSlashCommandDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return JIRA_SLASH_COMMANDS;
  return JIRA_SLASH_COMMANDS.filter(
    (cmd) =>
      cmd.title.toLowerCase().includes(q) ||
      cmd.id.toLowerCase().includes(q) ||
      cmd.keywords.toLowerCase().includes(q) ||
      (cmd.shortcut && cmd.shortcut.toLowerCase().includes(q))
  );
}

interface JiraSlashMenuProps {
  query: string;
  activeIndex: number;
  onHighlightIndex: (idx: number) => void;
  onSelect: (cmd: JiraSlashCommandDef) => void;
  onClose: () => void;
}

export const JiraSlashMenu: React.FC<JiraSlashMenuProps> = ({
  query,
  activeIndex,
  onHighlightIndex,
  onSelect,
  onClose,
}) => {
  const matches = filterSlashCommands(query);
  const safeIdx =
    matches.length === 0
      ? -1
      : Math.min(Math.max(0, activeIndex), matches.length - 1);
  const activeOptionRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    activeOptionRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [safeIdx, query]);

  return (
    <div
      id="jira-slash-menu-listbox"
      data-testid="jira-slash-menu"
      role="listbox"
      aria-label="Jira Quick Insert Slash Commands"
      className="mt-1.5 w-full max-w-xs rounded-xl bg-slate-900/98 border border-sky-500/40 shadow-2xl overflow-hidden z-30"
    >
      <div className="px-2.5 py-1.5 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between text-[10px]">
        <span className="font-semibold text-sky-300">
          Quick Insert {query ? `"/${query}"` : '("/")'}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close slash menu"
          className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-white rounded"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {matches.length === 0 ? (
        <div className="px-3 py-3 text-[11px] text-slate-400 italic">
          No Jira blocks match &ldquo;/{query}&rdquo;
        </div>
      ) : (
        <div className="max-h-52 overflow-y-auto py-1">
          {matches.map((cmd, idx) => {
            const isSelected = idx === safeIdx;
            return (
              <button
                key={cmd.id}
                ref={isSelected ? activeOptionRef : null}
                id={`jira-slash-opt-${cmd.id}`}
                type="button"
                role="option"
                aria-selected={isSelected}
                data-testid={`slash-cmd-${cmd.id}`}
                onMouseEnter={() => onHighlightIndex(idx)}
                onMouseDown={(e) => {
                  e.preventDefault();
                }}
                onClick={() => onSelect(cmd)}
                className={`w-full px-2.5 py-1.5 text-left flex items-center justify-between gap-2 transition ${
                  isSelected
                    ? 'bg-sky-600/25 text-white'
                    : 'text-slate-300 hover:bg-slate-800/80'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-6 h-6 rounded-lg bg-slate-950/90 border border-slate-800 flex items-center justify-center shrink-0">
                    {cmd.renderIcon()}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold text-white truncate">
                      {cmd.title}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate">
                      {cmd.description}
                    </div>
                  </div>
                </div>
                {cmd.shortcut && (
                  <span className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 font-mono text-[9px] text-slate-400 shrink-0">
                    {cmd.shortcut}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

interface StatusEditorPopoverProps {
  initialText: string;
  initialColor: AdfStatusColor;
  onSave: (text: string, color: AdfStatusColor) => void;
  onRemove?: () => void;
  onClose: () => void;
}

export const StatusEditorPopover: React.FC<StatusEditorPopoverProps> = ({
  initialText,
  initialColor,
  onSave,
  onRemove,
  onClose,
}) => {
  const [text, setText] = useState(initialText);
  const [color, setColor] = useState<AdfStatusColor>(initialColor);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(text.trim() || 'IN PROGRESS', color);
  };

  return (
    <form
      onSubmit={handleSubmit}
      data-testid="jira-status-popover"
      role="dialog"
      aria-label="Edit Jira Status Lozenge"
      className="p-2.5 rounded-xl bg-slate-900 border border-sky-500/40 shadow-2xl flex flex-col gap-2 w-full max-w-[16rem] z-30"
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-sky-300">
          Status Lozenge
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close status editor"
          className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-white rounded"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <input
        ref={inputRef}
        type="text"
        aria-label="Status Label"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. IN PROGRESS, BLOCKED, DONE"
        className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-xs font-semibold uppercase text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
      />

      <div className="flex items-center justify-between gap-1">
        {JIRA_STATUS_COLORS.map((sc) => (
          <button
            key={sc.id}
            type="button"
            aria-label={`Status color ${sc.id}`}
            aria-pressed={color === sc.id}
            title={sc.label}
            onClick={() => setColor(sc.id)}
            className={`w-7 h-6 rounded-md border flex items-center justify-center transition ${
              sc.pillClass
            } ${color === sc.id ? 'ring-2 ring-white scale-105' : 'opacity-75 hover:opacity-100'}`}
          >
            <span className={`w-2.5 h-2.5 rounded-full ${sc.dotClass}`} />
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-1.5 pt-1">
        {onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remove status lozenge"
            className="px-2 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 text-[10px] flex items-center gap-1"
          >
            <Trash2 className="w-3 h-3" /> Remove
          </button>
        ) : (
          <span />
        )}
        <button
          type="submit"
          className="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-semibold"
        >
          Apply Status
        </button>
      </div>
    </form>
  );
};

interface LinkEditorPopoverProps {
  initialText: string;
  initialUrl: string;
  initialDisplayMode?: 'link' | 'inlineCard' | 'blockCard';
  onApply: (payload: {
    text: string;
    url: string;
    displayMode: 'link' | 'inlineCard' | 'blockCard';
  }) => void;
  onClose: () => void;
}

export const LinkEditorPopover: React.FC<LinkEditorPopoverProps> = ({
  initialText,
  initialUrl,
  initialDisplayMode = 'link',
  onApply,
  onClose,
}) => {
  const [url, setUrl] = useState(initialUrl || 'https://');
  const [text, setText] = useState(initialText);
  const [displayMode, setDisplayMode] = useState<
    'link' | 'inlineCard' | 'blockCard'
  >(initialDisplayMode);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUrl = url.trim();
    if (!cleanUrl) return;
    onApply({
      url: cleanUrl,
      text: text.trim() || cleanUrl,
      displayMode,
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      data-testid="jira-link-popover"
      role="dialog"
      aria-label="Insert Jira Link or Smart Card"
      className="p-2.5 rounded-xl bg-slate-900 border border-sky-500/40 shadow-2xl flex flex-col gap-2 w-full max-w-[18rem] z-30"
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-sky-300 flex items-center gap-1">
          <ExternalLink className="w-3 h-3" /> Jira Link / Smart Card
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close link popover"
          className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-white rounded"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <input
        type="text"
        aria-label="Link URL"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://your-domain.atlassian.net/browse/PROJ-123"
        autoFocus
        className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
      />

      {displayMode === 'link' && (
        <input
          type="text"
          aria-label="Link Display Text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Display text (optional)"
          className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
        />
      )}

      <div
        className="grid grid-cols-3 gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[10px]"
        role="group"
        aria-label="Jira Link Display Style"
      >
        <button
          type="button"
          aria-pressed={displayMode === 'link'}
          onClick={() => setDisplayMode('link')}
          className={`py-1 rounded font-medium ${
            displayMode === 'link'
              ? 'bg-sky-600 text-white'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          URL / Text
        </button>
        <button
          type="button"
          aria-pressed={displayMode === 'inlineCard'}
          onClick={() => setDisplayMode('inlineCard')}
          className={`py-1 rounded font-medium ${
            displayMode === 'inlineCard'
              ? 'bg-sky-600 text-white'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Inline Card
        </button>
        <button
          type="button"
          aria-pressed={displayMode === 'blockCard'}
          onClick={() => setDisplayMode('blockCard')}
          className={`py-1 rounded font-medium ${
            displayMode === 'blockCard'
              ? 'bg-sky-600 text-white'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Block Card
        </button>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          className="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-semibold"
        >
          Insert
        </button>
      </div>
    </form>
  );
};

interface ColorPickerPopoverProps {
  onSelectTextColor: (hex: string) => void;
  onSelectHighlightColor: (hex: string) => void;
  onClose: () => void;
}

export const ColorPickerPopover: React.FC<ColorPickerPopoverProps> = ({
  onSelectTextColor,
  onSelectHighlightColor,
  onClose,
}) => {
  return (
    <div
      data-testid="jira-color-popover"
      role="dialog"
      aria-label="Jira Text and Highlight Colors"
      className="p-2.5 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl flex flex-col gap-2 w-full max-w-[15rem] z-30"
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-300">
          Text Color
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close color picker"
          className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-white rounded"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-8 gap-1">
        {JIRA_TEXT_COLORS.map((c) => (
          <button
            key={c.label}
            type="button"
            title={`Text: ${c.label}`}
            aria-label={`Text color ${c.label}`}
            onClick={() => {
              onSelectTextColor(c.value);
              onClose();
            }}
            className={`w-5 h-5 rounded border border-slate-600 hover:scale-110 transition ${c.swatchClass}`}
          />
        ))}
      </div>

      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-300 pt-1">
        Highlight Background
      </span>
      <div className="grid grid-cols-6 gap-1">
        {JIRA_HIGHLIGHT_COLORS.map((c) => (
          <button
            key={c.label}
            type="button"
            title={`Highlight: ${c.label}`}
            aria-label={`Highlight ${c.label}`}
            onClick={() => {
              onSelectHighlightColor(c.value);
              onClose();
            }}
            className={`w-6 h-5 rounded border border-slate-600 hover:scale-110 transition ${c.swatchClass}`}
          />
        ))}
      </div>
    </div>
  );
};

interface EmojiPickerPopoverProps {
  onSelectEmoji: (emoji: { shortName: string; text: string }) => void;
  onClose: () => void;
}

export const EmojiPickerPopover: React.FC<EmojiPickerPopoverProps> = ({
  onSelectEmoji,
  onClose,
}) => {
  return (
    <div
      data-testid="jira-emoji-popover"
      role="dialog"
      aria-label="Insert Jira Emoji"
      className="p-2 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl w-full max-w-[15rem] z-30"
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-300">
          Jira Emoji
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close emoji picker"
          className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-white rounded"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-6 gap-1">
        {JIRA_EMOJIS.map((em) => (
          <button
            key={em.shortName}
            type="button"
            title={`${em.label} (${em.shortName})`}
            aria-label={`Insert emoji ${em.label}`}
            onClick={() => {
              onSelectEmoji(em);
              onClose();
            }}
            className="w-7 h-7 rounded-lg hover:bg-slate-800 flex items-center justify-center text-sm transition"
          >
            {em.text}
          </button>
        ))}
      </div>
    </div>
  );
};
