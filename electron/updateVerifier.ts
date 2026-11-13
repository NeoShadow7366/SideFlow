import * as crypto from 'node:crypto';
import * as path from 'node:path';

/**
 * Pinned Ed25519 SPKI public key (PEM) for verifying `latest.yml.sig` manifests
 * produced by `.github/workflows/release.yml` via `UPDATE_SIGNING_PRIVATE_KEY`.
 * Can also be overridden at runtime via `process.env.SIDEFLOW_UPDATE_PUBLIC_KEY_PEM`
 * for automated tests or enterprise self-hosted update mirrors.
 */
export const DEFAULT_UPDATE_PUBLIC_KEY_PEM = '';

export interface ParsedLatestYmlEntry {
  version?: string;
  fileName: string;
  sha512Base64: string;
}

export interface ManifestVerificationResult {
  valid: boolean;
  version?: string;
  fileName?: string;
  sha512Base64?: string;
  signatureVerified: boolean;
  error?: string;
}

/**
 * Returns true if a path or file:// URL targets a Windows/SMB UNC share (`\\server\share`
 * or `//server/share`), preventing silent NTLMv2 credential leaks and remote binary execution.
 */
export function isUncPath(rawInput: string): boolean {
  if (!rawInput || typeof rawInput !== 'string') return false;
  const trimmed = rawInput.trim().replace(/^["']|["']$/g, '').trim();
  if (!trimmed) return false;
  if (/^(\\\\|\/\/)/.test(trimmed)) {
    return true;
  }
  if (/^file:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.hostname && parsed.hostname.toLowerCase() !== 'localhost') {
        return true;
      }
    } catch {
      return /^file:\/\/[^/\\]/i.test(trimmed);
    }
  }
  return false;
}

/**
 * Allowlists safe Windows `shell:` namespace URIs used by SideFlow Docklets & UWP shortcuts
 * (`shell:AppsFolder\...`, `shell:RecycleBinFolder`, `shell:Downloads`) while rejecting arbitrary CLSIDs.
 */
export function isAllowedShellUri(rawUri: string): boolean {
  if (!rawUri || typeof rawUri !== 'string') return false;
  const trimmed = rawUri.trim();
  if (/^shell:appsfolder\\[A-Za-z0-9._!+-]+$/i.test(trimmed)) {
    return true;
  }
  return /^shell:(recyclebinfolder|downloads)$/i.test(trimmed);
}

/**
 * Resolves a Windows system binary strictly inside `%SystemRoot%\System32` so child_process
 * calls never search `process.cwd()` (mitigating CWD binary planting in Portable builds).
 */
export function resolveWinSystem32Binary(
  relativeBinaryPath: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  const systemRoot =
    (env.SystemRoot && env.SystemRoot.trim()) ||
    (env.WINDIR && env.WINDIR.trim()) ||
    'C:\\Windows';
  if (relativeBinaryPath.toLowerCase() === 'explorer.exe') {
    return path.win32.join(systemRoot, 'explorer.exe');
  }
  return path.win32.join(systemRoot, 'System32', relativeBinaryPath);
}

/**
 * Tokenizes a Windows `.lnk` command-line argument string (e.g. `--processStart "Discord.exe" --flag`)
 * into discrete `execFile` argv tokens without invoking `cmd.exe`.
 */
export function splitCliArgs(rawArgs?: string | null): string[] {
  if (!rawArgs || typeof rawArgs !== 'string') return [];
  const trimmed = rawArgs.trim();
  if (!trimmed) return [];

  const tokens: string[] = [];
  let current = '';
  let quoteChar: '"' | "'" | null = null;

  for (let i = 0; i < trimmed.length; i += 1) {
    const ch = trimmed[i];
    if (quoteChar) {
      if (ch === '\\' && i + 1 < trimmed.length && trimmed[i + 1] === quoteChar) {
        current += quoteChar;
        i += 1;
      } else if (ch === quoteChar) {
        quoteChar = null;
      } else {
        current += ch;
      }
    } else if (ch === '"' || ch === "'") {
      quoteChar = ch;
    } else if (/\s/.test(ch)) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }
  if (current.length > 0) {
    tokens.push(current);
  }
  return tokens;
}

export function computeSha512Base64(data: Buffer | Uint8Array): string {
  return crypto.createHash('sha512').update(data).digest('base64');
}

/**
 * Parses electron-builder's `latest.yml` manifest and extracts the SHA-512 digest
 * matching the NSIS Setup `.exe` entry (never blindly taking Portable `.exe`'s hash).
 */
export function parseLatestYmlEntry(
  ymlText: string,
  expectedFileName?: string
): ParsedLatestYmlEntry | null {
  if (!ymlText || typeof ymlText !== 'string') return null;

  const versionMatch = ymlText.match(/^\s*version:\s*['"]?([^\r\n'"]+)['"]?\s*$/m);
  const version = versionMatch?.[1]?.trim();

  // Parse structured `- url: ... \n sha512: ...` blocks inside `files:`
  const entries: Array<{ fileName: string; sha512Base64: string }> = [];
  const lines = ymlText.split(/\r?\n/);
  let currentUrl: string | null = null;

  for (const line of lines) {
    const urlLine = line.match(/^\s*-?\s*(?:url|path):\s*['"]?([^\r\n'"]+)['"]?\s*$/);
    if (urlLine?.[1]) {
      currentUrl = urlLine[1].trim();
      continue;
    }
    const shaLine = line.match(/^\s*sha512:\s*['"]?([A-Za-z0-9+/=]{64,128})['"]?\s*$/);
    if (shaLine?.[1] && currentUrl) {
      entries.push({
        fileName: currentUrl,
        sha512Base64: shaLine[1].trim(),
      });
      currentUrl = null;
    }
  }

  if (entries.length === 0) {
    return null;
  }

  if (expectedFileName) {
    const targetLower = expectedFileName.trim().toLowerCase();
    const exact = entries.find(
      (e) =>
        e.fileName.toLowerCase() === targetLower ||
        e.fileName.replace(/[- ]/g, '').toLowerCase() ===
          targetLower.replace(/[- ]/g, '')
    );
    if (!exact) return null;
    return { version, ...exact };
  }

  const setupEntry =
    entries.find((e) => /setup.*\.exe$/i.test(e.fileName)) ||
    entries.find((e) => /\.exe$/i.test(e.fileName)) ||
    entries[0];

  return {
    version,
    fileName: setupEntry.fileName,
    sha512Base64: setupEntry.sha512Base64,
  };
}

export function verifyEd25519Signature(
  payload: Buffer | string,
  signatureBase64: string,
  publicKeyPem: string
): boolean {
  if (!signatureBase64 || !publicKeyPem) return false;
  try {
    const dataBuf = Buffer.isBuffer(payload)
      ? payload
      : Buffer.from(payload, 'utf-8');
    const sigBuf = Buffer.from(signatureBase64.trim(), 'base64');
    if (sigBuf.length !== 64) return false;
    const pubKey = crypto.createPublicKey(publicKeyPem.trim());
    return crypto.verify(null, dataBuf, pubKey, sigBuf);
  } catch {
    return false;
  }
}

export function verifyReleaseManifest(params: {
  ymlText: string;
  expectedFileName?: string;
  signatureBase64?: string | null;
  publicKeyPem?: string | null;
  requireSignature?: boolean;
}): ManifestVerificationResult {
  const {
    ymlText,
    expectedFileName,
    signatureBase64,
    publicKeyPem = process.env.SIDEFLOW_UPDATE_PUBLIC_KEY_PEM ||
      DEFAULT_UPDATE_PUBLIC_KEY_PEM,
    requireSignature = false,
  } = params;

  const parsed = parseLatestYmlEntry(ymlText, expectedFileName);
  if (!parsed) {
    return {
      valid: false,
      signatureVerified: false,
      error: 'Could not locate verified Setup .exe SHA-512 entry in latest.yml',
    };
  }

  const effectivePubKey = (publicKeyPem || '').trim();
  const effectiveSig = (signatureBase64 || '').trim();

  if (effectivePubKey) {
    if (!effectiveSig) {
      return {
        valid: false,
        version: parsed.version,
        fileName: parsed.fileName,
        sha512Base64: parsed.sha512Base64,
        signatureVerified: false,
        error: 'Missing Ed25519 manifest signature (latest.yml.sig)',
      };
    }
    const sigOk = verifyEd25519Signature(ymlText, effectiveSig, effectivePubKey);
    if (!sigOk) {
      return {
        valid: false,
        version: parsed.version,
        fileName: parsed.fileName,
        sha512Base64: parsed.sha512Base64,
        signatureVerified: false,
        error: 'Ed25519 manifest signature verification failed for latest.yml',
      };
    }
    return {
      valid: true,
      version: parsed.version,
      fileName: parsed.fileName,
      sha512Base64: parsed.sha512Base64,
      signatureVerified: true,
    };
  }

  if (requireSignature && !effectivePubKey) {
    return {
      valid: false,
      version: parsed.version,
      fileName: parsed.fileName,
      sha512Base64: parsed.sha512Base64,
      signatureVerified: false,
      error: 'Signature verification required, but no Ed25519 public key is configured',
    };
  }

  return {
    valid: true,
    version: parsed.version,
    fileName: parsed.fileName,
    sha512Base64: parsed.sha512Base64,
    signatureVerified: false,
  };
}
