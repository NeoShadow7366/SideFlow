import React, {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from 'react';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  Subscript,
  Superscript,
  Eraser,
  Palette,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Indent,
  Outdent,
  List,
  ListOrdered,
  CheckSquare,
  GitCommit,
  Link2,
  AtSign,
  Smile,
  Tag,
  Table,
  Code2,
  Info,
  Plus,
  ChevronDown,
  ChevronRight,
  FileText,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Trash2,
  Copy,
  GitBranch,
  ExternalLink,
  MoreHorizontal,
  Hash,
  X,
} from 'lucide-react';
import {
  AdfBlockMark,
  AdfBlockNode,
  AdfDocNode,
  AdfInlineNode,
  AdfMark,
  AdfPanelType,
  AdfStatusColor,
  FlowchartState,
  NotifyFn,
} from '../../types/sideflow';
import {
  appendTextToAdfDoc,
  clearInlineMarksInRange,
  createAdfLocalId,
  createDefaultAdfLayout,
  createDefaultAdfTable,
  formatEpochIsoDate,
  getActiveMarksAtRange,
  getInlineNodesLength,
  insertInlineNodeAtOffset,
  isLightHexColor,
  isSafeAdfUrl,
  JIRA_CODE_LANGUAGES,
  JIRA_TABLE_CELL_COLORS,
  normalizeInlineNodes,
  replaceInlineRange,
  splitInlineNodesAtOffset,
  toggleInlineMarkInRange,
} from '../../utils/adf';
import {
  adfInlineToEditorHtml,
  getInlineSelectionOffsets,
  parseClipboardToAdfInline,
  parseEditorDomToAdfInline,
  setInlineSelectionOffsets,
} from '../../utils/adfDom';
import {
  computeDagLayout,
  generateStandaloneSVG,
  parseMermaidCode,
} from '../../utils/mermaid';
import {
  ColorPickerPopover,
  EmojiPickerPopover,
  filterSlashCommands,
  JIRA_SLASH_COMMANDS,
  JiraSlashCommandDef,
  JiraSlashCommandId,
  JiraSlashMenu,
  LinkEditorPopover,
  StatusEditorPopover,
} from './JiraSlashMenu';

export interface JiraAdfEditorHandle {
  insertSnippetAtCursor: (
    snippet: string,
    options?: { padSpace?: boolean }
  ) => void;
}

export interface JiraAdfEditorProps {
  doc: AdfDocNode;
  onChangeDoc: (nextDoc: AdfDocNode) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onNotify: NotifyFn;
  onOpenMermaidInFlow?: (flowState: FlowchartState) => void;
}

interface InlineBlockRegistration {
  getInline: () => AdfInlineNode[];
  setInline: (next: AdfInlineNode[]) => void;
  focusAt: (start: number, end?: number) => void;
  getSelection: () => { start: number; end: number };
  topLevelIndex: number;
}

interface ActiveInlineWidgetEdit {
  targetId: string;
  inlineIndex: number;
  kind: 'status' | 'mention' | 'date' | 'inlineCard';
}

const PANEL_STYLES: Record<
  AdfPanelType,
  {
    label: string;
    containerClass: string;
    iconClass: string;
    renderIcon: () => React.ReactNode;
  }
> = {
  info: {
    label: 'Info',
    containerClass: 'bg-sky-950/45 border-sky-500/45 text-sky-100',
    iconClass: 'text-sky-400',
    renderIcon: () => <Info className="w-4 h-4 text-sky-400 shrink-0" />,
  },
  note: {
    label: 'Note',
    containerClass: 'bg-purple-950/45 border-purple-500/45 text-purple-100',
    iconClass: 'text-purple-400',
    renderIcon: () => <FileText className="w-4 h-4 text-purple-400 shrink-0" />,
  },
  success: {
    label: 'Success',
    containerClass: 'bg-emerald-950/45 border-emerald-500/45 text-emerald-100',
    iconClass: 'text-emerald-400',
    renderIcon: () => (
      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
    ),
  },
  warning: {
    label: 'Warning',
    containerClass: 'bg-amber-950/45 border-amber-500/45 text-amber-100',
    iconClass: 'text-amber-400',
    renderIcon: () => (
      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
    ),
  },
  error: {
    label: 'Error',
    containerClass: 'bg-rose-950/45 border-rose-500/45 text-rose-100',
    iconClass: 'text-rose-400',
    renderIcon: () => (
      <AlertOctagon className="w-4 h-4 text-rose-400 shrink-0" />
    ),
  },
  custom: {
    label: 'Custom',
    containerClass: 'bg-slate-900/75 border-indigo-500/40 text-slate-100',
    iconClass: 'text-indigo-400',
    renderIcon: () => <Info className="w-4 h-4 text-indigo-400 shrink-0" />,
  },
};

function getPlainPrefixBeforeOffset(
  nodes: AdfInlineNode[],
  offset: number
): string {
  let rem = offset;
  let acc = '';
  for (const n of nodes) {
    if (rem <= 0) break;
    if (n.type === 'text') {
      const slice = n.text.slice(0, rem);
      acc += slice;
      rem -= slice.length;
    } else {
      acc += ' ';
      rem -= 1;
    }
  }
  return acc;
}

interface RichInlineEditableProps {
  targetId: string;
  topLevelIndex: number;
  inlineNodes?: AdfInlineNode[];
  placeholder?: string;
  ariaLabel: string;
  testId?: string;
  className?: string;
  allowAutoFormat?: boolean;
  onChangeInline: (next: AdfInlineNode[]) => void;
  onFocusTarget: (targetId: string, topLevelIndex: number) => void;
  onSelectionUpdate: (
    targetId: string,
    sel: { start: number; end: number }
  ) => void;
  onRegister: (targetId: string, reg: InlineBlockRegistration | null) => void;
  onAutoFormatTrigger?: (
    kind:
      | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; rest: AdfInlineNode[] }
      | { type: 'bulletList'; rest: AdfInlineNode[] }
      | { type: 'orderedList'; order: number; rest: AdfInlineNode[] }
      | { type: 'taskList'; state: 'TODO' | 'DONE'; rest: AdfInlineNode[] }
      | { type: 'decisionList'; rest: AdfInlineNode[] }
      | { type: 'blockquote'; rest: AdfInlineNode[] }
      | { type: 'rule' }
      | { type: 'codeBlock'; language?: string }
  ) => void;
  onEnterSplit?: (before: AdfInlineNode[], after: AdfInlineNode[]) => void;
  onBackspaceAtStart?: () => void;
  onSlashTriggerChange: (
    payload: {
      targetId: string;
      query: string;
      slashStart: number;
      slashEnd: number;
    } | null
  ) => void;
  slashMenuOpenForThisTarget: boolean;
  onSlashKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => boolean;
  onClickInlineWidget: (edit: ActiveInlineWidgetEdit) => void;
  onUndo?: () => void;
  onRedo?: () => void;
}

const RichInlineEditable: React.FC<RichInlineEditableProps> = ({
  targetId,
  topLevelIndex,
  inlineNodes,
  placeholder,
  ariaLabel,
  testId,
  className = '',
  allowAutoFormat = false,
  onChangeInline,
  onFocusTarget,
  onSelectionUpdate,
  onRegister,
  onAutoFormatTrigger,
  onEnterSplit,
  onBackspaceAtStart,
  onSlashTriggerChange,
  slashMenuOpenForThisTarget,
  onSlashKeyDown,
  onClickInlineWidget,
  onUndo,
  onRedo,
}) => {
  const elRef = useRef<HTMLDivElement | null>(null);
  const latestNodesRef = useRef<AdfInlineNode[]>(inlineNodes || []);
  latestNodesRef.current = inlineNodes || [];
  const latestSetRef = useRef(onChangeInline);
  latestSetRef.current = onChangeInline;

  const lastSelectionRef = useRef<{ start: number; end: number }>({
    start: getInlineNodesLength(inlineNodes),
    end: getInlineNodesLength(inlineNodes),
  });
  const pendingFocusRef = useRef<{ start: number; end: number } | null>(null);
  const suppressDomSyncOnceRef = useRef(false);

  const renderedHtml = adfInlineToEditorHtml(inlineNodes);
  const isEmpty = getInlineNodesLength(inlineNodes) === 0;

  useLayoutEffect(() => {
    const el = elRef.current;
    if (!el) return;
    if (suppressDomSyncOnceRef.current) {
      suppressDomSyncOnceRef.current = false;
      // Keep `data-adf-inline-index` synchronized on atomic chips when user types before them
      const chipEls = Array.from(
        el.querySelectorAll<HTMLElement>('[data-adf-inline-type]')
      );
      const chipIndices: number[] = [];
      latestNodesRef.current.forEach((n, idx) => {
        if (n.type !== 'text' && n.type !== 'hardBreak') {
          chipIndices.push(idx);
        }
      });
      if (chipEls.length === chipIndices.length) {
        chipEls.forEach((chipEl, i) => {
          chipEl.setAttribute('data-adf-inline-index', String(chipIndices[i]));
        });
      }
    } else if (el.innerHTML !== renderedHtml) {
      el.innerHTML = renderedHtml;
    }
    if (pendingFocusRef.current) {
      const { start, end } = pendingFocusRef.current;
      pendingFocusRef.current = null;
      el.focus();
      setInlineSelectionOffsets(el, start, end);
      lastSelectionRef.current = { start, end };
      onSelectionUpdate(targetId, { start, end });
    }
  }, [renderedHtml, targetId, onSelectionUpdate]);

  useEffect(() => {
    onRegister(targetId, {
      getInline: () => latestNodesRef.current,
      setInline: (next) => latestSetRef.current(next),
      focusAt: (start, end = start) => {
        pendingFocusRef.current = { start, end };
        const el = elRef.current;
        if (el) {
          el.innerHTML = adfInlineToEditorHtml(latestNodesRef.current);
          el.focus();
          setInlineSelectionOffsets(el, start, end);
          lastSelectionRef.current = { start, end };
          onSelectionUpdate(targetId, { start, end });
          pendingFocusRef.current = null;
        }
      },
      getSelection: () => {
        const el = elRef.current;
        if (el) {
          const live = getInlineSelectionOffsets(el);
          if (live) {
            lastSelectionRef.current = live;
            return live;
          }
        }
        return lastSelectionRef.current;
      },
      topLevelIndex,
    });
    return () => onRegister(targetId, null);
  }, [targetId, topLevelIndex, onRegister, onSelectionUpdate]);

  const syncSelection = () => {
    const el = elRef.current;
    if (!el) return;
    const live = getInlineSelectionOffsets(el);
    if (live) {
      lastSelectionRef.current = live;
      onSelectionUpdate(targetId, live);
    }
  };

  const handleInput = () => {
    const el = elRef.current;
    if (!el) return;
    const parsed = parseEditorDomToAdfInline(el);
    const liveSel = getInlineSelectionOffsets(el);
    const caret = liveSel ? liveSel.end : getInlineNodesLength(parsed);
    lastSelectionRef.current = liveSel || { start: caret, end: caret };
    onSelectionUpdate(targetId, lastSelectionRef.current);

    // Check Jira live auto-formatting triggers when typing at start of a paragraph
    if (
      allowAutoFormat &&
      onAutoFormatTrigger &&
      parsed.length > 0 &&
      parsed[0].type === 'text'
    ) {
      const firstText = parsed[0].text;
      const headingMatch = firstText.match(/^(#{1,6})\s(.*)$/);
      if (headingMatch) {
        const lvl = headingMatch[1].length as 1 | 2 | 3 | 4 | 5 | 6;
        const { after } = splitInlineNodesAtOffset(
          parsed,
          headingMatch[1].length + 1
        );
        onSlashTriggerChange(null);
        onAutoFormatTrigger({ type: 'heading', level: lvl, rest: after });
        return;
      }
      if (/^[-*]\s/.test(firstText)) {
        const { after } = splitInlineNodesAtOffset(parsed, 2);
        onSlashTriggerChange(null);
        onAutoFormatTrigger({ type: 'bulletList', rest: after });
        return;
      }
      const olMatch = firstText.match(/^(\d+)\.\s/);
      if (olMatch) {
        const { after } = splitInlineNodesAtOffset(
          parsed,
          olMatch[0].length
        );
        onSlashTriggerChange(null);
        onAutoFormatTrigger({
          type: 'orderedList',
          order: Number(olMatch[1]) || 1,
          rest: after,
        });
        return;
      }
      const taskMatch = firstText.match(/^\[(\s|x|X)?\]\s/);
      if (taskMatch) {
        const { after } = splitInlineNodesAtOffset(
          parsed,
          taskMatch[0].length
        );
        onSlashTriggerChange(null);
        onAutoFormatTrigger({
          type: 'taskList',
          state:
            (taskMatch[1] || '').toLowerCase() === 'x' ? 'DONE' : 'TODO',
          rest: after,
        });
        return;
      }
      if (/^<>\s/.test(firstText)) {
        const { after } = splitInlineNodesAtOffset(parsed, 3);
        onSlashTriggerChange(null);
        onAutoFormatTrigger({ type: 'decisionList', rest: after });
        return;
      }
      if (/^>\s/.test(firstText)) {
        const { after } = splitInlineNodesAtOffset(parsed, 2);
        onSlashTriggerChange(null);
        onAutoFormatTrigger({ type: 'blockquote', rest: after });
        return;
      }
      if (firstText === '---' && parsed.length === 1) {
        onSlashTriggerChange(null);
        onAutoFormatTrigger({ type: 'rule' });
        return;
      }
      const fenceMatch = firstText.match(/^```([a-zA-Z0-9_-]*)\s$/);
      if (fenceMatch && parsed.length === 1) {
        onSlashTriggerChange(null);
        onAutoFormatTrigger({
          type: 'codeBlock',
          language: fenceMatch[1] || undefined,
        });
        return;
      }
    }

    // Check Slash ("/") command trigger
    const prefix = getPlainPrefixBeforeOffset(parsed, caret);
    const slashMatch = prefix.match(/(?:^|\s)\/([a-zA-Z0-9_-]{0,20})$/);
    if (slashMatch) {
      const query = slashMatch[1];
      const slashEnd = caret;
      const slashStart = caret - (query.length + 1);
      onSlashTriggerChange({
        targetId,
        query,
        slashStart,
        slashEnd,
      });
    } else {
      onSlashTriggerChange(null);
    }

    suppressDomSyncOnceRef.current = true;
    onChangeInline(parsed);
  };

  const applyInlineShortcutMark = (mark: AdfMark) => {
    const el = elRef.current;
    const sel =
      (el && getInlineSelectionOffsets(el)) || lastSelectionRef.current;
    const { content, nextStart, nextEnd } = toggleInlineMarkInRange(
      latestNodesRef.current,
      sel.start,
      sel.end,
      mark
    );
    pendingFocusRef.current = { start: nextStart, end: nextEnd };
    onChangeInline(content);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const htmlData = e.clipboardData?.getData('text/html') || '';
    const plainText = e.clipboardData?.getData('text/plain') || '';
    const pastedNodes = parseClipboardToAdfInline(htmlData, plainText);
    if (pastedNodes.length === 0) return;

    const el = elRef.current;
    const sel =
      (el && getInlineSelectionOffsets(el)) || lastSelectionRef.current;
    const { content, nextOffset } = replaceInlineRange(
      latestNodesRef.current,
      sel.start,
      sel.end,
      pastedNodes
    );
    onSlashTriggerChange(null);
    pendingFocusRef.current = { start: nextOffset, end: nextOffset };
    onChangeInline(content);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const rawTarget = e.target as HTMLElement | null;
    const focusedChip = rawTarget?.closest?.('[data-adf-inline-type]') as
      | HTMLElement
      | null;
    if (focusedChip && (e.key === 'Enter' || e.key === ' ')) {
      const kind = focusedChip.getAttribute('data-adf-inline-type');
      const idx = Number(focusedChip.getAttribute('data-adf-inline-index'));
      if (
        Number.isInteger(idx) &&
        (kind === 'status' ||
          kind === 'mention' ||
          kind === 'date' ||
          kind === 'inlineCard')
      ) {
        e.preventDefault();
        e.stopPropagation();
        onClickInlineWidget({ targetId, inlineIndex: idx, kind });
        return;
      }
    }

    if (slashMenuOpenForThisTarget && onSlashKeyDown(e)) {
      return;
    }

    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          onRedo?.();
        } else {
          onUndo?.();
        }
        return;
      }
      if (k === 'y') {
        e.preventDefault();
        onRedo?.();
        return;
      }
      if (k === 'b' && !e.shiftKey) {
        e.preventDefault();
        applyInlineShortcutMark({ type: 'strong' });
        return;
      }
      if (k === 'i' && !e.shiftKey) {
        e.preventDefault();
        applyInlineShortcutMark({ type: 'em' });
        return;
      }
      if (k === 'u' && !e.shiftKey) {
        e.preventDefault();
        applyInlineShortcutMark({ type: 'underline' });
        return;
      }
      if (k === 's' && e.shiftKey) {
        e.preventDefault();
        applyInlineShortcutMark({ type: 'strike' });
        return;
      }
      if (k === 'm' && e.shiftKey) {
        e.preventDefault();
        applyInlineShortcutMark({ type: 'code' });
        return;
      }
    }

    if (e.key === 'Enter') {
      const el = elRef.current;
      const sel =
        (el && getInlineSelectionOffsets(el)) || lastSelectionRef.current;
      if (e.shiftKey) {
        e.preventDefault();
        const { content, nextOffset } = replaceInlineRange(
          latestNodesRef.current,
          sel.start,
          sel.end,
          [{ type: 'hardBreak' }]
        );
        pendingFocusRef.current = { start: nextOffset, end: nextOffset };
        onChangeInline(content);
        return;
      }
      if (onEnterSplit) {
        e.preventDefault();
        onSlashTriggerChange(null);
        const strippedSelection =
          sel.end > sel.start
            ? replaceInlineRange(
                latestNodesRef.current,
                sel.start,
                sel.end,
                []
              ).content
            : latestNodesRef.current;
        const { before, after } = splitInlineNodesAtOffset(
          strippedSelection,
          sel.start
        );
        onEnterSplit(before, after);
        return;
      }
    }

    if (e.key === 'Backspace' && onBackspaceAtStart) {
      const el = elRef.current;
      const sel =
        (el && getInlineSelectionOffsets(el)) || lastSelectionRef.current;
      if (sel.start === 0 && sel.end === 0) {
        e.preventDefault();
        onSlashTriggerChange(null);
        onBackspaceAtStart();
      }
    }
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    const widgetEl = target?.closest('[data-adf-inline-type]') as
      | HTMLElement
      | null;
    if (widgetEl) {
      const kind = widgetEl.getAttribute('data-adf-inline-type');
      const idx = Number(widgetEl.getAttribute('data-adf-inline-index'));
      if (
        Number.isInteger(idx) &&
        (kind === 'status' ||
          kind === 'mention' ||
          kind === 'date' ||
          kind === 'inlineCard')
      ) {
        e.preventDefault();
        e.stopPropagation();
        onClickInlineWidget({ targetId, inlineIndex: idx, kind });
        return;
      }
    }
    syncSelection();
  };

  return (
    <div className="relative min-w-0 flex-1">
      {isEmpty && placeholder && (
        <span
          aria-hidden="true"
          className="pointer-events-none select-none absolute inset-x-0 top-0 text-slate-400 truncate"
        >
          {placeholder}
        </span>
      )}
      <div
        ref={elRef}
        role="textbox"
        aria-multiline="false"
        aria-label={ariaLabel}
        aria-controls={
          slashMenuOpenForThisTarget ? 'jira-slash-menu-listbox' : undefined
        }
        data-testid={testId}
        contentEditable
        suppressContentEditableWarning
        onFocus={() => {
          onFocusTarget(targetId, topLevelIndex);
          syncSelection();
        }}
        onInput={handleInput}
        onPaste={handlePaste}
        onKeyUp={syncSelection}
        onMouseUp={syncSelection}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className={`min-h-[1.5em] outline-none select-text whitespace-pre-wrap break-words ${className}`}
      />
    </div>
  );
};

export const JiraAdfEditor = forwardRef<
  JiraAdfEditorHandle,
  JiraAdfEditorProps
>(function JiraAdfEditor(
  {
    doc,
    onChangeDoc,
    onUndo,
    onRedo,
    onNotify,
    onOpenMermaidInFlow,
  },
  ref
) {
  const registryRef = useRef<Map<string, InlineBlockRegistration>>(new Map());
  const [activeTargetId, setActiveTargetId] = useState<string>('b-0');
  const [activeTopLevelIndex, setActiveTopLevelIndex] = useState<number>(0);
  const [activeSelection, setActiveSelection] = useState<{
    start: number;
    end: number;
  }>({ start: 0, end: 0 });

  // Toolbar dropdown & popover states
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const [openMenu, setOpenMenu] = useState<
    null | 'more' | 'color' | 'insert' | 'link' | 'emoji' | 'status-new'
  >(null);
  const [linkInitialMode, setLinkInitialMode] = useState<'link' | 'inlineCard'>(
    'link'
  );

  // Slash ("/") Quick Insert Menu state
  const [slashState, setSlashState] = useState<{
    targetId: string;
    query: string;
    slashStart: number;
    slashEnd: number;
    highlightIdx: number;
  } | null>(null);

  // Inline widget click-to-edit state (status, mention, date, inlineCard)
  const [editingWidget, setEditingWidget] =
    useState<ActiveInlineWidgetEdit | null>(null);
  const [mentionDraft, setMentionDraft] = useState<string>('');
  const [dateDraft, setDateDraft] = useState<string>('');

  // Dismiss open toolbar dropdowns/popovers on Escape or outside pointer down
  useEffect(() => {
    if (!openMenu && !editingWidget) return;
    const onKeyDownWindow = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        setOpenMenu(null);
        setEditingWidget(null);
      }
    };
    const onPointerDownWindow = (ev: MouseEvent) => {
      if (
        openMenu &&
        toolbarRef.current &&
        !toolbarRef.current.contains(ev.target as Node)
      ) {
        setOpenMenu(null);
      }
    };
    window.addEventListener('keydown', onKeyDownWindow);
    window.addEventListener('mousedown', onPointerDownWindow);
    return () => {
      window.removeEventListener('keydown', onKeyDownWindow);
      window.removeEventListener('mousedown', onPointerDownWindow);
    };
  }, [openMenu, editingWidget]);

  // Collapsible expand open/closed map (default open in editor so users can edit immediately)
  const [collapsedExpands, setCollapsedExpands] = useState<
    Record<string, boolean>
  >({});

  // Pending focus target after structural block add/split
  const nextFocusTargetRef = useRef<{
    targetId: string;
    offset: number;
  } | null>(null);

  useEffect(() => {
    if (!nextFocusTargetRef.current) return;
    const { targetId, offset } = nextFocusTargetRef.current;
    const reg = registryRef.current.get(targetId);
    if (reg) {
      nextFocusTargetRef.current = null;
      reg.focusAt(offset, offset);
      setActiveTargetId(targetId);
    }
  });

  const handleRegisterBlock = useCallback(
    (targetId: string, reg: InlineBlockRegistration | null) => {
      if (reg) {
        registryRef.current.set(targetId, reg);
      } else {
        registryRef.current.delete(targetId);
      }
    },
    []
  );

  const handleFocusTarget = useCallback(
    (targetId: string, topIdx: number) => {
      setActiveTargetId(targetId);
      setActiveTopLevelIndex(topIdx);
    },
    []
  );

  const handleSelectionUpdate = useCallback(
    (targetId: string, sel: { start: number; end: number }) => {
      if (targetId === activeTargetId) {
        setActiveSelection(sel);
      }
    },
    [activeTargetId]
  );

  useImperativeHandle(
    ref,
    () => ({
      insertSnippetAtCursor: (snippet: string, options?: { padSpace?: boolean }) => {
        if (!snippet) return;
        const reg = registryRef.current.get(activeTargetId);
        if (reg) {
          const current = reg.getInline();
          const sel = reg.getSelection();
          const beforeText = getPlainPrefixBeforeOffset(current, sel.end);
          const needsLeadingSpace =
            options?.padSpace &&
            beforeText.length > 0 &&
            !beforeText.endsWith(' ') &&
            !beforeText.endsWith('\n') &&
            !snippet.startsWith(' ');
          const textToInsert = `${needsLeadingSpace ? ' ' : ''}${snippet}`;
          const { content, nextOffset } = insertInlineNodeAtOffset(
            current,
            sel.end,
            { type: 'text', text: textToInsert }
          );
          reg.setInline(content);
          requestAnimationFrame(() => {
            registryRef.current.get(activeTargetId)?.focusAt(nextOffset, nextOffset);
          });
          return;
        }
        onChangeDoc(appendTextToAdfDoc(doc, snippet, options));
      },
    }),
    [activeTargetId, doc, onChangeDoc]
  );

  const safeTopIdx = Math.min(
    Math.max(0, activeTopLevelIndex),
    Math.max(0, doc.content.length - 1)
  );
  const currentTopBlock = doc.content[safeTopIdx];

  const activeReg = registryRef.current.get(activeTargetId);
  const activeInlineNodes = activeReg ? activeReg.getInline() : [];
  const activeMarks = getActiveMarksAtRange(
    activeInlineNodes,
    activeSelection.start,
    activeSelection.end
  );

  const hasActiveMark = (type: AdfMark['type'], subType?: 'sub' | 'sup') =>
    activeMarks.some((m) =>
      subType && m.type === 'subsup'
        ? m.attrs.type === subType
        : m.type === type
    );

  const applyMarkToActiveTarget = (mark: AdfMark) => {
    setOpenMenu(null);
    let reg = registryRef.current.get(activeTargetId);
    if (!reg) {
      const firstKey = Array.from(registryRef.current.keys())[0];
      if (firstKey) {
        reg = registryRef.current.get(firstKey);
        setActiveTargetId(firstKey);
      }
    }
    if (!reg) return;
    const sel = reg.getSelection();
    const { content, nextStart, nextEnd } = toggleInlineMarkInRange(
      reg.getInline(),
      sel.start,
      sel.end,
      mark
    );
    reg.setInline(content);
    requestAnimationFrame(() => {
      reg?.focusAt(nextStart, nextEnd);
    });
  };

  const handleClearFormatting = () => {
    setOpenMenu(null);
    const reg = registryRef.current.get(activeTargetId);
    if (!reg) return;
    const sel = reg.getSelection();
    const cleared = clearInlineMarksInRange(reg.getInline(), sel.start, sel.end);
    reg.setInline(cleared);
  };

  const insertInlineIntoActiveTarget = (node: AdfInlineNode) => {
    setOpenMenu(null);
    let reg = registryRef.current.get(activeTargetId);
    let targetKey = activeTargetId;
    if (!reg) {
      const firstKey = Array.from(registryRef.current.keys())[0];
      if (firstKey) {
        reg = registryRef.current.get(firstKey);
        targetKey = firstKey;
        setActiveTargetId(firstKey);
      }
    }
    if (!reg) {
      onChangeDoc({
        version: 1,
        type: 'doc',
        content: [...doc.content, { type: 'paragraph', content: [node] }],
      });
      return;
    }
    const sel = reg.getSelection();
    const { content, nextOffset } = insertInlineNodeAtOffset(
      reg.getInline(),
      sel.end,
      node
    );
    reg.setInline(content);
    requestAnimationFrame(() => {
      registryRef.current.get(targetKey)?.focusAt(nextOffset, nextOffset);
    });
  };

  const latestCommittedBlocksRef = useRef<AdfBlockNode[]>(doc.content);
  latestCommittedBlocksRef.current = doc.content;

  const commitNextBlocks = (rawBlocks: AdfBlockNode[]) => {
    const normalized =
      rawBlocks.length > 0 ? rawBlocks : [{ type: 'paragraph' as const, content: [] }];
    latestCommittedBlocksRef.current = normalized;
    onChangeDoc({ version: 1, type: 'doc', content: normalized });
  };

  const updateBlockAtTopIndex = (
    idx: number,
    replacement: AdfBlockNode | AdfBlockNode[]
  ) => {
    const nextBlocks = [...latestCommittedBlocksRef.current];
    const items = Array.isArray(replacement) ? replacement : [replacement];
    nextBlocks.splice(idx, 1, ...items);
    commitNextBlocks(nextBlocks);
  };

  const insertBlockAfterTopIndex = (
    idx: number,
    newBlock: AdfBlockNode,
    focusTargetId?: string
  ) => {
    const nextBlocks = [...latestCommittedBlocksRef.current];
    const insertAt = Math.min(idx + 1, nextBlocks.length);
    nextBlocks.splice(insertAt, 0, newBlock);
    if (focusTargetId) {
      nextFocusTargetRef.current = { targetId: focusTargetId, offset: 0 };
    }
    commitNextBlocks(nextBlocks);
  };

  const extractBlockInlineRows = (
    block?: AdfBlockNode
  ): AdfInlineNode[][] | null => {
    if (!block) return [[]];
    if (block.type === 'paragraph' || block.type === 'heading') {
      return [normalizeInlineNodes(block.content)];
    }
    if (block.type === 'bulletList' || block.type === 'orderedList') {
      const rows = block.content.map((li) => {
        const first = li.content[0];
        return first && first.type === 'paragraph'
          ? normalizeInlineNodes(first.content)
          : [];
      });
      return rows.length > 0 ? rows : [[]];
    }
    if (block.type === 'taskList') {
      const rows = block.content
        .filter((it) => it.type === 'taskItem')
        .map((it) =>
          it.type === 'taskItem' ? normalizeInlineNodes(it.content) : []
        );
      return rows.length > 0 ? rows : [[]];
    }
    if (block.type === 'decisionList') {
      const rows = block.content.map((d) => normalizeInlineNodes(d.content));
      return rows.length > 0 ? rows : [[]];
    }
    if (block.type === 'blockquote') {
      const rows = block.content
        .filter((b) => b.type === 'paragraph')
        .map((b) =>
          b.type === 'paragraph' ? normalizeInlineNodes(b.content) : []
        );
      return rows.length > 0 ? rows : [[]];
    }
    return null;
  };

  const handleTextStyleChange = (styleVal: string) => {
    const liveTopBlock = latestCommittedBlocksRef.current[safeTopIdx];
    const rows = extractBlockInlineRows(liveTopBlock);

    if (rows === null) {
      // Cursor is inside a container (table, panel, expand, layout): insert new styled block after container
      const nextIdx = safeTopIdx + 1;
      if (/^h[1-6]$/.test(styleVal)) {
        const level = Number(styleVal.slice(1)) as 1 | 2 | 3 | 4 | 5 | 6;
        insertBlockAfterTopIndex(
          safeTopIdx,
          { type: 'heading', attrs: { level }, content: [] },
          `b-${nextIdx}`
        );
      } else if (styleVal === 'blockquote') {
        insertBlockAfterTopIndex(
          safeTopIdx,
          { type: 'blockquote', content: [{ type: 'paragraph', content: [] }] },
          `b-${nextIdx}-quote-0`
        );
      } else {
        insertBlockAfterTopIndex(
          safeTopIdx,
          { type: 'paragraph', content: [] },
          `b-${nextIdx}`
        );
      }
      return;
    }

    const firstSeed = rows[0] || [];
    if (styleVal === 'paragraph') {
      nextFocusTargetRef.current = {
        targetId: `b-${safeTopIdx}`,
        offset: getInlineNodesLength(firstSeed),
      };
      updateBlockAtTopIndex(
        safeTopIdx,
        rows.map((r) => ({ type: 'paragraph' as const, content: r }))
      );
    } else if (/^h[1-6]$/.test(styleVal)) {
      const level = Number(styleVal.slice(1)) as 1 | 2 | 3 | 4 | 5 | 6;
      nextFocusTargetRef.current = {
        targetId: `b-${safeTopIdx}`,
        offset: getInlineNodesLength(firstSeed),
      };
      const replacement: AdfBlockNode[] = [
        { type: 'heading', attrs: { level }, content: firstSeed },
        ...rows.slice(1).map((r) => ({ type: 'paragraph' as const, content: r })),
      ];
      updateBlockAtTopIndex(safeTopIdx, replacement);
    } else if (styleVal === 'blockquote') {
      nextFocusTargetRef.current = {
        targetId: `b-${safeTopIdx}-quote-0`,
        offset: getInlineNodesLength(firstSeed),
      };
      updateBlockAtTopIndex(safeTopIdx, {
        type: 'blockquote',
        content: rows.map((r) => ({ type: 'paragraph' as const, content: r })),
      });
    }
  };

  const handleToggleListType = (
    listType: 'bulletList' | 'orderedList' | 'taskList' | 'decisionList'
  ) => {
    const liveTopBlock = latestCommittedBlocksRef.current[safeTopIdx];
    const rows = extractBlockInlineRows(liveTopBlock);

    if (rows === null) {
      // Inside a container: insert new list block after container rather than overwriting container
      const nextIdx = safeTopIdx + 1;
      if (listType === 'bulletList' || listType === 'orderedList') {
        insertBlockAfterTopIndex(
          safeTopIdx,
          {
            type: listType,
            content: [
              { type: 'listItem', content: [{ type: 'paragraph', content: [] }] },
            ],
          },
          `b-${nextIdx}-li-0`
        );
      } else if (listType === 'taskList') {
        insertBlockAfterTopIndex(
          safeTopIdx,
          {
            type: 'taskList',
            attrs: { localId: createAdfLocalId('tasklist') },
            content: [
              {
                type: 'taskItem',
                attrs: { localId: createAdfLocalId('task'), state: 'TODO' },
                content: [],
              },
            ],
          },
          `b-${nextIdx}-task-0`
        );
      } else {
        insertBlockAfterTopIndex(
          safeTopIdx,
          {
            type: 'decisionList',
            attrs: { localId: createAdfLocalId('declist') },
            content: [
              {
                type: 'decisionItem',
                attrs: { localId: createAdfLocalId('dec'), state: 'DECIDED' },
                content: [],
              },
            ],
          },
          `b-${nextIdx}-dec-0`
        );
      }
      return;
    }

    const firstSeed = rows[0] || [];
    if (liveTopBlock?.type === listType) {
      nextFocusTargetRef.current = {
        targetId: `b-${safeTopIdx}`,
        offset: getInlineNodesLength(firstSeed),
      };
      updateBlockAtTopIndex(
        safeTopIdx,
        rows.map((r) => ({ type: 'paragraph' as const, content: r }))
      );
      return;
    }

    if (listType === 'bulletList' || listType === 'orderedList') {
      nextFocusTargetRef.current = {
        targetId: `b-${safeTopIdx}-li-0`,
        offset: getInlineNodesLength(firstSeed),
      };
      updateBlockAtTopIndex(safeTopIdx, {
        type: listType,
        content: rows.map((r) => ({
          type: 'listItem' as const,
          content: [{ type: 'paragraph' as const, content: r }],
        })),
      });
    } else if (listType === 'taskList') {
      nextFocusTargetRef.current = {
        targetId: `b-${safeTopIdx}-task-0`,
        offset: getInlineNodesLength(firstSeed),
      };
      updateBlockAtTopIndex(safeTopIdx, {
        type: 'taskList',
        attrs: { localId: createAdfLocalId('tasklist') },
        content: rows.map((r) => ({
          type: 'taskItem' as const,
          attrs: { localId: createAdfLocalId('task'), state: 'TODO' as const },
          content: r,
        })),
      });
    } else if (listType === 'decisionList') {
      nextFocusTargetRef.current = {
        targetId: `b-${safeTopIdx}-dec-0`,
        offset: getInlineNodesLength(firstSeed),
      };
      updateBlockAtTopIndex(safeTopIdx, {
        type: 'decisionList',
        attrs: { localId: createAdfLocalId('declist') },
        content: rows.map((r) => ({
          type: 'decisionItem' as const,
          attrs: {
            localId: createAdfLocalId('dec'),
            state: 'DECIDED' as const,
          },
          content: r,
        })),
      });
    }
  };

  const handleBlockAlignment = (align: 'left' | 'center' | 'end') => {
    if (
      !currentTopBlock ||
      (currentTopBlock.type !== 'paragraph' &&
        currentTopBlock.type !== 'heading')
    ) {
      return;
    }
    // ADF Schema v1: `alignment` and `indentation` are mutually exclusive
    const nextMarks: AdfBlockMark[] =
      align === 'left' ? [] : [{ type: 'alignment', attrs: { align } }];
    updateBlockAtTopIndex(safeTopIdx, {
      ...currentTopBlock,
      marks: nextMarks.length > 0 ? nextMarks : undefined,
    });
  };

  const handleBlockIndent = (delta: 1 | -1) => {
    if (
      !currentTopBlock ||
      (currentTopBlock.type !== 'paragraph' &&
        currentTopBlock.type !== 'heading')
    ) {
      return;
    }
    const existingIndent = currentTopBlock.marks?.find(
      (m) => m.type === 'indentation'
    );
    const currentLevel =
      existingIndent && existingIndent.type === 'indentation'
        ? existingIndent.attrs.level
        : 0;
    const nextLevel = Math.max(0, Math.min(6, currentLevel + delta));
    // ADF Schema v1: `indentation` and `alignment` are mutually exclusive
    const nextMarks: AdfBlockMark[] =
      nextLevel === 0
        ? []
        : [
            {
              type: 'indentation',
              attrs: { level: nextLevel as 1 | 2 | 3 | 4 | 5 | 6 },
            },
          ];
    updateBlockAtTopIndex(safeTopIdx, {
      ...currentTopBlock,
      marks: nextMarks.length > 0 ? nextMarks : undefined,
    });
  };

  const executeInsertCommand = (
    cmdId: JiraSlashCommandId,
    fromSlashRange?: {
      targetId: string;
      slashStart: number;
      slashEnd: number;
    }
  ) => {
    setOpenMenu(null);
    setSlashState(null);

    // Strip the "/query" text if triggered from the Slash menu
    let cleanedInlineForTarget: AdfInlineNode[] | null = null;
    let insertOffsetAfterStrip = 0;
    if (fromSlashRange) {
      const reg = registryRef.current.get(fromSlashRange.targetId);
      if (reg) {
        const { content, nextOffset } = replaceInlineRange(
          reg.getInline(),
          fromSlashRange.slashStart,
          fromSlashRange.slashEnd,
          []
        );
        cleanedInlineForTarget = content;
        insertOffsetAfterStrip = nextOffset;
        reg.setInline(content);
      }
    }

    const liveTopAfterStrip = latestCommittedBlocksRef.current[safeTopIdx];
    const isCurrentBlockEmptyParagraph =
      liveTopAfterStrip?.type === 'paragraph' &&
      getInlineNodesLength(liveTopAfterStrip.content) === 0;

    const placeOrReplaceTopBlock = (
      newBlock: AdfBlockNode,
      focusPattern?: (placedIdx: number) => string
    ) => {
      if (isCurrentBlockEmptyParagraph) {
        if (focusPattern) {
          nextFocusTargetRef.current = {
            targetId: focusPattern(safeTopIdx),
            offset: 0,
          };
        }
        updateBlockAtTopIndex(safeTopIdx, newBlock);
      } else {
        const nextIdx = safeTopIdx + 1;
        insertBlockAfterTopIndex(
          safeTopIdx,
          newBlock,
          focusPattern ? focusPattern(nextIdx) : undefined
        );
      }
    };

    switch (cmdId) {
      case 'paragraph':
        handleTextStyleChange('paragraph');
        break;
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6':
        handleTextStyleChange(cmdId);
        break;
      case 'blockquote':
        handleTextStyleChange('blockquote');
        break;
      case 'bulletList':
      case 'orderedList':
      case 'taskList':
      case 'decisionList':
        handleToggleListType(cmdId);
        break;
      case 'panel-info':
      case 'panel-note':
      case 'panel-success':
      case 'panel-warning':
      case 'panel-error': {
        const pType = cmdId.replace('panel-', '') as AdfPanelType;
        placeOrReplaceTopBlock(
          {
            type: 'panel',
            attrs: { panelType: pType },
            content: [{ type: 'paragraph', content: [] }],
          },
          (idx) => `b-${idx}-panel-0`
        );
        break;
      }
      case 'table':
        placeOrReplaceTopBlock(
          createDefaultAdfTable(3, 3, true),
          (idx) => `b-${idx}-r1-c0-0`
        );
        break;
      case 'codeBlock':
        placeOrReplaceTopBlock({
          type: 'codeBlock',
          attrs: { language: 'typescript' },
          content: [{ type: 'text', text: '// Code snippet' }],
        });
        break;
      case 'mermaidBlock':
        placeOrReplaceTopBlock({
          type: 'codeBlock',
          attrs: { language: 'mermaid' },
          content: [
            {
              type: 'text',
              text: [
                'flowchart LR',
                '    A(["Issue Created"]) --> B{"Triaged?"}',
                '    B -->|Yes| C["In Progress"]',
              ].join('\n'),
            },
          ],
        });
        break;
      case 'expand':
        placeOrReplaceTopBlock(
          {
            type: 'expand',
            attrs: { title: 'Acceptance Criteria & Details' },
            content: [{ type: 'paragraph', content: [] }],
          },
          (idx) => `b-${idx}-expand-0`
        );
        break;
      case 'rule':
        if (isCurrentBlockEmptyParagraph) {
          nextFocusTargetRef.current = {
            targetId: `b-${safeTopIdx + 1}`,
            offset: 0,
          };
          updateBlockAtTopIndex(safeTopIdx, [
            { type: 'rule' },
            { type: 'paragraph', content: [] },
          ]);
        } else {
          const nextBlocks = [...latestCommittedBlocksRef.current];
          nextBlocks.splice(
            safeTopIdx + 1,
            0,
            { type: 'rule' },
            { type: 'paragraph', content: [] }
          );
          nextFocusTargetRef.current = {
            targetId: `b-${safeTopIdx + 2}`,
            offset: 0,
          };
          commitNextBlocks(nextBlocks);
        }
        break;
      case 'layout2':
        placeOrReplaceTopBlock(
          createDefaultAdfLayout(2),
          (idx) => `b-${idx}-col0-0`
        );
        break;
      case 'layout3':
        placeOrReplaceTopBlock(
          createDefaultAdfLayout(3),
          (idx) => `b-${idx}-col0-0`
        );
        break;
      case 'status': {
        const statusNode: AdfInlineNode = {
          type: 'status',
          attrs: {
            text: 'IN PROGRESS',
            color: 'blue',
            localId: createAdfLocalId('status'),
          },
        };
        if (fromSlashRange && cleanedInlineForTarget !== null) {
          const reg = registryRef.current.get(fromSlashRange.targetId);
          if (reg) {
            const { content, nextOffset } = insertInlineNodeAtOffset(
              cleanedInlineForTarget,
              insertOffsetAfterStrip,
              statusNode
            );
            reg.setInline(content);
            requestAnimationFrame(() =>
              reg.focusAt(nextOffset, nextOffset)
            );
            return;
          }
        }
        setOpenMenu('status-new');
        break;
      }
      case 'date': {
        const dateNode: AdfInlineNode = {
          type: 'date',
          attrs: { timestamp: String(Date.now()) },
        };
        if (fromSlashRange && cleanedInlineForTarget !== null) {
          const reg = registryRef.current.get(fromSlashRange.targetId);
          if (reg) {
            const { content, nextOffset } = insertInlineNodeAtOffset(
              cleanedInlineForTarget,
              insertOffsetAfterStrip,
              dateNode
            );
            reg.setInline(content);
            requestAnimationFrame(() =>
              reg.focusAt(nextOffset, nextOffset)
            );
            return;
          }
        }
        insertInlineIntoActiveTarget(dateNode);
        break;
      }
      case 'mention': {
        const mentionNode: AdfInlineNode = {
          type: 'mention',
          attrs: { id: 'teammate', text: '@teammate' },
        };
        if (fromSlashRange && cleanedInlineForTarget !== null) {
          const reg = registryRef.current.get(fromSlashRange.targetId);
          if (reg) {
            const { content, nextOffset } = insertInlineNodeAtOffset(
              cleanedInlineForTarget,
              insertOffsetAfterStrip,
              mentionNode
            );
            reg.setInline(content);
            requestAnimationFrame(() =>
              reg.focusAt(nextOffset, nextOffset)
            );
            return;
          }
        }
        insertInlineIntoActiveTarget(mentionNode);
        break;
      }
      case 'emoji':
        setOpenMenu('emoji');
        break;
      case 'link':
        setLinkInitialMode('link');
        setOpenMenu('link');
        break;
      case 'inlineCard':
        setLinkInitialMode('inlineCard');
        setOpenMenu('link');
        break;
      case 'image':
        placeOrReplaceTopBlock({
          type: 'mediaSingle',
          attrs: { layout: 'center' },
          content: [
            {
              type: 'media',
              attrs: {
                type: 'external',
                url: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=800&q=80',
                alt: 'Architecture Screenshot',
              },
            },
          ],
        });
        break;
    }
  };

  const handleSlashKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): boolean => {
    if (!slashState) return false;
    const matches = filterSlashCommands(slashState.query);
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setSlashState(null);
      return true;
    }
    if (matches.length === 0) return false;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSlashState((prev) =>
        prev
          ? { ...prev, highlightIdx: (prev.highlightIdx + 1) % matches.length }
          : null
      );
      return true;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSlashState((prev) =>
        prev
          ? {
              ...prev,
              highlightIdx:
                (prev.highlightIdx - 1 + matches.length) % matches.length,
            }
          : null
      );
      return true;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const chosen =
        matches[
          Math.min(Math.max(0, slashState.highlightIdx), matches.length - 1)
        ];
      if (chosen) {
        executeInsertCommand(chosen.id, {
          targetId: slashState.targetId,
          slashStart: slashState.slashStart,
          slashEnd: slashState.slashEnd,
        });
      }
      return true;
    }
    return false;
  };

  const handleOpenWidgetEditor = (edit: ActiveInlineWidgetEdit) => {
    const reg = registryRef.current.get(edit.targetId);
    const node = reg?.getInline()[edit.inlineIndex];
    if (!node) return;
    if (node.type === 'mention') {
      setMentionDraft((node.attrs.text || `@${node.attrs.id}`).replace(/^@/, ''));
    } else if (node.type === 'date') {
      setDateDraft(
        formatEpochIsoDate(node.attrs.timestamp) ??
          new Date().toISOString().slice(0, 10)
      );
    }
    setEditingWidget(edit);
  };

  const updateEditedInlineNode = (replacement: AdfInlineNode | null) => {
    if (!editingWidget) return;
    const reg = registryRef.current.get(editingWidget.targetId);
    if (!reg) {
      setEditingWidget(null);
      return;
    }
    const next = [...reg.getInline()];
    if (replacement === null) {
      next.splice(editingWidget.inlineIndex, 1);
    } else {
      next[editingWidget.inlineIndex] = replacement;
    }
    reg.setInline(normalizeInlineNodes(next));
    setEditingWidget(null);
  };

  const currentTextStyleValue =
    currentTopBlock?.type === 'heading'
      ? `h${currentTopBlock.attrs.level}`
      : currentTopBlock?.type === 'blockquote'
      ? 'blockquote'
      : 'paragraph';

  const renderNestedBlockList = (
    blocks: AdfBlockNode[],
    prefix: string,
    topIdx: number,
    onChangeBlocks: (nextBlocks: AdfBlockNode[]) => void
  ): React.ReactNode => {
    return (
      <div className="space-y-1.5">
        {blocks.map((subBlock, sIdx) => {
          const subTargetId = `${prefix}-${sIdx}`;
          if (subBlock.type === 'paragraph' || subBlock.type === 'heading') {
            const isHeading = subBlock.type === 'heading';
            const headingCls = isHeading
              ? subBlock.attrs.level === 1
                ? 'text-base font-bold text-white'
                : subBlock.attrs.level === 2
                ? 'text-sm font-bold text-white'
                : 'text-xs font-bold text-indigo-200'
              : 'text-slate-100';
            return (
              <div key={subTargetId}>
                <RichInlineEditable
                  targetId={subTargetId}
                  topLevelIndex={topIdx}
                  inlineNodes={subBlock.content}
                  placeholder="Type content or / for commands..."
                  ariaLabel={`Container block ${sIdx + 1}`}
                  className={headingCls}
                  onChangeInline={(nextInline) => {
                    const updated = [...blocks];
                    updated[sIdx] = { ...subBlock, content: nextInline };
                    onChangeBlocks(updated);
                  }}
                  onFocusTarget={handleFocusTarget}
                  onSelectionUpdate={handleSelectionUpdate}
                  onRegister={handleRegisterBlock}
                  onEnterSplit={(before, after) => {
                    const updated = [...blocks];
                    updated.splice(
                      sIdx,
                      1,
                      { ...subBlock, content: before },
                      { type: 'paragraph', content: after }
                    );
                    nextFocusTargetRef.current = {
                      targetId: `${prefix}-${sIdx + 1}`,
                      offset: 0,
                    };
                    onChangeBlocks(updated);
                  }}
                  onBackspaceAtStart={() => {
                    if (blocks.length <= 1) return;
                    const updated = [...blocks];
                    if (sIdx > 0) {
                      const prev = updated[sIdx - 1];
                      if (
                        prev.type === 'paragraph' ||
                        prev.type === 'heading'
                      ) {
                        const prevLen = getInlineNodesLength(prev.content);
                        updated[sIdx - 1] = {
                          ...prev,
                          content: normalizeInlineNodes([
                            ...(prev.content || []),
                            ...(subBlock.content || []),
                          ]),
                        };
                        updated.splice(sIdx, 1);
                        nextFocusTargetRef.current = {
                          targetId: `${prefix}-${sIdx - 1}`,
                          offset: prevLen,
                        };
                        onChangeBlocks(updated);
                      }
                    }
                  }}
                  onSlashTriggerChange={(payload) =>
                    setSlashState(
                      payload ? { ...payload, highlightIdx: 0 } : null
                    )
                  }
                  slashMenuOpenForThisTarget={
                    slashState?.targetId === subTargetId
                  }
                  onSlashKeyDown={handleSlashKeyDown}
                  onClickInlineWidget={handleOpenWidgetEditor}
                  onUndo={onUndo}
                  onRedo={onRedo}
                />
                {slashState?.targetId === subTargetId && (
                  <JiraSlashMenu
                    query={slashState.query}
                    activeIndex={slashState.highlightIdx}
                    onHighlightIndex={(i) =>
                      setSlashState((p) => (p ? { ...p, highlightIdx: i } : null))
                    }
                    onSelect={(cmd: JiraSlashCommandDef) =>
                      executeInsertCommand(cmd.id, {
                        targetId: slashState.targetId,
                        slashStart: slashState.slashStart,
                        slashEnd: slashState.slashEnd,
                      })
                    }
                    onClose={() => setSlashState(null)}
                  />
                )}
              </div>
            );
          }

          if (subBlock.type === 'bulletList' || subBlock.type === 'orderedList') {
            return (
              <div key={subTargetId} className="space-y-1 pl-2">
                {subBlock.content.map((li, liIdx) => {
                  const firstChild = li.content[0];
                  const liInline =
                    firstChild && firstChild.type === 'paragraph'
                      ? firstChild.content
                      : [];
                  const liTargetId = `${subTargetId}-li-${liIdx}`;
                  return (
                    <div key={liTargetId} className="flex items-start gap-2">
                      <span className="text-sky-400 font-bold text-xs mt-0.5 select-none">
                        {subBlock.type === 'orderedList'
                          ? `${(subBlock.attrs?.order ?? 1) + liIdx}.`
                          : '•'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <RichInlineEditable
                          targetId={liTargetId}
                          topLevelIndex={topIdx}
                          inlineNodes={liInline}
                          placeholder="List item..."
                          ariaLabel={`Nested list item ${liIdx + 1}`}
                          onChangeInline={(nextInline) => {
                            const nextItems = [...subBlock.content];
                            nextItems[liIdx] = {
                              ...li,
                              content: [
                                { type: 'paragraph', content: nextInline },
                                ...li.content.slice(1),
                              ],
                            };
                            const updated = [...blocks];
                            updated[sIdx] = { ...subBlock, content: nextItems };
                            onChangeBlocks(updated);
                          }}
                          onEnterSplit={(before, after) => {
                            const nextItems = [...subBlock.content];
                            nextItems.splice(
                              liIdx,
                              1,
                              {
                                ...li,
                                content: [
                                  { type: 'paragraph', content: before },
                                  ...li.content.slice(1),
                                ],
                              },
                              {
                                type: 'listItem',
                                content: [{ type: 'paragraph', content: after }],
                              }
                            );
                            nextFocusTargetRef.current = {
                              targetId: `${subTargetId}-li-${liIdx + 1}`,
                              offset: 0,
                            };
                            const updated = [...blocks];
                            updated[sIdx] = { ...subBlock, content: nextItems };
                            onChangeBlocks(updated);
                          }}
                          onBackspaceAtStart={() => {
                            if (subBlock.content.length <= 1) return;
                            const nextItems = subBlock.content.filter(
                              (_, i) => i !== liIdx
                            );
                            nextFocusTargetRef.current = {
                              targetId: `${subTargetId}-li-${Math.max(
                                0,
                                liIdx - 1
                              )}`,
                              offset: 0,
                            };
                            const updated = [...blocks];
                            updated[sIdx] = { ...subBlock, content: nextItems };
                            onChangeBlocks(updated);
                          }}
                          onFocusTarget={handleFocusTarget}
                          onSelectionUpdate={handleSelectionUpdate}
                          onRegister={handleRegisterBlock}
                          onSlashTriggerChange={(payload) =>
                            setSlashState(
                              payload ? { ...payload, highlightIdx: 0 } : null
                            )
                          }
                          slashMenuOpenForThisTarget={
                            slashState?.targetId === liTargetId
                          }
                          onSlashKeyDown={handleSlashKeyDown}
                          onClickInlineWidget={handleOpenWidgetEditor}
                          onUndo={onUndo}
                          onRedo={onRedo}
                        />
                        {slashState?.targetId === liTargetId && (
                          <JiraSlashMenu
                            query={slashState.query}
                            activeIndex={slashState.highlightIdx}
                            onHighlightIndex={(i) =>
                              setSlashState((p) =>
                                p ? { ...p, highlightIdx: i } : null
                              )
                            }
                            onSelect={(cmd: JiraSlashCommandDef) =>
                              executeInsertCommand(cmd.id, {
                                targetId: slashState.targetId,
                                slashStart: slashState.slashStart,
                                slashEnd: slashState.slashEnd,
                              })
                            }
                            onClose={() => setSlashState(null)}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          }

          if (subBlock.type === 'codeBlock') {
            const nestedCode = (subBlock.content || [])
              .map((t) => t.text)
              .join('');
            return (
              <textarea
                key={subTargetId}
                aria-label="Nested code snippet"
                value={nestedCode}
                onChange={(e) => {
                  const updated = [...blocks];
                  updated[sIdx] = {
                    ...subBlock,
                    content:
                      e.target.value.length > 0
                        ? [{ type: 'text', text: e.target.value }]
                        : [],
                  };
                  onChangeBlocks(updated);
                }}
                rows={Math.max(2, Math.min(8, nestedCode.split('\n').length))}
                className="w-full rounded-lg bg-slate-950/90 border border-slate-800 p-2 font-mono text-[11px] text-emerald-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60 resize-y"
              />
            );
          }

          if (subBlock.type === 'rule') {
            return <hr key={subTargetId} className="my-1.5 border-slate-700/80" />;
          }

          return null;
        })}
      </div>
    );
  };

  const renderTopLevelBlock = (block: AdfBlockNode, idx: number) => {
    const baseTargetId = `b-${idx}`;

    // Alignment & Indentation CSS helpers for paragraph & heading
    const getBlockAlignAndIndentProps = (marks?: AdfBlockMark[]) => {
      const alignMark = marks?.find((m) => m.type === 'alignment');
      const indentMark = marks?.find((m) => m.type === 'indentation');
      const alignClass =
        alignMark && alignMark.type === 'alignment'
          ? alignMark.attrs.align === 'center'
            ? 'text-center'
            : 'text-right'
          : 'text-left';
      const indentPx =
        indentMark && indentMark.type === 'indentation'
          ? indentMark.attrs.level * 20
          : 0;
      return { alignClass, indentPx };
    };

    switch (block.type) {
      case 'paragraph':
      case 'heading': {
        const isHeading = block.type === 'heading';
        const { alignClass, indentPx } = getBlockAlignAndIndentProps(
          block.marks
        );
        const headingClass = isHeading
          ? block.attrs.level === 1
            ? 'text-lg font-bold text-white pt-1.5 pb-0.5 border-b border-slate-800/80'
            : block.attrs.level === 2
            ? 'text-base font-bold text-white pt-1'
            : block.attrs.level === 3
            ? 'text-sm font-bold text-sky-200 pt-1'
            : block.attrs.level === 4
            ? 'text-xs font-bold uppercase tracking-wide text-slate-200 pt-0.5'
            : 'text-xs font-semibold text-slate-300'
          : 'text-slate-100 leading-relaxed';

        return (
          <div
            key={baseTargetId}
            data-testid={
              isHeading ? `adf-heading-h${block.attrs.level}` : 'adf-paragraph'
            }
            style={indentPx ? { paddingLeft: `${indentPx}px` } : undefined}
            className="group relative"
          >
            <RichInlineEditable
              targetId={baseTargetId}
              topLevelIndex={idx}
              inlineNodes={block.content}
              placeholder={
                isHeading
                  ? `Heading ${block.attrs.level}`
                  : idx === 0 && doc.content.length === 1
                  ? "Type '/' to insert Jira elements (panels, tables, status, action items)..."
                  : "Type '/' for commands..."
              }
              ariaLabel={
                isHeading
                  ? `Heading ${block.attrs.level} block ${idx + 1}`
                  : `Jira editor paragraph ${idx + 1}`
              }
              testId={idx === 0 ? 'jira-adf-primary-block' : undefined}
              allowAutoFormat={!isHeading}
              className={`${headingClass} ${alignClass}`}
              onChangeInline={(nextInline) => {
                updateBlockAtTopIndex(idx, { ...block, content: nextInline });
              }}
              onFocusTarget={handleFocusTarget}
              onSelectionUpdate={handleSelectionUpdate}
              onRegister={handleRegisterBlock}
              onAutoFormatTrigger={(trigger) => {
                if (trigger.type === 'heading') {
                  nextFocusTargetRef.current = {
                    targetId: baseTargetId,
                    offset: 0,
                  };
                  updateBlockAtTopIndex(idx, {
                    type: 'heading',
                    attrs: { level: trigger.level },
                    content: trigger.rest,
                  });
                } else if (trigger.type === 'bulletList') {
                  nextFocusTargetRef.current = {
                    targetId: `${baseTargetId}-li-0`,
                    offset: 0,
                  };
                  updateBlockAtTopIndex(idx, {
                    type: 'bulletList',
                    content: [
                      {
                        type: 'listItem',
                        content: [{ type: 'paragraph', content: trigger.rest }],
                      },
                    ],
                  });
                } else if (trigger.type === 'orderedList') {
                  nextFocusTargetRef.current = {
                    targetId: `${baseTargetId}-li-0`,
                    offset: 0,
                  };
                  updateBlockAtTopIndex(idx, {
                    type: 'orderedList',
                    attrs:
                      trigger.order !== 1 ? { order: trigger.order } : undefined,
                    content: [
                      {
                        type: 'listItem',
                        content: [{ type: 'paragraph', content: trigger.rest }],
                      },
                    ],
                  });
                } else if (trigger.type === 'taskList') {
                  nextFocusTargetRef.current = {
                    targetId: `${baseTargetId}-task-0`,
                    offset: 0,
                  };
                  updateBlockAtTopIndex(idx, {
                    type: 'taskList',
                    attrs: { localId: createAdfLocalId('tasklist') },
                    content: [
                      {
                        type: 'taskItem',
                        attrs: {
                          localId: createAdfLocalId('task'),
                          state: trigger.state,
                        },
                        content: trigger.rest,
                      },
                    ],
                  });
                } else if (trigger.type === 'decisionList') {
                  nextFocusTargetRef.current = {
                    targetId: `${baseTargetId}-dec-0`,
                    offset: 0,
                  };
                  updateBlockAtTopIndex(idx, {
                    type: 'decisionList',
                    attrs: { localId: createAdfLocalId('declist') },
                    content: [
                      {
                        type: 'decisionItem',
                        attrs: {
                          localId: createAdfLocalId('dec'),
                          state: 'DECIDED',
                        },
                        content: trigger.rest,
                      },
                    ],
                  });
                } else if (trigger.type === 'blockquote') {
                  nextFocusTargetRef.current = {
                    targetId: `${baseTargetId}-quote-0`,
                    offset: 0,
                  };
                  updateBlockAtTopIndex(idx, {
                    type: 'blockquote',
                    content: [{ type: 'paragraph', content: trigger.rest }],
                  });
                } else if (trigger.type === 'rule') {
                  nextFocusTargetRef.current = {
                    targetId: `b-${idx + 1}`,
                    offset: 0,
                  };
                  updateBlockAtTopIndex(idx, [
                    { type: 'rule' },
                    { type: 'paragraph', content: [] },
                  ]);
                } else if (trigger.type === 'codeBlock') {
                  updateBlockAtTopIndex(idx, {
                    type: 'codeBlock',
                    attrs: trigger.language
                      ? { language: trigger.language }
                      : undefined,
                    content: [],
                  });
                }
              }}
              onEnterSplit={(before, after) => {
                nextFocusTargetRef.current = {
                  targetId: `b-${idx + 1}`,
                  offset: 0,
                };
                updateBlockAtTopIndex(idx, [
                  { ...block, content: before },
                  { type: 'paragraph', content: after },
                ]);
              }}
              onBackspaceAtStart={() => {
                if (isHeading) {
                  nextFocusTargetRef.current = {
                    targetId: baseTargetId,
                    offset: 0,
                  };
                  updateBlockAtTopIndex(idx, {
                    type: 'paragraph',
                    content: block.content,
                  });
                  return;
                }
                if (idx === 0) return;
                const prev = doc.content[idx - 1];
                if (prev.type === 'paragraph' || prev.type === 'heading') {
                  const prevLen = getInlineNodesLength(prev.content);
                  const nextBlocks = [...doc.content];
                  nextBlocks[idx - 1] = {
                    ...prev,
                    content: normalizeInlineNodes([
                      ...(prev.content || []),
                      ...(block.content || []),
                    ]),
                  };
                  nextBlocks.splice(idx, 1);
                  nextFocusTargetRef.current = {
                    targetId: `b-${idx - 1}`,
                    offset: prevLen,
                  };
                  onChangeDoc({ version: 1, type: 'doc', content: nextBlocks });
                } else if (getInlineNodesLength(block.content) === 0) {
                  const nextBlocks = [...doc.content];
                  nextBlocks.splice(idx, 1);
                  onChangeDoc({
                    version: 1,
                    type: 'doc',
                    content:
                      nextBlocks.length > 0
                        ? nextBlocks
                        : [{ type: 'paragraph', content: [] }],
                  });
                }
              }}
              onSlashTriggerChange={(payload) =>
                setSlashState(payload ? { ...payload, highlightIdx: 0 } : null)
              }
              slashMenuOpenForThisTarget={slashState?.targetId === baseTargetId}
              onSlashKeyDown={handleSlashKeyDown}
              onClickInlineWidget={handleOpenWidgetEditor}
              onUndo={onUndo}
              onRedo={onRedo}
            />

            {slashState?.targetId === baseTargetId && (
              <JiraSlashMenu
                query={slashState.query}
                activeIndex={slashState.highlightIdx}
                onHighlightIndex={(i) =>
                  setSlashState((p) => (p ? { ...p, highlightIdx: i } : null))
                }
                onSelect={(cmd) =>
                  executeInsertCommand(cmd.id, {
                    targetId: slashState.targetId,
                    slashStart: slashState.slashStart,
                    slashEnd: slashState.slashEnd,
                  })
                }
                onClose={() => setSlashState(null)}
              />
            )}
          </div>
        );
      }

      case 'bulletList':
      case 'orderedList': {
        const isOrdered = block.type === 'orderedList';
        const startOrder = isOrdered ? block.attrs?.order ?? 1 : 1;
        return (
          <div
            key={baseTargetId}
            data-testid={isOrdered ? 'adf-ordered-list' : 'adf-bullet-list'}
            className="space-y-1 pl-1"
          >
            {block.content.map((li, liIdx) => {
              const firstPara = li.content[0];
              const inlineContent =
                firstPara && firstPara.type === 'paragraph'
                  ? firstPara.content
                  : [];
              const liTargetId = `${baseTargetId}-li-${liIdx}`;
              return (
                <div key={liTargetId} className="space-y-1">
                  <div className="flex items-start gap-2">
                    <span className="text-sky-400 font-semibold text-xs mt-0.5 min-w-[16px] text-right select-none shrink-0">
                      {isOrdered ? `${startOrder + liIdx}.` : '•'}
                    </span>
                    <RichInlineEditable
                      targetId={liTargetId}
                      topLevelIndex={idx}
                      inlineNodes={inlineContent}
                      placeholder="List item"
                      ariaLabel={`${
                        isOrdered ? 'Numbered' : 'Bullet'
                      } list item ${liIdx + 1}`}
                      onChangeInline={(nextInline) => {
                        const nextItems = [...block.content];
                        nextItems[liIdx] = {
                          ...li,
                          content: [
                            { type: 'paragraph', content: nextInline },
                            ...li.content.slice(1),
                          ],
                        };
                        updateBlockAtTopIndex(idx, {
                          ...block,
                          content: nextItems,
                        });
                      }}
                      onFocusTarget={handleFocusTarget}
                      onSelectionUpdate={handleSelectionUpdate}
                      onRegister={handleRegisterBlock}
                      onEnterSplit={(before, after) => {
                        if (
                          getInlineNodesLength(before) === 0 &&
                          getInlineNodesLength(after) === 0
                        ) {
                          // Exit list on Enter inside empty item (Jira parity)
                          const remaining = block.content.filter(
                            (_, i) => i !== liIdx
                          );
                          if (remaining.length === 0) {
                            nextFocusTargetRef.current = {
                              targetId: baseTargetId,
                              offset: 0,
                            };
                            updateBlockAtTopIndex(idx, {
                              type: 'paragraph',
                              content: [],
                            });
                          } else {
                            nextFocusTargetRef.current = {
                              targetId: `b-${idx + 1}`,
                              offset: 0,
                            };
                            updateBlockAtTopIndex(idx, [
                              { ...block, content: remaining },
                              { type: 'paragraph', content: [] },
                            ]);
                          }
                          return;
                        }
                        const nextItems = [...block.content];
                        nextItems.splice(
                          liIdx,
                          1,
                          {
                            ...li,
                            content: [
                              { type: 'paragraph', content: before },
                              ...li.content.slice(1),
                            ],
                          },
                          {
                            type: 'listItem',
                            content: [{ type: 'paragraph', content: after }],
                          }
                        );
                        nextFocusTargetRef.current = {
                          targetId: `${baseTargetId}-li-${liIdx + 1}`,
                          offset: 0,
                        };
                        updateBlockAtTopIndex(idx, {
                          ...block,
                          content: nextItems,
                        });
                      }}
                      onBackspaceAtStart={() => {
                        if (block.content.length === 1) {
                          nextFocusTargetRef.current = {
                            targetId: baseTargetId,
                            offset: 0,
                          };
                          updateBlockAtTopIndex(idx, {
                            type: 'paragraph',
                            content: inlineContent,
                          });
                          return;
                        }
                        const nextItems = block.content.filter(
                          (_, i) => i !== liIdx
                        );
                        nextFocusTargetRef.current = {
                          targetId: `${baseTargetId}-li-${Math.max(0, liIdx - 1)}`,
                          offset: 0,
                        };
                        updateBlockAtTopIndex(idx, {
                          ...block,
                          content: nextItems,
                        });
                      }}
                      onSlashTriggerChange={(payload) =>
                        setSlashState(
                          payload ? { ...payload, highlightIdx: 0 } : null
                        )
                      }
                      slashMenuOpenForThisTarget={
                        slashState?.targetId === liTargetId
                      }
                      onSlashKeyDown={handleSlashKeyDown}
                      onClickInlineWidget={handleOpenWidgetEditor}
                      onUndo={onUndo}
                      onRedo={onRedo}
                    />
                  </div>
                  {slashState?.targetId === liTargetId && (
                    <div className="pl-6">
                      <JiraSlashMenu
                        query={slashState.query}
                        activeIndex={slashState.highlightIdx}
                        onHighlightIndex={(i) =>
                          setSlashState((p) =>
                            p ? { ...p, highlightIdx: i } : null
                          )
                        }
                        onSelect={(cmd: JiraSlashCommandDef) =>
                          executeInsertCommand(cmd.id, {
                            targetId: slashState.targetId,
                            slashStart: slashState.slashStart,
                            slashEnd: slashState.slashEnd,
                          })
                        }
                        onClose={() => setSlashState(null)}
                      />
                    </div>
                  )}

                  {/* Render nested sub-lists if present */}
                  {li.content.slice(1).map((nested, nIdx) =>
                    nested.type === 'bulletList' ||
                    nested.type === 'orderedList' ? (
                      <div key={nIdx} className="pl-6">
                        {renderNestedBlockList(
                          [nested],
                          `${liTargetId}-sub-${nIdx}`,
                          idx,
                          (updatedSub) => {
                            const nextItems = [...block.content];
                            const copyChildren = [...li.content];
                            copyChildren[nIdx + 1] = updatedSub[0] as
                              | typeof nested;
                            nextItems[liIdx] = { ...li, content: copyChildren };
                            updateBlockAtTopIndex(idx, {
                              ...block,
                              content: nextItems,
                            });
                          }
                        )}
                      </div>
                    ) : null
                  )}
                </div>
              );
            })}
          </div>
        );
      }

      case 'taskList': {
        return (
          <div
            key={baseTargetId}
            data-testid="adf-task-list"
            className="space-y-1 pl-0.5"
          >
            {block.content.map((item, tIdx) => {
              if (item.type !== 'taskItem') return null;
              const isDone = item.attrs.state === 'DONE';
              const taskTargetId = `${baseTargetId}-task-${tIdx}`;
              return (
                <div
                  key={item.attrs.localId || taskTargetId}
                  className="flex items-start gap-2 py-0.5"
                >
                  <input
                    type="checkbox"
                    checked={isDone}
                    aria-label={`Jira Action Item ${tIdx + 1}`}
                    onChange={() => {
                      const nextItems = [...block.content];
                      nextItems[tIdx] = {
                        ...item,
                        attrs: {
                          ...item.attrs,
                          state: isDone ? 'TODO' : 'DONE',
                        },
                      };
                      updateBlockAtTopIndex(idx, {
                        ...block,
                        content: nextItems,
                      });
                    }}
                    className="mt-1 w-3.5 h-3.5 rounded accent-sky-500 cursor-pointer shrink-0"
                  />
                  <RichInlineEditable
                    targetId={taskTargetId}
                    topLevelIndex={idx}
                    inlineNodes={item.content}
                    placeholder="Action item — assign with @ or set due date with /date..."
                    ariaLabel={`Action item text ${tIdx + 1}`}
                    className={
                      isDone ? 'line-through text-slate-400' : 'text-slate-100'
                    }
                    onChangeInline={(nextInline) => {
                      const nextItems = [...block.content];
                      nextItems[tIdx] = { ...item, content: nextInline };
                      updateBlockAtTopIndex(idx, {
                        ...block,
                        content: nextItems,
                      });
                    }}
                    onFocusTarget={handleFocusTarget}
                    onSelectionUpdate={handleSelectionUpdate}
                    onRegister={handleRegisterBlock}
                    onEnterSplit={(before, after) => {
                      if (
                        getInlineNodesLength(before) === 0 &&
                        getInlineNodesLength(after) === 0
                      ) {
                        const remaining = block.content.filter(
                          (_, i) => i !== tIdx
                        );
                        if (remaining.length === 0) {
                          nextFocusTargetRef.current = {
                            targetId: baseTargetId,
                            offset: 0,
                          };
                          updateBlockAtTopIndex(idx, {
                            type: 'paragraph',
                            content: [],
                          });
                        } else {
                          nextFocusTargetRef.current = {
                            targetId: `b-${idx + 1}`,
                            offset: 0,
                          };
                          updateBlockAtTopIndex(idx, [
                            { ...block, content: remaining },
                            { type: 'paragraph', content: [] },
                          ]);
                        }
                        return;
                      }
                      const nextItems = [...block.content];
                      nextItems.splice(
                        tIdx,
                        1,
                        { ...item, content: before },
                        {
                          type: 'taskItem',
                          attrs: {
                            localId: createAdfLocalId('task'),
                            state: 'TODO',
                          },
                          content: after,
                        }
                      );
                      nextFocusTargetRef.current = {
                        targetId: `${baseTargetId}-task-${tIdx + 1}`,
                        offset: 0,
                      };
                      updateBlockAtTopIndex(idx, {
                        ...block,
                        content: nextItems,
                      });
                    }}
                    onBackspaceAtStart={() => {
                      if (block.content.length === 1) {
                        nextFocusTargetRef.current = {
                          targetId: baseTargetId,
                          offset: 0,
                        };
                        updateBlockAtTopIndex(idx, {
                          type: 'paragraph',
                          content: item.content,
                        });
                        return;
                      }
                      const nextItems = block.content.filter(
                        (_, i) => i !== tIdx
                      );
                      nextFocusTargetRef.current = {
                        targetId: `${baseTargetId}-task-${Math.max(0, tIdx - 1)}`,
                        offset: 0,
                      };
                      updateBlockAtTopIndex(idx, {
                        ...block,
                        content: nextItems,
                      });
                    }}
                    onSlashTriggerChange={(payload) =>
                      setSlashState(
                        payload ? { ...payload, highlightIdx: 0 } : null
                      )
                    }
                    slashMenuOpenForThisTarget={
                      slashState?.targetId === taskTargetId
                    }
                    onSlashKeyDown={handleSlashKeyDown}
                    onClickInlineWidget={handleOpenWidgetEditor}
                    onUndo={onUndo}
                    onRedo={onRedo}
                  />
                  {slashState?.targetId === taskTargetId && (
                    <JiraSlashMenu
                      query={slashState.query}
                      activeIndex={slashState.highlightIdx}
                      onHighlightIndex={(i) =>
                        setSlashState((p) =>
                          p ? { ...p, highlightIdx: i } : null
                        )
                      }
                      onSelect={(cmd: JiraSlashCommandDef) =>
                        executeInsertCommand(cmd.id, {
                          targetId: slashState.targetId,
                          slashStart: slashState.slashStart,
                          slashEnd: slashState.slashEnd,
                        })
                      }
                      onClose={() => setSlashState(null)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        );
      }

      case 'decisionList': {
        return (
          <div
            key={baseTargetId}
            data-testid="adf-decision-list"
            className="space-y-1.5"
          >
            {block.content.map((dec, dIdx) => {
              const decTargetId = `${baseTargetId}-dec-${dIdx}`;
              const isDecided = dec.attrs.state === 'DECIDED';
              return (
                <div
                  key={dec.attrs.localId || decTargetId}
                  className="flex items-start gap-2 px-2.5 py-1.5 rounded-xl bg-slate-900/85 border border-slate-800"
                >
                  <button
                    type="button"
                    aria-pressed={isDecided}
                    title={
                      isDecided
                        ? 'Decision finalized (click to toggle undecided)'
                        : 'Undecided (click to mark decided)'
                    }
                    aria-label={`Toggle decision ${dIdx + 1} state`}
                    onClick={() => {
                      const nextItems = [...block.content];
                      nextItems[dIdx] = {
                        ...dec,
                        attrs: {
                          ...dec.attrs,
                          state: isDecided ? 'UNDECIDED' : 'DECIDED',
                        },
                      };
                      updateBlockAtTopIndex(idx, {
                        ...block,
                        content: nextItems,
                      });
                    }}
                    className={`mt-0.5 w-6 h-6 rounded-md flex items-center justify-center shrink-0 transition ${
                      isDecided
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                  >
                    <GitCommit className="w-3.5 h-3.5" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <RichInlineEditable
                      targetId={decTargetId}
                      topLevelIndex={idx}
                      inlineNodes={dec.content}
                      placeholder="Record architectural or team decision..."
                      ariaLabel={`Decision ${dIdx + 1}`}
                      onChangeInline={(nextInline) => {
                        const nextItems = [...block.content];
                        nextItems[dIdx] = { ...dec, content: nextInline };
                        updateBlockAtTopIndex(idx, {
                          ...block,
                          content: nextItems,
                        });
                      }}
                      onFocusTarget={handleFocusTarget}
                      onSelectionUpdate={handleSelectionUpdate}
                      onRegister={handleRegisterBlock}
                      onEnterSplit={(before, after) => {
                        if (
                          getInlineNodesLength(before) === 0 &&
                          getInlineNodesLength(after) === 0
                        ) {
                          const remaining = block.content.filter(
                            (_, i) => i !== dIdx
                          );
                          if (remaining.length === 0) {
                            nextFocusTargetRef.current = {
                              targetId: baseTargetId,
                              offset: 0,
                            };
                            updateBlockAtTopIndex(idx, {
                              type: 'paragraph',
                              content: [],
                            });
                          } else {
                            nextFocusTargetRef.current = {
                              targetId: `b-${idx + 1}`,
                              offset: 0,
                            };
                            updateBlockAtTopIndex(idx, [
                              { ...block, content: remaining },
                              { type: 'paragraph', content: [] },
                            ]);
                          }
                          return;
                        }
                        const nextItems = [...block.content];
                        nextItems.splice(
                          dIdx,
                          1,
                          { ...dec, content: before },
                          {
                            type: 'decisionItem',
                            attrs: {
                              localId: createAdfLocalId('dec'),
                              state: 'DECIDED',
                            },
                            content: after,
                          }
                        );
                        nextFocusTargetRef.current = {
                          targetId: `${baseTargetId}-dec-${dIdx + 1}`,
                          offset: 0,
                        };
                        updateBlockAtTopIndex(idx, {
                          ...block,
                          content: nextItems,
                        });
                      }}
                      onBackspaceAtStart={() => {
                        if (block.content.length === 1) {
                          nextFocusTargetRef.current = {
                            targetId: baseTargetId,
                            offset: 0,
                          };
                          updateBlockAtTopIndex(idx, {
                            type: 'paragraph',
                            content: dec.content,
                          });
                          return;
                        }
                        const nextItems = block.content.filter(
                          (_, i) => i !== dIdx
                        );
                        nextFocusTargetRef.current = {
                          targetId: `${baseTargetId}-dec-${Math.max(
                            0,
                            dIdx - 1
                          )}`,
                          offset: 0,
                        };
                        updateBlockAtTopIndex(idx, {
                          ...block,
                          content: nextItems,
                        });
                      }}
                      onSlashTriggerChange={(payload) =>
                        setSlashState(
                          payload ? { ...payload, highlightIdx: 0 } : null
                        )
                      }
                      slashMenuOpenForThisTarget={
                        slashState?.targetId === decTargetId
                      }
                      onSlashKeyDown={handleSlashKeyDown}
                      onClickInlineWidget={handleOpenWidgetEditor}
                      onUndo={onUndo}
                      onRedo={onRedo}
                    />
                    {slashState?.targetId === decTargetId && (
                      <JiraSlashMenu
                        query={slashState.query}
                        activeIndex={slashState.highlightIdx}
                        onHighlightIndex={(i) =>
                          setSlashState((p) =>
                            p ? { ...p, highlightIdx: i } : null
                          )
                        }
                        onSelect={(cmd: JiraSlashCommandDef) =>
                          executeInsertCommand(cmd.id, {
                            targetId: slashState.targetId,
                            slashStart: slashState.slashStart,
                            slashEnd: slashState.slashEnd,
                          })
                        }
                        onClose={() => setSlashState(null)}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        );
      }

      case 'panel': {
        const pStyle =
          PANEL_STYLES[block.attrs.panelType] || PANEL_STYLES.info;
        return (
          <div
            key={baseTargetId}
            data-testid={`adf-panel-${block.attrs.panelType}`}
            className={`my-1.5 rounded-xl border p-3 transition ${pStyle.containerClass}`}
          >
            <div className="flex items-center justify-between gap-2 flex-wrap mb-1.5">
              <div className="flex items-center gap-1.5">
                {pStyle.renderIcon()}
                <span className="text-[10px] font-bold uppercase tracking-wider opacity-90">
                  {pStyle.label} Panel
                </span>
              </div>

              <div className="flex items-center gap-1 flex-wrap">
                {(
                  ['info', 'note', 'success', 'warning', 'error'] as const
                ).map((pt) => (
                  <button
                    key={pt}
                    type="button"
                    aria-label={`Switch panel to ${pt}`}
                    aria-pressed={block.attrs.panelType === pt}
                    title={`Switch to ${PANEL_STYLES[pt].label} panel`}
                    onClick={() =>
                      updateBlockAtTopIndex(idx, {
                        ...block,
                        attrs: { ...block.attrs, panelType: pt },
                      })
                    }
                    className={`px-1.5 py-0.5 rounded text-[9px] font-semibold capitalize transition ${
                      block.attrs.panelType === pt
                        ? 'bg-white/20 text-white'
                        : 'text-slate-300/75 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {pt}
                  </button>
                ))}
                <button
                  type="button"
                  aria-label="Remove panel"
                  title="Remove Panel"
                  onClick={() => {
                    const nextBlocks = doc.content.filter((_, i) => i !== idx);
                    onChangeDoc({
                      version: 1,
                      type: 'doc',
                      content:
                        nextBlocks.length > 0
                          ? nextBlocks
                          : [{ type: 'paragraph', content: [] }],
                    });
                  }}
                  className="p-1 rounded hover:bg-rose-500/25 text-slate-300 hover:text-rose-200 transition"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>

            {renderNestedBlockList(
              block.content,
              `${baseTargetId}-panel`,
              idx,
              (nextInner) =>
                updateBlockAtTopIndex(idx, { ...block, content: nextInner })
            )}
          </div>
        );
      }

      case 'blockquote': {
        return (
          <blockquote
            key={baseTargetId}
            data-testid="adf-blockquote"
            className="border-l-2 border-sky-400/80 bg-slate-900/50 pl-3 pr-2 py-1.5 rounded-r-xl text-slate-200 italic"
          >
            {renderNestedBlockList(
              block.content,
              `${baseTargetId}-quote`,
              idx,
              (nextInner) =>
                updateBlockAtTopIndex(idx, { ...block, content: nextInner })
            )}
          </blockquote>
        );
      }

      case 'expand':
      case 'nestedExpand': {
        const isCollapsed = Boolean(collapsedExpands[baseTargetId]);
        return (
          <div
            key={baseTargetId}
            data-testid="adf-expand-block"
            className="my-1.5 rounded-xl border border-slate-700/90 bg-slate-900/70 overflow-hidden"
          >
            <div className="px-2.5 py-1.5 bg-slate-900/95 flex items-center gap-1.5 border-b border-slate-800/80">
              <button
                type="button"
                aria-expanded={!isCollapsed}
                aria-label={
                  isCollapsed
                    ? 'Expand collapsible section'
                    : 'Collapse collapsible section'
                }
                onClick={() =>
                  setCollapsedExpands((prev) => ({
                    ...prev,
                    [baseTargetId]: !prev[baseTargetId],
                  }))
                }
                className="w-6 h-6 rounded hover:bg-slate-800 flex items-center justify-center text-sky-400 shrink-0"
              >
                {isCollapsed ? (
                  <ChevronRight className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
              <input
                type="text"
                aria-label="Expand section title"
                value={block.attrs?.title ?? ''}
                onChange={(e) =>
                  updateBlockAtTopIndex(idx, {
                    ...block,
                    attrs: { ...block.attrs, title: e.target.value },
                  })
                }
                placeholder="Give this expand section a title..."
                className="bg-transparent text-xs font-semibold text-white placeholder-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60 rounded px-1 flex-1 min-w-0"
              />
              <button
                type="button"
                aria-label="Delete expand block"
                onClick={() => {
                  const nextBlocks = doc.content.filter((_, i) => i !== idx);
                  onChangeDoc({
                    version: 1,
                    type: 'doc',
                    content:
                      nextBlocks.length > 0
                        ? nextBlocks
                        : [{ type: 'paragraph', content: [] }],
                  });
                }}
                className="p-1 rounded text-slate-400 hover:text-rose-300 hover:bg-slate-800"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
            {!isCollapsed && (
              <div className="p-3">
                {renderNestedBlockList(
                  block.content,
                  `${baseTargetId}-expand`,
                  idx,
                  (nextInner) =>
                    updateBlockAtTopIndex(idx, { ...block, content: nextInner })
                )}
              </div>
            )}
          </div>
        );
      }

      case 'table': {
        const isNumbered = Boolean(block.attrs?.isNumberColumnEnabled);
        const hasHeaderRow =
          block.content[0]?.content.every((c) => c.type === 'tableHeader') ??
          false;
        const colCount = block.content[0]?.content.length || 1;

        const addRow = () => {
          const newCells = Array.from({ length: colCount }, () => ({
            type: 'tableCell' as const,
            content: [{ type: 'paragraph' as const, content: [] }],
          }));
          updateBlockAtTopIndex(idx, {
            ...block,
            content: [...block.content, { type: 'tableRow', content: newCells }],
          });
        };

        const removeLastRow = () => {
          if (block.content.length <= 1) return;
          updateBlockAtTopIndex(idx, {
            ...block,
            content: block.content.slice(0, -1),
          });
        };

        const addColumn = () => {
          const nextRows = block.content.map((row, rIdx) => ({
            ...row,
            content: [
              ...row.content,
              {
                type:
                  hasHeaderRow && rIdx === 0
                    ? ('tableHeader' as const)
                    : ('tableCell' as const),
                content: [
                  {
                    type: 'paragraph' as const,
                    content:
                      hasHeaderRow && rIdx === 0
                        ? [
                            {
                              type: 'text' as const,
                              text: `Header ${colCount + 1}`,
                              marks: [{ type: 'strong' as const }],
                            },
                          ]
                        : [],
                  },
                ],
              },
            ],
          }));
          updateBlockAtTopIndex(idx, { ...block, content: nextRows });
        };

        const removeLastColumn = () => {
          if (colCount <= 1) return;
          const nextRows = block.content.map((row) => ({
            ...row,
            content: row.content.slice(0, -1),
          }));
          updateBlockAtTopIndex(idx, { ...block, content: nextRows });
        };

        const toggleHeaderRow = () => {
          if (block.content.length === 0) return;
          const nextType: 'tableCell' | 'tableHeader' = hasHeaderRow
            ? 'tableCell'
            : 'tableHeader';
          const nextRows = block.content.map((r, rIdx) =>
            rIdx === 0
              ? {
                  ...r,
                  content: r.content.map((c) => ({ ...c, type: nextType })),
                }
              : r
          );
          updateBlockAtTopIndex(idx, { ...block, content: nextRows });
        };

        return (
          <div
            key={baseTargetId}
            data-testid="adf-table-block"
            className="my-2 rounded-xl border border-slate-700/90 bg-slate-950/70 overflow-hidden"
          >
            {/* Jira Floating/Contextual Table Controls Bar */}
            <div className="px-2.5 py-1 bg-slate-900/95 border-b border-slate-800 flex items-center justify-between gap-1.5 flex-wrap text-[10px]">
              <div className="flex items-center gap-1 flex-wrap">
                <button
                  type="button"
                  onClick={toggleHeaderRow}
                  aria-pressed={hasHeaderRow}
                  className={`px-1.5 py-0.5 rounded border transition ${
                    hasHeaderRow
                      ? 'bg-sky-600/25 border-sky-500/50 text-sky-200'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  Header row
                </button>
                <button
                  type="button"
                  onClick={() =>
                    updateBlockAtTopIndex(idx, {
                      ...block,
                      attrs: {
                        ...block.attrs,
                        isNumberColumnEnabled: !isNumbered,
                      },
                    })
                  }
                  aria-pressed={isNumbered}
                  className={`px-1.5 py-0.5 rounded border flex items-center gap-0.5 transition ${
                    isNumbered
                      ? 'bg-sky-600/25 border-sky-500/50 text-sky-200'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <Hash className="w-2.5 h-2.5" /> Numbers
                </button>
                <button
                  type="button"
                  onClick={addRow}
                  aria-label="Add table row"
                  className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
                >
                  + Row
                </button>
                <button
                  type="button"
                  onClick={removeLastRow}
                  disabled={block.content.length <= 1}
                  title="Remove last table row"
                  aria-label="Remove table row"
                  className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40"
                >
                  - Row
                </button>
                <button
                  type="button"
                  onClick={addColumn}
                  aria-label="Add table column"
                  className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
                >
                  + Col
                </button>
                <button
                  type="button"
                  onClick={removeLastColumn}
                  disabled={colCount <= 1}
                  title="Remove last table column"
                  aria-label="Remove table column"
                  className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40"
                >
                  - Col
                </button>
              </div>

              <button
                type="button"
                aria-label="Delete table"
                onClick={() => {
                  const nextBlocks = doc.content.filter((_, i) => i !== idx);
                  onChangeDoc({
                    version: 1,
                    type: 'doc',
                    content:
                      nextBlocks.length > 0
                        ? nextBlocks
                        : [{ type: 'paragraph', content: [] }],
                  });
                }}
                className="p-1 rounded text-slate-400 hover:text-rose-300 hover:bg-slate-800"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <tbody>
                  {block.content.map((row, rIdx) => (
                    <tr key={rIdx} className="border-b border-slate-800/90 last:border-b-0">
                      {isNumbered && (
                        <td className="w-7 px-1.5 py-1.5 text-center font-mono text-[10px] text-slate-400 bg-slate-900/90 border-r border-slate-800 select-none">
                          {hasHeaderRow && rIdx === 0
                            ? '#'
                            : hasHeaderRow
                            ? rIdx
                            : rIdx + 1}
                        </td>
                      )}
                      {row.content.map((cell, cIdx) => {
                        const CellTag =
                          cell.type === 'tableHeader' ? 'th' : 'td';
                        const cellPrefix = `${baseTargetId}-r${rIdx}-c${cIdx}`;
                        const customBg = cell.attrs?.background;
                        const isLightCellBg = isLightHexColor(customBg);
                        return (
                          <CellTag
                            key={cIdx}
                            scope={
                              cell.type === 'tableHeader' ? 'col' : undefined
                            }
                            style={
                              customBg
                                ? {
                                    backgroundColor: customBg,
                                    color: isLightCellBg ? '#0f172a' : undefined,
                                  }
                                : undefined
                            }
                            className={`px-2.5 py-1.5 border-r border-slate-800/90 last:border-r-0 align-top text-left group/cell relative ${
                              cell.type === 'tableHeader' && !customBg
                                ? 'bg-slate-900/90 font-semibold text-white'
                                : isLightCellBg
                                ? 'text-slate-900'
                                : 'text-slate-200'
                            }`}
                          >
                            {renderNestedBlockList(
                              cell.content,
                              cellPrefix,
                              idx,
                              (nextCellBlocks) => {
                                const nextRows = [...block.content];
                                const nextCells = [...row.content];
                                nextCells[cIdx] = {
                                  ...cell,
                                  content: nextCellBlocks,
                                };
                                nextRows[rIdx] = { ...row, content: nextCells };
                                updateBlockAtTopIndex(idx, {
                                  ...block,
                                  content: nextRows,
                                });
                              }
                            )}

                            {/* Subtle cell background tint cycle button on hover */}
                            <button
                              type="button"
                              tabIndex={-1}
                              title="Cycle Jira table cell background tint"
                              aria-label={`Cycle cell R${rIdx + 1}C${cIdx + 1} tint`}
                              onClick={() => {
                                const curIdx = JIRA_TABLE_CELL_COLORS.findIndex(
                                  (opt) => opt.value === (customBg || '')
                                );
                                const nextOpt =
                                  JIRA_TABLE_CELL_COLORS[
                                    (curIdx + 1) % JIRA_TABLE_CELL_COLORS.length
                                  ];
                                const nextRows = [...block.content];
                                const nextCells = [...row.content];
                                nextCells[cIdx] = {
                                  ...cell,
                                  attrs: nextOpt.value
                                    ? { ...cell.attrs, background: nextOpt.value }
                                    : undefined,
                                };
                                nextRows[rIdx] = { ...row, content: nextCells };
                                updateBlockAtTopIndex(idx, {
                                  ...block,
                                  content: nextRows,
                                });
                              }}
                              className="opacity-0 group-hover/cell:opacity-100 focus:opacity-100 absolute top-0.5 right-0.5 w-6 h-6 rounded bg-slate-800/90 border border-slate-700 flex items-center justify-center text-[9px] text-slate-300 transition"
                            >
                              ●
                            </button>
                          </CellTag>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      }

      case 'codeBlock': {
        const rawCode = (block.content || []).map((t) => t.text).join('');
        const lang = block.attrs?.language || 'plaintext';
        const isMermaid = lang === 'mermaid';
        const parsedMermaid = isMermaid ? parseMermaidCode(rawCode) : null;
        const laidOutMermaid: FlowchartState | null = parsedMermaid
          ? { ...parsedMermaid, nodes: computeDagLayout(parsedMermaid) }
          : null;
        const svgMarkup = laidOutMermaid
          ? generateStandaloneSVG(laidOutMermaid).replace(
              /^<\?xml[^>]*>\s*/i,
              ''
            )
          : null;

        return (
          <div
            key={baseTargetId}
            data-testid="adf-code-block"
            className="my-2 rounded-xl border border-slate-700/90 bg-slate-950/95 overflow-hidden"
          >
            <div className="px-2.5 py-1 bg-slate-900/95 border-b border-slate-800 flex items-center justify-between gap-2 text-[10px]">
              <div className="flex items-center gap-1.5">
                <Code2 className="w-3.5 h-3.5 text-amber-400" />
                <select
                  aria-label="Code Block Language"
                  value={lang}
                  onChange={(e) => {
                    const nextLang = e.target.value;
                    updateBlockAtTopIndex(idx, {
                      ...block,
                      attrs:
                        nextLang === 'plaintext'
                          ? undefined
                          : { language: nextLang },
                    });
                  }}
                  className="bg-slate-950 text-slate-200 border border-slate-700 rounded px-1.5 py-0.5 font-mono text-[10px] focus:outline-none focus:ring-1 focus:ring-sky-500"
                >
                  {JIRA_CODE_LANGUAGES.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1">
                {laidOutMermaid && onOpenMermaidInFlow && (
                  <button
                    type="button"
                    aria-label="Open Mermaid block in Flow tab"
                    onClick={() => onOpenMermaidInFlow(laidOutMermaid)}
                    className="px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium flex items-center gap-1 transition"
                  >
                    <GitBranch className="w-2.5 h-2.5" /> Edit in Flow
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Copy code snippet"
                  onClick={() => {
                    navigator.clipboard?.writeText?.(rawCode).catch(() => {});
                    onNotify('Copied Code Block', 'check', `${lang} snippet`);
                  }}
                  className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800"
                >
                  <Copy className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  aria-label="Delete code block"
                  onClick={() => {
                    const nextBlocks = doc.content.filter((_, i) => i !== idx);
                    onChangeDoc({
                      version: 1,
                      type: 'doc',
                      content:
                        nextBlocks.length > 0
                          ? nextBlocks
                          : [{ type: 'paragraph', content: [] }],
                    });
                  }}
                  className="p-1 rounded text-slate-400 hover:text-rose-300 hover:bg-slate-800"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>

            <textarea
              aria-label={`Code snippet (${lang})`}
              value={rawCode}
              onFocus={() => setActiveTopLevelIndex(idx)}
              onChange={(e) => {
                const val = e.target.value;
                updateBlockAtTopIndex(idx, {
                  ...block,
                  content: val.length > 0 ? [{ type: 'text', text: val }] : [],
                });
              }}
              rows={Math.max(2, Math.min(12, rawCode.split('\n').length))}
              placeholder={`Enter ${lang} code...`}
              className="w-full bg-transparent p-3 font-mono text-[11px] text-emerald-300 placeholder-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500/60 resize-y leading-relaxed select-text"
            />

            {isMermaid && svgMarkup && (
              <div
                data-testid="note-mermaid-diagram"
                className="border-t border-slate-800 bg-slate-900/60 p-2"
              >
                <img
                  src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(
                    svgMarkup
                  )}`}
                  alt="Rendered Mermaid diagram"
                  className="w-full h-auto max-h-48 object-contain"
                />
              </div>
            )}
          </div>
        );
      }

      case 'rule':
        return (
          <div
            key={baseTargetId}
            data-testid="adf-rule-divider"
            className="group flex items-center gap-2 py-2"
          >
            <hr className="flex-1 border-slate-700/90" />
            <button
              type="button"
              aria-label="Remove divider"
              onClick={() => {
                const nextBlocks = doc.content.filter((_, i) => i !== idx);
                onChangeDoc({
                  version: 1,
                  type: 'doc',
                  content:
                    nextBlocks.length > 0
                      ? nextBlocks
                      : [{ type: 'paragraph', content: [] }],
                });
              }}
              className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-0.5 rounded text-slate-500 hover:text-rose-300 transition"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        );

      case 'layoutSection': {
        const colCount = block.content.length;
        return (
          <div
            key={baseTargetId}
            data-testid="adf-layout-section"
            className="my-2 rounded-xl border border-dashed border-slate-700/80 bg-slate-900/35 p-2.5"
          >
            <div className="flex items-center justify-between mb-1.5 text-[10px] text-slate-400">
              <span className="font-semibold text-cyan-300">
                {colCount}-Column Jira Layout
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    if (colCount === 2) {
                      updateBlockAtTopIndex(idx, {
                        type: 'layoutSection',
                        content: [
                          {
                            type: 'layoutColumn',
                            attrs: { width: 33.33 },
                            content: block.content[0].content,
                          },
                          {
                            type: 'layoutColumn',
                            attrs: { width: 33.33 },
                            content: block.content[1].content,
                          },
                          {
                            type: 'layoutColumn',
                            attrs: { width: 33.33 },
                            content: [{ type: 'paragraph', content: [] }],
                          },
                        ],
                      });
                    } else {
                      const extraBlocks = block.content
                        .slice(2)
                        .flatMap((c) => c.content)
                        .filter(
                          (b) =>
                            !(
                              b.type === 'paragraph' &&
                              getInlineNodesLength(b.content) === 0
                            )
                        );
                      updateBlockAtTopIndex(idx, {
                        type: 'layoutSection',
                        content: [
                          {
                            type: 'layoutColumn',
                            attrs: { width: 50 },
                            content: block.content[0].content,
                          },
                          {
                            type: 'layoutColumn',
                            attrs: { width: 50 },
                            content: [
                              ...block.content[1].content,
                              ...extraBlocks,
                            ],
                          },
                        ],
                      });
                    }
                  }}
                  className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
                >
                  Switch to {colCount === 2 ? '3' : '2'} cols
                </button>
                <button
                  type="button"
                  aria-label="Remove column layout"
                  onClick={() => {
                    const nextBlocks = doc.content.filter((_, i) => i !== idx);
                    onChangeDoc({
                      version: 1,
                      type: 'doc',
                      content:
                        nextBlocks.length > 0
                          ? nextBlocks
                          : [{ type: 'paragraph', content: [] }],
                    });
                  }}
                  className="p-0.5 rounded text-slate-400 hover:text-rose-300"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>

            <div className="grid gap-2.5 grid-cols-[repeat(auto-fit,minmax(145px,1fr))]">
              {block.content.map((col, colIdx) => (
                <div
                  key={colIdx}
                  className="rounded-lg border border-slate-800 bg-slate-950/70 p-2 min-w-0"
                >
                  {renderNestedBlockList(
                    col.content,
                    `${baseTargetId}-col${colIdx}`,
                    idx,
                    (nextColBlocks) => {
                      const nextCols = [...block.content];
                      nextCols[colIdx] = { ...col, content: nextColBlocks };
                      updateBlockAtTopIndex(idx, {
                        ...block,
                        content: nextCols,
                      });
                    }
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      }

      case 'mediaSingle': {
        const media = block.content[0];
        return (
          <div
            key={baseTargetId}
            data-testid="adf-media-single"
            className="my-2 rounded-xl border border-slate-800 bg-slate-950/80 p-2.5 space-y-2"
          >
            <div className="flex items-center justify-between gap-2 text-[10px]">
              <input
                type="text"
                aria-label="Media Image URL"
                value={media.attrs.url || ''}
                onChange={(e) => {
                  const nextUrl = e.target.value;
                  updateBlockAtTopIndex(idx, {
                    ...block,
                    content: [
                      {
                        ...media,
                        attrs: {
                          ...media.attrs,
                          type: 'external',
                          url: nextUrl,
                        },
                      },
                    ],
                  });
                }}
                placeholder="https://example.com/image.png"
                className="flex-1 bg-slate-900 border border-slate-800 rounded px-2 py-0.5 text-slate-200 font-mono text-[10px]"
              />
              <button
                type="button"
                aria-label="Remove media block"
                onClick={() => {
                  const nextBlocks = doc.content.filter((_, i) => i !== idx);
                  onChangeDoc({
                    version: 1,
                    type: 'doc',
                    content:
                      nextBlocks.length > 0
                        ? nextBlocks
                        : [{ type: 'paragraph', content: [] }],
                  });
                }}
                className="p-1 rounded text-slate-400 hover:text-rose-300"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
            {media.attrs.url && isSafeAdfUrl(media.attrs.url) && (
              <img
                src={media.attrs.url}
                alt={media.attrs.alt || 'Jira embedded media'}
                className="max-h-52 w-auto mx-auto rounded-lg object-contain"
              />
            )}
          </div>
        );
      }

      case 'blockCard': {
        return (
          <div
            key={baseTargetId}
            data-testid="adf-block-card"
            className="my-1.5 px-3 py-2 rounded-xl border border-sky-500/35 bg-slate-900/90 flex items-center justify-between gap-2"
          >
            <a
              href={isSafeAdfUrl(block.attrs.url) ? block.attrs.url : undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs text-sky-300 hover:text-sky-200 truncate"
            >
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{block.attrs.url}</span>
            </a>
            <button
              type="button"
              aria-label="Remove smart link card"
              onClick={() => {
                const nextBlocks = doc.content.filter((_, i) => i !== idx);
                onChangeDoc({
                  version: 1,
                  type: 'doc',
                  content:
                    nextBlocks.length > 0
                      ? nextBlocks
                      : [{ type: 'paragraph', content: [] }],
                });
              }}
              className="p-1 rounded text-slate-400 hover:text-rose-300"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        );
      }
    }
  };

  // Resolve inline widget currently being edited
  const activeWidgetNode = (() => {
    if (!editingWidget) return null;
    const reg = registryRef.current.get(editingWidget.targetId);
    return reg?.getInline()[editingWidget.inlineIndex] || null;
  })();

  const currentAlignMark =
    currentTopBlock &&
    (currentTopBlock.type === 'paragraph' || currentTopBlock.type === 'heading')
      ? currentTopBlock.marks?.find((m) => m.type === 'alignment')
      : undefined;
  const activeBlockAlign: 'left' | 'center' | 'end' =
    currentAlignMark && currentAlignMark.type === 'alignment'
      ? currentAlignMark.attrs.align
      : 'left';
  const canAlignOrIndent =
    currentTopBlock?.type === 'paragraph' ||
    currentTopBlock?.type === 'heading';

  return (
    <div
      data-testid="jira-adf-editor"
      className="flex-1 flex flex-col min-h-0 overflow-hidden"
    >
      {/* Jira Cloud Description Editor Sticky Toolbar */}
      <div
        ref={toolbarRef}
        data-testid="jira-adf-toolbar"
        role="toolbar"
        aria-label="Jira ADF Description Formatting Toolbar"
        className="px-2.5 py-1.5 bg-slate-900/80 border-b border-slate-800/90 flex items-center gap-1 flex-wrap relative z-20"
      >
        {/* 1. Text Style Dropdown (Normal text, H1-H6, Quote) */}
        <select
          aria-label="Jira Text Style"
          value={currentTextStyleValue}
          onChange={(e) => handleTextStyleChange(e.target.value)}
          className="min-h-[26px] px-2 py-0.5 rounded-lg bg-slate-950 border border-slate-700/90 text-[11px] font-medium text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
        >
          <option value="paragraph">Normal text</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
          <option value="h4">Heading 4</option>
          <option value="h5">Heading 5</option>
          <option value="h6">Heading 6</option>
          <option value="blockquote">Quote</option>
        </select>

        <div className="h-4 w-px bg-slate-800 mx-0.5" />

        {/* 2. Core Marks: Bold, Italic, Underline + More Formatting */}
        <button
          type="button"
          aria-label="Jira Bold"
          aria-pressed={hasActiveMark('strong')}
          title="Bold (Ctrl+B)"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => applyMarkToActiveTarget({ type: 'strong' })}
          className={`w-6 h-6 flex items-center justify-center rounded-md transition ${
            hasActiveMark('strong')
              ? 'bg-sky-600/30 text-sky-200 border border-sky-500/50'
              : 'text-slate-300 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Bold className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          aria-label="Jira Italic"
          aria-pressed={hasActiveMark('em')}
          title="Italic (Ctrl+I)"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => applyMarkToActiveTarget({ type: 'em' })}
          className={`w-6 h-6 flex items-center justify-center rounded-md transition ${
            hasActiveMark('em')
              ? 'bg-sky-600/30 text-sky-200 border border-sky-500/50'
              : 'text-slate-300 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Italic className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          aria-label="Jira Underline"
          aria-pressed={hasActiveMark('underline')}
          title="Underline (Ctrl+U)"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => applyMarkToActiveTarget({ type: 'underline' })}
          className={`w-6 h-6 flex items-center justify-center rounded-md transition ${
            hasActiveMark('underline')
              ? 'bg-sky-600/30 text-sky-200 border border-sky-500/50'
              : 'text-slate-300 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Underline className="w-3.5 h-3.5" />
        </button>

        {/* More Formatting Dropdown (Strike, Code, Sub, Sup, Clear) */}
        <div>
          <button
            type="button"
            data-testid="jira-more-formatting-btn"
            aria-label="More formatting"
            aria-haspopup="menu"
            aria-expanded={openMenu === 'more'}
            title="More formatting (Strikethrough, Code, Subscript, Superscript)"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() =>
              setOpenMenu((prev) => (prev === 'more' ? null : 'more'))
            }
            className={`w-6 h-6 flex items-center justify-center rounded-md transition ${
              openMenu === 'more'
                ? 'bg-sky-600 text-white'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>

          {openMenu === 'more' && (
            <div
              data-testid="jira-more-formatting-menu"
              role="menu"
              className="absolute left-2 top-full mt-1 w-48 max-w-[calc(100%-1rem)] rounded-xl bg-slate-900 border border-slate-700 shadow-2xl py-1 z-30 text-xs"
            >
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={hasActiveMark('strike')}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyMarkToActiveTarget({ type: 'strike' })}
                className={`w-full px-3 py-1.5 text-left hover:bg-slate-800 flex items-center justify-between ${
                  hasActiveMark('strike') ? 'text-sky-300 font-semibold' : 'text-slate-200'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Strikethrough className="w-3.5 h-3.5 text-slate-400" />
                  Strikethrough
                </span>
                <span className="text-[9px] font-mono text-slate-400">
                  Ctrl+Shift+S
                </span>
              </button>
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={hasActiveMark('code')}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyMarkToActiveTarget({ type: 'code' })}
                className={`w-full px-3 py-1.5 text-left hover:bg-slate-800 flex items-center justify-between ${
                  hasActiveMark('code') ? 'text-amber-300 font-semibold' : 'text-slate-200'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Code className="w-3.5 h-3.5 text-amber-400" />
                  Code
                </span>
                <span className="text-[9px] font-mono text-slate-400">
                  Ctrl+Shift+M
                </span>
              </button>
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={hasActiveMark('subsup', 'sub')}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() =>
                  applyMarkToActiveTarget({
                    type: 'subsup',
                    attrs: { type: 'sub' },
                  })
                }
                className={`w-full px-3 py-1.5 text-left hover:bg-slate-800 flex items-center gap-2 ${
                  hasActiveMark('subsup', 'sub')
                    ? 'text-sky-300 font-semibold'
                    : 'text-slate-200'
                }`}
              >
                <Subscript className="w-3.5 h-3.5 text-slate-400" /> Subscript
              </button>
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={hasActiveMark('subsup', 'sup')}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() =>
                  applyMarkToActiveTarget({
                    type: 'subsup',
                    attrs: { type: 'sup' },
                  })
                }
                className={`w-full px-3 py-1.5 text-left hover:bg-slate-800 flex items-center gap-2 ${
                  hasActiveMark('subsup', 'sup')
                    ? 'text-sky-300 font-semibold'
                    : 'text-slate-200'
                }`}
              >
                <Superscript className="w-3.5 h-3.5 text-slate-400" />{' '}
                Superscript
              </button>
              <div className="my-1 border-t border-slate-800" />
              <button
                type="button"
                role="menuitem"
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleClearFormatting}
                className="w-full px-3 py-1.5 text-left text-rose-300 hover:bg-slate-800 flex items-center gap-2"
              >
                <Eraser className="w-3.5 h-3.5" /> Clear formatting
              </button>
            </div>
          )}
        </div>

        {/* 3. Text & Highlight Color Swatches */}
        <div>
          <button
            type="button"
            data-testid="jira-color-picker-btn"
            aria-label="Text and highlight colors"
            aria-haspopup="dialog"
            aria-expanded={openMenu === 'color'}
            title="Text color & highlight"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() =>
              setOpenMenu((prev) => (prev === 'color' ? null : 'color'))
            }
            className="w-6 h-6 flex items-center justify-center rounded-md text-slate-300 hover:text-white hover:bg-slate-800 transition"
          >
            <Palette className="w-3.5 h-3.5 text-sky-400" />
          </button>
          {openMenu === 'color' && (
            <div className="absolute left-2 right-2 top-full mt-1 z-30 flex justify-start pointer-events-none [&>*]:pointer-events-auto">
              <ColorPickerPopover
                onSelectTextColor={(hex) => {
                  if (!hex) {
                    handleClearFormatting();
                  } else {
                    applyMarkToActiveTarget({
                      type: 'textColor',
                      attrs: { color: hex },
                    });
                  }
                }}
                onSelectHighlightColor={(hex) => {
                  if (!hex) {
                    handleClearFormatting();
                  } else {
                    applyMarkToActiveTarget({
                      type: 'backgroundColor',
                      attrs: { color: hex },
                    });
                  }
                }}
                onClose={() => setOpenMenu(null)}
              />
            </div>
          )}
        </div>

        <div className="h-4 w-px bg-slate-800 mx-0.5" />

        {/* 4. Alignment & Indentation */}
        <button
          type="button"
          aria-label="Align Left"
          aria-pressed={canAlignOrIndent && activeBlockAlign === 'left'}
          disabled={!canAlignOrIndent}
          title="Align Left"
          onClick={() => handleBlockAlignment('left')}
          className={`w-6 h-6 flex items-center justify-center rounded-md transition disabled:opacity-40 ${
            canAlignOrIndent && activeBlockAlign === 'left'
              ? 'bg-sky-600/25 text-sky-200 border border-sky-500/40'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <AlignLeft className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          aria-label="Align Center"
          aria-pressed={canAlignOrIndent && activeBlockAlign === 'center'}
          disabled={!canAlignOrIndent}
          title="Align Center"
          onClick={() => handleBlockAlignment('center')}
          className={`w-6 h-6 flex items-center justify-center rounded-md transition disabled:opacity-40 ${
            canAlignOrIndent && activeBlockAlign === 'center'
              ? 'bg-sky-600/25 text-sky-200 border border-sky-500/40'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <AlignCenter className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          aria-label="Align Right"
          aria-pressed={canAlignOrIndent && activeBlockAlign === 'end'}
          disabled={!canAlignOrIndent}
          title="Align Right"
          onClick={() => handleBlockAlignment('end')}
          className={`w-6 h-6 flex items-center justify-center rounded-md transition disabled:opacity-40 ${
            canAlignOrIndent && activeBlockAlign === 'end'
              ? 'bg-sky-600/25 text-sky-200 border border-sky-500/40'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <AlignRight className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          aria-label="Outdent Block"
          disabled={!canAlignOrIndent}
          title="Outdent"
          onClick={() => handleBlockIndent(-1)}
          className="w-6 h-6 flex items-center justify-center rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition disabled:opacity-40"
        >
          <Outdent className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          aria-label="Indent Block"
          disabled={!canAlignOrIndent}
          title="Indent"
          onClick={() => handleBlockIndent(1)}
          className="w-6 h-6 flex items-center justify-center rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition disabled:opacity-40"
        >
          <Indent className="w-3.5 h-3.5" />
        </button>

        <div className="h-4 w-px bg-slate-800 mx-0.5" />

        {/* 5. Lists, Action Items & Decisions */}
        <button
          type="button"
          aria-label="Jira Bullet List"
          aria-pressed={currentTopBlock?.type === 'bulletList'}
          title="Bullet list (-)"
          onClick={() => handleToggleListType('bulletList')}
          className={`w-6 h-6 flex items-center justify-center rounded-md transition ${
            currentTopBlock?.type === 'bulletList'
              ? 'bg-sky-600/30 text-sky-200 border border-sky-500/50'
              : 'text-slate-300 hover:text-white hover:bg-slate-800'
          }`}
        >
          <List className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          aria-label="Jira Numbered List"
          aria-pressed={currentTopBlock?.type === 'orderedList'}
          title="Numbered list (1.)"
          onClick={() => handleToggleListType('orderedList')}
          className={`w-6 h-6 flex items-center justify-center rounded-md transition ${
            currentTopBlock?.type === 'orderedList'
              ? 'bg-sky-600/30 text-sky-200 border border-sky-500/50'
              : 'text-slate-300 hover:text-white hover:bg-slate-800'
          }`}
        >
          <ListOrdered className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          aria-label="Jira Action Item"
          aria-pressed={currentTopBlock?.type === 'taskList'}
          title="Action item checklist ([])"
          onClick={() => handleToggleListType('taskList')}
          className={`w-6 h-6 flex items-center justify-center rounded-md transition ${
            currentTopBlock?.type === 'taskList'
              ? 'bg-sky-600/30 text-sky-200 border border-sky-500/50'
              : 'text-slate-300 hover:text-sky-300 hover:bg-slate-800'
          }`}
        >
          <CheckSquare className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          aria-label="Jira Decision"
          aria-pressed={currentTopBlock?.type === 'decisionList'}
          title="Decision (<>)"
          onClick={() => handleToggleListType('decisionList')}
          className={`w-6 h-6 flex items-center justify-center rounded-md transition ${
            currentTopBlock?.type === 'decisionList'
              ? 'bg-emerald-600/30 text-emerald-200 border border-emerald-500/50'
              : 'text-slate-300 hover:text-emerald-300 hover:bg-slate-800'
          }`}
        >
          <GitCommit className="w-3.5 h-3.5" />
        </button>

        <div className="h-4 w-px bg-slate-800 mx-0.5" />

        {/* 6. Rich Jira Inserts: Link/Smart Card, @Mention, Emoji, Status, Table, Code, Panel, + Insert */}
        <div>
          <button
            type="button"
            aria-label="Insert Jira Link"
            aria-haspopup="dialog"
            aria-expanded={openMenu === 'link'}
            title="Link or Jira Smart Card"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setLinkInitialMode('link');
              setOpenMenu((prev) => (prev === 'link' ? null : 'link'));
            }}
            className="w-6 h-6 flex items-center justify-center rounded-md text-slate-300 hover:text-sky-300 hover:bg-slate-800 transition"
          >
            <Link2 className="w-3.5 h-3.5" />
          </button>
          {openMenu === 'link' && (
            <div className="absolute left-2 right-2 top-full mt-1 z-30 flex justify-end pointer-events-none [&>*]:pointer-events-auto">
              <LinkEditorPopover
                initialText=""
                initialUrl="https://"
                initialDisplayMode={linkInitialMode}
                onApply={({ url, text, displayMode }) => {
                  setOpenMenu(null);
                  if (!isSafeAdfUrl(url)) {
                    onNotify(
                      'Blocked Unsafe URL',
                      'zap',
                      'Only http(s):// and mailto: URLs are allowed',
                      { variant: 'warning' }
                    );
                    return;
                  }
                  if (displayMode === 'inlineCard') {
                    insertInlineIntoActiveTarget({
                      type: 'inlineCard',
                      attrs: { url },
                    });
                  } else if (displayMode === 'blockCard') {
                    insertBlockAfterTopIndex(safeTopIdx, {
                      type: 'blockCard',
                      attrs: { url },
                    });
                  } else {
                    const reg = registryRef.current.get(activeTargetId);
                    const sel = reg?.getSelection();
                    if (reg && sel && sel.end > sel.start) {
                      applyMarkToActiveTarget({
                        type: 'link',
                        attrs: { href: url },
                      });
                    } else {
                      insertInlineIntoActiveTarget({
                        type: 'text',
                        text: text || url,
                        marks: [{ type: 'link', attrs: { href: url } }],
                      });
                    }
                  }
                }}
                onClose={() => setOpenMenu(null)}
              />
            </div>
          )}
        </div>

        <button
          type="button"
          aria-label="Insert Mention"
          title="Mention user (@)"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() =>
            insertInlineIntoActiveTarget({
              type: 'mention',
              attrs: { id: 'teammate', text: '@teammate' },
            })
          }
          className="w-6 h-6 flex items-center justify-center rounded-md text-slate-300 hover:text-indigo-300 hover:bg-slate-800 transition"
        >
          <AtSign className="w-3.5 h-3.5" />
        </button>

        <div>
          <button
            type="button"
            aria-label="Insert Emoji"
            aria-haspopup="dialog"
            aria-expanded={openMenu === 'emoji'}
            title="Emoji (:)"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() =>
              setOpenMenu((prev) => (prev === 'emoji' ? null : 'emoji'))
            }
            className="w-6 h-6 flex items-center justify-center rounded-md text-slate-300 hover:text-amber-300 hover:bg-slate-800 transition"
          >
            <Smile className="w-3.5 h-3.5" />
          </button>
          {openMenu === 'emoji' && (
            <div className="absolute left-2 right-2 top-full mt-1 z-30 flex justify-end pointer-events-none [&>*]:pointer-events-auto">
              <EmojiPickerPopover
                onSelectEmoji={(em) =>
                  insertInlineIntoActiveTarget({
                    type: 'emoji',
                    attrs: { shortName: em.shortName, text: em.text },
                  })
                }
                onClose={() => setOpenMenu(null)}
              />
            </div>
          )}
        </div>

        <div>
          <button
            type="button"
            aria-label="Insert Status Lozenge"
            aria-haspopup="dialog"
            aria-expanded={openMenu === 'status-new'}
            title="Status lozenge (/status)"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() =>
              setOpenMenu((prev) =>
                prev === 'status-new' ? null : 'status-new'
              )
            }
            className="w-6 h-6 flex items-center justify-center rounded-md text-slate-300 hover:text-emerald-300 hover:bg-slate-800 transition"
          >
            <Tag className="w-3.5 h-3.5" />
          </button>
          {openMenu === 'status-new' && (
            <div className="absolute left-2 right-2 top-full mt-1 z-30 flex justify-end pointer-events-none [&>*]:pointer-events-auto">
              <StatusEditorPopover
                initialText="IN PROGRESS"
                initialColor="blue"
                onSave={(text, color) => {
                  setOpenMenu(null);
                  insertInlineIntoActiveTarget({
                    type: 'status',
                    attrs: {
                      text: text.toUpperCase(),
                      color,
                      localId: createAdfLocalId('status'),
                    },
                  });
                }}
                onClose={() => setOpenMenu(null)}
              />
            </div>
          )}
        </div>

        <button
          type="button"
          aria-label="Insert Jira Table"
          title="Insert Table (/table)"
          onClick={() => executeInsertCommand('table')}
          className="w-6 h-6 flex items-center justify-center rounded-md text-slate-300 hover:text-indigo-300 hover:bg-slate-800 transition"
        >
          <Table className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          aria-label="Insert Code Snippet"
          title="Code snippet (/code)"
          onClick={() => executeInsertCommand('codeBlock')}
          className="w-6 h-6 flex items-center justify-center rounded-md text-slate-300 hover:text-amber-300 hover:bg-slate-800 transition"
        >
          <Code2 className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          aria-label="Insert Info Panel"
          title="Info panel (/info)"
          onClick={() => executeInsertCommand('panel-info')}
          className="w-6 h-6 flex items-center justify-center rounded-md text-slate-300 hover:text-sky-300 hover:bg-slate-800 transition"
        >
          <Info className="w-3.5 h-3.5" />
        </button>

        {/* Jira "+ Insert" Full Element Menu */}
        <div>
          <button
            type="button"
            data-testid="jira-insert-menu-btn"
            aria-label="Insert Jira Block"
            aria-haspopup="menu"
            aria-expanded={openMenu === 'insert'}
            title="Insert panels, status, expand, date, divider, layout, Mermaid..."
            onClick={() =>
              setOpenMenu((prev) => (prev === 'insert' ? null : 'insert'))
            }
            className={`min-h-[26px] px-2 py-0.5 rounded-lg border text-[10px] font-semibold flex items-center gap-0.5 transition ${
              openMenu === 'insert'
                ? 'bg-sky-600 border-sky-500 text-white'
                : 'bg-slate-950 border-slate-700/90 text-sky-300 hover:bg-slate-800'
            }`}
          >
            <Plus className="w-3 h-3" />
            <span>Insert</span>
            <ChevronDown className="w-2.5 h-2.5" />
          </button>

          {openMenu === 'insert' && (
            <div
              data-testid="jira-insert-dropdown"
              role="menu"
              className="absolute right-2 top-full mt-1 w-64 max-w-[calc(100%-1rem)] max-h-72 overflow-y-auto rounded-xl bg-slate-900 border border-sky-500/40 shadow-2xl py-1 z-30"
            >
              {JIRA_SLASH_COMMANDS.map((cmd) => (
                <button
                  key={cmd.id}
                  type="button"
                  role="menuitem"
                  data-testid={`jira-insert-item-${cmd.id}`}
                  onClick={() => executeInsertCommand(cmd.id)}
                  className="w-full px-2.5 py-1.5 text-left hover:bg-slate-800 flex items-center justify-between gap-2 transition"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    {cmd.renderIcon()}
                    <span className="text-[11px] font-medium text-slate-100 truncate">
                      {cmd.title}
                    </span>
                  </span>
                  {cmd.shortcut && (
                    <span className="text-[9px] font-mono text-slate-400">
                      {cmd.shortcut}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Inline Widget Contextual Editor Bar (when user clicks a Status, Mention, Date, or Inline Card chip) */}
      {editingWidget && activeWidgetNode && (
        <div
          data-testid="jira-inline-widget-editor-bar"
          className="px-3 py-2 bg-slate-900/95 border-b border-sky-500/30 flex items-center justify-between gap-2 flex-wrap"
        >
          {activeWidgetNode.type === 'status' && (
            <StatusEditorPopover
              initialText={activeWidgetNode.attrs.text}
              initialColor={activeWidgetNode.attrs.color}
              onSave={(text, color: AdfStatusColor) =>
                updateEditedInlineNode({
                  type: 'status',
                  attrs: {
                    ...activeWidgetNode.attrs,
                    text: text.toUpperCase(),
                    color,
                  },
                })
              }
              onRemove={() => updateEditedInlineNode(null)}
              onClose={() => setEditingWidget(null)}
            />
          )}

          {activeWidgetNode.type === 'mention' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const clean = mentionDraft.trim().replace(/^@/, '') || 'user';
                updateEditedInlineNode({
                  type: 'mention',
                  attrs: {
                    id: clean.toLowerCase().replace(/\s+/g, '.'),
                    text: `@${clean}`,
                  },
                });
              }}
              className="flex items-center gap-2 flex-wrap text-xs"
            >
              <span className="text-indigo-300 font-semibold">@Mention:</span>
              <input
                type="text"
                aria-label="Edit Mention Handle"
                value={mentionDraft}
                onChange={(e) => setMentionDraft(e.target.value)}
                autoFocus
                className="px-2 py-0.5 rounded bg-slate-950 border border-slate-700 text-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="submit"
                className="px-2 py-0.5 rounded bg-indigo-600 text-white text-[11px] font-medium"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => updateEditedInlineNode(null)}
                className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[11px]"
              >
                Remove
              </button>
              <button
                type="button"
                aria-label="Close mention editor"
                onClick={() => setEditingWidget(null)}
                className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </form>
          )}

          {activeWidgetNode.type === 'date' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const ms = Date.parse(dateDraft);
                updateEditedInlineNode({
                  type: 'date',
                  attrs: {
                    timestamp: String(
                      Number.isFinite(ms) ? ms : Date.now()
                    ),
                  },
                });
              }}
              className="flex items-center gap-2 flex-wrap text-xs"
            >
              <span className="text-sky-300 font-semibold">📅 Date:</span>
              <input
                type="date"
                aria-label="Edit Jira Date"
                value={dateDraft}
                onChange={(e) => setDateDraft(e.target.value)}
                className="px-2 py-0.5 rounded bg-slate-950 border border-slate-700 text-white text-xs focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
              <button
                type="submit"
                className="px-2 py-0.5 rounded bg-sky-600 text-white text-[11px] font-medium"
              >
                Apply
              </button>
              <button
                type="button"
                onClick={() => updateEditedInlineNode(null)}
                className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[11px]"
              >
                Remove
              </button>
              <button
                type="button"
                aria-label="Close date editor"
                onClick={() => setEditingWidget(null)}
                className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </form>
          )}

          {activeWidgetNode.type === 'inlineCard' && (
            <LinkEditorPopover
              initialText={activeWidgetNode.attrs.url}
              initialUrl={activeWidgetNode.attrs.url}
              initialDisplayMode="inlineCard"
              onApply={({ url, text, displayMode }) => {
                if (!isSafeAdfUrl(url)) return;
                if (displayMode === 'inlineCard') {
                  updateEditedInlineNode({
                    type: 'inlineCard',
                    attrs: { url },
                  });
                } else {
                  updateEditedInlineNode({
                    type: 'text',
                    text: text || url,
                    marks: [{ type: 'link', attrs: { href: url } }],
                  });
                }
              }}
              onClose={() => setEditingWidget(null)}
            />
          )}
        </div>
      )}

      {/* WYSIWYG Jira Document Surface */}
      <div
        data-testid="jira-adf-editor-surface"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            const lastIdx = doc.content.length - 1;
            const lastBlock = doc.content[lastIdx];
            if (lastBlock && lastBlock.type !== 'paragraph') {
              insertBlockAfterTopIndex(
                lastIdx,
                { type: 'paragraph', content: [] },
                `b-${lastIdx + 1}`
              );
            } else {
              const lastReg = registryRef.current.get(`b-${lastIdx}`);
              if (lastReg) {
                const len = getInlineNodesLength(lastReg.getInline());
                lastReg.focusAt(len, len);
              }
            }
          }
        }}
        className="flex-1 overflow-y-auto p-4 space-y-2 cq-note-prose select-text cursor-text"
      >
        {doc.content.map((block, idx) => renderTopLevelBlock(block, idx))}
      </div>
    </div>
  );
});
