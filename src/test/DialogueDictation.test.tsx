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
import {
  adfToJiraHtml,
  adfToMarkdown,
  appendDialogueTurnToAdfDoc,
  createEmptyAdfDoc,
  parseAdfJsonString,
  validateAndNormalizeAdfDoc,
} from '../utils/adf';
import {
  ExternalBleedState,
  getEffectiveExternalRms,
  shouldSuppressPrimaryMicBleed,
  updateExternalBleedState,
} from '../utils/localSttEngine';

describe('Two-Source Dialogue Transcription (ADF Speaker Lozenges, Bleed Suppression & Dual-Stream WebAudio)', () => {
  const originalMediaDevices = navigator.mediaDevices;
  const originalAudioContext = window.AudioContext;

  beforeEach(() => {
    window.localStorage.clear();
    delete window.sideflow;
    delete (window as unknown as { SpeechRecognition?: unknown })
      .SpeechRecognition;
    delete (window as unknown as { webkitSpeechRecognition?: unknown })
      .webkitSpeechRecognition;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete window.sideflow;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      writable: true,
      value: originalMediaDevices,
    });
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      writable: true,
      value: originalAudioContext,
    });
  });

  describe('1. Unit Tests: appendDialogueTurnToAdfDoc (src/utils/adf.ts)', () => {
    it('replaces the initial empty paragraph in an empty ADF doc with a blue YOU status lozenge + text', () => {
      const emptyDoc = createEmptyAdfDoc();
      expect(emptyDoc.content).toEqual([{ type: 'paragraph', content: [] }]);

      const doc1 = appendDialogueTurnToAdfDoc(emptyDoc, 'First phrase.', {
        speakerRole: 'primary',
        speakerLabel: 'You',
      });

      expect(doc1.version).toBe(1);
      expect(doc1.type).toBe('doc');
      expect(doc1.content).toHaveLength(1);

      const firstTurn = doc1.content[0];
      expect(firstTurn.type).toBe('paragraph');
      if (firstTurn.type === 'paragraph') {
        expect(firstTurn.content).toHaveLength(2);
        expect(firstTurn.content?.[0]).toMatchObject({
          type: 'status',
          attrs: {
            text: 'YOU',
            color: 'blue',
          },
        });
        if (firstTurn.content?.[0]?.type === 'status') {
          expect(firstTurn.content[0].attrs.localId).toBeTruthy();
        }
        expect(firstTurn.content?.[1]).toEqual({
          type: 'text',
          text: ' First phrase.',
        });
      }

      const validated = validateAndNormalizeAdfDoc(doc1);
      expect(validated.valid).toBe(true);
    });

    it('appends consecutive same-speaker utterances onto the active turn paragraph with single-space padding and switches to a green EXTERNAL lozenge with [HH:MM] timestamp', () => {
      let doc = createEmptyAdfDoc();

      // 1. Primary speaker turn starts
      doc = appendDialogueTurnToAdfDoc(doc, 'First phrase.', {
        speakerRole: 'primary',
        speakerLabel: 'You',
        appendToActiveTurn: false,
      });

      // 2. Consecutive same-speaker utterance appends to active turn without duplicating lozenge
      doc = appendDialogueTurnToAdfDoc(doc, 'Second phrase.', {
        speakerRole: 'primary',
        speakerLabel: 'You',
        appendToActiveTurn: true,
      });

      expect(doc.content).toHaveLength(1);
      const primaryPara = doc.content[0];
      expect(primaryPara.type).toBe('paragraph');
      if (primaryPara.type === 'paragraph') {
        const statusNodes = (primaryPara.content || []).filter(
          (n) => n.type === 'status'
        );
        expect(statusNodes).toHaveLength(1);
        expect(primaryPara.content?.[1]).toEqual({
          type: 'text',
          text: ' First phrase. Second phrase.',
        });
      }

      // 3. Switch to 'external' speaker with optional [HH:MM] timestamp
      doc = appendDialogueTurnToAdfDoc(
        doc,
        'Confirmed, telemetry looks clean.',
        {
          speakerRole: 'external',
          speakerLabel: 'External',
          appendToActiveTurn: false,
          includeTimestamp: true,
          timestampText: '14:05',
        }
      );

      expect(doc.content).toHaveLength(2);
      const externalPara = doc.content[1];
      expect(externalPara.type).toBe('paragraph');
      if (externalPara.type === 'paragraph') {
        expect(externalPara.content).toHaveLength(2);
        expect(externalPara.content?.[0]).toMatchObject({
          type: 'status',
          attrs: {
            text: 'EXTERNAL',
            color: 'green',
          },
        });
        expect(externalPara.content?.[1]).toEqual({
          type: 'text',
          text: ' [14:05] Confirmed, telemetry looks clean.',
        });
      }

      // 4. Canonical ADF v1 validation, Markdown serialization & Jira HTML serialization
      const validated = validateAndNormalizeAdfDoc(doc);
      expect(validated.valid).toBe(true);
      if (validated.valid) {
        expect(validated.doc.content).toHaveLength(2);
      }

      const md = adfToMarkdown(doc);
      expect(md).toContain(
        '[STATUS: YOU | blue] First phrase. Second phrase.'
      );
      expect(md).toContain(
        '[STATUS: EXTERNAL | green] [14:05] Confirmed, telemetry looks clean.'
      );

      const html = adfToJiraHtml(doc);
      expect(html).toContain('data-node-type="status" data-color="blue"');
      expect(html).toContain('data-node-type="status" data-color="green"');
    });

    it('handles whitespace-only utterances and non-status trailing blocks gracefully without corrupting ADF', () => {
      const emptyDoc = createEmptyAdfDoc();
      // Blank utterance is a no-op
      expect(
        appendDialogueTurnToAdfDoc(emptyDoc, '   ', {
          speakerRole: 'primary',
          speakerLabel: 'You',
        })
      ).toBe(emptyDoc);

      // If appendToActiveTurn is true but last block has no status lozenge, creates a fresh turn paragraph
      const plainDoc = {
        version: 1 as const,
        type: 'doc' as const,
        content: [
          {
            type: 'paragraph' as const,
            content: [{ type: 'text' as const, text: 'Pre-existing note line' }],
          },
        ],
      };
      const nextDoc = appendDialogueTurnToAdfDoc(plainDoc, 'New turn line.', {
        speakerRole: 'external',
        speakerLabel: '   ',
        appendToActiveTurn: true,
      });

      expect(nextDoc.content).toHaveLength(2);
      const secondBlock = nextDoc.content[1];
      expect(secondBlock.type).toBe('paragraph');
      if (secondBlock.type === 'paragraph') {
        expect(secondBlock.content?.[0]).toMatchObject({
          type: 'status',
          attrs: { text: 'SPEAKER', color: 'green' },
        });
      }
      expect(validateAndNormalizeAdfDoc(nextDoc).valid).toBe(true);
    });
  });

  describe('2. Unit Tests: Cross-Channel Bleed Suppression (src/utils/localSttEngine.ts)', () => {
    it('passes normal primary mic speech when External audio is silent (effectiveExternalRms === 0)', () => {
      const initial: ExternalBleedState = { peakRms: 0, lastActiveMs: 0 };
      const state = updateExternalBleedState(initial, 0, 1000);
      expect(state.peakRms).toBe(0);

      const effectiveExt = getEffectiveExternalRms(state, 0, 1000);
      expect(effectiveExt).toBe(0);

      const gate = shouldSuppressPrimaryMicBleed({
        primaryRms: 0.04,
        effectiveExternalRms: effectiveExt,
      });
      expect(gate.suppressed).toBe(false);
      expect(gate.effectiveThreshold).toBeCloseTo(0.026, 5);
    });

    it('suppresses attenuated speaker bleed (primaryRms = 0.08) while External plays (0.65) and during the 240ms hangover (+120ms), then recovers after expiry (+300ms)', () => {
      let state: ExternalBleedState = { peakRms: 0, lastActiveMs: 0 };

      // t = 1000ms: External audio plays actively at RMS = 0.65
      state = updateExternalBleedState(state, 0.65, 1000);
      expect(state).toEqual({ peakRms: 0.65, lastActiveMs: 1000 });

      const effActive = getEffectiveExternalRms(state, 0.65, 1000);
      expect(effActive).toBeCloseTo(0.65, 5);

      const duringActive = shouldSuppressPrimaryMicBleed({
        primaryRms: 0.08,
        effectiveExternalRms: effActive,
      });
      expect(duringActive.suppressed).toBe(true);
      expect(duringActive.effectiveThreshold).toBeCloseTo(0.22, 5);

      // t = 1120ms (+120ms into 240ms hangover window after External drops to 0)
      state = updateExternalBleedState(state, 0, 1120);
      expect(state.peakRms).toBeCloseTo(0.65, 5);

      const effHangover = getEffectiveExternalRms(state, 0, 1120);
      expect(effHangover).toBeGreaterThan(0.4);

      const duringHangover = shouldSuppressPrimaryMicBleed({
        primaryRms: 0.08,
        effectiveExternalRms: effHangover,
      });
      expect(duringHangover.suppressed).toBe(true);
      expect(duringHangover.effectiveThreshold).toBeGreaterThan(0.08);

      // t = 1300ms (+300ms > 240ms hangover expired)
      state = updateExternalBleedState(state, 0, 1300);
      expect(state.peakRms).toBe(0);

      const effRecovered = getEffectiveExternalRms(state, 0, 1300);
      expect(effRecovered).toBe(0);

      const afterExpiry = shouldSuppressPrimaryMicBleed({
        primaryRms: 0.08,
        effectiveExternalRms: effRecovered,
      });
      expect(afterExpiry.suppressed).toBe(false);
      expect(afterExpiry.effectiveThreshold).toBeCloseTo(0.026, 5);
    });

    it('never suppresses genuine loud user barge-in (primaryRms = 0.32) even when External is at full digital scale (effectiveExternalRms = 1.0) and applies speaking hysteresis', () => {
      const bargeIn = shouldSuppressPrimaryMicBleed({
        primaryRms: 0.32,
        effectiveExternalRms: 1.0,
      });
      expect(bargeIn.suppressed).toBe(false);
      expect(bargeIn.effectiveThreshold).toBeCloseTo(0.22, 5);

      // Hysteresis: trailing syllables at primaryRms = 0.19 stay open once primaryAlreadySpeaking is true
      const beforeSpeaking = shouldSuppressPrimaryMicBleed({
        primaryRms: 0.19,
        effectiveExternalRms: 1.0,
        primaryAlreadySpeaking: false,
      });
      expect(beforeSpeaking.suppressed).toBe(true);

      const whileSpeaking = shouldSuppressPrimaryMicBleed({
        primaryRms: 0.19,
        effectiveExternalRms: 1.0,
        primaryAlreadySpeaking: true,
      });
      expect(whileSpeaking.suppressed).toBe(false);
      expect(whileSpeaking.effectiveThreshold).toBeCloseTo(0.22 * 0.78, 5);
    });
  });

  describe('3. React Integration Tests: Dialogue Controls, Simulated Fallback & Live Dual-Channel WebAudio', () => {
    it('configures #voice-dialogue-mode-toggle, external-level-meter, speaker names (Host / Client), bleed gate, turn timestamps, and secondary source selection', async () => {
      const enumerateDevicesMock = vi.fn().mockResolvedValue([
        {
          kind: 'audioinput',
          deviceId: 'default',
          label: 'System Default Mic',
        },
        {
          kind: 'audioinput',
          deviceId: 'usb-podcast-mic',
          label: 'Shure MV7 USB',
        },
        {
          kind: 'audioinput',
          deviceId: 'vb-cable-output',
          label: 'VB-Audio Virtual Cable',
        },
      ]);

      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        writable: true,
        value: {
          enumerateDevices: enumerateDevicesMock,
        },
      });

      render(<App />);
      fireEvent.click(screen.getByRole('tab', { name: /Notes/i }));

      const dialogueSwitch = document.getElementById(
        'voice-dialogue-mode-toggle'
      ) as HTMLButtonElement;
      expect(dialogueSwitch).toBeInTheDocument();
      expect(dialogueSwitch).toHaveAttribute('role', 'switch');
      expect(dialogueSwitch).toHaveAttribute('aria-checked', 'false');
      expect(
        screen.queryByTestId('external-level-meter')
      ).not.toBeInTheDocument();

      // Enable Dialogue Mode
      fireEvent.click(dialogueSwitch);
      expect(dialogueSwitch).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByTestId('external-level-meter')).toBeInTheDocument();
      expect(document.getElementById('voice-status-title')).toHaveTextContent(
        'Dialogue Ready (2 Sources)'
      );

      // Open STT configuration drawer
      fireEvent.click(
        screen.getByRole('button', {
          name: /Configure Local STT Engine & Microphone/i,
        })
      );

      const dialogueSection = screen.getByTestId('dialogue-config-section');
      expect(dialogueSection).toHaveTextContent('Active (2 Sources)');

      // Update speaker names: You -> Host, External -> Client
      const primaryInput = screen.getByTestId(
        'primary-speaker-input'
      ) as HTMLInputElement;
      const externalInput = screen.getByTestId(
        'external-speaker-input'
      ) as HTMLInputElement;
      expect(primaryInput.value).toBe('You');
      expect(externalInput.value).toBe('External');

      fireEvent.change(primaryInput, { target: { value: 'Host' } });
      fireEvent.change(externalInput, { target: { value: 'Client' } });
      expect(primaryInput.value).toBe('Host');
      expect(externalInput.value).toBe('Client');
      expect(
        document.getElementById('voice-status-subtitle')
      ).toHaveTextContent('Click mic to transcribe Host + Client dialogue');

      // Toggle Bleed Suppression switch (default ON -> OFF -> ON)
      const bleedToggle = screen.getByTestId('bleed-suppression-toggle');
      expect(bleedToggle).toHaveAttribute('role', 'switch');
      expect(bleedToggle).toHaveAttribute('aria-checked', 'true');
      fireEvent.click(bleedToggle);
      expect(bleedToggle).toHaveAttribute('aria-checked', 'false');
      expect(bleedToggle).toHaveTextContent('Bleed Gate: OFF');
      fireEvent.click(bleedToggle);
      expect(bleedToggle).toHaveAttribute('aria-checked', 'true');

      // Toggle Turn Timestamps switch (default OFF -> ON)
      const timestampsToggle = screen.getByTestId('dialogue-timestamps-toggle');
      expect(timestampsToggle).toHaveAttribute('role', 'switch');
      expect(timestampsToggle).toHaveAttribute('aria-checked', 'false');
      fireEvent.click(timestampsToggle);
      expect(timestampsToggle).toHaveAttribute('aria-checked', 'true');
      expect(timestampsToggle).toHaveTextContent('Turn Timestamps: ON');

      // Select secondary audioinput device vs system-loopback
      const sourceSelect = screen.getByTestId(
        'secondary-source-select'
      ) as HTMLSelectElement;
      expect(sourceSelect.value).toBe('system-loopback');

      await waitFor(() => {
        expect(
          within(sourceSelect).getByRole('option', {
            name: /Secondary Input: VB-Audio Virtual Cable/i,
          })
        ).toBeInTheDocument();
      });

      // Selecting a specific Primary Mic disables that same physical deviceId in Secondary Source
      const primaryMicSelect = screen.getByLabelText(
        'Microphone Input Device'
      ) as HTMLSelectElement;
      fireEvent.change(primaryMicSelect, {
        target: { value: 'usb-podcast-mic' },
      });
      expect(
        within(sourceSelect).getByRole('option', {
          name: /Secondary Input: Shure MV7 USB/i,
        })
      ).toBeDisabled();

      fireEvent.change(sourceSelect, {
        target: { value: 'vb-cable-output' },
      });
      expect(sourceSelect.value).toBe('vb-cable-output');

      let persisted = JSON.parse(
        window.localStorage.getItem('sideflow_stt_settings') || '{}'
      );
      expect(persisted).toMatchObject({
        dialogueMode: true,
        primarySpeakerLabel: 'Host',
        secondarySpeakerLabel: 'Client',
        bleedSuppression: true,
        dialogueTimestamps: true,
        secondarySourceId: 'vb-cable-output',
      });

      // Switch back to PC System Audio Loopback
      fireEvent.change(sourceSelect, {
        target: { value: 'system-loopback' },
      });
      expect(sourceSelect.value).toBe('system-loopback');
      persisted = JSON.parse(
        window.localStorage.getItem('sideflow_stt_settings') || '{}'
      );
      expect(persisted.secondarySourceId).toBe('system-loopback');
    });

    it('inserts simulated two-speaker turns in both Markdown mode (**Host:** / **Client:**) and Jira ADF mode (2 valid status-lozenge paragraphs, undoable via Undo)', () => {
      render(<App />);
      fireEvent.click(screen.getByRole('tab', { name: /Notes/i }));

      // Create a clean blank Markdown note
      fireEvent.click(screen.getByRole('button', { name: /New Note/i }));
      const bodyInput = document.getElementById(
        'note-body-input'
      ) as HTMLTextAreaElement;
      expect(bodyInput.value).toBe('');

      // Enable Dialogue Mode and set speaker labels to Host & Client
      fireEvent.click(
        document.getElementById('voice-dialogue-mode-toggle') as HTMLElement
      );
      fireEvent.click(
        screen.getByRole('button', {
          name: /Configure Local STT Engine & Microphone/i,
        })
      );
      fireEvent.change(screen.getByTestId('primary-speaker-input'), {
        target: { value: 'Host' },
      });
      fireEvent.change(screen.getByTestId('external-speaker-input'), {
        target: { value: 'Client' },
      });

      // 1. Trigger simulated fallback in Markdown mode
      fireEvent.click(
        screen.getByRole('button', { name: /Start voice dictation/i })
      );

      expect(bodyInput.value).toBe(
        '**Host:** Can we confirm the rollout checklist before Friday?\n**Client:** Yes, staging sign-off passed and rollback alerts are verified.'
      );

      // Verify optional [HH:MM] timestamps in Markdown mode on a second blank note
      fireEvent.click(screen.getByTestId('dialogue-timestamps-toggle'));
      fireEvent.click(screen.getByRole('button', { name: /New Note/i }));
      const timestampedBodyInput = document.getElementById(
        'note-body-input'
      ) as HTMLTextAreaElement;
      fireEvent.click(
        screen.getByRole('button', { name: /Start voice dictation/i })
      );
      expect(timestampedBodyInput.value).toMatch(
        /^\[.+\] \*\*Host:\*\* Can we confirm the rollout checklist before Friday\?\n\[.+\] \*\*Client:\*\* Yes, staging sign-off passed and rollback alerts are verified\.$/
      );

      // 2. Create a fresh blank note, switch to Jira ADF mode + Split view, and trigger simulated dialogue fallback
      fireEvent.click(screen.getByTestId('dialogue-timestamps-toggle')); // turn timestamps back off
      fireEvent.click(screen.getByRole('button', { name: /New Note/i }));
      fireEvent.click(screen.getByTestId('format-mode-adf'));
      fireEvent.click(screen.getByRole('button', { name: /^Split$/i }));

      fireEvent.click(
        screen.getByRole('button', { name: /Start voice dictation/i })
      );

      expect(screen.getByTestId('adf-json-valid-badge')).toHaveTextContent(
        'version: 1 • valid'
      );
      const rawAdfTextarea = screen.getByTestId(
        'adf-json-textarea'
      ) as HTMLTextAreaElement;
      const parsedAfterBoth = parseAdfJsonString(rawAdfTextarea.value);
      expect(parsedAfterBoth.valid).toBe(true);
      if (parsedAfterBoth.valid) {
        expect(parsedAfterBoth.doc.content).toHaveLength(2);
        const turn1 = parsedAfterBoth.doc.content[0];
        const turn2 = parsedAfterBoth.doc.content[1];
        expect(turn1.type).toBe('paragraph');
        expect(turn2.type).toBe('paragraph');
        if (turn1.type === 'paragraph' && turn2.type === 'paragraph') {
          expect(turn1.content?.[0]).toMatchObject({
            type: 'status',
            attrs: { text: 'HOST', color: 'blue' },
          });
          expect(turn1.content?.[1]).toEqual({
            type: 'text',
            text: ' Can we confirm the rollout checklist before Friday?',
          });
          expect(turn2.content?.[0]).toMatchObject({
            type: 'status',
            attrs: { text: 'CLIENT', color: 'green' },
          });
          expect(turn2.content?.[1]).toEqual({
            type: 'text',
            text: ' Yes, staging sign-off passed and rollback alerts are verified.',
          });
        }
      }

      // 3. Undo steps back cleanly through each simulated dialogue turn in Jira ADF mode
      const undoBtn = screen.getByRole('button', { name: /Undo Note Edit/i });
      expect(undoBtn).not.toBeDisabled();

      fireEvent.click(undoBtn);
      const parsedAfterFirstUndo = parseAdfJsonString(rawAdfTextarea.value);
      expect(parsedAfterFirstUndo.valid).toBe(true);
      if (parsedAfterFirstUndo.valid) {
        expect(parsedAfterFirstUndo.doc.content).toHaveLength(1);
        const remainingTurn = parsedAfterFirstUndo.doc.content[0];
        if (remainingTurn.type === 'paragraph') {
          expect(remainingTurn.content?.[0]).toMatchObject({
            type: 'status',
            attrs: { text: 'HOST', color: 'blue' },
          });
        }
      }

      fireEvent.click(undoBtn);
      const parsedAfterSecondUndo = parseAdfJsonString(rawAdfTextarea.value);
      expect(parsedAfterSecondUndo.valid).toBe(true);
      if (parsedAfterSecondUndo.valid) {
        expect(parsedAfterSecondUndo.doc.content).toEqual([
          { type: 'paragraph', content: [] },
        ]);
      }
    });

    it('captures dual WebAudio streams via getUserMedia + getDisplayMedia, immediately stops the temporary video track, suppresses speaker bleed, groups consecutive turns, and resets turn grouping on manual edit', async () => {
      let nowMs = 1000;
      vi.spyOn(performance, 'now').mockImplementation(() => nowMs);

      const primaryAudioTrack = {
        kind: 'audio',
        stop: vi.fn(),
        onended: null as (() => void) | null,
      };
      const primaryStream = {
        getTracks: () => [primaryAudioTrack],
        getAudioTracks: () => [primaryAudioTrack],
        getVideoTracks: () => [],
      } as unknown as MediaStream;

      const displayVideoTrack = {
        kind: 'video',
        stop: vi.fn(),
        onended: null as (() => void) | null,
      };
      const displayAudioTrack = {
        kind: 'audio',
        stop: vi.fn(),
        onended: null as (() => void) | null,
      };
      const displayTracks: Array<typeof displayVideoTrack> = [
        displayVideoTrack,
        displayAudioTrack,
      ];
      const removeTrackMock = vi.fn((track: typeof displayVideoTrack) => {
        const idx = displayTracks.indexOf(track);
        if (idx >= 0) {
          displayTracks.splice(idx, 1);
        }
      });
      const displayStream = {
        getTracks: () => [...displayTracks],
        getVideoTracks: () =>
          displayTracks.filter((track) => track.kind === 'video'),
        getAudioTracks: () =>
          displayTracks.filter((track) => track.kind === 'audio'),
        removeTrack: removeTrackMock,
      } as unknown as MediaStream;

      const getUserMediaMock = vi.fn().mockResolvedValue(primaryStream);
      const getDisplayMediaMock = vi.fn().mockResolvedValue(displayStream);
      const enumerateDevicesMock = vi.fn().mockResolvedValue([
        { kind: 'audioinput', deviceId: 'default', label: 'Primary Laptop Mic' },
      ]);

      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        writable: true,
        value: {
          getUserMedia: getUserMediaMock,
          getDisplayMedia: getDisplayMediaMock,
          enumerateDevices: enumerateDevicesMock,
        },
      });

      interface MockScriptProcessor {
        onaudioprocess: ((ev: AudioProcessingEvent) => void) | null;
        connect: ReturnType<typeof vi.fn>;
        disconnect: ReturnType<typeof vi.fn>;
      }

      const processorsByRole: {
        primary: MockScriptProcessor | null;
        external: MockScriptProcessor | null;
      } = {
        primary: null,
        external: null,
      };

      class MockAudioContext {
        sampleRate = 16000;
        state = 'running';
        destination = {};
        audioWorklet = undefined;
        private attachedStream: MediaStream | null = null;

        createMediaStreamSource(stream: MediaStream) {
          this.attachedStream = stream;
          return {
            connect: vi.fn(),
            disconnect: vi.fn(),
          };
        }

        createScriptProcessor() {
          const proc: MockScriptProcessor = {
            onaudioprocess: null,
            connect: vi.fn(),
            disconnect: vi.fn(),
          };
          if (this.attachedStream === primaryStream) {
            processorsByRole.primary = proc;
          } else if (this.attachedStream === displayStream) {
            processorsByRole.external = proc;
          }
          return proc;
        }

        resume = vi.fn().mockResolvedValue(undefined);
        close = vi.fn().mockResolvedValue(undefined);
      }

      Object.defineProperty(window, 'AudioContext', {
        configurable: true,
        writable: true,
        value: MockAudioContext,
      });

      const queuedTranscripts = [
        'First.',
        'Second.',
        'Reply.',
        'Before edit.',
        'Fresh turn.',
      ];
      const transcribeAudioLocalMock = vi.fn().mockImplementation(async () => ({
        success: true,
        text: queuedTranscripts.shift() || 'Extra.',
        engineUsed: 'faster-whisper CUDA',
        durationMs: 24,
      }));

      window.sideflow = {
        isElectron: false,
        getLocalSttStatus: vi.fn().mockResolvedValue({
          available: true,
          fasterWhisperAvailable: true,
          cudaAvailable: true,
          gpuName: 'NVIDIA RTX 4070',
          windowsSapiAvailable: true,
        }),
        warmupLocalStt: vi.fn().mockResolvedValue({
          success: true,
          engineUsed: 'faster-whisper CUDA',
          durationMs: 10,
        }),
        transcribeAudioLocal: transcribeAudioLocalMock,
      } as unknown as typeof window.sideflow;

      render(<App />);
      fireEvent.click(screen.getByRole('tab', { name: /Notes/i }));
      fireEvent.click(screen.getByRole('button', { name: /New Note/i }));

      const bodyInput = document.getElementById(
        'note-body-input'
      ) as HTMLTextAreaElement;
      expect(bodyInput.value).toBe('');

      // Enable Dialogue Mode (defaults to 'You', 'External', secondarySourceId = 'system-loopback')
      fireEvent.click(
        document.getElementById('voice-dialogue-mode-toggle') as HTMLElement
      );

      // Start live dual-channel dictation
      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: /Start voice dictation/i })
        );
      });

      await waitFor(() => {
        expect(getUserMediaMock).toHaveBeenCalledTimes(1);
        expect(getDisplayMediaMock).toHaveBeenCalledTimes(1);
        expect(processorsByRole.primary?.onaudioprocess).toBeTypeOf('function');
        expect(processorsByRole.external?.onaudioprocess).toBeTypeOf('function');
      });

      // Verify getUserMedia used echoCancellation: true on Primary Mic
      expect(getUserMediaMock).toHaveBeenCalledWith(
        expect.objectContaining({
          audio: expect.objectContaining({
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          }),
        })
      );

      // Verify getDisplayMedia temporary video track was immediately .stop()ped & removed while audio track stays active
      expect(displayVideoTrack.stop).toHaveBeenCalledTimes(1);
      expect(removeTrackMock).toHaveBeenCalledWith(displayVideoTrack);
      expect(displayStream.getVideoTracks()).toHaveLength(0);
      expect(displayStream.getAudioTracks()).toHaveLength(1);
      expect(displayAudioTrack.stop).not.toHaveBeenCalled();
      expect(document.getElementById('voice-status-title')).toHaveTextContent(
        'Dialogue Listening (You + External)'
      );

      const emitFrame = (
        role: 'primary' | 'external',
        amplitude: number,
        advanceMs: number
      ) => {
        nowMs += advanceMs;
        const samples = new Float32Array(1024);
        if (amplitude > 0) {
          for (let i = 0; i < samples.length; i++) {
            samples[i] = i % 2 === 0 ? amplitude : -amplitude;
          }
        }
        const proc = processorsByRole[role];
        proc?.onaudioprocess?.({
          inputBuffer: {
            getChannelData: () => samples,
          },
        } as unknown as AudioProcessingEvent);
      };

      const speakUtterance = async (
        role: 'primary' | 'external',
        amplitude = 0.12
      ) => {
        await act(async () => {
          emitFrame(role, amplitude, 64);
          emitFrame(role, amplitude, 64);
          emitFrame(role, 0, 450); // >= 380ms silenceFlushMs commits utterance
          await Promise.resolve();
          await Promise.resolve();
        });
      };

      // 1. First Primary utterance -> "**You:** First."
      await speakUtterance('primary');
      await waitFor(() => {
        expect(bodyInput.value).toBe('**You:** First.');
      });

      // 2. Second consecutive Primary utterance -> groups into "**You:** First. Second."
      await speakUtterance('primary');
      await waitFor(() => {
        expect(bodyInput.value).toBe('**You:** First. Second.');
      });
      expect(transcribeAudioLocalMock).toHaveBeenCalledTimes(2);

      // 3. External speaker replies while attenuated speaker bleed hits Primary Mic:
      //    Primary bleed (amp = 0.019 -> RMS ~0.08 < 0.22 gate) must be suppressed, only External ("Reply.") commits!
      await act(async () => {
        emitFrame('external', 0.16, 64); // External RMS = 0.672
        emitFrame('primary', 0.019, 20); // Attenuated bleed on Primary Mic -> suppressed!
        emitFrame('primary', 0.019, 20); // Still suppressed!
        emitFrame('external', 0.16, 60); // External reaches 2048 samples
        emitFrame('primary', 0, 450); // Primary silence (nothing recorded -> no flush)
        emitFrame('external', 0, 10); // External silence 460ms -> flushes External ("Reply.")
        await Promise.resolve();
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(bodyInput.value).toBe(
          '**You:** First. Second.\n**External:** Reply.'
        );
      });
      expect(transcribeAudioLocalMock).toHaveBeenCalledTimes(3);

      // Advance past 240ms bleed hangover window and emit another Primary turn ("Before edit.")
      nowMs += 300;
      await speakUtterance('primary');
      await waitFor(() => {
        expect(bodyInput.value).toBe(
          '**You:** First. Second.\n**External:** Reply.\n**You:** Before edit.'
        );
      });

      // 4. Manual typing in #note-body-input resets turn grouping even when the SAME speaker ('You') speaks next!
      const manuallyEdited =
        '**You:** First. Second.\n**External:** Reply.\n**You:** Before edit. (manual note)';
      fireEvent.change(bodyInput, {
        target: {
          value: manuallyEdited,
          selectionStart: manuallyEdited.length,
          selectionEnd: manuallyEdited.length,
        },
      });
      expect(bodyInput.value).toBe(manuallyEdited);

      await speakUtterance('primary');
      await waitFor(() => {
        expect(bodyInput.value).toBe(
          '**You:** First. Second.\n**External:** Reply.\n**You:** Before edit. (manual note)\n**You:** Fresh turn.'
        );
      });

      // 5. Stopping dictation cleanly stops both Primary Mic and External Loopback audio tracks
      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: /Stop voice dictation/i })
        );
      });
      expect(primaryAudioTrack.stop).toHaveBeenCalled();
      expect(displayAudioTrack.stop).toHaveBeenCalled();
    });

    it('supports secondary audioinput device capture (echoCancellation: false) and warns gracefully if getDisplayMedia has no audio track', async () => {
      const primaryTrack = { kind: 'audio', stop: vi.fn(), onended: null };
      const secondaryMicTrack = { kind: 'audio', stop: vi.fn(), onended: null };
      const videoOnlyTrack = { kind: 'video', stop: vi.fn(), onended: null };

      const getUserMediaMock = vi
        .fn()
        .mockImplementation(async (constraints: MediaStreamConstraints) => {
          const audioObj = constraints.audio as MediaTrackConstraints;
          const exactId = (audioObj?.deviceId as { exact?: string } | undefined)
            ?.exact;
          if (exactId === 'usb-line-in') {
            return {
              getTracks: () => [secondaryMicTrack],
              getAudioTracks: () => [secondaryMicTrack],
              getVideoTracks: () => [],
            } as unknown as MediaStream;
          }
          return {
            getTracks: () => [primaryTrack],
            getAudioTracks: () => [primaryTrack],
            getVideoTracks: () => [],
          } as unknown as MediaStream;
        });

      // Display stream with video track only and NO audio track (user forgot "Share system audio")
      const getDisplayMediaMock = vi.fn().mockResolvedValue({
        getTracks: () => [videoOnlyTrack],
        getVideoTracks: () => [videoOnlyTrack],
        getAudioTracks: () => [],
        removeTrack: vi.fn(),
      } as unknown as MediaStream);

      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        writable: true,
        value: {
          getUserMedia: getUserMediaMock,
          getDisplayMedia: getDisplayMediaMock,
          enumerateDevices: vi.fn().mockResolvedValue([
            { kind: 'audioinput', deviceId: 'default', label: 'Default Mic' },
            {
              kind: 'audioinput',
              deviceId: 'usb-line-in',
              label: 'Focusrite Line In',
            },
          ]),
        },
      });

      class MockAudioContext {
        sampleRate = 16000;
        state = 'running';
        destination = {};
        audioWorklet = undefined;
        createMediaStreamSource() {
          return { connect: vi.fn(), disconnect: vi.fn() };
        }
        createScriptProcessor() {
          return { onaudioprocess: null, connect: vi.fn(), disconnect: vi.fn() };
        }
        resume = vi.fn().mockResolvedValue(undefined);
        close = vi.fn().mockResolvedValue(undefined);
      }

      Object.defineProperty(window, 'AudioContext', {
        configurable: true,
        writable: true,
        value: MockAudioContext,
      });

      render(<App />);
      fireEvent.click(screen.getByRole('tab', { name: /Notes/i }));

      // 1. Start in Dialogue Mode with 'system-loopback' when getDisplayMedia returns 0 audio tracks
      fireEvent.click(
        document.getElementById('voice-dialogue-mode-toggle') as HTMLElement
      );
      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: /Start voice dictation/i })
        );
      });

      expect(videoOnlyTrack.stop).toHaveBeenCalled();
      expect(
        await screen.findByText(/External Audio Track Not Shared/i)
      ).toBeInTheDocument();
      // Continues listening on Primary Mic alone
      expect(document.getElementById('voice-status-title')).toHaveTextContent(
        'Dialogue Listening (You)'
      );
      expect(
        document.getElementById('voice-status-subtitle')
      ).toHaveTextContent('Listening to You (external source offline)…');

      // Stop before switching to secondary hardware input
      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: /Stop voice dictation/i })
        );
      });

      // 2. Select secondary hardware audioinput ('usb-line-in') and start again -> uses getUserMedia with exact deviceId & echoCancellation: false
      fireEvent.click(
        screen.getByRole('button', {
          name: /Configure Local STT Engine & Microphone/i,
        })
      );
      const sourceSelect = screen.getByTestId('secondary-source-select');
      await waitFor(() => {
        expect(
          within(sourceSelect).getByRole('option', {
            name: /Secondary Input: Focusrite Line In/i,
          })
        ).toBeInTheDocument();
      });
      fireEvent.change(sourceSelect, { target: { value: 'usb-line-in' } });

      getUserMediaMock.mockClear();
      getDisplayMediaMock.mockClear();

      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: /Start voice dictation/i })
        );
      });

      await waitFor(() => {
        expect(getUserMediaMock).toHaveBeenCalledTimes(2);
      });
      expect(getDisplayMediaMock).not.toHaveBeenCalled();
      expect(getUserMediaMock).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          audio: expect.objectContaining({
            deviceId: { exact: 'usb-line-in' },
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          }),
        })
      );
      expect(document.getElementById('voice-status-title')).toHaveTextContent(
        'Dialogue Listening (You + External)'
      );

      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: /Stop voice dictation/i })
        );
      });
    });
  });
});
