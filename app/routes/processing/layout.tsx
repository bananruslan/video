import { ProcessingShell } from "@/features/product/components/processing-shell"
import { ProcessingWorkspaceProvider } from "@/features/processing/processing-workspace-context"

import "@/domain/conversion/recipes"

export default function ProcessingLayout() {
  return (
    <ProcessingWorkspaceProvider>
      <ProcessingShell />
    </ProcessingWorkspaceProvider>
  )
}
