import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

export const ICON_PROTOCOL_SCHEME = 'sideflow-icon';

const RASTER_DATA_URL_REGEX =
  /^data:image\/(png|jpeg|jpg|webp|bmp|x-icon|vnd\.microsoft\.icon);base64,([A-Za-z0-9+/=\s]+)$/i;

function mimeSubtypeToExt(subtype: string): string {
  const lower = subtype.toLowerCase();
  if (lower === 'jpeg' || lower === 'jpg') return 'jpg';
  if (lower === 'webp') return 'webp';
  if (lower === 'bmp') return 'bmp';
  if (lower.includes('icon')) return 'ico';
  return 'png';
}

export function getExtMimeType(ext: string): string {
  switch (ext.replace(/^\./, '').toLowerCase()) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'bmp':
      return 'image/bmp';
    case 'ico':
      return 'image/x-icon';
    default:
      return 'image/png';
  }
}

/**
 * Persists a raster `data:image/*;base64,...` icon into `cacheDir/<sha1>.<ext>`
 * and returns a compact `sideflow-icon://cache/<sha1>.<ext>` URL (~54 bytes vs 30–150 KB).
 * Leaves tiny SVG fallback icons or existing `sideflow-icon://` URLs untouched.
 */
export function cacheRasterIconDataUrl(
  cacheDir: string,
  dataUrl: string | null | undefined
): string | null {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const trimmed = dataUrl.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith(`${ICON_PROTOCOL_SCHEME}://`)) {
    return trimmed;
  }

  const match = trimmed.match(RASTER_DATA_URL_REGEX);
  if (!match) {
    return trimmed;
  }

  try {
    const ext = mimeSubtypeToExt(match[1]);
    const bytes = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
    if (bytes.length === 0) return trimmed;

    const hash = crypto.createHash('sha1').update(bytes).digest('hex');
    const fileName = `${hash}.${ext}`;
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    const targetPath = path.join(cacheDir, fileName);
    if (!fs.existsSync(targetPath)) {
      const tmpPath = `${targetPath}.${process.pid}.tmp`;
      fs.writeFileSync(tmpPath, bytes);
      try {
        fs.renameSync(tmpPath, targetPath);
      } catch {
        if (!fs.existsSync(targetPath)) {
          fs.writeFileSync(targetPath, bytes);
        }
        try {
          if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
        } catch {
          // ignore
        }
      }
    }
    return `${ICON_PROTOCOL_SCHEME}://cache/${fileName}`;
  } catch {
    return trimmed;
  }
}

/**
 * Resolves a `sideflow-icon://cache/<sha1>.<ext>` URL strictly within `cacheDir`,
 * rejecting path traversal or non-hashed filenames.
 */
export function resolveCachedIconFilePath(
  cacheDir: string,
  requestUrl: string
): string | null {
  if (!requestUrl || typeof requestUrl !== 'string') return null;
  try {
    const parsed = new URL(requestUrl);
    if (parsed.protocol !== `${ICON_PROTOCOL_SCHEME}:`) return null;
    const rawCandidate = decodeURIComponent(
      parsed.pathname.replace(/^\/+/, '') || parsed.hostname
    );
    const baseName = path.basename(rawCandidate);
    if (!/^[a-f0-9]{40}\.(png|jpg|webp|bmp|ico)$/i.test(baseName)) {
      return null;
    }
    const fullPath = path.resolve(cacheDir, baseName);
    const resolvedRoot = path.resolve(cacheDir);
    if (
      !fullPath.startsWith(`${resolvedRoot}${path.sep}`) &&
      fullPath !== path.join(resolvedRoot, baseName)
    ) {
      return null;
    }
    return fs.existsSync(fullPath) ? fullPath : null;
  } catch {
    return null;
  }
}

/**
 * One-time / idempotent boot migration that externalizes inline base64 raster PNG icons
 * inside `store.sideflow_drawers` to `userData/icon-cache/`, shrinking `sideflow-config.json`
 * from multi-MB down to <100 KB.
 */
export function migrateDrawerIconsInStore(
  store: Record<string, unknown>,
  cacheDir: string
): boolean {
  const drawers = store.sideflow_drawers;
  if (!Array.isArray(drawers)) return false;

  let changed = false;
  const nextDrawers = drawers.map((drawer) => {
    if (!drawer || typeof drawer !== 'object') return drawer;
    const rawApps = (drawer as { apps?: unknown }).apps;
    if (!Array.isArray(rawApps)) return drawer;

    let drawerChanged = false;
    const nextApps = rawApps.map((appItem) => {
      if (!appItem || typeof appItem !== 'object') return appItem;
      const customIconUrl = (appItem as { customIconUrl?: unknown }).customIconUrl;
      if (typeof customIconUrl !== 'string' || !RASTER_DATA_URL_REGEX.test(customIconUrl)) {
        return appItem;
      }
      const externalUrl = cacheRasterIconDataUrl(cacheDir, customIconUrl);
      if (externalUrl && externalUrl !== customIconUrl) {
        drawerChanged = true;
        changed = true;
        return {
          ...(appItem as Record<string, unknown>),
          customIconUrl: externalUrl,
        };
      }
      return appItem;
    });

    return drawerChanged
      ? { ...(drawer as Record<string, unknown>), apps: nextApps }
      : drawer;
  });

  if (changed) {
    store.sideflow_drawers = nextDrawers;
  }
  return changed;
}
