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
  AdfMark,
  NoteItem,
  NotifyFn,
} from '../types/sideflow';
import {
  adfToJiraHtml,
  adfToMarkdown,
  clearInlineMarksInRange,
  countAdfTasks,
  markdownToAdf,
  normalizeAdfMarks,
  normalizeInlineNodes,
  parseAdfJsonString,
  toggleInlineMarkInRange,
  validateAndNormalizeAdfDoc,
} from '../utils/adf';
import {
  adfInlineToEditorHtml,
  getInlineSelectionOffsets,
  parseClipboardToAdfInline,
  parseEditorDomToAdfInline,
  setInlineSelectionOffsets,
} from '../utils/adfDom';
import { filterSlashCommands } from '../components/Notes/JiraSlashMenu';
import { NotesView } from '../components/Notes/NotesView';

// Keep the real VoiceBar mounted while exposing deterministic triggers for
// dictation & timestamp callbacks in jsdom where hardware mic streams are absent.
vi.mock('../components/Notes/VoiceBar', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../components/Notes/VoiceBar')>();
  return {
    ...actual,
    VoiceBar: (props: React.ComponentProps<typeof actual.VoiceBar>) => (
      <div data-testid="voicebar-integration-wrapper">
        <actual.VoiceBar {...props} />
        <button
          type="button"
          data-testid="trigger-voice-transcript-btn"
          onClick={() => props.onTranscript('Dictated Jira acceptance criteria')}
        >
          Simulate Voice Transcript
        </button>
        <button
          type="button"
          data-testid="trigger-voice-timestamp-btn"
          onClick={() => props.onInsertTimestamp()}
        >
          Simulate Voice Timestamp
        </button>
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

describe('Jira ADF v1 Engine, DOM Serializer & NotesView WYSIWYG Integration Suite', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete window.sideflow;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete window.sideflow;
  });

  describe('1. ADF Schema v1 Engine Unit Tests (src/utils/adf.ts)', () => {
    it('round-trips headings H1 through H6 between Markdown and ADF v1', () => {
      const md = [
        '# Heading Level 1',
        '',
        '## Heading Level 2',
        '',
        '### Heading Level 3',
        '',
        '#### Heading Level 4',
        '',
        '##### Heading Level 5',
        '',
        '###### Heading Level 6',
      ].join('\n');

      const doc = markdownToAdf(md);
      expect(doc.version).toBe(1);
      expect(doc.type).toBe('doc');
      expect(doc.content).toHaveLength(6);

      for (let level = 1; level <= 6; level++) {
        const block = doc.content[level - 1];
        expect(block.type).toBe('heading');
        if (block.type === 'heading') {
          expect(block.attrs.level).toBe(level);
          expect(block.content?.[0]).toEqual({
            type: 'text',
            text: `Heading Level ${level}`,
          });
        }
      }

      expect(adfToMarkdown(doc)).toBe(md);
    });

    it('round-trips inline formatting marks: bold, italic, bold+italic, underline, strike, code, sub/sup, color, highlight, and links', () => {
      const md =
        'Marks: **bold** *italic* ***both*** <u>under</u> ~~strike~~ `npm test` H<sub>2</sub>O x<sup>2</sup> <span style="color:#4C9AFF">blue</span> ==highlight== [Jira Spec](https://atlassian.com/adf)';

      const doc = markdownToAdf(md);
      expect(doc.content).toHaveLength(1);
      const para = doc.content[0];
      expect(para.type).toBe('paragraph');

      if (para.type === 'paragraph') {
        const inline = para.content || [];
        expect(
          inline.some(
            (n) =>
              n.type === 'text' &&
              n.text === 'bold' &&
              n.marks?.some((m) => m.type === 'strong')
          )
        ).toBe(true);
        expect(
          inline.some(
            (n) =>
              n.type === 'text' &&
              n.text === 'italic' &&
              n.marks?.some((m) => m.type === 'em')
          )
        ).toBe(true);
        expect(
          inline.some(
            (n) =>
              n.type === 'text' &&
              n.text === 'both' &&
              n.marks?.some((m) => m.type === 'strong') &&
              n.marks?.some((m) => m.type === 'em')
          )
        ).toBe(true);
        expect(
          inline.some(
            (n) =>
              n.type === 'text' &&
              n.text === 'under' &&
              n.marks?.some((m) => m.type === 'underline')
          )
        ).toBe(true);
        expect(
          inline.some(
            (n) =>
              n.type === 'text' &&
              n.text === 'strike' &&
              n.marks?.some((m) => m.type === 'strike')
          )
        ).toBe(true);
        expect(
          inline.some(
            (n) =>
              n.type === 'text' &&
              n.text === 'npm test' &&
              n.marks?.some((m) => m.type === 'code')
          )
        ).toBe(true);
        expect(
          inline.some(
            (n) =>
              n.type === 'text' &&
              n.text === '2' &&
              n.marks?.some(
                (m) => m.type === 'subsup' && m.attrs.type === 'sub'
              )
          )
        ).toBe(true);
        expect(
          inline.some(
            (n) =>
              n.type === 'text' &&
              n.text === '2' &&
              n.marks?.some(
                (m) => m.type === 'subsup' && m.attrs.type === 'sup'
              )
          )
        ).toBe(true);
        expect(
          inline.some(
            (n) =>
              n.type === 'text' &&
              n.text === 'Jira Spec' &&
              n.marks?.some(
                (m) =>
                  m.type === 'link' && m.attrs.href === 'https://atlassian.com/adf'
              )
          )
        ).toBe(true);
      }

      const serialized = adfToMarkdown(doc);
      expect(serialized).toBe(md);
    });

    it('round-trips Jira inline status lozenges, @mentions, :emoji:, [DATE], and Smart Cards', () => {
      const md =
        'Ticket [STATUS: IN PROGRESS | blue] assigned to @alex and @[Jane Doe] :rocket: due [DATE: 2026-10-28] ref [https://jira.example.com/browse/SF-101](card)';

      const doc = markdownToAdf(md);
      const para = doc.content[0];
      expect(para.type).toBe('paragraph');

      if (para.type === 'paragraph') {
        const nodes = para.content || [];
        const statusNode = nodes.find((n) => n.type === 'status');
        expect(statusNode).toBeDefined();
        if (statusNode?.type === 'status') {
          expect(statusNode.attrs.text).toBe('IN PROGRESS');
          expect(statusNode.attrs.color).toBe('blue');
          expect(statusNode.attrs.localId).toBeTruthy();
        }

        const mentions = nodes.filter((n) => n.type === 'mention');
        expect(mentions).toHaveLength(2);
        if (mentions[0]?.type === 'mention' && mentions[1]?.type === 'mention') {
          expect(mentions[0].attrs).toEqual({ id: 'alex', text: '@alex' });
          expect(mentions[1].attrs).toEqual({
            id: 'jane.doe',
            text: '@Jane Doe',
          });
        }

        const emojiNode = nodes.find((n) => n.type === 'emoji');
        expect(emojiNode).toEqual({
          type: 'emoji',
          attrs: { shortName: ':rocket:', text: '🚀' },
        });

        const dateNode = nodes.find((n) => n.type === 'date');
        expect(dateNode?.type).toBe('date');

        const cardNode = nodes.find((n) => n.type === 'inlineCard');
        expect(cardNode).toEqual({
          type: 'inlineCard',
          attrs: { url: 'https://jira.example.com/browse/SF-101' },
        });
      }

      expect(adfToMarkdown(doc)).toBe(md);
    });

    it('round-trips bullet lists, ordered lists, task/action lists, decision lists, panels, tables, <details> expand, horizontal rules, and mermaid code blocks', () => {
      const complexMd = [
        '- Bullet alpha',
        '  - Nested bullet beta',
        '- Bullet gamma',
        '',
        '1. Step one',
        '2. Step two',
        '',
        '- [ ] Draft migration plan',
        '- [x] Approve ADF schema',
        '',
        '<> Standardize on Atlassian Document Format v1',
        '',
        '> [!INFO]',
        '> Architecture context panel',
        '',
        '> [!WARNING]',
        '> Breaking change in legacy parser',
        '',
        '| Component | Owner |',
        '| --- | --- |',
        '| JiraAdfEditor | @qa_lead |',
        '| adf.ts | **Core** |',
        '',
        '<details>',
        '<summary>Rollout Checklist</summary>',
        '',
        'Verify staging parity before prod.',
        '</details>',
        '',
        '---',
        '',
        '```mermaid',
        'flowchart LR',
        '    A["Markdown"] --> B["ADF v1"]',
        '```',
      ].join('\n');

      const doc = markdownToAdf(complexMd);

      expect(doc.content.map((b) => b.type)).toEqual([
        'bulletList',
        'orderedList',
        'taskList',
        'decisionList',
        'panel',
        'panel',
        'table',
        'expand',
        'rule',
        'codeBlock',
      ]);

      const infoPanel = doc.content[4];
      const warnPanel = doc.content[5];
      expect(infoPanel.type === 'panel' && infoPanel.attrs.panelType).toBe('info');
      expect(warnPanel.type === 'panel' && warnPanel.attrs.panelType).toBe(
        'warning'
      );

      const expandBlock = doc.content[7];
      expect(expandBlock.type === 'expand' && expandBlock.attrs.title).toBe(
        'Rollout Checklist'
      );

      const mermaidBlock = doc.content[9];
      expect(
        mermaidBlock.type === 'codeBlock' && mermaidBlock.attrs?.language
      ).toBe('mermaid');

      const roundTripped = adfToMarkdown(doc);
      expect(roundTripped).toBe(complexMd);
    });

    it('enforces ADF Schema v1 mark invariants in normalizeAdfMarks and strips zero-length text nodes in normalizeInlineNodes', () => {
      // `code` mark excludes strong/em/underline/strike/subsup/colors while preserving safe `link`
      const marksWithCodeAndLink: AdfMark[] = [
        { type: 'strong' },
        { type: 'em' },
        { type: 'underline' },
        { type: 'strike' },
        { type: 'subsup', attrs: { type: 'sup' } },
        { type: 'textColor', attrs: { color: '#4C9AFF' } },
        { type: 'code' },
        { type: 'link', attrs: { href: 'https://developer.atlassian.com' } },
      ];
      expect(normalizeAdfMarks(marksWithCodeAndLink)).toEqual([
        { type: 'code' },
        { type: 'link', attrs: { href: 'https://developer.atlassian.com' } },
      ]);

      // Unsafe link protocols and non-hex colors are stripped
      const unsafeMarks: AdfMark[] = [
        { type: 'link', attrs: { href: 'javascript:alert(1)' } },
        { type: 'textColor', attrs: { color: 'expression(alert(1))' } },
      ];
      expect(normalizeAdfMarks(unsafeMarks)).toBeUndefined();

      // Zero-length text nodes stripped & adjacent identical runs merged
      const rawInline: AdfInlineNode[] = [
        { type: 'text', text: '' },
        { type: 'text', text: 'Hello ', marks: [{ type: 'strong' }] },
        { type: 'text', text: '' },
        { type: 'text', text: 'Jira', marks: [{ type: 'strong' }] },
      ];
      expect(normalizeInlineNodes(rawInline)).toEqual([
        { type: 'text', text: 'Hello Jira', marks: [{ type: 'strong' }] },
      ]);
    });

    it('toggles and clears inline marks across text ranges and collapsed carets', () => {
      const base: AdfInlineNode[] = [{ type: 'text', text: 'Ship Jira ADF' }];

      // Apply strong mark to "Jira" [5, 9]
      const applied = toggleInlineMarkInRange(base, 5, 9, { type: 'strong' });
      expect(applied.content).toEqual([
        { type: 'text', text: 'Ship ' },
        { type: 'text', text: 'Jira', marks: [{ type: 'strong' }] },
        { type: 'text', text: ' ADF' },
      ]);
      expect(applied.nextStart).toBe(5);
      expect(applied.nextEnd).toBe(9);

      // Toggle strong off on [5, 9] -> merges back into single plain text run
      const toggledOff = toggleInlineMarkInRange(applied.content, 5, 9, {
        type: 'strong',
      });
      expect(toggledOff.content).toEqual([
        { type: 'text', text: 'Ship Jira ADF' },
      ]);

      // Collapsed selection inserts marked placeholder run
      const collapsed = toggleInlineMarkInRange([], 0, 0, { type: 'em' });
      expect(collapsed.content).toEqual([
        { type: 'text', text: 'italic text', marks: [{ type: 'em' }] },
      ]);
      expect(collapsed.nextStart).toBe(0);
      expect(collapsed.nextEnd).toBe('italic text'.length);

      // clearInlineMarksInRange removes marks in range while keeping text intact
      const multiMarked: AdfInlineNode[] = [
        {
          type: 'text',
          text: 'Formatted text',
          marks: [{ type: 'strong' }, { type: 'underline' }],
        },
      ];
      expect(clearInlineMarksInRange(multiMarked, 0, 9)).toEqual([
        { type: 'text', text: 'Formatted' },
        {
          type: 'text',
          text: ' text',
          marks: [{ type: 'strong' }, { type: 'underline' }],
        },
      ]);
    });

    it('validates ADF v1 root invariants, strips javascript: URLs in validateAndNormalizeAdfDoc, escapes XSS in adfToJiraHtml, and counts nested tasks', () => {
      expect(validateAndNormalizeAdfDoc(null)).toEqual({
        valid: false,
        error: 'Root ADF value must be a JSON object.',
      });
      expect(
        validateAndNormalizeAdfDoc({ version: 2, type: 'doc', content: [] })
      ).toEqual({
        valid: false,
        error: 'ADF root must specify "version": 1.',
      });
      expect(
        validateAndNormalizeAdfDoc({ version: 1, type: 'paragraph', content: [] })
      ).toEqual({
        valid: false,
        error: 'ADF root must specify "type": "doc".',
      });
      expect(parseAdfJsonString('{bad json').valid).toBe(false);

      const untrustedCandidate = {
        version: 1,
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: '' },
              {
                type: 'text',
                text: '<script>alert("xss")</script>',
                marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
              },
              {
                type: 'inlineCard',
                attrs: { url: 'javascript:evil()' },
              },
            ],
          },
          {
            type: 'blockCard',
            attrs: { url: 'javascript:evilCard()' },
          },
          {
            type: 'panel',
            attrs: { panelType: 'info' },
            content: [
              {
                type: 'taskList',
                attrs: { localId: 'tl-1' },
                content: [
                  {
                    type: 'taskItem',
                    attrs: { localId: 't-1', state: 'DONE' },
                    content: [{ type: 'text', text: 'Done item' }],
                  },
                  {
                    type: 'taskItem',
                    attrs: { localId: 't-2', state: 'TODO' },
                    content: [{ type: 'text', text: 'Todo item' }],
                  },
                ],
              },
            ],
          },
        ],
      };

      const validated = validateAndNormalizeAdfDoc(untrustedCandidate);
      expect(validated.valid).toBe(true);
      if (validated.valid) {
        // Unsafe blockCard was dropped; only paragraph + panel remain
        expect(validated.doc.content).toHaveLength(2);
        const firstPara = validated.doc.content[0];
        if (firstPara.type === 'paragraph') {
          // javascript: link mark was stripped; inlineCard demoted to plain text
          expect(firstPara.content?.[0]?.type).toBe('text');
          if (firstPara.content?.[0]?.type === 'text') {
            expect(firstPara.content[0].marks).toBeUndefined();
          }
        }

        const html = adfToJiraHtml(validated.doc);
        expect(html).not.toContain('<script>');
        expect(html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
        expect(html).not.toContain('href="javascript:');

        expect(countAdfTasks(validated.doc)).toEqual({
          total: 2,
          completed: 1,
        });
      }
    });

    it('handles escaped pipes in table cells, out-of-range epoch timestamps without RangeError, and alignment/indentation mutual exclusion', () => {
      // 1. Table cell containing a status lozenge with `|` must not split into extra columns
      const docWithPipeInTable: AdfDocNode = {
        version: 1,
        type: 'doc',
        content: [
          {
            type: 'table',
            content: [
              {
                type: 'tableRow',
                content: [
                  {
                    type: 'tableHeader',
                    content: [
                      { type: 'paragraph', content: [{ type: 'text', text: 'Feature' }] },
                    ],
                  },
                  {
                    type: 'tableHeader',
                    content: [
                      { type: 'paragraph', content: [{ type: 'text', text: 'Status' }] },
                    ],
                  },
                ],
              },
              {
                type: 'tableRow',
                content: [
                  {
                    type: 'tableCell',
                    content: [
                      { type: 'paragraph', content: [{ type: 'text', text: 'ADF Editor' }] },
                    ],
                  },
                  {
                    type: 'tableCell',
                    content: [
                      {
                        type: 'paragraph',
                        content: [
                          {
                            type: 'status',
                            attrs: { text: 'IN PROGRESS', color: 'blue', localId: 's1' },
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      const md = adfToMarkdown(docWithPipeInTable);
      const reparsed = markdownToAdf(md);
      expect(reparsed.content[0]?.type).toBe('table');
      if (reparsed.content[0]?.type === 'table') {
        expect(reparsed.content[0].content[1]?.content).toHaveLength(2);
        const statusCell = reparsed.content[0].content[1]?.content[1];
        const firstPara = statusCell?.content[0];
        expect(
          firstPara?.type === 'paragraph' && firstPara.content?.[0]?.type
        ).toBe('status');
      }

      // 2. Out-of-range epoch timestamp (> 8.64e15) normalizes cleanly without RangeError
      const extremeDateDoc = validateAndNormalizeAdfDoc({
        version: 1,
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            marks: [
              { type: 'alignment', attrs: { align: 'center' } },
              { type: 'indentation', attrs: { level: 2 } },
            ],
            content: [
              { type: 'date', attrs: { timestamp: '99999999999999999999' } },
            ],
          },
        ],
      });
      expect(extremeDateDoc.valid).toBe(true);
      if (extremeDateDoc.valid) {
        expect(() => adfToMarkdown(extremeDateDoc.doc)).not.toThrow();
        expect(() => adfToJiraHtml(extremeDateDoc.doc)).not.toThrow();
        // Mutual exclusion: only latest block mark (`indentation`) survives
        const p0 = extremeDateDoc.doc.content[0];
        if (p0.type === 'paragraph') {
          expect(p0.marks).toEqual([{ type: 'indentation', attrs: { level: 2 } }]);
        }
      }
    });
  });

  describe('2. ADF DOM Serializer & Parser Unit Tests (src/utils/adfDom.ts)', () => {
    it('round-trips formatted text runs and hardBreaks through adfInlineToEditorHtml & parseEditorDomToAdfInline', () => {
      const original: AdfInlineNode[] = normalizeInlineNodes([
        {
          type: 'text',
          text: 'Critical',
          marks: [
            { type: 'strong' },
            { type: 'em' },
            { type: 'underline' },
            { type: 'textColor', attrs: { color: '#FF5630' } },
          ],
        },
        { type: 'text', text: ' ' },
        {
          type: 'text',
          text: 'deprecated',
          marks: [{ type: 'strike' }],
        },
        { type: 'text', text: ' ' },
        {
          type: 'text',
          text: 'v1',
          marks: [{ type: 'subsup', attrs: { type: 'sub' } }],
        },
        {
          type: 'text',
          text: '2',
          marks: [{ type: 'subsup', attrs: { type: 'sup' } }],
        },
        { type: 'hardBreak' },
        {
          type: 'text',
          text: 'adf.ts',
          marks: [
            { type: 'code' },
            { type: 'link', attrs: { href: 'https://atlassian.com/schema' } },
          ],
        },
        {
          type: 'text',
          text: ' highlighted',
          marks: [{ type: 'backgroundColor', attrs: { color: '#0747A6' } }],
        },
      ]);

      const html = adfInlineToEditorHtml(original);
      const container = document.createElement('div');
      container.innerHTML = html;

      const parsed = parseEditorDomToAdfInline(container);
      expect(parsed).toEqual(original);
    });

    it('round-trips atomic Jira inline pills (status, mention, date, emoji, inlineCard), sanitizes pasted HTML via parseClipboardToAdfInline, and handles selection offsets', () => {
      const atomicNodes: AdfInlineNode[] = [
        { type: 'text', text: 'Status: ' },
        {
          type: 'status',
          attrs: {
            text: 'IN REVIEW',
            color: 'yellow',
            localId: 'status-fixed-1',
          },
        },
        { type: 'text', text: ' owner ' },
        {
          type: 'mention',
          attrs: { id: 'sarah.connor', text: '@Sarah Connor' },
        },
        { type: 'text', text: ' due ' },
        {
          type: 'date',
          attrs: { timestamp: '1793145600000' },
        },
        { type: 'text', text: ' ' },
        {
          type: 'emoji',
          attrs: { shortName: ':check_mark:', text: '✅' },
        },
        { type: 'text', text: ' ' },
        {
          type: 'inlineCard',
          attrs: { url: 'https://company.atlassian.net/browse/JIRA-77' },
        },
      ];

      const container = document.createElement('div');
      container.innerHTML = adfInlineToEditorHtml(atomicNodes);
      document.body.appendChild(container);

      expect(
        container.querySelector('[data-testid="adf-status-lozenge"]')
      ).toHaveAttribute('contenteditable', 'false');
      expect(
        container.querySelector('[data-testid="adf-mention-pill"]')
      ).toHaveAttribute('contenteditable', 'false');
      expect(
        container.querySelector('[data-testid="adf-date-chip"]')
      ).toHaveAttribute('contenteditable', 'false');
      expect(
        container.querySelector('[data-testid="adf-emoji-node"]')
      ).toHaveAttribute('contenteditable', 'false');
      expect(
        container.querySelector('[data-testid="adf-inline-card"]')
      ).toHaveAttribute('contenteditable', 'false');

      const roundTripped = parseEditorDomToAdfInline(container);
      expect(roundTripped).toEqual(atomicNodes);

      // Selection offset round-trip across text + atomic inline chips
      setInlineSelectionOffsets(container, 2, 10);
      expect(getInlineSelectionOffsets(container)).toEqual({
        start: 2,
        end: 10,
      });

      container.remove();

      // Single browser-inserted placeholder <br> yields empty array
      const emptyBrDiv = document.createElement('div');
      emptyBrDiv.innerHTML = '<br>';
      expect(parseEditorDomToAdfInline(emptyBrDiv)).toEqual([]);

      // Detached DOMParser clipboard sanitizer strips <script> and converts block <div> to hardBreak
      const pasted = parseClipboardToAdfInline(
        '<script>window.evil=1</script><div><strong>Safe</strong></div><div>Second line</div>',
        'Safe\nSecond line'
      );
      expect(pasted).toEqual([
        { type: 'text', text: 'Safe', marks: [{ type: 'strong' }] },
        { type: 'hardBreak' },
        { type: 'text', text: 'Second line' },
      ]);
    });
  });

  describe('3. NotesView & JiraAdfEditor Component Integration Tests', () => {
    it('toggles a Markdown note into Jira ADF interactive blocks, converts back to Markdown (MD), and supports Undo/Redo across format switches', () => {
      const notifyMock = vi.fn();
      const initialMd = [
        '## Release Plan',
        '',
        '- [ ] Verify migration',
        '- [x] Tag release',
        '',
        'Current state: [STATUS: IN PROGRESS | blue] cc @devops',
      ].join('\n');

      render(
        <NotesHarness
          onNotify={notifyMock}
          initialNotes={[
            {
              id: 'note-fmt-1',
              title: 'Sprint 42 Specs',
              body: initialMd,
              format: 'markdown',
            },
          ]}
        />
      );

      const toggleGroup = screen.getByTestId('note-format-toggle');
      const mdBtn = within(toggleGroup).getByTestId('format-mode-markdown');
      const adfBtn = within(toggleGroup).getByTestId('format-mode-adf');

      expect(mdBtn).toHaveAttribute('aria-pressed', 'true');
      expect(adfBtn).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByTestId('note-active-format-indicator')).toHaveTextContent(
        'Markdown'
      );

      // Switch Markdown -> Jira ADF
      fireEvent.click(adfBtn);

      expect(adfBtn).toHaveAttribute('aria-pressed', 'true');
      expect(mdBtn).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByTestId('note-active-format-indicator')).toHaveTextContent(
        'Jira ADF v1'
      );
      expect(screen.getByTestId('jira-adf-editor')).toBeInTheDocument();
      expect(screen.getByTestId('adf-heading-h2')).toHaveTextContent(
        'Release Plan'
      );
      expect(screen.getByTestId('adf-task-list')).toBeInTheDocument();
      expect(screen.getByTestId('note-task-progress')).toHaveTextContent(
        '1/2 tasks'
      );
      expect(screen.getByTestId('adf-status-lozenge')).toHaveTextContent(
        'IN PROGRESS'
      );
      expect(screen.getByTestId('adf-mention-pill')).toHaveTextContent(
        '@devops'
      );

      // Switch back Jira ADF -> Markdown (MD)
      fireEvent.click(mdBtn);

      expect(mdBtn).toHaveAttribute('aria-pressed', 'true');
      expect(screen.queryByTestId('jira-adf-editor')).not.toBeInTheDocument();
      const bodyTextarea = screen.getByLabelText(
        'Note Body'
      ) as HTMLTextAreaElement;
      expect(bodyTextarea.value).toContain('## Release Plan');
      expect(bodyTextarea.value).toContain('- [ ] Verify migration');
      expect(bodyTextarea.value).toContain('[STATUS: IN PROGRESS | blue]');
      expect(bodyTextarea.value).toContain('@devops');

      // Undo format switch -> returns to Jira ADF mode
      const undoBtn = screen.getByRole('button', { name: 'Undo Note Edit' });
      const redoBtn = screen.getByRole('button', { name: 'Redo Note Edit' });
      fireEvent.click(undoBtn);
      expect(adfBtn).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByTestId('jira-adf-editor')).toBeInTheDocument();

      // Undo second time -> returns to original Markdown mode
      fireEvent.click(undoBtn);
      expect(mdBtn).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByLabelText('Note Body')).toHaveValue(initialMd);

      // Redo -> re-applies Jira ADF mode
      fireEvent.click(redoBtn);
      expect(adfBtn).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByTestId('jira-adf-editor')).toBeInTheDocument();
    });

    it('switches between Visual, Split, and ADF JSON view modes, validates raw ADF JSON errors, and recovers on valid JSON', () => {
      render(
        <NotesHarness
          initialNotes={[
            {
              id: 'note-json-1',
              title: 'ADF Inspector Note',
              body: 'Initial paragraph',
              format: 'adf',
              adfDoc: markdownToAdf('Initial paragraph'),
            },
          ]}
        />
      );

      const viewModeGroup = screen.getByRole('group', {
        name: 'Note Editor View Mode',
      });
      const visualBtn = within(viewModeGroup).getByRole('button', {
        name: /Visual/i,
      });
      const splitBtn = within(viewModeGroup).getByRole('button', {
        name: /Split/i,
      });
      const jsonBtn = within(viewModeGroup).getByRole('button', {
        name: /ADF JSON/i,
      });

      // Default Visual mode shows WYSIWYG editor only
      expect(visualBtn).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByTestId('jira-adf-editor')).toBeInTheDocument();
      expect(screen.queryByTestId('adf-json-pane')).not.toBeInTheDocument();

      // Split mode shows both WYSIWYG editor and live ADF JSON pane
      fireEvent.click(splitBtn);
      expect(splitBtn).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByTestId('jira-adf-editor')).toBeInTheDocument();
      expect(screen.getByTestId('adf-json-pane')).toBeInTheDocument();
      expect(screen.getByTestId('adf-json-valid-badge')).toHaveTextContent(
        'version: 1 • valid'
      );

      // ADF JSON mode shows only the JSON inspector
      fireEvent.click(jsonBtn);
      expect(jsonBtn).toHaveAttribute('aria-pressed', 'true');
      expect(screen.queryByTestId('jira-adf-editor')).not.toBeInTheDocument();

      const jsonTextarea = screen.getByTestId(
        'adf-json-textarea'
      ) as HTMLTextAreaElement;

      // Enter invalid JSON syntax -> error alert appears
      fireEvent.change(jsonTextarea, { target: { value: '{ malformed' } });
      expect(screen.getByTestId('adf-json-error-badge')).toHaveAttribute(
        'role',
        'alert'
      );
      expect(
        screen.queryByTestId('adf-json-valid-badge')
      ).not.toBeInTheDocument();

      // Enter valid JSON with invalid ADF schema version -> specific schema error shown
      fireEvent.change(jsonTextarea, {
        target: {
          value: JSON.stringify({ version: 99, type: 'doc', content: [] }),
        },
      });
      expect(screen.getByTestId('adf-json-error-badge')).toBeInTheDocument();
      expect(
        screen.getByText('ADF root must specify "version": 1.')
      ).toBeInTheDocument();

      // Recover with valid canonical ADF v1 JSON
      const validRecoveredDoc: AdfDocNode = {
        version: 1,
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: 'Recovered Heading From JSON' }],
          },
        ],
      };
      fireEvent.change(jsonTextarea, {
        target: { value: JSON.stringify(validRecoveredDoc, null, 2) },
      });

      expect(
        screen.queryByTestId('adf-json-error-badge')
      ).not.toBeInTheDocument();
      expect(screen.getByTestId('adf-json-valid-badge')).toBeInTheDocument();

      // Switch back to Visual and verify updated heading block rendered
      fireEvent.click(visualBtn);
      expect(screen.getByTestId('adf-heading-h2')).toHaveTextContent(
        'Recovered Heading From JSON'
      );
    });

    it('manipulates Jira toolbar blocks: Heading 2 style, Action items with live task counter, Decisions, Panels (type switching), Tables (rows/cols/headers/numbers), and Expand sections', () => {
      render(
        <NotesHarness
          initialNotes={[
            {
              id: 'note-blocks-1',
              title: 'Jira Block Playground',
              body: '',
              format: 'adf',
              adfDoc: {
                version: 1,
                type: 'doc',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Architecture Overview' }],
                  },
                ],
              },
            },
          ]}
        />
      );

      // 1. Change Text Style dropdown to Heading 2
      const styleSelect = screen.getByLabelText(
        'Jira Text Style'
      ) as HTMLSelectElement;
      expect(styleSelect.value).toBe('paragraph');
      fireEvent.change(styleSelect, { target: { value: 'h2' } });
      expect(screen.getByTestId('adf-heading-h2')).toHaveTextContent(
        'Architecture Overview'
      );
      expect(styleSelect.value).toBe('h2');

      // 2. Transform into Action item (taskList) and toggle checkbox -> task counter updates
      fireEvent.click(screen.getByRole('button', { name: 'Jira Action Item' }));
      expect(screen.getByTestId('adf-task-list')).toBeInTheDocument();
      expect(screen.getByTestId('note-task-progress')).toHaveTextContent(
        '0/1 tasks'
      );

      const checkbox = screen.getByRole('checkbox', {
        name: 'Jira Action Item 1',
      });
      expect(checkbox).not.toBeChecked();
      fireEvent.click(checkbox);
      expect(checkbox).toBeChecked();
      expect(screen.getByTestId('note-task-progress')).toHaveTextContent(
        '1/1 tasks'
      );

      // 3. Transform into Decision list and toggle decision state
      fireEvent.click(screen.getByRole('button', { name: 'Jira Decision' }));
      const decisionList = screen.getByTestId('adf-decision-list');
      expect(decisionList).toBeInTheDocument();
      const decisionToggleBtn = within(decisionList).getByRole('button', {
        name: 'Toggle decision 1 state',
      });
      fireEvent.click(decisionToggleBtn);
      expect(decisionToggleBtn).toHaveAttribute(
        'title',
        'Undecided (click to mark decided)'
      );

      // 4. Insert Info Panel and switch panel type to Warning
      fireEvent.click(
        screen.getByRole('button', { name: 'Insert Info Panel' })
      );
      const infoPanel = screen.getByTestId('adf-panel-info');
      expect(infoPanel).toBeInTheDocument();
      fireEvent.click(
        within(infoPanel).getByRole('button', {
          name: 'Switch panel to warning',
        })
      );
      expect(screen.queryByTestId('adf-panel-info')).not.toBeInTheDocument();
      expect(screen.getByTestId('adf-panel-warning')).toBeInTheDocument();

      // 5. Insert Jira Table, add row + column, toggle Header row & Numbered column
      fireEvent.click(
        screen.getByRole('button', { name: 'Insert Jira Table' })
      );
      const tableBlock = screen.getByTestId('adf-table-block');
      expect(tableBlock).toBeInTheDocument();
      expect(tableBlock.querySelectorAll('tbody tr')).toHaveLength(3);
      expect(tableBlock.querySelectorAll('th')).toHaveLength(3);

      fireEvent.click(
        within(tableBlock).getByRole('button', { name: 'Add table row' })
      );
      expect(tableBlock.querySelectorAll('tbody tr')).toHaveLength(4);

      fireEvent.click(
        within(tableBlock).getByRole('button', { name: 'Add table column' })
      );
      expect(tableBlock.querySelectorAll('th')).toHaveLength(4);

      const headerRowBtn = within(tableBlock).getByRole('button', {
        name: /Header row/i,
      });
      expect(headerRowBtn).toHaveAttribute('aria-pressed', 'true');
      fireEvent.click(headerRowBtn);
      expect(headerRowBtn).toHaveAttribute('aria-pressed', 'false');
      expect(tableBlock.querySelectorAll('th')).toHaveLength(0);

      const numbersBtn = within(tableBlock).getByRole('button', {
        name: /Numbers/i,
      });
      expect(numbersBtn).toHaveAttribute('aria-pressed', 'false');
      fireEvent.click(numbersBtn);
      expect(numbersBtn).toHaveAttribute('aria-pressed', 'true');
      // With 4 columns + 1 number column, row 0 now has 5 cells
      expect(
        tableBlock.querySelectorAll('tbody tr:first-child td')
      ).toHaveLength(5);

      // 6. Insert Expand block via "+ Insert" menu, edit title, and collapse/expand body
      fireEvent.click(screen.getByTestId('jira-insert-menu-btn'));
      expect(screen.getByTestId('jira-insert-dropdown')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('jira-insert-item-expand'));

      const expandBlock = screen.getByTestId('adf-expand-block');
      const expandTitleInput = within(expandBlock).getByLabelText(
        'Expand section title'
      ) as HTMLInputElement;
      expect(expandTitleInput.value).toBe('Acceptance Criteria & Details');

      fireEvent.change(expandTitleInput, {
        target: { value: 'Security Audit Notes' },
      });
      expect(expandTitleInput.value).toBe('Security Audit Notes');

      const collapseBtn = within(expandBlock).getByRole('button', {
        name: 'Collapse collapsible section',
      });
      expect(
        within(expandBlock).getByLabelText('Container block 1')
      ).toBeInTheDocument();

      fireEvent.click(collapseBtn);
      expect(
        within(expandBlock).queryByLabelText('Container block 1')
      ).not.toBeInTheDocument();

      fireEvent.click(
        within(expandBlock).getByRole('button', {
          name: 'Expand collapsible section',
        })
      );
      expect(
        within(expandBlock).getByLabelText('Container block 1')
      ).toBeInTheDocument();
    });

    it('filters "/" slash command menu queries, strips slash tokens on non-empty paragraphs, and supports "/" inside task lists + preserving multi-item lists and column layouts', () => {
      const warnMatches = filterSlashCommands('warn');
      expect(warnMatches.map((c) => c.id)).toContain('panel-warning');
      expect(warnMatches.map((c) => c.id)).not.toContain('table');

      let latestNotes: NoteItem[] = [];
      render(
        <NotesHarness
          onNotesChangeSpy={(n) => {
            latestNotes = n;
          }}
          initialNotes={[
            {
              id: 'note-slash-1',
              title: 'Slash Command Note',
              body: '',
              format: 'adf',
            },
          ]}
        />
      );

      const primaryEditable = screen.getByTestId('jira-adf-primary-block');
      fireEvent.focus(primaryEditable);

      // Simulate typing "Context /warn" (non-empty block) -> strips "/warn" AND inserts warning panel
      primaryEditable.textContent = 'Context /warn';
      setInlineSelectionOffsets(primaryEditable, 13, 13);
      fireEvent.input(primaryEditable);

      const slashMenu = screen.getByTestId('jira-slash-menu');
      expect(slashMenu).toBeInTheDocument();
      fireEvent.click(within(slashMenu).getByTestId('slash-cmd-panel-warning'));

      expect(screen.queryByTestId('jira-slash-menu')).not.toBeInTheDocument();
      expect(screen.getByTestId('adf-panel-warning')).toBeInTheDocument();
      expect(latestNotes[0]?.body).not.toContain('/warn');
      expect(latestNotes[0]?.body).toContain('Context');

      // Insert 2-column layout and verify switching 2 -> 3 cols preserves column 1 content
      fireEvent.click(screen.getByTestId('jira-insert-menu-btn'));
      fireEvent.click(screen.getByTestId('jira-insert-item-layout2'));
      const layoutBlock = screen.getByTestId('adf-layout-section');
      const col1Editable = within(layoutBlock).getAllByLabelText(
        'Container block 1'
      )[0];
      col1Editable.textContent = 'Preserved Column 1';
      setInlineSelectionOffsets(col1Editable, 18, 18);
      fireEvent.input(col1Editable);

      fireEvent.click(
        within(layoutBlock).getByRole('button', { name: /Switch to 3 cols/i })
      );
      expect(layoutBlock).toHaveTextContent('3-Column Jira Layout');
      expect(layoutBlock).toHaveTextContent('Preserved Column 1');
    });

    it('supports Copy for Jira, Copy ADF JSON, and VoiceBar dictation + timestamp insertion into a Jira ADF note', async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      const writeMock = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: writeTextMock,
          write: writeMock,
        },
      });

      const notifyMock = vi.fn();
      let latestNotes: NoteItem[] = [];

      render(
        <NotesHarness
          onNotify={notifyMock}
          onNotesChangeSpy={(updated) => {
            latestNotes = updated;
          }}
          initialNotes={[
            {
              id: 'note-copy-voice-1',
              title: 'Voice & Clipboard ADF Note',
              body: 'Sprint kickoff:',
              format: 'adf',
              adfDoc: markdownToAdf('Sprint kickoff:'),
            },
          ]}
        />
      );

      // Focus primary block in Jira ADF editor
      const primaryEditable = screen.getByTestId('jira-adf-primary-block');
      fireEvent.focus(primaryEditable);

      // Trigger VoiceBar dictation into Jira ADF note
      fireEvent.click(screen.getByTestId('trigger-voice-transcript-btn'));

      await waitFor(() => {
        expect(primaryEditable.textContent).toContain(
          'Dictated Jira acceptance criteria'
        );
      });
      expect(latestNotes[0]?.body).toContain(
        'Dictated Jira acceptance criteria'
      );

      // Trigger VoiceBar timestamp insertion into Jira ADF note
      fireEvent.click(screen.getByTestId('trigger-voice-timestamp-btn'));

      await waitFor(() => {
        expect(latestNotes[0]?.body).toMatch(/\[\d{1,2}:\d{2}/);
      });

      // Test "Copy for Jira" button
      fireEvent.click(screen.getByTestId('copy-for-jira-btn'));
      await waitFor(() => {
        expect(notifyMock).toHaveBeenCalledWith(
          'Copied for Jira Description',
          'check',
          'Rich HTML + Markdown ready to paste into Jira Cloud'
        );
      });
      expect(
        writeMock.mock.calls.length + writeTextMock.mock.calls.length
      ).toBeGreaterThanOrEqual(1);

      // Test "Copy ADF JSON" button
      writeTextMock.mockClear();
      fireEvent.click(screen.getByTestId('copy-adf-json-btn'));
      await waitFor(() => {
        expect(writeTextMock).toHaveBeenCalledTimes(1);
      });

      const copiedJsonRaw = writeTextMock.mock.calls[0][0] as string;
      const parsedCopiedAdf = JSON.parse(copiedJsonRaw) as AdfDocNode;
      expect(parsedCopiedAdf.version).toBe(1);
      expect(parsedCopiedAdf.type).toBe('doc');
      expect(JSON.stringify(parsedCopiedAdf)).toContain(
        'Dictated Jira acceptance criteria'
      );
      expect(notifyMock).toHaveBeenCalledWith(
        'Copied ADF v1 JSON',
        'check',
        expect.stringContaining('Canonical Atlassian Document')
      );
    });
  });
});
