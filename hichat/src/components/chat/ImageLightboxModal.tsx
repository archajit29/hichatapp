import React from 'react';
import { X } from 'lucide-react';

interface ImageLightboxModalProps {
  imageUrl: string | null;
  onClose: () => void;
}

export function ImageLightboxModal({ imageUrl, onClose }: ImageLightboxModalProps) {
  if (!imageUrl) return null;

  return (
    <div
      className="fixed inset-0 bg-black/90 backdrop-blur-lg z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="relative max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl border border-white/20"
        onClick={(e) => e.stopPropagation()}
      >
        <img src={imageUrl} alt="Fullscreen View" className="w-full h-full object-contain" />
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full bg-black/70 text-white hover:bg-black cursor-pointer"
        >
          <X size={20} />
        </button>
      </div>
    </div>
  );
}
