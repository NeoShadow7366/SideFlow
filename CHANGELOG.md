# Changelog

All notable changes to **SideFlow** (`sideflow-desktop`) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] - 2026-10-28

### Added
- **Global `Ctrl+K` / `Cmd+K` Command Palette (`src/components/CommandPalette.tsx`):** Added an accessible WAI-ARIA 1.2 `combobox` + `listbox` modal palette summonable from anywhere via `Ctrl+K` / `Cmd+K` (auto-opening the panel when retracted) or the Header quick-search trigger (`open-command-palette-btn`). Supports multi-token and subsequence fuzzy filtering, category pills (*All*, *Apps*, *Flows*, *Notes*, *Commands*), and instant execution across Dock Applications (with drawer-sort-aware `Alt+1..9` shortcut badges), Saved Flowchart Diagrams, Notes (`title`, `#tags`, and query-centered body snippets), and Workspace/Settings commands.
- **Interactive Flowchart Minimap Radar (`src/components/Flowchart/FlowMinimap.tsx`):** Added a collapsible bird's-eye SVG radar docked above the canvas HUD (`toggle-flow-minimap-btn`, persisted via `sideflow_flow_minimap`), rendering high-contrast (`>= 3:1` WCAG 1.4.11) subgraph enclosures, connector edges, shape- and color-coded node silhouettes, and a live cyan camera viewport frame with frozen-snapshot click/drag-to-pan and `role="application"` keyboard navigation (`Arrow*`, `Shift+Arrow*`, `Home`, `Escape`).

### Changed
- **Responsive Narrow-Bezel Header (`@container sf-header`) & Popover Stacking:** Added tiered `@container sf-header` breakpoints (`560px`, `520px`, `430px`, `380px`) in `src/index.css` and `src/components/Header.tsx` so the header scales down cleanly to `320px` panel widths with zero horizontal overflow, elevated `flow-canvas-stage` (`z-40`) while dimming `FlowMinimap` when node/edge popovers open, isolated `flowDiagramSyncEpoch` so `<NotesView>` preserves active editor state on diagram switches, and suppressed background `DockView` app hotkeys whenever any `<Modal>` is open.

### Security
- **Command Palette Icon Scheme & Diagram Storage Validation:** Enforced `isSafeCustomIconUrl` URI scheme allowlisting (`https:`, `http:`, and raster `data:image/*` types, rejecting `data:image/svg+xml`, `javascript:`, and `file:`) and structural schema validation (`readSavedDiagramsSnapshot`) before rendering saved flowchart entries in `CommandPalette`.

## [1.2.1] - 2026-10-26

### Changed
- **Panel-Intrinsic Container Queries for Notes & Flowchart Status:** Replaced remaining viewport `sm:` responsive utilities inside resizable side-panel views with `@container sf-panel` rules (`.cq-note-prose`, `.cq-note-search`, and `.cq-flow-status` in `src/index.css`) so typography, note search width, and flowchart status truncation adapt directly to the panel's actual width.
- **WCAG 2.2 AA 2.5.8 Minimum Hit Targets & Subgraph Keyboard Rename:** Enforced `24×24px` minimum interactive target dimensions on flowchart connector `+` label badges, flow direction pills, and note tag removal buttons, and converted subgraph headers into keyboard-accessible buttons supporting `F2` inline rename with focus restoration on `Enter` / `Escape`.

### Fixed
- **Cursor Offset Restoration on Note Clear `[Undo]`:** Restored `lastInsertPosMapRef` cursor insertion offset to the recovered note length when clicking `[Undo]` after **Clear Note**, ensuring subsequent voice dictation or timestamp insertions append at the end rather than index `0`.

### Security
- **Sandboxed SVG Image Rendering in Notes Preview:** Replaced inline `dangerouslySetInnerHTML` SVG injection in `NotesView` Markdown preview with encoded `data:image/svg+xml` `<img>` rendering (eliminating all `dangerouslySetInnerHTML` sinks across `src/`).

## [1.2.0] - 2026-10-26

### Added
- **Multi-Monitor Display & Screen Routing:** Added four configurable display routing modes (`primary`, `single`, `all`, and `custom` multi-monitor subsets) persisted under `sideflow_monitor_settings` and included in portable JSON workspace backups and resets.
- **Follow-Mouse Shortcut Summoning:** In `all` and `custom` multi-monitor modes, pressing the global shortcut (`Alt + Space` by default) automatically opens or moves the SideFlow panel onto the enabled monitor currently holding the OS mouse cursor.
- **Per-Monitor Bezel Edge Overrides & Outer-Bezel Preset:** Added per-display `Default`, `Left`, and `Right` screen-edge overrides (`edgeOverrides`), interactive 16:10 monitor bezel cards with resolution/DPI badges, one-click **Move Here** / **Use Screen** actions, and a quick **Use Outer Bezels** preset for dual/multi-screen workstations.
- **Native Companion Edge-Tab Windows:** Added lightweight, frameless, non-focus-stealing `40×96px` companion edge-tab windows (`electron/edge-tab.html`, `electron/edge-tab.js`) on secondary enabled monitors with dynamic click-through forwarding, shortcut tooltips, and live voice-dictation status indicators.
- **System Tray Monitor Switcher:** Added a **Monitor Display** submenu to the native OS System Tray context menu for quick switching between *Primary Monitor Only*, *All Monitors (Open at Mouse Cursor)*, individual connected displays, and custom monitor subsets.
- **Web Multi-Monitor Simulation Bar:** Added an interactive multi-monitor cursor and companion edge-tab bar in browser Desktop Simulation Mode when multiple displays and non-primary routing are active.
- **Multi-Monitor IPC & Display Hot-Plug Sync:** Added `get-display-state`, `set-monitor-settings`, `activate-display`, `display-state-changed`, `set-edge-handle-state`, `prepare-edge-tab-click`, `edge-tab-clicked`, `set-companion-ignore-mouse`, and `edge-tab-update` IPC channels, plus automatic topology reconciliation across `display-added`, `display-removed`, `display-metrics-changed`, and transient zero-display sleep/KVM/RDP transitions.
- **Accessible Modal Architecture & WCAG 2.2 AA Compliance:** Added reusable accessible `<Modal>` (`dialog` and `alertdialog` roles with `aria-modal`, automatic initial focus / `initialFocusRef`, circular `Tab` / `Shift+Tab` focus trapping, `Escape` layered dismissal, and opener focus restoration), un-nested primary launch buttons in `AppTile`, and WCAG 2.5.3 Label-in-Name compliance across header tabs and controls.
- **6-Second `[Undo]` Recovery & Destructive Action Guards:** Added non-blocking 6-second `[Undo]` toast recovery when removing dock apps, clearing or deleting notes, and clearing flowchart canvases, plus a confirmation `alertdialog` (with one-click **Export Backup First**) before **Reset Defaults**.
- **Power-User Keyboard Shortcuts & Settings Category Filters:** Added `Ctrl+1..4` quick tab switching, `Ctrl+F` context-aware search focus in Dock and Notes, `Alt+Enter` / `Ctrl+Enter` branch node spawning in `FlowCanvas` (eliminating `Tab` focus traps), Settings category filter pills (*All*, *Shortcuts*, *Monitors*, *Dock Style*, *Updates & Data*), and active-note targeting when exporting Mermaid blocks **To Note**.

### Changed
- **Cross-DPI Window Positioning & Panel Resizing:** Updated main window bounds placement (`setWindowBoundsCrossDpiSafe`) and interactive panel width drag/keyboard resizing to compute geometry relative to the active monitor's work area and effective per-monitor bezel edge.
- **Packaged Asset Path Resolution:** Prioritized unpacked `process.resourcesPath` assets (`electron/icon.png`, `electron/edge-tab.html`, `electron/stt_worker.py`) when running in packaged ASAR builds so external Python STT worker spawning and companion windows resolve reliably.

### Security
- **Renderer Sandbox, IPC Sender & Markdown Link Hardening:** Enabled `sandbox: true` on `mainWindow` and companion edge-tab `BrowserWindow` instances, restricted automatic `media` (microphone) permission grants strictly to `mainWindow.webContents`, enforced `isMainSender` and `isCompanionSender` verification across IPC handlers, sanitized `edgeOverrides` keys against prototype pollution, and restricted rendered Markdown links in Notes preview to safe URI schemes (`https://`, `http://`, `mailto:`).

## [1.1.0] - 2026-10-16

### Added
- **Local & Hybrid Speech-to-Text Engines:** Added offline local speech recognition via Python `faster-whisper` (`electron/stt_worker.py` with CUDA GPU and CPU `int8` support), in-browser WebGPU Whisper/Moonshine (`@huggingface/transformers`), and Windows SAPI fallback alongside Web Speech API dictation, plus a live pulsing dictation badge on the collapsed screen-edge handle.
- **GitHub Auto-Updater & Login Startup Toggle:** Integrated `electron-updater` for automatic background GitHub Release checks, download progress reporting, one-click **Restart & Install Update**, and **Start SideFlow at Login** (`sideflow_open_at_login`) controls in Settings and the System Tray menu.
- **Folder-Synced Drawers, Native Icons & Per-App Hotkeys:** Added live OS directory-backed drawers (`folderPath`), `.lnk`/executable shortcut resolution and native icon extraction, drawer sort modes (`manual`, `name`, `type`), configurable dock hover effects (`zoom`, `swing`, `glow`, `none`), icon sizes (`compact`, `normal`, `large`), icon lock protection, live CPU/RAM metrics, and per-tile launch hotkeys.
- **Expanded Mermaid Diagram Types & Shapes:** Added bi-directional support for `flowchart`, `stateDiagram-v2`, `sequenceDiagram`, `classDiagram`, and `erDiagram` diagrams, six additional flowchart node shapes (`database`, `subroutine`, `io`, `circle`, `hexagon`, `asymmetric`), subgraphs, layout directions (`TD`, `BT`, `LR`, `RL`), and edge routing curves (`bezier`, `orthogonal`, `straight`).
- **Left / Right Panel Edge & Custom Width:** Added configurable Left/Right screen-edge docking (`sideflow_panel_edge`) and customizable extended panel width (`15%`–`90%` of work area, `sideflow_panel_width_percent`) with Settings presets/slider and an interactive drag/keyboard resize handle.
- **Enhanced Notes & Workspace Import:** Added note pinning, accent colors, and tags in the Voice-Dictated Scratchpad, plus portable JSON workspace backup import.

## [1.0.0] - 2026-10-15

### Added
- **Core Desktop Slide-Out Utility Panel:** Initial release of SideFlow featuring a frameless, transparent, always-on-top Electron overlay (`skipTaskbar: true`), System Tray menu, configurable global hotkey recorder (`Alt + Space` default), Pin vs. Auto-Hide focus behavior, click-through screen-edge peek handle, and browser Desktop Simulation Mode.
- **ObjectDock Categorized App Drawers:** Collapsible application drawers with spring hover magnification, native OS drag-and-drop file/URL ingestion, native file browser dialog, real-time search & direct launch, and hybrid URL/URI/executable execution.
- **Flowchart Scratchpad with Lucidchart Mermaid Bridge:** Interactive node-and-connector diagramming canvas with bi-directional Mermaid.js synchronization and standalone SVG export.
- **Voice-Dictated Multi-Note Scratchpad:** Multi-note editor with continuous speech-to-text dictation, language selection, one-click timestamps, clipboard copy, and JSON workspace backup/reset.
- **Cross-Platform Build & Test Tooling:** Configured Windows NSIS/Portable and macOS DMG packaging via `electron-builder` with 256×256 application icons, WCAG accessibility support, and automated Vitest + React Testing Library suites.

[1.3.0]: https://github.com/NeoShadow7366/SideFlow/compare/v1.2.1...v1.3.0
[1.2.1]: https://github.com/NeoShadow7366/SideFlow/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/NeoShadow7366/SideFlow/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/NeoShadow7366/SideFlow/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/NeoShadow7366/SideFlow/releases/tag/v1.0.0
