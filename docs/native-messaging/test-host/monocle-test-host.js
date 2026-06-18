#!/usr/bin/env node
// Throwaway native-messaging host for local testing ONLY (not the real host).
// Chrome/Firefox launch this on connectNative; its stdout IS the browser pipe,
// so it logs to stderr. It also runs a loopback HTTP server the bash scripts
// (curl) call, relaying each request over stdio and matching the reply by id.
const http = require("http")
const PORT = Number(process.env.MONOCLE_BRIDGE_PORT || 8765)
const pending = new Map()

// host -> browser: 4-byte little-endian length prefix + UTF-8 JSON.
function send(msg) {
  const buf = Buffer.from(JSON.stringify(msg), "utf8")
  const hdr = Buffer.alloc(4)
  hdr.writeUInt32LE(buf.length, 0) // native byte order ≈ LE on x86/ARM
  process.stdout.write(Buffer.concat([hdr, buf]))
}

// browser -> host: same framing, accumulate until a full frame is present.
let acc = Buffer.alloc(0)
process.stdin.on("data", (chunk) => {
  acc = Buffer.concat([acc, chunk])
  while (acc.length >= 4) {
    const len = acc.readUInt32LE(0)
    if (acc.length < 4 + len) break
    const msg = JSON.parse(acc.subarray(4, 4 + len).toString("utf8"))
    acc = acc.subarray(4 + len)
    const resolve = pending.get(msg.id)
    if (resolve) {
      pending.delete(msg.id)
      resolve(msg)
    }
  }
})
// When the browser disconnects (bridge disabled / SW gone), exit cleanly.
process.stdin.on("end", () => process.exit(0))

http
  .createServer((req, res) => {
    if (req.method !== "POST") {
      res.writeHead(405)
      return res.end()
    }
    let body = ""
    req.on("data", (c) => (body += c))
    req.on("end", () => {
      let request
      try {
        request = JSON.parse(body)
      } catch {
        res.writeHead(400)
        return res.end()
      }
      // Inject the bearer token from the HTTP header into the envelope (the
      // real host does this too — the wire protocol carries auth.token).
      const auth = req.headers.authorization
      if (auth && auth.startsWith("Bearer ")) {
        request.auth = { token: auth.slice(7) }
      }
      pending.set(request.id, (response) => {
        res.writeHead(200, { "content-type": "application/json" })
        res.end(JSON.stringify(response))
      })
      send(request)
    })
  })
  .listen(PORT, "127.0.0.1", () =>
    process.stderr.write(`monocle test host listening on 127.0.0.1:${PORT}\n`),
  )
