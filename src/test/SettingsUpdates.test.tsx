import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SettingsView } from '../components/Settings/SettingsView';
import { OnboardingModal } from '../components/OnboardingModal';
import { VoiceBar } from '../components/Notes/VoiceBar';
import { defaultMonitorSettings, defaultShortcut } from '../utils/defaults';

describe('SettingsView Work Laptop Startup & Auto-Update Controls', () => {
  const baseProps = {
    shortcut: defaultShortcut,
    isRecordingHotkey: false,
    onStartRecordingHotkey: vi.fn(),
    onResetHotkey: vi.fn(),
    isPinned: true,
    onTogglePin: vi.fn(),
    showEdgeHandle: true,
    onToggleEdgeHandle: vi.fn(),
    onOpenElectronModal: vi.fn(),
  };

  it('renders and toggles the Start SideFlow Automatically at Login checkbox', () => {
    const onToggleOpenAtLogin = vi.fn();
    render(
      <SettingsView
        {...baseProps}
        openAtLogin={true}
        onToggleOpenAtLogin={onToggleOpenAtLogin}
      />
    );

    const checkbox = screen.getByTestId(
      'setting-open-at-login'
    ) as HTMLInputElement;
    expect(checkbox).toBeInTheDocument();
    expect(checkbox.checked).toBe(true);

    fireEvent.click(checkbox);
    expect(onToggleOpenAtLogin).toHaveBeenCalledWith(false);
  });

  it('displays current version and triggers Check for Updates', () => {
    const onCheckForUpdates = vi.fn();
    render(
      <SettingsView
        {...baseProps}
        updateState={{
          status: 'not-available',
          currentVersion: '1.0.0',
          latestVersion: '1.0.0',
        }}
        onCheckForUpdates={onCheckForUpdates}
      />
    );

    expect(screen.getByTestId('app-version-badge')).toHaveTextContent('v1.0.0');
    expect(screen.getByTestId('update-status-banner')).toHaveTextContent(
      /SideFlow is up to date/i
    );

    const checkBtn = screen.getByTestId('check-updates-btn');
    fireEvent.click(checkBtn);
    expect(onCheckForUpdates).toHaveBeenCalledTimes(1);
  });

  it('shows Restart & Install button when an update has been downloaded', () => {
    const onInstallUpdate = vi.fn();
    render(
      <SettingsView
        {...baseProps}
        updateState={{
          status: 'downloaded',
          currentVersion: '1.0.0',
          latestVersion: '1.2.0',
          canQuitAndInstall: true,
        }}
        onInstallUpdate={onInstallUpdate}
      />
    );

    expect(screen.getByTestId('update-status-banner')).toHaveTextContent(
      /Update v1\.2\.0 downloaded and ready to apply!/i
    );

    const installBtn = screen.getByTestId('install-update-btn');
    expect(installBtn).toHaveTextContent('Restart & Install v1.2.0');
    fireEvent.click(installBtn);
    expect(onInstallUpdate).toHaveBeenCalledTimes(1);
  });

  it('displays an error banner when an update check fails with status: error', () => {
    render(
      <SettingsView
        {...baseProps}
        updateState={{
          status: 'error',
          currentVersion: '1.4.0',
          error: 'GitHub Releases API returned HTTP 403.',
        }}
      />
    );

    const banner = screen.getByTestId('update-status-banner');
    expect(banner).toHaveTextContent(/GitHub Releases API returned HTTP 403\./i);
  });

  it('renders the warning-free 1-line PowerShell install command and copies it to clipboard', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    render(<SettingsView {...baseProps} />);

    const cmdEl = screen.getByTestId('ps-install-command');
    expect(cmdEl).toHaveTextContent(
      'irm https://raw.githubusercontent.com/NeoShadow7366/SideFlow/master/install.ps1 | iex'
    );

    const copyBtn = screen.getByTestId('copy-ps-install-btn');
    fireEvent.click(copyBtn);
    expect(writeText).toHaveBeenCalledWith(
      'irm https://raw.githubusercontent.com/NeoShadow7366/SideFlow/master/install.ps1 | iex'
    );
    expect(copyBtn).toHaveTextContent('Copied!');
  });

  it('launches and steps through the 60-Second Onboarding Wizard (Hotkey -> Screen Edge & Monitors -> Ready)', () => {
    const onOpenOnboardingWizard = vi.fn();
    const onSelectShortcutPreset = vi.fn();
    const onChangePanelEdge = vi.fn();
    const onChangeMonitorSettings = vi.fn();
    const onChangePanelWidthPercent = vi.fn();
    const onComplete = vi.fn();

    render(
      <>
        <SettingsView
          {...baseProps}
          onOpenOnboardingWizard={onOpenOnboardingWizard}
        />
        <OnboardingModal
          isOpen={true}
          onClose={vi.fn()}
          onComplete={onComplete}
          shortcut={defaultShortcut}
          isRecordingHotkey={false}
          onStartRecordingHotkey={vi.fn()}
          onSelectShortcutPreset={onSelectShortcutPreset}
          isPinned={true}
          onTogglePin={vi.fn()}
          openAtLogin={true}
          onToggleOpenAtLogin={vi.fn()}
          panelEdge="right"
          onChangePanelEdge={onChangePanelEdge}
          panelWidthPercent={20}
          onChangePanelWidthPercent={onChangePanelWidthPercent}
          monitorSettings={defaultMonitorSettings}
          onChangeMonitorSettings={onChangeMonitorSettings}
        />
      </>
    );

    const launchBtn = screen.getByTestId('open-onboarding-wizard-btn');
    fireEvent.click(launchBtn);
    expect(onOpenOnboardingWizard).toHaveBeenCalledTimes(1);

    // Step 1: Hotkey & Startup
    expect(screen.getByTestId('onboarding-panel-step-1')).toBeInTheDocument();
    fireEvent.click(
      screen.getByTestId('onboarding-shortcut-preset-ctrl-space')
    );
    expect(onSelectShortcutPreset).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'Ctrl + Space', ctrl: true })
    );

    // Advance to Step 2: Screen Edge & Monitors
    fireEvent.click(screen.getByTestId('onboarding-next-btn'));
    expect(screen.getByTestId('onboarding-panel-step-2')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('onboarding-edge-left'));
    expect(onChangePanelEdge).toHaveBeenCalledWith('left');

    fireEvent.click(screen.getByTestId('onboarding-monitor-all'));
    expect(onChangeMonitorSettings).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'all' })
    );

    fireEvent.click(screen.getByTestId('onboarding-width-35'));
    expect(onChangePanelWidthPercent).toHaveBeenCalledWith(35);

    // Advance to Step 3: Ready Summary
    fireEvent.click(screen.getByTestId('onboarding-next-btn'));
    expect(screen.getByTestId('onboarding-panel-step-3')).toBeInTheDocument();

    // Complete wizard
    fireEvent.click(screen.getByTestId('onboarding-finish-btn'));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('provisions Native Python Faster-Whisper via 1-Click Install Python Engine button in VoiceBar', async () => {
    const installLocalPythonStt = vi.fn().mockResolvedValue({
      success: true,
      message: 'faster-whisper installed in SideFlow Python venv!',
      status: {
        available: true,
        fasterWhisperAvailable: true,
        cudaAvailable: false,
        cpuThreads: 8,
        windowsSapiAvailable: true,
      },
    });
    window.sideflow = {
      isElectron: true,
      installLocalPythonStt,
    } as unknown as typeof window.sideflow;

    const onNotify = vi.fn();
    render(
      <VoiceBar
        onTranscript={vi.fn()}
        onInsertTimestamp={vi.fn()}
        onDictatingChange={vi.fn()}
        onNotify={onNotify}
      />
    );

    // Open the STT configuration drawer
    fireEvent.click(
      screen.getByRole('button', {
        name: /Configure Local STT Engine & Microphone/i,
      })
    );

    expect(screen.getByTestId('native-python-stt-badge')).toHaveTextContent(
      'Not Installed'
    );

    const installBtn = screen.getByTestId('install-python-stt-btn');
    fireEvent.click(installBtn);

    await waitFor(() => {
      expect(installLocalPythonStt).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('native-python-stt-badge')).toHaveTextContent(
        'CPU INT8 Ready (8T)'
      );
    });
  });

  it('renders Privacy & Local-First Trust Center with live Mic Gate status and Strict Offline Mode toggle', () => {
    const onToggleStrictOfflineMode = vi.fn();
    const { rerender } = render(
      <SettingsView
        {...baseProps}
        strictOfflineMode={false}
        onToggleStrictOfflineMode={onToggleStrictOfflineMode}
        isDictating={false}
      />
    );

    expect(screen.getByTestId('privacy-trust-center-card')).toBeInTheDocument();
    expect(screen.getByTestId('trust-mic-status-badge')).toHaveTextContent(
      'Mic Gate: CLOSED (0 bytes)'
    );

    fireEvent.click(screen.getByTestId('setting-strict-offline'));
    expect(onToggleStrictOfflineMode).toHaveBeenCalledWith(true);

    rerender(
      <SettingsView
        {...baseProps}
        strictOfflineMode={true}
        onToggleStrictOfflineMode={onToggleStrictOfflineMode}
        isDictating={true}
      />
    );
    expect(screen.getByTestId('trust-mic-status-badge')).toHaveTextContent(
      'Mic Gate: ACTIVE (Local STT)'
    );
  });

  it('runs Workspace Health Check, repairs shortcut conflicts, and manages rolling auto-snapshots', async () => {
    const runWorkspaceDiagnostics = vi.fn().mockResolvedValue({
      shortcutRegistered: false,
      currentAccelerator: 'Alt+Space',
      storeHealthy: true,
      storeSizeBytes: 8192,
      storePath: 'C:\\Users\\Test\\AppData\\Roaming\\sideflow-desktop\\sideflow-config.json',
      backupCount: 1,
      strictOffline: false,
      sttReady: true,
    });
    const listStoreBackups = vi.fn().mockResolvedValue({
      backups: [
        {
          fileName: 'sideflow-backup-2026-11-07.json',
          filePath: 'C:\\backups\\sideflow-backup-2026-11-07.json',
          createdAt: 1700000000000,
          sizeBytes: 6144,
        },
      ],
      storePath: 'C:\\sideflow-config.json',
      backupsDir: 'C:\\backups',
    });
    const createStoreBackupNow = vi.fn().mockResolvedValue({
      success: true,
      created: {
        fileName: 'sideflow-backup-2026-11-07-132000.json',
        filePath: 'C:\\backups\\sideflow-backup-2026-11-07-132000.json',
        createdAt: 1700000050000,
        sizeBytes: 7168,
      },
      backups: [
        {
          fileName: 'sideflow-backup-2026-11-07-132000.json',
          filePath: 'C:\\backups\\sideflow-backup-2026-11-07-132000.json',
          createdAt: 1700000050000,
          sizeBytes: 7168,
        },
        {
          fileName: 'sideflow-backup-2026-11-07.json',
          filePath: 'C:\\backups\\sideflow-backup-2026-11-07.json',
          createdAt: 1700000000000,
          sizeBytes: 6144,
        },
      ],
    });
    const restoreStoreBackup = vi.fn().mockResolvedValue({
      success: true,
      store: { sideflow_pinned: false },
    });

    window.sideflow = {
      isElectron: true,
      runWorkspaceDiagnostics,
      listStoreBackups,
      createStoreBackupNow,
      restoreStoreBackup,
    } as unknown as typeof window.sideflow;

    const onRepairShortcutConflict = vi.fn();
    const onImportBackup = vi.fn();

    render(
      <SettingsView
        {...baseProps}
        onRepairShortcutConflict={onRepairShortcutConflict}
        onImportBackup={onImportBackup}
      />
    );

    // Wait for initial snapshot list load
    await waitFor(() => {
      expect(
        screen.getByTestId('restore-snapshot-btn-sideflow-backup-2026-11-07.json')
      ).toBeInTheDocument();
    });

    // Run Health Check -> detects conflict on Alt+Space and offers 1-click Ctrl+Space repair
    fireEvent.click(screen.getByTestId('run-health-check-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('repair-shortcut-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('repair-shortcut-btn'));
    expect(onRepairShortcutConflict).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'Ctrl + Space', ctrl: true })
    );
    expect(screen.getByTestId('diag-shortcut-status')).toHaveTextContent(
      'Registered'
    );

    // Create a snapshot now
    fireEvent.click(screen.getByTestId('create-snapshot-btn'));
    await waitFor(() => {
      expect(createStoreBackupNow).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('health-status-feedback')).toHaveTextContent(
        /Saved snapshot: sideflow-backup-2026-11-07-132000\.json/i
      );
    });

    // Restore a snapshot
    fireEvent.click(
      screen.getByTestId('restore-snapshot-btn-sideflow-backup-2026-11-07.json')
    );
    await waitFor(() => {
      expect(restoreStoreBackup).toHaveBeenCalledWith(
        'sideflow-backup-2026-11-07.json'
      );
      expect(onImportBackup).toHaveBeenCalledWith(
        JSON.stringify({ sideflow_pinned: false })
      );
    });
  });
});
