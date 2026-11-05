import React, { useState, useEffect, useRef } from 'react';
import {
  SpellCheck,
  Check,
  Plus,
  BookMarked,
  EyeOff,
  Scissors,
  Copy,
  ClipboardPaste,
  CheckSquare,
  Sparkles,
  X,
  Trash2,
} from 'lucide-react';
import { MisspellingMatch } from '../../utils/spellcheck';

export interface SpellcheckContextTarget {
  x: number;
  y: number;
  source: 'title' | 'markdown' | 'adf';
  adfTargetId?: string;
  word?: string;
  wordStart?: number;
  wordEnd?: number;
  isMisspelled: boolean;
  suggestions: string[];
  occurrenceCount: number;
  hasSelection: boolean;
  selectedText: string;
}

export interface SpellcheckContextMenuProps {
  target: SpellcheckContextTarget;
  spellCheckEnabled: boolean;
  onSelectSuggestion: (replacement: string) => void;
  onChangeAllOccurrences: (replacement: string) => void;
  onIgnoreWord: (word: string) => void;
  onAddToDictionary: (word: string) => void;
  onToggleSpellCheck: () => void;
  onOpenProofingPanel: () => void;
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onSelectAll: () => void;
  onClose: () => void;
}

export const SpellcheckContextMenu: React.FC<SpellcheckContextMenuProps> = ({
  target,
  spellCheckEnabled,
  onSelectSuggestion,
  onChangeAllOccurrences,
  onIgnoreWord,
  onAddToDictionary,
  onToggleSpellCheck,
  onOpenProofingPanel,
  onCut,
  onCopy,
  onPaste,
  onSelectAll,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (
        e.key === 'ArrowDown' ||
        e.key === 'ArrowUp' ||
        e.key === 'Home' ||
        e.key === 'End'
      ) {
        const container = menuRef.current;
        if (!container) return;
        const items = Array.from(
          container.querySelectorAll<HTMLButtonElement>(
            '[role="menuitem"]:not([disabled]), [role="menuitemcheckbox"]:not([disabled])'
          )
        );
        if (items.length === 0) return;
        e.preventDefault();
        const activeIdx = items.indexOf(
          document.activeElement as HTMLButtonElement
        );
        let nextIdx = 0;
        if (e.key === 'Home') {
          nextIdx = 0;
        } else if (e.key === 'End') {
          nextIdx = items.length - 1;
        } else if (e.key === 'ArrowDown') {
          nextIdx = activeIdx < 0 ? 0 : (activeIdx + 1) % items.length;
        } else {
          nextIdx =
            activeIdx <= 0 ? items.length - 1 : (activeIdx - 1) % items.length;
        }
        items[nextIdx]?.focus();
      }
    };
    const handleMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousedown', handleMouseDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousedown', handleMouseDown);
    };
  }, [onClose]);

  // Clamp coordinates so menu stays inside viewport
  const vw = typeof window !== 'undefined' ? window.innerWidth || 420 : 420;
  const vh = typeof window !== 'undefined' ? window.innerHeight || 720 : 720;
  const clampedLeft = Math.max(8, Math.min(target.x, vw - 236));
  const clampedTop = Math.max(8, Math.min(target.y, vh - 330));

  const showMisspellingSection =
    spellCheckEnabled && target.isMisspelled && Boolean(target.word);
  const topSuggestion = target.suggestions[0];

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Editor & Spellcheck Context Menu"
      data-testid="spellcheck-context-menu"
      style={{ left: `${clampedLeft}px`, top: `${clampedTop}px` }}
      onMouseDown={(e) => e.stopPropagation()}
      className="fixed z-50 w-56 rounded-xl bg-slate-900/98 backdrop-blur-md border border-slate-700/90 shadow-2xl shadow-black/80 py-1.5 text-xs text-slate-200 select-none"
    >
      {showMisspellingSection && target.word && (
        <>
          <div className="px-3 py-1 flex items-center justify-between gap-2 text-[10px] text-slate-400 border-b border-slate-800/80 mb-1">
            <span className="font-semibold uppercase tracking-wider text-rose-400 flex items-center gap-1">
              <SpellCheck className="w-3 h-3" aria-hidden="true" />
              Spelling
            </span>
            <span
              data-testid="context-menu-misspelled-word"
              className="font-mono text-rose-300 truncate max-w-[115px] underline decoration-rose-500 decoration-wavy"
            >
              {target.word}
            </span>
          </div>

          {target.suggestions.length > 0 ? (
            <div className="py-0.5">
              {target.suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  role="menuitem"
                  data-testid={`spellcheck-suggestion-${suggestion}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onSelectSuggestion(suggestion)}
                  className="w-full px-3 py-1.5 text-left font-bold text-white hover:bg-indigo-600/30 hover:text-indigo-200 flex items-center justify-between gap-2 transition"
                >
                  <span className="truncate">{suggestion}</span>
                  <span className="text-[9px] font-normal text-indigo-300/80 uppercase tracking-wider">
                    Replace
                  </span>
                </button>
              ))}

              {target.occurrenceCount > 1 && topSuggestion && (
                <button
                  type="button"
                  role="menuitem"
                  data-testid="spellcheck-change-all-btn"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onChangeAllOccurrences(topSuggestion)}
                  className="w-full px-3 py-1 text-left text-[11px] font-medium text-indigo-300 hover:bg-indigo-600/20 flex items-center justify-between gap-2 transition"
                >
                  <span className="truncate">
                    Change All to &ldquo;{topSuggestion}&rdquo;
                  </span>
                  <span className="px-1.5 py-0.2 rounded bg-indigo-500/20 text-[9px] font-mono">
                    {target.occurrenceCount}×
                  </span>
                </button>
              )}
            </div>
          ) : (
            <div
              data-testid="spellcheck-no-suggestions"
              className="px-3 py-1.5 text-[11px] italic text-slate-400"
            >
              No spelling suggestions
            </div>
          )}

          <div className="my-1 border-t border-slate-800/90" />

          <button
            type="button"
            role="menuitem"
            data-testid="spellcheck-ignore-word-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onIgnoreWord(target.word!)}
            className="w-full px-3 py-1.5 text-left text-slate-300 hover:bg-slate-800 hover:text-white flex items-center gap-2 transition"
          >
            <EyeOff className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>Ignore All</span>
          </button>

          <button
            type="button"
            role="menuitem"
            data-testid="spellcheck-add-dictionary-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onAddToDictionary(target.word!)}
            className="w-full px-3 py-1.5 text-left text-slate-300 hover:bg-slate-800 hover:text-emerald-300 flex items-center gap-2 transition"
          >
            <BookMarked className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="truncate">Add to Dictionary</span>
          </button>

          <div className="my-1 border-t border-slate-800/90" />
        </>
      )}

      {/* Standard Chrome & Word Clipboard / Selection Actions */}
      <button
        type="button"
        role="menuitem"
        data-testid="context-menu-cut"
        disabled={!target.hasSelection}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onCut}
        className="w-full px-3 py-1.5 text-left text-slate-200 hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none flex items-center justify-between transition"
      >
        <span className="flex items-center gap-2">
          <Scissors className="w-3.5 h-3.5 text-slate-400" />
          Cut
        </span>
        <span className="text-[10px] font-mono text-slate-400">Ctrl+X</span>
      </button>

      <button
        type="button"
        role="menuitem"
        data-testid="context-menu-copy"
        disabled={!target.hasSelection && !target.word}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onCopy}
        className="w-full px-3 py-1.5 text-left text-slate-200 hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none flex items-center justify-between transition"
      >
        <span className="flex items-center gap-2">
          <Copy className="w-3.5 h-3.5 text-slate-400" />
          Copy
        </span>
        <span className="text-[10px] font-mono text-slate-400">Ctrl+C</span>
      </button>

      <button
        type="button"
        role="menuitem"
        data-testid="context-menu-paste"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onPaste}
        className="w-full px-3 py-1.5 text-left text-slate-200 hover:bg-slate-800 flex items-center justify-between transition"
      >
        <span className="flex items-center gap-2">
          <ClipboardPaste className="w-3.5 h-3.5 text-slate-400" />
          Paste
        </span>
        <span className="text-[10px] font-mono text-slate-400">Ctrl+V</span>
      </button>

      <button
        type="button"
        role="menuitem"
        data-testid="context-menu-select-all"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onSelectAll}
        className="w-full px-3 py-1.5 text-left text-slate-200 hover:bg-slate-800 flex items-center justify-between transition"
      >
        <span className="flex items-center gap-2">
          <CheckSquare className="w-3.5 h-3.5 text-slate-400" />
          Select All
        </span>
        <span className="text-[10px] font-mono text-slate-400">Ctrl+A</span>
      </button>

      <div className="my-1 border-t border-slate-800/90" />

      <div className="px-2 pt-0.5 flex items-center justify-between gap-1">
        <button
          type="button"
          role="menuitemcheckbox"
          aria-checked={spellCheckEnabled}
          data-testid="context-menu-toggle-spellcheck"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onToggleSpellCheck}
          className="px-2 py-1 rounded-lg hover:bg-slate-800 text-[11px] text-slate-300 hover:text-white flex items-center gap-1.5 transition"
        >
          <SpellCheck
            className={`w-3.5 h-3.5 ${
              spellCheckEnabled ? 'text-emerald-400' : 'text-slate-500'
            }`}
          />
          <span>Spellcheck: {spellCheckEnabled ? 'On' : 'Off'}</span>
        </button>

        <button
          type="button"
          role="menuitem"
          data-testid="context-menu-open-proofing"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onOpenProofingPanel}
          className="px-2 py-1 rounded-lg bg-slate-800/90 hover:bg-indigo-600/30 text-[10px] font-semibold text-indigo-300 hover:text-white transition"
        >
          Proofing…
        </button>
      </div>
    </div>
  );
};

export interface SpellcheckProofingPopoverProps {
  spellCheckEnabled: boolean;
  onToggleSpellCheck: (next: boolean) => void;
  misspellings: MisspellingMatch[];
  customDictionary: string[];
  onApplyCorrection: (match: MisspellingMatch, replacement: string) => void;
  onChangeAllOccurrences: (word: string, replacement: string) => void;
  onFixAllMisspellings: () => void;
  onIgnoreWord: (word: string) => void;
  onAddWordToDictionary: (word: string) => void;
  onRemoveWordFromDictionary: (word: string) => void;
  onClose: () => void;
}

export const SpellcheckProofingPopover: React.FC<
  SpellcheckProofingPopoverProps
> = ({
  spellCheckEnabled,
  onToggleSpellCheck,
  misspellings,
  customDictionary,
  onApplyCorrection,
  onChangeAllOccurrences,
  onFixAllMisspellings,
  onIgnoreWord,
  onAddWordToDictionary,
  onRemoveWordFromDictionary,
  onClose,
}) => {
  const [newWordInput, setNewWordInput] = useState('');
  const [activeTab, setActiveTab] = useState<'issues' | 'dictionary'>('issues');

  const fixableCount = misspellings.filter(
    (m) => m.suggestions.length > 0
  ).length;

  // Count how many times each normalized word appears
  const countsByNormalized = misspellings.reduce<Record<string, number>>(
    (acc, m) => {
      acc[m.normalizedWord] = (acc[m.normalizedWord] || 0) + 1;
      return acc;
    },
    {}
  );

  const handleAddWordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newWordInput.trim();
    if (!cleaned) return;
    onAddWordToDictionary(cleaned);
    setNewWordInput('');
  };

  return (
    <div
      role="dialog"
      aria-label="Spellcheck Proofing and Custom Dictionary"
      data-testid="spellcheck-proofing-popover"
      className="bg-slate-950/95 border border-indigo-500/40 rounded-2xl p-3 shadow-2xl flex flex-col gap-2.5 text-xs"
    >
      {/* Top Bar: Title + Toggle Switch + Close */}
      <div className="flex items-center justify-between gap-2 flex-wrap border-b border-slate-800/80 pb-2">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-300">
            <SpellCheck className="w-3.5 h-3.5" aria-hidden="true" />
          </div>
          <div>
            <div className="font-semibold text-white flex items-center gap-1.5">
              <span>Spelling &amp; Proofing</span>
              {spellCheckEnabled && (
                <span
                  data-testid="proofing-issue-count-badge"
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-semibold ${
                    misspellings.length === 0
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                  }`}
                >
                  {misspellings.length === 0
                    ? '0 issues'
                    : `${misspellings.length} ${
                        misspellings.length === 1 ? 'issue' : 'issues'
                      }`}
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-400">
              Right-click any underlined word for quick suggestions or review
              all below
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            role="switch"
            aria-checked={spellCheckEnabled}
            aria-label="Enable live spellcheck"
            data-testid="toggle-spellcheck-switch"
            onClick={() => onToggleSpellCheck(!spellCheckEnabled)}
            className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold flex items-center gap-1.5 transition ${
              spellCheckEnabled
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                spellCheckEnabled ? 'bg-emerald-400' : 'bg-slate-500'
              }`}
            />
            {spellCheckEnabled ? 'Spellcheck On' : 'Spellcheck Off'}
          </button>

          <button
            type="button"
            aria-label="Close Spellcheck Proofing"
            data-testid="close-proofing-popover-btn"
            onClick={onClose}
            className="w-6 h-6 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-white transition"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Sub-navigation: Proofing Issues vs Custom Dictionary */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div
          role="tablist"
          aria-label="Proofing Views"
          className="inline-flex items-center bg-slate-900 rounded-lg p-0.5 border border-slate-800 text-[11px]"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'issues'}
            data-testid="proofing-tab-issues"
            onClick={() => setActiveTab('issues')}
            className={`px-2.5 py-1 rounded-md font-medium transition ${
              activeTab === 'issues'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Proofing ({spellCheckEnabled ? misspellings.length : 0})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'dictionary'}
            data-testid="proofing-tab-dictionary"
            onClick={() => setActiveTab('dictionary')}
            className={`px-2.5 py-1 rounded-md font-medium flex items-center gap-1 transition ${
              activeTab === 'dictionary'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <BookMarked className="w-3 h-3" />
            Custom Dictionary ({customDictionary.length})
          </button>
        </div>

        {activeTab === 'issues' && spellCheckEnabled && fixableCount > 0 && (
          <button
            type="button"
            data-testid="proofing-fix-all-btn"
            onClick={onFixAllMisspellings}
            className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold flex items-center gap-1 shadow transition"
          >
            <Sparkles className="w-3 h-3" aria-hidden="true" />
            <span>Fix All ({fixableCount})</span>
          </button>
        )}
      </div>

      {activeTab === 'issues' ? (
        !spellCheckEnabled ? (
          <div className="py-4 text-center text-slate-400">
            Spellcheck is currently paused. Turn it on above to check spelling
            as you type.
          </div>
        ) : misspellings.length === 0 ? (
          <div
            data-testid="proofing-no-issues-banner"
            className="py-3 px-3 rounded-xl bg-emerald-950/30 border border-emerald-500/30 flex items-center gap-2 text-emerald-200"
          >
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              Spelling check complete — no misspelled words detected in this
              note.
            </span>
          </div>
        ) : (
          <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
            {misspellings.map((item, idx) => {
              const count = countsByNormalized[item.normalizedWord] || 1;
              return (
                <div
                  key={`${item.adfTargetId || 'md'}-${item.start}-${idx}`}
                  data-testid={`proofing-issue-card-${item.word}`}
                  className="p-2 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col gap-1.5"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="px-1.5 py-0.5 rounded bg-rose-500/20 border border-rose-500/40 text-rose-200 font-mono font-semibold text-[11px] underline decoration-rose-400 decoration-wavy">
                        {item.word}
                      </span>
                      {item.locationLabel && (
                        <span className="text-[10px] text-sky-300 font-medium">
                          {item.locationLabel}
                        </span>
                      )}
                      {item.contextSnippet && (
                        <span className="text-[10px] text-slate-400 truncate max-w-[190px] italic">
                          &ldquo;{item.contextSnippet}&rdquo;
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        data-testid={`proofing-ignore-${item.word}`}
                        onClick={() => onIgnoreWord(item.word)}
                        title="Ignore this word for the current session"
                        className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300 hover:text-white transition"
                      >
                        Ignore
                      </button>
                      <button
                        type="button"
                        data-testid={`proofing-add-dict-${item.word}`}
                        onClick={() => onAddWordToDictionary(item.word)}
                        title="Add word to persistent Custom Dictionary"
                        className="px-1.5 py-0.5 rounded bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-[10px] text-emerald-300 font-medium flex items-center gap-0.5 transition"
                      >
                        <Plus className="w-2.5 h-2.5" /> Dict
                      </button>
                    </div>
                  </div>

                  {item.suggestions.length > 0 ? (
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-[10px] text-slate-400 mr-0.5">
                        Suggestions:
                      </span>
                      {item.suggestions.map((sug) => (
                        <button
                          key={sug}
                          type="button"
                          data-testid={`proofing-apply-${item.word}-${sug}`}
                          onClick={() => onApplyCorrection(item, sug)}
                          className="px-2 py-0.5 rounded-md bg-indigo-600/25 hover:bg-indigo-600 border border-indigo-500/40 text-indigo-100 hover:text-white text-[11px] font-semibold transition"
                        >
                          {sug}
                        </button>
                      ))}
                      {count > 1 && item.suggestions[0] && (
                        <button
                          type="button"
                          data-testid={`proofing-change-all-${item.word}`}
                          onClick={() =>
                            onChangeAllOccurrences(
                              item.word,
                              item.suggestions[0]
                            )
                          }
                          className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-indigo-500/30 text-[10px] text-indigo-300 font-medium transition"
                        >
                          Change All ({count})
                        </button>
                      )}
                    </div>
                  ) : (
                    <span className="text-[10px] italic text-slate-500">
                      No close dictionary matches — add to dictionary or edit
                      manually
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : (
        <div className="space-y-2">
          <form onSubmit={handleAddWordSubmit} className="flex items-center gap-1.5">
            <input
              type="text"
              aria-label="Add word to custom dictionary"
              data-testid="custom-dictionary-input"
              value={newWordInput}
              onChange={(e) => setNewWordInput(e.target.value)}
              placeholder="Add custom word, name, or acronym..."
              className="flex-1 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="submit"
              data-testid="custom-dictionary-add-btn"
              className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold flex items-center gap-1 shrink-0 transition"
            >
              <Plus className="w-3 h-3" /> Add Word
            </button>
          </form>

          {customDictionary.length === 0 ? (
            <p className="text-[11px] text-slate-400 italic py-2">
              Your custom dictionary is empty. Words you add here or via
              right-click &ldquo;Add to Dictionary&rdquo; will never be flagged
              as misspelled.
            </p>
          ) : (
            <div className="flex items-center gap-1.5 flex-wrap max-h-36 overflow-y-auto pt-0.5">
              {customDictionary.map((word) => (
                <span
                  key={word}
                  data-testid={`custom-dictionary-chip-${word}`}
                  className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-lg bg-slate-900 border border-slate-700 text-[11px] text-slate-200"
                >
                  <span>{word}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${word} from dictionary`}
                    data-testid={`custom-dictionary-remove-${word}`}
                    onClick={() => onRemoveWordFromDictionary(word)}
                    className="w-6 h-6 rounded hover:bg-rose-500/25 text-slate-400 hover:text-rose-300 flex items-center justify-center transition"
                  >
                    <Trash2 className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
