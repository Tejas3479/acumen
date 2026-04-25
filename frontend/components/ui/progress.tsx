"use client"

import * as React from "react"
import { Progress as ProgressPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        "relative flex h-1 w-full items-center overflow-x-hidden rounded-full bg-muted",
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="size-full flex-1 transition-all duration-500"
        style={{
          transform: `translateX(-${100 - (value || 0)}%)`,
          background:
            "linear-gradient(90deg, #7c3aed 0%, #a78bfa 50%, #7c3aed 100%)",
          backgroundSize: "200% 100%",
          animation: "progress-shimmer 2s linear infinite",
        }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
