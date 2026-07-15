"use client";

import { useState } from "react";
import { ArrowLeft, Sparkles, Upload } from "lucide-react";
import { CreateWithAiPath } from "./CreateWithAiPath";
import { UploadMediaPath } from "./UploadMediaPath";

type Step = "choice" | "upload" | "ai";

interface ComposerProps {
  orgId: string;
  notify: (msg: string) => void;
  onExit: () => void;
  onSubmitted: () => void;
}

function EntryCard({
  icon,
  title,
  description,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="app-glass-card flex flex-col items-start gap-3 rounded-xl p-6 text-left transition-colors hover:border-nexus-approval-border"
    >
      <span className="glass-pill flex h-12 w-12 items-center justify-center rounded-xl text-nexus-approval">
        {icon}
      </span>
      <span className="nexus-section-title text-atmospheric-grey">{title}</span>
      <span className="text-sm leading-relaxed text-muted">{description}</span>
    </button>
  );
}

export function Composer({ orgId, notify, onExit, onSubmitted }: ComposerProps) {
  const [step, setStep] = useState<Step>("choice");

  const back = step === "choice" ? onExit : () => setStep("choice");

  return (
    <div className="space-y-8">
      <header className="hairline-b pb-6">
        <button
          type="button"
          onClick={back}
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-atmospheric-grey"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {step === "choice" ? "Back to posts" : "Back"}
        </button>
        <p className="nexus-meta text-nexus-approval">New Post</p>
        <h1 className="mt-3 nexus-app-title text-atmospheric-grey">
          {step === "choice"
            ? "How do you want to start?"
            : step === "upload"
              ? "Upload media"
              : "Create with AI"}
        </h1>
      </header>

      {step === "choice" ? (
        <div className="grid gap-5 sm:grid-cols-2">
          <EntryCard
            icon={<Upload className="h-6 w-6" aria-hidden />}
            title="Upload Media"
            description="Start from your own image, then generate per-platform captions."
            onClick={() => setStep("upload")}
          />
          <EntryCard
            icon={<Sparkles className="h-6 w-6" aria-hidden />}
            title="Create with AI"
            description="Generate an image from a prompt, then add captions."
            onClick={() => setStep("ai")}
          />
        </div>
      ) : null}

      {step === "upload" ? (
        <UploadMediaPath orgId={orgId} notify={notify} onDone={onSubmitted} />
      ) : null}

      {step === "ai" ? (
        <CreateWithAiPath orgId={orgId} notify={notify} onDone={onSubmitted} />
      ) : null}
    </div>
  );
}
