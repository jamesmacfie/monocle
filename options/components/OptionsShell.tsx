import {
  Command,
  Image,
  Keyboard,
  PanelLeft,
  Settings,
  Star,
} from "lucide-react"
import type { PropsWithChildren } from "react"
import { Link, useLocation } from "wouter"
import { MonocleMark } from "../../shared/components/MonocleMark"
import { cn } from "../lib/cn"

const navItems = [
  { href: "/", label: "General", icon: Settings },
  { href: "/new-tab", label: "New Tab", icon: Image },
  { href: "/commands", label: "Commands", icon: Command },
]

const futureItems = [
  { label: "Favorites", icon: Star },
  { label: "Keyboard", icon: Keyboard },
  { label: "More", icon: PanelLeft },
]

export function OptionsShell({ children }: PropsWithChildren) {
  const [location] = useLocation()

  return (
    <div className="min-h-screen bg-[var(--color-bg-page)] text-[var(--color-fg)]">
      <div className="mx-auto grid min-h-screen max-w-[1440px] grid-cols-1 md:grid-cols-[260px_1fr]">
        <aside className="border-b border-[var(--color-border)] bg-[var(--color-surface)] md:border-b-0 md:border-r">
          <div className="flex h-16 items-center gap-3 px-5">
            <MonocleMark variant="glyph" size={32} title="Monocle" />
            <div>
              <div className="text-sm font-semibold">Monocle</div>
              <div className="text-xs text-[var(--color-fg-muted)]">
                Settings
              </div>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:block md:space-y-1 md:overflow-visible">
            {navItems.map((item) => {
              const Icon = item.icon
              const active = location === item.href
              return (
                <Link
                  key={item.href}
                  className={cn(
                    "flex h-10 shrink-0 items-center gap-3 rounded-md px-3 text-sm font-medium text-[var(--color-fg-muted)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-fg)]",
                    active &&
                      "bg-[var(--color-bg-selected)] text-[var(--color-fg)]",
                  )}
                  href={item.href}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              )
            })}
          </nav>
          <div className="hidden border-t border-[var(--color-border)] px-3 py-4 md:block">
            <div className="mb-2 px-3 text-xs font-medium uppercase text-[var(--color-fg-muted)]">
              Later
            </div>
            <div className="space-y-1">
              {futureItems.map((item) => {
                const Icon = item.icon
                return (
                  <div
                    key={item.label}
                    className="flex h-9 items-center gap-3 rounded-md px-3 text-sm text-[var(--color-fg-muted)] opacity-70"
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </div>
                )
              })}
            </div>
          </div>
        </aside>
        <main className="options-scrollbar min-w-0 overflow-y-auto px-4 py-6 md:px-8 lg:px-10">
          {children}
        </main>
      </div>
    </div>
  )
}
