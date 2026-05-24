import { Outlet } from "react-router"

import { ProductHeader } from "@/features/product/components/product-header"
import { InputQueuePanel } from "@/features/product/components/input-queue-panel"
import { OutputQueuePanel } from "@/features/product/components/output-queue-panel"

export function ProcessingShell() {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <ProductHeader />
      <div className="grid flex-1 gap-4 p-4 lg:grid-cols-[minmax(220px,1fr)_minmax(360px,2fr)_minmax(220px,1fr)] lg:gap-6 lg:p-6">
        <aside className="order-2 lg:order-1">
          <InputQueuePanel />
        </aside>
        <main className="order-1 min-w-0 lg:order-2">
          <Outlet />
        </main>
        <aside className="order-3">
          <OutputQueuePanel />
        </aside>
      </div>
    </div>
  )
}
