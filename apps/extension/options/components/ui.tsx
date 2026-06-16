// The options page's UI layer is the shared component layer
// (shared/components/ui/*) re-exported, plus a DialogContent wrapper that
// widens the shared dialog to the settings-dialog size. Kept as a stable import
// surface so options page files can keep importing from "../components/ui".
import * as React from "react"
import { cn } from "../../shared/components/ui/cn"
import { DialogContent as SharedDialogContent } from "../../shared/components/ui/dialog"

export {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../shared/components/ui/dialog"
export {
  Badge,
  Button,
  type ButtonProps,
  Checkbox,
  Input,
  Panel,
  Select,
  Switch,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../shared/components/ui/primitives"

// Options renders in normal DOM, so the shared dialog's `container` prop is
// omitted (the portal defaults to document.body). Only DialogContent is
// wrapped, to widen it to the settings-dialog size (the shared default is the
// smaller command modal).
export const DialogContent = React.forwardRef<
  React.ElementRef<typeof SharedDialogContent>,
  React.ComponentPropsWithoutRef<typeof SharedDialogContent>
>(({ className, ...props }, ref) => (
  <SharedDialogContent
    ref={ref}
    className={cn("w-[min(92vw,560px)]", className)}
    {...props}
  />
))
DialogContent.displayName = "DialogContent"
