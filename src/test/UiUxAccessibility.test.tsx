import React from 'react';
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
  act,
} from '@testing-library/react';
import App from '../App';

describe('SideFlow Phase 1-4 UI/UX & WCAG 2.2 AA Accessibility Suite', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete window.sideflow;
    document.body.removeAttribute('data-sideflow-modal-open');
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete window.sideflow;
    document.body.removeAttribute('data-sideflow-modal-open');
  });

  describe('1. Accessible <Modal> (dialog & alertdialog)', () => {
    it('moves focus inside LucidModal on open, wraps Tab/Shift+Tab at boundaries, closes ONLY the modal on Escape without clearing selected FlowCanvas nodes, and restores focus to the opener', async () => {
      render(<App />);

      // Switch to Flow tab and select node n1
      fireEvent.click(screen.getByRole('tab', { name: /^Flow$/i }));
      const node1 = screen.getByTestId('flow-node-n1');
      fireEvent.mouseDown(node1);
      fireEvent.mouseUp(window);
      expect(node1).toHaveAttribute('data-selected', 'true');

      // Focus and activate the Lucidchart Sync modal opener button
      const openerBtn = screen.getByRole('button', {
        name: /Lucidchart Sync/i,
      });
      openerBtn.focus();
      expect(document.activeElement).toBe(openerBtn);
      fireEvent.click(openerBtn);

      const dialog = screen.getByRole('dialog', {
        name: /Lucidchart Integration Hub/i,
      });
      expect(dialog).toBeInTheDocument();
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(document.body).toHaveAttribute('data-sideflow-modal-open', 'true');

      const closeModalBtn = within(dialog).getByRole('button', {
        name: /Close Lucidchart modal/i,
      });
      const openLucidBtn = within(dialog).getByRole('button', {
        name: /Open Lucidchart/i,
      });

      // Focus moves inside the modal on open (first focusable control)
      await waitFor(() => {
        expect(dialog).toContainElement(document.activeElement as HTMLElement);
      });
      expect(document.activeElement).toBe(closeModalBtn);

      // Shift+Tab on first focusable wraps to last focusable
      fireEvent.keyDown(closeModalBtn, { key: 'Tab', shiftKey: true });
      expect(document.activeElement).toBe(openLucidBtn);

      // Tab on last focusable wraps back to first focusable
      fireEvent.keyDown(openLucidBtn, { key: 'Tab', shiftKey: false });
      expect(document.activeElement).toBe(closeModalBtn);

      // Escape closes ONLY LucidModal while preserving FlowCanvas node selection and restoring focus
      fireEvent.keyDown(window, { key: 'Escape' });

      expect(
        screen.queryByRole('dialog', { name: /Lucidchart Integration Hub/i })
      ).not.toBeInTheDocument();
      expect(document.body).not.toHaveAttribute('data-sideflow-modal-open');
      expect(screen.getByTestId('flow-node-n1')).toHaveAttribute(
        'data-selected',
        'true'
      );
      expect(document.activeElement).toBe(openerBtn);
    });

    it('honors initialFocusRef, wraps Tab/Shift+Tab, and restores focus on alertdialog close', async () => {
      render(<App />);

      fireEvent.click(screen.getByRole('tab', { name: /^Config/i }));

      const resetTriggerBtn = screen.getByTestId('reset-defaults-trigger-btn');
      resetTriggerBtn.focus();
      expect(document.activeElement).toBe(resetTriggerBtn);
      fireEvent.click(resetTriggerBtn);

      const alertDialog = screen.getByTestId('confirm-reset-defaults-modal');
      expect(alertDialog).toHaveAttribute('role', 'alertdialog');
      expect(alertDialog).toHaveAttribute('aria-modal', 'true');

      const exportBtn = within(alertDialog).getByRole('button', {
        name: /Export Backup First/i,
      });
      const cancelBtn = within(alertDialog).getByRole('button', {
        name: /^Cancel$/i,
      });
      const confirmBtn = screen.getByTestId('confirm-reset-defaults-btn');

      // initialFocusRef targets Cancel button for safe destructive confirmation
      await waitFor(() => {
        expect(document.activeElement).toBe(cancelBtn);
      });

      // Wrap forward from last focusable (Confirm Reset) -> first focusable (Export Backup First)
      confirmBtn.focus();
      fireEvent.keyDown(confirmBtn, { key: 'Tab', shiftKey: false });
      expect(document.activeElement).toBe(exportBtn);

      // Wrap backward from first focusable -> last focusable
      fireEvent.keyDown(exportBtn, { key: 'Tab', shiftKey: true });
      expect(document.activeElement).toBe(confirmBtn);

      // Escape dismisses alertdialog and restores focus to trigger button
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(
        screen.queryByTestId('confirm-reset-defaults-modal')
      ).not.toBeInTheDocument();
      expect(document.activeElement).toBe(resetTriggerBtn);
    });

    it('cancels app hotkey recording on first Escape without closing the Add App modal', () => {
      render(<App />);

      fireEvent.click(screen.getByRole('button', { name: /Add App/i }));
      const addDialog = screen.getByRole('dialog', {
        name: /Add Application to Dock Drawer/i,
      });
      const recordBtn = within(addDialog).getByRole('button', {
        name: /Record/i,
      });
      fireEvent.click(recordBtn);
      expect(recordBtn).toHaveAttribute('aria-pressed', 'true');

      // First Escape cancels hotkey recording while keeping the modal open
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(
        screen.getByRole('dialog', { name: /Add Application to Dock Drawer/i })
      ).toBeInTheDocument();
      expect(recordBtn).toHaveAttribute('aria-pressed', 'false');

      // Second Escape closes the modal
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(
        screen.queryByRole('dialog', {
          name: /Add Application to Dock Drawer/i,
        })
      ).not.toBeInTheDocument();
    });
  });

  describe('2. 6-Second [Undo] Recovery & Reset Defaults Confirmation', () => {
    it('shows a 6-second [Undo] toast when deleting an app in DockView and restores the deleted app on click', () => {
      vi.useFakeTimers();
      render(<App />);

      expect(screen.getByText(/3 Drawers • 10 Apps/i)).toBeInTheDocument();

      const firstRemoveBtn = screen.getAllByRole('button', {
        name: /^Remove /i,
      })[0];
      const removedAppName = firstRemoveBtn
        .getAttribute('aria-label')!
        .replace(/^Remove /, '');

      fireEvent.click(firstRemoveBtn);

      expect(screen.getByText(/3 Drawers • 9 Apps/i)).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: `Launch ${removedAppName}` })
      ).not.toBeInTheDocument();

      const undoBtn = screen.getByTestId('toast-undo-btn');
      expect(undoBtn).toBeInTheDocument();

      // Verify Undo toast remains active past 5 seconds (6-second recovery window)
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(screen.getByTestId('toast-undo-btn')).toBeInTheDocument();

      // Clicking [Undo] restores the app at its drawer position
      fireEvent.click(screen.getByTestId('toast-undo-btn'));
      expect(screen.getByText(/3 Drawers • 10 Apps/i)).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: `Launch ${removedAppName}` })
      ).toBeInTheDocument();
    });

    it('shows [Undo] when clearing or deleting a note in NotesView and restores note content or deleted note', () => {
      render(<App />);

      fireEvent.click(screen.getByRole('tab', { name: /^Notes$/i }));

      // 1) Clear Note Text + [Undo]
      const noteBody = screen.getByLabelText('Note Body') as HTMLTextAreaElement;
      fireEvent.change(noteBody, {
        target: { value: 'Action items for release readiness' },
      });
      expect(noteBody.value).toBe('Action items for release readiness');

      fireEvent.click(screen.getByRole('button', { name: /Clear Note Text/i }));
      expect(
        (screen.getByLabelText('Note Body') as HTMLTextAreaElement).value
      ).toBe('');

      const clearUndoBtn = screen.getByTestId('toast-undo-btn');
      fireEvent.click(clearUndoBtn);
      expect(
        (screen.getByLabelText('Note Body') as HTMLTextAreaElement).value
      ).toBe('Action items for release readiness');

      // 2) Delete Note + [Undo]
      fireEvent.click(screen.getByRole('button', { name: /New Note/i }));
      fireEvent.change(screen.getByLabelText('Note Title'), {
        target: { value: 'Sprint Retro' },
      });
      fireEvent.change(screen.getByLabelText('Note Body'), {
        target: { value: 'Keep deterministic tests fast' },
      });

      fireEvent.click(screen.getByRole('button', { name: /Delete Note/i }));
      expect(
        screen.queryByRole('button', { name: /Sprint Retro/i })
      ).not.toBeInTheDocument();

      const deleteUndoBtn = screen.getByTestId('toast-undo-btn');
      fireEvent.click(deleteUndoBtn);

      expect(
        screen.getByRole('button', { name: /Sprint Retro/i })
      ).toBeInTheDocument();
      expect(
        (screen.getByLabelText('Note Body') as HTMLTextAreaElement).value
      ).toBe('Keep deterministic tests fast');
    });

    it('shows [Undo] when clearing the canvas in FlowCanvas and restores cleared nodes on click', () => {
      render(<App />);

      fireEvent.click(screen.getByRole('tab', { name: /^Flow$/i }));

      const initialNodeCount = screen.getAllByTestId(/^flow-node-/).length;
      expect(initialNodeCount).toBeGreaterThan(0);

      fireEvent.click(screen.getByRole('button', { name: /Clear Canvas/i }));
      expect(screen.queryAllByTestId(/^flow-node-/)).toHaveLength(0);
      expect(screen.getByText(/Flowchart Canvas is Empty/i)).toBeInTheDocument();

      const undoBtn = screen.getByTestId('toast-undo-btn');
      fireEvent.click(undoBtn);

      expect(screen.getAllByTestId(/^flow-node-/)).toHaveLength(initialNodeCount);
      expect(
        screen.queryByText(/Flowchart Canvas is Empty/i)
      ).not.toBeInTheDocument();
    });

    it('guards Reset Defaults with an alertdialog where Cancel aborts and Confirm resets workspace state including sideflow_flow_diagrams_v1', () => {
      render(<App />);

      // Mutate Pin state and create a 3rd flowchart diagram in sideflow_flow_diagrams_v1
      fireEvent.click(screen.getByTestId('pin-badge'));
      expect(screen.getByTestId('pin-badge')).toHaveTextContent('Auto-Hide');

      fireEvent.click(screen.getByRole('tab', { name: /^Flow$/i }));
      fireEvent.click(screen.getByTestId('toggle-diagram-switcher-btn'));
      fireEvent.click(screen.getByTestId('new-diagram-btn'));

      const savedBeforeReset = JSON.parse(
        window.localStorage.getItem('sideflow_flow_diagrams_v1') || '[]'
      );
      expect(savedBeforeReset).toHaveLength(3);

      // Navigate to Config and open Reset Defaults confirmation modal
      fireEvent.click(screen.getByRole('tab', { name: /^Config/i }));
      fireEvent.click(screen.getByTestId('reset-defaults-trigger-btn'));

      const confirmModal = screen.getByTestId('confirm-reset-defaults-modal');
      expect(confirmModal).toHaveAttribute('role', 'alertdialog');

      // Clicking Cancel aborts reset and preserves custom state + diagrams
      fireEvent.click(
        within(confirmModal).getByRole('button', { name: /^Cancel$/i })
      );
      expect(
        screen.queryByTestId('confirm-reset-defaults-modal')
      ).not.toBeInTheDocument();
      expect(screen.getByTestId('pin-badge')).toHaveTextContent('Auto-Hide');
      expect(
        JSON.parse(
          window.localStorage.getItem('sideflow_flow_diagrams_v1') || '[]'
        )
      ).toHaveLength(3);

      // Re-open modal and click Confirm Reset
      fireEvent.click(screen.getByTestId('reset-defaults-trigger-btn'));
      fireEvent.click(screen.getByTestId('confirm-reset-defaults-btn'));

      expect(
        screen.queryByTestId('confirm-reset-defaults-modal')
      ).not.toBeInTheDocument();
      expect(
        window.localStorage.getItem('sideflow_flow_diagrams_v1')
      ).toBeNull();
      expect(screen.getByTestId('pin-badge')).toHaveTextContent('Pinned');

      // Switching back to Flow remounts cleanly with default 2 diagrams
      fireEvent.click(screen.getByRole('tab', { name: /^Flow$/i }));
      expect(
        within(screen.getByTestId('toggle-diagram-switcher-btn')).getByText('2')
      ).toBeInTheDocument();
    });
  });

  describe('3. Cross-Tab Active Note Targeting ("To Note") & Markdown Link Safety', () => {
    it('appends the ```mermaid fenced block to the active 2nd note instead of notes[0]', () => {
      render(<App />);

      // Open Notes tab and capture notes[0] baseline
      fireEvent.click(screen.getByRole('tab', { name: /^Notes$/i }));
      const firstNoteTitle = (
        screen.getByLabelText('Note Title') as HTMLInputElement
      ).value;
      const firstNoteBody = (
        screen.getByLabelText('Note Body') as HTMLTextAreaElement
      ).value;

      // Create & select a 2nd note
      fireEvent.click(screen.getByRole('button', { name: /New Note/i }));
      fireEvent.change(screen.getByLabelText('Note Title'), {
        target: { value: 'Target Diagram Note' },
      });
      fireEvent.change(screen.getByLabelText('Note Body'), {
        target: { value: 'Architecture specification:' },
      });

      // Switch to Flow tab and click "To Note"
      fireEvent.click(screen.getByRole('tab', { name: /^Flow$/i }));
      fireEvent.click(
        screen.getByRole('button', { name: /Insert Mermaid into Note/i })
      );

      // Switch back to Notes tab and verify 2nd note received the ```mermaid block
      fireEvent.click(screen.getByRole('tab', { name: /^Notes$/i }));
      expect(
        (screen.getByLabelText('Note Title') as HTMLInputElement).value
      ).toBe('Target Diagram Note');

      const secondNoteUpdatedBody = (
        screen.getByLabelText('Note Body') as HTMLTextAreaElement
      ).value;
      expect(secondNoteUpdatedBody).toContain('Architecture specification:');
      expect(secondNoteUpdatedBody).toContain('```mermaid');

      // Select notes[0] and verify it was NOT mutated
      fireEvent.click(
        screen.getByRole('button', {
          name: new RegExp(firstNoteTitle, 'i'),
        })
      );
      const firstNoteAfterBody = (
        screen.getByLabelText('Note Body') as HTMLTextAreaElement
      ).value;
      expect(firstNoteAfterBody).toBe(firstNoteBody);
      expect(firstNoteAfterBody).not.toContain('```mermaid');
    });

    it('allows https:// and mailto: Markdown links while neutralizing unsafe javascript: URIs in Preview mode', () => {
      render(<App />);
      fireEvent.click(screen.getByRole('tab', { name: /^Notes$/i }));

      fireEvent.change(screen.getByLabelText('Note Body'), {
        target: {
          value:
            'Safe [Docs](https://example.com) and unsafe [Payload](javascript:alert(1))',
        },
      });
      fireEvent.click(screen.getByRole('button', { name: /^Preview$/i }));

      const safeLink = screen.getByRole('link', { name: 'Docs' });
      expect(safeLink).toHaveAttribute('href', 'https://example.com');
      expect(
        screen.queryByRole('link', { name: 'Payload' })
      ).not.toBeInTheDocument();
    });
  });

  describe('4. Keyboard Accessibility & Power-User Shortcuts', () => {
    it('switches tabs via Ctrl+1..4 and focuses the active search input via Ctrl+F in Dock and Notes', () => {
      render(<App />);

      // Ctrl+2 -> Flow
      fireEvent.keyDown(window, { key: '2', ctrlKey: true });
      expect(
        screen.getByRole('region', { name: /Flowchart Scratchpad/i })
      ).toBeInTheDocument();

      // Ctrl+3 -> Notes, then Ctrl+F focuses Notes search input
      fireEvent.keyDown(window, { key: '3', ctrlKey: true });
      expect(
        screen.getByRole('region', { name: /Voice-Dictated & Quick Notes/i })
      ).toBeInTheDocument();

      const notesSearchInput = screen.getByLabelText('Search notes');
      fireEvent.keyDown(window, { key: 'f', ctrlKey: true });
      expect(document.activeElement).toBe(notesSearchInput);

      // Ctrl+4 -> Config
      fireEvent.keyDown(window, { key: '4', ctrlKey: true });
      expect(
        screen.getByRole('region', { name: /Shortcut & Tray Settings/i })
      ).toBeInTheDocument();

      // Ctrl+1 -> Dock, then Ctrl+F focuses Dock app search input
      fireEvent.keyDown(window, { key: '1', ctrlKey: true });
      expect(
        screen.getByRole('region', { name: /ObjectDock App Drawers/i })
      ).toBeInTheDocument();

      const dockSearchInput = screen.getByLabelText(
        /Filter apps or type to launch/i
      );
      fireEvent.keyDown(window, { key: 'f', ctrlKey: true });
      expect(document.activeElement).toBe(dockSearchInput);
    });

    it('does NOT spawn a branch node on Tab (no keyboard trap), while Alt+Enter and Ctrl+Enter spawn and connect branch nodes', () => {
      render(<App />);

      fireEvent.click(screen.getByRole('tab', { name: /^Flow$/i }));

      const initialNodes = screen.getAllByTestId(/^flow-node-/).length;
      const initialEdges = screen.getAllByTestId(/^flow-edge-/).length;

      // Pressing Tab on a focused FlowCanvas node does NOT trap focus or spawn a node
      const node1 = screen.getByTestId('flow-node-n1');
      node1.focus();
      const nodeTabNotPrevented = fireEvent.keyDown(node1, { key: 'Tab' });
      expect(nodeTabNotPrevented).toBe(true);
      expect(screen.getAllByTestId(/^flow-node-/)).toHaveLength(initialNodes);

      // Pressing Tab inside the inline node <input> commits label without spawning a branch node
      fireEvent.doubleClick(node1);
      const inlineEditInput = screen.getByLabelText('Edit node label');
      fireEvent.change(inlineEditInput, {
        target: { value: 'Validated Entry' },
      });
      const inputTabNotPrevented = fireEvent.keyDown(inlineEditInput, {
        key: 'Tab',
      });
      expect(inputTabNotPrevented).toBe(true);
      expect(
        screen.queryByLabelText('Edit node label')
      ).not.toBeInTheDocument();
      expect(screen.getAllByTestId(/^flow-node-/)).toHaveLength(initialNodes);

      // Alt+Enter on focused node spawns and connects a branch node
      const updatedNode1 = screen.getByTestId('flow-node-n1');
      updatedNode1.focus();
      fireEvent.keyDown(updatedNode1, { key: 'Enter', altKey: true });
      expect(screen.getAllByTestId(/^flow-node-/)).toHaveLength(
        initialNodes + 1
      );
      expect(screen.getAllByTestId(/^flow-edge-/)).toHaveLength(
        initialEdges + 1
      );

      // Ctrl+Enter inside active inline <input> also spawns and connects a branch node
      const branchedInput = screen.getByLabelText('Edit node label');
      fireEvent.keyDown(branchedInput, { key: 'Enter', ctrlKey: true });
      expect(screen.getAllByTestId(/^flow-node-/)).toHaveLength(
        initialNodes + 2
      );
      expect(screen.getAllByTestId(/^flow-edge-/)).toHaveLength(
        initialEdges + 2
      );
    });

    it('satisfies WCAG 2.5.3 Label in Name on Header Config tab and toggles Pin/Auto-Hide on pin-badge click', () => {
      render(<App />);

      const configTab = screen.getByRole('tab', { name: /^Config/i });
      expect(configTab).toHaveTextContent('Config');
      expect(configTab.getAttribute('aria-label')?.startsWith('Config')).toBe(
        true
      );

      const pinBadge = screen.getByTestId('pin-badge');
      expect(pinBadge.tagName).toBe('BUTTON');
      expect(pinBadge).toHaveAttribute('aria-pressed', 'true');
      expect(pinBadge).toHaveTextContent('Pinned');

      fireEvent.click(pinBadge);
      expect(pinBadge).toHaveAttribute('aria-pressed', 'false');
      expect(pinBadge).toHaveTextContent('Auto-Hide');

      fireEvent.click(pinBadge);
      expect(pinBadge).toHaveAttribute('aria-pressed', 'true');
      expect(pinBadge).toHaveTextContent('Pinned');
    });
  });

  describe('5. Settings Category Filtering & Native Electron Promo Suppression', () => {
    it('filters Settings to show Appearance (Dock Style) while hiding Shortcuts and Monitors sections', () => {
      render(<App />);

      fireEvent.click(screen.getByRole('tab', { name: /^Config/i }));

      // Under default "All" category, Shortcuts, Monitors, and Appearance are all rendered
      expect(screen.getByText(/Global Toggle Shortcut/i)).toBeInTheDocument();
      expect(
        screen.getByTestId('multi-monitor-settings-card')
      ).toBeInTheDocument();
      expect(
        screen.getByText(/ObjectDock Appearance & Placement/i)
      ).toBeInTheDocument();

      const appearanceFilterBtn =
        screen.queryByTestId('settings-filter-appearance') ??
        screen.getByTestId('settings-cat-dock');
      fireEvent.click(appearanceFilterBtn);

      expect(appearanceFilterBtn).toHaveAttribute('aria-pressed', 'true');
      expect(
        screen.getByText(/ObjectDock Appearance & Placement/i)
      ).toBeInTheDocument();
      expect(screen.getByLabelText(/Dock Hover Effect/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Dock Tile Size/i)).toBeInTheDocument();

      // Shortcuts and Monitors sections are hidden
      expect(
        screen.queryByText(/Global Toggle Shortcut/i)
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId('multi-monitor-settings-card')
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId('screen-presence-settings-card')
      ).not.toBeInTheDocument();
    });

    it('renders electron-web-promo-card in web preview mode and suppresses it when window.sideflow.isElectron is true', () => {
      const webRender = render(<App />);
      fireEvent.click(screen.getByRole('tab', { name: /^Config/i }));
      expect(screen.getByTestId('electron-web-promo-card')).toBeInTheDocument();
      webRender.unmount();

      window.sideflow = {
        isElectron: true,
        setPanelVisibility: vi.fn(),
        setPanelEdge: vi.fn(),
        setPanelWidthPercent: vi.fn(),
        setEdgeHandleState: vi.fn(),
        getAutoLaunch: vi.fn().mockResolvedValue({ enabled: true }),
        getUpdateStatus: vi.fn().mockResolvedValue({
          status: 'idle',
          currentVersion: '1.0.0',
        }),
      } as unknown as Window['sideflow'];

      render(<App />);
      fireEvent.click(screen.getByRole('tab', { name: /^Config/i }));
      expect(
        screen.queryByTestId('electron-web-promo-card')
      ).not.toBeInTheDocument();
    });
  });
});
