// Architecture: background tests. The {{trigger.*}} URL-part accessors
// (background/automations/interpolate.ts) that let automations rebuild a
// destination URL from pieces of the source URL — the basis for redirects
// (urlMatch trigger + navigate step). Covers the pure derivation helper, the
// end-to-end render through interpolateField, and the value bag.
import { describe, expect, it } from "vitest"
import type { Automation } from "../../shared/types"
import {
  buildInitialValueBag,
  deriveTriggerUrlAccessors,
  interpolateField,
} from "./interpolate"

const EXAMPLE = "https://site.example.com/query/here?q=foo&n=2#frag"

describe("deriveTriggerUrlAccessors", () => {
  it("exposes host, origin, path, and hash", () => {
    const a = deriveTriggerUrlAccessors(EXAMPLE)
    expect(a["trigger.host"]).toBe("site.example.com")
    expect(a["trigger.origin"]).toBe("https://site.example.com")
    expect(a["trigger.path"]).toBe("/query/here")
    expect(a["trigger.hash"]).toBe("frag")
  })

  it("indexes non-empty path segments 0-based; missing index is absent", () => {
    const a = deriveTriggerUrlAccessors(EXAMPLE)
    expect(a["trigger.pathSegments.0"]).toBe("query")
    expect(a["trigger.pathSegments.1"]).toBe("here")
    expect(a["trigger.pathSegments.2"]).toBeUndefined()
  })

  it("exposes decoded query params by name; missing param is absent", () => {
    const a = deriveTriggerUrlAccessors(
      "https://x.test/p?q=hello%20world&empty=",
    )
    expect(a["trigger.query.q"]).toBe("hello world")
    expect(a["trigger.query.empty"]).toBe("")
    expect(a["trigger.query.nope"]).toBeUndefined()
  })

  it("returns nothing for empty or malformed urls (no throw)", () => {
    expect(deriveTriggerUrlAccessors("")).toEqual({})
    expect(deriveTriggerUrlAccessors("not a url")).toEqual({})
  })

  it("keeps a raw segment when it is not valid percent-encoding", () => {
    const a = deriveTriggerUrlAccessors("https://x.test/a%ZZb")
    expect(a["trigger.pathSegments.0"]).toBe("a%ZZb")
  })
})

describe("interpolateField with trigger url accessors", () => {
  const ctx = { url: EXAMPLE, title: "Source" }

  it("rebuilds a destination url from query + path segment (the redirect case)", () => {
    const values = {
      "trigger.url": EXAMPLE,
      ...deriveTriggerUrlAccessors(EXAMPLE),
    }
    const out = interpolateField(
      "https://{{trigger.query.q}}.mysite.com/{{trigger.pathSegments.1}}",
      values,
      ctx,
    )
    expect(out).toBe("https://foo.mysite.com/here")
  })

  it("composes with the encodeUriComponent pipe", () => {
    const values = {
      "trigger.url": "https://x.test/p?q=a%20b%26c",
      ...deriveTriggerUrlAccessors("https://x.test/p?q=a%20b%26c"),
    }
    const out = interpolateField(
      "https://dest.test/?term={{trigger.query.q | encodeUriComponent}}",
      values,
      { url: "https://x.test", title: "" },
    )
    expect(out).toBe("https://dest.test/?term=a%20b%26c")
  })
})

describe("buildInitialValueBag", () => {
  const manualScript = {
    id: "a1",
    name: "Redirect",
    enabled: true,
    triggers: [{ type: "manual" }],
    steps: [],
  } as unknown as Automation

  it("populates trigger.* accessors from the trigger url", async () => {
    const bag = await buildInitialValueBag(manualScript, {
      pageContext: { url: EXAMPLE },
      trigger: { type: "manual", url: EXAMPLE },
    })
    expect(bag["trigger.url"]).toBe(EXAMPLE)
    expect(bag["trigger.host"]).toBe("site.example.com")
    expect(bag["trigger.query.q"]).toBe("foo")
    expect(bag["trigger.pathSegments.1"]).toBe("here")
  })

  it("yields only trigger.url accessor when the url is empty", async () => {
    const bag = await buildInitialValueBag(manualScript, {
      pageContext: {},
      trigger: { type: "manual" },
    })
    expect(bag["trigger.url"]).toBe("")
    expect(bag["trigger.host"]).toBeUndefined()
  })
})
