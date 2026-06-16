// Shared shadcn-style Dialog, built on @radix-ui/react-dialog and the project's
// `--color-*` theme tokens. Part of the shared/components/ui/ boundary (the
// shadcn-consolidation seed).
//
// The one departure from stock shadcn: DialogContent accepts a `container` prop
// threaded to the Radix Portal. Surfaces render this in the CLOSED content
// shadow root, where Radix's default portal (to document.body) would escape the
// shadow root — losing the theme tokens (defined on :host) and the isolation.
// Passing a container element inside the shadow root keeps the dialog themed and
// contained. In normal DOM (new tab / options) the prop is omitted and the
// portal defaults to document.body.
//
// NOTE: options/components/ui.tsx has its own (portal-to-body) Dialog; it should
// eventually consolidate onto this one.
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import * as React from "react"
import { cn } from "./cn"

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    container?: HTMLElement | null
  }
>(({ className, children, container, ...props }, ref) => (
  <DialogPrimitive.Portal container={container ?? undefined}>
    <DialogPrimitive.Overlay className="fixed inset-0 z-[2147483646] bg-[var(--color-bg-overlay)] backdrop-blur-sm" />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-1/2 top-1/2 z-[2147483647] grid w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-[var(--color-fg)] shadow-2xl focus:outline-none",
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close
        aria-label="Close"
        className="absolute right-4 top-4 inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-fg-muted)] opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]"
      >
        <X className="h-4 w-4" />
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
))
DialogContent.displayName = "DialogContent"

export function DialogHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-col gap-1.5 text-center", className)}
      {...props}
    />
  )
}
DialogHeader.displayName = "DialogHeader"

export function DialogFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  )
}
DialogFooter.displayName = "DialogFooter"

export const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-base font-semibold leading-none text-[var(--color-fg)]",
      className,
    )}
    {...props}
  />
))
DialogTitle.displayName = "DialogTitle"

export const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-[var(--color-fg-muted)]", className)}
    {...props}
  />
))
DialogDescription.displayName = "DialogDescription"
