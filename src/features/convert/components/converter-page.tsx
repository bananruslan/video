import { useEffect } from "react";
import { useParams } from "react-router";
import { AlertCircleIcon, InfoIcon } from "lucide-react";

import { OptionsForm } from "@/features/convert/components/options-form";
import { FilePicker } from "@/features/convert/components/file-picker";
import { ConversionProgressPanel } from "@/features/convert/components/conversion-progress";
import { useProcessingWorkspace } from "@/features/processing/processing-workspace-context";
import { Alert, AlertDescription, AlertTitle } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Label } from "@/shared/ui/label";
import { Separator } from "@/shared/ui/separator";

function statusLabel(status: string): string {
  switch (status) {
    case "loading-ffmpeg":
      return "Starting…";
    case "converting":
      return "Converting…";
    default:
      return "";
  }
}

export function ConverterPage() {
  const { recipeId: routeRecipeId } = useParams<{ recipeId: string }>();
  const {
    status,
    recipeId,
    recipe,
    options,
    file,
    progress,
    logs,
    warning,
    error,
    isBusy,
    canConvert,
    settingsMode,
    selectRecipe,
    setOption,
    setSettingsMode,
    selectFile,
    convert,
    cancel,
  } = useProcessingWorkspace();

  useEffect(() => {
    if (routeRecipeId && routeRecipeId !== recipeId) {
      selectRecipe(routeRecipeId);
    }
  }, [routeRecipeId, recipeId, selectRecipe]);

  if (!recipe) {
    return (
      <Alert variant="destructive">
        <AlertCircleIcon />
        <AlertTitle>Not set up</AlertTitle>
        <AlertDescription>Add a conversion recipe in the project config.</AlertDescription>
      </Alert>
    );
  }

  const showProgress = status === "loading-ffmpeg" || status === "converting";
  const label = statusLabel(status);
  const showSupportDetails = Boolean(error && logs.length > 0);

  return (
    <div className="flex w-full flex-col gap-4">
      {warning && (
        <Alert>
          <InfoIcon />
          <AlertTitle>Note</AlertTitle>
          <AlertDescription>{warning}</AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{recipe.label}</CardTitle>
          {recipe.description ? (
            <CardDescription>{recipe.description}</CardDescription>
          ) : null}
        </CardHeader>
        <CardContent className="grid gap-6">
          <div className="grid gap-2">
            <Label>Video</Label>
            <FilePicker
              accept={recipe.accept}
              file={file}
              disabled={isBusy}
              onSelect={selectFile}
            />
          </div>

          <Separator />

          <div className="grid gap-2">
            <Label>Options</Label>
            <OptionsForm
              recipe={recipe}
              options={options}
              settingsMode={settingsMode}
              onSettingsModeChange={setSettingsMode}
              disabled={isBusy}
              onChange={setOption}
            />
          </div>

          <Separator />

          <div className="flex flex-wrap gap-3">
            <Button type="button" disabled={!canConvert} onClick={() => void convert()}>
              {status === "loading-ffmpeg"
                ? "Starting…"
                : status === "converting"
                  ? "Converting…"
                  : "Convert"}
            </Button>
            {isBusy && (
              <Button type="button" variant="outline" onClick={cancel}>
                Cancel
              </Button>
            )}
          </div>

          {showProgress && (
            <ConversionProgressPanel
              progress={progress}
              statusLabel={label}
              indeterminate={
                status === "loading-ffmpeg" ||
                (status === "converting" && (progress === null || progress.ratio <= 0))
              }
            />
          )}

          {status === "done" && (
            <p className="text-sm text-muted-foreground">
              Done — download from the panel on the right.
            </p>
          )}

          {showSupportDetails && (
            <details className="rounded-lg border px-3 py-2 text-xs overflow-auto" open>
              <summary className="cursor-pointer font-medium">Technical log</summary>
              <pre className="mt-2 max-h-60 overflow-auto font-mono text-[10px] leading-relaxed text-muted-foreground">
                {logs.join("\n")}
              </pre>
            </details>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
