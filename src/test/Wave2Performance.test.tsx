import React, { forwardRef, useImperativeHandle } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { lazyModule, lazyWithPreload } from '../utils/lazyWithPreload';
import {
  damerauLevenshtein,
  findMisspellingsInAdfDoc,
  findMisspellingsInText,
  isWordSpelledCorrectly,
} from '../utils/spellcheck';
import { FlowCanvas } from '../components/Flowchart/FlowCanvas';
import { JiraAdfEditor } from '../components/Notes/JiraAdfEditor';
import { defaultFlowData } from '../utils/defaults';
import type { AdfDocNode, FlowchartState } from '../types/sideflow';

describe('Wave 2: Hot-Path Performance & Lazy Splitting Suite', () => {
  describe('1. lazyWithPreload & lazyModule Code-Splitting Helpers', () => {
    it('renders Suspense fallback before preload, preserves Fiber mount identity across re-renders, and mounts synchronously after preload()', async () => {
      let mountCount = 0;
      let unmountCount = 0;
      let resolveChunk!: (mod: { default: React.FC<{ label: string }> }) => void;
      const chunkPromise = new Promise<{ default: React.FC<{ label: string }> }>(
        (resolve) => {
          resolveChunk = resolve;
        }
      );

      const DeferredWidget = lazyWithPreload(
        () => chunkPromise,
        <div data-testid="lazy-fallback">Loading chunk...</div>
      );

      const { rerender, unmount } = render(
        <DeferredWidget label="First Mount" />
      );
      expect(screen.getByTestId('lazy-fallback')).toBeInTheDocument();

      await act(async () => {
        resolveChunk({
          default: ({ label }) => {
            React.useEffect(() => {
              mountCount += 1;
              return () => {
                unmountCount += 1;
              };
            }, []);
            return <div data-testid="lazy-ready">{label}</div>;
          },
        });
        await DeferredWidget.preload();
      });

      expect(screen.getByTestId('lazy-ready')).toHaveTextContent('First Mount');
      expect(mountCount).toBe(1);
      expect(unmountCount).toBe(0);

      // Re-rendering after preload settles must NOT switch Fiber child types or remount subtree
      rerender(<DeferredWidget label="Updated Without Remount" />);
      expect(screen.getByTestId('lazy-ready')).toHaveTextContent(
        'Updated Without Remount'
      );
      expect(mountCount).toBe(1);
      expect(unmountCount).toBe(0);

      unmount();
      expect(unmountCount).toBe(1);

      // Subsequent mount must bypass Suspense microtask and render synchronously on initial frame
      render(<DeferredWidget label="Sync Second Mount" />);
      expect(screen.queryByTestId('lazy-fallback')).not.toBeInTheDocument();
      expect(screen.getByTestId('lazy-ready')).toHaveTextContent(
        'Sync Second Mount'
      );
      expect(mountCount).toBe(2);
    });

    it('forwards imperative refs through lazyWithPreload and exposes lazyModule.current after load()', async () => {
      interface DemoHandle {
        ping: () => string;
      }
      const InnerForward = forwardRef<DemoHandle, { prefix: string }>(
        function InnerForward({ prefix }, ref) {
          useImperativeHandle(ref, () => ({
            ping: () => `${prefix}:pong`,
          }));
          return <span data-testid="forward-ref-node">{prefix}</span>;
        }
      );

      const LazyForward = lazyWithPreload(() =>
        Promise.resolve({ default: InnerForward })
      );
      await LazyForward.preload();

      const handleRef = React.createRef<DemoHandle>();
      render(<LazyForward ref={handleRef} prefix="editor" />);
      expect(screen.getByTestId('forward-ref-node')).toHaveTextContent('editor');
      expect(handleRef.current?.ping()).toBe('editor:pong');

      const helperMod = lazyModule(() => Promise.resolve({ answer: 42 }));
      expect(helperMod.current).toBeNull();
      const loaded = await helperMod.load();
      expect(loaded.answer).toBe(42);
      expect(helperMod.current?.answer).toBe(42);
    });
  });

  describe('2. Zero-Allocation Int32Array Damerau-Levenshtein & Deferred Suggestions', () => {
    it('computes exact Damerau-Levenshtein distances including transpositions, buffer growth (>128 chars), and rowMin cutoff', () => {
      expect(damerauLevenshtein('', '')).toBe(0);
      expect(damerauLevenshtein('teh', 'the')).toBe(1);
      expect(damerauLevenshtein('recieve', 'receive')).toBe(1);
      expect(damerauLevenshtein('architecture', 'architeture')).toBe(1);
      expect(damerauLevenshtein('sideflow', 'sideflow')).toBe(0);
      expect(damerauLevenshtein('kitten', 'sitting', 5)).toBe(3);
      // Early cutoff returns > maxDist (2)
      expect(damerauLevenshtein('abcdefg', 'zyxwvut', 2)).toBeGreaterThan(2);

      // Long strings > 128 chars exercise automatic Int32Array buffer expansion
      const longA = 'a'.repeat(160) + 'bc';
      const longB = 'a'.repeat(160) + 'cb';
      expect(damerauLevenshtein(longA, longB, 2)).toBe(1);
    });

    it('skips suggestion ranking when includeSuggestions is false and caches customDictionary/ignoredWords Sets', () => {
      const customWords = ['SideFlowCustomToken', ' KubernetesMesh '];
      expect(isWordSpelledCorrectly('sideflowcustomtoken', customWords)).toBe(
        true
      );
      expect(isWordSpelledCorrectly('kubernetesmesh', customWords)).toBe(true);

      const sampleMd = 'Please teh recieve update quickly.';
      const fastScan = findMisspellingsInText(sampleMd, {
        isMarkdown: true,
        includeSuggestions: false,
      });
      expect(fastScan.map((m) => m.word)).toEqual(['teh', 'recieve']);
      expect(fastScan[0].suggestions).toEqual([]);
      expect(fastScan[1].suggestions).toEqual([]);

      const fullScan = findMisspellingsInText(sampleMd, {
        isMarkdown: true,
        includeSuggestions: true,
      });
      expect(fullScan[0].suggestions).toContain('the');
      expect(fullScan[1].suggestions).toContain('receive');

      const adfDoc: AdfDocNode = {
        version: 1,
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Check teh payload.' }],
          },
        ],
      };
      const fastAdf = findMisspellingsInAdfDoc(adfDoc, {
        includeSuggestions: false,
      });
      expect(fastAdf).toHaveLength(1);
      expect(fastAdf[0].suggestions).toEqual([]);
    });
  });

  describe('3. FlowCanvas Single-Commit Waypoint Drag (Preserving Undo Stack)', () => {
    it('coalesces 40 mousemove waypoint events without calling onChangeFlowData until mouseup and preserves prior undo history', () => {
      let latestFlow: FlowchartState = JSON.parse(
        JSON.stringify(defaultFlowData)
      );
      const handleFlowChange = vi.fn(
        (
          updater: FlowchartState | ((prev: FlowchartState) => FlowchartState)
        ) => {
          latestFlow =
            typeof updater === 'function' ? updater(latestFlow) : updater;
        }
      );

      const { rerender } = render(
        <FlowCanvas
          flowData={latestFlow}
          onChangeFlowData={handleFlowChange}
          onNotify={vi.fn()}
          panelWidthPercent={45}
        />
      );

      // Step 1: Add a Process node so Undo history has an earlier discrete user action
      fireEvent.click(screen.getByTitle('Add Process Box'));
      expect(handleFlowChange).toHaveBeenCalledTimes(1);
      const countAfterAddNode = latestFlow.nodes.length;
      rerender(
        <FlowCanvas
          flowData={latestFlow}
          onChangeFlowData={handleFlowChange}
          onNotify={vi.fn()}
          panelWidthPercent={45}
        />
      );

      // Step 2: Select edge 0 and click Add Bend Waypoint
      fireEvent.click(screen.getByTestId('edge-label-pill-0'));
      fireEvent.click(screen.getByTestId('edge-set-waypoint-btn'));
      expect(handleFlowChange).toHaveBeenCalledTimes(2);
      rerender(
        <FlowCanvas
          flowData={latestFlow}
          onChangeFlowData={handleFlowChange}
          onNotify={vi.fn()}
          panelWidthPercent={45}
        />
      );

      const initialWaypoint = { ...latestFlow.edges[0].waypoint! };
      handleFlowChange.mockClear();

      // Step 3: Drag waypoint handle across 40 mousemove events
      const handle = screen.getByTestId('edge-waypoint-handle-0');
      fireEvent.mouseDown(handle, { clientX: 120, clientY: 120 });
      for (let step = 1; step <= 40; step++) {
        fireEvent.mouseMove(window, {
          clientX: 120 + step * 5,
          clientY: 120 + step * 3,
        });
      }

      // Zero persistent commits during high-frequency pointer movement!
      expect(handleFlowChange).toHaveBeenCalledTimes(0);

      // Commit once on mouseUp
      fireEvent.mouseUp(window);
      expect(handleFlowChange).toHaveBeenCalledTimes(1);
      expect(latestFlow.edges[0].waypoint).not.toEqual(initialWaypoint);

      rerender(
        <FlowCanvas
          flowData={latestFlow}
          onChangeFlowData={handleFlowChange}
          onNotify={vi.fn()}
          panelWidthPercent={45}
        />
      );

      // Undo #1 reverts the entire 40-step waypoint drag in a single step
      const undoBtn = screen.getByRole('button', {
        name: /Undo Flowchart Edit/i,
      });
      fireEvent.click(undoBtn);
      expect(latestFlow.edges[0].waypoint).toEqual(initialWaypoint);

      rerender(
        <FlowCanvas
          flowData={latestFlow}
          onChangeFlowData={handleFlowChange}
          onNotify={vi.fn()}
          panelWidthPercent={45}
        />
      );

      // Undo #2 reverts 'Add Bend', Undo #3 reverts '+ Process' (proving undo history wasn't wiped out!)
      fireEvent.click(
        screen.getByRole('button', { name: /Undo Flowchart Edit/i })
      );
      expect(latestFlow.edges[0].waypoint).toBeUndefined();

      rerender(
        <FlowCanvas
          flowData={latestFlow}
          onChangeFlowData={handleFlowChange}
          onNotify={vi.fn()}
          panelWidthPercent={45}
        />
      );
      fireEvent.click(
        screen.getByRole('button', { name: /Undo Flowchart Edit/i })
      );
      expect(latestFlow.nodes.length).toBe(countAfterAddNode - 1);
    });
  });

  describe('4. JiraAdfEditor IME Composition Guard', () => {
    it('defers DOM/model sync during active IME composition and commits cleanly across compositionEnd + synchronous blur', () => {
      const initialDoc: AdfDocNode = {
        version: 1,
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Hello ' }],
          },
        ],
      };
      const onChangeDoc = vi.fn();

      const ControlledAdfHarness: React.FC = () => {
        const [doc, setDoc] = React.useState<AdfDocNode>(initialDoc);
        return (
          <JiraAdfEditor
            doc={doc}
            onChangeDoc={(next) => {
              onChangeDoc(next);
              setDoc(next);
            }}
            onNotify={vi.fn()}
          />
        );
      };

      render(<ControlledAdfHarness />);

      const block = screen.getByRole('textbox');
      fireEvent.compositionStart(block);
      block.textContent = 'Hello 東京';
      fireEvent.input(block);
      // Pressing Enter to confirm IME candidate during composition must NOT split the block
      fireEvent.keyDown(block, { key: 'Enter', isComposing: true });

      // Must NOT fire onChangeDoc or clobber innerHTML mid-IME composition
      expect(onChangeDoc).not.toHaveBeenCalled();

      // Dispatch compositionend + blur in the SAME synchronous turn before React re-renders
      act(() => {
        block.dispatchEvent(new Event('compositionend', { bubbles: true }));
        block.dispatchEvent(new FocusEvent('blur', { bubbles: false }));
        // Even before React flushes state, onBlur must NOT wipe committed text with stale renderedHtml
        expect(block.textContent).toContain('東京');
      });

      expect(onChangeDoc).toHaveBeenCalledTimes(1);
      expect(onChangeDoc.mock.calls[0][0].content).toHaveLength(1);
      expect(onChangeDoc.mock.calls[0][0].content[0].content[0].text).toContain(
        '東京'
      );
      expect(block.textContent).toContain('東京');
    });
  });
});
