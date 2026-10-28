import {
  AdfBlockMark,
  AdfBlockNode,
  AdfBulletListNode,
  AdfCodeBlockNode,
  AdfDecisionItemNode,
  AdfDecisionListNode,
  AdfDocNode,
  AdfExpandNode,
  AdfHeadingNode,
  AdfInlineNode,
  AdfLayoutColumnNode,
  AdfLayoutSectionNode,
  AdfListItemNode,
  AdfMark,
  AdfOrderedListNode,
  AdfPanelNode,
  AdfPanelType,
  AdfParagraphNode,
  AdfStatusColor,
  AdfTableCellNode,
  AdfTableNode,
  AdfTableRowNode,
  AdfTaskItemNode,
  AdfTaskListNode,
  AdfTextNode,
} from '../types/sideflow';

export interface JiraColorOption {
  label: string;
  value: string;
  swatchClass: string;
}

export const JIRA_TEXT_COLORS: JiraColorOption[] = [
  { label: 'Default', value: '', swatchClass: 'bg-slate-200' },
  { label: 'Jira Blue', value: '#4C9AFF', swatchClass: 'bg-[#4C9AFF]' },
  { label: 'Teal', value: '#00B8D9', swatchClass: 'bg-[#00B8D9]' },
  { label: 'Green', value: '#36B37E', swatchClass: 'bg-[#36B37E]' },
  { label: 'Yellow / Amber', value: '#FFAB00', swatchClass: 'bg-[#FFAB00]' },
  { label: 'Red', value: '#FF5630', swatchClass: 'bg-[#FF5630]' },
  { label: 'Purple', value: '#8777D9', swatchClass: 'bg-[#8777D9]' },
  { label: 'Subtle Grey', value: '#97A0AF', swatchClass: 'bg-[#97A0AF]' },
];

export const JIRA_HIGHLIGHT_COLORS: JiraColorOption[] = [
  { label: 'None', value: '', swatchClass: 'bg-transparent' },
  { label: 'Blue tint', value: '#0747A6', swatchClass: 'bg-[#0747A6]' },
  { label: 'Teal tint', value: '#006644', swatchClass: 'bg-[#006644]' },
  { label: 'Amber tint', value: '#974F0C', swatchClass: 'bg-[#974F0C]' },
  { label: 'Red tint', value: '#BF2600', swatchClass: 'bg-[#BF2600]' },
  { label: 'Purple tint', value: '#403294', swatchClass: 'bg-[#403294]' },
];

export const JIRA_TABLE_CELL_COLORS: JiraColorOption[] = [
  { label: 'None', value: '', swatchClass: 'bg-slate-900' },
  { label: 'Info Blue', value: '#0c2748', swatchClass: 'bg-[#0c2748]' },
  { label: 'Success Green', value: '#0b3326', swatchClass: 'bg-[#0b3326]' },
  { label: 'Warning Amber', value: '#3b2609', swatchClass: 'bg-[#3b2609]' },
  { label: 'Danger Red', value: '#3d1414', swatchClass: 'bg-[#3d1414]' },
  { label: 'Note Purple', value: '#261b47', swatchClass: 'bg-[#261b47]' },
  { label: 'Neutral Slate', value: '#1e293b', swatchClass: 'bg-[#1e293b]' },
];

export const JIRA_STATUS_COLORS: {
  id: AdfStatusColor;
  label: string;
  pillClass: string;
  dotClass: string;
}[] = [
  {
    id: 'neutral',
    label: 'Neutral (To Do)',
    pillClass: 'bg-slate-700/80 text-slate-100 border-slate-500/60',
    dotClass: 'bg-slate-400',
  },
  {
    id: 'blue',
    label: 'Blue (In Progress)',
    pillClass: 'bg-sky-500/25 text-sky-200 border-sky-400/50',
    dotClass: 'bg-sky-400',
  },
  {
    id: 'green',
    label: 'Green (Done)',
    pillClass: 'bg-emerald-500/25 text-emerald-200 border-emerald-400/50',
    dotClass: 'bg-emerald-400',
  },
  {
    id: 'yellow',
    label: 'Yellow (In Review)',
    pillClass: 'bg-amber-500/25 text-amber-200 border-amber-400/50',
    dotClass: 'bg-amber-400',
  },
  {
    id: 'red',
    label: 'Red (Blocked)',
    pillClass: 'bg-rose-500/25 text-rose-200 border-rose-400/50',
    dotClass: 'bg-rose-400',
  },
  {
    id: 'purple',
    label: 'Purple (Planning)',
    pillClass: 'bg-purple-500/25 text-purple-200 border-purple-400/50',
    dotClass: 'bg-purple-400',
  },
];

export const JIRA_CODE_LANGUAGES = [
  'plaintext',
  'typescript',
  'javascript',
  'python',
  'java',
  'json',
  'sql',
  'bash',
  'csharp',
  'go',
  'rust',
  'html',
  'css',
  'yaml',
  'xml',
  'mermaid',
] as const;

export const JIRA_EMOJIS: { shortName: string; text: string; label: string }[] = [
  { shortName: ':check_mark:', text: '✅', label: 'Check mark' },
  { shortName: ':cross_mark:', text: '❌', label: 'Cross mark' },
  { shortName: ':warning:', text: '⚠️', label: 'Warning' },
  { shortName: ':rocket:', text: '🚀', label: 'Rocket' },
  { shortName: ':fire:', text: '🔥', label: 'Fire' },
  { shortName: ':bulb:', text: '💡', label: 'Light bulb' },
  { shortName: ':pushpin:', text: '📌', label: 'Pushpin' },
  { shortName: ':eyes:', text: '👀', label: 'Eyes' },
  { shortName: ':thumbsup:', text: '👍', label: 'Thumbs up' },
  { shortName: ':tada:', text: '🎉', label: 'Party popper' },
  { shortName: ':bug:', text: '🐛', label: 'Bug' },
  { shortName: ':wrench:', text: '🔧', label: 'Wrench' },
];

const EMOJI_BY_SHORTNAME = new Map<string, string>(
  JIRA_EMOJIS.map((e) => [e.shortName, e.text])
);

let localIdCounter = 0;

export function createAdfLocalId(prefix = 'adf'): string {
  localIdCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${localIdCounter.toString(36)}`;
}

export function isSafeAdfUrl(rawUrl?: string | null): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('\\\\')) {
    return false;
  }
  if (/^mailto:[^\s]+$/i.test(trimmed)) {
    return true;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
      return false;
    }
  }
  return false;
}

export function sanitizeHexColor(rawColor?: string | null): string | null {
  if (!rawColor || typeof rawColor !== 'string') return null;
  const trimmed = rawColor.trim();
  if (/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed)) {
    return trimmed;
  }
  return null;
}

export function isLightHexColor(rawColor?: string | null): boolean {
  const clean = sanitizeHexColor(rawColor);
  if (!clean) return false;
  const hex =
    clean.length === 4
      ? `${clean[1]}${clean[1]}${clean[2]}${clean[2]}${clean[3]}${clean[3]}`
      : clean.slice(1);
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const toLinear = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const luminance =
    0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  return luminance > 0.45;
}

export function isValidEpochMs(val: number): boolean {
  return Number.isFinite(val) && Math.abs(val) <= 8_640_000_000_000_000;
}

export function formatEpochIsoDate(rawTimestamp: string | number): string | null {
  const num = Number(rawTimestamp);
  if (!isValidEpochMs(num)) return null;
  try {
    return new Date(num).toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

export function createEmptyAdfDoc(): AdfDocNode {
  return {
    version: 1,
    type: 'doc',
    content: [{ type: 'paragraph', content: [] }],
  };
}

/**
 * Enforces Atlassian Document Format v1 mark rules:
 * - Deduplicates marks of the same type (latest wins)
 * - Strips unsafe link hrefs or invalid color strings
 * - Enforces ADF v1 `code` mark exclusion (only `code` + optional `link` may coexist)
 * - Canonical deterministic mark ordering so adjacent identical text runs merge cleanly
 */
export function normalizeAdfMarks(marks?: AdfMark[]): AdfMark[] | undefined {
  if (!marks || marks.length === 0) return undefined;

  const byType = new Map<AdfMark['type'], AdfMark>();
  for (const m of marks) {
    if (!m || typeof m !== 'object') continue;
    switch (m.type) {
      case 'strong':
      case 'em':
      case 'underline':
      case 'strike':
      case 'code':
        byType.set(m.type, { type: m.type });
        break;
      case 'subsup':
        if (m.attrs?.type === 'sub' || m.attrs?.type === 'sup') {
          byType.set('subsup', { type: 'subsup', attrs: { type: m.attrs.type } });
        }
        break;
      case 'link':
        if (m.attrs?.href && isSafeAdfUrl(m.attrs.href)) {
          const cleanLink: AdfMark = m.attrs.title
            ? {
                type: 'link',
                attrs: { href: m.attrs.href.trim(), title: String(m.attrs.title) },
              }
            : { type: 'link', attrs: { href: m.attrs.href.trim() } };
          byType.set('link', cleanLink);
        }
        break;
      case 'textColor': {
        const cleanHex = sanitizeHexColor(m.attrs?.color);
        if (cleanHex) {
          byType.set('textColor', {
            type: 'textColor',
            attrs: { color: cleanHex },
          });
        }
        break;
      }
      case 'backgroundColor': {
        const cleanBg = sanitizeHexColor(m.attrs?.color);
        if (cleanBg) {
          byType.set('backgroundColor', {
            type: 'backgroundColor',
            attrs: { color: cleanBg },
          });
        }
        break;
      }
    }
  }

  // Official ADF v1 schema: `code` mark excludes formatting marks other than `link`
  if (byType.has('code')) {
    const linkMark = byType.get('link');
    const codeOnly: AdfMark[] = [{ type: 'code' }];
    if (linkMark) codeOnly.push(linkMark);
    return codeOnly;
  }

  const order: AdfMark['type'][] = [
    'link',
    'strong',
    'em',
    'underline',
    'strike',
    'subsup',
    'textColor',
    'backgroundColor',
  ];

  const ordered: AdfMark[] = [];
  for (const t of order) {
    const found = byType.get(t);
    if (found) ordered.push(found);
  }
  return ordered.length > 0 ? ordered : undefined;
}

export function areMarksEqual(a?: AdfMark[], b?: AdfMark[]): boolean {
  const normA = normalizeAdfMarks(a);
  const normB = normalizeAdfMarks(b);
  if (!normA && !normB) return true;
  if (!normA || !normB || normA.length !== normB.length) return false;
  return JSON.stringify(normA) === JSON.stringify(normB);
}

/**
 * Strips empty text nodes (required by ADF v1 `minLength: 1` on text.text)
 * and merges adjacent text nodes that have identical marks.
 */
export function normalizeInlineNodes(
  nodes?: AdfInlineNode[]
): AdfInlineNode[] {
  if (!nodes || !Array.isArray(nodes) || nodes.length === 0) return [];
  const result: AdfInlineNode[] = [];

  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue;
    if (node.type === 'text') {
      const textVal = typeof node.text === 'string' ? node.text : '';
      if (textVal.length === 0) continue;
      const marks = normalizeAdfMarks(node.marks);
      const prev = result[result.length - 1];
      if (prev && prev.type === 'text' && areMarksEqual(prev.marks, marks)) {
        prev.text += textVal;
      } else {
        const cleanText: AdfTextNode = marks
          ? { type: 'text', text: textVal, marks }
          : { type: 'text', text: textVal };
        result.push(cleanText);
      }
      continue;
    }

    switch (node.type) {
      case 'hardBreak':
        result.push({ type: 'hardBreak' });
        break;
      case 'status': {
        const validColors = new Set<AdfStatusColor>([
          'neutral',
          'purple',
          'blue',
          'red',
          'yellow',
          'green',
        ]);
        const color: AdfStatusColor = validColors.has(node.attrs?.color)
          ? node.attrs.color
          : 'neutral';
        const statusText = (node.attrs?.text || 'STATUS').trim() || 'STATUS';
        result.push({
          type: 'status',
          attrs: {
            text: statusText,
            color,
            localId: node.attrs?.localId || createAdfLocalId('status'),
          },
        });
        break;
      }
      case 'mention': {
        const rawText = (node.attrs?.text || '@teammate').trim();
        const mentionText = rawText.startsWith('@') ? rawText : `@${rawText}`;
        result.push({
          type: 'mention',
          attrs: {
            id: node.attrs?.id || mentionText.slice(1).toLowerCase() || 'user',
            text: mentionText,
          },
        });
        break;
      }
      case 'emoji': {
        const shortName = node.attrs?.shortName || ':smile:';
        const text =
          node.attrs?.text || EMOJI_BY_SHORTNAME.get(shortName) || '🙂';
        result.push({
          type: 'emoji',
          attrs: { shortName, text },
        });
        break;
      }
      case 'date': {
        const rawTs = node.attrs?.timestamp;
        const parsedNum = Number(rawTs);
        const ts = isValidEpochMs(parsedNum)
          ? String(Math.trunc(parsedNum))
          : String(Date.now());
        result.push({
          type: 'date',
          attrs: { timestamp: ts },
        });
        break;
      }
      case 'inlineCard': {
        if (isSafeAdfUrl(node.attrs?.url)) {
          result.push({
            type: 'inlineCard',
            attrs: { url: node.attrs.url.trim() },
          });
        } else if (node.attrs?.url) {
          result.push({ type: 'text', text: String(node.attrs.url) });
        }
        break;
      }
    }
  }

  return result;
}

export function getInlineNodesLength(nodes?: AdfInlineNode[]): number {
  if (!nodes || nodes.length === 0) return 0;
  let total = 0;
  for (const n of nodes) {
    total += n.type === 'text' ? n.text.length : 1;
  }
  return total;
}

interface FlattenedSegment {
  start: number;
  end: number;
  node: AdfInlineNode;
}

function flattenInlineSegments(nodes?: AdfInlineNode[]): FlattenedSegment[] {
  if (!nodes || nodes.length === 0) return [];
  const segs: FlattenedSegment[] = [];
  let cursor = 0;
  for (const node of nodes) {
    const len = node.type === 'text' ? node.text.length : 1;
    if (len === 0) continue;
    segs.push({ start: cursor, end: cursor + len, node });
    cursor += len;
  }
  return segs;
}

function markMatchesType(existing: AdfMark, target: AdfMark): boolean {
  if (existing.type !== target.type) return false;
  if (existing.type === 'subsup' && target.type === 'subsup') {
    return existing.attrs.type === target.attrs.type;
  }
  return true;
}

export function getActiveMarksAtRange(
  nodes: AdfInlineNode[] | undefined,
  rawStart: number,
  rawEnd: number
): AdfMark[] {
  const segs = flattenInlineSegments(nodes);
  if (segs.length === 0) return [];
  const totalLen = segs[segs.length - 1].end;
  const start = Math.max(0, Math.min(rawStart, totalLen));
  const end = Math.max(start, Math.min(rawEnd, totalLen));

  if (start === end) {
    // Collapsed caret: inspect text node immediately preceding caret (or at 0)
    for (const seg of segs) {
      if (seg.node.type === 'text') {
        if (
          (start > seg.start && start <= seg.end) ||
          (start === 0 && seg.start === 0)
        ) {
          return seg.node.marks ? [...seg.node.marks] : [];
        }
      }
    }
    return [];
  }

  const textSegsInRange = segs.filter(
    (s) => s.node.type === 'text' && s.end > start && s.start < end
  );
  if (textSegsInRange.length === 0) return [];

  const firstMarks =
    (textSegsInRange[0].node as AdfTextNode).marks || [];
  return firstMarks.filter((candidate) =>
    textSegsInRange.every((s) =>
      ((s.node as AdfTextNode).marks || []).some((m) =>
        markMatchesType(m, candidate)
      )
    )
  );
}

/**
 * Toggles or applies an ADF mark over `[rawStart, rawEnd]` within `AdfInlineNode[]`.
 * When `rawStart === rawEnd` (collapsed selection), inserts a marked placeholder run
 * and selects it so toolbar formatting buttons always provide immediate visual feedback.
 */
export function toggleInlineMarkInRange(
  nodes: AdfInlineNode[] | undefined,
  rawStart: number,
  rawEnd: number,
  mark: AdfMark,
  placeholderText?: string
): { content: AdfInlineNode[]; nextStart: number; nextEnd: number } {
  const safeNodes = normalizeInlineNodes(nodes);
  const totalLen = getInlineNodesLength(safeNodes);
  const start = Math.max(0, Math.min(rawStart, totalLen));
  const end = Math.max(start, Math.min(rawEnd, totalLen));

  if (start === end) {
    const defaultLabel =
      placeholderText ||
      (mark.type === 'strong'
        ? 'bold text'
        : mark.type === 'em'
        ? 'italic text'
        : mark.type === 'underline'
        ? 'underlined text'
        : mark.type === 'strike'
        ? 'strikethrough'
        : mark.type === 'code'
        ? 'code'
        : mark.type === 'link'
        ? 'link'
        : 'text');

    const markedNode: AdfTextNode = {
      type: 'text',
      text: defaultLabel,
      marks: normalizeAdfMarks([mark]),
    };
    const { before, after } = splitInlineNodesAtOffset(safeNodes, start);
    const merged = normalizeInlineNodes([...before, markedNode, ...after]);
    return {
      content: merged,
      nextStart: start,
      nextEnd: start + defaultLabel.length,
    };
  }

  const segs = flattenInlineSegments(safeNodes);
  const textSegs = segs.filter(
    (s) => s.node.type === 'text' && s.end > start && s.start < end
  );

  // Determine whether every text character in [start, end] already has this exact mark
  const allHaveExactMark =
    textSegs.length > 0 &&
    textSegs.every((s) =>
      ((s.node as AdfTextNode).marks || []).some((m) => {
        if (m.type !== mark.type) return false;
        if (m.type === 'textColor' && mark.type === 'textColor') {
          return m.attrs.color.toLowerCase() === mark.attrs.color.toLowerCase();
        }
        if (m.type === 'backgroundColor' && mark.type === 'backgroundColor') {
          return m.attrs.color.toLowerCase() === mark.attrs.color.toLowerCase();
        }
        if (m.type === 'link' && mark.type === 'link') {
          return m.attrs.href === mark.attrs.href;
        }
        if (m.type === 'subsup' && mark.type === 'subsup') {
          return m.attrs.type === mark.attrs.type;
        }
        return true;
      })
    );

  const nextNodes: AdfInlineNode[] = [];
  for (const seg of segs) {
    if (seg.end <= start || seg.start >= end || seg.node.type !== 'text') {
      nextNodes.push(seg.node);
      continue;
    }

    const textNode = seg.node;
    const relStart = Math.max(0, start - seg.start);
    const relEnd = Math.min(textNode.text.length, end - seg.start);

    if (relStart > 0) {
      nextNodes.push({
        type: 'text',
        text: textNode.text.slice(0, relStart),
        marks: textNode.marks,
      });
    }

    const middleText = textNode.text.slice(relStart, relEnd);
    const existingMarks = textNode.marks || [];
    const updatedMarks = allHaveExactMark
      ? existingMarks.filter((m) => m.type !== mark.type)
      : [
          ...existingMarks.filter(
            (m) =>
              m.type !== mark.type &&
              // If user applies an incompatible formatting mark over `code` text, replace `code`
              !(mark.type !== 'code' && mark.type !== 'link' && m.type === 'code')
          ),
          mark,
        ];

    nextNodes.push({
      type: 'text',
      text: middleText,
      marks: normalizeAdfMarks(updatedMarks),
    });

    if (relEnd < textNode.text.length) {
      nextNodes.push({
        type: 'text',
        text: textNode.text.slice(relEnd),
        marks: textNode.marks,
      });
    }
  }

  return {
    content: normalizeInlineNodes(nextNodes),
    nextStart: start,
    nextEnd: end,
  };
}

export function clearInlineMarksInRange(
  nodes: AdfInlineNode[] | undefined,
  rawStart: number,
  rawEnd: number
): AdfInlineNode[] {
  const safeNodes = normalizeInlineNodes(nodes);
  const totalLen = getInlineNodesLength(safeNodes);
  if (totalLen === 0) return [];
  const start = Math.max(0, Math.min(rawStart, totalLen));
  const end =
    rawStart === rawEnd ? totalLen : Math.max(start, Math.min(rawEnd, totalLen));
  const segs = flattenInlineSegments(safeNodes);
  const nextNodes: AdfInlineNode[] = [];

  for (const seg of segs) {
    if (seg.end <= start || seg.start >= end || seg.node.type !== 'text') {
      nextNodes.push(seg.node);
      continue;
    }
    const relStart = Math.max(0, start - seg.start);
    const relEnd = Math.min(seg.node.text.length, end - seg.start);
    if (relStart > 0) {
      nextNodes.push({
        type: 'text',
        text: seg.node.text.slice(0, relStart),
        marks: seg.node.marks,
      });
    }
    nextNodes.push({
      type: 'text',
      text: seg.node.text.slice(relStart, relEnd),
    });
    if (relEnd < seg.node.text.length) {
      nextNodes.push({
        type: 'text',
        text: seg.node.text.slice(relEnd),
        marks: seg.node.marks,
      });
    }
  }

  return normalizeInlineNodes(nextNodes);
}

export function splitInlineNodesAtOffset(
  nodes: AdfInlineNode[] | undefined,
  rawOffset: number
): { before: AdfInlineNode[]; after: AdfInlineNode[] } {
  const safeNodes = normalizeInlineNodes(nodes);
  const totalLen = getInlineNodesLength(safeNodes);
  const offset = Math.max(0, Math.min(rawOffset, totalLen));
  const segs = flattenInlineSegments(safeNodes);
  const before: AdfInlineNode[] = [];
  const after: AdfInlineNode[] = [];

  for (const seg of segs) {
    if (seg.end <= offset) {
      before.push(seg.node);
    } else if (seg.start >= offset) {
      after.push(seg.node);
    } else if (seg.node.type === 'text') {
      const cut = offset - seg.start;
      before.push({
        type: 'text',
        text: seg.node.text.slice(0, cut),
        marks: seg.node.marks,
      });
      after.push({
        type: 'text',
        text: seg.node.text.slice(cut),
        marks: seg.node.marks,
      });
    } else {
      after.push(seg.node);
    }
  }

  return {
    before: normalizeInlineNodes(before),
    after: normalizeInlineNodes(after),
  };
}

export function replaceInlineRange(
  nodes: AdfInlineNode[] | undefined,
  rawStart: number,
  rawEnd: number,
  replacement: AdfInlineNode[]
): { content: AdfInlineNode[]; nextOffset: number } {
  const safeNodes = normalizeInlineNodes(nodes);
  const totalLen = getInlineNodesLength(safeNodes);
  const start = Math.max(0, Math.min(rawStart, totalLen));
  const end = Math.max(start, Math.min(rawEnd, totalLen));

  const { before } = splitInlineNodesAtOffset(safeNodes, start);
  const { after } = splitInlineNodesAtOffset(safeNodes, end);
  const cleanRep = normalizeInlineNodes(replacement);
  const repLen = getInlineNodesLength(cleanRep);
  return {
    content: normalizeInlineNodes([...before, ...cleanRep, ...after]),
    nextOffset: start + repLen,
  };
}

export function insertInlineNodeAtOffset(
  nodes: AdfInlineNode[] | undefined,
  rawOffset: number,
  nodeToInsert: AdfInlineNode
): { content: AdfInlineNode[]; nextOffset: number } {
  return replaceInlineRange(nodes, rawOffset, rawOffset, [nodeToInsert]);
}

function normalizeBlockMarks(
  marks?: AdfBlockMark[]
): AdfBlockMark[] | undefined {
  if (!marks || !Array.isArray(marks) || marks.length === 0) return undefined;
  let chosen: AdfBlockMark | undefined;
  // In ADF Schema v1, `alignment` and `indentation` are mutually exclusive on blocks (latest wins)
  for (const m of marks) {
    if (!m || typeof m !== 'object') continue;
    if (
      m.type === 'alignment' &&
      (m.attrs?.align === 'center' || m.attrs?.align === 'end')
    ) {
      chosen = { type: 'alignment', attrs: { align: m.attrs.align } };
    } else if (m.type === 'indentation') {
      const lvl = Number(m.attrs?.level);
      if (Number.isInteger(lvl) && lvl >= 1 && lvl <= 6) {
        chosen = {
          type: 'indentation',
          attrs: { level: lvl as 1 | 2 | 3 | 4 | 5 | 6 },
        };
      }
    }
  }
  return chosen ? [chosen] : undefined;
}

const MAX_ADF_NESTING_DEPTH = 10;

export function normalizeAdfBlockNode(
  raw: unknown,
  depth = 0
): AdfBlockNode | null {
  if (!raw || typeof raw !== 'object' || depth > MAX_ADF_NESTING_DEPTH) {
    return null;
  }
  const node = raw as Record<string, unknown>;
  const type = node.type;

  switch (type) {
    case 'paragraph': {
      const content = normalizeInlineNodes(node.content as AdfInlineNode[]);
      const marks = normalizeBlockMarks(node.marks as AdfBlockMark[]);
      const out: AdfParagraphNode = { type: 'paragraph', content };
      if (marks) out.marks = marks;
      return out;
    }
    case 'heading': {
      const rawAttrs = (node.attrs as Record<string, unknown>) || {};
      const rawLevel = Number(rawAttrs.level);
      const level = (
        Number.isInteger(rawLevel) && rawLevel >= 1 && rawLevel <= 6
          ? rawLevel
          : 2
      ) as 1 | 2 | 3 | 4 | 5 | 6;
      const content = normalizeInlineNodes(node.content as AdfInlineNode[]);
      const marks = normalizeBlockMarks(node.marks as AdfBlockMark[]);
      const out: AdfHeadingNode = {
        type: 'heading',
        attrs: { level },
        content,
      };
      if (marks) out.marks = marks;
      return out;
    }
    case 'bulletList':
    case 'orderedList': {
      const rawItems = Array.isArray(node.content) ? node.content : [];
      const items: AdfListItemNode[] = [];
      for (const item of rawItems) {
        if (!item || typeof item !== 'object') continue;
        const itemObj = item as Record<string, unknown>;
        const rawChildren = Array.isArray(itemObj.content)
          ? itemObj.content
          : [];
        const normalizedChildren: AdfListItemNode['content'] = [];
        for (const ch of rawChildren) {
          const normCh = normalizeAdfBlockNode(ch, depth + 1);
          if (
            normCh &&
            (normCh.type === 'paragraph' ||
              normCh.type === 'bulletList' ||
              normCh.type === 'orderedList' ||
              normCh.type === 'codeBlock')
          ) {
            normalizedChildren.push(normCh);
          }
        }
        if (normalizedChildren.length === 0) {
          normalizedChildren.push({ type: 'paragraph', content: [] });
        } else if (normalizedChildren[0].type !== 'paragraph' && normalizedChildren[0].type !== 'codeBlock') {
          normalizedChildren.unshift({ type: 'paragraph', content: [] });
        }
        items.push({ type: 'listItem', content: normalizedChildren });
      }
      if (items.length === 0) {
        items.push({
          type: 'listItem',
          content: [{ type: 'paragraph', content: [] }],
        });
      }
      if (type === 'orderedList') {
        const rawOrder = Number(
          ((node.attrs as Record<string, unknown>) || {}).order
        );
        return Number.isInteger(rawOrder) && rawOrder >= 1
          ? { type: 'orderedList', attrs: { order: rawOrder }, content: items }
          : { type: 'orderedList', content: items };
      }
      return { type: 'bulletList', content: items };
    }
    case 'taskList': {
      const rawAttrs = (node.attrs as Record<string, unknown>) || {};
      const localId =
        typeof rawAttrs.localId === 'string' && rawAttrs.localId
          ? rawAttrs.localId
          : createAdfLocalId('tasklist');
      const rawItems = Array.isArray(node.content) ? node.content : [];
      const content: Array<AdfTaskItemNode | AdfTaskListNode> = [];
      for (const item of rawItems) {
        if (!item || typeof item !== 'object') continue;
        const itemObj = item as Record<string, unknown>;
        if (itemObj.type === 'taskList') {
          const nested = normalizeAdfBlockNode(itemObj, depth + 1);
          if (nested && nested.type === 'taskList') content.push(nested);
        } else if (itemObj.type === 'taskItem') {
          const iAttrs = (itemObj.attrs as Record<string, unknown>) || {};
          content.push({
            type: 'taskItem',
            attrs: {
              localId:
                typeof iAttrs.localId === 'string' && iAttrs.localId
                  ? iAttrs.localId
                  : createAdfLocalId('task'),
              state: iAttrs.state === 'DONE' ? 'DONE' : 'TODO',
            },
            content: normalizeInlineNodes(itemObj.content as AdfInlineNode[]),
          });
        }
      }
      if (content.length === 0 || content[0].type !== 'taskItem') {
        content.unshift({
          type: 'taskItem',
          attrs: { localId: createAdfLocalId('task'), state: 'TODO' },
          content: [],
        });
      }
      return { type: 'taskList', attrs: { localId }, content };
    }
    case 'decisionList': {
      const rawAttrs = (node.attrs as Record<string, unknown>) || {};
      const localId =
        typeof rawAttrs.localId === 'string' && rawAttrs.localId
          ? rawAttrs.localId
          : createAdfLocalId('declist');
      const rawItems = Array.isArray(node.content) ? node.content : [];
      const content: AdfDecisionItemNode[] = [];
      for (const item of rawItems) {
        if (!item || typeof item !== 'object') continue;
        const itemObj = item as Record<string, unknown>;
        if (itemObj.type === 'decisionItem') {
          const iAttrs = (itemObj.attrs as Record<string, unknown>) || {};
          content.push({
            type: 'decisionItem',
            attrs: {
              localId:
                typeof iAttrs.localId === 'string' && iAttrs.localId
                  ? iAttrs.localId
                  : createAdfLocalId('dec'),
              state: iAttrs.state === 'UNDECIDED' ? 'UNDECIDED' : 'DECIDED',
            },
            content: normalizeInlineNodes(itemObj.content as AdfInlineNode[]),
          });
        }
      }
      if (content.length === 0) {
        content.push({
          type: 'decisionItem',
          attrs: { localId: createAdfLocalId('dec'), state: 'DECIDED' },
          content: [],
        });
      }
      return { type: 'decisionList', attrs: { localId }, content };
    }
    case 'panel': {
      const rawAttrs = (node.attrs as Record<string, unknown>) || {};
      const validTypes = new Set<AdfPanelType>([
        'info',
        'note',
        'warning',
        'success',
        'error',
        'custom',
      ]);
      const panelType: AdfPanelType = validTypes.has(
        rawAttrs.panelType as AdfPanelType
      )
        ? (rawAttrs.panelType as AdfPanelType)
        : 'info';
      const inner = normalizeBlockArray(node.content, depth + 1).filter(
        (b) => b.type !== 'panel' && b.type !== 'layoutSection'
      );
      const out: AdfPanelNode = {
        type: 'panel',
        attrs: { panelType },
        content: inner.length > 0 ? inner : [{ type: 'paragraph', content: [] }],
      };
      const cleanColor = sanitizeHexColor(rawAttrs.panelColor as string);
      if (panelType === 'custom' && cleanColor) {
        out.attrs.panelColor = cleanColor;
      }
      return out;
    }
    case 'blockquote': {
      const inner = normalizeBlockArray(node.content, depth + 1);
      return {
        type: 'blockquote',
        content: inner.length > 0 ? inner : [{ type: 'paragraph', content: [] }],
      };
    }
    case 'codeBlock': {
      const rawAttrs = (node.attrs as Record<string, unknown>) || {};
      const language =
        typeof rawAttrs.language === 'string' && rawAttrs.language.trim()
          ? rawAttrs.language.trim().toLowerCase()
          : undefined;
      const rawContent = Array.isArray(node.content) ? node.content : [];
      const joined = rawContent
        .map((c) =>
          c && typeof c === 'object' && typeof (c as AdfTextNode).text === 'string'
            ? (c as AdfTextNode).text
            : ''
        )
        .join('');
      const out: AdfCodeBlockNode = {
        type: 'codeBlock',
        content: joined.length > 0 ? [{ type: 'text', text: joined }] : [],
      };
      if (language) {
        out.attrs = { language };
      }
      return out;
    }
    case 'rule':
      return { type: 'rule' };
    case 'expand':
    case 'nestedExpand': {
      const rawAttrs = (node.attrs as Record<string, unknown>) || {};
      const title =
        typeof rawAttrs.title === 'string' ? rawAttrs.title : '';
      const inner = normalizeBlockArray(node.content, depth + 1);
      const out: AdfExpandNode = {
        type: type === 'nestedExpand' ? 'nestedExpand' : 'expand',
        attrs: { title },
        content: inner.length > 0 ? inner : [{ type: 'paragraph', content: [] }],
      };
      return out;
    }
    case 'table': {
      const rawAttrs = (node.attrs as Record<string, unknown>) || {};
      const rawRows = Array.isArray(node.content) ? node.content : [];
      const rows: AdfTableRowNode[] = [];
      for (const r of rawRows) {
        if (!r || typeof r !== 'object') continue;
        const rObj = r as Record<string, unknown>;
        const rawCells = Array.isArray(rObj.content) ? rObj.content : [];
        const cells: AdfTableCellNode[] = [];
        for (const c of rawCells) {
          if (!c || typeof c !== 'object') continue;
          const cObj = c as Record<string, unknown>;
          const cellType =
            cObj.type === 'tableHeader' ? 'tableHeader' : 'tableCell';
          const cAttrs = (cObj.attrs as Record<string, unknown>) || {};
          const inner = normalizeBlockArray(cObj.content, depth + 1).map((b) =>
            b.type === 'expand' ? { ...b, type: 'nestedExpand' as const } : b
          );
          const cleanBg = sanitizeHexColor(cAttrs.background as string);
          const cellOut: AdfTableCellNode = {
            type: cellType,
            content:
              inner.length > 0 ? inner : [{ type: 'paragraph', content: [] }],
          };
          if (cleanBg) {
            cellOut.attrs = { background: cleanBg };
          }
          cells.push(cellOut);
        }
        if (cells.length > 0) {
          rows.push({ type: 'tableRow', content: cells });
        }
      }
      if (rows.length === 0) {
        return createDefaultAdfTable(2, 2, true);
      }
      // Normalize column counts across all rows so table grid is rectangular
      const maxCols = Math.max(1, ...rows.map((r) => r.content.length));
      for (let ri = 0; ri < rows.length; ri++) {
        const isHeaderRow = rows[ri].content.every(
          (c) => c.type === 'tableHeader'
        );
        while (rows[ri].content.length < maxCols) {
          rows[ri].content.push({
            type: isHeaderRow ? 'tableHeader' : 'tableCell',
            content: [{ type: 'paragraph', content: [] }],
          });
        }
      }
      return {
        type: 'table',
        attrs: {
          isNumberColumnEnabled: Boolean(rawAttrs.isNumberColumnEnabled),
          layout:
            rawAttrs.layout === 'wide' || rawAttrs.layout === 'full-width'
              ? rawAttrs.layout
              : 'default',
        },
        content: rows,
      };
    }
    case 'layoutSection': {
      const rawCols = Array.isArray(node.content) ? node.content : [];
      const cols: AdfLayoutColumnNode[] = [];
      for (const col of rawCols) {
        if (!col || typeof col !== 'object') continue;
        const colObj = col as Record<string, unknown>;
        const colAttrs = (colObj.attrs as Record<string, unknown>) || {};
        const inner = normalizeBlockArray(colObj.content, depth + 1).filter(
          (b) => b.type !== 'layoutSection'
        );
        cols.push({
          type: 'layoutColumn',
          attrs: {
            width:
              typeof colAttrs.width === 'number' && Number.isFinite(colAttrs.width)
                ? colAttrs.width
                : 50,
          },
          content: inner.length > 0 ? inner : [{ type: 'paragraph', content: [] }],
        });
      }
      if (cols.length < 2) {
        return createDefaultAdfLayout(2);
      }
      return { type: 'layoutSection', content: cols };
    }
    case 'mediaSingle': {
      const rawAttrs = (node.attrs as Record<string, unknown>) || {};
      const rawMediaList = Array.isArray(node.content) ? node.content : [];
      const firstMedia = (rawMediaList[0] as Record<string, unknown>) || {};
      const mAttrs = (firstMedia.attrs as Record<string, unknown>) || {};
      const rawUrl = typeof mAttrs.url === 'string' ? mAttrs.url.trim() : '';
      if (mAttrs.type === 'external' && isSafeAdfUrl(rawUrl)) {
        return {
          type: 'mediaSingle',
          attrs: {
            layout:
              rawAttrs.layout === 'align-start' ||
              rawAttrs.layout === 'align-end' ||
              rawAttrs.layout === 'wide' ||
              rawAttrs.layout === 'full-width'
                ? rawAttrs.layout
                : 'center',
          },
          content: [
            {
              type: 'media',
              attrs: {
                type: 'external',
                url: rawUrl,
                alt: typeof mAttrs.alt === 'string' ? mAttrs.alt : 'Image',
              },
            },
          ],
        };
      }
      if (typeof mAttrs.id === 'string' && mAttrs.id) {
        return {
          type: 'mediaSingle',
          attrs: { layout: 'center' },
          content: [
            {
              type: 'media',
              attrs: {
                type: 'file',
                id: mAttrs.id,
                collection:
                  typeof mAttrs.collection === 'string' ? mAttrs.collection : '',
                alt: typeof mAttrs.alt === 'string' ? mAttrs.alt : 'Attachment',
              },
            },
          ],
        };
      }
      return null;
    }
    case 'blockCard': {
      const rawAttrs = (node.attrs as Record<string, unknown>) || {};
      const url = typeof rawAttrs.url === 'string' ? rawAttrs.url.trim() : '';
      if (isSafeAdfUrl(url)) {
        return { type: 'blockCard', attrs: { url } };
      }
      return null;
    }
    default:
      return null;
  }
}

function normalizeBlockArray(rawContent: unknown, depth = 0): AdfBlockNode[] {
  if (!Array.isArray(rawContent) || depth > MAX_ADF_NESTING_DEPTH) return [];
  const blocks: AdfBlockNode[] = [];
  for (const item of rawContent) {
    const norm = normalizeAdfBlockNode(item, depth);
    if (norm) blocks.push(norm);
  }
  return blocks;
}

export function validateAndNormalizeAdfDoc(
  candidate: unknown
): { valid: true; doc: AdfDocNode } | { valid: false; error: string } {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return { valid: false, error: 'Root ADF value must be a JSON object.' };
  }
  const obj = candidate as Record<string, unknown>;
  if (obj.version !== 1) {
    return {
      valid: false,
      error: 'ADF root must specify "version": 1.',
    };
  }
  if (obj.type !== 'doc') {
    return {
      valid: false,
      error: 'ADF root must specify "type": "doc".',
    };
  }
  if (!Array.isArray(obj.content)) {
    return {
      valid: false,
      error: 'ADF root must contain a "content" block array.',
    };
  }
  const normalizedBlocks = normalizeBlockArray(obj.content);
  return {
    valid: true,
    doc: {
      version: 1,
      type: 'doc',
      content:
        normalizedBlocks.length > 0
          ? normalizedBlocks
          : [{ type: 'paragraph', content: [] }],
    },
  };
}

export function parseAdfJsonString(
  rawJson: string
): { valid: true; doc: AdfDocNode } | { valid: false; error: string } {
  try {
    const parsed = JSON.parse(rawJson);
    return validateAndNormalizeAdfDoc(parsed);
  } catch (err) {
    return {
      valid: false,
      error:
        err instanceof Error ? err.message : 'Invalid JSON syntax in ADF document.',
    };
  }
}

export function createDefaultAdfTable(
  rows = 3,
  cols = 3,
  withHeader = true
): AdfTableNode {
  const tableRows: AdfTableRowNode[] = [];
  for (let r = 0; r < rows; r++) {
    const isHeader = withHeader && r === 0;
    const cells: AdfTableCellNode[] = [];
    for (let c = 0; c < cols; c++) {
      cells.push({
        type: isHeader ? 'tableHeader' : 'tableCell',
        content: [
          {
            type: 'paragraph',
            content: isHeader
              ? [
                  {
                    type: 'text',
                    text: `Header ${c + 1}`,
                    marks: [{ type: 'strong' }],
                  },
                ]
              : [],
          },
        ],
      });
    }
    tableRows.push({ type: 'tableRow', content: cells });
  }
  return {
    type: 'table',
    attrs: { isNumberColumnEnabled: false, layout: 'default' },
    content: tableRows,
  };
}

export function createDefaultAdfLayout(columns: 2 | 3 = 2): AdfLayoutSectionNode {
  const width = columns === 3 ? 33.33 : 50;
  const cols: AdfLayoutColumnNode[] = [];
  for (let i = 0; i < columns; i++) {
    cols.push({
      type: 'layoutColumn',
      attrs: { width },
      content: [{ type: 'paragraph', content: [] }],
    });
  }
  return { type: 'layoutSection', content: cols };
}

/**
 * Parses inline Markdown + Jira inline extensions into canonical `AdfInlineNode[]`.
 * Supports:
 * - Inline code: `code`
 * - Status lozenge: [STATUS: IN PROGRESS | blue]
 * - Date lozenge: [DATE: 2026-10-28]
 * - Smart card: [https://example.com](card)
 * - Links: [label](https://example.com)
 * - Bold + Italic: ***text***
 * - Bold: **text** or __text__
 * - Underline: <u>text</u> or ++text++
 * - Strikethrough: ~~text~~
 * - Subscript / Superscript: <sub>text</sub> / <sup>text</sup>
 * - Colored text: <span style="color:#4C9AFF">text</span>
 * - Highlighted text: ==text==
 * - Italic: *text* or _text_
 * - Mention: @[Display Name] or @username
 * - Emoji shortname: :rocket:
 */
export function parseInlineMarkdownToAdf(
  text: string,
  inheritedMarks: AdfMark[] = []
): AdfInlineNode[] {
  if (!text) return [];

  const tokenRegex =
    /(`[^`\n]+`|\[STATUS:\s*([^\]|]+?)(?:\s*\|\s*(neutral|purple|blue|red|yellow|green))?\s*\]|\[DATE:\s*([^\]]+?)\s*\]|\[([^\]]+)\]\(([^)\s]+)\)|\*\*\*([^*\n]+)\*\*\*|\*\*([^*\n]+)\*\*|__([^_\n]+)__|<u>([\s\S]+?)<\/u>|\+\+([^+\n]+)\+\+|~~([^~\n]+)~~|<sub>([\s\S]+?)<\/sub>|<sup>([\s\S]+?)<\/sup>|<span\s+style="color:\s*(#[0-9a-fA-F]{3,6})"\s*>([\s\S]+?)<\/span>|==([^=\n]+)==|\*([^*\n]+)\*|(?<![a-zA-Z0-9])_([^_\n]+)_(?![a-zA-Z0-9])|@\[([^\]]+)\]|(?<![a-zA-Z0-9])@([a-zA-Z0-9._-]{2,32})|:(check_mark|cross_mark|warning|rocket|fire|bulb|pushpin|eyes|thumbsup|tada|bug|wrench):)/g;

  const nodes: AdfInlineNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push({
        type: 'text',
        text: text.slice(lastIndex, match.index),
        marks: normalizeAdfMarks(inheritedMarks),
      });
    }

    const full = match[0];

    if (full.startsWith('`') && full.endsWith('`')) {
      nodes.push({
        type: 'text',
        text: full.slice(1, -1),
        marks: normalizeAdfMarks([...inheritedMarks, { type: 'code' }]),
      });
    } else if (match[2] !== undefined) {
      // [STATUS: TEXT | color]
      const statusText = match[2].trim();
      const statusColor = (match[3] as AdfStatusColor) || 'blue';
      nodes.push({
        type: 'status',
        attrs: {
          text: statusText,
          color: statusColor,
          localId: createAdfLocalId('status'),
        },
      });
    } else if (match[4] !== undefined) {
      // [DATE: YYYY-MM-DD]
      const rawDate = match[4].trim();
      const parsedMs = /^\d{10,14}$/.test(rawDate)
        ? Number(rawDate)
        : Date.parse(rawDate);
      const ts = Number.isFinite(parsedMs) ? String(parsedMs) : String(Date.now());
      nodes.push({ type: 'date', attrs: { timestamp: ts } });
    } else if (match[5] !== undefined && match[6] !== undefined) {
      // [label](href) or [url](card)
      const label = match[5];
      const href = match[6].trim();
      if (href === 'card' && isSafeAdfUrl(label)) {
        nodes.push({ type: 'inlineCard', attrs: { url: label.trim() } });
      } else if (isSafeAdfUrl(href)) {
        nodes.push(
          ...parseInlineMarkdownToAdf(label, [
            ...inheritedMarks,
            { type: 'link', attrs: { href } },
          ])
        );
      } else {
        nodes.push({
          type: 'text',
          text: full,
          marks: normalizeAdfMarks(inheritedMarks),
        });
      }
    } else if (match[7] !== undefined) {
      nodes.push(
        ...parseInlineMarkdownToAdf(match[7], [
          ...inheritedMarks,
          { type: 'strong' },
          { type: 'em' },
        ])
      );
    } else if (match[8] !== undefined || match[9] !== undefined) {
      nodes.push(
        ...parseInlineMarkdownToAdf(match[8] ?? match[9], [
          ...inheritedMarks,
          { type: 'strong' },
        ])
      );
    } else if (match[10] !== undefined || match[11] !== undefined) {
      nodes.push(
        ...parseInlineMarkdownToAdf(match[10] ?? match[11], [
          ...inheritedMarks,
          { type: 'underline' },
        ])
      );
    } else if (match[12] !== undefined) {
      nodes.push(
        ...parseInlineMarkdownToAdf(match[12], [
          ...inheritedMarks,
          { type: 'strike' },
        ])
      );
    } else if (match[13] !== undefined) {
      nodes.push({
        type: 'text',
        text: match[13],
        marks: normalizeAdfMarks([
          ...inheritedMarks,
          { type: 'subsup', attrs: { type: 'sub' } },
        ]),
      });
    } else if (match[14] !== undefined) {
      nodes.push({
        type: 'text',
        text: match[14],
        marks: normalizeAdfMarks([
          ...inheritedMarks,
          { type: 'subsup', attrs: { type: 'sup' } },
        ]),
      });
    } else if (match[15] !== undefined && match[16] !== undefined) {
      nodes.push(
        ...parseInlineMarkdownToAdf(match[16], [
          ...inheritedMarks,
          { type: 'textColor', attrs: { color: match[15] } },
        ])
      );
    } else if (match[17] !== undefined) {
      nodes.push(
        ...parseInlineMarkdownToAdf(match[17], [
          ...inheritedMarks,
          { type: 'backgroundColor', attrs: { color: '#974F0C' } },
        ])
      );
    } else if (match[18] !== undefined || match[19] !== undefined) {
      nodes.push(
        ...parseInlineMarkdownToAdf(match[18] ?? match[19], [
          ...inheritedMarks,
          { type: 'em' },
        ])
      );
    } else if (match[20] !== undefined || match[21] !== undefined) {
      const name = (match[20] ?? match[21]).trim();
      nodes.push({
        type: 'mention',
        attrs: {
          id: name.toLowerCase().replace(/\s+/g, '.'),
          text: `@${name}`,
        },
      });
    } else if (match[22] !== undefined) {
      const shortName = `:${match[22]}:`;
      nodes.push({
        type: 'emoji',
        attrs: {
          shortName,
          text: EMOJI_BY_SHORTNAME.get(shortName) || '🙂',
        },
      });
    }

    lastIndex = match.index + full.length;
  }

  if (lastIndex < text.length) {
    nodes.push({
      type: 'text',
      text: text.slice(lastIndex),
      marks: normalizeAdfMarks(inheritedMarks),
    });
  }

  return normalizeInlineNodes(nodes);
}

function parseTableCellsRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '');
  return trimmed
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, '|'));
}

function isMarkdownTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes('|') && !trimmed.includes('-')) return false;
  const cells = parseTableCellsRow(trimmed);
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c));
}

/**
 * Converts Markdown (including GFM tables, checklists, Mermaid/code fences,
 * GitHub/Jira callout panels, `<details>` expand blocks, status chips, mentions,
 * dates, and nested lists) into a canonical ADF Schema v1 document.
 */
export function markdownToAdf(markdown: string): AdfDocNode {
  if (!markdown || !markdown.trim()) {
    return createEmptyAdfDoc();
  }

  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks = parseMarkdownLinesToBlocks(lines);
  return {
    version: 1,
    type: 'doc',
    content: blocks.length > 0 ? blocks : [{ type: 'paragraph', content: [] }],
  };
}

function parseMarkdownLinesToBlocks(lines: string[]): AdfBlockNode[] {
  const blocks: AdfBlockNode[] = [];
  let idx = 0;

  while (idx < lines.length) {
    const line = lines[idx];

    // Skip blank lines between blocks
    if (!line.trim()) {
      idx += 1;
      continue;
    }

    // 1. Fenced code block ```lang ... ```
    const codeMatch = line.match(/^\s*```([a-zA-Z0-9_+-]*)\s*$/);
    if (codeMatch) {
      const language = codeMatch[1]?.trim().toLowerCase() || undefined;
      const codeLines: string[] = [];
      idx += 1;
      while (idx < lines.length && !/^\s*```\s*$/.test(lines[idx])) {
        codeLines.push(lines[idx]);
        idx += 1;
      }
      if (idx < lines.length) idx += 1;
      const rawCode = codeLines.join('\n');
      const cb: AdfCodeBlockNode = {
        type: 'codeBlock',
        content: rawCode.length > 0 ? [{ type: 'text', text: rawCode }] : [],
      };
      if (language) cb.attrs = { language };
      blocks.push(cb);
      continue;
    }

    // 2. Collapsible <details><summary>Title</summary> ... </details> -> expand
    if (/^\s*<details>\s*$/i.test(line)) {
      idx += 1;
      let title = 'Details';
      if (idx < lines.length) {
        const sumMatch = lines[idx].match(
          /^\s*<summary>([\s\S]*?)<\/summary>\s*$/i
        );
        if (sumMatch) {
          title = sumMatch[1].trim();
          idx += 1;
        }
      }
      const innerLines: string[] = [];
      while (idx < lines.length && !/^\s*<\/details>\s*$/i.test(lines[idx])) {
        innerLines.push(lines[idx]);
        idx += 1;
      }
      if (idx < lines.length) idx += 1;
      const innerBlocks = parseMarkdownLinesToBlocks(innerLines);
      blocks.push({
        type: 'expand',
        attrs: { title },
        content:
          innerBlocks.length > 0
            ? innerBlocks
            : [{ type: 'paragraph', content: [] }],
      });
      continue;
    }

    // 3. Horizontal rule
    if (/^\s*(?:[-*_]){3,}\s*$/.test(line)) {
      blocks.push({ type: 'rule' });
      idx += 1;
      continue;
    }

    // 4. Headings (# .. ######)
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length as 1 | 2 | 3 | 4 | 5 | 6;
      blocks.push({
        type: 'heading',
        attrs: { level },
        content: parseInlineMarkdownToAdf(headingMatch[2].trim()),
      });
      idx += 1;
      continue;
    }

    // 5. Standalone Image ![alt](url) -> mediaSingle
    const imgMatch = line.trim().match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
    if (imgMatch && isSafeAdfUrl(imgMatch[2])) {
      blocks.push({
        type: 'mediaSingle',
        attrs: { layout: 'center' },
        content: [
          {
            type: 'media',
            attrs: {
              type: 'external',
              url: imgMatch[2].trim(),
              alt: imgMatch[1] || 'Image',
            },
          },
        ],
      });
      idx += 1;
      continue;
    }

    // 6. GFM Table
    if (
      line.includes('|') &&
      idx + 1 < lines.length &&
      isMarkdownTableSeparator(lines[idx + 1])
    ) {
      const headerCells = parseTableCellsRow(line);
      const colCount = Math.max(1, headerCells.length);
      const tableRows: AdfTableRowNode[] = [
        {
          type: 'tableRow',
          content: headerCells.map((cellText) => ({
            type: 'tableHeader',
            content: [
              {
                type: 'paragraph',
                content: parseInlineMarkdownToAdf(cellText),
              },
            ],
          })),
        },
      ];
      idx += 2; // Skip header and separator row
      while (idx < lines.length && lines[idx].trim().includes('|')) {
        const rawRow = parseTableCellsRow(lines[idx]);
        const normalizedCells: AdfTableCellNode[] = [];
        for (let c = 0; c < colCount; c++) {
          normalizedCells.push({
            type: 'tableCell',
            content: [
              {
                type: 'paragraph',
                content: parseInlineMarkdownToAdf(rawRow[c] || ''),
              },
            ],
          });
        }
        tableRows.push({ type: 'tableRow', content: normalizedCells });
        idx += 1;
      }
      blocks.push({
        type: 'table',
        attrs: { isNumberColumnEnabled: false, layout: 'default' },
        content: tableRows,
      });
      continue;
    }

    // 7. Callout Panels (> [!INFO] / [!NOTE] / [!SUCCESS] / [!TIP] / [!WARNING] / [!ERROR] / [!CAUTION]) or Blockquotes (> ...)
    const panelHeaderMatch = line.match(
      /^\s*>\s*\[!(INFO|NOTE|TIP|SUCCESS|WARNING|ERROR|CAUTION)\]\s*(.*)$/i
    );
    if (panelHeaderMatch) {
      const rawKind = panelHeaderMatch[1].toUpperCase();
      const panelType: AdfPanelType =
        rawKind === 'NOTE'
          ? 'note'
          : rawKind === 'TIP' || rawKind === 'SUCCESS'
          ? 'success'
          : rawKind === 'WARNING'
          ? 'warning'
          : rawKind === 'ERROR' || rawKind === 'CAUTION'
          ? 'error'
          : 'info';
      const panelLines: string[] = [];
      if (panelHeaderMatch[2]?.trim()) {
        panelLines.push(panelHeaderMatch[2].trim());
      }
      idx += 1;
      while (idx < lines.length && /^\s*>/.test(lines[idx])) {
        panelLines.push(lines[idx].replace(/^\s*>\s?/, ''));
        idx += 1;
      }
      const inner = parseMarkdownLinesToBlocks(panelLines);
      blocks.push({
        type: 'panel',
        attrs: { panelType },
        content: inner.length > 0 ? inner : [{ type: 'paragraph', content: [] }],
      });
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (idx < lines.length && /^\s*>\s?/.test(lines[idx])) {
        quoteLines.push(lines[idx].replace(/^\s*>\s?/, ''));
        idx += 1;
      }
      const inner = parseMarkdownLinesToBlocks(quoteLines);
      blocks.push({
        type: 'blockquote',
        content: inner.length > 0 ? inner : [{ type: 'paragraph', content: [] }],
      });
      continue;
    }

    // 8. Task / Action List (- [ ] / - [x] / [] / [x])
    const isTaskLine = (l: string) =>
      /^\s*(?:[-*•]\s+)?\[([ xX]?)\]\s+(.*)$/.test(l) ||
      /^\s*[-*•]\s+\[([ xX])\]\s*(.*)$/.test(l);
    if (isTaskLine(line)) {
      const taskItems: AdfTaskItemNode[] = [];
      while (idx < lines.length && isTaskLine(lines[idx])) {
        const m =
          lines[idx].match(/^\s*[-*•]\s+\[([ xX])\]\s*(.*)$/) ||
          lines[idx].match(/^\s*\[([ xX]?)\]\s+(.*)$/);
        if (m) {
          const isDone = m[1].toLowerCase() === 'x';
          taskItems.push({
            type: 'taskItem',
            attrs: {
              localId: createAdfLocalId('task'),
              state: isDone ? 'DONE' : 'TODO',
            },
            content: parseInlineMarkdownToAdf(m[2].trim()),
          });
        }
        idx += 1;
      }
      blocks.push({
        type: 'taskList',
        attrs: { localId: createAdfLocalId('tasklist') },
        content: taskItems,
      });
      continue;
    }

    // 9. Decision List (<> Decision item)
    if (/^\s*(?:[-*]\s+)?<>\s+(.*)$/.test(line)) {
      const decItems: AdfDecisionItemNode[] = [];
      while (idx < lines.length && /^\s*(?:[-*]\s+)?<>\s+(.*)$/.test(lines[idx])) {
        const m = lines[idx].match(/^\s*(?:[-*]\s+)?<>\s+(.*)$/);
        if (m) {
          decItems.push({
            type: 'decisionItem',
            attrs: {
              localId: createAdfLocalId('dec'),
              state: 'DECIDED',
            },
            content: parseInlineMarkdownToAdf(m[1].trim()),
          });
        }
        idx += 1;
      }
      blocks.push({
        type: 'decisionList',
        attrs: { localId: createAdfLocalId('declist') },
        content: decItems,
      });
      continue;
    }

    // 10. Ordered List (1. item)
    const olMatch = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
    if (olMatch) {
      const startOrder = Number(olMatch[2]) || 1;
      const items: AdfListItemNode[] = [];
      while (idx < lines.length && /^(\s*)(\d+)\.\s+(.*)$/.test(lines[idx])) {
        const m = lines[idx].match(/^(\s*)(\d+)\.\s+(.*)$/)!;
        const baseIndent = m[1].length;
        const itemContent: AdfListItemNode['content'] = [
          {
            type: 'paragraph',
            content: parseInlineMarkdownToAdf(m[3].trim()),
          },
        ];
        idx += 1;
        // Collect indented nested bullet/numbered lines
        const nestedBullet: AdfListItemNode[] = [];
        while (
          idx < lines.length &&
          lines[idx].match(/^(\s+)(?:[-*•]|\d+\.)\s+(.*)$/) &&
          lines[idx].match(/^(\s+)/)![1].length > baseIndent
        ) {
          const sub = lines[idx].match(/^(\s+)(?:[-*•]|\d+\.)\s+(.*)$/)!;
          nestedBullet.push({
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: parseInlineMarkdownToAdf(sub[2].trim()),
              },
            ],
          });
          idx += 1;
        }
        if (nestedBullet.length > 0) {
          itemContent.push({ type: 'bulletList', content: nestedBullet });
        }
        items.push({ type: 'listItem', content: itemContent });
      }
      const olNode: AdfOrderedListNode =
        startOrder !== 1
          ? { type: 'orderedList', attrs: { order: startOrder }, content: items }
          : { type: 'orderedList', content: items };
      blocks.push(olNode);
      continue;
    }

    // 11. Bullet List (- item / * item / • item)
    const ulMatch = line.match(/^(\s*)[-*•]\s+(.*)$/);
    if (ulMatch) {
      const items: AdfListItemNode[] = [];
      while (
        idx < lines.length &&
        /^(\s*)[-*•]\s+(.*)$/.test(lines[idx]) &&
        !isTaskLine(lines[idx])
      ) {
        const m = lines[idx].match(/^(\s*)[-*•]\s+(.*)$/)!;
        const baseIndent = m[1].length;
        const itemContent: AdfListItemNode['content'] = [
          {
            type: 'paragraph',
            content: parseInlineMarkdownToAdf(m[2].trim()),
          },
        ];
        idx += 1;
        const nestedItems: AdfListItemNode[] = [];
        while (
          idx < lines.length &&
          !isTaskLine(lines[idx]) &&
          lines[idx].match(/^(\s+)[-*•]\s+(.*)$/) &&
          lines[idx].match(/^(\s+)/)![1].length > baseIndent
        ) {
          const sub = lines[idx].match(/^(\s+)[-*•]\s+(.*)$/)!;
          nestedItems.push({
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: parseInlineMarkdownToAdf(sub[2].trim()),
              },
            ],
          });
          idx += 1;
        }
        if (nestedItems.length > 0) {
          itemContent.push({ type: 'bulletList', content: nestedItems });
        }
        items.push({ type: 'listItem', content: itemContent });
      }
      blocks.push({ type: 'bulletList', content: items });
      continue;
    }

    // 12. Standard Paragraph
    blocks.push({
      type: 'paragraph',
      content: parseInlineMarkdownToAdf(line),
    });
    idx += 1;
  }

  return blocks;
}

export function serializeInlineAdfToMarkdown(
  nodes?: AdfInlineNode[]
): string {
  if (!nodes || nodes.length === 0) return '';
  return nodes
    .map((node) => {
      switch (node.type) {
        case 'text': {
          let out = node.text;
          const marks = node.marks || [];
          if (marks.some((m) => m.type === 'code')) {
            out = `\`${out}\``;
            const link = marks.find((m) => m.type === 'link');
            if (link && link.type === 'link') {
              out = `[${out}](${link.attrs.href})`;
            }
            return out;
          }
          for (const m of marks) {
            if (m.type === 'subsup') {
              out =
                m.attrs.type === 'sub' ? `<sub>${out}</sub>` : `<sup>${out}</sup>`;
            }
          }
          const colorMark = marks.find((m) => m.type === 'textColor');
          if (colorMark && colorMark.type === 'textColor') {
            out = `<span style="color:${colorMark.attrs.color}">${out}</span>`;
          }
          if (marks.some((m) => m.type === 'backgroundColor')) {
            out = `==${out}==`;
          }
          if (marks.some((m) => m.type === 'strike')) {
            out = `~~${out}~~`;
          }
          if (marks.some((m) => m.type === 'underline')) {
            out = `<u>${out}</u>`;
          }
          const isBold = marks.some((m) => m.type === 'strong');
          const isItalic = marks.some((m) => m.type === 'em');
          if (isBold && isItalic) {
            out = `***${out}***`;
          } else if (isBold) {
            out = `**${out}**`;
          } else if (isItalic) {
            out = `*${out}*`;
          }
          const linkMark = marks.find((m) => m.type === 'link');
          if (linkMark && linkMark.type === 'link') {
            out = `[${out}](${linkMark.attrs.href})`;
          }
          return out;
        }
        case 'hardBreak':
          return '\n';
        case 'status':
          return `[STATUS: ${node.attrs.text} | ${node.attrs.color}]`;
        case 'mention': {
          const cleanName = (node.attrs.text || `@${node.attrs.id}`).replace(
            /^@/,
            ''
          );
          return /\s/.test(cleanName) ? `@[${cleanName}]` : `@${cleanName}`;
        }
        case 'emoji':
          return node.attrs.shortName || node.attrs.text || '🙂';
        case 'date': {
          const iso =
            formatEpochIsoDate(node.attrs.timestamp) ?? node.attrs.timestamp;
          return `[DATE: ${iso}]`;
        }
        case 'inlineCard':
          return `[${node.attrs.url}](card)`;
      }
    })
    .join('');
}

function serializeBlocksToMarkdown(
  blocks: AdfBlockNode[],
  indent = ''
): string {
  const parts: string[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case 'paragraph':
        parts.push(`${indent}${serializeInlineAdfToMarkdown(block.content)}`);
        break;
      case 'heading': {
        const hashes = '#'.repeat(block.attrs.level);
        parts.push(
          `${indent}${hashes} ${serializeInlineAdfToMarkdown(block.content)}`
        );
        break;
      }
      case 'bulletList': {
        const lines: string[] = [];
        for (const item of block.content) {
          for (const child of item.content) {
            if (child.type === 'paragraph') {
              lines.push(
                `${indent}- ${serializeInlineAdfToMarkdown(child.content)}`
              );
            } else if (
              child.type === 'bulletList' ||
              child.type === 'orderedList'
            ) {
              lines.push(serializeBlocksToMarkdown([child], `${indent}  `));
            } else if (child.type === 'codeBlock') {
              lines.push(serializeBlocksToMarkdown([child], `${indent}  `));
            }
          }
        }
        parts.push(lines.join('\n'));
        break;
      }
      case 'orderedList': {
        const start = block.attrs?.order ?? 1;
        const lines: string[] = [];
        block.content.forEach((item, idx) => {
          item.content.forEach((child, cIdx) => {
            if (child.type === 'paragraph' && cIdx === 0) {
              lines.push(
                `${indent}${start + idx}. ${serializeInlineAdfToMarkdown(
                  child.content
                )}`
              );
            } else if (child.type === 'paragraph') {
              lines.push(
                `${indent}   ${serializeInlineAdfToMarkdown(child.content)}`
              );
            } else {
              lines.push(serializeBlocksToMarkdown([child], `${indent}   `));
            }
          });
        });
        parts.push(lines.join('\n'));
        break;
      }
      case 'taskList': {
        const lines: string[] = [];
        for (const item of block.content) {
          if (item.type === 'taskItem') {
            const box = item.attrs.state === 'DONE' ? '[x]' : '[ ]';
            lines.push(
              `${indent}- ${box} ${serializeInlineAdfToMarkdown(item.content)}`
            );
          } else if (item.type === 'taskList') {
            lines.push(serializeBlocksToMarkdown([item], `${indent}  `));
          }
        }
        parts.push(lines.join('\n'));
        break;
      }
      case 'decisionList': {
        const lines = block.content.map(
          (item) => `${indent}<> ${serializeInlineAdfToMarkdown(item.content)}`
        );
        parts.push(lines.join('\n'));
        break;
      }
      case 'panel': {
        const tag =
          block.attrs.panelType === 'note'
            ? 'NOTE'
            : block.attrs.panelType === 'success'
            ? 'SUCCESS'
            : block.attrs.panelType === 'warning'
            ? 'WARNING'
            : block.attrs.panelType === 'error'
            ? 'ERROR'
            : 'INFO';
        const innerMd = serializeBlocksToMarkdown(block.content);
        const quotedLines = innerMd
          .split('\n')
          .map((l) => `> ${l}`)
          .join('\n');
        parts.push(`> [!${tag}]\n${quotedLines}`);
        break;
      }
      case 'blockquote': {
        const innerMd = serializeBlocksToMarkdown(block.content);
        parts.push(
          innerMd
            .split('\n')
            .map((l) => `> ${l}`)
            .join('\n')
        );
        break;
      }
      case 'codeBlock': {
        const lang = block.attrs?.language || '';
        const code = (block.content || []).map((t) => t.text).join('');
        parts.push(`\`\`\`${lang}\n${code}\n\`\`\``);
        break;
      }
      case 'rule':
        parts.push('---');
        break;
      case 'expand':
      case 'nestedExpand': {
        const title = block.attrs?.title || 'Details';
        const innerMd = serializeBlocksToMarkdown(block.content);
        parts.push(
          `<details>\n<summary>${title}</summary>\n\n${innerMd}\n</details>`
        );
        break;
      }
      case 'table': {
        if (block.content.length === 0) break;
        const rowsMd = block.content.map((row) =>
          row.content.map((cell) =>
            cell.content
              .map((b) =>
                b.type === 'paragraph' || b.type === 'heading'
                  ? serializeInlineAdfToMarkdown(b.content)
                  : serializeBlocksToMarkdown([b])
              )
              .join(' ')
              .replace(/\n+/g, ' ')
              .replace(/\|/g, '\\|')
          )
        );
        const colCount = Math.max(1, rowsMd[0]?.length || 1);
        const headerLine = `| ${rowsMd[0].join(' | ')} |`;
        const sepLine = `| ${Array(colCount).fill('---').join(' | ')} |`;
        const bodyLines = rowsMd
          .slice(1)
          .map((r) => `| ${r.join(' | ')} |`);
        parts.push([headerLine, sepLine, ...bodyLines].join('\n'));
        break;
      }
      case 'layoutSection': {
        const colParts = block.content.map((col) =>
          serializeBlocksToMarkdown(col.content)
        );
        parts.push(colParts.join('\n\n'));
        break;
      }
      case 'mediaSingle': {
        const m = block.content[0];
        if (m?.attrs.url) {
          parts.push(`![${m.attrs.alt || 'Image'}](${m.attrs.url})`);
        }
        break;
      }
      case 'blockCard':
        parts.push(`[${block.attrs.url}](${block.attrs.url})`);
        break;
    }
  }

  return parts.join('\n\n');
}

export function adfToMarkdown(doc?: AdfDocNode | null): string {
  if (!doc || !Array.isArray(doc.content)) return '';
  return serializeBlocksToMarkdown(doc.content).trim();
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderInlineAdfToHtml(nodes?: AdfInlineNode[]): string {
  if (!nodes || nodes.length === 0) return '';
  return nodes
    .map((node) => {
      switch (node.type) {
        case 'text': {
          let html = escapeHtml(node.text);
          for (const m of node.marks || []) {
            switch (m.type) {
              case 'code':
                html = `<code>${html}</code>`;
                break;
              case 'strong':
                html = `<strong>${html}</strong>`;
                break;
              case 'em':
                html = `<em>${html}</em>`;
                break;
              case 'underline':
                html = `<u>${html}</u>`;
                break;
              case 'strike':
                html = `<del>${html}</del>`;
                break;
              case 'subsup':
                html =
                  m.attrs.type === 'sub'
                    ? `<sub>${html}</sub>`
                    : `<sup>${html}</sup>`;
                break;
              case 'textColor': {
                const safeHex = sanitizeHexColor(m.attrs.color);
                if (safeHex) {
                  html = `<span data-text-custom-color="${safeHex}" style="color: ${safeHex}">${html}</span>`;
                }
                break;
              }
              case 'backgroundColor': {
                const safeBg = sanitizeHexColor(m.attrs.color);
                if (safeBg) {
                  html = `<span data-background-custom-color="${safeBg}" style="background-color: ${safeBg}">${html}</span>`;
                }
                break;
              }
              case 'link':
                if (isSafeAdfUrl(m.attrs.href)) {
                  html = `<a href="${escapeHtml(m.attrs.href)}">${html}</a>`;
                }
                break;
            }
          }
          return html;
        }
        case 'hardBreak':
          return '<br />';
        case 'status':
          return `<span data-node-type="status" data-color="${escapeHtml(
            node.attrs.color
          )}">[${escapeHtml(node.attrs.text)}]</span>`;
        case 'mention':
          return `<span data-mention-id="${escapeHtml(
            node.attrs.id
          )}">${escapeHtml(node.attrs.text || `@${node.attrs.id}`)}</span>`;
        case 'emoji':
          return `<span data-emoji-short-name="${escapeHtml(
            node.attrs.shortName
          )}">${escapeHtml(
            node.attrs.text ||
              EMOJI_BY_SHORTNAME.get(node.attrs.shortName) ||
              node.attrs.shortName
          )}</span>`;
        case 'date': {
          const formatted =
            formatEpochIsoDate(node.attrs.timestamp) ?? node.attrs.timestamp;
          return `<time data-node-type="date" data-timestamp="${escapeHtml(
            node.attrs.timestamp
          )}">${escapeHtml(formatted)}</time>`;
        }
        case 'inlineCard':
          return isSafeAdfUrl(node.attrs.url)
            ? `<a data-inline-card="true" href="${escapeHtml(
                node.attrs.url
              )}">${escapeHtml(node.attrs.url)}</a>`
            : escapeHtml(node.attrs.url);
      }
    })
    .join('');
}

function renderBlocksToJiraHtml(blocks: AdfBlockNode[]): string {
  return blocks
    .map((block) => {
      switch (block.type) {
        case 'paragraph': {
          const align = block.marks?.find((m) => m.type === 'alignment');
          const styleAttr =
            align && align.type === 'alignment'
              ? ` style="text-align: ${
                  align.attrs.align === 'end' ? 'right' : 'center'
                }"`
              : '';
          return `<p${styleAttr}>${renderInlineAdfToHtml(block.content)}</p>`;
        }
        case 'heading': {
          const safeLevel = Math.min(
            6,
            Math.max(1, Math.trunc(Number(block.attrs?.level) || 2))
          );
          const tag = `h${safeLevel}`;
          return `<${tag}>${renderInlineAdfToHtml(block.content)}</${tag}>`;
        }
        case 'bulletList':
          return `<ul>${block.content
            .map((li) => `<li>${renderBlocksToJiraHtml(li.content)}</li>`)
            .join('')}</ul>`;
        case 'orderedList': {
          const safeOrder = Math.max(
            1,
            Math.trunc(Number(block.attrs?.order) || 1)
          );
          const startAttr = block.attrs?.order
            ? ` start="${safeOrder}"`
            : '';
          return `<ol${startAttr}>${block.content
            .map((li) => `<li>${renderBlocksToJiraHtml(li.content)}</li>`)
            .join('')}</ol>`;
        }
        case 'taskList':
          return `<ul data-node-type="actionList">${block.content
            .map((item) =>
              item.type === 'taskItem'
                ? `<li data-task-local-id="${escapeHtml(
                    item.attrs.localId
                  )}" data-task-state="${escapeHtml(
                    item.attrs.state
                  )}"><input type="checkbox" ${
                    item.attrs.state === 'DONE' ? 'checked' : ''
                  } /> ${renderInlineAdfToHtml(item.content)}</li>`
                : renderBlocksToJiraHtml([item])
            )
            .join('')}</ul>`;
        case 'decisionList':
          return `<ul data-node-type="decisionList">${block.content
            .map(
              (item) =>
                `<li data-decision-local-id="${escapeHtml(
                  item.attrs.localId
                )}" data-decision-state="${escapeHtml(
                  item.attrs.state
                )}">&lt;&gt; ${renderInlineAdfToHtml(item.content)}</li>`
            )
            .join('')}</ul>`;
        case 'panel':
          return `<div data-panel-type="${escapeHtml(
            block.attrs.panelType
          )}">${renderBlocksToJiraHtml(block.content)}</div>`;
        case 'blockquote':
          return `<blockquote>${renderBlocksToJiraHtml(
            block.content
          )}</blockquote>`;
        case 'codeBlock': {
          const langClass = block.attrs?.language
            ? ` class="language-${escapeHtml(block.attrs.language)}"`
            : '';
          const rawCode = (block.content || []).map((t) => t.text).join('');
          return `<pre><code${langClass}>${escapeHtml(rawCode)}</code></pre>`;
        }
        case 'rule':
          return '<hr />';
        case 'expand':
        case 'nestedExpand':
          return `<div data-node-type="${block.type}" data-title="${escapeHtml(
            block.attrs?.title || ''
          )}"><p><strong>${escapeHtml(
            block.attrs?.title || 'Details'
          )}</strong></p>${renderBlocksToJiraHtml(block.content)}</div>`;
        case 'table':
          return `<table data-number-column="${Boolean(
            block.attrs?.isNumberColumnEnabled
          )}"><tbody>${block.content
            .map(
              (row) =>
                `<tr>${row.content
                  .map((cell) => {
                    const tag = cell.type === 'tableHeader' ? 'th' : 'td';
                    const bg = sanitizeHexColor(cell.attrs?.background);
                    const bgAttr = bg
                      ? ` data-cell-background="${bg}" style="background-color: ${bg}"`
                      : '';
                    return `<${tag}${bgAttr}>${renderBlocksToJiraHtml(
                      cell.content
                    )}</${tag}>`;
                  })
                  .join('')}</tr>`
            )
            .join('')}</tbody></table>`;
        case 'layoutSection':
          return `<div data-layout-section="true">${block.content
            .map(
              (col) =>
                `<div data-layout-column="true" data-column-width="${
                  Number.isFinite(Number(col.attrs?.width))
                    ? Number(col.attrs.width)
                    : 50
                }">${renderBlocksToJiraHtml(col.content)}</div>`
            )
            .join('')}</div>`;
        case 'mediaSingle': {
          const m = block.content[0];
          return m?.attrs.url && isSafeAdfUrl(m.attrs.url)
            ? `<p><img src="${escapeHtml(m.attrs.url)}" alt="${escapeHtml(
                m.attrs.alt || 'Image'
              )}" /></p>`
            : '';
        }
        case 'blockCard':
          return isSafeAdfUrl(block.attrs.url)
            ? `<p><a data-block-card="true" href="${escapeHtml(
                block.attrs.url
              )}">${escapeHtml(block.attrs.url)}</a></p>`
            : '';
      }
    })
    .join('');
}

/**
 * Serializes canonical ADF v1 JSON into semantic ProseMirror/Jira-compatible HTML
 * so pasting directly into Jira Cloud's browser Description Editor reconstructs
 * native Jira blocks, marks, panels, tables, action lists, and lozenges.
 */
export function adfToJiraHtml(doc: AdfDocNode): string {
  return renderBlocksToJiraHtml(doc.content);
}

export function countAdfTasks(doc?: AdfDocNode | null): {
  total: number;
  completed: number;
} {
  if (!doc || !Array.isArray(doc.content)) return { total: 0, completed: 0 };
  let total = 0;
  let completed = 0;

  const visitBlocks = (blocks: AdfBlockNode[]) => {
    for (const b of blocks) {
      if (b.type === 'taskList') {
        for (const item of b.content) {
          if (item.type === 'taskItem') {
            total += 1;
            if (item.attrs.state === 'DONE') completed += 1;
          } else if (item.type === 'taskList') {
            visitBlocks([item]);
          }
        }
      } else if (
        b.type === 'panel' ||
        b.type === 'blockquote' ||
        b.type === 'expand' ||
        b.type === 'nestedExpand'
      ) {
        visitBlocks(b.content);
      } else if (b.type === 'table') {
        for (const r of b.content) {
          for (const c of r.content) {
            visitBlocks(c.content);
          }
        }
      } else if (b.type === 'layoutSection') {
        for (const col of b.content) {
          visitBlocks(col.content);
        }
      }
    }
  };

  visitBlocks(doc.content);
  return { total, completed };
}

export function appendTextToAdfDoc(
  doc: AdfDocNode,
  snippet: string,
  options?: { padSpace?: boolean }
): AdfDocNode {
  if (!snippet) return doc;
  const blocks = [...doc.content];
  if (blocks.length === 0) {
    return {
      version: 1,
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: snippet }],
        },
      ],
    };
  }

  const lastIdx = blocks.length - 1;
  const lastBlock = blocks[lastIdx];
  if (lastBlock.type === 'paragraph' || lastBlock.type === 'heading') {
    const existing = normalizeInlineNodes(lastBlock.content);
    const prevLast = existing[existing.length - 1];
    const needsSpace =
      options?.padSpace &&
      prevLast &&
      prevLast.type === 'text' &&
      !prevLast.text.endsWith(' ') &&
      !snippet.startsWith(' ');
    const textToAdd = `${needsSpace ? ' ' : ''}${snippet}`;
    blocks[lastIdx] = {
      ...lastBlock,
      content: normalizeInlineNodes([
        ...existing,
        { type: 'text', text: textToAdd },
      ]),
    };
    return { version: 1, type: 'doc', content: blocks };
  }

  blocks.push({
    type: 'paragraph',
    content: [{ type: 'text', text: snippet }],
  });
  return { version: 1, type: 'doc', content: blocks };
}
