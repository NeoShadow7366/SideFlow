import { AccentColor, AppItem, DrawerSortMode } from '../types/sideflow';

export interface InferredAppMeta {
  name: string;
  icon: string;
  color: AccentColor;
}

const SAFE_URI_PROTOCOLS = new Set([
  'https:',
  'http:',
  'vscode:',
  'x-github-client:',
  'spotify:',
  'slack:',
  'figma:',
  'notion:',
  'obsidian:',
  'ms-calculator:',
  'mailto:',
  'app:',
  'shell:',
]);

export function extractFilenameFromPath(fullPath: string): string {
  const parts = fullPath.split(/[\\/]/);
  return parts[parts.length - 1] || fullPath;
}

const COLOR_HEX_PAIR: Record<AccentColor, [string, string]> = {
  indigo: ['#6366f1', '#312e81'],
  cyan: ['#06b6d4', '#164e63'],
  emerald: ['#10b981', '#064e3b'],
  amber: ['#f59e0b', '#78350f'],
  rose: ['#f43f5e', '#881337'],
  purple: ['#a855f7', '#581c87'],
};

export function generateShortcutIconDataUrl(
  name: string,
  color: AccentColor = 'indigo'
): string {
  const clean = (name || 'App').trim();
  const words = clean.split(/[\s._-]+/).filter(Boolean);
  const initials =
    words.length >= 2
      ? `${words[0][0]}${words[1][0]}`.toUpperCase()
      : clean.slice(0, 2).toUpperCase() || 'AP';
  const [c1, c2] = COLOR_HEX_PAIR[color] || COLOR_HEX_PAIR.indigo;
  const safeInitials = initials.replace(/[^A-Z0-9+#]/gi, '') || 'AP';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></linearGradient></defs><rect width="60" height="60" x="2" y="2" rx="14" fill="url(#g)" stroke="#ffffff" stroke-opacity="0.28" stroke-width="2"/><text x="32" y="39" text-anchor="middle" fill="#ffffff" font-family="Inter,system-ui,sans-serif" font-weight="700" font-size="22">${safeInitials}</text><circle cx="50" cy="14" r="6" fill="#0f172a" fill-opacity="0.75"/><path d="M47.5 16.5L52.5 11.5M52.5 11.5H48.5M52.5 11.5V15.5" stroke="#e2e8f0" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function inferAppMetaFromFilename(filenameOrPath: string): InferredAppMeta {
  const filename = extractFilenameFromPath(filenameOrPath);
  const lower = filename.toLowerCase();
  const cleanName = filename.replace(
    /\.(exe|lnk|appref-ms|app|bat|cmd|sh|ps1|url|py|js|ts|html|htm|pdf|docx|xlsx|mp3|wav|flac|mp4|mkv|fig|psd|ai|png|svg|jpg|jpeg)$/i,
    ''
  );
  const displayTitle = cleanName
    ? cleanName.charAt(0).toUpperCase() + cleanName.slice(1)
    : filename;

  if (
    lower.endsWith('.exe') ||
    lower.endsWith('.app') ||
    lower.endsWith('.lnk') ||
    lower.endsWith('.appref-ms')
  ) {
    return { name: displayTitle, icon: 'cpu', color: 'indigo' };
  }
  if (
    lower.endsWith('.bat') ||
    lower.endsWith('.cmd') ||
    lower.endsWith('.sh') ||
    lower.endsWith('.ps1') ||
    lower.endsWith('.py') ||
    lower.endsWith('.js') ||
    lower.endsWith('.ts')
  ) {
    return { name: displayTitle, icon: 'terminal', color: 'emerald' };
  }
  if (lower.endsWith('.url') || lower.endsWith('.html') || lower.endsWith('.htm')) {
    return { name: displayTitle, icon: 'globe', color: 'cyan' };
  }
  if (/\.(mp3|wav|flac|mp4|mkv)$/.test(lower)) {
    return { name: displayTitle, icon: 'music', color: 'rose' };
  }
  if (/\.(fig|psd|ai|png|svg|jpg|jpeg)$/.test(lower)) {
    return { name: displayTitle, icon: 'figma', color: 'amber' };
  }
  return { name: displayTitle || filename, icon: 'file-text', color: 'purple' };
}

export function resolveDroppedFilePath(
  file: File,
  fallbackBaseDir = 'C:\\Users\\Local\\Desktop'
): string {
  if (window.sideflow?.getPathForFile) {
    const resolved = window.sideflow.getPathForFile(file);
    if (resolved && resolved !== file.name) {
      return resolved;
    }
  }
  const nativeFile = file as File & { path?: string };
  if (nativeFile.path) {
    return nativeFile.path;
  }
  const lowerName = (file.name || '').toLowerCase();
  if (lowerName.endsWith('.appref-ms')) {
    return `C:\\Users\\Local\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\${file.name}`;
  }
  return `${fallbackBaseDir}\\${file.name}`;
}

export async function fetchNativeFileIcon(
  filePath: string
): Promise<string | undefined> {
  if (!filePath) {
    return undefined;
  }
  if (window.sideflow?.resolveShortcutItem) {
    try {
      const resolved = await window.sideflow.resolveShortcutItem(filePath);
      if (
        resolved?.iconDataUrl &&
        typeof resolved.iconDataUrl === 'string' &&
        resolved.iconDataUrl.startsWith('data:image/')
      ) {
        return resolved.iconDataUrl;
      }
    } catch {
      // Fall through to extractFileIcon
    }
  }
  if (!window.sideflow?.extractFileIcon) {
    return undefined;
  }
  try {
    const dataUrl = await window.sideflow.extractFileIcon(filePath);
    if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image/')) {
      return dataUrl;
    }
  } catch {
    // Ignore extraction failure and fall back to vector icon
  }
  return undefined;
}

export async function resolveShortcutMetadata(
  rawPathOrName: string,
  fallbackName?: string,
  fallbackColor: AccentColor = 'indigo'
): Promise<{
  name: string;
  cmd: string;
  customIconUrl: string;
}> {
  const meta = inferAppMetaFromFilename(fallbackName || rawPathOrName);
  const effectiveColor = fallbackColor || meta.color;
  let resolvedName = fallbackName || meta.name;
  let resolvedCmd = rawPathOrName;

  if (window.sideflow?.resolveShortcutItem) {
    try {
      const details = await window.sideflow.resolveShortcutItem(rawPathOrName);
      if (details) {
        if (details.cmd) {
          resolvedCmd = details.cmd;
        }
        if (!fallbackName && details.name) {
          resolvedName = details.name;
        }
        if (
          details.iconDataUrl &&
          details.iconDataUrl.startsWith('data:image/')
        ) {
          return {
            name: resolvedName,
            cmd: resolvedCmd,
            customIconUrl: details.iconDataUrl,
          };
        }
      }
    } catch {
      // Fall through
    }
  }

  const nativeIcon = await fetchNativeFileIcon(resolvedCmd);
  return {
    name: resolvedName,
    cmd: resolvedCmd,
    customIconUrl:
      nativeIcon || generateShortcutIconDataUrl(resolvedName, effectiveColor),
  };
}

export function parseDroppedShortcutItems(
  dataTransfer: DataTransfer | null | undefined
): AppItem[] {
  if (!dataTransfer) return [];
  const newApps: AppItem[] = [];
  const files = dataTransfer.files;

  if (files && files.length > 0) {
    Array.from(files).forEach((file) => {
      const nativePath = resolveDroppedFilePath(file);
      const meta = inferAppMetaFromFilename(file.name);
      newApps.push({
        id: `app-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: meta.name,
        cmd: nativePath,
        icon: meta.icon,
        color: meta.color,
        customIconUrl: generateShortcutIconDataUrl(meta.name, meta.color),
      });
    });
    return newApps;
  }

  const rawText =
    dataTransfer.getData('text/uri-list') ||
    dataTransfer.getData('text/plain') ||
    '';
  const firstLine = rawText
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('#'));

  if (!firstLine) return [];

  const cleanLine = firstLine.replace(/^["']|["']$/g, '').trim();

  // 1. file:// URI (e.g., dragged from Windows Start Menu / Taskbar / Explorer)
  if (cleanLine.toLowerCase().startsWith('file://')) {
    let decodedPath = cleanLine.replace(/^file:\/\/\/?/i, '');
    try {
      decodedPath = decodeURIComponent(decodedPath);
    } catch {
      // keep raw
    }
    if (/^[A-Za-z]:/.test(decodedPath)) {
      decodedPath = decodedPath.replace(/\//g, '\\');
    }
    const meta = inferAppMetaFromFilename(decodedPath);
    newApps.push({
      id: `app-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: meta.name,
      cmd: decodedPath,
      icon: meta.icon,
      color: meta.color,
      customIconUrl: generateShortcutIconDataUrl(meta.name, meta.color),
    });
    return newApps;
  }

  // 2. Local Windows path, Start Menu / Taskbar .lnk / .appref-ms / .exe, or shell:AppsFolder URI
  if (
    /^[A-Za-z]:[\\/]/.test(cleanLine) ||
    /\.(lnk|appref-ms|exe|app|bat|cmd|ps1|url)$/i.test(cleanLine) ||
    cleanLine.toLowerCase().startsWith('shell:')
  ) {
    const meta = inferAppMetaFromFilename(cleanLine);
    const hasDir = /[\\/]/.test(cleanLine) || cleanLine.toLowerCase().startsWith('shell:');
    const cmdPath = hasDir
      ? cleanLine
      : `C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\${cleanLine}`;
    newApps.push({
      id: `app-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: meta.name,
      cmd: cmdPath,
      icon: meta.icon,
      color: meta.color,
      customIconUrl: generateShortcutIconDataUrl(meta.name, meta.color),
    });
    return newApps;
  }

  // 3. Web URL or protocol URI
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(cleanLine)) {
    const label =
      cleanLine.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, '').split('/')[0] ||
      'Web Shortcut';
    newApps.push({
      id: `app-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: label,
      cmd: cleanLine,
      icon: 'globe',
      color: 'cyan',
      customIconUrl: generateShortcutIconDataUrl(label, 'cyan'),
    });
    return newApps;
  }

  // 4. Bare application name dragged from Start Menu / Taskbar virtual shell list
  const meta = inferAppMetaFromFilename(`${cleanLine}.lnk`);
  newApps.push({
    id: `app-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: meta.name,
    cmd: `C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\${cleanLine}.lnk`,
    icon: meta.icon,
    color: meta.color,
    customIconUrl: generateShortcutIconDataUrl(meta.name, meta.color),
  });
  return newApps;
}

export function extractCommandTypeKey(cmd: string): string {
  const trimmed = (cmd || '').trim().toLowerCase();
  const protoMatch = trimmed.match(/^([a-z0-9+.-]+):/);
  if (protoMatch && protoMatch[1].length > 1) {
    return `uri:${protoMatch[1]}`;
  }
  const extMatch = trimmed.match(/\.([a-z0-9]+)$/);
  return extMatch ? `ext:${extMatch[1]}` : 'file';
}

export function sortDrawerApps(
  apps: AppItem[],
  sortBy?: DrawerSortMode
): AppItem[] {
  if (!sortBy || sortBy === 'manual') {
    return apps;
  }
  if (sortBy === 'name') {
    return [...apps].sort((a, b) => a.name.localeCompare(b.name));
  }
  if (sortBy === 'type') {
    return [...apps].sort((a, b) => {
      const typeCmp = extractCommandTypeKey(a.cmd).localeCompare(
        extractCommandTypeKey(b.cmd)
      );
      return typeCmp !== 0 ? typeCmp : a.name.localeCompare(b.name);
    });
  }
  return apps;
}

export async function buildFolderDrawerApps(dirPath: string): Promise<AppItem[]> {
  const cleanDir = dirPath.trim().replace(/[\\/]+$/, '');
  if (!cleanDir) return [];

  if (window.sideflow?.readDirectoryItems) {
    try {
      const entries = await window.sideflow.readDirectoryItems(cleanDir);
      if (Array.isArray(entries)) {
        const items: AppItem[] = await Promise.all(
          entries.map(async (entry, idx) => {
            if (entry.isDirectory) {
              return {
                id: `folder-item-${Date.now()}-${idx}`,
                name: entry.name,
                cmd: entry.path,
                icon: 'folder',
                color: 'amber' as AccentColor,
              };
            }
            const meta = inferAppMetaFromFilename(entry.name);
            const customIconUrl =
              entry.iconDataUrl || (await fetchNativeFileIcon(entry.path));
            return {
              id: `folder-item-${Date.now()}-${idx}`,
              name: meta.name,
              cmd: entry.path,
              icon: meta.icon,
              color: meta.color,
              ...(customIconUrl ? { customIconUrl } : {}),
            };
          })
        );
        return items;
      }
    } catch {
      // Fall through to simulated items
    }
  }

  // Browser simulation fallback for Live Folder-View Drawers
  const sep = cleanDir.includes('/') ? '/' : '\\';
  const sampleFiles = [
    'workspace-launcher.exe',
    'deploy-pipeline.ps1',
    'architecture-diagram.svg',
    'project-notes.pdf',
  ];
  return sampleFiles.map((fileName, idx) => {
    const meta = inferAppMetaFromFilename(fileName);
    return {
      id: `folder-sim-${Date.now()}-${idx}`,
      name: meta.name,
      cmd: `${cleanDir}${sep}${fileName}`,
      icon: meta.icon,
      color: meta.color,
    };
  });
}

export async function executeAppCommand(
  command: string,
  args?: string[]
): Promise<{ success: boolean; error?: string }> {
  const trimmed = (command || '').trim().replace(/^["']|["']$/g, '').trim();
  if (!trimmed) {
    return { success: false, error: 'Empty command' };
  }

  // 1. Electron ContextBridge IPC
  if (window.sideflow?.launchNativeApp) {
    try {
      const res =
        args && args.length > 0
          ? await window.sideflow.launchNativeApp(trimmed, args)
          : await window.sideflow.launchNativeApp(trimmed);
      return res || { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Native launch failed',
      };
    }
  }

  // 2. Legacy Electron window.require fallback
  if (typeof window.require === 'function') {
    try {
      const electron = window.require('electron');
      if (electron.ipcRenderer?.send) {
        if (args && args.length > 0) {
          electron.ipcRenderer.send('launch-native-app', trimmed, args);
        } else {
          electron.ipcRenderer.send('launch-native-app', trimmed);
        }
        return { success: true };
      }
    } catch {
      // Fall through to browser handling
    }
  }

  // 3. Browser environment fallback with protocol validation
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    window.open(trimmed, '_blank', 'noopener,noreferrer');
    return { success: true };
  } else if (/^[a-zA-Z][a-zA-Z0-9+.-]+:/.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (!SAFE_URI_PROTOCOLS.has(parsed.protocol.toLowerCase())) {
        return {
          success: false,
          error: `Blocked disallowed URI protocol: ${parsed.protocol}`,
        };
      }
      const proto = parsed.protocol.toLowerCase();
      if (proto !== 'app:' && proto !== 'shell:') {
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = trimmed;
        document.body.appendChild(iframe);
        setTimeout(() => iframe.remove(), 2000);
      }
      return { success: true };
    } catch {
      return { success: false, error: 'Invalid URI format' };
    }
  }

  return { success: true };
}

const PROTOCOL_PROCESS_MAP: Record<string, string[]> = {
  'vscode:': ['code.exe', 'code'],
  'x-github-client:': ['githubdesktop.exe', 'github desktop.exe'],
  'spotify:': ['spotify.exe', 'spotify'],
  'slack:': ['slack.exe', 'slack'],
  'figma:': ['figma.exe', 'figma'],
  'notion:': ['notion.exe', 'notion'],
  'obsidian:': ['obsidian.exe', 'obsidian'],
  'ms-calculator:': ['calculatorapp.exe', 'calc.exe'],
};

export function isAppProcessRunning(
  app: AppItem,
  runningProcesses: string[],
  launchedAppIds: string[] = []
): boolean {
  if (launchedAppIds.includes(app.id)) {
    return true;
  }
  if (!runningProcesses || runningProcesses.length === 0) {
    return false;
  }
  const procSet = new Set(runningProcesses.map((p) => p.toLowerCase().trim()));
  const cmdTrimmed = (app.cmd || '').trim();
  if (!cmdTrimmed) return false;

  const protoMatch = cmdTrimmed.toLowerCase().match(/^([a-z0-9+.-]+:)/);
  if (protoMatch && PROTOCOL_PROCESS_MAP[protoMatch[1]]) {
    return PROTOCOL_PROCESS_MAP[protoMatch[1]].some((candidate) =>
      procSet.has(candidate)
    );
  }

  const filename = extractFilenameFromPath(cmdTrimmed).toLowerCase();
  if (!filename) return false;
  if (procSet.has(filename)) return true;
  const withoutExt = filename.replace(/\.(exe|app|lnk|bat|cmd|ps1|sh)$/i, '');
  if (withoutExt && (procSet.has(withoutExt) || procSet.has(`${withoutExt}.exe`))) {
    return true;
  }
  return false;
}

export function formatQuickHotkeyBadge(
  visibleIndex: number,
  customHotkey?: string
): string | undefined {
  const trimmed = (customHotkey || '').trim();
  if (trimmed) {
    return trimmed;
  }
  if (visibleIndex >= 0 && visibleIndex < 9) {
    return `Alt+${visibleIndex + 1}`;
  }
  return undefined;
}
