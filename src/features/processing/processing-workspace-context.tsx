import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"

import { useConvertJob } from "@/features/convert/use-convert-job"
import type { InputQueueItem, OutputQueueItem } from "@/domain/processing/types"

type ConvertJobReturn = ReturnType<typeof useConvertJob>

interface ProcessingWorkspaceContextValue extends ConvertJobReturn {
  inputQueue: InputQueueItem[]
  outputQueue: OutputQueueItem[]
  removeFromOutputQueue: (id: string) => void
}

const ProcessingWorkspaceContext =
  createContext<ProcessingWorkspaceContextValue | null>(null)

export function ProcessingWorkspaceProvider({
  children,
}: {
  children: ReactNode
}) {
  const convert = useConvertJob()
  const [inputQueue] = useState<InputQueueItem[]>([])
  const [outputQueue, setOutputQueue] = useState<OutputQueueItem[]>([])
  const handledDoneRef = useRef(false)

  const removeFromOutputQueue = useCallback((id: string) => {
    setOutputQueue((prev) => {
      const item = prev.find((o) => o.id === id)
      if (item) {
        URL.revokeObjectURL(item.objectUrl)
      }
      return prev.filter((o) => o.id !== id)
    })
  }, [])

  useEffect(() => {
    if (convert.status !== "done") {
      handledDoneRef.current = false
      return
    }

    if (handledDoneRef.current) {
      return
    }

    const released = convert.detachResult()
    const recipe = convert.recipe
    if (!released || !recipe) {
      return
    }

    handledDoneRef.current = true
    setOutputQueue((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        fileName: released.fileName,
        objectUrl: released.objectUrl,
        recipeLabel: recipe.label,
        createdAt: Date.now(),
      },
    ])
  }, [convert.status, convert.detachResult, convert.recipe])

  useEffect(() => {
    return () => {
      setOutputQueue((prev) => {
        for (const item of prev) {
          URL.revokeObjectURL(item.objectUrl)
        }
        return []
      })
    }
  }, [])

  return (
    <ProcessingWorkspaceContext.Provider
      value={{
        ...convert,
        inputQueue,
        outputQueue,
        removeFromOutputQueue,
      }}
    >
      {children}
    </ProcessingWorkspaceContext.Provider>
  )
}

export function useProcessingWorkspace() {
  const ctx = useContext(ProcessingWorkspaceContext)
  if (!ctx) {
    throw new Error(
      "useProcessingWorkspace must be used within ProcessingWorkspaceProvider"
    )
  }
  return ctx
}
