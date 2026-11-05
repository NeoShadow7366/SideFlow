import React, { useState } from 'react';
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vitest';
import {
  render,
  screen,
  fireEvent,
  within,
  waitFor,
} from '@testing-library/react';
import {
  AdfDocNode,
  AdfInlineNode,
  NoteItem,
  NotifyFn,
} from '../types/sideflow';
import {
  findMisspellingsInAdfDoc,
  findMisspellingsInText,
  getSpellingSuggestions,
  getWordAtCharacterOffset,
  isWordSpelledCorrectly,
  matchWordCase,
  replaceAllWordOccurrencesInAdfDoc,
  replaceAllWordOccurrencesInText,
  replaceWordInAdfInlineNodes,
} from '../utils/spellcheck';
import {
  adfInlineToEditorHtml,
  parseEditorDomToAdfInline,
} from '../utils/adfDom';
import { markdownToAdf } from '../utils/adf';
import { NotesView } from '../components/Notes/NotesView';

vi.mock('../components/Notes/VoiceBar', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../components/Notes/VoiceBar')>();
  return {
    ...actual,
    VoiceBar: (props: React.ComponentProps<typeof actual.VoiceBar>) => (
      <div data-testid="voicebar-spellcheck-wrapper">
        <actual.VoiceBar {...props} />
      </div>
    ),
  };
});

interface NotesHarnessProps {
  initialNotes: NoteItem[];
  onNotify?: NotifyFn;
  onNotesChangeSpy?: (notes: NoteItem[]) => void;
}

const NotesHarness: React.FC<NotesHarnessProps> = ({
  initialNotes,
  onNotify = vi.fn(),
  onNotesChangeSpy,
}) => {
  const [notes, setNotes] = useState<NoteItem[]>(initialNotes);
  const [activeNoteId, setActiveNoteId] = useState<string>(
    initialNotes[0]?.id || 'note-1'
  );

  const handleChangeNotes = (
    updater: NoteItem[] | ((prev: NoteItem[]) => NoteItem[])
  ) => {
    setNotes((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      onNotesChangeSpy?.(next);
      return next;
    });
  };

  return (
    <NotesView
      notes={notes}
      onChangeNotes={handleChangeNotes}
      activeNoteId={activeNoteId}
      onChangeActiveNoteId={setActiveNoteId}
      isPanelOpen={true}
      isActiveTab={true}
      onNotify={onNotify}
    />
  );
};

describe('Chrome & Word-Style Spellcheck Engine, Context Menu & Proofing Suite', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete window.sideflow;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    delete window.sideflow;
  });

  describe('1. Spellcheck Dictionary, Morphology & Suggestion Ranker (src/utils/spellcheck.ts)', () => {
    it('recognizes valid English words, inflections, prefixes, contractions, and acronyms', () => {
      expect(isWordSpelledCorrectly('project')).toBe(true);
      expect(isWordSpelledCorrectly('projects')).toBe(true);
      expect(isWordSpelledCorrectly('projected')).toBe(true);
      expect(isWordSpelledCorrectly('projecting')).toBe(true);
      expect(isWordSpelledCorrectly('quickly')).toBe(true);
      expect(isWordSpelledCorrectly('happiness')).toBe(true);
      expect(isWordSpelledCorrectly('rebuild')).toBe(true);
      expect(isWordSpelledCorrectly('unhappy')).toBe(true);
      expect(isWordSpelledCorrectly("don't")).toBe(true);
      expect(isWordSpelledCorrectly('API')).toBe(true);
      expect(isWordSpelledCorrectly('Jira')).toBe(true);
      expect(isWordSpelledCorrectly('Markdown')).toBe(true);

      // Common misspellings should be flagged false
      expect(isWordSpelledCorrectly('teh')).toBe(false);
      expect(isWordSpelledCorrectly('recieve')).toBe(false);
      expect(isWordSpelledCorrectly('definately')).toBe(false);
      expect(isWordSpelledCorrectly('seperate')).toBe(false);
      expect(isWordSpelledCorrectly('occured')).toBe(false);
    });

    it('ranks accurate replacement suggestions and preserves word casing (Title Case / ALL CAPS)', () => {
      const tehSuggestions = getSpellingSuggestions('teh');
      expect(tehSuggestions[0]).toBe('the');

      const titleCaseSuggestions = getSpellingSuggestions('Teh');
      expect(titleCaseSuggestions[0]).toBe('The');

      const receiveSuggestions = getSpellingSuggestions('recieve');
      expect(receiveSuggestions).toContain('receive');

      const separateSuggestions = getSpellingSuggestions('Seperate');
      expect(separateSuggestions[0]).toBe('Separate');

      expect(matchWordCase('teh', 'the')).toBe('the');
      expect(matchWordCase('Teh', 'the')).toBe('The');
      expect(matchWordCase('TEH', 'the')).toBe('THE');
    });

    it('excludes fenced code blocks, inline code, URLs, mentions, hashtags, and timestamps in Markdown', () => {
      const markdownSample = [
        '[10:42 AM] We found teh issue in `teh_config_var` today.',
        'Check https://example.com/recieve-webhook and ping @johndoe or #sprint_xyz.',
        '```ts',
        'const definatelyIgnored = "seperate";',
        '```',
        'Please seperate the deployment steps.',
      ].join('\n');

      const issues = findMisspellingsInText(markdownSample, {
        isMarkdown: true,
      });
      expect(issues.map((i) => i.word)).toEqual(['teh', 'seperate']);
      expect(issues[0].suggestions[0]).toBe('the');
      expect(issues[1].suggestions[0]).toBe('separate');
    });

    it('scans Jira ADF documents while skipping codeBlock nodes and inline code/link marks', () => {
      const doc: AdfDocNode = {
        version: 1,
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'This is teh first ' },
              {
                type: 'text',
                text: 'recieve_token',
                marks: [{ type: 'code' }],
              },
              { type: 'text', text: ' and ' },
              {
                type: 'text',
                text: 'definately_linked',
                marks: [{ type: 'link', attrs: { href: 'https://atlassian.com' } }],
              },
              { type: 'text', text: ' with seperate items.' },
            ],
          },
          {
            type: 'codeBlock',
            attrs: { language: 'typescript' },
            content: [{ type: 'text', text: 'const teh = "occured";' }],
          },
        ],
      };

      const issues = findMisspellingsInAdfDoc(doc);
      expect(issues.map((i) => i.word)).toEqual(['teh', 'seperate']);
      expect(issues[0].adfTargetId).toBe('b-0');
    });

    it('replaces a misspelled word inside ADF inline nodes while preserving existing marks', () => {
      const nodes: AdfInlineNode[] = [
        { type: 'text', text: 'Please ' },
        {
          type: 'text',
          text: 'recieve',
          marks: [{ type: 'strong' }, { type: 'em' }],
        },
        { type: 'text', text: ' the payload.' },
      ];

      // "Please " is 7 chars, "recieve" is [7..14]
      const updated = replaceWordInAdfInlineNodes(nodes, 7, 14, 'receive');
      expect(updated.content).toEqual([
        { type: 'text', text: 'Please ' },
        {
          type: 'text',
          text: 'receive',
          marks: [{ type: 'strong' }, { type: 'em' }],
        },
        { type: 'text', text: ' the payload.' },
      ]);
    });

    it('replaces all occurrences across Markdown and ADF while preserving case', () => {
      const text = 'Teh quick brown fox jumped over teh lazy dog.';
      expect(replaceAllWordOccurrencesInText(text, 'teh', 'the').nextText).toBe(
        'The quick brown fox jumped over the lazy dog.'
      );

      const adfDoc = markdownToAdf('Teh first line.\n\nAnd teh second line.');
      const { nextDoc } = replaceAllWordOccurrencesInAdfDoc(
        adfDoc,
        'teh',
        'the'
      );
      expect(findMisspellingsInAdfDoc(nextDoc)).toHaveLength(0);

      const wordAtOffset = getWordAtCharacterOffset('Hello teh world', 7);
      expect(wordAtOffset).toEqual({ word: 'teh', start: 6, end: 9 });
    });
  });

  describe('2. ADF DOM Spellcheck Underlines & Round-Trip Fidelity (src/utils/adfDom.ts)', () => {
    it('wraps misspelled words in .sf-misspelled-word spans and strips them cleanly when parsing back to ADF', () => {
      const inlineNodes: AdfInlineNode[] = [
        { type: 'text', text: 'Fix teh ' },
        { type: 'text', text: 'recieve', marks: [{ type: 'strong' }] },
        { type: 'text', text: ' logic in ' },
        { type: 'text', text: 'teh_code', marks: [{ type: 'code' }] },
      ];

      const html = adfInlineToEditorHtml(inlineNodes, {
        spellCheckEnabled: true,
      });
      expect(html).toContain('class="sf-misspelled-word"');
      expect(html).toContain('data-misspelled-word="teh"');
      expect(html).toContain('data-misspelled-word="recieve"');
      // Code mark should have spellcheck="false" and not be wrapped as misspelled
      expect(html).toContain('spellcheck="false"');
      expect(html).not.toContain('data-misspelled-word="teh_code"');

      const container = document.createElement('div');
      container.innerHTML = html;
      const roundTripped = parseEditorDomToAdfInline(container);
      expect(roundTripped).toEqual(inlineNodes);
    });
  });

  describe('3. NotesView Chrome & Word-Style Spellcheck UI Integration', () => {
    it('renders live wavy red underlines in Markdown backdrop & preview and shows the issue count badge', () => {
      const initialNotes: NoteItem[] = [
        {
          id: 'note-spell-1',
          title: 'Sprint Retro',
          body: 'We need to seperate teh tasks before tomorrow.',
          format: 'markdown',
        },
      ];

      render(<NotesHarness initialNotes={initialNotes} />);

      // Toolbar badge should show 2 misspellings ("seperate" and "teh")
      const badge = screen.getByTestId('spellcheck-issue-count-badge');
      expect(badge).toHaveTextContent('2');

      // Backdrop should render wavy red underline spans
      const backdrop = screen.getByTestId('markdown-spellcheck-backdrop');
      const errorSpans = backdrop.querySelectorAll('[data-spellcheck-error="true"]');
      expect(errorSpans).toHaveLength(2);
      expect(errorSpans[0]).toHaveAttribute('data-misspelled-word', 'seperate');
      expect(errorSpans[1]).toHaveAttribute('data-misspelled-word', 'teh');
    });

    it('opens Chrome/Word right-click context menu on a misspelled word in Markdown mode, replaces it, and supports Undo', () => {
      const initialNotes: NoteItem[] = [
        {
          id: 'note-spell-2',
          title: 'Release Checklist',
          body: 'Please recieve the deployment artifact.',
          format: 'markdown',
        },
      ];

      render(<NotesHarness initialNotes={initialNotes} />);

      const textarea = screen.getByLabelText('Note Body') as HTMLTextAreaElement;
      // Place cursor inside "recieve" (index 9) and right-click
      textarea.focus();
      textarea.setSelectionRange(9, 9);
      fireEvent.contextMenu(textarea);

      const menu = screen.getByTestId('spellcheck-context-menu');
      expect(menu).toBeInTheDocument();

      // Click top suggestion "receive"
      const suggestionBtn = screen.getByTestId('spellcheck-suggestion-receive');
      fireEvent.click(suggestionBtn);

      expect(textarea.value).toBe('Please receive the deployment artifact.');
      expect(
        screen.queryByTestId('spellcheck-issue-count-badge')
      ).not.toBeInTheDocument();

      // Ctrl+Z should undo the spellcheck replacement
      fireEvent.keyDown(textarea, { key: 'z', ctrlKey: true });
      expect(textarea.value).toBe('Please recieve the deployment artifact.');
    });

    it('supports "Change All" from the right-click context menu when a misspelling occurs multiple times', () => {
      const initialNotes: NoteItem[] = [
        {
          id: 'note-spell-all',
          title: 'Multi Typo Note',
          body: 'Teh first item and teh second item.',
          format: 'markdown',
        },
      ];

      render(<NotesHarness initialNotes={initialNotes} />);

      const textarea = screen.getByLabelText('Note Body') as HTMLTextAreaElement;
      textarea.focus();
      textarea.setSelectionRange(1, 1);
      fireEvent.contextMenu(textarea);

      const changeAllBtn = screen.getByTestId('spellcheck-change-all-btn');
      fireEvent.click(changeAllBtn);

      expect(textarea.value).toBe('The first item and the second item.');
    });

    it('supports "Ignore All" and "Add to Dictionary" (syncing with Electron Hunspell IPC)', () => {
      const addWordSpy = vi.fn().mockResolvedValue(true);
      window.sideflow = {
        addWordToSpellCheckerDictionary: addWordSpy,
      } as unknown as typeof window.sideflow;

      const initialNotes: NoteItem[] = [
        {
          id: 'note-spell-dict',
          title: 'Custom Terms',
          body: 'We use Sideflowxy and teh microservice.',
          format: 'markdown',
        },
      ];

      render(<NotesHarness initialNotes={initialNotes} />);

      expect(screen.getByTestId('spellcheck-issue-count-badge')).toHaveTextContent('2');

      const textarea = screen.getByLabelText('Note Body') as HTMLTextAreaElement;
      // Right-click on "Sideflowxy" (index 10) and click "Add to Dictionary"
      textarea.focus();
      textarea.setSelectionRange(10, 10);
      fireEvent.contextMenu(textarea);

      const addDictBtn = screen.getByTestId('spellcheck-add-dictionary-btn');
      fireEvent.click(addDictBtn);

      expect(addWordSpy).toHaveBeenCalledWith('sideflowxy');
      expect(
        JSON.parse(window.localStorage.getItem('sideflow_custom_dictionary') || '[]')
      ).toContain('sideflowxy');

      // Now only "teh" remains flagged
      expect(screen.getByTestId('spellcheck-issue-count-badge')).toHaveTextContent('1');

      // Right-click on "teh" and click "Ignore All"
      textarea.setSelectionRange(24, 24);
      fireEvent.contextMenu(textarea);
      fireEvent.click(screen.getByTestId('spellcheck-ignore-word-btn'));

      expect(
        screen.queryByTestId('spellcheck-issue-count-badge')
      ).not.toBeInTheDocument();
    });

    it('underlines misspelled words in Jira ADF Visual mode and replaces them via right-click context menu', async () => {
      const initialNotes: NoteItem[] = [
        {
          id: 'note-spell-adf',
          title: 'Jira Story',
          body: 'Verify teh acceptance criteria.',
          format: 'adf',
          adfDoc: markdownToAdf('Verify teh acceptance criteria.'),
        },
      ];

      render(<NotesHarness initialNotes={initialNotes} />);

      const adfEditor = screen.getByTestId('jira-adf-editor');
      const misspelledSpan = adfEditor.querySelector(
        '[data-spellcheck-error="true"][data-misspelled-word="teh"]'
      ) as HTMLElement;
      expect(misspelledSpan).not.toBeNull();

      // Right-click the misspelled span inside JiraAdfEditor
      fireEvent.contextMenu(misspelledSpan);

      const menu = screen.getByTestId('spellcheck-context-menu');
      expect(menu).toBeInTheDocument();

      fireEvent.click(within(menu).getByTestId('spellcheck-suggestion-the'));

      await waitFor(() => {
        expect(
          adfEditor.querySelector('[data-misspelled-word="teh"]')
        ).toBeNull();
      });
      expect(adfEditor.textContent).toContain('Verify the acceptance criteria.');
    });

    it('opens the Word-style Proofing & Custom Dictionary popover via toolbar button or F7 and fixes issues', () => {
      const initialNotes: NoteItem[] = [
        {
          id: 'note-spell-proofing',
          title: 'Proofing Note',
          body: 'This is definately a seperate test.',
          format: 'markdown',
        },
      ];

      render(<NotesHarness initialNotes={initialNotes} />);

      // Press F7 to open Proofing popover
      fireEvent.keyDown(window, { key: 'F7' });

      const popover = screen.getByTestId('spellcheck-proofing-popover');
      expect(popover).toBeInTheDocument();

      // First issue is "definately" -> click suggestion "definitely"
      fireEvent.click(
        within(popover).getByTestId('proofing-apply-definately-definitely')
      );

      const textarea = screen.getByLabelText('Note Body') as HTMLTextAreaElement;
      expect(textarea.value).toBe('This is definitely a seperate test.');

      // Next issue is "seperate" -> click suggestion "separate"
      fireEvent.click(
        within(popover).getByTestId('proofing-apply-seperate-separate')
      );
      expect(textarea.value).toBe('This is definitely a separate test.');

      // Switch to Custom Dictionary tab and add a custom word
      fireEvent.click(within(popover).getByTestId('proofing-tab-dictionary'));
      const input = within(popover).getByTestId('custom-dictionary-input');
      fireEvent.change(input, { target: { value: 'kubernetify' } });
      fireEvent.click(within(popover).getByTestId('custom-dictionary-add-btn'));

      expect(
        JSON.parse(window.localStorage.getItem('sideflow_custom_dictionary') || '[]')
      ).toContain('kubernetify');

      // Toggle spellcheck off via popover toggle switch
      fireEvent.click(within(popover).getByTestId('toggle-spellcheck-switch'));
      expect(textarea).toHaveAttribute('spellcheck', 'false');
    });
  });
});
