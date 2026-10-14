import { contextBridge, ipcRenderer, webUtils } from 'electron';

export interface SideFlowElectronAPI {
  isElectron: boolean;
  launchNativeApp: (command: string) => Promise<{ success: boolean; error?: string }>;
  updateGlobalShortcut: (accelerator: string) => Promise<boolean>;
  setPanelVisibility: (visible: boolean) => void;
  openFileDialog: () => Promise<string[]>;
  getPathForFile: (file: File) => string;
  onSetPanelVisibility: (callback: (visible: boolean) => void) => () => void;
  onSwitchTab: (callback: (tab: 'drawers' | 'flowchart' | 'notes' | 'settings') => void) => () => void;
  onWindowBlur: (callback: () => void) => () => void;
  storeGetAll: () => Promise<Record<string, unknown>>;
  storeSet: (key: string, value: unknown) => void;
}

const sideflowAPI: SideFlowElectronAPI = {
  isElectron: true,
  launchNativeApp: (command: string) => ipcRenderer.invoke('launch-native-app', command),
  updateGlobalShortcut: (accelerator: string) =>
    ipcRenderer.invoke('update-global-shortcut', accelerator),
  setPanelVisibility: (visible: boolean) => ipcRenderer.send('set-panel-visibility', visible),
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  getPathForFile: (file: File) => {
    try {
      if (webUtils && typeof webUtils.getPathForFile === 'function') {
        return webUtils.getPathForFile(file);
      }
      return (file as File & { path?: string }).path || file.name;
    } catch {
      return (file as File & { path?: string }).path || file.name;
    }
  },
  onSetPanelVisibility: (callback: (visible: boolean) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, visible: boolean) => callback(visible);
    ipcRenderer.on('set-panel-visibility', listener);
    return () => ipcRenderer.removeListener('set-panel-visibility', listener);
  },
  onSwitchTab: (
    callback: (tab: 'drawers' | 'flowchart' | 'notes' | 'settings') => void
  ) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      tab: 'drawers' | 'flowchart' | 'notes' | 'settings'
    ) => callback(tab);
    ipcRenderer.on('switch-tab', listener);
    return () => ipcRenderer.removeListener('switch-tab', listener);
  },
  onWindowBlur: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('window-blur', listener);
    return () => ipcRenderer.removeListener('window-blur', listener);
  },
  storeGetAll: () => ipcRenderer.invoke('store-get-all'),
  storeSet: (key: string, value: unknown) => ipcRenderer.send('store-set', { key, value }),
};

contextBridge.exposeInMainWorld('sideflow', sideflowAPI);
