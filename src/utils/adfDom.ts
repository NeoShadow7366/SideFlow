import {
  AdfInlineNode,
  AdfMark,
  AdfStatusColor,
} from '../types/sideflow';
import {
  isLightHexColor,
  isSafeAdfUrl,
  isValidEpochMs,
  JIRA_STATUS_COLORS,
  normalizeAdfMarks,
  normalizeInlineNodes,
  sanitizeHexColor,
} from './adf';

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateChipLabel(timestampStr: string): string {
  const num = Number(timestampStr);
  if (!isValidEpochMs(num)) return timestampStr;
  try {
    return new Date(num).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return timestampStr;
  }
}

function formatSmartCardLabel(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    const pathPart =
      parsed.pathname && parsed.pathname !== '/'
        ? parsed.pathname.slice(0, 28) + (parsed.pathname.length > 28 ? '…' : '')
        : '';
    return `${parsed.hostname.replace(/^www\./, '')}${pathPart}`;
  } catch {
    return rawUrl.slice(0, 36);
  }
}

/**
 * Renders canonical `AdfInlineNode[]` into rich HTML for a single block's
 * `contentEditable` surface, including interactive `contenteditable="false"`
 * Jira inline pills (`status`, `mention`, `date`, `emoji`, `inlineCard`).
 */
export function adfInlineToEditorHtml(nodes?: AdfInlineNode[]): string {
  if (!nodes || nodes.length === 0) return '';

  return nodes
    .map((node, index) => {
      switch (node.type) {
        case 'text': {
          let html = escapeHtml(node.text);
          const marks = node.marks || [];
          for (const m of marks) {
            switch (m.type) {
              case 'code':
                html = `<code data-adf-mark="code" class="px-1.5 py-0.5 rounded bg-slate-800/95 border border-slate-700 text-amber-300 font-mono text-[0.88em]">${html}</code>`;
                break;
              case 'strong':
                html = `<strong data-adf-mark="strong" class="font-bold text-white">${html}</strong>`;
                break;
              case 'em':
                html = `<em data-adf-mark="em" class="italic text-indigo-100">${html}</em>`;
                break;
              case 'underline':
                html = `<u data-adf-mark="underline" class="underline decoration-indigo-300/80 underline-offset-2">${html}</u>`;
                break;
              case 'strike':
                html = `<del data-adf-mark="strike" class="line-through text-slate-400">${html}</del>`;
                break;
              case 'subsup':
                html =
                  m.attrs.type === 'sub'
                    ? `<sub data-adf-mark="sub" class="text-[0.75em]">${html}</sub>`
                    : `<sup data-adf-mark="sup" class="text-[0.75em]">${html}</sup>`;
                break;
              case 'textColor': {
                const safeHex = sanitizeHexColor(m.attrs.color);
                if (safeHex) {
                  html = `<span data-adf-text-color="${safeHex}" style="color: ${safeHex}">${html}</span>`;
                }
                break;
              }
              case 'backgroundColor': {
                const safeBg = sanitizeHexColor(m.attrs.color);
                if (safeBg) {
                  const hasExplicitTextColor = marks.some(
                    (mk) => mk.type === 'textColor'
                  );
                  const contrastFg =
                    !hasExplicitTextColor && isLightHexColor(safeBg)
                      ? '; color: #0f172a'
                      : '';
                  html = `<span data-adf-bg-color="${safeBg}" style="background-color: ${safeBg}${contrastFg}; border-radius: 3px; padding: 0 3px">${html}</span>`;
                }
                break;
              }
              case 'link':
                if (isSafeAdfUrl(m.attrs.href)) {
                  html = `<a data-adf-link="${escapeHtml(
                    m.attrs.href
                  )}" href="${escapeHtml(
                    m.attrs.href
                  )}" target="_blank" rel="noopener noreferrer" class="text-sky-400 underline decoration-sky-400/60 hover:text-sky-300 cursor-pointer">${html}</a>`;
                }
                break;
            }
          }
          return html;
        }

        case 'hardBreak':
          return '<br data-adf-hard-break="true" />';

        case 'status': {
          const palette =
            JIRA_STATUS_COLORS.find((c) => c.id === node.attrs.color) ||
            JIRA_STATUS_COLORS[0];
          return `<span contenteditable="false" role="button" tabindex="0" aria-label="Status: ${escapeHtml(
            node.attrs.text
          )} (${escapeHtml(
            node.attrs.color
          )})" data-testid="adf-status-lozenge" data-adf-inline-index="${index}" data-adf-inline-type="status" data-status-text="${escapeHtml(
            node.attrs.text
          )}" data-status-color="${escapeHtml(
            node.attrs.color
          )}" data-status-id="${escapeHtml(
            node.attrs.localId || ''
          )}" class="inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded border text-[10px] font-bold uppercase tracking-wider leading-none cursor-pointer select-none align-baseline hover:brightness-125 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 transition ${
            palette.pillClass
          }">${escapeHtml(node.attrs.text)}</span>`;
        }

        case 'mention': {
          const display = node.attrs.text || `@${node.attrs.id}`;
          return `<span contenteditable="false" role="button" tabindex="0" aria-label="Mention ${escapeHtml(
            display
          )}" data-testid="adf-mention-pill" data-adf-inline-index="${index}" data-adf-inline-type="mention" data-mention-id="${escapeHtml(
            node.attrs.id
          )}" data-mention-text="${escapeHtml(
            display
          )}" class="inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded-full bg-indigo-500/25 text-indigo-200 border border-indigo-400/40 text-[11px] font-medium leading-none cursor-pointer select-none align-baseline hover:bg-indigo-500/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 transition">${escapeHtml(
            display
          )}</span>`;
        }

        case 'date': {
          const label = formatDateChipLabel(node.attrs.timestamp);
          return `<span contenteditable="false" role="button" tabindex="0" aria-label="Date: ${escapeHtml(
            label
          )}" data-testid="adf-date-chip" data-adf-inline-index="${index}" data-adf-inline-type="date" data-date-timestamp="${escapeHtml(
            node.attrs.timestamp
          )}" class="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded bg-slate-800/95 text-sky-200 border border-slate-700 text-[11px] font-medium leading-none cursor-pointer select-none align-baseline hover:border-sky-500/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 transition">📅 ${escapeHtml(
            label
          )}</span>`;
        }

        case 'emoji': {
          const glyph = node.attrs.text || '🙂';
          return `<span contenteditable="false" data-testid="adf-emoji-node" data-adf-inline-index="${index}" data-adf-inline-type="emoji" data-emoji-shortname="${escapeHtml(
            node.attrs.shortName
          )}" data-emoji-text="${escapeHtml(
            glyph
          )}" class="inline-block mx-0.5 select-none">${escapeHtml(
            glyph
          )}</span>`;
        }

        case 'inlineCard': {
          const label = formatSmartCardLabel(node.attrs.url);
          return `<span contenteditable="false" role="button" tabindex="0" aria-label="Smart link: ${escapeHtml(
            label
          )}" data-testid="adf-inline-card" data-adf-inline-index="${index}" data-adf-inline-type="inlineCard" data-card-url="${escapeHtml(
            node.attrs.url
          )}" class="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded-md bg-slate-900 text-sky-300 border border-sky-500/40 text-[11px] font-medium leading-none cursor-pointer select-none align-baseline hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 transition">🔗 ${escapeHtml(
            label
          )}</span>`;
        }
      }
    })
    .join('');
}

/**
 * Walks a block `contentEditable` container's DOM tree and converts all text,
 * mark tags, and atomic inline chips back into canonical `AdfInlineNode[]`.
 */
export function parseEditorDomToAdfInline(
  container: HTMLElement
): AdfInlineNode[] {
  const collected: AdfInlineNode[] = [];
  const childNodes = Array.from(container.childNodes);

  // Ignore single browser-inserted placeholder <br> when container has no other content
  if (
    childNodes.length === 1 &&
    childNodes[0].nodeType === Node.ELEMENT_NODE &&
    (childNodes[0] as HTMLElement).tagName === 'BR' &&
    !(childNodes[0] as HTMLElement).hasAttribute('data-adf-hard-break')
  ) {
    return [];
  }

  const walk = (node: ChildNode, marks: AdfMark[]) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent || '').replace(/\u200B/g, '');
      if (text.length > 0) {
        collected.push({
          type: 'text',
          text,
          marks: normalizeAdfMarks(marks),
        });
      }
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const inlineType = el.getAttribute('data-adf-inline-type');

    if (inlineType === 'status') {
      collected.push({
        type: 'status',
        attrs: {
          text: el.getAttribute('data-status-text') || 'STATUS',
          color:
            (el.getAttribute('data-status-color') as AdfStatusColor) ||
            'neutral',
          localId: el.getAttribute('data-status-id') || undefined,
        },
      });
      return;
    }

    if (inlineType === 'mention') {
      collected.push({
        type: 'mention',
        attrs: {
          id: el.getAttribute('data-mention-id') || 'user',
          text: el.getAttribute('data-mention-text') || '@user',
        },
      });
      return;
    }

    if (inlineType === 'date') {
      collected.push({
        type: 'date',
        attrs: {
          timestamp:
            el.getAttribute('data-date-timestamp') || String(Date.now()),
        },
      });
      return;
    }

    if (inlineType === 'emoji') {
      collected.push({
        type: 'emoji',
        attrs: {
          shortName: el.getAttribute('data-emoji-shortname') || ':smile:',
          text: el.getAttribute('data-emoji-text') || el.textContent || '🙂',
        },
      });
      return;
    }

    if (inlineType === 'inlineCard') {
      const url = el.getAttribute('data-card-url') || '';
      if (isSafeAdfUrl(url)) {
        collected.push({
          type: 'inlineCard',
          attrs: { url },
        });
      }
      return;
    }

    const tag = el.tagName.toUpperCase();
    if (
      tag === 'SCRIPT' ||
      tag === 'STYLE' ||
      tag === 'NOSCRIPT' ||
      tag === 'TEMPLATE' ||
      tag === 'IFRAME' ||
      tag === 'OBJECT'
    ) {
      return;
    }
    if (tag === 'BR') {
      collected.push({ type: 'hardBreak' });
      return;
    }

    const isBlockWrapper =
      tag === 'DIV' ||
      tag === 'P' ||
      tag === 'LI' ||
      tag === 'BLOCKQUOTE' ||
      tag === 'PRE' ||
      /^H[1-6]$/.test(tag);
    if (
      isBlockWrapper &&
      collected.length > 0 &&
      collected[collected.length - 1].type !== 'hardBreak'
    ) {
      collected.push({ type: 'hardBreak' });
    }

    const nextMarks: AdfMark[] = [...marks];
    if (tag === 'STRONG' || tag === 'B') {
      nextMarks.push({ type: 'strong' });
    } else if (tag === 'EM' || tag === 'I') {
      nextMarks.push({ type: 'em' });
    } else if (tag === 'U') {
      nextMarks.push({ type: 'underline' });
    } else if (tag === 'DEL' || tag === 'S' || tag === 'STRIKE') {
      nextMarks.push({ type: 'strike' });
    } else if (tag === 'CODE') {
      nextMarks.push({ type: 'code' });
    } else if (tag === 'SUB') {
      nextMarks.push({ type: 'subsup', attrs: { type: 'sub' } });
    } else if (tag === 'SUP') {
      nextMarks.push({ type: 'subsup', attrs: { type: 'sup' } });
    } else if (tag === 'A') {
      const href = el.getAttribute('data-adf-link') || el.getAttribute('href');
      if (href && isSafeAdfUrl(href)) {
        nextMarks.push({ type: 'link', attrs: { href } });
      }
    }

    const textColor = el.getAttribute('data-adf-text-color');
    if (textColor && sanitizeHexColor(textColor)) {
      nextMarks.push({ type: 'textColor', attrs: { color: textColor } });
    }

    const bgColor = el.getAttribute('data-adf-bg-color');
    if (bgColor && sanitizeHexColor(bgColor)) {
      nextMarks.push({ type: 'backgroundColor', attrs: { color: bgColor } });
    }

    for (const child of Array.from(el.childNodes)) {
      walk(child, nextMarks);
    }
  };

  for (const child of childNodes) {
    walk(child, []);
  }

  return normalizeInlineNodes(collected);
}

/**
 * Safely parses clipboard `text/html` (via an inert detached `DOMParser`) or
 * `text/plain` into sanitized `AdfInlineNode[]` without injecting foreign DOM
 * into the live editor surface.
 */
export function parseClipboardToAdfInline(
  htmlData: string,
  plainText: string
): AdfInlineNode[] {
  if (htmlData && htmlData.trim() && typeof DOMParser !== 'undefined') {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlData, 'text/html');
      if (doc && doc.body) {
        const parsed = parseEditorDomToAdfInline(doc.body);
        if (parsed.length > 0) {
          return parsed;
        }
      }
    } catch {
      // Fall back to plainText below
    }
  }
  if (!plainText) return [];
  const lines = plainText.replace(/\r\n/g, '\n').split('\n');
  const out: AdfInlineNode[] = [];
  lines.forEach((line, idx) => {
    if (idx > 0) {
      out.push({ type: 'hardBreak' });
    }
    if (line.length > 0) {
      out.push({ type: 'text', text: line });
    }
  });
  return normalizeInlineNodes(out);
}

function getSubtreeInlineLength(node: Node): number {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent || '').replace(/\u200B/g, '').length;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return 0;
  const el = node as HTMLElement;
  if (el.hasAttribute('data-adf-inline-type')) return 1;
  if (el.tagName === 'BR') {
    return el.hasAttribute('data-adf-hard-break') ? 1 : 0;
  }
  let sum = 0;
  for (const ch of Array.from(el.childNodes)) {
    sum += getSubtreeInlineLength(ch);
  }
  return sum;
}

function resolveBoundaryOffset(
  root: HTMLElement,
  targetContainer: Node,
  targetOffset: number
): number {
  let offset = 0;
  let found = false;

  const walk = (current: Node) => {
    if (found) return;
    if (current === targetContainer) {
      if (current.nodeType === Node.TEXT_NODE) {
        const slice = (current.textContent || '')
          .slice(0, targetOffset)
          .replace(/\u200B/g, '');
        offset += slice.length;
      } else {
        const children = Array.from(current.childNodes);
        for (let i = 0; i < Math.min(targetOffset, children.length); i++) {
          offset += getSubtreeInlineLength(children[i]);
        }
      }
      found = true;
      return;
    }

    if (current.nodeType === Node.TEXT_NODE) {
      offset += (current.textContent || '').replace(/\u200B/g, '').length;
      return;
    }

    if (current.nodeType === Node.ELEMENT_NODE) {
      const el = current as HTMLElement;
      if (el.hasAttribute('data-adf-inline-type')) {
        if (el.contains(targetContainer)) {
          found = true;
          return;
        }
        offset += 1;
        return;
      }
      if (el.tagName === 'BR') {
        if (el.hasAttribute('data-adf-hard-break')) offset += 1;
        return;
      }
      for (const ch of Array.from(el.childNodes)) {
        walk(ch);
        if (found) return;
      }
    }
  };

  walk(root);
  return offset;
}

export function getInlineSelectionOffsets(
  container: HTMLElement
): { start: number; end: number } | null {
  if (typeof window === 'undefined' || !window.getSelection) return null;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (
    !container.contains(range.startContainer) ||
    !container.contains(range.endContainer)
  ) {
    return null;
  }
  const start = resolveBoundaryOffset(
    container,
    range.startContainer,
    range.startOffset
  );
  const end = resolveBoundaryOffset(
    container,
    range.endContainer,
    range.endOffset
  );
  return {
    start: Math.min(start, end),
    end: Math.max(start, end),
  };
}

function locateDomBoundaryAtOffset(
  root: HTMLElement,
  targetOffset: number
): { node: Node; offset: number } {
  let remaining = Math.max(0, targetOffset);

  const search = (current: Node): { node: Node; offset: number } | null => {
    if (current.nodeType === Node.TEXT_NODE) {
      const rawText = current.textContent || '';
      const cleanLen = rawText.replace(/\u200B/g, '').length;
      if (remaining <= cleanLen) {
        let visibleSeen = 0;
        let rawOffset = 0;
        while (rawOffset < rawText.length && visibleSeen < remaining) {
          if (rawText[rawOffset] !== '\u200B') {
            visibleSeen += 1;
          }
          rawOffset += 1;
        }
        return { node: current, offset: rawOffset };
      }
      remaining -= cleanLen;
      return null;
    }

    if (current.nodeType !== Node.ELEMENT_NODE) return null;
    const el = current as HTMLElement;

    if (
      el.hasAttribute('data-adf-inline-type') ||
      (el.tagName === 'BR' && el.hasAttribute('data-adf-hard-break'))
    ) {
      const parent = el.parentNode || root;
      const idx = Array.from(parent.childNodes).indexOf(el);
      if (remaining === 0) {
        return { node: parent, offset: idx };
      }
      remaining -= 1;
      if (remaining === 0) {
        return { node: parent, offset: idx + 1 };
      }
      return null;
    }

    for (const child of Array.from(el.childNodes)) {
      const hit = search(child);
      if (hit) return hit;
    }
    return null;
  };

  const match = search(root);
  if (match) return match;
  return { node: root, offset: root.childNodes.length };
}

export function setInlineSelectionOffsets(
  container: HTMLElement,
  start: number,
  end: number = start
): void {
  if (typeof window === 'undefined' || !window.getSelection) return;
  try {
    const sel = window.getSelection();
    if (!sel) return;
    const startPos = locateDomBoundaryAtOffset(container, start);
    const endPos =
      end === start ? startPos : locateDomBoundaryAtOffset(container, end);
    const range = document.createRange();
    range.setStart(startPos.node, startPos.offset);
    range.setEnd(endPos.node, endPos.offset);
    sel.removeAllRanges();
    sel.addRange(range);
  } catch {
    // Graceful no-op in non-DOM/test environments
  }
}
