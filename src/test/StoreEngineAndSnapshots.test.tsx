import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import React from 'react';
import {
  act,
  fireEvent,
  render,
   renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  hasMeaningfulWorkspaceData,
  renameWithWindowsBackoff,
  StoreEngine,
} from '../../electron/storeEngine';
import {
  cacheRasterIconDataUrl,
  migrateDrawerIconsInStore,
  resolveCachedIconFilePath,
} from '../../electron/iconCache';
import { App } from '../App';
import { useLocalStorage } from '../hooks/useLocalStorage';

const SAMPLE_PNG_BASE64 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('Phase 3 Authoritative StoreEngine, Disk Icon Cache & Rolling Snapshot Restore Suite', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sideflow-store-test-'));
    window.localStorage.clear();
    delete window.sideflow;
  });

  afterEach(() => {
    delete window.sideflow;
    vi.restoreAllMocks();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore temp cleanup errors
    }
  });

  it('persists atomically via StoreEngine, guards quit-flush against stale async writes, and separates daily vs manual backup buckets', async () => {
    const storePath = path.join(tempDir, 'sideflow-config.json');
    const backupsDir = path.join(tempDir, 'backups');
    const engine = new StoreEngine({
      storePath,
      backupsDir,
      isPackaged: true,
      maxDailyBackups: 7,
      maxManualBackups: 3,
      debounceMs: 25,
      backupIntervalMs: 0,
    });

    // Empty packaged bootstrap store does not qualify as meaningful workspace data
    const initial = engine.read();
    expect(initial).toEqual({ sideflow_auto_onboarding: true });
    expect(hasMeaningfulWorkspaceData(initial)).toBe(false);
    expect(engine.writeBackupSnapshotSync(initial, 'daily')).toBeNull();

    // Write morning workspace state and flush synchronously
    engine.write('sideflow_notes', [{ id: 'n-morning', title: 'Morning', body: 'Clean state' }]);
    engine.flushSync();
    expect(engine.isDirty()).toBe(false);

    const dailyBackupsAfterMorning = engine.listBackupsSync();
    expect(dailyBackupsAfterMorning.length).toBe(1);
    const morningSnap = dailyBackupsAfterMorning[0];
    expect(morningSnap.fileName).toMatch(/^sideflow-backup-\d{4}-\d{2}-\d{2}\.json$/);

    // Later same-day writes MUST NOT overwrite the morning clean daily snapshot
    engine.write('sideflow_notes', [{ id: 'n-afternoon', title: 'Afternoon', body: 'Mutated' }]);
    await engine.persistAsync();
    const preservedMorningRaw = JSON.parse(
      fs.readFileSync(morningSnap.filePath, 'utf-8')
    );
    expect(preservedMorningRaw.sideflow_notes[0].id).toBe('n-morning');

    // Manual snapshots write distinct timestamped files without evicting daily snapshots
    const manual1 = engine.writeBackupSnapshotSync(engine.read(), 'manual');
    expect(manual1?.fileName).toMatch(/^sideflow-backup-manual-/);
    expect(fs.existsSync(morningSnap.filePath)).toBe(true);

    // Restoring morning snapshot preserves pre-restore backup and restores morning notes
    const restored = engine.restoreBackupSync(morningSnap.fileName);
    expect(restored.success).toBe(true);
    expect((restored.store?.sideflow_notes as Array<{ id: string }>)[0].id).toBe(
      'n-morning'
    );
    expect(
      engine
        .listBackupsSync()
        .some((b) => b.fileName.startsWith('sideflow-backup-pre-restore-'))
    ).toBe(true);
  });

  it('retries transient Windows EPERM rename locks before succeeding cleanly', async () => {
    const srcFile = path.join(tempDir, 'config.tmp');
    const dstFile = path.join(tempDir, 'config.json');
    fs.writeFileSync(srcFile, '{"ok":true}', 'utf-8');

    const origRename = fs.promises.rename.bind(fs.promises);
    let attempts = 0;
    vi.spyOn(fs.promises, 'rename').mockImplementation(async (oldP, newP) => {
      attempts += 1;
      if (attempts < 3) {
        const err = Object.assign(new Error('EPERM: operation not permitted, rename'), {
          code: 'EPERM',
        });
        throw err;
      }
      return origRename(oldP, newP);
    });

    await renameWithWindowsBackoff(srcFile, dstFile);
    expect(attempts).toBe(3);
    expect(JSON.parse(fs.readFileSync(dstFile, 'utf-8'))).toEqual({ ok: true });
  });

  it('externalizes raster base64 icons to sideflow-icon://cache/<sha1>.png and blocks path traversal', () => {
    const iconDir = path.join(tempDir, 'icon-cache');
    const iconUrl = cacheRasterIconDataUrl(iconDir, SAMPLE_PNG_BASE64);
    expect(iconUrl).toMatch(/^sideflow-icon:\/\/cache\/[a-f0-9]{40}\.png$/);

    const resolvedFile = resolveCachedIconFilePath(iconDir, iconUrl!);
    expect(resolvedFile).not.toBeNull();
    expect(fs.existsSync(resolvedFile!)).toBe(true);

    // Rejects directory traversal & non-SHA1 filenames
    expect(
      resolveCachedIconFilePath(
        iconDir,
        'sideflow-icon://cache/../../sideflow-config.json'
      )
    ).toBeNull();
    expect(
      resolveCachedIconFilePath(iconDir, 'sideflow-icon://cache/evil.png')
    ).toBeNull();

    // Boot migration replaces inline base64 drawer icons in-place
    const storeObj: Record<string, unknown> = {
      sideflow_drawers: [
        {
          id: 'd-1',
          title: 'Dev',
          collapsed: false,
          apps: [
            {
              id: 'a-1',
              name: 'Code',
              cmd: 'C:\\VSCode\\Code.exe',
              icon: 'cpu',
              color: 'indigo',
              customIconUrl: SAMPLE_PNG_BASE64,
            },
          ],
        },
      ],
    };
    expect(migrateDrawerIconsInStore(storeObj, iconDir)).toBe(true);
    const migratedDrawer = (storeObj.sideflow_drawers as Array<{ apps: Array<{ customIconUrl: string }> }>)[0];
    expect(migratedDrawer.apps[0].customIconUrl).toBe(iconUrl);
    // Second run is a no-op
    expect(migrateDrawerIconsInStore(storeObj, iconDir)).toBe(false);
  });

  it('migrates legacy localStorage keys into authoritative Electron snapshot once and survives QuotaExceededError', () => {
    window.localStorage.setItem(
      'sideflow_notes',
      JSON.stringify([{ id: 'legacy-1', title: 'Legacy Note', body: 'From v1.9.0' }])
    );

    const storeSetMock = vi.fn();
    window.sideflow = {
      isElectron: true,
      getInitialStoreSnapshot: () => ({}),
      storeGetAll: vi.fn().mockResolvedValue({}),
      storeSet: storeSetMock,
    } as unknown as typeof window.sideflow;

    const { result } = renderHook(() =>
      useLocalStorage<Array<{ id: string; title: string; body: string }>>(
        'sideflow_notes',
        []
      )
    );

    // Immediately hydrated synchronously on first render with migrated legacy note
    expect(result.current[0]).toHaveLength(1);
    expect(result.current[0][0].id).toBe('legacy-1');
    expect(storeSetMock).toHaveBeenCalledWith(
      'sideflow_notes',
      expect.arrayContaining([expect.objectContaining({ id: 'legacy-1' })])
    );
    // Legacy localStorage shadow key was cleaned up
    expect(window.localStorage.getItem('sideflow_notes')).toBeNull();

    // Even if browser mode hits QuotaExceededError, state updates never throw or drop data
    delete window.sideflow;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError', 'QuotaExceededError');
    });

    const { result: browserHook } = renderHook(() =>
      useLocalStorage<string>('sideflow_quota_test', 'initial')
    );
    act(() => {
      browserHook.current[1]('updated-beyond-5mb');
    });
    expect(browserHook.current[0]).toBe('updated-beyond-5mb');
  });

  it('restores a 7-day rolling snapshot end-to-end in <App /> (including sideflow_* keys, strictOfflineMode, and empty arrays)', async () => {
    const snapshotStore = {
      sideflow_drawers: [
        {
          id: 'drawer-restored',
          title: 'Restored Ops Drawer',
          collapsed: false,
          apps: [
            {
              id: 'app-discord',
              name: 'Discord Work',
              cmd: 'C:\\Users\\Local\\AppData\\Local\\Discord\\Update.exe',
              args: '--processStart "Discord.exe"',
              icon: 'cpu',
              color: 'indigo',
            },
          ],
        },
      ],
      sideflow_notes: [],
      sideflow_pinned: false,
      sideflow_strict_offline: true,
    };

    const launchNativeAppMock = vi.fn().mockResolvedValue({ success: true });
    window.sideflow = {
      isElectron: true,
      getInitialStoreSnapshot: () => ({
        __sideflow_store_v2_migrated: true,
      }),
      storeGetAll: vi.fn().mockResolvedValue({}),
      storeSet: vi.fn(),
      launchNativeApp: launchNativeAppMock,
      listStoreBackups: vi.fn().mockResolvedValue({
        backups: [
          {
            fileName: 'sideflow-backup-2026-11-13.json',
            filePath: 'C:\\backups\\sideflow-backup-2026-11-13.json',
            createdAt: 1700000000000,
            sizeBytes: 4096,
          },
        ],
        storePath: 'C:\\sideflow-config.json',
        backupsDir: 'C:\\backups',
      }),
      restoreStoreBackup: vi.fn().mockResolvedValue({
        success: true,
        store: snapshotStore,
      }),
    } as unknown as typeof window.sideflow;

    await act(async () => {
      render(<App />);
    });

    // Navigate to Config tab and click Restore on the rolling snapshot
    fireEvent.click(
      screen.getByRole('tab', { name: /Shortcut & Tray Settings/i })
    );

    const restoreBtn = await screen.findByTestId(
      'restore-snapshot-btn-sideflow-backup-2026-11-13.json'
    );
    await act(async () => {
      fireEvent.click(restoreBtn);
    });

    // Strict Offline Mode checkbox in Settings reflects restored `sideflow_strict_offline: true`
    await waitFor(() => {
      expect(
        (screen.getByTestId('setting-strict-offline') as HTMLInputElement).checked
      ).toBe(true);
    });
    expect(screen.getByTestId('pin-badge')).toHaveTextContent('Auto-Hide');

    // Switch back to Dock tab -> Restored drawer is live, and launching Discord passes tokenized .lnk args!
    fireEvent.click(screen.getByRole('tab', { name: /Dock/i }));
    expect(
      screen.getByRole('button', { name: /Launch Discord Work/i })
    ).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /Launch Discord Work/i })
      );
    });
    expect(launchNativeAppMock).toHaveBeenCalledWith(
      'C:\\Users\\Local\\AppData\\Local\\Discord\\Update.exe',
      ['--processStart', 'Discord.exe']
    );
  });
});
