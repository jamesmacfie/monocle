import { describe, expect, it } from "vitest"
import {
  interpolateSnippetBody,
  snippetBodyUsesCounter,
} from "./snippet-placeholders"

// Fixed instant for deterministic date output: 2026-06-12 14:30:05 local.
const NOW = new Date(2026, 5, 12, 14, 30, 5)

const CONTEXT = {
  now: NOW,
  url: "https://example.com/docs/page?x=1",
  title: "Example Docs",
  uuid: () => "fixed-uuid",
}

describe("interpolateSnippetBody", () => {
  it("formats dates with explicit date-fns format strings", () => {
    expect(interpolateSnippetBody("{date:yyyy-MM-dd}", CONTEXT).text).toBe(
      "2026-06-12",
    )
    expect(interpolateSnippetBody("{date:yyyyMMdd}", CONTEXT).text).toBe(
      "20260612",
    )
    expect(interpolateSnippetBody("{time:HH:mm}", CONTEXT).text).toBe("14:30")
  })

  it("supports shorthand date tokens with default formats", () => {
    expect(interpolateSnippetBody("{date}", CONTEXT).text).toBe("Jun 12, 2026")
    expect(interpolateSnippetBody("{time}", CONTEXT).text).toBe("2:30 PM")
    expect(interpolateSnippetBody("{datetime}", CONTEXT).text).toBe(
      "Jun 12, 2026, 2:30 PM",
    )
  })

  it("leaves invalid date formats and unknown tokens untouched", () => {
    // 'l' is not a valid date-fns format character.
    expect(interpolateSnippetBody("{date:llll}", CONTEXT).text).toBe(
      "{date:llll}",
    )
    expect(interpolateSnippetBody("{nonsense} {title}", CONTEXT).text).toBe(
      "{nonsense} Example Docs",
    )
  })

  it("resolves page-context tokens, empty when no URL", () => {
    expect(
      interpolateSnippetBody("{url} | {title} | {domain} | {path}", CONTEXT)
        .text,
    ).toBe(
      "https://example.com/docs/page?x=1 | Example Docs | example.com | /docs/page",
    )
    expect(
      interpolateSnippetBody("{url}|{domain}|{path}", { now: NOW }).text,
    ).toBe("||")
  })

  it("resolves timestamp and uuid", () => {
    expect(interpolateSnippetBody("{timestamp}", CONTEXT).text).toBe(
      String(NOW.getTime()),
    )
    expect(interpolateSnippetBody("{uuid}", CONTEXT).text).toBe("fixed-uuid")
  })

  it("renders the same counter value for every {i} in one insertion", () => {
    const result = interpolateSnippetBody("#{i} and again #{i}", {
      ...CONTEXT,
      counter: 7,
    })
    expect(result.text).toBe("#7 and again #7")
    expect(result.usedCounter).toBe(true)

    const without = interpolateSnippetBody("no counter here", CONTEXT)
    expect(without.usedCounter).toBe(false)
  })
})

describe("snippetBodyUsesCounter", () => {
  it("detects the {i} token", () => {
    expect(snippetBodyUsesCounter("issue-{i}")).toBe(true)
    expect(snippetBodyUsesCounter("{item}")).toBe(false)
    expect(snippetBodyUsesCounter("plain")).toBe(false)
  })
})
