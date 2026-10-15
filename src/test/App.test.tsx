import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
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

    it('adds extended Mermaid shapes, switches flow direction, and connects nodes with custom edge styles and arrows', () => {
      render(<App />);
      fireEvent.click(screen.getByRole('tab', { name: /Flow/i }));

      // Clear canvas first
      fireEvent.click(screen.getByRole('button', { name: /Clear Canvas/i }));

      // Add Database, Subroutine, I/O, Circle, Hexagon, and Flag nodes
      const shapesGroup = screen.getByRole('group', {
        name: /Additional Mermaid Shapes/i,
      });
      fireEvent.click(within(shapesGroup).getByRole('button', { name: /DB/i }));
      fireEvent.click(within(shapesGroup).getByRole('button', { name: /^Sub$/i }));
      fireEvent.click(within(shapesGroup).getByRole('button', { name: /I\/O/i }));
      fireEvent.click(
        within(shapesGroup).getByRole('button', { name: /Circle/i })
      );
      fireEvent.click(within(shapesGroup).getByRole('button', { name: /Hex/i }));
      fireEvent.click(
        within(shapesGroup).getByRole('button', { name: /Flag/i })
      );

      expect(screen.getByText('Database')).toBeInTheDocument();
      expect(screen.getByText('Subroutine')).toBeInTheDocument();
      expect(screen.getByText('Input / Output')).toBeInTheDocument();
      expect(screen.getByText('Connector')).toBeInTheDocument();
      expect(screen.getByText('Prepare')).toBeInTheDocument();
      expect(screen.getByText('Signal / Flag')).toBeInTheDocument();

      // Switch Flow Direction to LR
      fireEvent.click(screen.getByRole('button', { name: /Direction LR/i }));
      expect(
        screen.getByRole('button', { name: /Direction LR/i })
      ).toHaveAttribute('aria-pressed', 'true');

      // Select Dotted line style and Bidirectional arrow type, then connect Database -> Subroutine
      fireEvent.change(screen.getByLabelText(/Connector Line Style/i), {
        target: { value: 'dotted' },
      });
      fireEvent.change(screen.getByLabelText(/Connector Arrow Type/i), {
        target: { value: 'bidirectional' },
      });

      fireEvent.click(screen.getByRole('button', { name: /^Connect$/i }));
      fireEvent.mouseDown(screen.getByLabelText('Node: Database'));
      fireEvent.mouseDown(screen.getByLabelText('Node: Subroutine'));

      // Verify generated Mermaid code in Lucidchart Sync modal includes LR, shapes, and <-.-> operator
      fireEvent.click(screen.getByRole('button', { name: /Lucidchart Sync/i }));
      const dialog = screen.getByRole('dialog', {
        name: /Lucidchart Integration Hub/i,
      });
      const mermaidTextarea = within(dialog).getByRole('textbox', {
        name: /Mermaid\.js Code/i,
      }) as HTMLTextAreaElement;

      expect(mermaidTextarea.value).toContain('flowchart LR');
      expect(mermaidTextarea.value).toContain('[("Database")]');
      expect(mermaidTextarea.value).toContain('[["Subroutine"]]');
      expect(mermaidTextarea.value).toContain('[/"Input / Output"/]');
      expect(mermaidTextarea.value).toContain('(("Connector"))');
      expect(mermaidTextarea.value).toContain('{{"Prepare"}}');
      expect(mermaidTextarea.value).toContain('>"Signal / Flag"]');
      expect(mermaidTextarea.value).toContain('<-.->');
    });

    it('supports creating/renaming Subgraph containers, cycling node accent colors, and live bidirectional Mermaid code drawer editing', () => {
      render(<App />);
      fireEvent.click(screen.getByRole('tab', { name: /Flow/i }));

      // 1. Cycle accent color on "Hotkey Pressed" node
      const colorBtn = screen.getByRole('button', {
        name: /Cycle color for Hotkey Pressed/i,
      });
      fireEvent.click(colorBtn);

      // 2. Create a Subgraph container via the Mermaid Primitives Bar
      fireEvent.click(
        screen.getByRole('button', { name: /Add Subgraph Group/i })
      );
      const subgraphTitle = screen.getByText(/Subgraph 1/i);
      expect(subgraphTitle).toBeInTheDocument();

      // Double-click subgraph title to rename it
      fireEvent.doubleClick(subgraphTitle);
      const sgInput = screen.getByLabelText(/Edit subgraph title/i);
      fireEvent.change(sgInput, { target: { value: 'Core Pipeline' } });
      fireEvent.keyDown(sgInput, { key: 'Enter' });
      expect(screen.getByText(/Core Pipeline/i)).toBeInTheDocument();

      // 3. Open the Live Mermaid Code Drawer and sync advanced syntax (subgraph + chained edges + & links)
      const toggleDrawerBtn = screen.getByRole('button', {
        name: /Toggle Live Mermaid Editor/i,
      });
      fireEvent.click(toggleDrawerBtn);
      expect(screen.getByTestId('live-mermaid-drawer')).toBeInTheDocument();

      const liveInput = screen.getByLabelText(
        /Live Mermaid Code Input/i
      ) as HTMLTextAreaElement;
      expect(liveInput.value).toContain('subgraph sg_1 ["Core Pipeline"]');

      fireEvent.change(liveInput, {
        target: {
          value: [
            'flowchart LR',
            '    subgraph backend ["Backend Services"]',
            '        api["API Gateway"]',
            '        db[("Database")]',
            '    end',
            '    client(["Client"]) --> api ==> db',
            '    classDef emerald fill:#064e3b,stroke:#10b981',
            '    class db emerald',
          ].join('\n'),
        },
      });

      fireEvent.click(screen.getByRole('button', { name: /Apply & Layout/i }));

      expect(screen.getByText('API Gateway')).toBeInTheDocument();
      expect(screen.getByText('Backend Services')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /Direction LR/i })
      ).toHaveAttribute('aria-pressed', 'true');
    });

    it('supports Flowchart Undo/Redo, Zoom controls, Starter Templates, Multi-Diagram modes (stateDiagram-v2 & sequenceDiagram), and embedding Mermaid diagrams into Notes', () => {
      render(<App />);
      fireEvent.click(screen.getByRole('tab', { name: /Flow/i }));

      // 1. Add a node and verify Undo / Redo buttons
      fireEvent.click(screen.getByRole('button', { name: /Process/i }));
      expect(screen.getByText('New Process')).toBeInTheDocument();

      const undoBtn = screen.getByRole('button', {
        name: /Undo Flowchart Edit/i,
      });
      const redoBtn = screen.getByRole('button', {
        name: /Redo Flowchart Edit/i,
      });
      expect(undoBtn).not.toBeDisabled();
      fireEvent.click(undoBtn);
      expect(screen.queryByText('New Process')).not.toBeInTheDocument();

      expect(redoBtn).not.toBeDisabled();
      fireEvent.click(redoBtn);
      expect(screen.getByText('New Process')).toBeInTheDocument();

      // 2. Test Canvas Zoom In and Reset Zoom
      const resetZoomBtn = screen.getByRole('button', {
        name: /Reset Flowchart Zoom/i,
      });
      expect(resetZoomBtn).toHaveTextContent('100%');
      fireEvent.click(
        screen.getByRole('button', { name: /Zoom In Flowchart/i })
      );
      expect(resetZoomBtn).toHaveTextContent('115%');
      fireEvent.click(resetZoomBtn);
      expect(resetZoomBtn).toHaveTextContent('100%');

      // 3. Load Sequence Diagram Template ("microservice") and verify lifelines + diagramType
      const templateSelect = screen.getByLabelText(/Load Mermaid Template/i);
      fireEvent.change(templateSelect, { target: { value: 'microservice' } });

      expect(screen.getByText('Client App')).toBeInTheDocument();
      expect(screen.getByText('Token Store')).toBeInTheDocument();
      expect(screen.getByTestId('flow-lifelines-group')).toBeInTheDocument();
      expect(
        (screen.getByLabelText(/Mermaid Diagram Type/i) as HTMLSelectElement)
          .value
      ).toBe('sequenceDiagram');

      // 4. Switch Diagram Mode to State Diagram (stateDiagram-v2)
      fireEvent.change(screen.getByLabelText(/Mermaid Diagram Type/i), {
        target: { value: 'stateDiagram-v2' },
      });
      expect(
        (screen.getByLabelText(/Mermaid Diagram Type/i) as HTMLSelectElement)
          .value
      ).toBe('stateDiagram-v2');

      // 5. Insert Mermaid diagram into Active Note and verify interactive SVG preview in Notes tab
      fireEvent.click(
        screen.getByRole('button', { name: /Insert Mermaid into Note/i })
      );

      fireEvent.click(screen.getByRole('tab', { name: /Notes/i }));
      fireEvent.click(screen.getByRole('button', { name: /Preview/i }));

      const diagramPreview = screen.getByTestId('note-mermaid-diagram');
      expect(diagramPreview).toBeInTheDocument();
      expect(diagramPreview).toHaveTextContent(/stateDiagram-v2/i);

      // Click "Edit in Flow" inside the Note preview to round-trip back to Flow tab
      fireEvent.click(
        within(diagramPreview).getByRole('button', {
          name: /Open Mermaid block in Flow tab/i,
        })
      );
      expect(
        screen.getByRole('region', { name: /Flowchart Scratchpad/i })
      ).toBeInTheDocument();
    });

    it('supports UML Class Diagram (classDiagram) and ER Schema (erDiagram) templates with interactive stereotype, member, and cardinality editors', () => {
      render(<App />);
      fireEvent.click(screen.getByRole('tab', { name: /Flow/i }));

      const templateSelect = screen.getByLabelText(/Load Mermaid Template/i);

      // 1. Load UML Class Diagram template ("uml-class")
      fireEvent.change(templateSelect, { target: { value: 'uml-class' } });
      expect(
        (screen.getByLabelText(/Mermaid Diagram Type/i) as HTMLSelectElement)
          .value
      ).toBe('classDiagram');
      expect(
        screen.getByTestId('flow-node-stereotype-IRepository')
      ).toHaveTextContent('<<interface>>');
      expect(
        screen.getByTestId('flow-node-members-IRepository')
      ).toHaveTextContent('+findById(id) Entity');
      expect(
        screen.getByTestId('flow-node-members-UserService')
      ).toHaveTextContent('+register(email, pass) User');

      // 2. Open Interactive Compartment Editor on UserService and add stereotype + member
      fireEvent.click(screen.getByTestId('edit-compartment-btn-UserService'));
      const popover = screen.getByTestId('uml-compartment-popover');
      expect(popover).toBeInTheDocument();

      fireEvent.change(within(popover).getByTestId('uml-stereotype-select'), {
        target: { value: 'service' },
      });
      expect(
        screen.getByTestId('flow-node-stereotype-UserService')
      ).toHaveTextContent('<<service>>');

      fireEvent.change(within(popover).getByTestId('new-node-member-input'), {
        target: { value: '+revokeToken(id) void' },
      });
      fireEvent.click(within(popover).getByTestId('uml-member-add-btn'));
      expect(
        screen.getByTestId('flow-node-members-UserService')
      ).toHaveTextContent('+revokeToken(id) void');

      // Close compartment popover
      fireEvent.click(
        within(popover).getByRole('button', {
          name: /Close compartment editor/i,
        })
      );
      expect(
        screen.queryByTestId('uml-compartment-popover')
      ).not.toBeInTheDocument();

      // 3. Load ER Schema template ("er-schema") and edit edge cardinality
      fireEvent.change(templateSelect, { target: { value: 'er-schema' } });
      expect(
        (screen.getByLabelText(/Mermaid Diagram Type/i) as HTMLSelectElement)
          .value
      ).toBe('erDiagram');
      expect(screen.getByTestId('flow-node-members-USER')).toHaveTextContent(
        'uuid id PK'
      );
      expect(screen.getByTestId('flow-node-members-ORDER')).toHaveTextContent(
        'uuid user_id FK'
      );

      // Click the "places" relationship badge and change cardinality to }|..|{
      fireEvent.click(
        screen.getByRole('button', { name: /Edit edge label places/i })
      );
      fireEvent.change(screen.getByTestId('edit-edge-cardinality-select'), {
        target: { value: '}|..|{' },
      });
      expect(
        screen.getByRole('button', { name: /Edit edge label places/i })
      ).toHaveTextContent('}|..|{ places');
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

    it('rejects single non-modifier keys during hotkey recording and accepts modifier combinations', () => {
      render(<App />);
      fireEvent.click(
        screen.getByRole('tab', { name: /Shortcut & Tray Settings/i })
      );

      const recordBtn = screen.getByRole('button', {
        name: /Click & Press New Shortcut Combo/i,
      });
      fireEvent.click(recordBtn);

      // Press 'k' without any modifier — should NOT commit and should remain in recording mode
      fireEvent.keyDown(window, { key: 'k', code: 'KeyK' });
      expect(
        screen.getByText(/Press any key combo now/i)
      ).toBeInTheDocument();

      // Now press Ctrl + Shift + K — should commit
      fireEvent.keyDown(window, {
        key: 'k',
        code: 'KeyK',
        ctrlKey: true,
        shiftKey: true,
      });
      expect(screen.getByTestId('current-shortcut-pill')).toHaveTextContent(
        'Ctrl + Shift + K'
      );
    });

    it('imports a valid JSON backup file and restores drawers, flowData, notes, and shortcut settings', async () => {
      render(<App />);
      fireEvent.click(
        screen.getByRole('tab', { name: /Shortcut & Tray Settings/i })
      );

      const fileInput = screen.getByTestId('import-backup-input');
      const backupPayload = {
        version: '1.0.0',
        drawers: [
          {
            id: 'd-imported',
            title: 'Imported Custom Drawer',
            collapsed: false,
            apps: [
              {
                id: 'a-imp',
                name: 'Imported App',
                cmd: 'https://imported.example.com',
                icon: 'globe',
                color: '#38bdf8',
              },
            ],
          },
        ],
        flowData: {
          nodes: [
            {
              id: 'n1',
              type: 'start',
              text: 'Imported Flow Node',
              x: 120,
              y: 80,
            },
          ],
          edges: [],
        },
        notes: [
          {
            id: 'note-imp',
            title: 'Imported Note Title',
            body: 'Imported Note Body',
            updatedAt: 1700000000000,
          },
        ],
        shortcut: {
          label: 'Ctrl + Alt + P',
          ctrl: true,
          alt: true,
          shift: false,
          key: 'p',
          code: 'KeyP',
        },
        isPinned: true,
        showEdgeHandle: true,
      };

      const file = new File([JSON.stringify(backupPayload)], 'backup.json', {
        type: 'application/json',
      });
      fireEvent.change(fileInput, { target: { files: [file] } });

      // Wait for FileReader onload
      expect(
        await screen.findByText(/Restored SideFlow Backup/i)
      ).toBeInTheDocument();
      expect(screen.getByTestId('current-shortcut-pill')).toHaveTextContent(
        'Ctrl + Alt + P'
      );

      // Switch to Drawers tab and verify imported drawer
      fireEvent.click(screen.getByRole('tab', { name: /Dock/i }));
      expect(
        screen.getAllByText('Imported Custom Drawer').length
      ).toBeGreaterThan(0);
      expect(screen.getByText('Imported App')).toBeInTheDocument();
    });
  });

  describe('Additional Feature Enhancements Across Tabs 1-3', () => {
    it('supports clearing search query via Clear button and shows empty search banner when no apps match', () => {
      render(<App />);
      const searchInput = screen.getByLabelText(
        /Filter apps or type to launch/i
      );

      fireEvent.change(searchInput, {
        target: { value: 'zzzz-nonexistent-query' },
      });
      expect(
        screen.getByText(/No applications match/i)
      ).toBeInTheDocument();

      // Click the Clear Search button inside the empty state
      fireEvent.click(screen.getByRole('button', { name: /^Clear Search$/i }));
      expect(searchInput).toHaveValue('');
      expect(screen.getByText('Docker Engine')).toBeInTheDocument();
    });

    it('supports editing Flowchart connector edge labels, Auto-Align Nodes, and Empty Canvas recovery', () => {
      render(<App />);
      fireEvent.click(screen.getByRole('tab', { name: /Flow/i }));

      // Edit edge label between n1 and n2
      const addLabelBadge = screen.getByRole('button', {
        name: /Add label to connection n1 to n2/i,
      });
      fireEvent.click(addLabelBadge);

      const edgeLabelInput = screen.getByLabelText(/Edit connector label/i);
      fireEvent.change(edgeLabelInput, { target: { value: 'Verified' } });
      fireEvent.keyDown(edgeLabelInput, { key: 'Enter' });

      expect(
        screen.getByRole('button', { name: /Edit edge label Verified/i })
      ).toHaveTextContent('Verified');

      // Click Auto-Align Nodes button
      fireEvent.click(
        screen.getByRole('button', { name: /Auto-Align Nodes/i })
      );

      // Clear canvas and verify empty recovery state
      fireEvent.click(screen.getByRole('button', { name: /Clear Canvas/i }));

      expect(
        screen.getByText(/Flowchart Canvas is Empty/i)
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /Restore Demo/i }));
      expect(screen.getByText('Hotkey Pressed')).toBeInTheDocument();
    });

    it('displays inline error in Lucidchart modal when attempting to sync invalid Mermaid syntax', () => {
      render(<App />);
      fireEvent.click(screen.getByRole('tab', { name: /Flow/i }));

      fireEvent.click(screen.getByRole('button', { name: /Lucidchart Sync/i }));
      const dialog = screen.getByRole('dialog', {
        name: /Lucidchart Integration Hub/i,
      });

      const mermaidTextarea = within(dialog).getByRole('textbox', {
        name: /Mermaid\.js Code/i,
      });
      fireEvent.change(mermaidTextarea, {
        target: { value: 'flowchart TD\n   %% comments only' },
      });

      fireEvent.click(
        within(dialog).getByRole('button', { name: /Sync to Canvas/i })
      );
      expect(within(dialog).getByRole('alert')).toHaveTextContent(
        /Could not parse Mermaid code/i
      );
    });

    it('supports clearing note body and falls back to simulated voice dictation when SpeechRecognition errors', () => {
      // Mock SpeechRecognition that immediately emits a 'network' error before any speech is recognized
      class MockFailingSpeechRecognition {
        lang = 'en-US';
        continuous = false;
        interimResults = false;
        onresult: ((e: unknown) => void) | null = null;
        onerror: ((e: { error: string }) => void) | null = null;
        onend: (() => void) | null = null;
        start() {
          if (this.onerror) {
            this.onerror({ error: 'network' });
          }
        }
        stop() {
          if (this.onend) {
            this.onend();
          }
        }
      }
      (
        window as unknown as { SpeechRecognition: unknown }
      ).SpeechRecognition = MockFailingSpeechRecognition;

      render(<App />);
      fireEvent.click(screen.getByRole('tab', { name: /Notes/i }));

      // Clear current note body
      const clearNoteBtn = screen.getByRole('button', {
        name: /Clear Note Text/i,
      });
      fireEvent.click(clearNoteBtn);

      const editor = screen.getByLabelText(/Note Body/i) as HTMLTextAreaElement;
      expect(editor.value).toBe('');

      // Click Dictate — MockFailingSpeechRecognition triggers onerror('network'), which falls back to simulated phrase
      fireEvent.click(
        screen.getByRole('button', { name: /Start voice dictation/i })
      );
      expect(editor.value).toContain('[Voice Dictation Sample]:');

      delete (window as unknown as { SpeechRecognition?: unknown })
        .SpeechRecognition;
    });

    it('supports cursor-aware dictation/timestamp insertion, Undo/Redo stack, Markdown formatting, interactive task checklists, note search, pinning, tags, and Local STT engine config', () => {
      render(<App />);
      fireEvent.click(screen.getByRole('tab', { name: /Notes/i }));

      // Create a new blank note
      fireEvent.click(screen.getByRole('button', { name: /New Note/i }));
      const editor = screen.getByLabelText(/Note Body/i) as HTMLTextAreaElement;

      // 1. Type initial text and place cursor in the middle ("Hello World" -> cursor at index 5)
      fireEvent.change(editor, { target: { value: 'Hello World' } });
      editor.focus();
      editor.setSelectionRange(5, 5);
      fireEvent.select(editor);

      // Trigger voice dictation fallback — should insert right at cursor (between "Hello" and "World")
      fireEvent.click(
        screen.getByRole('button', { name: /Start voice dictation/i })
      );
      expect(editor.value).toMatch(/^Hello[\s\S]*\[Voice Dictation Sample\]:[\s\S]*World$/);

      // 2. Test Undo & Redo history stack
      const undoBtn = screen.getByRole('button', { name: /Undo Note Edit/i });
      const redoBtn = screen.getByRole('button', { name: /Redo Note Edit/i });
      expect(undoBtn).not.toBeDisabled();
      fireEvent.click(undoBtn);
      expect(editor.value).toBe('Hello World');

      expect(redoBtn).not.toBeDisabled();
      fireEvent.click(redoBtn);
      expect(editor.value).toContain('[Voice Dictation Sample]:');

      // 3. Test Markdown Formatting Toolbar & Interactive Task Checklists (- [ ])
      fireEvent.click(screen.getByRole('button', { name: /Clear Note Text/i }));
      expect(editor.value).toBe('');

      fireEvent.click(
        screen.getByRole('button', { name: /Insert Task Checkbox/i })
      );
      expect(editor.value).toContain('- [ ] Action item');
      expect(screen.getByTestId('note-task-progress')).toHaveTextContent(
        '0/1 tasks'
      );

      // Switch to Split view and toggle the interactive task checkbox in Preview
      fireEvent.click(screen.getByRole('button', { name: /Split/i }));
      const previewPane = screen.getByTestId('note-markdown-preview');
      const checkbox = within(previewPane).getByRole('checkbox', {
        name: /Task: Action item/i,
      });
      expect(checkbox).not.toBeChecked();
      fireEvent.click(checkbox);
      expect(checkbox).toBeChecked();
      expect(editor.value).toContain('- [x] Action item');
      expect(screen.getByTestId('note-task-progress')).toHaveTextContent(
        '1/1 tasks'
      );

      // 4. Test Pinning, Color Tags, Category Tags, and Note Search
      const pinBtn = screen.getByRole('button', { name: /Pin Note/i });
      fireEvent.click(pinBtn);
      expect(
        screen.getByRole('button', { name: /Unpin Note/i })
      ).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /Add Tag/i }));
      const tagInput = screen.getByLabelText(/New Note Tag/i);
      fireEvent.change(tagInput, { target: { value: 'cuda-stt' } });
      fireEvent.submit(tagInput.closest('form')!);
      expect(screen.getByText('#cuda-stt')).toBeInTheDocument();

      // Filter notes by tag "#cuda-stt"
      const noteSearch = screen.getByLabelText(/Search notes/i);
      fireEvent.change(noteSearch, { target: { value: 'cuda-stt' } });
      expect(
        within(document.getElementById('notes-tabs-container')!).getAllByRole(
          'button'
        )
      ).toHaveLength(1);

      // 5. Open Local STT Engine & Microphone Configuration Drawer
      fireEvent.click(
        screen.getByRole('button', {
          name: /Configure Local STT Engine & Microphone/i,
        })
      );
      expect(screen.getByTestId('stt-config-drawer')).toBeInTheDocument();
      const engineSelect = screen.getByLabelText(
        /Local STT Engine Mode/i
      ) as HTMLSelectElement;
      fireEvent.change(engineSelect, { target: { value: 'native-cpu' } });
      expect(engineSelect.value).toBe('native-cpu');

      const modelSelect = screen.getByLabelText(
        /Whisper Model Size/i
      ) as HTMLSelectElement;
      fireEvent.change(modelSelect, { target: { value: 'distil-small.en' } });
      expect(modelSelect.value).toBe('distil-small.en');
      expect(screen.getByTestId('local-stt-engine-badge')).toHaveTextContent(
        'CPU INT8 (distil-small.en)'
      );
    });

    it('preserves existing text on Timestamp click even when all text is selected, renders inline/block Markdown in Split & Preview, expands the on-demand Note Switcher, persists settings across tabs, and keeps dictation active across tabs and collapsed panel', () => {
      // Mock continuous SpeechRecognition so dictation remains active while switching tabs and collapsing panel
      let activeRecognitionInstance: {
        onresult: ((e: unknown) => void) | null;
        onend: (() => void) | null;
      } | null = null;

      class MockContinuousSpeechRecognition {
        lang = 'en-US';
        continuous = true;
        interimResults = true;
        onresult: ((e: unknown) => void) | null = null;
        onerror: ((e: { error: string }) => void) | null = null;
        onend: (() => void) | null = null;
        start() {
          activeRecognitionInstance = this;
        }
        stop() {
          if (this.onend) {
            this.onend();
          }
        }
      }
      (
        window as unknown as { SpeechRecognition: unknown }
      ).SpeechRecognition = MockContinuousSpeechRecognition;

      render(<App />);
      fireEvent.click(screen.getByRole('tab', { name: /Notes/i }));

      // 1. Expand On-Demand Note Switcher and switch to a newly created note (Item 6)
      fireEvent.click(screen.getByRole('button', { name: /New Note/i }));
      const toggleSwitcherBtn = screen.getByTestId('toggle-note-switcher-btn');
      fireEvent.click(toggleSwitcherBtn);
      const switcherDrawer = screen.getByTestId('expandable-note-switcher');
      expect(switcherDrawer).toBeInTheDocument();
      expect(switcherDrawer).toHaveTextContent(/All Notes/i);

      // Click first note card in the expandable switcher, then switch back to Quick Note 3
      const noteCards = within(switcherDrawer).getAllByTestId(
        /^note-switcher-card-/
      );
      expect(noteCards.length).toBeGreaterThanOrEqual(3);
      fireEvent.click(noteCards[0]);
      fireEvent.click(noteCards[noteCards.length - 1]);

      // Collapse switcher
      fireEvent.click(
        within(switcherDrawer).getByRole('button', {
          name: /Collapse Note Switcher/i,
        })
      );
      expect(
        screen.queryByTestId('expandable-note-switcher')
      ).not.toBeInTheDocument();

      // 2. Verify Timestamp button NEVER clears text even if all text is selected (Item 3)
      const editor = screen.getByLabelText(/Note Body/i) as HTMLTextAreaElement;
      fireEvent.change(editor, {
        target: {
          value: 'Initial **important** note with `code` and *emphasis*',
          selectionStart: 53,
        },
      });
      // Simulate user or browser selecting all text in the textarea
      editor.setSelectionRange(0, editor.value.length);
      fireEvent.select(editor);

      fireEvent.click(
        screen.getByRole('button', { name: /Insert Timestamp/i })
      );
      // Must preserve 100% of existing text and append the timestamp at the last added position
      expect(editor.value).toContain(
        'Initial **important** note with `code` and *emphasis*'
      );
      expect(editor.value).toMatch(/\[\d{1,2}:\d{2}.*\]/);

      // 3. Verify Split & Preview modes visibly render inline bold, italic, code, and timestamp badge (Item 4)
      fireEvent.click(screen.getByRole('button', { name: /Split/i }));
      const previewPane = screen.getByTestId('note-markdown-preview');
      expect(previewPane.querySelector('strong')).toHaveTextContent(
        'important'
      );
      expect(previewPane.querySelector('code')).toHaveTextContent('code');
      expect(previewPane.querySelector('em')).toHaveTextContent('emphasis');
      expect(
        within(previewPane).getByTestId('note-timestamp-badge')
      ).toBeInTheDocument();

      // 4. Configure STT settings and verify they persist when switching tabs (Item 5)
      fireEvent.click(
        screen.getByRole('button', {
          name: /Configure Local STT Engine & Microphone/i,
        })
      );
      const engineSelect = screen.getByLabelText(
        /Local STT Engine Mode/i
      ) as HTMLSelectElement;
      fireEvent.change(engineSelect, { target: { value: 'native-cpu' } });
      const modelSelect = screen.getByLabelText(
        /Whisper Model Size/i
      ) as HTMLSelectElement;
      fireEvent.change(modelSelect, { target: { value: 'distil-medium.en' } });

      // Start voice dictation on Notes tab (Item 2)
      fireEvent.click(
        screen.getByRole('button', { name: /Start voice dictation/i })
      );
      expect(
        screen.getByTestId('header-dictating-indicator')
      ).toBeInTheDocument();

      // Switch to Flow tab AND collapse the side panel while dictation continues!
      fireEvent.click(screen.getByRole('tab', { name: /Flow/i }));
      expect(
        screen.getByTestId('header-dictating-indicator')
      ).toBeInTheDocument();

      fireEvent.click(
        screen.getByRole('button', { name: /Hide to System Tray/i })
      );
      expect(
        screen.getByTestId('collapsed-dictation-indicator')
      ).toBeInTheDocument();

      // Emit speech recognition result while on Flow tab with panel collapsed
      expect(activeRecognitionInstance).not.toBeNull();
      act(() => {
        activeRecognitionInstance?.onresult?.({
          resultIndex: 0,
          results: {
            length: 1,
            0: {
              isFinal: true,
              0: { transcript: 'dictated while panel collapsed' },
            },
          },
        });
      });

      // Re-open panel and switch back to Notes tab — settings (Split view, native-cpu engine, distil-medium.en) and dictated text are preserved!
      fireEvent.click(screen.getByTestId('edge-peek-handle'));
      fireEvent.click(screen.getByRole('tab', { name: /Notes/i }));

      expect(
        (screen.getByLabelText(/Note Body/i) as HTMLTextAreaElement).value
      ).toContain('dictated while panel collapsed');
      expect(
        screen.getByRole('button', { name: /Split/i })
      ).toHaveAttribute('aria-pressed', 'true');
      expect(
        (
          screen.getByLabelText(
            /Local STT Engine Mode/i
          ) as HTMLSelectElement
        ).value
      ).toBe('native-cpu');
      expect(
        (
          screen.getByLabelText(
            /Whisper Model Size/i
          ) as HTMLSelectElement
        ).value
      ).toBe('distil-medium.en');

      delete (window as unknown as { SpeechRecognition?: unknown })
        .SpeechRecognition;
    });
  });

  describe('ObjectDock Feature Suite (Lock Icons, Reordering, Open-With File Drop, Folder Drawers, Edge & Physics)', () => {
    it('toggles Lock Icons mode and reorders app tiles and drawer categories via drag-and-drop', () => {
      render(<App />);

      // Verify Lock Icons toggle button works
      const lockBtn = screen.getByRole('button', {
        name: /Lock icon dragging/i,
      });
      expect(lockBtn).toHaveAttribute('aria-pressed', 'false');

      // Reorder apps inside Development & Code drawer: drag 'app-4' (Docker Engine) onto 'app-1' (VS Code)
      const vscodeTile = screen.getByTestId('app-tile-app-1');

      fireEvent.drop(vscodeTile, {
        dataTransfer: {
          files: [],
          getData: (type: string) =>
            type === 'application/x-sideflow-app'
              ? JSON.stringify({
                  sourceDrawerId: 'drawer-dev',
                  appId: 'app-4',
                })
              : '',
        },
      });

      const devDrawer = screen.getByTestId('drawer-card-drawer-dev');
      const tilesInDev = within(devDrawer).getAllByTestId(/^app-tile-/);
      expect(tilesInDev[0]).toHaveAttribute('data-testid', 'app-tile-app-4');
      expect(tilesInDev[1]).toHaveAttribute('data-testid', 'app-tile-app-1');

      // Lock icons and verify tile dragging is disabled
      fireEvent.click(lockBtn);
      expect(lockBtn).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByTestId('app-tile-app-4')).toHaveAttribute(
        'draggable',
        'false'
      );
    });

    it('launches target application with dropped file path ("Open With" file drop onto app tile)', async () => {
      const launchMock = vi.fn().mockResolvedValue({ success: true });
      window.sideflow = {
        isElectron: true,
        launchNativeApp: launchMock,
      } as unknown as typeof window.sideflow;

      render(<App />);

      const vscodeTile = screen.getByTestId('app-tile-app-1');
      const droppedDoc = new File(['# Architecture'], 'architecture.md', {
        type: 'text/markdown',
      });

      fireEvent.drop(vscodeTile, {
        dataTransfer: {
          files: [droppedDoc],
          getData: () => '',
        },
      });

      expect(
        await screen.findByText(/Opening architecture\.md with VS Code/i)
      ).toBeInTheDocument();
      expect(launchMock).toHaveBeenCalledWith('vscode://', [
        'C:\\Users\\Local\\Desktop\\architecture.md',
      ]);
    });

    it('creates a Live Folder-View drawer synced to an OS folder, cycles sort modes, and supports custom icon URLs', async () => {
      render(<App />);

      // Create a Live Folder-View Drawer
      fireEvent.click(screen.getByRole('button', { name: /New Drawer/i }));
      fireEvent.change(screen.getByLabelText(/Drawer Title/i), {
        target: { value: 'Quick Scripts Folder' },
      });
      fireEvent.change(screen.getByLabelText(/Live Folder Path/i), {
        target: { value: 'C:\\Users\\Dev\\Scripts' },
      });
      fireEvent.click(screen.getByRole('button', { name: /Create Drawer/i }));

      expect(
        await screen.findByText(/Created Drawer "Quick Scripts Folder"/i)
      ).toBeInTheDocument();

      // Cycle sort mode on Development & Code drawer (Manual -> Name -> Type)
      const sortBtn = screen.getByRole('button', {
        name: /Sort Development & Code drawer/i,
      });
      expect(sortBtn).toHaveTextContent(/manual/i);
      fireEvent.click(sortBtn);
      expect(sortBtn).toHaveTextContent(/name/i);
      fireEvent.click(sortBtn);
      expect(sortBtn).toHaveTextContent(/type/i);

      // Add an app with a Custom Icon URL
      fireEvent.click(screen.getByRole('button', { name: /Add App/i }));
      fireEvent.change(screen.getByLabelText(/Application Name/i), {
        target: { value: 'Custom Icon Tool' },
      });
      fireEvent.change(
        screen.getByLabelText(/Executable Path \/ Custom URI Protocol \/ URL/i),
        {
          target: { value: 'C:\\Tools\\custom.exe' },
        }
      );
      fireEvent.change(
        screen.getByLabelText(/Custom Icon URL or Data URI/i),
        {
          target: { value: 'https://example.com/custom-icon.png' },
        }
      );
      fireEvent.click(screen.getByRole('button', { name: /Add to Drawer/i }));

      expect(screen.getByText('Custom Icon Tool')).toBeInTheDocument();
      expect(
        screen.getByAltText('Custom Icon Tool icon')
      ).toHaveAttribute('src', 'https://example.com/custom-icon.png');
    });

    it('configures Screen Edge Placement (Left/Right), Hover Animation Physics, and Tile Size in SettingsView', () => {
      render(<App />);
      fireEvent.click(
        screen.getByRole('tab', { name: /Shortcut & Tray Settings/i })
      );

      // Switch Screen Edge Placement to Left Edge
      fireEvent.change(screen.getByLabelText(/Screen Edge Placement/i), {
        target: { value: 'left' },
      });
      const sidePanel = screen.getByTestId('side-panel');
      expect(sidePanel.className).toContain('left-0');

      // When closing panel on Left Edge, it translates with -translate-x-full
      fireEvent.click(
        screen.getByRole('button', { name: /Hide to System Tray/i })
      );
      expect(sidePanel.className).toContain('-translate-x-full');

      // Re-open via Left Edge peek handle
      fireEvent.click(screen.getByTestId('edge-peek-handle'));
      expect(sidePanel.className).toContain('translate-x-0');

      // Select Swing hover animation and Large tile size
      fireEvent.change(screen.getByLabelText(/Dock Hover Effect/i), {
        target: { value: 'swing' },
      });
      fireEvent.change(screen.getByLabelText(/Dock Tile Size/i), {
        target: { value: 'large' },
      });

      // Switch back to Dock tab and verify classes on tiles
      fireEvent.click(screen.getByRole('tab', { name: /Dock/i }));
      const vscodeTile = screen.getByTestId('app-tile-app-1');
      expect(vscodeTile.className).toContain('dock-effect-swing');
    });

    it('renders ObjectDock Docklets Bar (System Meter, Recycle Bin drop-to-delete, Clock, Downloads), live running-process indicators, and Alt+1..9 quick-launch hotkeys', async () => {
      render(<App />);

      // 1. Verify ObjectDock Mini Docklets bar is visible and interactive
      expect(
        screen.getByTestId('objectdock-docklets-bar')
      ).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('docklet-sys-meter'));
      expect(
        await screen.findByText(/System Load: CPU/i)
      ).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('docklet-clock'));
      expect(
        await screen.findByText(/Copied System Timestamp/i)
      ).toBeInTheDocument();

      // 2. Verify live running-process indicator on VS Code (app-1) and hotkey badge Alt+1
      expect(
        screen.getByTestId('running-indicator-app-1')
      ).toBeInTheDocument();
      expect(screen.getByTestId('hotkey-badge-app-1')).toHaveTextContent(
        'Alt+1'
      );

      // GitHub Desktop (app-2) is not running initially; pressing Alt+2 launches it and lights up its running indicator
      expect(
        screen.queryByTestId('running-indicator-app-2')
      ).not.toBeInTheDocument();
      fireEvent.keyDown(window, {
        key: '2',
        code: 'Digit2',
        altKey: true,
      });
      expect(
        await screen.findByText(/Launching GitHub Desktop/i)
      ).toBeInTheDocument();
      expect(
        screen.getByTestId('running-indicator-app-2')
      ).toBeInTheDocument();

      // 3. Drag & drop an app tile ('app-3' Localhost:3000) onto the Recycle Bin Docklet to delete it
      const recycleBinDocklet = screen.getByTestId('docklet-recycle-bin');
      fireEvent.drop(recycleBinDocklet, {
        dataTransfer: {
          getData: (type: string) =>
            type === 'application/x-sideflow-app'
              ? JSON.stringify({
                  sourceDrawerId: 'drawer-dev',
                  appId: 'app-3',
                })
              : '',
        },
      });
      expect(
        await screen.findByText(/Moved "Localhost:3000" to Recycle Bin/i)
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId('app-tile-app-3')
      ).not.toBeInTheDocument();

      // 4. Toggle ObjectDock Docklets bar visibility
      const toggleDockletsBtn = screen.getByRole('button', {
        name: /Toggle ObjectDock Docklets/i,
      });
      fireEvent.click(toggleDockletsBtn);
      expect(
        screen.queryByTestId('objectdock-docklets-bar')
      ).not.toBeInTheDocument();
    });

    it('supports Taskbar & Start Menu shortcut drag-and-drop with icon image population, clicking Edit on a dock item, Drawer deletion confirmation prompt, and Collapse All / Expand All drawers', async () => {
      const launchMock = vi.fn().mockResolvedValue({ success: true });
      window.sideflow = {
        isElectron: true,
        launchNativeApp: launchMock,
      } as unknown as typeof window.sideflow;

      render(<App />);

      // 1. Item 1: Drag a Start Menu / Taskbar shortcut (.lnk) onto Development & Code drawer and verify shortcut + icon image population
      const devDrawerCard = screen.getByTestId('drawer-card-drawer-dev');
      fireEvent.drop(devDrawerCard, {
        dataTransfer: {
          files: [],
          getData: (type: string) =>
            type === 'text/uri-list'
              ? 'file:///C:/Users/Dev/AppData/Roaming/Microsoft/Internet%20Explorer/Quick%20Launch/User%20Pinned/TaskBar/Brave%20Browser.lnk'
              : '',
        },
      });

      expect(screen.getByText('Brave Browser')).toBeInTheDocument();
      const braveImg = screen.getByAltText('Brave Browser icon');
      expect(braveImg).toBeInTheDocument();
      expect(braveImg.getAttribute('src')).toMatch(/^data:image\//);

      // 2. Item 2: Click the Edit button on a dock item (VS Code 'app-1') — must open Edit modal and NOT launch the app
      const editVscodeBtn = screen.getByTestId('edit-app-btn-app-1');
      fireEvent.mouseDown(editVscodeBtn);
      fireEvent.click(editVscodeBtn);

      expect(launchMock).not.toHaveBeenCalled();
      const editDialog = screen.getByRole('dialog', {
        name: /Edit Application in Dock Drawer/i,
      });
      expect(editDialog).toBeInTheDocument();

      // Click "Auto Icon" inside the Edit modal to populate the application's image
      fireEvent.click(within(editDialog).getByTestId('populate-app-icon-btn'));
      const customIconInput = within(editDialog).getByLabelText(
        /Custom Icon URL or Data URI/i
      ) as HTMLInputElement;
      expect(customIconInput.value).toMatch(/^data:image\//);

      // Rename VS Code to "VS Code Insiders" and save
      const nameInput = within(editDialog).getByLabelText(/Application Name/i);
      fireEvent.change(nameInput, { target: { value: 'VS Code Insiders' } });
      fireEvent.click(
        within(editDialog).getByRole('button', { name: /Save Changes/i })
      );
      expect(screen.getByText('VS Code Insiders')).toBeInTheDocument();
      expect(screen.getByAltText('VS Code Insiders icon')).toBeInTheDocument();

      // 3. Item 4: Click Collapse All button and verify all drawers collapse, then click Expand All
      const collapseAllBtn = screen.getByTestId('collapse-all-drawers-btn');
      expect(collapseAllBtn).toHaveTextContent(/Collapse All/i);
      fireEvent.click(collapseAllBtn);

      expect(collapseAllBtn).toHaveTextContent(/Expand All/i);
      expect(screen.queryByText('VS Code Insiders')).not.toBeInTheDocument();

      // Expand All back
      fireEvent.click(collapseAllBtn);
      expect(collapseAllBtn).toHaveTextContent(/Collapse All/i);
      expect(screen.getByText('VS Code Insiders')).toBeInTheDocument();

      // 4. Item 3: Click Delete on "Diagramming & Creative" drawer -> Confirmation Prompt appears -> Cancel keeps it -> Confirm deletes it
      const deleteDesignBtn = screen.getByRole('button', {
        name: /Delete Diagramming & Creative/i,
      });
      fireEvent.click(deleteDesignBtn);

      const confirmModal = screen.getByTestId('confirm-delete-drawer-modal');
      expect(confirmModal).toBeInTheDocument();
      expect(confirmModal).toHaveTextContent(/Diagramming & Creative/i);

      // Cancel first — drawer must remain
      fireEvent.click(screen.getByTestId('cancel-delete-drawer-btn'));
      expect(
        screen.queryByTestId('confirm-delete-drawer-modal')
      ).not.toBeInTheDocument();
      expect(
        screen.getByTestId('drawer-card-drawer-design')
      ).toBeInTheDocument();

      // Now click Delete again and confirm deletion
      fireEvent.click(deleteDesignBtn);
      fireEvent.click(screen.getByTestId('confirm-delete-drawer-btn'));
      expect(
        screen.queryByTestId('drawer-card-drawer-design')
      ).not.toBeInTheDocument();
    });

    it('configures Screen Presence (extended panel width percentage) via Settings controls, interactive resize handle drag on right/left edges, keyboard arrows, double-click reset, backup import/reset, and Electron IPC', async () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1000,
      });

      const setPanelWidthPercentMock = vi.fn();
      window.sideflow = {
        isElectron: false,
        setPanelWidthPercent: setPanelWidthPercentMock,
      } as unknown as typeof window.sideflow;

      render(<App />);

      const sidePanel = screen.getByTestId('side-panel');
      const resizeHandle = screen.getByTestId('panel-resize-handle');

      // Default Screen Presence is 35%
      expect(sidePanel).toHaveAttribute('data-width-percent', '35');
      expect(sidePanel.style.width).toBe('35%');
      expect(setPanelWidthPercentMock).toHaveBeenCalledWith(35);

      // Navigate to Settings tab
      fireEvent.click(
        screen.getByRole('tab', { name: /Shortcut & Tray Settings/i })
      );

      const badge = screen.getByTestId('panel-width-percent-badge');
      const slider = screen.getByTestId(
        'setting-panel-width-slider'
      ) as HTMLInputElement;
      const numberInput = screen.getByTestId(
        'setting-panel-width-number'
      ) as HTMLInputElement;

      expect(badge).toHaveTextContent('35%');
      expect(slider.value).toBe('35');
      expect(numberInput.value).toBe('35');

      // 1. Update via range slider -> 48%
      fireEvent.change(slider, { target: { value: '48' } });
      expect(badge).toHaveTextContent('48%');
      expect(sidePanel).toHaveAttribute('data-width-percent', '48');
      expect(sidePanel.style.width).toBe('48%');
      expect(window.localStorage.getItem('sideflow_panel_width_percent')).toBe(
        '48'
      );
      expect(setPanelWidthPercentMock).toHaveBeenLastCalledWith(48);

      // 2. Update via numeric input -> 62% (and test clamping above 90%)
      fireEvent.change(numberInput, { target: { value: '62' } });
      expect(badge).toHaveTextContent('62%');
      expect(sidePanel.style.width).toBe('62%');

      fireEvent.change(numberInput, { target: { value: '99' } });
      expect(badge).toHaveTextContent('90%');
      expect(sidePanel.style.width).toBe('90%');

      // 3. Click Quick Preset buttons (25%, 50%, 75%)
      fireEvent.click(screen.getByTestId('panel-width-preset-25'));
      expect(sidePanel).toHaveAttribute('data-width-percent', '25');
      expect(sidePanel.style.width).toBe('25%');

      fireEvent.click(screen.getByTestId('panel-width-preset-50'));
      expect(sidePanel).toHaveAttribute('data-width-percent', '50');
      expect(sidePanel.style.width).toBe('50%');

      fireEvent.click(screen.getByTestId('panel-width-preset-75'));
      expect(sidePanel).toHaveAttribute('data-width-percent', '75');
      expect(sidePanel.style.width).toBe('75%');
      expect(window.localStorage.getItem('sideflow_panel_width_percent')).toBe(
        '75'
      );

      // 4. Double-click the resize handle to reset back to default 35%
      fireEvent.doubleClick(resizeHandle);
      expect(sidePanel).toHaveAttribute('data-width-percent', '35');
      expect(sidePanel.style.width).toBe('35%');
      expect(badge).toHaveTextContent('35%');

      // 5. On-the-fly drag resizing on Right Edge (dragging left from 650px to 400px on 1000px viewport -> +25% => 60%)
      fireEvent.mouseDown(resizeHandle, { clientX: 650 });
      expect(screen.getByTestId('panel-resize-hud')).toBeInTheDocument();
      fireEvent.mouseMove(window, { clientX: 400 });
      expect(sidePanel).toHaveAttribute('data-width-percent', '60');
      expect(sidePanel.style.width).toBe('60%');
      fireEvent.mouseUp(window);
      expect(screen.queryByTestId('panel-resize-hud')).not.toBeInTheDocument();
      expect(window.localStorage.getItem('sideflow_panel_width_percent')).toBe(
        '60'
      );
      expect(setPanelWidthPercentMock).toHaveBeenLastCalledWith(60);

      // 6. Switch to Left Edge and drag resize (dragging left from 600px to 450px on 1000px viewport -> -15% => 45%)
      fireEvent.change(screen.getByLabelText(/Screen Edge Placement/i), {
        target: { value: 'left' },
      });
      fireEvent.mouseDown(resizeHandle, { clientX: 600 });
      fireEvent.mouseMove(window, { clientX: 450 });
      fireEvent.mouseUp(window);
      expect(sidePanel).toHaveAttribute('data-width-percent', '45');
      expect(sidePanel.style.width).toBe('45%');

      // 7. Keyboard arrow resizing on Left Edge (Shift + ArrowRight increases by 5% -> 50%)
      fireEvent.keyDown(resizeHandle, { key: 'ArrowRight', shiftKey: true });
      expect(sidePanel).toHaveAttribute('data-width-percent', '50');

      // 8. Backup import restores panelWidthPercent (e.g., 65%) and Reset Defaults restores 35%
      const fileInput = screen.getByTestId('import-backup-input');
      const backupFile = new File(
        [JSON.stringify({ version: '1.0.0', panelWidthPercent: 65 })],
        'presence-backup.json',
        { type: 'application/json' }
      );
      fireEvent.change(fileInput, { target: { files: [backupFile] } });
      expect(
        await screen.findByText(/Restored SideFlow Backup/i)
      ).toBeInTheDocument();
      expect(sidePanel).toHaveAttribute('data-width-percent', '65');
      expect(sidePanel.style.width).toBe('65%');
      expect(setPanelWidthPercentMock).toHaveBeenLastCalledWith(65);

      fireEvent.click(screen.getByRole('button', { name: /Reset Defaults/i }));
      expect(sidePanel).toHaveAttribute('data-width-percent', '35');
      expect(sidePanel.style.width).toBe('35%');
      expect(setPanelWidthPercentMock).toHaveBeenLastCalledWith(35);
    });
  });
});
