import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      // Aba sublinhada do handoff (.cd-tabs): régua embaixo, sem caixa cinza.
      // A barra da aba ativa é o indicador — é ela que carrega o laranja.
      "inline-flex h-auto w-full items-center justify-start gap-1 rounded-none border-b border-border bg-transparent p-0 text-muted-foreground",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "relative inline-flex h-[42px] items-center justify-center whitespace-nowrap rounded-none border-0 bg-transparent px-4 text-sm font-semibold text-muted-foreground shadow-none ring-offset-background transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
      "data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none",
      "data-[state=active]:after:absolute data-[state=active]:after:inset-x-3 data-[state=active]:after:-bottom-px data-[state=active]:after:h-[2.5px] data-[state=active]:after:rounded-t-sm data-[state=active]:after:bg-primary data-[state=active]:after:content-['']",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
