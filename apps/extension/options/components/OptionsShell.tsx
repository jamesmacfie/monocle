import {
  Command,
  FileText,
  Github,
  Globe2,
  Image,
  Keyboard,
  Plug,
  Settings,
  Shield,
  Star,
  Workflow,
} from "lucide-react"
import type { PropsWithChildren } from "react"
import { Link, useLocation } from "wouter"
import { MonocleMark } from "../../shared/components/MonocleMark"
import { cn } from "../../shared/components/ui/cn"
import { useAppSelector } from "../../shared/store/hooks"
import { selectFeatures } from "../../shared/store/slices/features.slice"
import { countPendingRequests } from "../integrations/providers"

const navItems = [
  { href: "/", label: "General", icon: Settings },
  { href: "/new-tab", label: "New Tab", icon: Image },
  { href: "/commands", label: "Commands", icon: Command },
  { href: "/favorites", label: "Favorites", icon: Star },
  { href: "/keyboard", label: "Keyboard", icon: Keyboard },
  { href: "/snippets", label: "Snippets", icon: FileText },
  { href: "/automations", label: "Automations", icon: Workflow },
  { href: "/features", label: "Features", icon: Shield },
  { href: "/integrations", label: "Integrations", icon: Plug },
  { href: "/url-rules", label: "URL Rules", icon: Globe2 },
  { href: "/about", label: "About", icon: Github },
]

export function OptionsShell({ children }: PropsWithChildren) {
  const [location] = useLocation()
  const pendingRequests = useAppSelector((state) =>
    countPendingRequests(selectFeatures(state)),
  )

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
                  <span className="flex-1">{item.label}</span>
                  {item.href === "/integrations" && pendingRequests > 0 ? (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--color-accent)] px-1.5 text-xs font-semibold text-white">
                      {pendingRequests}
                    </span>
                  ) : null}
                </Link>
              )
            })}
          </nav>
        </aside>
        <main className="options-scrollbar min-w-0 overflow-y-auto px-4 py-6 md:px-8 lg:px-10">
          {children}
        </main>
      </div>
    </div>
  )
}
