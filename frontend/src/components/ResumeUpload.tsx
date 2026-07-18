import { FileUp, Loader2, Sparkles } from "lucide-react";
import { useCallback, useState } from "react";

interface Props {
  onFile: (file: File) => void;
  loading: boolean;
  fileName?: string | null;
}

export function ResumeUpload({ onFile, loading, fileName }: Props) {
  const [drag, setDrag] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDrag(false);
      const file = e.dataTransfer.files[0];
      if (file) onFile(file);
    },
    [onFile],
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={handleDrop}
      className={`relative overflow-hidden rounded-2xl border-2 border-dashed p-8 text-center transition ${
        drag
          ? "border-brand-400 bg-brand-500/10"
          : "border-panel-border bg-gradient-to-br from-panel-2/80 to-panel/80"
      }`}
    >
      <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-brand-500/10 blur-2xl" />
      <div className="relative mx-auto flex max-w-md flex-col items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/20 text-brand-300">
          {loading ? <Loader2 className="h-7 w-7 animate-spin" /> : <FileUp className="h-7 w-7" />}
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">Upload your resume</h3>
          <p className="mt-1 text-sm text-ink-2">
            PDF or DOCX — we&apos;ll auto-fill name, contact, experience, education & skills
          </p>
        </div>
        {fileName && (
          <p className="rounded-lg bg-panel-2 px-3 py-1.5 text-sm text-brand-300">{fileName}</p>
        )}
        <label className="btn-primary cursor-pointer px-5">
          <span className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            {loading ? "Parsing…" : "Choose file"}
          </span>
          <input
            type="file"
            accept=".pdf,.docx,.doc,.txt"
            className="hidden"
            disabled={loading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFile(file);
            }}
          />
        </label>
      </div>
    </div>
  );
}
