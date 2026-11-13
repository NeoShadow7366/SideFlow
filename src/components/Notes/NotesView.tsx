import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
  Copy,
  CopyPlus,
  RotateCcw,
  Download,
  Braces,
  FileCode2,
  AlertCircle,
  SpellCheck,
} from 'lucide-react';
import {
  AccentColor,
  AdfDocNode,
  DialogueSpeakerRole,
  FlowchartState,
  NoteFormatMode,
  NoteItem,
  NotifyFn,
  TranscriptCommitMeta,
} from '../../types/sideflow';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import {
  adfToJiraHtml,
  adfToMarkdown,
  appendDialogueTurnToAdfDoc,
  appendTextToAdfDoc,
  countAdfTasks,
  createEmptyAdfDoc,
  isSafeAdfUrl,
  markdownToAdf,
  parseAdfJsonString,
  validateAndNormalizeAdfDoc,
} from '../../utils/adf';
import {
  computeDagLayout,
  convertMarkdownListToFlowchart,
  generateStandaloneSVG,
  parseMermaidCode,
  renderCachedMermaidPreview,
} from '../../utils/mermaid';
import {
  findMisspellingsInAdfDoc,
  findMisspellingsInText,
  getSpellingSuggestions,
  getWordAtCharacterOffset,
  isWordSpelledCorrectly,
  MisspellingMatch,
  replaceAllWordOccurrencesInAdfDoc,
  replaceAllWordOccurrencesInText,
} from '../../utils/spellcheck';
import { lazyWithPreload } from '../../utils/lazyWithPreload';
import type {
  JiraAdfEditorHandle,
  JiraAdfSpellcheckContextMenuPayload,
} from './JiraAdfEditor';
import {
  SpellcheckContextMenu,
  SpellcheckContextTarget,
  SpellcheckProofingPopover,
} from './SpellcheckMenu';
import { VoiceBar, LiveInterimPayload } from './VoiceBar';

const JiraAdfEditor = lazyWithPreload(() =>
  import('./JiraAdfEditor').then((m) => ({ default: m.JiraAdfEditor }))
);

interface NotesViewProps {
  notes: NoteItem[];
  onChangeNotes: (
    updater: NoteItem[] | ((prev: NoteItem[]) => NoteItem[])
  ) => void;
  activeNoteId?: string;
  onChangeActiveNoteId?: (id: string) => void;
  isPanelOpen?: boolean;
  isActiveTab?: boolean;
  onDictatingChange?: (isDictating: boolean) => void;
  onNotify: NotifyFn;
  onOpenMermaidInFlow?: (flowState: FlowchartState) => void;
}

type EditorViewMode = 'edit' | 'split' | 'preview';

interface NoteHistorySnapshot {
  body: string;
  format: NoteFormatMode;
  adfDoc?: AdfDocNode;
}

interface NoteHistoryEntry {
  past: NoteHistorySnapshot[];
  future: NoteHistorySnapshot[];
}

const ACCENT_COLORS: {
  id: AccentColor;
  dotClass: string;
  activeTabClass: string;
}[] = [
  {
    id: 'indigo',
    dotClass: 'bg-indigo-400',
    activeTabClass: 'bg-indigo-600 text-white',
  },
  {
    id: 'cyan',
    dotClass: 'bg-cyan-400',
    activeTabClass: 'bg-cyan-500 text-slate-950 font-semibold',
  },
  {
    id: 'emerald',
    dotClass: 'bg-emerald-400',
    activeTabClass: 'bg-emerald-500 text-slate-950 font-semibold',
  },
  {
    id: 'amber',
    dotClass: 'bg-amber-400',
    activeTabClass: 'bg-amber-400 text-slate-950 font-semibold',
  },
  {
    id: 'rose',
    dotClass: 'bg-rose-400',
    activeTabClass: 'bg-rose-600 text-white',
  },
  {
    id: 'purple',
    dotClass: 'bg-purple-400',
    activeTabClass: 'bg-purple-600 text-white',
  },
];

function snapshotEquals(a: NoteHistorySnapshot, b: NoteHistorySnapshot): boolean {
  if (a.format !== b.format || a.body !== b.body) return false;
  if (a.format === 'adf') {
    if (a.adfDoc === b.adfDoc) return true;
    return JSON.stringify(a.adfDoc) === JSON.stringify(b.adfDoc);
  }
  return true;
}

export const NotesView: React.FC<NotesViewProps> = ({
  notes,
  onChangeNotes,
  activeNoteId: controlledActiveNoteId,
  onChangeActiveNoteId,
  isPanelOpen = true,
  isActiveTab = true,
  onDictatingChange,
  onNotify,
  onOpenMermaidInFlow,
}) => {
  const [internalActiveNoteId, setInternalActiveNoteId] =
    useLocalStorage<string>(
      'sideflow_active_note_id',
      notes[0]?.id || 'note-1'
    );
  const activeNoteId = controlledActiveNoteId ?? internalActiveNoteId;
  const setActiveNoteId = onChangeActiveNoteId ?? setInternalActiveNoteId;
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTagFilter, setSelectedTagFilter] = useState<string | null>(
    null
  );
  const [viewMode, setViewMode] = useLocalStorage<EditorViewMode>(
    'sideflow_notes_view_mode',
    'edit'
  );
  const [isNoteSwitcherOpen, setIsNoteSwitcherOpen] = useState<boolean>(false);
  const [newTagText, setNewTagText] = useState<string>('');
  const [showTagInput, setShowTagInput] = useState<boolean>(false);
  const [, setHistoryTick] = useState<number>(0);
  const [isNoteDictating, setIsNoteDictating] = useState<boolean>(false);
  const [liveInterim, setLiveInterim] = useState<LiveInterimPayload>({
    text: '',
    isSpeaking: false,
    isProcessing: false,
  });
  const speechOriginNoteIdRef = useRef<string | null>(null);
  const speechOriginByRoleRef = useRef<{
    primary: string | null;
    external: string | null;
  }>({ primary: null, external: null });
  const lastDialogueTurnRef = useRef<{
    noteId: string;
    speakerRole: DialogueSpeakerRole;
    speakerLabel: string;
    format: NoteFormatMode;
  } | null>(null);

  const handleDictatingStateChange = useCallback(
    (next: boolean) => {
      setIsNoteDictating(next);
      if (!next) {
        setLiveInterim({ text: '', isSpeaking: false, isProcessing: false });
        speechOriginNoteIdRef.current = null;
        speechOriginByRoleRef.current = { primary: null, external: null };
        lastDialogueTurnRef.current = null;
      }
      onDictatingChange?.(next);
    },
    [onDictatingChange]
  );

  // Raw ADF JSON draft state when user edits inside Split or ADF JSON view
  const [adfJsonDraft, setAdfJsonDraft] = useState<string>('');
  const [adfJsonError, setAdfJsonError] = useState<string | null>(null);
  const isEditingRawJsonRef = useRef<boolean>(false);

  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const markdownBackdropRef = useRef<HTMLDivElement | null>(null);
  const jiraEditorRef = useRef<JiraAdfEditorHandle | null>(null);

  // Spellcheck & Custom Dictionary State (Chrome / Word style)
  const [spellCheckEnabled, setSpellCheckEnabled] = useLocalStorage<boolean>(
    'sideflow_spellcheck_enabled',
    true
  );
  const [customDictionary, setCustomDictionary] = useLocalStorage<string[]>(
    'sideflow_custom_dictionary',
    []
  );
  const [ignoredWords, setIgnoredWords] = useState<string[]>([]);
  const [isProofingOpen, setIsProofingOpen] = useState<boolean>(false);
  const [contextMenuTarget, setContextMenuTarget] =
    useState<SpellcheckContextTarget | null>(null);

  // Merge native Electron Hunspell dictionary suggestions when right-clicking in Electron
  useEffect(() => {
    const unsub = window.sideflow?.onSpellCheckContextMenu?.((params) => {
      if (!params) return;
      const nativeSuggestions = Array.isArray(params.dictionarySuggestions)
        ? params.dictionarySuggestions.filter(Boolean)
        : [];
      if (nativeSuggestions.length === 0 && !params.misspelledWord) return;
      setContextMenuTarget((prev) => {
        if (!prev) return prev;
        const word = prev.word || params.misspelledWord || undefined;
        if (!word) return prev;
        const merged: string[] = [];
        for (const s of [...prev.suggestions, ...nativeSuggestions]) {
          if (
            s &&
            !merged.some((m) => m.toLowerCase() === s.toLowerCase())
          ) {
            merged.push(s);
          }
          if (merged.length >= 6) break;
        }
        return {
          ...prev,
          word,
          isMisspelled: true,
          suggestions: merged,
        };
      });
    });
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  // Word-style F7 shortcut to toggle Proofing & Custom Dictionary popover
  useEffect(() => {
    if (!isActiveTab || !isPanelOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F7') {
        e.preventDefault();
        if (!spellCheckEnabled) {
          setSpellCheckEnabled(true);
        }
        setIsProofingOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActiveTab, isPanelOpen, spellCheckEnabled, setSpellCheckEnabled]);
  // Tracks the exact collapsed insertion index where text was last added or cursor was placed per note ID.
  // Never stores a destructive range so Timestamp / Voice Dictation never deletes selected text.
  const lastInsertPosMapRef = useRef<Record<string, number>>({});
  // Per-note undo/redo history stacks
  const historyMapRef = useRef<Record<string, NoteHistoryEntry>>({});
  // Tracks the timestamp of the last coalesced character-typing undo snapshot per note ID
  const lastTypingSnapshotAtRef = useRef<Record<string, number>>({});
  // Synchronous mirror of notes array so rapid multi-turn voice commits & StrictMode updaters stay pure and deterministic
  const latestNotesRef = useRef<NoteItem[]>(notes);
  latestNotesRef.current = notes;

  useEffect(() => {
    if (notes.length > 0 && !notes.some((n) => n.id === activeNoteId)) {
      setActiveNoteId(notes[0].id);
    }
  }, [notes, activeNoteId, setActiveNoteId]);

  const currentNote: NoteItem =
    notes.find((n) => n.id === activeNoteId) ||
    notes[0] || {
      id: 'note-1',
      title: 'Untitled',
      body: '',
      format: 'markdown',
    };

  const currentFormat: NoteFormatMode =
    currentNote.format === 'adf' ? 'adf' : 'markdown';

  const handleLiveInterimChange = useCallback(
    (payload: LiveInterimPayload) => {
      if (payload.isSpeaking) {
        if (!speechOriginNoteIdRef.current) {
          speechOriginNoteIdRef.current = currentNote.id;
        }
        const role: DialogueSpeakerRole = payload.speakerRole || 'primary';
        if (!speechOriginByRoleRef.current[role]) {
          speechOriginByRoleRef.current[role] = currentNote.id;
        }
      } else if (!payload.isProcessing) {
        speechOriginNoteIdRef.current = null;
        speechOriginByRoleRef.current = { primary: null, external: null };
      }
      setLiveInterim(payload);
    },
    [currentNote.id]
  );

  const currentAdfDoc: AdfDocNode = useMemo(() => {
    if (currentFormat !== 'adf') {
      return createEmptyAdfDoc();
    }
    if (currentNote.adfDoc) {
      const validated = validateAndNormalizeAdfDoc(currentNote.adfDoc);
      if (validated.valid) return validated.doc;
    }
    return markdownToAdf(currentNote.body || '');
  }, [currentFormat, currentNote.adfDoc, currentNote.body]);

  // Reset raw JSON editing lock whenever switching notes or toggling format mode
  useEffect(() => {
    isEditingRawJsonRef.current = false;
  }, [currentNote.id, currentFormat]);

  const isAdfJsonPaneVisible =
    currentFormat === 'adf' &&
    (viewMode === 'split' || viewMode === 'preview');

  // Keep raw ADF JSON textarea synchronized only when the JSON inspector pane is actually visible
  useEffect(() => {
    if (currentFormat !== 'adf') {
      setAdfJsonError(null);
      return;
    }
    if (isAdfJsonPaneVisible && !isEditingRawJsonRef.current) {
      setAdfJsonDraft(JSON.stringify(currentAdfDoc, null, 2));
      setAdfJsonError(null);
    }
  }, [currentNote.id, currentFormat, currentAdfDoc, isAdfJsonPaneVisible]);

  const getNoteHistory = (noteId: string): NoteHistoryEntry => {
    if (!historyMapRef.current[noteId]) {
      historyMapRef.current[noteId] = { past: [], future: [] };
    }
    return historyMapRef.current[noteId];
  };

  const createSnapshotFromNote = (n: NoteItem): NoteHistorySnapshot => ({
    body: n.body || '',
    format: n.format === 'adf' ? 'adf' : 'markdown',
    adfDoc: n.adfDoc,
  });

  const recordNoteSnapshot = (
    noteId: string,
    prevSnap: NoteHistorySnapshot,
    nextSnap: NoteHistorySnapshot,
    triggerRender = true,
    coalesceTyping = false
  ) => {
    if (snapshotEquals(prevSnap, nextSnap)) return;
    const hist = getNoteHistory(noteId);
    const now = Date.now();
    const lastTypingAt = lastTypingSnapshotAtRef.current[noteId] || 0;
    const isSingleCharEdit =
      coalesceTyping &&
      prevSnap.format === nextSnap.format &&
      Math.abs((nextSnap.body || '').length - (prevSnap.body || '').length) <= 1;

    if (isSingleCharEdit && hist.past.length > 0 && now - lastTypingAt < 500) {
      // Coalesce rapid single-character keystrokes into the active typing burst
      lastTypingSnapshotAtRef.current[noteId] = now;
      hist.future = [];
      return;
    }

    lastTypingSnapshotAtRef.current[noteId] = isSingleCharEdit ? now : 0;
    const lastPast = hist.past[hist.past.length - 1];
    if (!lastPast || !snapshotEquals(lastPast, prevSnap)) {
      hist.past = [...hist.past.slice(-39), prevSnap];
    }
    hist.future = [];
    if (triggerRender) {
      setHistoryTick((t) => t + 1);
    }
  };

  const handleUpdateCurrentNote = (
    patch: Partial<NoteItem>,
    recordUndo = true,
    coalesceTyping = false
  ) => {
    const activeTarget =
      latestNotesRef.current.find((n) => n.id === currentNote.id) || currentNote;

    const isContentMutation =
      typeof patch.body === 'string' ||
      patch.adfDoc !== undefined ||
      patch.format !== undefined;

    if (isContentMutation && recordUndo) {
      const prevSnap = createSnapshotFromNote(activeTarget);
      const nextSnap: NoteHistorySnapshot = {
        body: patch.body !== undefined ? patch.body : activeTarget.body,
        format:
          patch.format !== undefined
            ? patch.format
            : activeTarget.format === 'adf'
            ? 'adf'
            : 'markdown',
        adfDoc: patch.adfDoc !== undefined ? patch.adfDoc : activeTarget.adfDoc,
      };
      recordNoteSnapshot(
        currentNote.id,
        prevSnap,
        nextSnap,
        true,
        coalesceTyping
      );
    }

    const updatedAt = Date.now();
    latestNotesRef.current = latestNotesRef.current.map((n) =>
      n.id === currentNote.id ? { ...n, ...patch, updatedAt } : n
    );
    onChangeNotes((prev) =>
      prev.map((n) =>
        n.id === currentNote.id ? { ...n, ...patch, updatedAt } : n
      )
    );
  };

  const handleChangeAdfDoc = (
    nextDoc: AdfDocNode,
    syncJsonDraft = true,
    coalesceTyping = false
  ) => {
    const syncedMarkdown = adfToMarkdown(nextDoc);
    if (syncJsonDraft) {
      isEditingRawJsonRef.current = false;
      setAdfJsonError(null);
      if (isAdfJsonPaneVisible) {
        setAdfJsonDraft(JSON.stringify(nextDoc, null, 2));
      }
    }
    handleUpdateCurrentNote(
      {
        format: 'adf',
        adfDoc: nextDoc,
        body: syncedMarkdown,
      },
      true,
      coalesceTyping
    );
  };

  const handleRawAdfJsonInput = (rawText: string) => {
    lastDialogueTurnRef.current = null;
    isEditingRawJsonRef.current = true;
    setAdfJsonDraft(rawText);
    const parsed = parseAdfJsonString(rawText);
    if (!parsed.valid) {
      setAdfJsonError(parsed.error);
      return;
    }
    setAdfJsonError(null);
    const syncedMarkdown = adfToMarkdown(parsed.doc);
    handleUpdateCurrentNote(
      {
        format: 'adf',
        adfDoc: parsed.doc,
        body: syncedMarkdown,
      },
      true
    );
  };

  const handleFormatRawAdfJson = () => {
    const parsed = parseAdfJsonString(adfJsonDraft);
    if (!parsed.valid) {
      onNotify('Invalid ADF JSON', 'zap', parsed.error, { variant: 'error' });
      return;
    }
    isEditingRawJsonRef.current = false;
    setAdfJsonDraft(JSON.stringify(parsed.doc, null, 2));
    setAdfJsonError(null);
  };

  const handleSwitchFormatMode = (targetFormat: NoteFormatMode) => {
    if (targetFormat === currentFormat) return;
    lastDialogueTurnRef.current = null;
    isEditingRawJsonRef.current = false;
    setAdfJsonError(null);

    if (targetFormat === 'adf') {
      const convertedDoc = markdownToAdf(currentNote.body || '');
      const normalizedMd = adfToMarkdown(convertedDoc);
      setAdfJsonDraft(JSON.stringify(convertedDoc, null, 2));
      handleUpdateCurrentNote(
        {
          format: 'adf',
          adfDoc: convertedDoc,
          body: currentNote.body.trim() ? currentNote.body : normalizedMd,
        },
        true
      );
      onNotify(
        'Switched to Jira ADF Mode',
        'check',
        'Converted note to Atlassian Document Format v1'
      );
    } else {
      const convertedMarkdown = adfToMarkdown(currentAdfDoc);
      lastInsertPosMapRef.current[currentNote.id] = convertedMarkdown.length;
      handleUpdateCurrentNote(
        {
          format: 'markdown',
          body: convertedMarkdown,
          adfDoc: currentAdfDoc,
        },
        true
      );
      onNotify(
        'Switched to Markdown (MD)',
        'check',
        'Converted Jira ADF blocks to Markdown'
      );
    }
  };

  const handleUndo = () => {
    const hist = getNoteHistory(currentNote.id);
    if (hist.past.length === 0) return;
    lastDialogueTurnRef.current = null;
    const previous = hist.past[hist.past.length - 1];
    hist.past = hist.past.slice(0, -1);
    hist.future = [
      createSnapshotFromNote(currentNote),
      ...hist.future.slice(0, 39),
    ];
    setHistoryTick((t) => t + 1);
    isEditingRawJsonRef.current = false;
    lastInsertPosMapRef.current[currentNote.id] = previous.body.length;
    handleUpdateCurrentNote(
      {
        body: previous.body,
        format: previous.format,
        adfDoc: previous.adfDoc,
      },
      false
    );
  };

  const handleRedo = () => {
    const hist = getNoteHistory(currentNote.id);
    if (hist.future.length === 0) return;
    lastDialogueTurnRef.current = null;
    const next = hist.future[0];
    hist.future = hist.future.slice(1);
    hist.past = [
      ...hist.past.slice(-39),
      createSnapshotFromNote(currentNote),
    ];
    setHistoryTick((t) => t + 1);
    isEditingRawJsonRef.current = false;
    lastInsertPosMapRef.current[currentNote.id] = next.body.length;
    handleUpdateCurrentNote(
      {
        body: next.body,
        format: next.format,
        adfDoc: next.adfDoc,
      },
      false
    );
  };

  const syncEditorCursor = () => {
    const el = editorRef.current;
    if (!el) return;
    const selStart = el.selectionStart ?? el.value.length;
    const selEnd = el.selectionEnd ?? el.value.length;
    if (selStart === selEnd) {
      if (
        typeof lastInsertPosMapRef.current[currentNote.id] === 'number' &&
        lastInsertPosMapRef.current[currentNote.id] !== selEnd
      ) {
        lastDialogueTurnRef.current = null;
      }
      lastInsertPosMapRef.current[currentNote.id] = selEnd;
    } else if (typeof lastInsertPosMapRef.current[currentNote.id] !== 'number') {
      lastInsertPosMapRef.current[currentNote.id] = selEnd;
    }
  };

  /**
   * Non-destructively inserts text at the position where text was last added/edited
   * (or end of note if no position was recorded). Supports both Markdown and Jira ADF modes.
   */
  const insertAtCursor = (
    snippet: string,
    options?: {
      padSpace?: boolean;
      ensureNewlineBefore?: boolean;
      startOnNewLine?: boolean;
      targetNoteId?: string;
    }
  ) => {
    const resolvedNoteId = options?.targetNoteId || currentNote.id;
    const targetNoteObj =
      latestNotesRef.current.find((n) => n.id === resolvedNoteId) || currentNote;
    const targetFormat: NoteFormatMode =
      targetNoteObj.format === 'adf' ? 'adf' : 'markdown';

    if (targetFormat === 'adf') {
      if (resolvedNoteId === currentNote.id && jiraEditorRef.current) {
        jiraEditorRef.current.insertSnippetAtCursor(snippet, {
          padSpace: options?.padSpace ?? options?.ensureNewlineBefore,
        });
      } else {
        const validated = targetNoteObj.adfDoc
          ? validateAndNormalizeAdfDoc(targetNoteObj.adfDoc)
          : null;
        const baseDoc =
          validated && validated.valid
            ? validated.doc
            : markdownToAdf(targetNoteObj.body || '');
        const nextDoc = appendTextToAdfDoc(baseDoc, snippet, {
          padSpace: options?.padSpace ?? options?.ensureNewlineBefore,
        });
        if (resolvedNoteId === currentNote.id) {
          handleChangeAdfDoc(nextDoc);
        } else {
          const syncedBody = adfToMarkdown(nextDoc);
          const updatedAt = Date.now();
          recordNoteSnapshot(
            resolvedNoteId,
            createSnapshotFromNote(targetNoteObj),
            { body: syncedBody, format: 'adf', adfDoc: nextDoc },
            true
          );
          latestNotesRef.current = latestNotesRef.current.map((n) =>
            n.id === resolvedNoteId
              ? { ...n, adfDoc: nextDoc, body: syncedBody, updatedAt }
              : n
          );
          onChangeNotes((prev) =>
            prev.map((n) =>
              n.id === resolvedNoteId
                ? { ...n, adfDoc: nextDoc, body: syncedBody, updatedAt }
                : n
            )
          );
        }
      }
      return;
    }

    const noteId = resolvedNoteId;
    const el = editorRef.current;

    if (
      noteId === currentNote.id &&
      el &&
      document.activeElement === el &&
      typeof el.selectionStart === 'number' &&
      el.selectionStart === el.selectionEnd
    ) {
      lastInsertPosMapRef.current[noteId] = el.selectionStart;
    }

    const body = targetNoteObj.body || '';
    const savedPos = lastInsertPosMapRef.current[noteId];
    const insertPos =
      typeof savedPos === 'number'
        ? Math.max(0, Math.min(savedPos, body.length))
        : body.length;

    const before = body.slice(0, insertPos);
    const after = body.slice(insertPos);

    let prefix = '';
    if (options?.startOnNewLine) {
      if (before.length > 0 && !before.endsWith('\n')) {
        prefix = '\n';
      }
    } else if (options?.ensureNewlineBefore) {
      if (
        before.length > 0 &&
        !before.endsWith('\n') &&
        !before.endsWith(' ')
      ) {
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
      options?.startOnNewLine &&
      after.length > 0 &&
      !after.startsWith('\n') &&
      !snippet.endsWith('\n')
    ) {
      suffix = '\n';
    } else if (
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
    const computedNextPos = options?.startOnNewLine
      ? before.length + prefix.length + snippet.length
      : before.length + inserted.length;

    recordNoteSnapshot(
      noteId,
      { body, format: 'markdown', adfDoc: targetNoteObj.adfDoc },
      { body: nextBody, format: 'markdown', adfDoc: targetNoteObj.adfDoc },
      true
    );
    lastInsertPosMapRef.current[noteId] = computedNextPos;

    const updatedAt = Date.now();
    latestNotesRef.current = latestNotesRef.current.map((n) =>
      n.id === noteId ? { ...n, body: nextBody, updatedAt } : n
    );
    onChangeNotes((prev) =>
      prev.map((n) =>
        n.id === noteId ? { ...n, body: nextBody, updatedAt } : n
      )
    );

    requestAnimationFrame(() => {
      if (editorRef.current && document.activeElement === editorRef.current) {
        editorRef.current.setSelectionRange(computedNextPos, computedNextPos);
      }
    });
  };

  const handleVoiceTranscript = (
    transcript: string,
    meta?: TranscriptCommitMeta
  ) => {
    const role: DialogueSpeakerRole = meta?.speakerRole || 'primary';
    const roleOrigin = speechOriginByRoleRef.current[role];
    speechOriginByRoleRef.current[role] = null;

    if (!meta?.isDialogue) {
      const originId =
        speechOriginNoteIdRef.current || roleOrigin || currentNote.id;
      speechOriginNoteIdRef.current = null;
      lastDialogueTurnRef.current = null;
      insertAtCursor(transcript, { padSpace: true, targetNoteId: originId });
      return;
    }

    const originId = roleOrigin || currentNote.id;
    const cleanText = transcript.trim();
    if (!cleanText) return;

    const targetNoteObj =
      latestNotesRef.current.find((n) => n.id === originId) || currentNote;
    const targetFormat: NoteFormatMode =
      targetNoteObj.format === 'adf' ? 'adf' : 'markdown';
    const speakerLabel =
      (
        meta.speakerLabel || (role === 'external' ? 'External' : 'You')
      ).trim() || (role === 'external' ? 'External' : 'You');

    const prevTurn = lastDialogueTurnRef.current;
    const canAppendSameTurn =
      Boolean(prevTurn) &&
      prevTurn!.noteId === originId &&
      prevTurn!.speakerRole === role &&
      prevTurn!.speakerLabel === speakerLabel &&
      prevTurn!.format === targetFormat;

    if (targetFormat === 'adf') {
      const validated = targetNoteObj.adfDoc
        ? validateAndNormalizeAdfDoc(targetNoteObj.adfDoc)
        : null;
      const baseDoc =
        validated && validated.valid
          ? validated.doc
          : markdownToAdf(targetNoteObj.body || '');
      const nextDoc = appendDialogueTurnToAdfDoc(baseDoc, cleanText, {
        speakerRole: role,
        speakerLabel,
        appendToActiveTurn: canAppendSameTurn,
        includeTimestamp: meta.includeTimestamp,
        timestampText: meta.timestampText,
      });
      const syncedMarkdown = adfToMarkdown(nextDoc);
      recordNoteSnapshot(
        originId,
        createSnapshotFromNote(targetNoteObj),
        { body: syncedMarkdown, format: 'adf', adfDoc: nextDoc },
        true
      );

      const updatedAt = Date.now();
      latestNotesRef.current = latestNotesRef.current.map((n) =>
        n.id === originId
          ? {
              ...n,
              format: 'adf',
              adfDoc: nextDoc,
              body: syncedMarkdown,
              updatedAt,
            }
          : n
      );
      onChangeNotes((prev) =>
        prev.map((n) =>
          n.id === originId
            ? {
                ...n,
                format: 'adf',
                adfDoc: nextDoc,
                body: syncedMarkdown,
                updatedAt,
              }
            : n
        )
      );

      if (originId === currentNote.id) {
        isEditingRawJsonRef.current = false;
        setAdfJsonDraft(JSON.stringify(nextDoc, null, 2));
        setAdfJsonError(null);
      }

      lastDialogueTurnRef.current = {
        noteId: originId,
        speakerRole: role,
        speakerLabel,
        format: 'adf',
      };
      return;
    }

    if (canAppendSameTurn) {
      insertAtCursor(cleanText, { padSpace: true, targetNoteId: originId });
    } else {
      const stampPrefix =
        meta.includeTimestamp && meta.timestampText
          ? `[${meta.timestampText}] `
          : '';
      const formattedTurn = `${stampPrefix}**${speakerLabel}:** ${cleanText}`;
      insertAtCursor(formattedTurn, {
        startOnNewLine: true,
        targetNoteId: originId,
      });
    }

    lastDialogueTurnRef.current = {
      noteId: originId,
      speakerRole: role,
      speakerLabel,
      format: 'markdown',
    };
  };

  const handleInsertTimestamp = () => {
    lastDialogueTurnRef.current = null;
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
    if (viewMode === 'preview') {
      setViewMode('split');
    }
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
        replacement = `${needsNewline ? '\n' : ''}### ${
          selected || 'Section Heading'
        }`;
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
        replacement = `${needsNewline ? '\n' : ''}- [ ] ${
          selected || 'Action item'
        }`;
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
        replacement = `${
          needsNewline ? '\n' : ''
        }\`\`\`mermaid\n${mermaidSnippet}\n\`\`\`\n`;
        cursorOffset = replacement.length;
        break;
      }
    }

    lastDialogueTurnRef.current = null;
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

    lastDialogueTurnRef.current = null;
    handleUpdateCurrentNote({ body: lines.join('\n') }, true);
  };

  const handleResetMarkdownChecklist = () => {
    const nextBody = (currentNote.body || '').replace(
      /^(\s*[-*]\s+)\[[xX]\]/gm,
      '$1[ ]'
    );
    if (nextBody === currentNote.body) return;
    lastDialogueTurnRef.current = null;
    handleUpdateCurrentNote({ body: nextBody }, true);
    onNotify(
      'Reset Checklist Tasks',
      'check',
      `Unchecked all tasks in "${currentNote.title || 'Untitled'}"`
    );
  };

  const handleDuplicateCurrentNote = () => {
    lastDialogueTurnRef.current = null;
    const clonedAdf = currentNote.adfDoc
      ? (JSON.parse(JSON.stringify(currentNote.adfDoc)) as AdfDocNode)
      : undefined;
    const duplicated: NoteItem = {
      id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: `${currentNote.title || 'Untitled'} (Copy)`,
      body: currentNote.body || '',
      format: currentFormat,
      ...(clonedAdf ? { adfDoc: clonedAdf } : {}),
      updatedAt: Date.now(),
      color: currentNote.color || 'indigo',
      pinned: false,
      tags: [...(currentNote.tags || [])],
    };
    latestNotesRef.current = [...latestNotesRef.current, duplicated];
    onChangeNotes((prev) => [...prev, duplicated]);
    setActiveNoteId(duplicated.id);
    onNotify(
      `Duplicated "${currentNote.title || 'Untitled'}"`,
      'copy',
      `Created "${duplicated.title}"`
    );
  };

  const handleConvertNoteToFlow = () => {
    if (!onOpenMermaidInFlow) return;
    const el = editorRef.current;
    const selectedText =
      currentFormat === 'markdown' &&
      el &&
      typeof el.selectionStart === 'number' &&
      typeof el.selectionEnd === 'number' &&
      el.selectionEnd > el.selectionStart
        ? el.value.slice(el.selectionStart, el.selectionEnd)
        : '';
    const sourceMarkdown = (selectedText || effectiveTextForStats || '').trim();
    const generatedFlow = convertMarkdownListToFlowchart(
      sourceMarkdown,
      currentNote.title || 'Note Steps'
    );
    if (!generatedFlow) {
      onNotify(
        'Nothing to Convert',
        'zap',
        'Add bullet items (- Step) or checklist items (- [ ] Task) first',
        { variant: 'warning' }
      );
      return;
    }
    onOpenMermaidInFlow(generatedFlow);
  };

  const handleCreateNewNote = () => {
    lastDialogueTurnRef.current = null;
    const newNote: NoteItem = {
      id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: `Quick Note ${notes.length + 1}`,
      body: '',
      format: currentFormat,
      adfDoc: currentFormat === 'adf' ? createEmptyAdfDoc() : undefined,
      updatedAt: Date.now(),
      color: 'indigo',
      pinned: false,
      tags: [],
    };
    latestNotesRef.current = [...latestNotesRef.current, newNote];
    onChangeNotes((prev) => [...prev, newNote]);
    setActiveNoteId(newNote.id);
    setSearchQuery('');
  };

  const handleDeleteCurrentNote = () => {
    if (notes.length <= 1) return;
    lastDialogueTurnRef.current = null;
    const deletedNote = currentNote;
    const deletedIndex = notes.findIndex((n) => n.id === currentNote.id);
    const deletedTitle = deletedNote.title || 'Untitled';
    const remaining = notes.filter((n) => n.id !== currentNote.id);
    latestNotesRef.current = remaining;
    onChangeNotes(remaining);
    if (remaining[0]) {
      setActiveNoteId(remaining[0].id);
    }
    onNotify(
      `Deleted "${deletedTitle}"`,
      'check',
      'Note removed from scratchpad',
      {
        variant: 'info',
        undoLabel: 'Undo',
        onUndo: () => {
          onChangeNotes((prev) => {
            if (prev.some((n) => n.id === deletedNote.id)) return prev;
            const next = [...prev];
            const idx =
              deletedIndex >= 0
                ? Math.min(deletedIndex, next.length)
                : next.length;
            next.splice(idx, 0, deletedNote);
            return next;
          });
          setActiveNoteId(deletedNote.id);
        },
      }
    );
  };

  const handleClearCurrentNote = () => {
    const hasContent =
      currentFormat === 'adf'
        ? Boolean(adfToMarkdown(currentAdfDoc).trim()) ||
          currentAdfDoc.content.length > 1 ||
          currentAdfDoc.content[0]?.type !== 'paragraph'
        : Boolean(currentNote.body);
    if (!hasContent) return;

    const clearedNoteId = currentNote.id;
    const previousBody = currentNote.body;
    const previousFormat = currentFormat;
    const previousAdfDoc =
      currentFormat === 'adf' ? currentAdfDoc : currentNote.adfDoc;
    const clearedTitle = currentNote.title || 'Untitled';

    lastDialogueTurnRef.current = null;
    isEditingRawJsonRef.current = false;
    handleUpdateCurrentNote(
      {
        body: '',
        adfDoc: currentFormat === 'adf' ? createEmptyAdfDoc() : undefined,
      },
      true
    );
    lastInsertPosMapRef.current[currentNote.id] = 0;

    onNotify('Cleared Note Content', 'check', clearedTitle, {
      variant: 'info',
      undoLabel: 'Undo',
      onUndo: () => {
        lastInsertPosMapRef.current[clearedNoteId] = previousBody.length;
        onChangeNotes((prev) =>
          prev.map((n) =>
            n.id === clearedNoteId
              ? {
                  ...n,
                  body: previousBody,
                  format: previousFormat,
                  adfDoc: previousAdfDoc,
                  updatedAt: Date.now(),
                }
              : n
          )
        );
        setActiveNoteId(clearedNoteId);
      },
    });
  };

  const handleTogglePinCurrentNote = () => {
    const nextPinned = !currentNote.pinned;
    handleUpdateCurrentNote({ pinned: nextPinned }, false);
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
    if (currentFormat === 'adf') {
      const plainText = adfToMarkdown(currentAdfDoc);
      const htmlMarkup = adfToJiraHtml(currentAdfDoc);
      const hasBlocks =
        plainText.trim().length > 0 ||
        currentAdfDoc.content.some(
          (b) => b.type !== 'paragraph' || (b.content && b.content.length > 0)
        );
      if (!hasBlocks) {
        onNotify('Note is Empty', 'file-text', 'Add content before copying');
        return;
      }

      try {
        const ClipboardItemCtor = (
          window as unknown as {
            ClipboardItem?: new (
              items: Record<string, Blob>
            ) => ClipboardItem;
          }
        ).ClipboardItem;
        if (navigator.clipboard?.write && ClipboardItemCtor) {
          const item = new ClipboardItemCtor({
            'text/html': new Blob([htmlMarkup], { type: 'text/html' }),
            'text/plain': new Blob([plainText], { type: 'text/plain' }),
          });
          await navigator.clipboard.write([item]);
        } else if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(plainText);
        }
      } catch {
        try {
          await navigator.clipboard?.writeText?.(plainText);
        } catch {
          // ignore
        }
      }

      onNotify(
        'Copied for Jira Description',
        'check',
        'Rich HTML + Markdown ready to paste into Jira Cloud'
      );
      return;
    }

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

  const handleCopyAdfJson = async () => {
    const jsonPayload = JSON.stringify(currentAdfDoc, null, 2);
    try {
      await navigator.clipboard?.writeText?.(jsonPayload);
    } catch {
      // ignore
    }
    onNotify(
      'Copied ADF v1 JSON',
      'check',
      `Canonical Atlassian Document (${currentAdfDoc.content.length} block${
        currentAdfDoc.content.length === 1 ? '' : 's'
      })`
    );
  };

  const handleExportNote = () => {
    const slug =
      (currentNote.title || 'sideflow-note')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'sideflow-note';

    if (currentFormat === 'adf') {
      const filename = `${slug}.adf.json`;
      const jsonContent = `${JSON.stringify(currentAdfDoc, null, 2)}\n`;
      try {
        const blob = new Blob([jsonContent], {
          type: 'application/json;charset=utf-8',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        onNotify('Exported Jira ADF JSON', 'check', `Saved as ${filename}`);
      } catch {
        // ignore
      }
      return;
    }

    const filename = `${slug}.md`;
    const markdown = `# ${currentNote.title || 'Untitled Note'}\n\n${
      currentNote.body
    }\n`;
    try {
      const blob = new Blob([markdown], {
        type: 'text/markdown;charset=utf-8',
      });
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
    const byQuery = q
      ? notes.filter(
          (n) =>
            (n.title || '').toLowerCase().includes(q) ||
            (n.body || '').toLowerCase().includes(q) ||
            (n.tags || []).some((t) => t.toLowerCase().includes(q))
        )
      : notes;

    const filtered = selectedTagFilter
      ? byQuery.filter((n) =>
          (n.tags || []).some(
            (t) => t.toLowerCase() === selectedTagFilter.toLowerCase()
          )
        )
      : byQuery;

    return [...filtered].sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) {
        return a.pinned ? -1 : 1;
      }
      return 0;
    });
  }, [notes, searchQuery, selectedTagFilter]);

  // Calculate word/char counts and task checklist progress across both MD & ADF modes
  const effectiveTextForStats = useMemo(
    () =>
      currentFormat === 'adf' ? adfToMarkdown(currentAdfDoc) : currentNote.body,
    [currentFormat, currentAdfDoc, currentNote.body]
  );
  const wordsCount = effectiveTextForStats.trim()
    ? effectiveTextForStats.trim().split(/\s+/).length
    : 0;
  const charsCount = effectiveTextForStats.length;
  const formattedUpdatedTime = currentNote.updatedAt
    ? new Date(currentNote.updatedAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  const taskStats = useMemo(() => {
    if (currentFormat === 'adf') {
      return countAdfTasks(currentAdfDoc);
    }
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
  }, [currentFormat, currentAdfDoc, currentNote.body]);

  const currentHistory = getNoteHistory(currentNote.id);
  const canUndo = currentHistory.past.length > 0;
  const canRedo = currentHistory.future.length > 0;

  // --- Spellcheck & Custom Dictionary Engine ---
  const customDictSet = useMemo(
    () => new Set(customDictionary.map((w) => w.toLowerCase())),
    [customDictionary]
  );
  const ignoredWordsSet = useMemo(
    () => new Set(ignoredWords.map((w) => w.toLowerCase())),
    [ignoredWords]
  );

  const activeMisspellings: MisspellingMatch[] = useMemo(() => {
    if (!spellCheckEnabled) return [];
    if (currentFormat === 'adf') {
      return findMisspellingsInAdfDoc(currentAdfDoc, {
        customDictionary: customDictSet,
        ignoredWords: ignoredWordsSet,
        includeSuggestions: isProofingOpen,
      });
    }
    return findMisspellingsInText(currentNote.body || '', {
      isMarkdown: true,
      customDictionary: customDictSet,
      ignoredWords: ignoredWordsSet,
      includeSuggestions: isProofingOpen,
    });
  }, [
    spellCheckEnabled,
    currentFormat,
    currentAdfDoc,
    currentNote.body,
    customDictSet,
    ignoredWordsSet,
    isProofingOpen,
  ]);

  const countOccurrencesOfWord = useCallback(
    (word: string, source: 'markdown' | 'adf' | 'title'): number => {
      if (!word) return 0;
      const lower = word.toLowerCase();
      if (source === 'title') {
        const titleIssues = findMisspellingsInText(currentNote.title || '', {
          isMarkdown: false,
          customDictionary: customDictSet,
          ignoredWords: ignoredWordsSet,
        });
        return Math.max(
          1,
          titleIssues.filter((m) => m.word.toLowerCase() === lower).length
        );
      }
      return Math.max(
        1,
        activeMisspellings.filter((m) => m.word.toLowerCase() === lower).length
      );
    },
    [currentNote.title, customDictSet, ignoredWordsSet, activeMisspellings]
  );

  const handleAddWordToDictionary = useCallback(
    (rawWord: string) => {
      const cleaned = rawWord
        .trim()
        .replace(/^['’]+|['’]+$/g, '')
        .toLowerCase();
      if (!cleaned) return;
      setCustomDictionary((prev) =>
        prev.some((w) => w.toLowerCase() === cleaned)
          ? prev
          : [...prev, cleaned]
      );
      window.sideflow?.addWordToSpellCheckerDictionary?.(cleaned);
      setContextMenuTarget(null);
      onNotify(
        'Added to Dictionary',
        'check',
        `"${rawWord.trim()}" will no longer be flagged as misspelled`
      );
    },
    [setCustomDictionary, onNotify]
  );

  const handleRemoveWordFromDictionary = useCallback(
    (word: string) => {
      const lower = word.trim().toLowerCase();
      setCustomDictionary((prev) =>
        prev.filter((w) => w.toLowerCase() !== lower)
      );
      window.sideflow?.removeWordFromSpellCheckerDictionary?.(lower);
    },
    [setCustomDictionary]
  );

  const handleIgnoreWord = useCallback((word: string) => {
    const lower = word.trim().toLowerCase();
    if (!lower) return;
    setIgnoredWords((prev) =>
      prev.includes(lower) ? prev : [...prev, lower]
    );
    setContextMenuTarget(null);
  }, []);

  const handleReplaceMisspelling = useCallback(
    (
      replacement: string,
      overrideTarget?: {
        source: 'markdown' | 'adf' | 'title';
        wordStart?: number;
        wordEnd?: number;
        adfTargetId?: string;
        word?: string;
      }
    ) => {
      const target = overrideTarget || contextMenuTarget;
      if (!target) return;
      const start = target.wordStart ?? 0;
      const end = target.wordEnd ?? start;

      if (target.source === 'title') {
        const title = currentNote.title || '';
        const nextTitle = `${title.slice(0, start)}${replacement}${title.slice(
          end
        )}`;
        handleUpdateCurrentNote({ title: nextTitle }, false);
        setContextMenuTarget(null);
        return;
      }

      if (target.source === 'adf') {
        lastDialogueTurnRef.current = null;
        if (target.adfTargetId && jiraEditorRef.current) {
          jiraEditorRef.current.replaceWordInTarget(
            target.adfTargetId,
            start,
            end,
            replacement
          );
        } else if (target.word) {
          const { nextDoc } = replaceAllWordOccurrencesInAdfDoc(
            currentAdfDoc,
            target.word,
            replacement
          );
          handleChangeAdfDoc(nextDoc, true);
        }
        setContextMenuTarget(null);
        return;
      }

      // Markdown mode replacement
      lastDialogueTurnRef.current = null;
      const body = currentNote.body || '';
      const nextBody = `${body.slice(0, start)}${replacement}${body.slice(
        end
      )}`;
      handleUpdateCurrentNote({ body: nextBody }, true);
      const nextCursor = start + replacement.length;
      lastInsertPosMapRef.current[currentNote.id] = nextCursor;
      setContextMenuTarget(null);

      requestAnimationFrame(() => {
        if (editorRef.current) {
          editorRef.current.focus();
          editorRef.current.setSelectionRange(nextCursor, nextCursor);
        }
      });
    },
    [
      contextMenuTarget,
      currentNote.title,
      currentNote.body,
      currentNote.id,
      currentAdfDoc,
    ]
  );

  const handleReplaceAllMisspellings = useCallback(
    (wordToReplace: string, replacement: string) => {
      if (!wordToReplace) return;
      lastDialogueTurnRef.current = null;
      if (currentFormat === 'adf') {
        const { nextDoc } = replaceAllWordOccurrencesInAdfDoc(
          currentAdfDoc,
          wordToReplace,
          replacement
        );
        handleChangeAdfDoc(nextDoc, true);
      } else {
        const { nextText } = replaceAllWordOccurrencesInText(
          currentNote.body || '',
          wordToReplace,
          replacement,
          { isMarkdown: true }
        );
        handleUpdateCurrentNote({ body: nextText }, true);
      }
      setContextMenuTarget(null);
      onNotify(
        'Replaced All Occurrences',
        'check',
        `Changed "${wordToReplace}" to "${replacement}"`
      );
    },
    [currentFormat, currentAdfDoc, currentNote.body, onNotify]
  );

  const handleFixAllMisspellings = useCallback(() => {
    if (activeMisspellings.length === 0) return;
    lastDialogueTurnRef.current = null;
    if (currentFormat === 'adf') {
      let workingDoc = currentAdfDoc;
      const seenWords = new Set<string>();
      for (const issue of activeMisspellings) {
        const lower = issue.word.toLowerCase();
        if (seenWords.has(lower)) continue;
        const topSuggestion =
          issue.suggestions[0] ||
          getSpellingSuggestions(issue.word, {
            customDictionary: customDictSet,
            maxSuggestions: 1,
          })[0];
        if (!topSuggestion) continue;
        seenWords.add(lower);
        workingDoc = replaceAllWordOccurrencesInAdfDoc(
          workingDoc,
          issue.word,
          topSuggestion
        ).nextDoc;
      }
      handleChangeAdfDoc(workingDoc, true);
    } else {
      let workingBody = currentNote.body || '';
      const seenWords = new Set<string>();
      for (const issue of activeMisspellings) {
        const lower = issue.word.toLowerCase();
        if (seenWords.has(lower)) continue;
        const topSuggestion =
          issue.suggestions[0] ||
          getSpellingSuggestions(issue.word, {
            customDictionary: customDictSet,
            maxSuggestions: 1,
          })[0];
        if (!topSuggestion) continue;
        seenWords.add(lower);
        workingBody = replaceAllWordOccurrencesInText(
          workingBody,
          issue.word,
          topSuggestion,
          { isMarkdown: true }
        ).nextText;
      }
      handleUpdateCurrentNote({ body: workingBody }, true);
    }
    onNotify(
      'Fixed Spelling Issues',
      'check',
      'Applied top suggestions across the note'
    );
  }, [
    activeMisspellings,
    currentFormat,
    currentAdfDoc,
    currentNote.body,
    customDictSet,
    onNotify,
  ]);

  const handleTitleContextMenu = (e: React.MouseEvent<HTMLInputElement>) => {
    e.preventDefault();
    const el = e.currentTarget;
    const title = currentNote.title || '';
    const selStart = el.selectionStart ?? 0;
    const selEnd = el.selectionEnd ?? 0;
    const hasSelection = selEnd > selStart;
    const selectedText = hasSelection ? title.slice(selStart, selEnd) : '';

    let word: string | undefined;
    let isMisspelled = false;
    let suggestions: string[] = [];
    let wordStart = selStart;
    let wordEnd = selEnd;

    if (spellCheckEnabled && title.trim()) {
      const candidate =
        getWordAtCharacterOffset(title, selStart) ||
        (e.clientX === 0 && e.clientY === 0
          ? findMisspellingsInText(title, {
              isMarkdown: false,
              customDictionary: customDictSet,
              ignoredWords: ignoredWordsSet,
            })[0] || null
          : null);
      if (candidate) {
        word = candidate.word;
        wordStart = candidate.start;
        wordEnd = candidate.end;
        if (
          !isWordSpelledCorrectly(
            candidate.word,
            customDictSet,
            ignoredWordsSet
          )
        ) {
          isMisspelled = true;
          suggestions = getSpellingSuggestions(candidate.word, {
            customDictionary: customDictSet,
          });
        }
      }
    }

    setContextMenuTarget({
      x: e.clientX || 120,
      y: e.clientY || 100,
      source: 'title',
      word,
      wordStart,
      wordEnd,
      isMisspelled,
      suggestions,
      hasSelection,
      selectedText,
      occurrenceCount:
        isMisspelled && word ? countOccurrencesOfWord(word, 'title') : 0,
    });
  };

  const handleMarkdownEditorContextMenu = (
    e: React.MouseEvent<HTMLTextAreaElement>
  ) => {
    e.preventDefault();
    const el = e.currentTarget;
    const body = currentNote.body || '';
    const selStart = el.selectionStart ?? 0;
    const selEnd = el.selectionEnd ?? 0;
    const hasSelection = selEnd > selStart;
    const selectedText = hasSelection ? body.slice(selStart, selEnd) : '';

    let word: string | undefined;
    let isMisspelled = false;
    let suggestions: string[] = [];
    let wordStart = selStart;
    let wordEnd = selEnd;

    if (spellCheckEnabled && body.trim()) {
      const caretMatch = activeMisspellings.find(
        (m) => selStart >= m.start && selStart <= m.end
      );
      if (caretMatch) {
        word = caretMatch.word;
        isMisspelled = true;
        suggestions =
          caretMatch.suggestions.length > 0
            ? caretMatch.suggestions
            : getSpellingSuggestions(caretMatch.word, {
                customDictionary: customDictSet,
              });
        wordStart = caretMatch.start;
        wordEnd = caretMatch.end;
      } else {
        const wordAtCaret = getWordAtCharacterOffset(body, selStart);
        if (
          wordAtCaret &&
          !isWordSpelledCorrectly(
            wordAtCaret.word,
            customDictSet,
            ignoredWordsSet
          )
        ) {
          word = wordAtCaret.word;
          isMisspelled = true;
          suggestions = getSpellingSuggestions(wordAtCaret.word, {
            customDictionary: customDictSet,
          });
          wordStart = wordAtCaret.start;
          wordEnd = wordAtCaret.end;
        } else if (
          e.clientX === 0 &&
          e.clientY === 0 &&
          activeMisspellings.length > 0 &&
          (selStart === 0 || selStart === body.length)
        ) {
          const firstIssue = activeMisspellings[0];
          word = firstIssue.word;
          isMisspelled = true;
          suggestions =
            firstIssue.suggestions.length > 0
              ? firstIssue.suggestions
              : getSpellingSuggestions(firstIssue.word, {
                  customDictionary: customDictSet,
                });
          wordStart = firstIssue.start;
          wordEnd = firstIssue.end;
        } else if (wordAtCaret) {
          word = wordAtCaret.word;
          wordStart = wordAtCaret.start;
          wordEnd = wordAtCaret.end;
        }
      }
    }

    setContextMenuTarget({
      x: e.clientX || 160,
      y: e.clientY || 180,
      source: 'markdown',
      word,
      wordStart,
      wordEnd,
      isMisspelled,
      suggestions,
      hasSelection,
      selectedText,
      occurrenceCount:
        isMisspelled && word ? countOccurrencesOfWord(word, 'markdown') : 0,
    });
  };

  const handleAdfSpellCheckContextMenu = useCallback(
    (
      e: React.MouseEvent<HTMLDivElement>,
      payload: JiraAdfSpellcheckContextMenuPayload
    ) => {
      let word = payload.word;
      let wordStart = payload.wordStart ?? 0;
      let wordEnd = payload.wordEnd ?? 0;
      let isMisspelled = false;
      let suggestions: string[] = [];

      if (spellCheckEnabled) {
        if (
          word &&
          !isWordSpelledCorrectly(word, customDictSet, ignoredWordsSet)
        ) {
          isMisspelled = true;
          suggestions = getSpellingSuggestions(word, {
            customDictionary: customDictSet,
          });
        } else if (
          !word &&
          e.clientX === 0 &&
          e.clientY === 0 &&
          activeMisspellings.length > 0
        ) {
          const firstForTarget =
            activeMisspellings.find(
              (m) => m.adfTargetId === payload.targetId
            ) || activeMisspellings[0];
          if (firstForTarget) {
            word = firstForTarget.word;
            wordStart = firstForTarget.start;
            wordEnd = firstForTarget.end;
            isMisspelled = true;
            suggestions =
              firstForTarget.suggestions.length > 0
                ? firstForTarget.suggestions
                : getSpellingSuggestions(firstForTarget.word, {
                    customDictionary: customDictSet,
                  });
          }
        }
      }

      setContextMenuTarget({
        x: e.clientX || 160,
        y: e.clientY || 180,
        source: 'adf',
        adfTargetId: payload.targetId,
        word,
        wordStart,
        wordEnd,
        isMisspelled,
        suggestions,
        hasSelection: Boolean(payload.selectedText),
        selectedText: payload.selectedText || '',
        occurrenceCount:
          isMisspelled && word ? countOccurrencesOfWord(word, 'adf') : 0,
      });
    },
    [
      spellCheckEnabled,
      customDictSet,
      ignoredWordsSet,
      activeMisspellings,
      countOccurrencesOfWord,
    ]
  );

  const handleContextMenuCut = async () => {
    if (!contextMenuTarget) return;
    if (contextMenuTarget.source === 'title' && titleInputRef.current) {
      const el = titleInputRef.current;
      const start = el.selectionStart ?? 0;
      const end = el.selectionEnd ?? 0;
      if (end > start) {
        const selected = currentNote.title.slice(start, end);
        try {
          await navigator.clipboard?.writeText?.(selected);
        } catch {
          // ignore
        }
        const nextTitle = `${currentNote.title.slice(
          0,
          start
        )}${currentNote.title.slice(end)}`;
        handleUpdateCurrentNote({ title: nextTitle }, false);
      }
    } else if (contextMenuTarget.source === 'markdown' && editorRef.current) {
      const el = editorRef.current;
      const start = el.selectionStart ?? 0;
      const end = el.selectionEnd ?? 0;
      if (end > start) {
        const selected = currentNote.body.slice(start, end);
        try {
          await navigator.clipboard?.writeText?.(selected);
        } catch {
          // ignore
        }
        const nextBody = `${currentNote.body.slice(
          0,
          start
        )}${currentNote.body.slice(end)}`;
        handleUpdateCurrentNote({ body: nextBody }, true);
      }
    } else if (contextMenuTarget.source === 'adf' && jiraEditorRef.current) {
      const cutText = jiraEditorRef.current.cutInActiveTarget();
      if (cutText) {
        try {
          await navigator.clipboard?.writeText?.(cutText);
        } catch {
          // ignore
        }
      }
    }
    setContextMenuTarget(null);
  };

  const handleContextMenuCopy = async () => {
    if (!contextMenuTarget) return;
    let textToCopy = '';
    if (contextMenuTarget.source === 'title' && titleInputRef.current) {
      const el = titleInputRef.current;
      const start = el.selectionStart ?? 0;
      const end = el.selectionEnd ?? 0;
      textToCopy =
        end > start
          ? currentNote.title.slice(start, end)
          : contextMenuTarget.word || currentNote.title;
    } else if (contextMenuTarget.source === 'markdown' && editorRef.current) {
      const el = editorRef.current;
      const start = el.selectionStart ?? 0;
      const end = el.selectionEnd ?? 0;
      textToCopy =
        end > start
          ? currentNote.body.slice(start, end)
          : contextMenuTarget.word ||
            window.getSelection()?.toString() ||
            '';
    } else if (contextMenuTarget.source === 'adf' && jiraEditorRef.current) {
      textToCopy =
        jiraEditorRef.current.getSelectedTextInActiveTarget() ||
        contextMenuTarget.word ||
        '';
    }
    if (textToCopy) {
      try {
        await navigator.clipboard?.writeText?.(textToCopy);
      } catch {
        // ignore
      }
    }
    setContextMenuTarget(null);
  };

  const handleContextMenuPaste = async () => {
    if (!contextMenuTarget) return;
    let clipText = '';
    try {
      clipText = (await navigator.clipboard?.readText?.()) || '';
    } catch {
      // ignore
    }
    if (!clipText) {
      setContextMenuTarget(null);
      return;
    }
    if (contextMenuTarget.source === 'title' && titleInputRef.current) {
      const el = titleInputRef.current;
      const start = el.selectionStart ?? currentNote.title.length;
      const end = el.selectionEnd ?? currentNote.title.length;
      const nextTitle = `${currentNote.title.slice(
        0,
        start
      )}${clipText}${currentNote.title.slice(end)}`;
      handleUpdateCurrentNote({ title: nextTitle }, false);
    } else if (contextMenuTarget.source === 'markdown') {
      const el = editorRef.current;
      const start = el
        ? el.selectionStart ?? currentNote.body.length
        : currentNote.body.length;
      const end = el
        ? el.selectionEnd ?? currentNote.body.length
        : currentNote.body.length;
      const nextBody = `${currentNote.body.slice(
        0,
        start
      )}${clipText}${currentNote.body.slice(end)}`;
      handleUpdateCurrentNote({ body: nextBody }, true);
    } else if (contextMenuTarget.source === 'adf' && jiraEditorRef.current) {
      jiraEditorRef.current.pasteTextInActiveTarget(clipText);
    }
    setContextMenuTarget(null);
  };

  const handleContextMenuSelectAll = () => {
    if (!contextMenuTarget) return;
    if (contextMenuTarget.source === 'title' && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    } else if (contextMenuTarget.source === 'markdown' && editorRef.current) {
      editorRef.current.focus();
      editorRef.current.select();
    } else if (contextMenuTarget.source === 'adf' && jiraEditorRef.current) {
      jiraEditorRef.current.selectAllInActiveTarget();
    }
    setContextMenuTarget(null);
  };

  const renderMarkdownSpellcheckBackdrop = () => {
    const body = currentNote.body || '';
    if (!spellCheckEnabled || !body) return null;
    if (activeMisspellings.length === 0) {
      return <span>{body}</span>;
    }
    const nodes: React.ReactNode[] = [];
    let cursor = 0;
    activeMisspellings.forEach((m, idx) => {
      if (m.start > cursor) {
        nodes.push(
          <React.Fragment key={`bd-txt-${idx}`}>
            {body.slice(cursor, m.start)}
          </React.Fragment>
        );
      }
      nodes.push(
        <span
          key={`bd-err-${idx}-${m.start}`}
          data-spellcheck-error="true"
          data-misspelled-word={m.word}
          data-spellcheck-start={m.start}
          data-spellcheck-end={m.end}
          className="sf-misspelled-backdrop"
        >
          {body.slice(m.start, m.end)}
        </span>
      );
      cursor = m.end;
    });
    if (cursor < body.length) {
      nodes.push(
        <React.Fragment key="bd-txt-end">{body.slice(cursor)}</React.Fragment>
      );
    }
    if (body.endsWith('\n')) {
      nodes.push('\n');
    }
    return nodes;
  };

  const renderSpellcheckedTextFragment = (
    plainSegment: string,
    keyPrefix: string
  ): React.ReactNode => {
    if (!spellCheckEnabled || !plainSegment) return plainSegment;
    const wordRegex = /[A-Za-z][A-Za-z'’]*[A-Za-z]|[A-Za-z]+/g;
    const pieces: React.ReactNode[] = [];
    let lastIdx = 0;
    let match: RegExpExecArray | null;
    while ((match = wordRegex.exec(plainSegment)) !== null) {
      const word = match[0];
      const wStart = match.index;
      const wEnd = wStart + word.length;
      if (!isWordSpelledCorrectly(word, customDictSet, ignoredWordsSet)) {
        if (wStart > lastIdx) {
          pieces.push(plainSegment.slice(lastIdx, wStart));
        }
        pieces.push(
          <span
            key={`${keyPrefix}-sp-${wStart}`}
            data-spellcheck-error="true"
            data-misspelled-word={word}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const occ = activeMisspellings.find(
                (m) => m.word.toLowerCase() === word.toLowerCase()
              );
              const suggestions = getSpellingSuggestions(word, {
                customDictionary: customDictSet,
              });
              setContextMenuTarget({
                x: e.clientX || 160,
                y: e.clientY || 180,
                source: 'markdown',
                word,
                wordStart: occ ? occ.start : 0,
                wordEnd: occ ? occ.end : word.length,
                isMisspelled: true,
                suggestions,
                hasSelection: false,
                selectedText: '',
                occurrenceCount: countOccurrencesOfWord(word, 'markdown'),
              });
            }}
            className="sf-misspelled-word"
          >
            {word}
          </span>
        );
        lastIdx = wEnd;
      }
    }
    if (pieces.length === 0) return plainSegment;
    if (lastIdx < plainSegment.length) {
      pieces.push(plainSegment.slice(lastIdx));
    }
    return pieces;
  };

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
            {renderSpellcheckedTextFragment(part.slice(2, -2), `${key}-b`)}
          </strong>
        );
      }

      if (part.startsWith('~~') && part.endsWith('~~') && part.length > 4) {
        return (
          <span key={key} className="line-through text-slate-400">
            {renderSpellcheckedTextFragment(part.slice(2, -2), `${key}-s`)}
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
            {renderSpellcheckedTextFragment(part.slice(1, -1), `${key}-i`)}
          </em>
        );
      }

      const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        const rawHref = linkMatch[2].trim();
        if (!isSafeAdfUrl(rawHref)) {
          return <React.Fragment key={key}>{part}</React.Fragment>;
        }
        return (
          <a
            key={key}
            href={rawHref}
            target="_blank"
            rel="noopener noreferrer"
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

      return (
        <React.Fragment key={key}>
          {renderSpellcheckedTextFragment(part, key)}
        </React.Fragment>
      );
    });
  };

  const renderMarkdownPreview = () => {
    const lines = currentNote.body.split('\n');
    if (!currentNote.body.trim()) {
      return (
        <p className="text-xs text-slate-500 italic">
          Nothing to preview yet. Switch to Edit or dictate with the microphone
          above.
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
        const { laidOut, svgMarkup } = renderCachedMermaidPreview(rawMermaid);

        elements.push(
          <div
            key={`mermaid-block-${startIdx}`}
            data-testid="note-mermaid-diagram"
            className="my-2 rounded-xl border border-indigo-500/30 bg-slate-950/90 overflow-hidden shadow-lg"
          >
            <div className="px-3 py-1.5 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between gap-2 text-[10px]">
              <span className="font-mono text-emerald-300 flex items-center gap-1.5">
                <GitBranch
                  className="w-3 h-3 text-indigo-400"
                  aria-hidden="true"
                />
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
              <div className="p-2 overflow-x-auto">
                <img
                  src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(
                    svgMarkup
                  )}`}
                  alt={`Rendered ${
                    laidOut?.diagramType || 'flowchart'
                  } Mermaid diagram`}
                  className="w-full h-auto max-h-56 object-contain"
                />
              </div>
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
        const labelText = (
          uncheckedMatch?.[1] ??
          checkedMatch?.[1] ??
          ''
        ).trim();
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
      <div className="space-y-1.5 cq-note-prose text-slate-200 leading-relaxed select-text">
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
            className="min-w-0 flex-1 flex items-center gap-1.5 overflow-x-auto pb-1"
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
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition flex items-center gap-1.5 shrink-0 max-w-[175px] ${
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
                  {n.format === 'adf' && (
                    <span
                      className={`px-1 py-0.2 rounded text-[8px] font-bold uppercase tracking-wider shrink-0 ${
                        isActive
                          ? 'bg-black/25 text-white'
                          : 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                      }`}
                    >
                      ADF
                    </span>
                  )}
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
              <FolderOpen
                className="w-3.5 h-3.5 text-indigo-400"
                aria-hidden="true"
              />
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
                className="cq-note-search pl-7 pr-2 py-1 rounded-xl bg-slate-900 border border-slate-800 text-[11px] text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {selectedTagFilter && (
              <button
                type="button"
                data-testid="active-tag-filter-pill"
                onClick={() => setSelectedTagFilter(null)}
                title={`Filtering notes by #${selectedTagFilter} (Click to clear)`}
                className="px-2 py-1 rounded-xl bg-indigo-600/25 border border-indigo-400/50 text-[10px] font-medium text-indigo-200 flex items-center gap-1 shrink-0"
              >
                <span>#{selectedTagFilter}</span>
                <X className="w-2.5 h-2.5" aria-hidden="true" />
              </button>
            )}

            <button
              type="button"
              aria-label="New Note"
              title="Create New Note"
              onClick={handleCreateNewNote}
              className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-slate-200 flex items-center gap-1 shrink-0"
            >
              <FilePlus
                className="w-3.5 h-3.5 text-indigo-400"
                aria-hidden="true"
              />
              <span className="cq-show-440">New Note</span>
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
                <FolderOpen
                  className="w-3.5 h-3.5 text-indigo-400"
                  aria-hidden="true"
                />
                All Notes ({sortedAndFilteredNotes.length} of {notes.length}) —
                Click a card to switch active note
              </span>
              <button
                type="button"
                aria-label="Collapse Note Switcher"
                onClick={() => setIsNoteSwitcherOpen(false)}
                className="min-h-[24px] text-[10px] text-slate-300 hover:text-white px-2 py-0.5 rounded bg-slate-900 border border-slate-800"
              >
                Collapse
              </button>
            </div>

            <div className="cq-notes-switcher-grid">
              {sortedAndFilteredNotes.map((n) => {
                const accent =
                  ACCENT_COLORS.find((c) => c.id === n.color) ||
                  ACCENT_COLORS[0];
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
                    onClick={() => setActiveNoteId(n.id)}
                    className={`relative text-left p-2.5 rounded-xl border transition flex flex-col justify-between gap-1.5 cursor-pointer ${
                      isActive
                        ? 'bg-indigo-600/20 border-indigo-500/60 ring-1 ring-indigo-500/40'
                        : 'bg-slate-900/80 hover:bg-slate-900 border-slate-800/90'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <button
                        type="button"
                        aria-pressed={isActive}
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveNoteId(n.id);
                        }}
                        className="flex items-center gap-1.5 min-w-0 flex-1 text-left rounded px-0.5 py-0.5 cursor-pointer after:content-[''] after:absolute after:inset-0 after:rounded-xl"
                      >
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${accent.dotClass}`}
                        />
                        <span className="text-xs font-semibold text-white truncate">
                          {n.title || 'Untitled'}
                        </span>
                        <span
                          className={`px-1 py-0.2 rounded text-[9px] font-bold uppercase shrink-0 ${
                            n.format === 'adf'
                              ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {n.format === 'adf' ? 'ADF' : 'MD'}
                        </span>
                      </button>
                      <div className="relative z-10 flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          aria-label={`${n.pinned ? 'Unpin' : 'Pin'} ${
                            n.title || 'Untitled'
                          }`}
                          onClick={(e) => handleTogglePinNoteById(n.id, e)}
                          className={`w-6 h-6 flex items-center justify-center rounded hover:bg-slate-800 transition ${
                            n.pinned
                              ? 'text-indigo-400'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <Pin className="w-3 h-3" aria-hidden="true" />
                        </button>
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-300 line-clamp-2 leading-snug">
                      {snippet}
                    </p>

                    <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5 border-t border-slate-800/60">
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

      {/* Voice Dictation Bar (Scoped to Voice & STT Controls) */}
      <VoiceBar
        onTranscript={handleVoiceTranscript}
        onInsertTimestamp={handleInsertTimestamp}
        isPanelOpen={isPanelOpen}
        isActiveTab={isActiveTab}
        onDictatingChange={handleDictatingStateChange}
        onInterimChange={handleLiveInterimChange}
        promptContext={effectiveTextForStats.slice(-240)}
        onNotify={onNotify}
      />

      {/* Note Title, Format Toggle (MD / Jira ADF), Organization Tags & Editor */}
      <div className="flex-1 flex flex-col bg-slate-950/60 border border-slate-800/90 rounded-2xl overflow-hidden">
        {/* Note Header: Title + Color Accent + Pin + Copy/Export + Undo/Redo + Clear/Delete */}
        <div className="px-3.5 py-2 border-b border-slate-800/80 flex items-center justify-between gap-2 flex-wrap">
          <input
            ref={titleInputRef}
            id="note-title-input"
            type="text"
            aria-label="Note Title"
            spellCheck={spellCheckEnabled}
            value={currentNote.title}
            onChange={(e) =>
              handleUpdateCurrentNote({ title: e.target.value }, false)
            }
            onContextMenu={handleTitleContextMenu}
            placeholder="Note Title..."
            className="bg-transparent text-sm font-semibold text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 rounded px-1 -mx-1 min-w-[110px] flex-1"
          />

          <div className="flex items-center gap-0.5 flex-wrap shrink-0">
            {/* Color Accent Dots */}
            <div
              className="cq-show-440 items-center gap-0.5 mr-1 px-1 py-0.5 rounded-lg bg-slate-900/80 border border-slate-800"
              role="group"
              aria-label="Note Color Tag"
            >
              {ACCENT_COLORS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-label={`Set note color ${c.id}`}
                  aria-pressed={(currentNote.color || 'indigo') === c.id}
                  onClick={() =>
                    handleUpdateCurrentNote({ color: c.id }, false)
                  }
                  className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-slate-800 transition"
                >
                  <span
                    className={`w-2.5 h-2.5 rounded-full transition ${
                      c.dotClass
                    } ${
                      (currentNote.color || 'indigo') === c.id
                        ? 'ring-2 ring-white scale-110'
                        : 'opacity-60 hover:opacity-100'
                    }`}
                  />
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleTogglePinCurrentNote}
              aria-label={currentNote.pinned ? 'Unpin Note' : 'Pin Note'}
              aria-pressed={Boolean(currentNote.pinned)}
              title={currentNote.pinned ? 'Unpin Note' : 'Pin Note to Front'}
              className={`w-7 h-7 flex items-center justify-center rounded-lg transition ${
                currentNote.pinned
                  ? 'text-indigo-400 bg-indigo-500/15'
                  : 'text-slate-400 hover:text-indigo-300 hover:bg-slate-900'
              }`}
            >
              <Pin className="w-3.5 h-3.5" aria-hidden="true" />
            </button>

            <button
              type="button"
              data-testid={
                currentFormat === 'adf'
                  ? 'copy-for-jira-btn'
                  : 'copy-markdown-btn'
              }
              onClick={handleCopyNoteContent}
              aria-label="Copy Note"
              title={
                currentFormat === 'adf'
                  ? 'Copy Rich Formatted Content for Direct Paste into Jira Cloud Description'
                  : 'Copy Note Markdown'
              }
              className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-900 transition"
            >
              <Copy className="w-3.5 h-3.5" aria-hidden="true" />
            </button>

            <button
              type="button"
              data-testid="duplicate-note-btn"
              onClick={handleDuplicateCurrentNote}
              aria-label="Duplicate Note"
              title="Duplicate Note (Create a copy of this note)"
              className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-300 hover:bg-slate-900 transition"
            >
              <CopyPlus className="w-3.5 h-3.5" aria-hidden="true" />
            </button>

            {currentFormat === 'adf' && (
              <button
                type="button"
                data-testid="copy-adf-json-btn"
                onClick={handleCopyAdfJson}
                aria-label="Copy ADF JSON"
                title="Copy Canonical Jira ADF v1 JSON Payload"
                className="min-h-[28px] px-1.5 rounded-lg text-[10px] font-mono font-semibold text-sky-300 hover:text-white hover:bg-sky-600/25 border border-sky-500/30 flex items-center gap-1 transition"
              >
                <Braces className="w-3 h-3" aria-hidden="true" />
                <span className="cq-show-440">JSON</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleExportNote}
              aria-label="Export Note"
              title={
                currentFormat === 'adf'
                  ? 'Download Note as Jira ADF (.adf.json)'
                  : 'Download Note as Markdown (.md)'
              }
              className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-900 transition"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={handleUndo}
              disabled={!canUndo}
              aria-label="Undo Note Edit"
              title="Undo (Ctrl+Z)"
              className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-900 disabled:opacity-30 disabled:pointer-events-none transition"
            >
              <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={handleRedo}
              disabled={!canRedo}
              aria-label="Redo Note Edit"
              title="Redo (Ctrl+Y)"
              className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-900 disabled:opacity-30 disabled:pointer-events-none transition"
            >
              <Redo2 className="w-3.5 h-3.5" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={handleClearCurrentNote}
              aria-label="Clear Note Text"
              title="Clear Note Text"
              disabled={
                currentFormat === 'adf'
                  ? !effectiveTextForStats.trim() &&
                    currentAdfDoc.content.length <= 1 &&
                    currentAdfDoc.content[0]?.type === 'paragraph'
                  : !currentNote.body
              }
              className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-amber-300 hover:bg-slate-900 disabled:opacity-30 disabled:pointer-events-none transition"
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
              className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-900 disabled:opacity-40 disabled:pointer-events-none transition"
            >
              <Trash className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Format Mode Toggle (Option 1: Markdown MD | Option 2: Jira ADF) + Contextual Controls + View Mode Switcher */}
        <div className="px-3 py-1.5 bg-slate-900/50 border-b border-slate-800/70 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Segmented Format Toggle: Markdown (MD) vs Jira ADF */}
            <div
              data-testid="note-format-toggle"
              role="group"
              aria-label="Note Formatting Engine"
              className="inline-flex items-center bg-slate-950 rounded-lg p-0.5 border border-slate-800 text-[10px] font-semibold shrink-0"
            >
              <button
                type="button"
                data-testid="format-mode-markdown"
                aria-pressed={currentFormat === 'markdown'}
                onClick={() => handleSwitchFormatMode('markdown')}
                title="Option 1: Standard Markdown (MD) editor & preview"
                className={`min-h-[24px] px-2 py-0.5 rounded-md flex items-center gap-1 transition ${
                  currentFormat === 'markdown'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <FileCode2 className="w-3 h-3" aria-hidden="true" />
                <span>Markdown (MD)</span>
              </button>

              <button
                type="button"
                data-testid="format-mode-adf"
                aria-pressed={currentFormat === 'adf'}
                onPointerEnter={() => {
                  void JiraAdfEditor.preload();
                }}
                onFocus={() => {
                  void JiraAdfEditor.preload();
                }}
                onClick={() => handleSwitchFormatMode('adf')}
                title="Option 2: Jira ADF (Atlassian Document Format v1) WYSIWYG Description Editor"
                className={`min-h-[24px] px-2 py-0.5 rounded-md flex items-center gap-1 transition ${
                  currentFormat === 'adf'
                    ? 'bg-sky-600 text-white shadow'
                    : 'text-slate-400 hover:text-sky-300'
                }`}
              >
                <Braces className="w-3 h-3" aria-hidden="true" />
                <span>Jira ADF</span>
              </button>
            </div>

            {/* Markdown quick formatting buttons (shown when Markdown (MD) is active; Jira ADF renders its full Jira toolbar below) */}
            {currentFormat === 'markdown' && (
              <>
                <div className="h-3.5 w-px bg-slate-800 mx-0.5" />
                <div className="flex items-center gap-0.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => handleFormatMarkdown('bold')}
                    aria-label="Format Bold"
                    title="Bold (**text**)"
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                  >
                    <Bold className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFormatMarkdown('italic')}
                    aria-label="Format Italic"
                    title="Italic (*text*)"
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                  >
                    <Italic className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFormatMarkdown('heading')}
                    aria-label="Format Heading"
                    title="Heading (###)"
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                  >
                    <Heading2 className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFormatMarkdown('bullet')}
                    aria-label="Insert Bullet List"
                    title="Bullet List (- item)"
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                  >
                    <List className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFormatMarkdown('task')}
                    aria-label="Insert Task Checkbox"
                    title="Task Checklist (- [ ] item)"
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-300 hover:bg-slate-800 transition"
                  >
                    <CheckSquare className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFormatMarkdown('code')}
                    aria-label="Format Inline Code"
                    title="Inline Code (`code`)"
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                  >
                    <Code className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFormatMarkdown('mermaid')}
                    aria-label="Insert Mermaid Diagram"
                    title="Insert Mermaid Diagram Block (```mermaid)"
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-emerald-300 hover:bg-slate-800 transition"
                  >
                    <GitBranch className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                  {onOpenMermaidInFlow && (
                    <button
                      type="button"
                      data-testid="convert-note-to-flow-btn"
                      onClick={handleConvertNoteToFlow}
                      aria-label="Convert List to Flowchart"
                      title="Convert note bullets or checklist items into an interactive Flowchart on the Flow tab"
                      className="min-h-[24px] px-2 py-0.5 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-500/30 text-[10px] font-medium text-emerald-300 hover:text-white flex items-center gap-1 transition ml-0.5"
                    >
                      <GitBranch className="w-3 h-3" aria-hidden="true" />
                      <span>List → Flow</span>
                    </button>
                  )}
                  {taskStats.total > 0 && (
                    <div className="inline-flex items-center gap-1 ml-1 px-1.5 py-0.5 rounded-lg bg-slate-950/90 border border-slate-800 text-[10px]">
                      <span
                        data-testid="md-task-progress-badge"
                        className="font-mono text-indigo-300"
                      >
                        {taskStats.completed}/{taskStats.total} Done
                      </span>
                      {taskStats.completed > 0 && (
                        <button
                          type="button"
                          data-testid="reset-md-tasks-btn"
                          onClick={handleResetMarkdownChecklist}
                          aria-label="Reset completed checklist tasks"
                          title="Uncheck all completed tasks (- [x] → - [ ])"
                          className="p-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-amber-300 transition"
                        >
                          <RotateCcw className="w-2.5 h-2.5" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}

            <div className="h-3.5 w-px bg-slate-800 mx-0.5" />

            {/* Tags Pills & Add Tag */}
            <div className="flex items-center gap-1 flex-wrap">
              {(currentNote.tags || []).map((tag) => {
                const isTagFiltered =
                  selectedTagFilter?.toLowerCase() === tag.toLowerCase();
                return (
                  <span
                    key={tag}
                    className={`inline-flex items-center gap-0.5 pl-1.5 pr-0.5 py-0.5 rounded-md border text-[10px] transition ${
                      isTagFiltered
                        ? 'bg-indigo-600/35 text-white border-indigo-400'
                        : 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
                    }`}
                  >
                    <button
                      type="button"
                      data-testid={`note-tag-filter-${tag}`}
                      aria-pressed={isTagFiltered}
                      onClick={() =>
                        setSelectedTagFilter((prev) =>
                          prev?.toLowerCase() === tag.toLowerCase() ? null : tag
                        )
                      }
                      title={`Filter notes by #${tag}`}
                      className="hover:underline cursor-pointer"
                    >
                      #{tag}
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove tag ${tag}`}
                      onClick={() => handleRemoveTag(tag)}
                      className="w-6 h-6 inline-flex items-center justify-center rounded hover:bg-indigo-500/20 hover:text-white transition"
                    >
                      <X className="w-2.5 h-2.5" aria-hidden="true" />
                    </button>
                  </span>
                );
              })}
              {showTagInput ? (
                <form
                  onSubmit={handleAddTag}
                  className="inline-flex items-center"
                >
                  <input
                    type="text"
                    aria-label="New Note Tag"
                    value={newTagText}
                    onChange={(e) => setNewTagText(e.target.value)}
                    onBlur={() => setShowTagInput(false)}
                    placeholder="tag..."
                    autoFocus
                    className="w-16 min-h-[24px] px-1.5 py-0.5 rounded bg-slate-900 border border-indigo-500/50 text-[10px] text-white focus:outline-none"
                  />
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowTagInput(true)}
                  aria-label="Add Tag"
                  title="Add Category Tag"
                  className="min-h-[24px] px-2 py-0.5 rounded-md text-[10px] text-slate-300 hover:text-white hover:bg-slate-800 flex items-center gap-1"
                >
                  <Tag className="w-2.5 h-2.5" aria-hidden="true" /> Tag
                </button>
              )}
            </div>

            <div className="h-3.5 w-px bg-slate-800 mx-0.5" />

            {/* Chrome / Word-Style Spellcheck & Proofing Button (F7) */}
            <div className="relative inline-flex items-center">
              <button
                type="button"
                data-testid="toggle-spellcheck-proofing-btn"
                aria-label="Spellcheck & Proofing"
                aria-expanded={isProofingOpen}
                aria-pressed={spellCheckEnabled}
                title={`Spelling & Dictionary Proofing (F7) — ${
                  !spellCheckEnabled
                    ? 'Spellcheck Disabled'
                    : activeMisspellings.length === 0
                    ? 'No spelling issues'
                    : `${activeMisspellings.length} spelling issue${
                        activeMisspellings.length === 1 ? '' : 's'
                      }`
                }`}
                onClick={() => setIsProofingOpen((prev) => !prev)}
                className={`min-h-[24px] px-2 py-0.5 rounded-md border text-[10px] font-medium flex items-center gap-1 transition ${
                  isProofingOpen
                    ? 'bg-indigo-600/25 border-indigo-500/60 text-indigo-200'
                    : spellCheckEnabled && activeMisspellings.length > 0
                    ? 'bg-rose-500/15 border-rose-500/40 text-rose-200 hover:bg-rose-500/25'
                    : spellCheckEnabled
                    ? 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800'
                    : 'bg-slate-950 border-slate-800/80 text-slate-500 hover:text-slate-300'
                }`}
              >
                <SpellCheck
                  className={`w-3 h-3 ${
                    !spellCheckEnabled
                      ? 'text-slate-500'
                      : activeMisspellings.length > 0
                      ? 'text-rose-400'
                      : 'text-emerald-400'
                  }`}
                  aria-hidden="true"
                />
                <span>ABC</span>
                {spellCheckEnabled && activeMisspellings.length > 0 && (
                  <span
                    data-testid="spellcheck-issue-count-badge"
                    className="px-1 py-0.2 rounded-full bg-rose-500 text-white font-mono text-[9px] font-bold leading-none"
                  >
                    {activeMisspellings.length}
                  </span>
                )}
              </button>

              {isProofingOpen && (
                <div className="absolute left-0 top-full mt-1.5 z-50 w-80 sm:w-96">
                  <SpellcheckProofingPopover
                    spellCheckEnabled={spellCheckEnabled}
                    onToggleSpellCheck={(next) => setSpellCheckEnabled(next)}
                    misspellings={activeMisspellings}
                    customDictionary={customDictionary}
                    onApplyCorrection={(match, replacement) =>
                      handleReplaceMisspelling(replacement, {
                        source: currentFormat === 'adf' ? 'adf' : 'markdown',
                        wordStart: match.start,
                        wordEnd: match.end,
                        adfTargetId: match.adfTargetId,
                        word: match.word,
                      })
                    }
                    onChangeAllOccurrences={(word, replacement) =>
                      handleReplaceAllMisspellings(word, replacement)
                    }
                    onFixAllMisspellings={handleFixAllMisspellings}
                    onIgnoreWord={handleIgnoreWord}
                    onAddWordToDictionary={handleAddWordToDictionary}
                    onRemoveWordFromDictionary={handleRemoveWordFromDictionary}
                    onClose={() => setIsProofingOpen(false)}
                  />
                </div>
              )}
            </div>
          </div>

          {/* View Mode Switcher: Edit / Split / Preview (MD) OR Visual / Split / ADF JSON (Jira ADF) */}
          <div
            className="flex items-center bg-slate-950 rounded-lg p-0.5 border border-slate-800 text-[10px]"
            role="group"
            aria-label="Note Editor View Mode"
          >
            <button
              type="button"
              onClick={() => setViewMode('edit')}
              aria-pressed={viewMode === 'edit'}
              className={`min-h-[24px] px-2 py-0.5 rounded-md flex items-center gap-1 transition ${
                viewMode === 'edit'
                  ? currentFormat === 'adf'
                    ? 'bg-sky-600 text-white'
                    : 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Edit3 className="w-2.5 h-2.5" aria-hidden="true" />{' '}
              {currentFormat === 'adf' ? 'Visual' : 'Edit'}
            </button>
            <button
              type="button"
              onClick={() => setViewMode('split')}
              aria-pressed={viewMode === 'split'}
              className={`min-h-[24px] px-2 py-0.5 rounded-md flex items-center gap-1 transition ${
                viewMode === 'split'
                  ? currentFormat === 'adf'
                    ? 'bg-sky-600 text-white'
                    : 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Columns className="w-2.5 h-2.5" aria-hidden="true" /> Split
            </button>
            <button
              type="button"
              onClick={() => setViewMode('preview')}
              aria-pressed={viewMode === 'preview'}
              className={`min-h-[24px] px-2 py-0.5 rounded-md flex items-center gap-1 transition ${
                viewMode === 'preview'
                  ? currentFormat === 'adf'
                    ? 'bg-sky-600 text-white'
                    : 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {currentFormat === 'adf' ? (
                <>
                  <Braces className="w-2.5 h-2.5" aria-hidden="true" /> ADF JSON
                </>
              ) : (
                <>
                  <Eye className="w-2.5 h-2.5" aria-hidden="true" /> Preview
                </>
              )}
            </button>
          </div>
        </div>

        {/* Main Workspace Area: Markdown Mode OR Jira ADF Description Editor Mode */}
        <div className="relative flex-1 flex flex-col min-h-0 overflow-hidden">
          {currentFormat === 'markdown' ? (
            <div
              className={`flex-1 overflow-hidden ${
                viewMode === 'split' ? 'cq-split-editor' : 'flex'
              }`}
            >
              {viewMode !== 'preview' && (
                <div
                  className={`${
                    viewMode === 'split' ? 'cq-split-pane' : 'w-full h-full'
                  } relative flex flex-col min-h-0 overflow-hidden`}
                >
                  {spellCheckEnabled && (
                    <div
                      ref={markdownBackdropRef}
                      data-testid="markdown-spellcheck-backdrop"
                      aria-hidden="true"
                      className={`pointer-events-none absolute inset-0 p-4 ${
                        isNoteDictating &&
                        (liveInterim.text ||
                          liveInterim.isSpeaking ||
                          liveInterim.isProcessing)
                          ? 'pb-12'
                          : ''
                      } cq-note-prose leading-relaxed whitespace-pre-wrap break-words overflow-hidden text-transparent select-none`}
                    >
                      {renderMarkdownSpellcheckBackdrop()}
                    </div>
                  )}
                  <textarea
                    ref={editorRef}
                    id="note-body-input"
                    aria-label="Note Body"
                    spellCheck={spellCheckEnabled}
                    value={currentNote.body}
                    onChange={(e) => {
                      lastDialogueTurnRef.current = null;
                      const pos =
                        e.target.selectionStart ?? e.target.value.length;
                      lastInsertPosMapRef.current[currentNote.id] = pos;
                      handleUpdateCurrentNote(
                        { body: e.target.value },
                        true,
                        true
                      );
                    }}
                    onContextMenu={handleMarkdownEditorContextMenu}
                    onScroll={(e) => {
                      if (markdownBackdropRef.current) {
                        markdownBackdropRef.current.scrollTop =
                          e.currentTarget.scrollTop;
                        markdownBackdropRef.current.scrollLeft =
                          e.currentTarget.scrollLeft;
                      }
                    }}
                    onSelect={syncEditorCursor}
                    onClick={syncEditorCursor}
                    onKeyUp={syncEditorCursor}
                    onKeyDown={(e) => {
                      if (
                        (e.ctrlKey || e.metaKey) &&
                        e.key.toLowerCase() === 'z'
                      ) {
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
                    className={`relative z-10 w-full h-full bg-transparent p-4 ${
                      isNoteDictating &&
                      (liveInterim.text ||
                        liveInterim.isSpeaking ||
                        liveInterim.isProcessing)
                        ? 'pb-12'
                        : ''
                    } cq-note-prose text-slate-200 placeholder-slate-400 leading-relaxed focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500/40 resize-none select-text overflow-y-auto`}
                  />
                </div>
              )}

              {(viewMode === 'preview' || viewMode === 'split') && (
                <div
                  data-testid="note-markdown-preview"
                  aria-label="Markdown & Task Checklist Preview"
                  className={`${
                    viewMode === 'split' ? 'cq-split-pane' : 'w-full h-full'
                  } p-4 ${
                    isNoteDictating &&
                    (liveInterim.text ||
                      liveInterim.isSpeaking ||
                      liveInterim.isProcessing)
                      ? 'pb-12'
                      : ''
                  } overflow-y-auto bg-slate-950/30`}
                >
                  {viewMode === 'split' && (
                    <div className="mb-2 pb-1 border-b border-slate-800/80 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-indigo-400">
                      <span>Live Markdown Preview</span>
                      <span className="text-slate-400 font-normal normal-case">
                        Rendered Output
                      </span>
                    </div>
                  )}
                  {renderMarkdownPreview()}
                </div>
              )}
            </div>
          ) : (
            <div
              className={`flex-1 overflow-hidden ${
                viewMode === 'split' ? 'cq-split-editor' : 'flex'
              }`}
            >
              {/* Left/Primary Pane: Full WYSIWYG Jira Cloud Description Editor */}
              {viewMode !== 'preview' && (
                <div
                  className={`${
                    viewMode === 'split' ? 'cq-split-pane' : 'w-full h-full'
                  } flex flex-col min-h-0 overflow-hidden`}
                >
                  <JiraAdfEditor
                    key={currentNote.id}
                    ref={jiraEditorRef}
                    doc={currentAdfDoc}
                    onChangeDoc={(nextDoc) => {
                      lastDialogueTurnRef.current = null;
                      handleChangeAdfDoc(nextDoc, true, true);
                    }}
                    onUndo={handleUndo}
                    onRedo={handleRedo}
                    canUndo={canUndo}
                    canRedo={canRedo}
                    onNotify={onNotify}
                    onOpenMermaidInFlow={onOpenMermaidInFlow}
                    spellCheckEnabled={spellCheckEnabled}
                    customDictionary={customDictionary}
                    ignoredWords={ignoredWords}
                    onSpellCheckContextMenu={handleAdfSpellCheckContextMenu}
                  />
                </div>
              )}

              {/* Right/Secondary Pane: Live Canonical ADF v1 JSON Inspector & Editor */}
              {(viewMode === 'preview' || viewMode === 'split') && (
                <div
                  data-testid="adf-json-pane"
                  aria-label="Atlassian Document Format v1 JSON Editor"
                  className={`${
                    viewMode === 'split' ? 'cq-split-pane' : 'w-full h-full'
                  } flex flex-col min-h-0 overflow-hidden bg-slate-950/80`}
                >
                  <div className="px-3 py-1.5 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between gap-2 text-[10px]">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Braces className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                      <span className="font-semibold text-sky-300 truncate">
                        ADF Schema v1 JSON
                      </span>
                      {adfJsonError ? (
                        <span
                          role="alert"
                          data-testid="adf-json-error-badge"
                          className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 inline-flex items-center gap-1 truncate"
                        >
                          <AlertCircle className="w-2.5 h-2.5 shrink-0" />
                          Invalid ADF
                        </span>
                      ) : (
                        <span
                          data-testid="adf-json-valid-badge"
                          className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono whitespace-nowrap"
                        >
                          version: 1 • valid
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={handleFormatRawAdfJson}
                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition"
                      >
                        Prettify
                      </button>
                      <button
                        type="button"
                        onClick={handleCopyAdfJson}
                        className="px-2 py-0.5 rounded bg-sky-600 hover:bg-sky-500 text-white font-medium transition"
                      >
                        Copy JSON
                      </button>
                    </div>
                  </div>

                  {adfJsonError && (
                    <div className="px-3 py-1.5 bg-rose-950/60 border-b border-rose-500/30 text-[11px] text-rose-200 font-mono">
                      {adfJsonError}
                    </div>
                  )}

                  <textarea
                    data-testid="adf-json-textarea"
                    aria-label="Raw Jira ADF JSON"
                    value={adfJsonDraft}
                    onChange={(e) => handleRawAdfJsonInput(e.target.value)}
                    onBlur={() => {
                      if (!adfJsonError) {
                        isEditingRawJsonRef.current = false;
                      }
                    }}
                    spellCheck={false}
                    className="flex-1 w-full bg-transparent p-3 font-mono text-[11px] text-sky-200 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-sky-500/40 resize-none select-text overflow-y-auto leading-relaxed"
                  />
                </div>
              )}
            </div>
          )}

          {isNoteDictating &&
            (liveInterim.text ||
              liveInterim.isSpeaking ||
              liveInterim.isProcessing) && (
              <div
                data-testid="note-live-interim-banner"
                aria-hidden="true"
                className={`pointer-events-none absolute inset-x-3 bottom-2.5 z-10 rounded-xl bg-slate-900/95 backdrop-blur-md border shadow-lg shadow-slate-950/70 px-3 py-1.5 flex items-center gap-2 ${
                  liveInterim.isDialogue &&
                  liveInterim.speakerRole === 'external'
                    ? 'border-cyan-500/45'
                    : 'border-indigo-500/40'
                }`}
              >
                <span className="inline-flex items-center gap-1.5 shrink-0 max-w-[130px] min-w-0">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      liveInterim.isDialogue
                        ? liveInterim.speakerRole === 'external'
                          ? 'bg-cyan-400 animate-pulse'
                          : 'bg-indigo-400 animate-pulse'
                        : liveInterim.isSpeaking
                        ? 'bg-rose-500 animate-pulse'
                        : 'bg-indigo-400 animate-pulse'
                    }`}
                  />
                  <span
                    className={`text-[10px] font-mono font-semibold uppercase tracking-wider truncate ${
                      liveInterim.isDialogue &&
                      liveInterim.speakerRole === 'external'
                        ? 'text-cyan-300'
                        : 'text-indigo-300'
                    }`}
                  >
                    {liveInterim.isDialogue && liveInterim.speakerLabel
                      ? `LIVE • ${liveInterim.speakerLabel}`
                      : 'LIVE'}
                  </span>
                </span>
                <div className="flex-1 min-w-0 overflow-hidden flex justify-end [mask-image:linear-gradient(to_right,transparent,black_18px)]">
                  <span
                    className={`whitespace-nowrap text-xs italic ${
                      liveInterim.isDialogue &&
                      liveInterim.speakerRole === 'external'
                        ? 'text-cyan-50'
                        : 'text-indigo-100'
                    }`}
                  >
                    {liveInterim.text ||
                      (liveInterim.isSpeaking
                        ? liveInterim.isDialogue && liveInterim.speakerLabel
                          ? `${liveInterim.speakerLabel} speaking…`
                          : 'Listening at cursor…'
                        : 'Committing phrase…')}
                  </span>
                </div>
              </div>
            )}
        </div>

        {/* Footer Status Bar */}
        <div className="px-4 py-2 bg-slate-950/80 border-t border-slate-800/70 flex items-center justify-between flex-wrap gap-2 text-[11px] text-slate-400">
          <div className="flex items-center gap-2">
            <span id="note-word-count">
              {wordsCount} words • {charsCount} chars
            </span>
            <span
              data-testid="note-active-format-indicator"
              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                currentFormat === 'adf'
                  ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
                  : 'bg-slate-900 text-slate-400 border border-slate-800'
              }`}
            >
              {currentFormat === 'adf' ? 'Jira ADF v1' : 'Markdown'}
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

      {/* Chrome & Word-Style Right-Click Spellcheck Context Menu */}
      {contextMenuTarget && (
        <SpellcheckContextMenu
          target={contextMenuTarget}
          spellCheckEnabled={spellCheckEnabled}
          onSelectSuggestion={(replacement) =>
            handleReplaceMisspelling(replacement)
          }
          onChangeAllOccurrences={(replacement) => {
            if (contextMenuTarget.word) {
              handleReplaceAllMisspellings(
                contextMenuTarget.word,
                replacement
              );
            }
          }}
          onIgnoreWord={(word) => handleIgnoreWord(word)}
          onAddToDictionary={(word) => handleAddWordToDictionary(word)}
          onToggleSpellCheck={() => {
            setSpellCheckEnabled((prev) => !prev);
            setContextMenuTarget(null);
          }}
          onOpenProofingPanel={() => {
            setContextMenuTarget(null);
            setIsProofingOpen(true);
          }}
          onCut={handleContextMenuCut}
          onCopy={handleContextMenuCopy}
          onPaste={handleContextMenuPaste}
          onSelectAll={handleContextMenuSelectAll}
          onClose={() => setContextMenuTarget(null)}
        />
      )}
    </section>
  );
};
