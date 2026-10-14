import React, { useState, useEffect } from 'react';
import { Share2, X, Copy, ExternalLink, RefreshCw } from 'lucide-react';
import { FlowchartState } from '../../types/sideflow';
import { generateMermaidCode, parseMermaidCode } from '../../utils/mermaid';
import { executeAppCommand } from '../../utils/fileMeta';

interface LucidModalProps {
  isOpen: boolean;
  flowData: FlowchartState;
  onClose: () => void;
  onUpdateFlowData?: (newFlow: FlowchartState) => void;
  onNotify: (title: string, icon?: string, subtitle?: string) => void;
}

export const LucidModal: React.FC<LucidModalProps> = ({
  isOpen,
  flowData,
  onClose,
  onUpdateFlowData,
  onNotify,
}) => {
  const [mermaidText, setMermaidText] = useState('');
  const [lucidUrl, setLucidUrl] = useState('https://lucid.app/documents');

  useEffect(() => {
    if (isOpen) {
      setMermaidText(generateMermaidCode(flowData));
    }
  }, [isOpen, flowData]);

  if (!isOpen) return null;

  const handleCopyMermaid = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(mermaidText);
      } else {
        const textarea = document.getElementById(
          'lucid-mermaid-output'
        ) as HTMLTextAreaElement | null;
        textarea?.select();
        document.execCommand('copy');
      }
    } catch {
      // Fallback
    }
    onNotify(
      'Copied Mermaid Syntax for Lucidchart',
      'check',
      'Ready to paste into Lucidchart'
    );
  };

  const handleApplyToCanvas = () => {
    const parsed = parseMermaidCode(mermaidText);
    if (parsed && onUpdateFlowData) {
      onUpdateFlowData(parsed);
      onNotify(
        'Synced Mermaid Code to Canvas',
        'check',
        `${parsed.nodes.length} nodes • ${parsed.edges.length} connections`
      );
      onClose();
    }
  };

  const handleOpenLucidchart = () => {
    const url = lucidUrl.trim() || 'https://lucid.app/documents';
    executeAppCommand(url);
    onNotify('Opening Lucidchart...', 'share-2', url);
  };

  return (
    <div
      id="modal-lucid"
      role="dialog"
      aria-modal="true"
      aria-label="Lucidchart Integration Hub"
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Share2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">
                Lucidchart Integration Hub
              </h3>
              <p className="text-[11px] text-slate-400">
                Import your on-the-fly diagram directly into Lucidchart or sync
                Mermaid code
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close Lucidchart modal"
            onClick={onClose}
            className="text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label
              htmlFor="lucid-mermaid-output"
              className="text-xs font-medium text-slate-300"
            >
              Mermaid.js Code (Paste into Lucidchart: Insert → Mermaid)
            </label>
            <div className="flex items-center gap-3">
              {onUpdateFlowData && (
                <button
                  type="button"
                  onClick={handleApplyToCanvas}
                  className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                  title="Parse edited Mermaid code back onto the canvas"
                >
                  <RefreshCw className="w-3 h-3" /> Sync to Canvas
                </button>
              )}
              <button
                type="button"
                onClick={handleCopyMermaid}
                className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
              >
                <Copy className="w-3 h-3" /> Copy Code
              </button>
            </div>
          </div>
          <textarea
            id="lucid-mermaid-output"
            value={mermaidText}
            onChange={(e) => setMermaidText(e.target.value)}
            className="w-full h-36 bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-xs text-emerald-300 focus:outline-none focus:border-indigo-500 select-text"
          />
        </div>

        <div className="p-3 rounded-xl bg-slate-950/90 border border-slate-800 space-y-2">
          <label
            htmlFor="lucid-url-input"
            className="text-xs font-medium text-slate-300 block"
          >
            Or Launch / Open a Lucidchart Document directly
          </label>
          <div className="flex gap-2">
            <input
              id="lucid-url-input"
              type="text"
              value={lucidUrl}
              onChange={(e) => setLucidUrl(e.target.value)}
              className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white"
            />
            <button
              type="button"
              onClick={handleOpenLucidchart}
              className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs flex items-center gap-1 shrink-0"
            >
              <span>Open Lucidchart</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
