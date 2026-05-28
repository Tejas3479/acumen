"use client";

import IngestionEngine from "@/components/IngestionEngine";

interface WorkspaceIdleProps {
  handleUploadComplete: (sid: string, fname: string) => Promise<void> | void;
  handleStartSynthesis: (sid: string) => Promise<void> | void;
}

export default function WorkspaceIdle({
  handleUploadComplete,
  handleStartSynthesis,
}: WorkspaceIdleProps) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center overflow-y-auto custom-scrollbar gap-8">
      <div className="w-full max-w-md animate-in fade-in zoom-in-95 duration-700">
        <IngestionEngine 
          mode="hero" 
          onUploadComplete={handleUploadComplete} 
          onStartSynthesis={handleStartSynthesis} 
        />
      </div>
    </div>
  );
}
