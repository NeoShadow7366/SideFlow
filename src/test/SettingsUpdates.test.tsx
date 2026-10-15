import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SettingsView } from '../components/Settings/SettingsView';
import { defaultShortcut } from '../utils/defaults';

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
});
