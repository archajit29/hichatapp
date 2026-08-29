import React from 'react';
import { FileText } from 'lucide-react';

interface AttachmentPreviewProps {
  file: { name: string; size?: number } | null;
  onRemove: () => void;
}

export function AttachmentPreview({ file, onRemove }: AttachmentPreviewProps) {
  if (!file) return null;

  return (
    <div className="px-6 py-2.5 bg-purple-950/60 border-t border-purple-500/30 flex items-center justify-between text-xs text-purple-200 shrink-0">
      <div className="flex items-center gap-2">
        <FileText size={16} className="text-purple-400" />
        <span>
          Attached: <strong className="text-white">{file.name}</strong>{' '}
          {file.size ? `(${(file.size / 1024).toFixed(1)} KB)` : ''}
        </span>
      </div>
      <button
        type="button"
        className="text-rose-400 font-bold hover:underline cursor-pointer"
        onClick={onRemove}
      >
        Remove
      </button>
    </div>
  );
}
