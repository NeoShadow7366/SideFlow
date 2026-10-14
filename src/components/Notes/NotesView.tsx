import React, { useState, useEffect } from 'react';
import { FilePlus, Trash, Check } from 'lucide-react';
import { NoteItem } from '../../types/sideflow';
import { VoiceBar } from './VoiceBar';

interface NotesViewProps {
  notes: NoteItem[];
  onChangeNotes: (
    updater: NoteItem[] | ((prev: NoteItem[]) => NoteItem[])
  ) => void;
  onNotify: (title: string, icon?: string, subtitle?: string) => void;
}

export const NotesView: React.FC<NotesViewProps> = ({
  notes,
  onChangeNotes,
  onNotify,
}) => {
  const [activeNoteId, setActiveNoteId] = useState<string>(
    () => notes[0]?.id || 'note-1'
  );

  useEffect(() => {
    if (notes.length > 0 && !notes.some((n) => n.id === activeNoteId)) {
      setActiveNoteId(notes[0].id);
    }
  }, [notes, activeNoteId]);

  const currentNote =
    notes.find((n) => n.id === activeNoteId) || notes[0] || {
      id: 'note-1',
      title: 'Untitled',
      body: '',
    };

  const handleUpdateCurrentNote = (patch: Partial<NoteItem>) => {
    onChangeNotes((prev) =>
      prev.map((n) =>
        n.id === currentNote.id
          ? { ...n, ...patch, updatedAt: Date.now() }
          : n
      )
    );
  };

  const handleCreateNewNote = () => {
    const newNote: NoteItem = {
      id: `note-${Date.now()}`,
      title: `Quick Note ${notes.length + 1}`,
      body: '',
      updatedAt: Date.now(),
    };
    onChangeNotes((prev) => [...prev, newNote]);
    setActiveNoteId(newNote.id);
  };

  const handleDeleteCurrentNote = () => {
    if (notes.length <= 1) return;
    const remaining = notes.filter((n) => n.id !== currentNote.id);
    onChangeNotes(remaining);
    if (remaining[0]) {
      setActiveNoteId(remaining[0].id);
    }
  };

  const handleVoiceTranscript = (transcript: string) => {
    onChangeNotes((prev) =>
      prev.map((n) => {
        if (n.id !== currentNote.id) return n;
        const needsSpace =
          n.body.length > 0 &&
          !n.body.endsWith(' ') &&
          !n.body.endsWith('\n') &&
          !transcript.startsWith('\n');
        return {
          ...n,
          body: `${n.body}${needsSpace ? ' ' : ''}${transcript}`,
          updatedAt: Date.now(),
        };
      })
    );
  };

  const handleInsertTimestamp = () => {
    const stamp = `[${new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })}] `;
    onChangeNotes((prev) =>
      prev.map((n) => {
        if (n.id !== currentNote.id) return n;
        const prefix = n.body.length > 0 ? '\n' : '';
        return {
          ...n,
          body: `${n.body}${prefix}${stamp}`,
          updatedAt: Date.now(),
        };
      })
    );
  };

  const handleCopyNoteContent = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(currentNote.body);
      } else {
        const editor = document.getElementById(
          'note-body-input'
        ) as HTMLTextAreaElement | null;
        editor?.select();
        document.execCommand('copy');
      }
    } catch {
      // Fallback
    }
    onNotify(
      'Note Copied to Clipboard',
      'check',
      `${currentNote.body.slice(0, 40)}...`
    );
  };

  const wordsCount = currentNote.body.trim()
    ? currentNote.body.trim().split(/\s+/).length
    : 0;
  const charsCount = currentNote.body.length;

  return (
    <section
      id="tab-notes"
      aria-label="Voice-Dictated & Quick Notes"
      className="tab-content flex-1 flex flex-col overflow-hidden p-4 gap-3"
    >
      {/* Top Notes Bar */}
      <div className="flex items-center justify-between gap-2">
        <div
          id="notes-tabs-container"
          className="flex items-center gap-1.5 overflow-x-auto"
        >
          {notes.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => setActiveNoteId(n.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition truncate max-w-[140px] ${
                n.id === currentNote.id
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-900 text-slate-400 hover:text-white'
              }`}
            >
              {n.title || 'Untitled'}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={handleCreateNewNote}
          className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-slate-200 flex items-center gap-1 shrink-0"
        >
          <FilePlus className="w-3.5 h-3.5 text-indigo-400" /> New Note
        </button>
      </div>

      {/* Voice Dictation Bar */}
      <VoiceBar
        onTranscript={handleVoiceTranscript}
        onInsertTimestamp={handleInsertTimestamp}
        onCopyNote={handleCopyNoteContent}
        onNotify={onNotify}
      />

      {/* Note Title & Editor */}
      <div className="flex-1 flex flex-col bg-slate-950/60 border border-slate-800/90 rounded-2xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-800/80 flex items-center justify-between">
          <input
            id="note-title-input"
            type="text"
            aria-label="Note Title"
            value={currentNote.title}
            onChange={(e) => handleUpdateCurrentNote({ title: e.target.value })}
            placeholder="Note Title..."
            className="bg-transparent text-sm font-semibold text-white focus:outline-none w-full"
          />
          <button
            type="button"
            onClick={handleDeleteCurrentNote}
            aria-label="Delete Note"
            title="Delete Note"
            disabled={notes.length <= 1}
            className="text-slate-500 hover:text-rose-400 disabled:opacity-40 p-1"
          >
            <Trash className="w-3.5 h-3.5" />
          </button>
        </div>

        <textarea
          id="note-body-input"
          aria-label="Note Body"
          value={currentNote.body}
          onChange={(e) => handleUpdateCurrentNote({ body: e.target.value })}
          placeholder="Start typing or click the microphone above for real-time voice dictation..."
          className="flex-1 w-full bg-transparent p-4 text-xs sm:text-sm text-slate-200 leading-relaxed focus:outline-none resize-none select-text"
        />

        <div className="px-4 py-2 bg-slate-950/80 border-t border-slate-800/70 flex items-center justify-between text-[11px] text-slate-500">
          <span id="note-word-count">
            {wordsCount} words • {charsCount} chars
          </span>
          <span
            id="note-saved-indicator"
            className="text-emerald-400 flex items-center gap-1"
          >
            <Check className="w-3 h-3" /> Auto-saved locally
          </span>
        </div>
      </div>
    </section>
  );
};
