# Changelog

All notable changes to **SideFlow** (`sideflow-desktop`) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.0] - 2026-10-28

### Added
- **Per-Note `Markdown (MD)` ↔ `Jira ADF` Mode Toggle & Bidirectional AST Converter (`src/components/Notes/NotesView.tsx`, `src/utils/adf.ts`):** Added a segmented per-note format switch (`note.format: 'markdown' | 'adf'`, `note.adfDoc?: AdfDocNode`) with full Atlassian Document Format Schema v1 (`version: 1`, `type: 'doc'`) AST support, `NoteHistorySnapshot`-backed undo/redo (`Ctrl+Z` / `Ctrl+Y`) across format switches, contextual view modes (`Edit | Split | Preview` in Markdown mode vs. `Visual | Split | ADF JSON` with live ADF Schema v1 validation and `Prettify` in Jira ADF mode), and lossless-first `markdownToAdf` ↔ `adfToMarkdown` conversion across headings (`H1`–`H6`), inline marks (`bold`, `italic`, `underline`, `strike`, `code`, `sub`/`sup`), links, smart cards, `[STATUS: LABEL | color]` lozenges, `@mentions`, `:emoji:`, dates, nested bullet/ordered lists, `- [ ]` / `- [x]` action checklists (`taskList`/`taskItem`), `<>` decisions (`decisionList`/`decisionItem`), blockquotes, `> [!INFO|NOTE|SUCCESS|WARNING|ERROR]` panels, fenced code blocks (including `mermaid`), Markdown tables with escaped pipes, `<details>` ↔ `expand`, and `---` dividers.
- **WYSIWYG Jira Cloud Description Editor & `/` Slash Command Menu (`src/components/Notes/JiraAdfEditor.tsx`, `src/components/Notes/JiraSlashMenu.tsx`, `src/utils/adfDom.ts`):** Added a sticky Jira Cloud-parity formatting toolbar (text styles `Normal text`/`H1`–`H6`/`Blockquote`, inline marks with ADF v1 mark-exclusion rules, Jira text & highlight color palettes with light-pastel luminance contrast guards, mutually exclusive `Left`/`Center`/`Right` alignment & `1..6` indentation, bullet/numbered/action `[]`/decision `<>` lists, `Link` / `inlineCard` Smart Card, `@Mention`, `Emoji`, `Status` lozenge, `Table`, `Code snippet`, `Panel`, and `+ Insert` menu), an interactive keyboard-navigable `/` Slash Command menu (30+ Jira blocks & inline widgets), live Markdown-style auto-formatting shortcuts (`# `, `- `, `1. `, `[] `, `<> `, `> `, `---`, ```` ```lang ````), and interactive Jira blocks/pills including inline table controls (header row toggle, `#` numbered column, add/remove row/col, cell background tinting), `info`/`note`/`success`/`warning`/`error` panels, collapsible `expand` blocks, content-preserving 2-column & 3-column `layoutSection` grids, click-to-edit 6-color `status` lozenges, `date` chips, `@mention` pills, `emoji` nodes, `inlineCard` smart links, and live Mermaid `codeBlock` SVG previews with one-click Flowchart opening.
- **Jira Cloud Clipboard Bridge & `.adf.json` Export (`src/utils/adf.ts`, `src/components/Notes/NotesView.tsx`, `src/test/JiraAdfNotes.test.tsx`):** Added **Copy for Jira** (`adfToJiraHtml` writing semantic ProseMirror-compatible `text/html` + `text/plain` `ClipboardItem` payloads for direct paste into Jira Cloud's browser Description Editor), **Copy ADF JSON**, `.adf.json` / `.md` file exports, and an automated Vitest + React Testing Library suite (`src/test/JiraAdfNotes.test.tsx`).
- **Instant Laptop Voice Dictation Mode, Background Warmup & Live Streaming HUD (`src/components/Notes/VoiceBar.tsx`, `src/components/Notes/NotesView.tsx`, `electron/main.ts`, `electron/preload.ts`):** Added an accessible **Instant Mode** toggle (`#voice-instant-mode-toggle`, `SttSettings.instantMode`, default `true`), `warmup-local-stt` IPC (`window.sideflow.warmupLocalStt`) for eager background engine/GEMM/shader pre-warming on Notes tab open and microphone hover, `550ms` intra-utterance rolling partial previews (`mergeRecentFloat32Chunks`), and a non-destructive floating `LIVE` transcript HUD (`note-live-interim-banner`) above the active Markdown or Jira ADF editor.

### Changed
- **Zero-Disk Persistent Windows SAPI Daemon & Laptop-Smart STT Routing (`electron/main.ts`, `electron/stt_worker.py`, `src/utils/whisperWorker.ts`, `src/utils/localSttEngine.ts`):** Replaced per-phrase temp `.wav` disk writes and cold `powershell.exe` process spawns (`~5.0s` under corporate EDR/Defender) with a persistent zero-disk `System.Speech` `MemoryStream` daemon (`~64ms` per phrase), bypassed integrated laptop iGPU (`Intel UHD`/`Iris Xe`) shader compilation stalls in favor of quantized SIMD WASM via `hasDiscreteWebGpuAdapter()`, serialized ONNX worker inference with a 2-slot `.dispose()`-aware LRU pipeline cache, switched audio capture to 16kHz `AudioWorkletNode` (`32ms` frames) with a zero-React-re-render GPU `scaleY` meter and `380ms` silence VAD + FIFO commit queue, removed dead `import torch` cold-boot overhead in `stt_worker.py`, and stabilized `<NotesView>`'s React `key` in `src/App.tsx` (`stableNotesResetEpochRef`) so toggling dictation never unmounts the editor or clears Undo history.
- **Cross-Tab Dictation, Flowchart Export & Command Palette Parity (`src/components/Notes/VoiceBar.tsx`, `src/App.tsx`, `src/components/CommandPalette.tsx`):** Updated `VoiceBar` and `NotesView` (`speechOriginNoteIdRef`) to stream cursor-aware speech-to-text into active Markdown or Jira ADF blocks (`JiraAdfEditorHandle.insertSnippetAtCursor`), updated Flowchart **"To Note"** export in `App.tsx` to append Mermaid `codeBlock` nodes natively onto ADF-mode notes, and added `Jira ADF` format badges and search keywords in `CommandPalette.tsx`.

### Security
- **ADF Schema v1 Validation, Detached Paste Sanitization & STT Daemon Hardening (`src/utils/adf.ts`, `src/utils/adfDom.ts`, `electron/main.ts`, `electron/stt_worker.py`):** Added detached-`DOMParser` clipboard paste sanitization (`parseClipboardToAdfInline`), strict `validateAndNormalizeAdfDoc` AST hardening (maximum nesting depth guard, `http(s):` / `mailto:` safe URL allowlisting, hex color sanitization, and epoch bounds checks), `adfDoc` schema normalization during JSON workspace backup imports, strict CTranslate2 model ID allowlisting + 2-slot LRU eviction in `stt_worker.py`, and `isMainSender`-guarded `warmup-local-stt` / `transcribe-audio-local` payload bounds with continuous `stderr` pipe draining and timeout process recycling in `electron/main.ts`.

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

[Unreleased]: https://github.com/NeoShadow7366/SideFlow/compare/v1.4.0...HEAD
[1.4.0]: https://github.com/NeoShadow7366/SideFlow/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/NeoShadow7366/SideFlow/compare/v1.2.1...v1.3.0
[1.2.1]: https://github.com/NeoShadow7366/SideFlow/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/NeoShadow7366/SideFlow/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/NeoShadow7366/SideFlow/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/NeoShadow7366/SideFlow/releases/tag/v1.0.0
