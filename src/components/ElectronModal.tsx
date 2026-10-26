import React from 'react';
import { Terminal, X, Copy } from 'lucide-react';
import { ELECTRON_WRAPPER_CODE } from '../utils/defaults';
import { NotifyFn } from '../types/sideflow';
import { Modal } from './Modal';

interface ElectronModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNotify: NotifyFn;
}

export const ElectronModal: React.FC<ElectronModalProps> = ({
  isOpen,
  onClose,
  onNotify,
}) => {
  const handleCopyCode = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(ELECTRON_WRAPPER_CODE);
      } else {
        const temp = document.createElement('textarea');
        temp.value = ELECTRON_WRAPPER_CODE;
        document.body.appendChild(temp);
        temp.select();
        document.execCommand('copy');
        temp.remove();
      }
    } catch {
      // ignore
    }
    onNotify(
      'Copied Electron main.ts',
      'check',
      'Ready for native System Tray deployment',
      { variant: 'success' }
    );
  };

  return (
    <Modal
      id="modal-electron"
      isOpen={isOpen}
      onClose={onClose}
      ariaLabel="Run SideFlow as a Native OS Background Tray App"
      maxWidthClass="max-w-2xl"
      panelClassName="border-slate-700 space-y-4 max-h-[90vh] flex flex-col"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300">
            <Terminal className="w-4 h-4" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">
              Run SideFlow as a Native OS Background Tray App
            </h3>
            <p className="text-[11px] text-slate-400">
              Electron main process script for System Tray, Global Shortcut
              &amp; .exe / .app Launching
            </p>
          </div>
        </div>
        <button
          type="button"
          aria-label="Close Electron modal"
          onClick={onClose}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      <div className="text-xs text-slate-300 space-y-1 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
        <p>
          1. Run{' '}
          <code className="text-emerald-300 font-mono">
            npm run electron:dev
          </code>{' '}
          to launch SideFlow with live HMR in the system tray.
        </p>
        <p>
          2. Or run{' '}
          <code className="text-indigo-300 font-mono">
            npm run electron:dist
          </code>{' '}
          to package a standalone native installer.
        </p>
      </div>

      <div className="relative flex-1 overflow-hidden flex flex-col">
        <button
          type="button"
          onClick={handleCopyCode}
          className="absolute top-2.5 right-2.5 px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs flex items-center gap-1 z-10"
        >
          <Copy className="w-3 h-3" aria-hidden="true" /> Copy main.ts
        </button>
        <pre
          id="electron-code-block"
          tabIndex={0}
          role="region"
          aria-label="Electron main.ts wrapper source code"
          className="flex-1 overflow-y-auto bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-[11px] text-sky-200 select-text leading-relaxed"
        >
          {ELECTRON_WRAPPER_CODE}
        </pre>
      </div>
    </Modal>
  );
};
