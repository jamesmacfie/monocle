import {
  BookOpen,
  Bug,
  ExternalLink,
  Github,
  Info,
  Keyboard,
  Shield,
} from "lucide-react"
import type { ComponentType } from "react"
import { Panel } from "../components/ui"

const REPOSITORY_URL = "https://github.com/jamesmacfie/monocle"
const ISSUES_URL = `${REPOSITORY_URL}/issues`
const DOCS_URL = `${REPOSITORY_URL}#readme`
const LICENSE_URL = `${REPOSITORY_URL}/blob/main/LICENSE`

type LinkItem = {
  href: string
  label: string
  description: string
  icon: ComponentType<{ className?: string }>
}

const links: LinkItem[] = [
  {
    href: REPOSITORY_URL,
    label: "GitHub",
    description: "Source code, releases, and project history.",
    icon: Github,
  },
  {
    href: ISSUES_URL,
    label: "Issues",
    description: "Report bugs or track planned work.",
    icon: Bug,
  },
  {
    href: DOCS_URL,
    label: "Documentation",
    description: "Read setup notes and feature documentation.",
    icon: BookOpen,
  },
  {
    href: LICENSE_URL,
    label: "License",
    description: "PolyForm Noncommercial License 1.0.0.",
    icon: Shield,
  },
]

const formatAuthor = (
  author: ReturnType<typeof chrome.runtime.getManifest>["author"],
) => {
  if (typeof author === "string") {
    return author
  }

  return author?.email ?? "James Macfie"
}

function ExternalLinkRow({ item }: { item: LinkItem }) {
  const Icon = item.icon

  return (
    <a
      className="flex items-center gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-[var(--color-fg)] transition-colors hover:bg-[var(--color-bg-hover)]"
      href={item.href}
      rel="noreferrer"
      target="_blank"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--color-surface-elevated)] text-[var(--color-accent)]">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{item.label}</div>
        <div className="truncate text-xs text-[var(--color-fg-muted)]">
          {item.description}
        </div>
      </div>
      <ExternalLink className="h-4 w-4 text-[var(--color-fg-muted)]" />
    </a>
  )
}

export function AboutPage() {
  const manifest = chrome.runtime.getManifest()
  const shortcut =
    navigator.platform.toLowerCase().includes("mac") ||
    navigator.userAgent.toLowerCase().includes("mac")
      ? "Command+Shift+K"
      : "Ctrl+Shift+K"

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">About</h1>
        <div className="mt-1 text-sm text-[var(--color-fg-muted)]">
          Monocle command palette settings and project links
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Panel className="p-5">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-[var(--color-surface-elevated)] text-[var(--color-accent)]">
              <Info className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold">{manifest.name}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-fg-muted)]">
                {manifest.description}
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-3">
                  <div className="text-xs font-medium uppercase text-[var(--color-fg-muted)]">
                    Version
                  </div>
                  <div className="mt-1 text-sm">{manifest.version}</div>
                </div>
                <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-3">
                  <div className="text-xs font-medium uppercase text-[var(--color-fg-muted)]">
                    Author
                  </div>
                  <div className="mt-1 text-sm">
                    {formatAuthor(manifest.author)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Panel>

        <Panel className="p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[var(--color-surface-elevated)] text-[var(--color-accent)]">
              <Keyboard className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Palette Shortcut</h2>
              <div className="text-sm text-[var(--color-fg-muted)]">
                {shortcut}
              </div>
            </div>
          </div>
        </Panel>
      </div>

      <section className="grid gap-3 sm:grid-cols-2">
        {links.map((item) => (
          <ExternalLinkRow key={item.href} item={item} />
        ))}
      </section>
    </div>
  )
}
