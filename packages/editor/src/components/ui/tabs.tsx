"use client"

import * as React from "react"
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { SimpleTooltip } from "@/components/ui/tooltip"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-horizontal:flex-col",
        className
      )}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center p-[3px] text-muted-foreground shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] group-data-horizontal/tabs:h-8 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col",
  {
    variants: {
      variant: {
        // Subtle pill tabs — design `.tabs` recipe.
        default:
          "gap-0.5 rounded-[11px] border border-[color:var(--line-soft)] bg-[color:var(--sidebar)]",
        // Segmented control — design `.seg` recipe (accent fill on active).
        segmented:
          "gap-0.5 rounded-[10px] border border-[color:var(--line)] bg-[color:var(--surface-2)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  tooltip,
  ...props
}: TabsPrimitive.Tab.Props & { tooltip?: React.ReactNode }) {
  const trigger = (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex h-full min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap text-[12.5px] font-medium text-[color:var(--muted-foreground)] transition-[background,color,box-shadow] duration-150 group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-[color:var(--ink-2)] focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        // default — `.tabs` (subtle lifted pill on active)
        "group-data-[variant=default]/tabs-list:rounded-[8px] group-data-[variant=default]/tabs-list:px-3 group-data-[variant=default]/tabs-list:py-1 group-data-[variant=default]/tabs-list:data-active:bg-[color:var(--surface)] group-data-[variant=default]/tabs-list:data-active:text-[color:var(--ink-strong)] group-data-[variant=default]/tabs-list:data-active:shadow-[var(--shadow-lift)]",
        // segmented — `.seg` (accent fill on active)
        "group-data-[variant=segmented]/tabs-list:rounded-[7px] group-data-[variant=segmented]/tabs-list:px-2 group-data-[variant=segmented]/tabs-list:py-1 group-data-[variant=segmented]/tabs-list:data-active:bg-[color:var(--accent)] group-data-[variant=segmented]/tabs-list:data-active:text-white group-data-[variant=segmented]/tabs-list:data-active:shadow-[inset_0_1px_0_rgba(255,255,255,0.35),inset_0_-1px_0_rgba(0,0,0,0.12)]",
        className
      )}
      {...props}
    />
  )

  if (tooltip === undefined || tooltip === null || tooltip === false) {
    return trigger
  }

  return <SimpleTooltip content={tooltip}>{trigger}</SimpleTooltip>
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
