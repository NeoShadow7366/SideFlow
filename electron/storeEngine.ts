import * as fs from 'node:fs';
import * as path from 'node:path';

export interface StoreBackupInfo {
  fileName: string;
  filePath: string;
  createdAt: number;
  sizeBytes: number;
}

export const FORBIDDEN_STORE_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);

const RETRYABLE_FS_CODES = new Set(['EPERM', 'EBUSY', 'EACCES']);
const ASYNC_RENAME_DELAYS_MS = [15, 40, 90, 180];

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sleepSyncBusy(ms: number): void {
  const sab =
    typeof SharedArrayBuffer !== 'undefined' ? new SharedArrayBuffer(4) : null;
  if (sab) {
    try {
      Atomics.wait(new Int32Array(sab), 0, 0, ms);
      return;
    } catch {
      // Fall back to short spin if Atomics.wait is disallowed on current thread
    }
  }
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // brief bounded retry backoff (< 50ms) during process shutdown
  }
}

export async function renameWithWindowsBackoff(
  tmpPath: string,
  targetPath: string
): Promise<void> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= ASYNC_RENAME_DELAYS_MS.length; attempt += 1) {
    try {
      await fs.promises.rename(tmpPath, targetPath);
      return;
    } catch (err) {
      lastErr = err;
      const code = (err as NodeJS.ErrnoException | undefined)?.code || '';
      if (!RETRYABLE_FS_CODES.has(code) || attempt === ASYNC_RENAME_DELAYS_MS.length) {
        break;
      }
      await sleepMs(ASYNC_RENAME_DELAYS_MS[attempt]);
    }
  }
  throw lastErr;
}

export function renameSyncWithWindowsBackoff(
  tmpPath: string,
  targetPath: string
): void {
  const delays = [10, 25, 50];
  let lastErr: unknown;
  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    try {
      fs.renameSync(tmpPath, targetPath);
      return;
    } catch (err) {
      lastErr = err;
      const code = (err as NodeJS.ErrnoException | undefined)?.code || '';
      if (!RETRYABLE_FS_CODES.has(code) || attempt === delays.length) {
        break;
      }
      sleepSyncBusy(delays[attempt]);
    }
  }
  throw lastErr;
}

export function hasMeaningfulWorkspaceData(
  data: Record<string, unknown> | null | undefined
): boolean {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const meaningfulKeys = Object.keys(data).filter(
    (k) =>
      k !== 'sideflow_auto_onboarding' &&
      k !== '__sideflow_store_v2_migrated' &&
      data[k] !== undefined &&
      data[k] !== null
  );
  return meaningfulKeys.length > 0;
}

function isDailySnapshotName(fileName: string): boolean {
  return /^sideflow-backup-\d{4}-\d{2}-\d{2}\.json$/i.test(fileName);
}

export interface StoreEngineOptions {
  storePath: string;
  backupsDir: string;
  isPackaged?: boolean;
  maxDailyBackups?: number;
  maxManualBackups?: number;
  debounceMs?: number;
  backupIntervalMs?: number;
}

export class StoreEngine {
  private readonly storePath: string;
  private readonly backupsDir: string;
  private readonly isPackaged: boolean;
  private readonly maxDailyBackups: number;
  private readonly maxManualBackups: number;
  private readonly debounceMs: number;
  private readonly backupIntervalMs: number;

  private cachedStore: Record<string, unknown> | null = null;
  private writeSeq = 0;
  private flushedSeq = 0;
  private tempCounter = 0;
  private writeTimer: NodeJS.Timeout | null = null;
  private writeChain: Promise<void> = Promise.resolve();
  private lastBackupWrittenAt = 0;
  private lastRecoveredFromBackup: string | null = null;

  constructor(options: StoreEngineOptions) {
    this.storePath = options.storePath;
    this.backupsDir = options.backupsDir;
    this.isPackaged = Boolean(options.isPackaged);
    this.maxDailyBackups = options.maxDailyBackups ?? 7;
    this.maxManualBackups = options.maxManualBackups ?? 5;
    this.debounceMs = options.debounceMs ?? 350;
    this.backupIntervalMs = options.backupIntervalMs ?? 60000;
  }

  public getStorePath(): string {
    return this.storePath;
  }

  public getBackupsDir(): string {
    return this.backupsDir;
  }

  public getLastRecoveredFromBackup(): string | null {
    return this.lastRecoveredFromBackup;
  }

  public isDirty(): boolean {
    return this.writeSeq > this.flushedSeq;
  }

  private nextTempPath(targetPath: string, tag: string): string {
    this.tempCounter += 1;
    return `${targetPath}.${process.pid}.${tag}.${this.tempCounter}.tmp`;
  }

  public listBackupsSync(): StoreBackupInfo[] {
    try {
      if (!fs.existsSync(this.backupsDir)) return [];
      const entries = fs.readdirSync(this.backupsDir);
      const items: StoreBackupInfo[] = [];
      for (const name of entries) {
        if (!/^sideflow-backup-.*\.json$/i.test(name)) continue;
        const fullPath = path.join(this.backupsDir, name);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isFile()) {
            items.push({
              fileName: name,
              filePath: fullPath,
              createdAt: Math.round(stat.mtimeMs),
              sizeBytes: stat.size,
            });
          }
        } catch {
          // ignore unreadable snapshot
        }
      }
      items.sort((a, b) => b.createdAt - a.createdAt);
      return items;
    } catch {
      return [];
    }
  }

  private pruneBackupsSync(): void {
    const allBackups = this.listBackupsSync();
    const daily = allBackups.filter((b) => isDailySnapshotName(b.fileName));
    const manual = allBackups.filter((b) => !isDailySnapshotName(b.fileName));

    for (const stale of daily.slice(this.maxDailyBackups)) {
      try {
        fs.unlinkSync(stale.filePath);
      } catch {
        // ignore
      }
    }
    for (const stale of manual.slice(this.maxManualBackups)) {
      try {
        fs.unlinkSync(stale.filePath);
      } catch {
        // ignore
      }
    }
  }

  public writeBackupSnapshotSync(
    data: Record<string, unknown>,
    mode: 'daily' | 'manual' | 'pre-restore' = 'daily'
  ): StoreBackupInfo | null {
    try {
      if (!hasMeaningfulWorkspaceData(data)) return null;
      if (!fs.existsSync(this.backupsDir)) {
        fs.mkdirSync(this.backupsDir, { recursive: true });
      }
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');

      let fileName: string;
      if (mode === 'daily') {
        fileName = `sideflow-backup-${yyyy}-${mm}-${dd}.json`;
      } else {
        const hh = String(now.getHours()).padStart(2, '0');
        const min = String(now.getMinutes()).padStart(2, '0');
        const ss = String(now.getSeconds()).padStart(2, '0');
        const ms = String(now.getMilliseconds()).padStart(3, '0');
        const prefix = mode === 'pre-restore' ? 'pre-restore-' : 'manual-';
        fileName = `sideflow-backup-${prefix}${yyyy}-${mm}-${dd}-${hh}${min}${ss}-${ms}.json`;
      }

      const targetPath = path.join(this.backupsDir, fileName);

      // Never clobber an existing daily snapshot later the same day (preserves morning clean state)
      if (mode === 'daily' && fs.existsSync(targetPath)) {
        this.lastBackupWrittenAt = Date.now();
        const stat = fs.statSync(targetPath);
        return {
          fileName,
          filePath: targetPath,
          createdAt: Math.round(stat.mtimeMs),
          sizeBytes: stat.size,
        };
      }

      const tmpPath = this.nextTempPath(targetPath, 'bak');
      const serialized = JSON.stringify(data, null, 2);
      fs.writeFileSync(tmpPath, serialized, 'utf-8');
      renameSyncWithWindowsBackoff(tmpPath, targetPath);
      this.lastBackupWrittenAt = Date.now();

      this.pruneBackupsSync();

      const stat = fs.statSync(targetPath);
      return {
        fileName,
        filePath: targetPath,
        createdAt: Math.round(stat.mtimeMs),
        sizeBytes: stat.size,
      };
    } catch (err) {
      console.warn('[SideFlow] Failed to write backup snapshot:', err);
      return null;
    }
  }

  public read(): Record<string, unknown> {
    if (this.cachedStore) return this.cachedStore;
    try {
      if (fs.existsSync(this.storePath)) {
        const raw = fs.readFileSync(this.storePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          this.cachedStore = parsed as Record<string, unknown>;
          return this.cachedStore;
        }
      }
    } catch (err) {
      console.error(
        '[SideFlow] Failed to read local store, checking rolling backups:',
        err
      );
      const backups = this.listBackupsSync();
      for (const backup of backups) {
        try {
          const rawBackup = fs.readFileSync(backup.filePath, 'utf-8');
          const parsedBackup = JSON.parse(rawBackup);
          if (
            parsedBackup &&
            typeof parsedBackup === 'object' &&
            !Array.isArray(parsedBackup)
          ) {
            this.cachedStore = parsedBackup as Record<string, unknown>;
            this.lastRecoveredFromBackup = backup.fileName;
            const parentDir = path.dirname(this.storePath);
            if (!fs.existsSync(parentDir)) {
              fs.mkdirSync(parentDir, { recursive: true });
            }
            const tmpPath = this.nextTempPath(this.storePath, 'recover');
            fs.writeFileSync(
              tmpPath,
              JSON.stringify(this.cachedStore, null, 2),
              'utf-8'
            );
            renameSyncWithWindowsBackoff(tmpPath, this.storePath);
            return this.cachedStore;
          }
        } catch {
          // try next older backup
        }
      }
    }
    this.cachedStore = this.isPackaged ? { sideflow_auto_onboarding: true } : {};
    return this.cachedStore;
  }

  public persistAsync(): Promise<void> {
    if (!this.isDirty() || !this.cachedStore) {
      return this.writeChain;
    }
    const targetSeq = this.writeSeq;
    let snapshotObj: Record<string, unknown>;
    let serialized: string;
    try {
      serialized = JSON.stringify(this.cachedStore, null, 2);
      snapshotObj = JSON.parse(serialized) as Record<string, unknown>;
    } catch (err) {
      console.error('[SideFlow] Failed to serialize local store:', err);
      return this.writeChain;
    }

    const shouldWriteBackup =
      Date.now() - this.lastBackupWrittenAt > this.backupIntervalMs;

    this.writeChain = this.writeChain
      .then(async () => {
        if (targetSeq <= this.flushedSeq) return;
        const parentDir = path.dirname(this.storePath);
        if (!fs.existsSync(parentDir)) {
          await fs.promises.mkdir(parentDir, { recursive: true });
        }
        const tmpPath = this.nextTempPath(this.storePath, `async-${targetSeq}`);
        try {
          await fs.promises.writeFile(tmpPath, serialized, 'utf-8');
          await renameWithWindowsBackoff(tmpPath, this.storePath);
          this.flushedSeq = Math.max(this.flushedSeq, targetSeq);
          if (shouldWriteBackup) {
            this.writeBackupSnapshotSync(snapshotObj, 'daily');
          }
        } catch (err) {
          try {
            if (fs.existsSync(tmpPath)) await fs.promises.unlink(tmpPath);
          } catch {
            // ignore cleanup failure
          }
          throw err;
        }
      })
      .catch((err) => {
        console.error('[SideFlow] Failed to write local store asynchronously:', err);
      });

    return this.writeChain;
  }

  public flushSync(): void {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }
    if (!this.isDirty() || !this.cachedStore) return;
    const targetSeq = this.writeSeq;
    const tmpPath = this.nextTempPath(this.storePath, `sync-${targetSeq}`);
    try {
      const parentDir = path.dirname(this.storePath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      const serialized = JSON.stringify(this.cachedStore, null, 2);
      fs.writeFileSync(tmpPath, serialized, 'utf-8');
      renameSyncWithWindowsBackoff(tmpPath, this.storePath);
      this.flushedSeq = Math.max(this.flushedSeq, targetSeq);
      this.writeBackupSnapshotSync(this.cachedStore, 'daily');
    } catch (err) {
      try {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      } catch {
        // ignore
      }
      console.error('[SideFlow] Failed to flush local store synchronously:', err);
    }
  }

  public write(key: string, value: unknown): void {
    if (!key || FORBIDDEN_STORE_KEYS.has(key)) return;
    const current = this.read();
    if (value === null || value === undefined) {
      delete current[key];
    } else {
      current[key] = value;
    }
    this.writeSeq += 1;
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
    }
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      void this.persistAsync();
    }, this.debounceMs);
  }

  public replaceAllSync(nextStore: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(nextStore)) {
      if (!FORBIDDEN_STORE_KEYS.has(k) && v !== undefined && v !== null) {
        sanitized[k] = v;
      }
    }
    this.cachedStore = sanitized;
    this.writeSeq += 1;
    this.flushSync();
    return this.cachedStore;
  }

  public restoreBackupSync(fileName: string): {
    success: boolean;
    store?: Record<string, unknown>;
    error?: string;
  } {
    if (
      typeof fileName !== 'string' ||
      path.basename(fileName) !== fileName ||
      !/^sideflow-backup-[\w.-]+\.json$/i.test(fileName)
    ) {
      return { success: false, error: 'Invalid backup snapshot filename' };
    }
    try {
      const targetPath = path.join(this.backupsDir, fileName);
      if (!fs.existsSync(targetPath)) {
        return { success: false, error: 'Backup snapshot file not found' };
      }
      const raw = fs.readFileSync(targetPath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { success: false, error: 'Corrupt backup snapshot JSON' };
      }

      // Preserve pre-restore state in manual backup ring so restore itself is reversible
      const current = this.read();
      if (hasMeaningfulWorkspaceData(current)) {
        this.writeBackupSnapshotSync(current, 'pre-restore');
      }

      const nextStore = this.replaceAllSync(parsed as Record<string, unknown>);
      return {
        success: true,
        store: { ...nextStore },
      };
    } catch (err) {
      return {
        success: false,
        error:
          err instanceof Error ? err.message : 'Failed to restore snapshot',
      };
    }
  }
}
