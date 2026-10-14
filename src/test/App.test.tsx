import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import App from '../App';

describe('SideFlow Application Integration Suite', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete window.sideflow;
    vi.restoreAllMocks();
  });

  describe('App Shell & Navigation', () => {
    it('renders the SideFlow panel, desktop environment, and switches between all four tabs', () => {
      render(<App />);

      expect(
        screen.getByRole('complementary', { name: /SideFlow Utility Panel/i })
      ).toBeInTheDocument();
      expect(screen.getByTestId('pin-badge')).toHaveTextContent('Pinned');

      // Default tab is Dock Drawers
      expect(
        screen.getByRole('region', { name: /ObjectDock App Drawers/i })
      ).toBeInTheDocument();

      // Switch to Flowchart tab
      fireEvent.click(screen.getByRole('tab', { name: /Flow/i }));
      expect(
        screen.getByRole('region', { name: /Flowchart Scratchpad/i })
      ).toBeInTheDocument();

      // Switch to Notes tab
      fireEvent.click(screen.getByRole('tab', { name: /Notes/i }));
      expect(
        screen.getByRole('region', { name: /Voice-Dictated & Quick Notes/i })
      ).toBeInTheDocument();

      // Switch to Settings tab
      fireEvent.click(
        screen.getByRole('tab', { name: /Shortcut & Tray Settings/i })
      );
      expect(
        screen.getByRole('region', { name: /Shortcut & Tray Settings/i })
      ).toBeInTheDocument();
    });

    it('toggles the slide-out panel via close button, edge peek handle, and global hotkey', () => {
      render(<App />);
      const sidePanel = screen.getByTestId('side-panel');
      expect(sidePanel.className).toContain('translate-x-0');

      // Close panel via Header button
      fireEvent.click(
        screen.getByRole('button', { name: /Hide to System Tray/i })
      );
      expect(sidePanel.className).toContain('translate-x-full');

      // Re-open via right-edge peek handle
      fireEvent.click(screen.getByTestId('edge-peek-handle'));
      expect(sidePanel.className).toContain('translate-x-0');

      // Toggle closed with default Alt + Space hotkey
      fireEvent.keyDown(window, {
        key: ' ',
        code: 'Space',
        altKey: true,
      });
      expect(sidePanel.className).toContain('translate-x-full');
    });
  });

  describe('DockView (Search, Drawer Filtering, Adding Apps/Drawers, File Drop)', () => {
    it('filters apps by search query and by drawer category pill', () => {
      render(<App />);

      // Verify initial summary count (3 Drawers • 10 Apps)
      expect(screen.getByText(/3 Drawers • 10 Apps/i)).toBeInTheDocument();

      // Search for "Docker"
      const searchInput = screen.getByLabelText(
        /Filter apps or type to launch/i
      );
      fireEvent.change(searchInput, { target: { value: 'Docker' } });
      expect(screen.getByText('Docker Engine')).toBeInTheDocument();
      expect(screen.queryByText('Spotify')).not.toBeInTheDocument();
      expect(screen.getByText(/3 Drawers • 1 Apps/i)).toBeInTheDocument();

      // Clear search and filter by "Communication & Media" drawer pill
      fireEvent.change(searchInput, { target: { value: '' } });
      const commsPill = screen
        .getAllByRole('button', { name: 'Communication & Media' })
        .find((el) => el.closest('#drawer-tabs-bar'));
      expect(commsPill).toBeDefined();
      fireEvent.click(commsPill!);

      expect(
        screen.getByTestId('drawer-card-drawer-comms')
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId('drawer-card-drawer-dev')
      ).not.toBeInTheDocument();
    });

    it('creates a new drawer category and adds a new application to it', () => {
      render(<App />);

      // Open Create New Drawer modal
      fireEvent.click(screen.getByRole('button', { name: /New Drawer/i }));
      const drawerInput = screen.getByLabelText(/Drawer Title/i);
      fireEvent.change(drawerInput, { target: { value: 'Cloud & DevOps' } });
      fireEvent.click(screen.getByRole('button', { name: /Create Drawer/i }));

      expect(screen.getByText(/4 Drawers • 10 Apps/i)).toBeInTheDocument();

      // Open Add App modal
      fireEvent.click(screen.getByRole('button', { name: /Add App/i }));
      fireEvent.change(screen.getByLabelText(/Application Name/i), {
        target: { value: 'Kubernetes Lens' },
      });
      fireEvent.change(
        screen.getByLabelText(/Executable Path \/ Custom URI Protocol \/ URL/i),
        {
          target: { value: 'C:\\Tools\\Lens\\Lens.exe' },
        }
      );
      fireEvent.click(screen.getByRole('button', { name: /Add to Drawer/i }));

      expect(screen.getByText('Kubernetes Lens')).toBeInTheDocument();
      expect(screen.getByText(/4 Drawers • 11 Apps/i)).toBeInTheDocument();
    });

    it('resolves and adds dropped desktop files onto a drawer card', () => {
      render(<App />);

      const devDrawerCard = screen.getByTestId('drawer-card-drawer-dev');
      const droppedFile = new File(['binary'], 'obs64.exe', {
        type: 'application/x-msdownload',
      });

      fireEvent.drop(devDrawerCard, {
        dataTransfer: {
          files: [droppedFile],
          getData: () => '',
        },
      });

      // "obs64.exe" should be inferred as "Obs64" with path C:\Users\Local\Desktop\obs64.exe
      expect(screen.getByText('Obs64')).toBeInTheDocument();
      expect(
        screen.getByText('C:\\Users\\Local\\Desktop\\obs64.exe')
      ).toBeInTheDocument();
      expect(screen.getByText(/3 Drawers • 11 Apps/i)).toBeInTheDocument();
    });
  });

  describe('FlowCanvas & LucidModal (Nodes, Edges, and Mermaid Bridge)', () => {
    it('adds and deletes flowchart nodes and syncs Mermaid syntax via LucidModal', () => {
      render(<App />);
      fireEvent.click(screen.getByRole('tab', { name: /Flow/i }));

      // Default 4 nodes exist
      expect(screen.getByText('Hotkey Pressed')).toBeInTheDocument();
      expect(screen.getByText('Need Diagram or App?')).toBeInTheDocument();

      // Add a Process node and a Decision node
      fireEvent.click(screen.getByRole('button', { name: /Process/i }));
      expect(screen.getByText('New Process')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /Decision/i }));
      expect(screen.getByText('Condition?')).toBeInTheDocument();

      // Delete "Hotkey Pressed" node
      fireEvent.click(
        screen.getByRole('button', { name: /Delete node Hotkey Pressed/i })
      );
      expect(screen.queryByText('Hotkey Pressed')).not.toBeInTheDocument();

      // Open Lucidchart Sync Modal
      fireEvent.click(screen.getByRole('button', { name: /Lucidchart Sync/i }));
      const dialog = screen.getByRole('dialog', {
        name: /Lucidchart Integration Hub/i,
      });
      expect(dialog).toBeInTheDocument();

      const mermaidTextarea = within(dialog).getByRole(
        'textbox',
        { name: /Mermaid\.js Code/i }
      ) as HTMLTextAreaElement;
      expect(mermaidTextarea.value).toContain('flowchart TD');
      expect(mermaidTextarea.value).toContain('New Process');
      expect(mermaidTextarea.value).not.toContain('Hotkey Pressed');

      // Edit Mermaid code inside LucidModal and Sync back to Canvas
      const customMermaid = [
        'flowchart TD',
        '    s1(["API Request"])',
        '    d1{"Auth Valid?"}',
        '    s1 -->|JWT| d1',
      ].join('\n');
      fireEvent.change(mermaidTextarea, { target: { value: customMermaid } });
      fireEvent.click(
        within(dialog).getByRole('button', { name: /Sync to Canvas/i })
      );

      // Modal closes and canvas updates to the parsed nodes
      expect(screen.getByText('API Request')).toBeInTheDocument();
      expect(screen.getByText('Auth Valid?')).toBeInTheDocument();
      expect(screen.queryByText('New Process')).not.toBeInTheDocument();
    });
  });

  describe('NotesView & VoiceBar (Notes CRUD, Word Count, Voice Dictation, Timestamps)', () => {
    it('creates notes, updates word/char counts, appends voice dictation fallback, and inserts timestamps', () => {
      render(<App />);
      fireEvent.click(screen.getByRole('tab', { name: /Notes/i }));

      // Create a new blank note
      fireEvent.click(screen.getByRole('button', { name: /New Note/i }));

      const titleInput = screen.getByLabelText(/Note Title/i) as HTMLInputElement;
      const bodyInput = screen.getByLabelText(/Note Body/i) as HTMLTextAreaElement;

      expect(titleInput.value).toBe('Quick Note 3');
      expect(bodyInput.value).toBe('');
      expect(screen.getByText('0 words • 0 chars')).toBeInTheDocument();

      // Type into note body and check live word/character counter
      fireEvent.change(bodyInput, {
        target: { value: 'Ship SideFlow desktop build' },
      });
      expect(screen.getByText('4 words • 27 chars')).toBeInTheDocument();

      // Trigger simulated voice dictation (no SpeechRecognition in jsdom)
      fireEvent.click(
        screen.getByRole('button', { name: /Start voice dictation/i })
      );
      expect(bodyInput.value).toContain('[Voice Dictation Sample]:');

      // Insert a formatted timestamp
      fireEvent.click(
        screen.getByRole('button', { name: /Insert Timestamp/i })
      );
      expect(bodyInput.value).toMatch(/\[\d{1,2}:\d{2}.*\]/);
    });
  });

  describe('SettingsView (Global Hotkey Recorder & Auto-Hide Pin Toggle)', () => {
    it('records a custom global hotkey combination and resets to default Alt + Space', () => {
      render(<App />);
      fireEvent.click(
        screen.getByRole('tab', { name: /Shortcut & Tray Settings/i })
      );

      const shortcutPill = screen.getByTestId('current-shortcut-pill');
      expect(shortcutPill).toHaveTextContent('Alt + Space');

      // Start recording hotkey
      const recordBtn = screen.getByRole('button', {
        name: /Click & Press New Shortcut Combo/i,
      });
      fireEvent.click(recordBtn);
      expect(
        screen.getByText(/Press any key combo now/i)
      ).toBeInTheDocument();

      // Press Ctrl + Shift + K
      fireEvent.keyDown(window, {
        key: 'k',
        code: 'KeyK',
        ctrlKey: true,
        shiftKey: true,
        altKey: false,
      });

      expect(shortcutPill).toHaveTextContent('Ctrl + Shift + K');

      // Reset hotkey back to Alt + Space
      fireEvent.click(screen.getByRole('button', { name: /^Reset$/i }));
      expect(shortcutPill).toHaveTextContent('Alt + Space');
    });

    it('toggles Auto-Hide preference and retracts panel when clicking desktop background', () => {
      render(<App />);
      fireEvent.click(
        screen.getByRole('tab', { name: /Shortcut & Tray Settings/i })
      );

      const pinBadge = screen.getByTestId('pin-badge');
      expect(pinBadge).toHaveTextContent('Pinned');

      // Enable "Auto-Hide When Clicking Outside" checkbox
      const autoHideCheckbox = screen.getByRole('checkbox', {
        name: /Auto-Hide When Clicking Outside/i,
      });
      expect(autoHideCheckbox).not.toBeChecked();

      fireEvent.click(autoHideCheckbox);
      expect(autoHideCheckbox).toBeChecked();
      expect(pinBadge).toHaveTextContent('Auto-Hide');

      // Clicking outside on the desktop environment now retracts the panel
      const desktopEnv = screen.getByTestId('desktop-environment');
      fireEvent.mouseDown(desktopEnv);
      expect(screen.getByTestId('side-panel').className).toContain(
        'translate-x-full'
      );
    });
  });
});
