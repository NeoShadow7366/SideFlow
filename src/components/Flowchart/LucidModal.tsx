import React, { useState, useEffect, useMemo } from 'react';
import {
  Share2,
  X,
  Copy,
  ExternalLink,
  RefreshCw,
  Download,
  Eye,
} from 'lucide-react';
import { FlowchartState, NotifyFn } from '../../types/sideflow';
import {
  generateMermaidCode,
  parseMermaidCode,
  renderCachedMermaidPreview,
} from '../../utils/mermaid';
import { executeAppCommand } from '../../utils/fileMeta';
import { Modal } from '../Modal';

interface LucidModalProps {
  isOpen: boolean;
  flowData: FlowchartState;
  onClose: () => void;
  onUpdateFlowData?: (newFlow: FlowchartState) => void;
  onNotify: NotifyFn;
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
  const [parseError, setParseError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setMermaidText(generateMermaidCode(flowData));
      setParseError(null);
    }
  }, [isOpen, flowData]);

  const livePreview = useMemo(
    () => renderCachedMermaidPreview(mermaidText),
    [mermaidText]
  );

  const handleDownloadMermaid = () => {
    try {
      const blob = new Blob([mermaidText], {
        type: 'text/plain;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'sideflow-diagram.mmd';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      // Fallback in non-DOM test env
    }
    onNotify(
      'Downloaded Mermaid File (.mmd)',
      'download',
      'sideflow-diagram.mmd saved',
      { variant: 'success' }
    );
  };

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
      'Ready to paste into Lucidchart',
      { variant: 'success' }
    );
  };

  const handleApplyToCanvas = () => {
    const parsed = parseMermaidCode(mermaidText, flowData.nodes);
    if (!parsed) {
      setParseError(
        'Could not parse Mermaid code. Include at least one node (e.g., n1["Step"]) or connection (n1 --> n2).'
      );
      onNotify(
        'Invalid Mermaid Syntax',
        'zap',
        'Check node or arrow syntax and try again',
        { variant: 'error' }
      );
      return;
    }

    setParseError(null);
    if (onUpdateFlowData) {
      onUpdateFlowData(parsed);
      onNotify(
        'Synced Mermaid Code to Canvas',
        'check',
        `${parsed.nodes.length} nodes • ${parsed.edges.length} connections`,
        { variant: 'success' }
      );
      onClose();
    }
  };

  const handleOpenLucidchart = async () => {
    const url = lucidUrl.trim() || 'https://lucid.app/documents';
    onNotify('Opening Lucidchart...', 'share-2', url);
    const res = await executeAppCommand(url);
    if (res && !res.success && res.error) {
      onNotify('Unable to Open Lucidchart', 'zap', res.error, {
        variant: 'error',
      });
    }
  };

  return (
    <Modal
      id="modal-lucid"
      isOpen={isOpen}
      onClose={onClose}
      ariaLabel="Lucidchart Integration Hub"
      maxWidthClass="max-w-lg"
      panelClassName="border-slate-700 space-y-4"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
            <Share2 className="w-4 h-4" aria-hidden="true" />
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
          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <label
            htmlFor="lucid-mermaid-output"
            className="text-xs font-medium text-slate-300"
          >
            Mermaid.js Code (Paste into Lucidchart: Insert → Mermaid)
          </label>
          <div className="flex items-center gap-2">
            {onUpdateFlowData && (
              <button
                type="button"
                onClick={handleApplyToCanvas}
                className="px-2 py-1 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-500/30 text-xs text-emerald-300 hover:text-emerald-200 flex items-center gap-1 transition"
                title="Parse edited Mermaid code back onto the canvas"
              >
                <RefreshCw className="w-3 h-3" aria-hidden="true" /> Sync to
                Canvas
              </button>
            )}
            <button
              type="button"
              data-testid="lucid-download-mmd-btn"
              onClick={handleDownloadMermaid}
              title="Download diagram as a standalone .mmd Mermaid file"
              className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-slate-200 hover:text-white flex items-center gap-1 transition"
            >
              <Download className="w-3 h-3" aria-hidden="true" /> .mmd
            </button>
            <button
              type="button"
              onClick={handleCopyMermaid}
              className="px-2 py-1 rounded-lg bg-indigo-950/60 hover:bg-indigo-900/60 border border-indigo-500/30 text-xs text-indigo-300 hover:text-indigo-200 flex items-center gap-1 transition"
            >
              <Copy className="w-3 h-3" aria-hidden="true" /> Copy Code
            </button>
          </div>
        </div>
        <textarea
          id="lucid-mermaid-output"
          value={mermaidText}
          onChange={(e) => {
            setMermaidText(e.target.value);
            if (parseError) setParseError(null);
          }}
          className="w-full h-36 bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-xs text-emerald-300 focus:outline-none focus:border-indigo-500 select-text"
        />
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400 font-mono">
          <span>{`Shapes: ["Box"] {"Dec"} (["Term"]) [("DB")] [["Sub"]] [/"IO"/] (("Circ")) {{"Hex"}} >"Flag"]`}</span>
          <span>•</span>
          <span>{`Links: --> -.-> ==> <--> --- --o --x`}</span>
          <span>•</span>
          <span>Dirs: TD LR BT RL</span>
        </div>
        {parseError && (
          <p
            role="alert"
            className="text-[11px] text-rose-300 bg-rose-950/50 border border-rose-500/40 rounded-lg px-2.5 py-1.5"
          >
            {parseError}
          </p>
        )}

        {/* Live Rendered SVG Preview */}
        {livePreview.svgMarkup && livePreview.laidOut && (
          <div
            data-testid="lucid-live-svg-preview"
            className="rounded-xl bg-slate-950 border border-slate-800 overflow-hidden"
          >
            <div className="px-2.5 py-1 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between text-[10px] text-slate-300">
              <span className="flex items-center gap-1 font-medium text-indigo-300">
                <Eye className="w-3 h-3" aria-hidden="true" />
                <span>Live Diagram Preview</span>
              </span>
              <span className="font-mono text-slate-400">
                {livePreview.laidOut.nodes.length} nodes •{' '}
                {livePreview.laidOut.edges.length} links
              </span>
            </div>
            <div
              className="max-h-36 overflow-auto p-2 flex items-center justify-center [&>svg]:max-h-32 [&>svg]:w-auto"
              dangerouslySetInnerHTML={{ __html: livePreview.svgMarkup }}
            />
          </div>
        )}
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
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleOpenLucidchart();
            }}
            className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white"
          />
          <button
            type="button"
            onClick={handleOpenLucidchart}
            className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs flex items-center gap-1 shrink-0"
          >
            <span>Open Lucidchart</span>
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </Modal>
  );
};
