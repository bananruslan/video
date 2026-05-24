import type { ConversionProgress } from "@/domain/conversion/types";
import { Progress } from "@/shared/ui/progress";
import { cn } from "@/shared/lib/utils";

interface ConversionProgressProps {
  progress: ConversionProgress | null;
  statusLabel: string;
  indeterminate?: boolean;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return m > 0 ? `${m}:${String(rem).padStart(2, "0")}` : `${s}s`;
}

export function ConversionProgressPanel({
  progress,
  statusLabel,
  indeterminate = false,
}: ConversionProgressProps) {
  const ratio = progress?.ratio ?? 0;
  const showPercent = !indeterminate && ratio > 0;
  const isConverting = statusLabel.includes("Converting");

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{statusLabel}</span>
        {showPercent && (
          <span className="font-mono text-xs tabular-nums">~{Math.round(ratio)}%</span>
        )}
      </div>
      <Progress
        value={indeterminate ? undefined : Math.max(ratio, 2)}
        className={cn(
          indeterminate &&
            "[&_[data-slot=progress-indicator]]:w-1/3 [&_[data-slot=progress-indicator]]:animate-pulse",
        )}
      />
      {indeterminate ? (
        <p className="text-xs text-muted-foreground">
          {isConverting
            ? "This may take up to a minute for short clips."
            : "First time setup can take up to a minute."}
        </p>
      ) : (
        progress && (
          <p className="text-xs text-muted-foreground">
            Elapsed: {formatTime(progress.time)}
          </p>
        )
      )}
    </div>
  );
}
