import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  FilePlus,
  Trash,
  Check,
  Eraser,
  Undo2,
  Redo2,
  Pin,
  Search,
  Bold,
  Italic,
  Heading2,
  List,
  CheckSquare,
  Code,
  Eye,
  Edit3,
  Columns,
  Tag,
  X,
  GitBranch,
  ChevronDown,
  ChevronUp,
  FolderOpen,
} from 'lucide-react';
import { AccentColor, FlowchartState, NoteItem } from '../../types/sideflow';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import {
  computeDagLayout,
  generateStandaloneSVG,
  parseMermaidCode,
} from '../../utils/mermaid';
import { VoiceBar } from './VoiceBar';

interface NotesViewProps {
  notes: NoteItem[];
  onChangeNotes: (
    updater: NoteItem[] | ((prev: NoteItem[]) => NoteItem[])
  ) => void;
  isPanelOpen?: boolean;
  isActiveTab?: boolean;
  onDictatingChange?: (isDictating: boolean) => void;
  onNotify: (title: string, icon?: string, subtitle?: string) => void;
  onOpenMermaidInFlow?: (flowState: FlowchartState) => void;
}

type EditorViewMode = 'edit' | 'split' | 'preview';

interface NoteHistoryEntry {
  past: string[];
  future: string[];
}

const ACCENT_COLORS: { id: AccentColor; dotClass: string; activeTabClass: string }[] = [
  { id: 'indigo', dotClass: 'bg-indigo-400', activeTabClass: 'bg-indigo-600 text-white' },
  { id: 'cyan', dotClass: 'bg-cyan-400', activeTabClass: 'bg-cyan-600 text-white' },
  { id: 'emerald', dotClass: 'bg-emerald-400', activeTabClass: 'bg-emerald-600 text-white' },
  { id: 'amber', dotClass: 'bg-amber-400', activeTabClass: 'bg-amber-600 text-white' },
  { id: 'rose', dotClass: 'bg-rose-400', activeTabClass: 'bg-rose-600 text-white' },
  { id: 'purple', dotClass: 'bg-purple-400', activeTabClass: 'bg-purple-600 text-white' },
];

export const NotesView: React.FC<NotesViewProps> = ({
  notes,
  onChangeNotes,
  isPanelOpen = true,
  isActiveTab = true,
  onDictatingChange,
  onNotify,
  onOpenMermaidInFlow,
}) => {
  const [activeNoteId, setActiveNoteId] = useLocalStorage<string>(
    'sideflow_active_note_id',
    notes[0]?.id || 'note-1'
  );
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useLocalStorage<EditorViewMode>(
    'sideflow_notes_view_mode',
    'edit'
  );
  const [isNoteSwitcherOpen, setIsNoteSwitcherOpen] = useState<boolean>(false);
  const [newTagText, setNewTagText] = useState<string>('');
  const [showTagInput, setShowTagInput] = useState<boolean>(false);
  const [, setHistoryTick] = useState<number>(0);

  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  // Tracks the exact collapsed insertion index where text was last added or cursor was placed per note ID.
  // Never stores a destructive range so Timestamp / Voice Dictation never deletes selected text.
  const lastInsertPosMapRef = useRef<Record<string, number>>({});
  // Per-note undo/redo history stacks
  const historyMapRef = useRef<Record<string, NoteHistoryEntry>>({});

  useEffect(() => {
    if (notes.length > 0 && !notes.some((n) => n.id === activeNoteId)) {
      setActiveNoteId(notes[0].id);
    }
  }, [notes, activeNoteId, setActiveNoteId]);

  const currentNote =
    notes.find((n) => n.id === activeNoteId) || notes[0] || {
      id: 'note-1',
      title: 'Untitled',
      body: '',
    };

  const getNoteHistory = (noteId: string): NoteHistoryEntry => {
    if (!historyMapRef.current[noteId]) {
      historyMapRef.current[noteId] = { past: [], future: [] };
    }
    return historyMapRef.current[noteId];
  };

  const recordBodyChange = (
    noteId: string,
    previousBody: string,
    nextBody: string,
    triggerRender = true
  ) => {
    if (previousBody === nextBody) return;
    const hist = getNoteHistory(noteId);
    const lastPast = hist.past[hist.past.length - 1];
    if (lastPast !== previousBody) {
      hist.past = [...hist.past.slice(-39), previousBody];
    }
    hist.future = [];
    if (triggerRender) {
      setHistoryTick((t) => t + 1);
    }
  };

  const handleUpdateCurrentNote = (
    patch: Partial<NoteItem>,
    recordUndo = true
  ) => {
    if (typeof patch.body === 'string' && recordUndo) {
      recordBodyChange(currentNote.id, currentNote.body, patch.body, true);
    }
    onChangeNotes((prev) =>
      prev.map((n) =>
        n.id === currentNote.id
          ? { ...n, ...patch, updatedAt: Date.now() }
          : n
      )
    );
  };

  const handleUndo = () => {
    const hist = getNoteHistory(currentNote.id);
    if (hist.past.length === 0) return;
    const previous = hist.past[hist.past.length - 1];
    hist.past = hist.past.slice(0, -1);
    hist.future = [currentNote.body, ...hist.future.slice(0, 39)];
    setHistoryTick((t) => t + 1);
    lastInsertPosMapRef.current[currentNote.id] = previous.length;
    handleUpdateCurrentNote({ body: previous }, false);
  };

  const handleRedo = () => {
    const hist = getNoteHistory(currentNote.id);
    if (hist.future.length === 0) return;
    const next = hist.future[0];
    hist.future = hist.future.slice(1);
    hist.past = [...hist.past.slice(-39), currentNote.body];
    setHistoryTick((t) => t + 1);
    lastInsertPosMapRef.current[currentNote.id] = next.length;
    handleUpdateCurrentNote({ body: next }, false);
  };

  const syncEditorCursor = () => {
    const el = editorRef.current;
    if (!el) return;
    const selStart = el.selectionStart ?? el.value.length;
    const selEnd = el.selectionEnd ?? el.value.length;
    // Only update the insertion position when the caret is collapsed (or use selEnd),
    // and never overwrite text between selStart and selEnd when inserting timestamps/dictation.
    if (selStart === selEnd) {
      lastInsertPosMapRef.current[currentNote.id] = selEnd;
    } else if (typeof lastInsertPosMapRef.current[currentNote.id] !== 'number') {
      lastInsertPosMapRef.current[currentNote.id] = selEnd;
    }
  };

  /**
   * Non-destructively inserts text at the position where text was last added/edited
   * (or end of note if no position was recorded). NEVER deletes or replaces existing note text.
   */
  const insertAtCursor = (
    snippet: string,
    options?: { padSpace?: boolean; ensureNewlineBefore?: boolean }
  ) => {
    const noteId = currentNote.id;
    const el = editorRef.current;

    // If the editor currently has focus and a collapsed caret, honor that caret position
    if (
      el &&
      document.activeElement === el &&
      typeof el.selectionStart === 'number' &&
      el.selectionStart === el.selectionEnd
    ) {
      lastInsertPosMapRef.current[noteId] = el.selectionStart;
    }

    let computedNextPos = 0;

    onChangeNotes((prev) =>
      prev.map((n) => {
        if (n.id !== noteId) return n;
        const body = n.body || '';
        const savedPos = lastInsertPosMapRef.current[noteId];
        const insertPos =
          typeof savedPos === 'number'
            ? Math.max(0, Math.min(savedPos, body.length))
            : body.length;

        const before = body.slice(0, insertPos);
        const after = body.slice(insertPos);

        let prefix = '';
        if (options?.ensureNewlineBefore) {
          if (before.length > 0 && !before.endsWith('\n') && !before.endsWith(' ')) {
            prefix = ' ';
          }
        } else if (options?.padSpace) {
          const needsLeadingSpace =
            before.length > 0 &&
            !before.endsWith(' ') &&
            !before.endsWith('\n') &&
            !snippet.startsWith('\n') &&
            !snippet.startsWith(' ');
          if (needsLeadingSpace) {
            prefix = ' ';
          }
        }

        let suffix = '';
        if (
          options?.padSpace &&
          after.length > 0 &&
          !after.startsWith(' ') &&
          !after.startsWith('\n') &&
          !snippet.endsWith(' ') &&
          !snippet.endsWith('\n')
        ) {
          suffix = ' ';
        }

        const inserted = `${prefix}${snippet}${suffix}`;
        const nextBody = `${before}${inserted}${after}`;
        computedNextPos = before.length + inserted.length;

        recordBodyChange(noteId, body, nextBody, false);
        lastInsertPosMapRef.current[noteId] = computedNextPos;

        return {
          ...n,
          body: nextBody,
          updatedAt: Date.now(),
        };
      })
    );

    setHistoryTick((t) => t + 1);

    requestAnimationFrame(() => {
      if (editorRef.current && document.activeElement === editorRef.current) {
        editorRef.current.setSelectionRange(computedNextPos, computedNextPos);
      }
    });
  };

  const handleVoiceTranscript = (transcript: string) => {
    insertAtCursor(transcript, { padSpace: true });
  };

  const handleInsertTimestamp = () => {
    const stamp = `[${new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })}] `;
    insertAtCursor(stamp, { ensureNewlineBefore: true });
  };

  const handleFormatMarkdown = (
    kind:
      | 'bold'
      | 'italic'
      | 'heading'
      | 'bullet'
      | 'task'
      | 'code'
      | 'mermaid'
  ) => {
    const el = editorRef.current;
    const body = currentNote.body;
    const start = el ? el.selectionStart ?? body.length : body.length;
    const end = el ? el.selectionEnd ?? body.length : body.length;
    const selected = body.slice(start, end);

    let replacement = '';
    let cursorOffset = 0;

    switch (kind) {
      case 'bold':
        replacement = `**${selected || 'bold text'}**`;
        cursorOffset = replacement.length;
        break;
      case 'italic':
        replacement = `*${selected || 'italic text'}*`;
        cursorOffset = replacement.length;
        break;
      case 'heading': {
        const needsNewline = start > 0 && body[start - 1] !== '\n';
        replacement = `${needsNewline ? '\n' : ''}### ${selected || 'Section Heading'}`;
        cursorOffset = replacement.length;
        break;
      }
      case 'bullet': {
        const needsNewline = start > 0 && body[start - 1] !== '\n';
        replacement = `${needsNewline ? '\n' : ''}- ${selected || 'List item'}`;
        cursorOffset = replacement.length;
        break;
      }
      case 'task': {
        const needsNewline = start > 0 && body[start - 1] !== '\n';
        replacement = `${needsNewline ? '\n' : ''}- [ ] ${selected || 'Action item'}`;
        cursorOffset = replacement.length;
        break;
      }
      case 'code':
        replacement = `\`${selected || 'code'}\``;
        cursorOffset = replacement.length;
        break;
      case 'mermaid': {
        const needsNewline = start > 0 && body[start - 1] !== '\n';
        const mermaidSnippet =
          selected.trim() ||
          [
            'flowchart LR',
            '    A(["Start"]) --> B{"Check"}',
            '    B -->|Pass| C["Done"]',
          ].join('\n');
        replacement = `${needsNewline ? '\n' : ''}\`\`\`mermaid\n${mermaidSnippet}\n\`\`\`\n`;
        cursorOffset = replacement.length;
        break;
      }
    }

    const nextBody = `${body.slice(0, start)}${replacement}${body.slice(end)}`;
    handleUpdateCurrentNote({ body: nextBody }, true);
    const nextPos = start + cursorOffset;
    lastInsertPosMapRef.current[currentNote.id] = nextPos;

    requestAnimationFrame(() => {
      if (editorRef.current) {
        editorRef.current.focus();
        editorRef.current.setSelectionRange(nextPos, nextPos);
      }
    });
  };

  const handleToggleChecklistLine = (lineIndex: number) => {
    const lines = currentNote.body.split('\n');
    const line = lines[lineIndex];
    if (typeof line !== 'string') return;

    if (/^\s*[-*]\s+\[\s\]/.test(line)) {
      lines[lineIndex] = line.replace(/^(\s*[-*]\s+)\[\s\]/, '$1[x]');
    } else if (/^\s*[-*]\s+\[[xX]\]/.test(line)) {
      lines[lineIndex] = line.replace(/^(\s*[-*]\s+)\[[xX]\]/, '$1[ ]');
    } else {
      return;
    }

    handleUpdateCurrentNote({ body: lines.join('\n') }, true);
  };

  const handleCreateNewNote = () => {
    const newNote: NoteItem = {
      id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: `Quick Note ${notes.length + 1}`,
      body: '',
      updatedAt: Date.now(),
      color: 'indigo',
      pinned: false,
      tags: [],
    };
    onChangeNotes((prev) => [...prev, newNote]);
    setActiveNoteId(newNote.id);
    setSearchQuery('');
  };

  const handleDeleteCurrentNote = () => {
    if (notes.length <= 1) return;
    const deletedTitle = currentNote.title || 'Untitled';
    const remaining = notes.filter((n) => n.id !== currentNote.id);
    onChangeNotes(remaining);
    if (remaining[0]) {
      setActiveNoteId(remaining[0].id);
    }
    onNotify(`Deleted "${deletedTitle}"`, 'check', 'Note removed from scratchpad');
  };

  const handleClearCurrentNote = () => {
    if (!currentNote.body) return;
    handleUpdateCurrentNote({ body: '' }, true);
    lastInsertPosMapRef.current[currentNote.id] = 0;
    onNotify('Cleared Note Content', 'check', currentNote.title || 'Untitled');
  };

  const handleTogglePinCurrentNote = () => {
    const nextPinned = !currentNote.pinned;
    handleUpdateCurrentNote({ pinned: nextPinned }, false);
    onNotify(
      nextPinned ? 'Pinned Note' : 'Unpinned Note',
      'check',
      currentNote.title || 'Untitled'
    );
  };

  const handleTogglePinNoteById = (noteId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const target = notes.find((n) => n.id === noteId);
    if (!target) return;
    const nextPinned = !target.pinned;
    onChangeNotes((prev) =>
      prev.map((n) =>
        n.id === noteId ? { ...n, pinned: nextPinned, updatedAt: Date.now() } : n
      )
    );
    onNotify(
      nextPinned ? 'Pinned Note' : 'Unpinned Note',
      'check',
      target.title || 'Untitled'
    );
  };

  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newTagText.trim().replace(/^#/, '');
    if (!cleaned) return;
    const existing = currentNote.tags || [];
    if (!existing.includes(cleaned)) {
      handleUpdateCurrentNote({ tags: [...existing, cleaned] }, false);
    }
    setNewTagText('');
    setShowTagInput(false);
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const existing = currentNote.tags || [];
    handleUpdateCurrentNote(
      { tags: existing.filter((t) => t !== tagToRemove) },
      false
    );
  };

  const handleCopyNoteContent = async () => {
    const text = currentNote.body;
    if (!text.trim()) {
      onNotify('Note is Empty', 'file-text', 'Add content before copying');
      return;
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const editor = document.getElementById(
          'note-body-input'
        ) as HTMLTextAreaElement | null;
        const prevPos =
          lastInsertPosMapRef.current[currentNote.id] ?? text.length;
        editor?.select();
        document.execCommand('copy');
        editor?.setSelectionRange(prevPos, prevPos);
      }
    } catch {
      // Fallback
    }
    const preview = text.length > 40 ? `${text.slice(0, 40)}...` : text;
    onNotify('Note Copied to Clipboard', 'check', preview);
  };

  const handleExportNote = () => {
    const slug =
      (currentNote.title || 'sideflow-note')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'sideflow-note';
    const filename = `${slug}.md`;
    const markdown = `# ${currentNote.title || 'Untitled Note'}\n\n${currentNote.body}\n`;
    try {
      const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      onNotify('Exported Note Markdown', 'check', `Saved as ${filename}`);
    } catch {
      // ignore
    }
  };

  // Sort pinned notes first and filter by search query
  const sortedAndFilteredNotes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = q
      ? notes.filter(
          (n) =>
            (n.title || '').toLowerCase().includes(q) ||
            (n.body || '').toLowerCase().includes(q) ||
            (n.tags || []).some((t) => t.toLowerCase().includes(q))
        )
      : notes;

    return [...filtered].sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) {
        return a.pinned ? -1 : 1;
      }
      return 0;
    });
  }, [notes, searchQuery]);

  // Calculate word/char counts and task checklist progress
  const wordsCount = currentNote.body.trim()
    ? currentNote.body.trim().split(/\s+/).length
    : 0;
  const charsCount = currentNote.body.length;
  const formattedUpdatedTime = currentNote.updatedAt
    ? new Date(currentNote.updatedAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  const taskStats = useMemo(() => {
    const lines = currentNote.body.split('\n');
    let total = 0;
    let completed = 0;
    for (const line of lines) {
      if (/^\s*[-*]\s+\[\s\]/.test(line)) {
        total += 1;
      } else if (/^\s*[-*]\s+\[[xX]\]/.test(line)) {
        total += 1;
        completed += 1;
      }
    }
    return { total, completed };
  }, [currentNote.body]);

  const currentHistory = getNoteHistory(currentNote.id);
  const canUndo = currentHistory.past.length > 0;
  const canRedo = currentHistory.future.length > 0;

  /**
   * Renders inline Markdown tokens (**bold**, *italic*, `code`, ~~strikethrough~~,
   * [links](url), and [HH:MM] timestamp badges) into styled React elements.
   */
  const renderInlineMarkdown = (
    text: string,
    keyPrefix: string
  ): React.ReactNode => {
    if (!text) return null;
    const tokenRegex =
      /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|\*[^*\n]+\*|_[^_\n]+_|\[[^\]]+\]\([^)]+\)|\[\d{1,2}:\d{2}(?::\d{2})?(?:\s*[APap][Mm])?\])/g;
    const parts = text.split(tokenRegex);

    return parts.map((part, i) => {
      if (!part) return null;
      const key = `${keyPrefix}-inl-${i}`;

      if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
        return (
          <code
            key={key}
            className="px-1.5 py-0.5 rounded bg-slate-800/90 border border-slate-700 text-amber-300 font-mono text-[11px]"
          >
            {part.slice(1, -1)}
          </code>
        );
      }

      if (
        ((part.startsWith('**') && part.endsWith('**')) ||
          (part.startsWith('__') && part.endsWith('__'))) &&
        part.length > 4
      ) {
        return (
          <strong key={key} className="font-bold text-white">
            {part.slice(2, -2)}
          </strong>
        );
      }

      if (part.startsWith('~~') && part.endsWith('~~') && part.length > 4) {
        return (
          <span key={key} className="line-through text-slate-500">
            {part.slice(2, -2)}
          </span>
        );
      }

      if (
        ((part.startsWith('*') && part.endsWith('*')) ||
          (part.startsWith('_') && part.endsWith('_'))) &&
        part.length > 2
      ) {
        return (
          <em key={key} className="italic text-indigo-200">
            {part.slice(1, -1)}
          </em>
        );
      }

      const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        return (
          <a
            key={key}
            href={linkMatch[2]}
            target="_blank"
            rel="noreferrer"
            className="text-cyan-400 underline decoration-cyan-500/50 hover:text-cyan-300"
          >
            {linkMatch[1]}
          </a>
        );
      }

      if (/^\[\d{1,2}:\d{2}(?::\d{2})?(?:\s*[APap][Mm])?\]$/.test(part)) {
        return (
          <span
            key={key}
            data-testid="note-timestamp-badge"
            className="inline-flex items-center px-1.5 py-0.5 mr-1 rounded-md bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 font-mono text-[10px] font-semibold"
          >
            {part}
          </span>
        );
      }

      return <React.Fragment key={key}>{part}</React.Fragment>;
    });
  };

  const renderMarkdownPreview = () => {
    const lines = currentNote.body.split('\n');
    if (!currentNote.body.trim()) {
      return (
        <p className="text-xs text-slate-500 italic">
          Nothing to preview yet. Switch to Edit or dictate with the microphone above.
        </p>
      );
    }

    const elements: React.ReactNode[] = [];
    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];

      // Detect fenced ```mermaid ... ``` blocks
      if (/^\s*```mermaid\s*$/i.test(line)) {
        const blockLines: string[] = [];
        const startIdx = idx;
        idx += 1;
        while (idx < lines.length && !/^\s*```\s*$/.test(lines[idx])) {
          blockLines.push(lines[idx]);
          idx += 1;
        }
        const rawMermaid = blockLines.join('\n');
        const parsed = parseMermaidCode(rawMermaid);
        const laidOut: FlowchartState | null = parsed
          ? { ...parsed, nodes: computeDagLayout(parsed) }
          : null;
        const svgMarkup = laidOut
          ? generateStandaloneSVG(laidOut).replace(
              /^<\?xml[^>]*>\s*/i,
              ''
            )
          : null;

        elements.push(
          <div
            key={`mermaid-block-${startIdx}`}
            data-testid="note-mermaid-diagram"
            className="my-2 rounded-xl border border-indigo-500/30 bg-slate-950/90 overflow-hidden shadow-lg"
          >
            <div className="px-3 py-1.5 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between gap-2 text-[10px]">
              <span className="font-mono text-emerald-300 flex items-center gap-1.5">
                <GitBranch className="w-3 h-3 text-indigo-400" aria-hidden="true" />
                Mermaid Diagram ({laidOut?.diagramType || 'flowchart'})
              </span>
              {laidOut && onOpenMermaidInFlow && (
                <button
                  type="button"
                  aria-label="Open Mermaid block in Flow tab"
                  onClick={() => onOpenMermaidInFlow(laidOut)}
                  className="px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition"
                >
                  Edit in Flow
                </button>
              )}
            </div>
            {svgMarkup ? (
              <div
                className="p-2 overflow-x-auto [&_svg]:w-full [&_svg]:h-auto [&_svg]:max-h-56"
                dangerouslySetInnerHTML={{ __html: svgMarkup }}
              />
            ) : (
              <pre className="p-3 text-[11px] font-mono text-amber-300 overflow-x-auto">
                {rawMermaid}
              </pre>
            )}
          </div>
        );
        continue;
      }

      // Detect general fenced code blocks ```lang ... ```
      const codeFenceMatch = line.match(/^\s*```([a-zA-Z0-9_-]*)\s*$/);
      if (codeFenceMatch) {
        const langLabel = codeFenceMatch[1] || 'code';
        const codeLines: string[] = [];
        const startIdx = idx;
        idx += 1;
        while (idx < lines.length && !/^\s*```\s*$/.test(lines[idx])) {
          codeLines.push(lines[idx]);
          idx += 1;
        }
        elements.push(
          <div
            key={`code-block-${startIdx}`}
            className="my-2 rounded-xl border border-slate-800 bg-slate-950/95 overflow-hidden"
          >
            <div className="px-3 py-1 bg-slate-900/90 border-b border-slate-800 text-[10px] font-mono text-slate-400 uppercase">
              {langLabel}
            </div>
            <pre className="p-3 text-[11px] font-mono text-emerald-300 overflow-x-auto leading-relaxed">
              {codeLines.join('\n')}
            </pre>
          </div>
        );
        continue;
      }

      // Horizontal rule
      if (/^\s*([-*_]){3,}\s*$/.test(line)) {
        elements.push(<hr key={idx} className="border-slate-800 my-2" />);
        continue;
      }

      const uncheckedMatch = line.match(/^\s*[-*]\s+\[\s\]\s*(.*)$/);
      const checkedMatch = line.match(/^\s*[-*]\s+\[[xX]\]\s*(.*)$/);

      if (uncheckedMatch || checkedMatch) {
        const isChecked = Boolean(checkedMatch);
        const labelText = (uncheckedMatch?.[1] ?? checkedMatch?.[1] ?? '').trim();
        elements.push(
          <label
            key={idx}
            className="flex items-start gap-2 py-0.5 cursor-pointer group"
          >
            <input
              type="checkbox"
              checked={isChecked}
              onChange={() => handleToggleChecklistLine(idx)}
              aria-label={`Task: ${labelText || `Item ${idx + 1}`}`}
              className="mt-1 w-3.5 h-3.5 rounded accent-indigo-500 cursor-pointer shrink-0"
            />
            <span
              className={
                isChecked
                  ? 'line-through text-slate-500 transition'
                  : 'text-slate-200 group-hover:text-white transition'
              }
            >
              {renderInlineMarkdown(labelText, `task-${idx}`)}
            </span>
          </label>
        );
        continue;
      }

      if (line.startsWith('### ')) {
        elements.push(
          <h3
            key={idx}
            className="text-sm font-bold text-indigo-300 pt-1.5 border-b border-slate-800/60 pb-0.5"
          >
            {renderInlineMarkdown(line.slice(4), `h3-${idx}`)}
          </h3>
        );
        continue;
      }
      if (line.startsWith('## ')) {
        elements.push(
          <h2
            key={idx}
            className="text-base font-bold text-white pt-2 border-b border-slate-800 pb-1"
          >
            {renderInlineMarkdown(line.slice(3), `h2-${idx}`)}
          </h2>
        );
        continue;
      }
      if (line.startsWith('# ')) {
        elements.push(
          <h1
            key={idx}
            className="text-lg font-bold text-white pt-2 border-b border-indigo-500/30 pb-1"
          >
            {renderInlineMarkdown(line.slice(2), `h1-${idx}`)}
          </h1>
        );
        continue;
      }

      // Blockquote (> quote)
      if (/^\s*>\s?(.*)$/.test(line)) {
        const quoteText = line.replace(/^\s*>\s?/, '');
        elements.push(
          <blockquote
            key={idx}
            className="border-l-2 border-indigo-400 bg-indigo-500/10 pl-3 py-1 my-1 rounded-r-lg text-slate-300 italic"
          >
            {renderInlineMarkdown(quoteText, `quote-${idx}`)}
          </blockquote>
        );
        continue;
      }

      // Numbered list (1. item)
      const numberedMatch = line.match(/^\s*(\d+)\.\s+(.*)$/);
      if (numberedMatch) {
        elements.push(
          <div key={idx} className="flex items-start gap-2 pl-1">
            <span className="text-indigo-400 font-mono font-bold text-[11px] mt-0.5 shrink-0">
              {numberedMatch[1]}.
            </span>
            <span>{renderInlineMarkdown(numberedMatch[2], `ol-${idx}`)}</span>
          </div>
        );
        continue;
      }

      if (/^\s*[-•*]\s+/.test(line)) {
        const itemText = line.replace(/^\s*[-•*]\s+/, '');
        elements.push(
          <div key={idx} className="flex items-start gap-2 pl-1">
            <span className="text-indigo-400 font-bold">•</span>
            <span>{renderInlineMarkdown(itemText, `ul-${idx}`)}</span>
          </div>
        );
        continue;
      }
      if (!line.trim()) {
        elements.push(<div key={idx} className="h-2" />);
        continue;
      }
      elements.push(
        <p key={idx} className="whitespace-pre-wrap leading-relaxed">
          {renderInlineMarkdown(line, `p-${idx}`)}
        </p>
      );
    }

    return (
      <div className="space-y-1.5 text-xs sm:text-sm text-slate-200 leading-relaxed select-text">
        {elements}
      </div>
    );
  };

  return (
    <section
      id="tab-notes"
      hidden={!isActiveTab}
      aria-hidden={!isActiveTab}
      aria-label="Voice-Dictated & Quick Notes"
      className={
        isActiveTab
          ? 'tab-content flex-1 flex flex-col overflow-hidden p-4 gap-2.5'
          : 'hidden'
      }
    >
      {/* Top Notes Bar + On-Demand Expandable Note Switcher + Search Filter */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div
            id="notes-tabs-container"
            onWheel={(e) => {
              if (e.deltaY !== 0) {
                e.currentTarget.scrollLeft += e.deltaY;
              }
            }}
            className="flex items-center gap-1.5 overflow-x-auto pb-1"
          >
            {sortedAndFilteredNotes.map((n) => {
              const accent =
                ACCENT_COLORS.find((c) => c.id === n.color) || ACCENT_COLORS[0];
              const isActive = n.id === currentNote.id;
              return (
                <button
                  key={n.id}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setActiveNoteId(n.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition flex items-center gap-1.5 shrink-0 max-w-[160px] ${
                    isActive
                      ? accent.activeTabClass
                      : 'bg-slate-900 text-slate-400 hover:text-white'
                  }`}
                >
                  {n.pinned && (
                    <Pin
                      className="w-3 h-3 shrink-0 fill-current"
                      aria-label="Pinned"
                    />
                  )}
                  {!isActive && n.color && (
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${accent.dotClass}`}
                    />
                  )}
                  <span className="truncate">{n.title || 'Untitled'}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* On-Demand Expandable Note Switcher Button */}
            <button
              type="button"
              data-testid="toggle-note-switcher-btn"
              aria-label="Toggle Expandable Note Switcher"
              aria-expanded={isNoteSwitcherOpen}
              title="Expand Note Selection Drawer to browse and switch notes"
              onClick={() => setIsNoteSwitcherOpen((prev) => !prev)}
              className={`px-2 py-1.5 rounded-xl border text-[11px] font-medium flex items-center gap-1 transition shrink-0 ${
                isNoteSwitcherOpen
                  ? 'bg-indigo-600/25 border-indigo-500/60 text-indigo-200'
                  : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300'
              }`}
            >
              <FolderOpen className="w-3.5 h-3.5 text-indigo-400" aria-hidden="true" />
              <span>Notes ({notes.length})</span>
              {isNoteSwitcherOpen ? (
                <ChevronUp className="w-3 h-3" aria-hidden="true" />
              ) : (
                <ChevronDown className="w-3 h-3" aria-hidden="true" />
              )}
            </button>

            <div className="relative">
              <Search
                className="w-3 h-3 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="text"
                aria-label="Search notes"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                className="w-24 sm:w-28 pl-7 pr-2 py-1 rounded-xl bg-slate-900 border border-slate-800 text-[11px] text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <button
              type="button"
              onClick={handleCreateNewNote}
              className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-slate-200 flex items-center gap-1 shrink-0"
            >
              <FilePlus
                className="w-3.5 h-3.5 text-indigo-400"
                aria-hidden="true"
              />{' '}
              New Note
            </button>
          </div>
        </div>

        {/* Expandable Note Selection Drawer (On Demand) */}
        {isNoteSwitcherOpen && (
          <div
            data-testid="expandable-note-switcher"
            role="region"
            aria-label="Expanded Note Selection Drawer"
            className="bg-slate-950/90 border border-indigo-500/30 rounded-2xl p-2.5 shadow-xl max-h-56 overflow-y-auto flex flex-col gap-2"
          >
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] font-semibold text-indigo-300 flex items-center gap-1.5">
                <FolderOpen className="w-3.5 h-3.5 text-indigo-400" aria-hidden="true" />
                All Notes ({sortedAndFilteredNotes.length} of {notes.length}) — Click a card to switch active note
              </span>
              <button
                type="button"
                aria-label="Collapse Note Switcher"
                onClick={() => setIsNoteSwitcherOpen(false)}
                className="text-[10px] text-slate-400 hover:text-white px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800"
              >
                Collapse
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {sortedAndFilteredNotes.map((n) => {
                const accent =
                  ACCENT_COLORS.find((c) => c.id === n.color) || ACCENT_COLORS[0];
                const isActive = n.id === currentNote.id;
                const noteWords = (n.body || '').trim()
                  ? (n.body || '').trim().split(/\s+/).length
                  : 0;
                const snippet =
                  (n.body || '').trim().replace(/\s+/g, ' ').slice(0, 90) ||
                  'Empty note — click to start typing or dictating...';

                return (
                  <div
                    key={`switcher-card-${n.id}`}
                    data-testid={`note-switcher-card-${n.id}`}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isActive}
                    onClick={() => {
                      setActiveNoteId(n.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setActiveNoteId(n.id);
                      }
                    }}
                    className={`text-left p-2.5 rounded-xl border transition cursor-pointer flex flex-col justify-between gap-1.5 ${
                      isActive
                        ? 'bg-indigo-600/20 border-indigo-500/60 ring-1 ring-indigo-500/40'
                        : 'bg-slate-900/80 hover:bg-slate-900 border-slate-800/90'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${accent.dotClass}`}
                        />
                        <span className="text-xs font-semibold text-white truncate">
                          {n.title || 'Untitled'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          aria-label={`${n.pinned ? 'Unpin' : 'Pin'} ${n.title || 'Untitled'}`}
                          onClick={(e) => handleTogglePinNoteById(n.id, e)}
                          className={`p-1 rounded hover:bg-slate-800 transition ${
                            n.pinned ? 'text-indigo-400' : 'text-slate-500 hover:text-slate-300'
                          }`}
                        >
                          <Pin className="w-3 h-3" aria-hidden="true" />
                        </button>
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-400 line-clamp-2 leading-snug">
                      {snippet}
                    </p>

                    <div className="flex items-center justify-between text-[10px] text-slate-500 pt-0.5 border-t border-slate-800/60">
                      <span>{noteWords} words</span>
                      {(n.tags || []).length > 0 && (
                        <span className="text-indigo-300 truncate max-w-[110px]">
                          {(n.tags || []).map((t) => `#${t}`).join(' ')}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Voice Dictation Bar */}
      <VoiceBar
        onTranscript={handleVoiceTranscript}
        onInsertTimestamp={handleInsertTimestamp}
        onCopyNote={handleCopyNoteContent}
        onExportNote={handleExportNote}
        isPanelOpen={isPanelOpen}
        onDictatingChange={onDictatingChange}
        promptContext={currentNote.body.slice(-240)}
        onNotify={onNotify}
      />

      {/* Note Title, Organization Tags & Markdown Editor */}
      <div className="flex-1 flex flex-col bg-slate-950/60 border border-slate-800/90 rounded-2xl overflow-hidden">
        {/* Note Header: Title + Pin + Color Accent + Undo/Redo + Clear/Delete */}
        <div className="px-4 py-2 border-b border-slate-800/80 flex items-center justify-between gap-2">
          <input
            id="note-title-input"
            type="text"
            aria-label="Note Title"
            value={currentNote.title}
            onChange={(e) =>
              handleUpdateCurrentNote({ title: e.target.value }, false)
            }
            placeholder="Note Title..."
            className="bg-transparent text-sm font-semibold text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 rounded px-1 -mx-1 w-full"
          />

          <div className="flex items-center gap-1 shrink-0">
            {/* Color Accent Dots */}
            <div
              className="hidden sm:flex items-center gap-1 mr-1 px-1.5 py-1 rounded-lg bg-slate-900/80 border border-slate-800"
              role="group"
              aria-label="Note Color Tag"
            >
              {ACCENT_COLORS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-label={`Set note color ${c.id}`}
                  aria-pressed={(currentNote.color || 'indigo') === c.id}
                  onClick={() => handleUpdateCurrentNote({ color: c.id }, false)}
                  className={`w-2.5 h-2.5 rounded-full transition ${c.dotClass} ${
                    (currentNote.color || 'indigo') === c.id
                      ? 'ring-2 ring-white scale-110'
                      : 'opacity-50 hover:opacity-100'
                  }`}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={handleTogglePinCurrentNote}
              aria-label={currentNote.pinned ? 'Unpin Note' : 'Pin Note'}
              aria-pressed={Boolean(currentNote.pinned)}
              title={currentNote.pinned ? 'Unpin Note' : 'Pin Note to Front'}
              className={`p-1 rounded transition ${
                currentNote.pinned
                  ? 'text-indigo-400 bg-indigo-500/15'
                  : 'text-slate-400 hover:text-indigo-300'
              }`}
            >
              <Pin className="w-3.5 h-3.5" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={handleUndo}
              disabled={!canUndo}
              aria-label="Undo Note Edit"
              title="Undo (Ctrl+Z)"
              className="text-slate-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none p-1 transition"
            >
              <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={handleRedo}
              disabled={!canRedo}
              aria-label="Redo Note Edit"
              title="Redo (Ctrl+Y)"
              className="text-slate-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none p-1 transition"
            >
              <Redo2 className="w-3.5 h-3.5" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={handleClearCurrentNote}
              aria-label="Clear Note Text"
              title="Clear Note Text"
              disabled={!currentNote.body}
              className="text-slate-400 hover:text-amber-300 disabled:opacity-30 disabled:pointer-events-none p-1 transition"
            >
              <Eraser className="w-3.5 h-3.5" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={handleDeleteCurrentNote}
              aria-label="Delete Note"
              title={
                notes.length <= 1
                  ? 'Cannot delete the last remaining note'
                  : 'Delete Note'
              }
              disabled={notes.length <= 1}
              className="text-slate-400 hover:text-rose-400 disabled:opacity-40 disabled:pointer-events-none p-1 transition"
            >
              <Trash className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Markdown Formatting Toolbar + Tags + View Mode Switcher */}
        <div className="px-3 py-1.5 bg-slate-900/50 border-b border-slate-800/70 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => handleFormatMarkdown('bold')}
              aria-label="Format Bold"
              title="Bold (**text**)"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <Bold className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => handleFormatMarkdown('italic')}
              aria-label="Format Italic"
              title="Italic (*text*)"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <Italic className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => handleFormatMarkdown('heading')}
              aria-label="Format Heading"
              title="Heading (###)"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <Heading2 className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => handleFormatMarkdown('bullet')}
              aria-label="Insert Bullet List"
              title="Bullet List (- item)"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <List className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => handleFormatMarkdown('task')}
              aria-label="Insert Task Checkbox"
              title="Task Checklist (- [ ] item)"
              className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-300 hover:bg-slate-800 transition"
            >
              <CheckSquare className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => handleFormatMarkdown('code')}
              aria-label="Format Inline Code"
              title="Inline Code (`code`)"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <Code className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => handleFormatMarkdown('mermaid')}
              aria-label="Insert Mermaid Diagram"
              title="Insert Mermaid Diagram Block (```mermaid)"
              className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-300 hover:bg-slate-800 transition"
            >
              <GitBranch className="w-3.5 h-3.5" aria-hidden="true" />
            </button>

            <div className="h-3.5 w-px bg-slate-800 mx-1" />

            {/* Tags Pills & Add Tag */}
            <div className="flex items-center gap-1 flex-wrap">
              {(currentNote.tags || []).map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 text-[10px]"
                >
                  #{tag}
                  <button
                    type="button"
                    aria-label={`Remove tag ${tag}`}
                    onClick={() => handleRemoveTag(tag)}
                    className="hover:text-white"
                  >
                    <X className="w-2.5 h-2.5" aria-hidden="true" />
                  </button>
                </span>
              ))}
              {showTagInput ? (
                <form onSubmit={handleAddTag} className="inline-flex items-center">
                  <input
                    type="text"
                    aria-label="New Note Tag"
                    value={newTagText}
                    onChange={(e) => setNewTagText(e.target.value)}
                    onBlur={() => setShowTagInput(false)}
                    placeholder="tag..."
                    autoFocus
                    className="w-16 px-1.5 py-0.5 rounded bg-slate-900 border border-indigo-500/50 text-[10px] text-white focus:outline-none"
                  />
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowTagInput(true)}
                  aria-label="Add Tag"
                  title="Add Category Tag"
                  className="px-1.5 py-0.5 rounded-md text-[10px] text-slate-400 hover:text-slate-200 hover:bg-slate-800 flex items-center gap-0.5"
                >
                  <Tag className="w-2.5 h-2.5" aria-hidden="true" /> Tag
                </button>
              )}
            </div>
          </div>

          {/* Edit / Split / Preview Switcher */}
          <div
            className="flex items-center bg-slate-950 rounded-lg p-0.5 border border-slate-800 text-[10px]"
            role="group"
            aria-label="Note Editor View Mode"
          >
            <button
              type="button"
              onClick={() => setViewMode('edit')}
              aria-pressed={viewMode === 'edit'}
              className={`px-2 py-0.5 rounded-md flex items-center gap-1 transition ${
                viewMode === 'edit'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Edit3 className="w-2.5 h-2.5" aria-hidden="true" /> Edit
            </button>
            <button
              type="button"
              onClick={() => setViewMode('split')}
              aria-pressed={viewMode === 'split'}
              className={`px-2 py-0.5 rounded-md flex items-center gap-1 transition ${
                viewMode === 'split'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Columns className="w-2.5 h-2.5" aria-hidden="true" /> Split
            </button>
            <button
              type="button"
              onClick={() => setViewMode('preview')}
              aria-pressed={viewMode === 'preview'}
              className={`px-2 py-0.5 rounded-md flex items-center gap-1 transition ${
                viewMode === 'preview'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Eye className="w-2.5 h-2.5" aria-hidden="true" /> Preview
            </button>
          </div>
        </div>

        {/* Editor & Interactive Markdown Preview Area */}
        <div
          className={`flex-1 flex overflow-hidden ${
            viewMode === 'split' ? 'divide-x divide-slate-800/80' : ''
          }`}
        >
          {viewMode !== 'preview' && (
            <textarea
              ref={editorRef}
              id="note-body-input"
              aria-label="Note Body"
              value={currentNote.body}
              onChange={(e) => {
                const pos = e.target.selectionStart ?? e.target.value.length;
                lastInsertPosMapRef.current[currentNote.id] = pos;
                handleUpdateCurrentNote({ body: e.target.value }, true);
              }}
              onSelect={syncEditorCursor}
              onClick={syncEditorCursor}
              onKeyUp={syncEditorCursor}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                  if (e.shiftKey) {
                    e.preventDefault();
                    handleRedo();
                  } else if (canUndo) {
                    e.preventDefault();
                    handleUndo();
                  }
                } else if (
                  (e.ctrlKey || e.metaKey) &&
                  e.key.toLowerCase() === 'y' &&
                  canRedo
                ) {
                  e.preventDefault();
                  handleRedo();
                }
              }}
              placeholder="Start typing or click the microphone above for real-time local voice dictation at your cursor..."
              className={`${
                viewMode === 'split' ? 'w-1/2' : 'w-full'
              } h-full bg-transparent p-4 text-xs sm:text-sm text-slate-200 placeholder-slate-400 leading-relaxed focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500/40 resize-none select-text overflow-y-auto`}
            />
          )}

          {(viewMode === 'preview' || viewMode === 'split') && (
            <div
              data-testid="note-markdown-preview"
              aria-label="Markdown & Task Checklist Preview"
              className={`${
                viewMode === 'split' ? 'w-1/2' : 'w-full'
              } h-full p-4 overflow-y-auto bg-slate-950/30`}
            >
              {viewMode === 'split' && (
                <div className="mb-2 pb-1 border-b border-slate-800/80 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-indigo-400">
                  <span>Live Markdown Preview</span>
                  <span className="text-slate-500 font-normal normal-case">
                    Rendered Output
                  </span>
                </div>
              )}
              {renderMarkdownPreview()}
            </div>
          )}
        </div>

        {/* Footer Status Bar */}
        <div className="px-4 py-2 bg-slate-950/80 border-t border-slate-800/70 flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-2">
            <span id="note-word-count">
              {wordsCount} words • {charsCount} chars
            </span>
            {taskStats.total > 0 && (
              <span
                data-testid="note-task-progress"
                className="px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 text-[10px] font-medium"
              >
                {taskStats.completed}/{taskStats.total} tasks
              </span>
            )}
          </div>
          <span
            id="note-saved-indicator"
            className="text-emerald-400 flex items-center gap-1"
          >
            <Check className="w-3 h-3" aria-hidden="true" /> Auto-saved locally
            {formattedUpdatedTime ? ` (${formattedUpdatedTime})` : ''}
          </span>
        </div>
      </div>
    </section>
  );
};
