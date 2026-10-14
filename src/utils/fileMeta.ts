import { AccentColor } from '../types/sideflow';

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
]);

export function extractFilenameFromPath(fullPath: string): string {
  const parts = fullPath.split(/[\\/]/);
  return parts[parts.length - 1] || fullPath;
}

export function inferAppMetaFromFilename(filenameOrPath: string): InferredAppMeta {
  const filename = extractFilenameFromPath(filenameOrPath);
  const lower = filename.toLowerCase();
  const cleanName = filename.replace(
    /\.(exe|lnk|app|bat|cmd|sh|ps1|url|py|js|ts|html|htm|pdf|docx|xlsx|mp3|wav|flac|mp4|mkv|fig|psd|ai|png|svg|jpg|jpeg)$/i,
    ''
  );
  const displayTitle = cleanName
    ? cleanName.charAt(0).toUpperCase() + cleanName.slice(1)
    : filename;

  if (lower.endsWith('.exe') || lower.endsWith('.app') || lower.endsWith('.lnk')) {
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
  return `${fallbackBaseDir}\\${file.name}`;
}

export async function executeAppCommand(command: string): Promise<void> {
  const trimmed = (command || '').trim();
  if (!trimmed) return;

  // 1. Electron ContextBridge IPC
  if (window.sideflow?.launchNativeApp) {
    await window.sideflow.launchNativeApp(trimmed);
    return;
  }

  // 2. Legacy Electron window.require fallback
  if (typeof window.require === 'function') {
    try {
      const electron = window.require('electron');
      electron.ipcRenderer?.send('launch-native-app', trimmed);
      return;
    } catch {
      // Fall through to browser handling
    }
  }

  // 3. Browser environment fallback with protocol validation
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    window.open(trimmed, '_blank', 'noopener,noreferrer');
  } else if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (!SAFE_URI_PROTOCOLS.has(parsed.protocol.toLowerCase())) {
        return;
      }
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = trimmed;
      document.body.appendChild(iframe);
      setTimeout(() => iframe.remove(), 2000);
    } catch {
      // Ignore malformed URIs
    }
  }
}
