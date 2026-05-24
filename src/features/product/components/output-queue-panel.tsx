import { DownloadIcon, XIcon } from "lucide-react";

import { useProcessingWorkspace } from "@/features/processing/processing-workspace-context";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";

export function OutputQueuePanel() {
  const { outputQueue, removeFromOutputQueue } = useProcessingWorkspace();

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Downloads</CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
        {!!outputQueue.length && (
          <ul className="flex flex-col gap-2 overflow-y-auto">
            {outputQueue.map((item) => (
              <li key={item.id} className="flex flex-col gap-2 rounded-lg border p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.fileName}</p>
                  <p className="text-xs text-muted-foreground">{item.recipeLabel}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm">
                    <a href={item.objectUrl} download={item.fileName}>
                      <DownloadIcon className="size-4" />
                      Download
                    </a>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => removeFromOutputQueue(item.id)}
                  >
                    <XIcon className="size-4" />
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
