import React, { useState } from "react";
import { X, ImagePlus, Loader2 } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { cn } from "@/lib/utils";

export default function PhotoUpload({ value = [], onChange, max = 5, label = "Add photos" }) {
  const [uploading, setUploading] = useState(false);

  const handleFiles = async (files) => {
    const remaining = max - value.length;
    const toUpload = Array.from(files).slice(0, remaining);
    if (!toUpload.length) return;
    setUploading(true);
    try {
      const uploaded = [];
      for (const file of toUpload) {
        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}-${file.name}`;
        const { error } = await supabase.storage.from("documents").upload(fileName, file);
        if (error) throw error;
        const { data } = supabase.storage.from("documents").getPublicUrl(fileName);
        uploaded.push(data.publicUrl);
      }
      onChange([...value, ...uploaded]);
    } catch (e) {
      console.error(e);
    } finally {
      setUploading(false);
    }
  };

  const removeAt = (i) => onChange(value.filter((_, idx) => idx !== i));

  return (
    <div>
      <div className="grid grid-cols-3 gap-2.5">
        {value.map((url, i) => (
          <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-border bg-muted group">
            <img src={url} alt={`cargo ${i + 1}`} className="w-full h-full object-cover" />
            <button type="button" onClick={() => removeAt(i)} className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        {value.length < max && (
          <label className={cn("aspect-square rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-1.5 cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors", uploading && "pointer-events-none opacity-60")}>
            {uploading ? <Loader2 className="w-5 h-5 text-primary animate-spin" /> : (
              <>
                <ImagePlus className="w-5 h-5 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground font-medium">{label}</span>
              </>
            )}
            <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
          </label>
        )}
      </div>
      <p className="text-xs text-muted-foreground mt-2">Up to {max} photos · {value.length}/{max} added</p>
    </div>
  );
}