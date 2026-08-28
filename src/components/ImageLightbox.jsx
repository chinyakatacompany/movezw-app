import React, { useEffect } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

// Full-screen in-app image viewer. Exists because a plain <a target="_blank">
// on a photo works fine in a desktop browser tab, but inside the Android
// app's WebView it kicks the user out to an external browser/viewer instead
// of staying in the app — this renders the image in an overlay instead, so
// tapping a cargo photo or a chat attachment never leaves MoveZW.
export default function ImageLightbox({ images, index, onClose, onIndexChange }) {
  const open = index != null && images?.[index];

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onIndexChange?.((index - 1 + images.length) % images.length);
      if (e.key === "ArrowRight") onIndexChange?.((index + 1) % images.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, index, images, onClose, onIndexChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center animate-fade-in" onClick={onClose}>
      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white z-10"
      >
        <X className="w-5 h-5" />
      </button>

      {images.length > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); onIndexChange?.((index - 1 + images.length) % images.length); }}
          aria-label="Previous photo"
          className="absolute left-2 sm:left-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white z-10"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      )}

      <img
        src={images[index]}
        alt=""
        className="max-w-full max-h-full object-contain p-4 sm:p-10"
        onClick={(e) => e.stopPropagation()}
      />

      {images.length > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); onIndexChange?.((index + 1) % images.length); }}
            aria-label="Next photo"
            className="absolute right-2 sm:right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white z-10"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/70 text-xs font-medium">
            {index + 1} / {images.length}
          </div>
        </>
      )}
    </div>
  );
}
