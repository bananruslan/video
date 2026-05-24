import { useProcessingWorkspace } from "@/features/processing/processing-workspace-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";

export function InputQueuePanel() {
  const { inputQueue, file } = useProcessingWorkspace();

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Queue</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        {inputQueue.length > 0 && (
          <ul className="mt-3 space-y-1">
            {inputQueue.map((item) => (
              <li
                key={item.id}
                className="truncate rounded-md border bg-muted/40 px-2 py-1.5 text-foreground"
              >
                {item.name}
              </li>
            ))}
          </ul>
        )}
        {file && inputQueue.length === 0 && (
          <p className="mt-3 rounded-md border bg-muted/40 px-2 py-1.5 text-foreground">
            Now: <span className="font-medium">{file.name}</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
