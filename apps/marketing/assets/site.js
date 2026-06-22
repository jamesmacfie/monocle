/* Monocle marketing site — interactions
 * 1. platform-aware <kbd data-key> rewriting
 * 2. scripted demo-palette loop (hero)
 * 3. mobile nav toggle
 * 4. IntersectionObserver fade-ins
 */
;(() => {
  var reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches

  /* ---------- 1. Platform keys ---------- */
  var isMac = /Mac|iPhone|iPad|iPod/.test(
    navigator.platform || navigator.userAgent,
  )
  var KEYMAP = {
    palette: isMac ? "⌘⇧K" : "Ctrl+Shift+K",
    mod: isMac ? "⌘" : "Ctrl",
    alt: isMac ? "⌥" : "Alt",
    shift: isMac ? "⇧" : "Shift",
  }
  if (!isMac) {
    document.querySelectorAll("kbd[data-key]").forEach((el) => {
      var key = el.getAttribute("data-key")
      if (KEYMAP[key]) el.textContent = KEYMAP[key]
    })
  }

  /* ---------- 3. Mobile nav ---------- */
  var toggle = document.querySelector("[data-nav-toggle]")
  var links = document.querySelector("[data-nav-links]")
  if (toggle && links) {
    toggle.addEventListener("click", () => {
      var open = links.classList.toggle("is-open")
      toggle.setAttribute("aria-expanded", open ? "true" : "false")
    })
  }

  /* ---------- 4. Fade-ins ---------- */
  var reveals = document.querySelectorAll(".reveal")
  if (reveals.length) {
    if (reduceMotion || !("IntersectionObserver" in window)) {
      reveals.forEach((el) => {
        el.classList.add("is-in")
      })
    } else {
      var io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              e.target.classList.add("is-in")
              io.unobserve(e.target)
            }
          })
        },
        { rootMargin: "0px 0px -10% 0px", threshold: 0.05 },
      )
      reveals.forEach((el) => {
        io.observe(el)
      })
    }
  }

  /* ---------- 5. Stat count-up ---------- */
  var statNums = Array.prototype.slice.call(
    document.querySelectorAll("[data-count-to]"),
  )
  if (statNums.length) {
    var finalText = (el) => {
      var to = parseInt(el.getAttribute("data-count-to"), 10) || 0
      return to + (el.getAttribute("data-count-suffix") || "")
    }
    if (reduceMotion || !("IntersectionObserver" in window)) {
      statNums.forEach((el) => {
        el.textContent = finalText(el)
      })
    } else {
      var countUp = (el) => {
        var to = parseInt(el.getAttribute("data-count-to"), 10) || 0
        var suffix = el.getAttribute("data-count-suffix") || ""
        if (to === 0) {
          el.textContent = "0" + suffix
          return
        }
        var start = null
        var dur = 1100
        var frame = (ts) => {
          if (start === null) start = ts
          var p = Math.min((ts - start) / dur, 1)
          var eased = 1 - Math.pow(1 - p, 3)
          el.textContent = Math.round(eased * to) + suffix
          if (p < 1) requestAnimationFrame(frame)
          else el.textContent = to + suffix
        }
        requestAnimationFrame(frame)
      }
      var statIO = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              countUp(e.target)
              statIO.unobserve(e.target)
            }
          })
        },
        { rootMargin: "0px 0px -10% 0px", threshold: 0.4 },
      )
      statNums.forEach((el) => statIO.observe(el))
    }
  }

  /* ---------- 2. Demo palette loop ---------- */
  var demo = document.querySelector("[data-demo]")
  if (!demo) return

  var queryEl = demo.querySelector("[data-demo-query]")
  var rows = Array.prototype.slice.call(demo.querySelectorAll(".demo__row"))
  var enterChip = demo.querySelector("[data-demo-enter]")
  var TARGET = "dup"
  var timers = []
  var running = false

  function clearTimers() {
    timers.forEach(clearTimeout)
    timers = []
  }
  function after(ms, fn) {
    timers.push(setTimeout(fn, ms))
  }

  function filterRows(q) {
    var query = q.toLowerCase()
    rows.forEach((row) => {
      var kw = row.getAttribute("data-keywords") || ""
      row.hidden = query.length > 0 && kw.indexOf(query) === -1
      row.classList.remove("is-active")
    })
  }

  function reset() {
    if (queryEl) queryEl.textContent = ""
    demo.setAttribute("data-typing", "false")
    filterRows("")
  }

  function staticFinalFrame() {
    if (queryEl) queryEl.textContent = TARGET
    demo.setAttribute("data-typing", "true")
    filterRows(TARGET)
    var visible = rows.filter((r) => !r.hidden)
    if (visible[0]) visible[0].classList.add("is-active")
  }

  function loop() {
    if (!running) return
    reset()
    // type letter by letter
    var i = 0
    function typeNext() {
      if (!running) return
      if (i === 0) demo.setAttribute("data-typing", "true")
      i++
      var slice = TARGET.slice(0, i)
      if (queryEl) queryEl.textContent = slice
      filterRows(slice)
      if (i < TARGET.length) {
        after(120, typeNext)
      } else {
        // highlight the surviving row
        after(700, () => {
          var visible = rows.filter((r) => !r.hidden)
          if (visible[0]) visible[0].classList.add("is-active")
          // flash enter
          after(900, () => {
            if (enterChip) {
              enterChip.classList.add("is-flash")
              after(600, () => {
                if (enterChip) enterChip.classList.remove("is-flash")
              })
            }
          })
        })
      }
    }
    after(1100, typeNext)
    // total cycle ~8s
    after(8000, loop)
  }

  if (reduceMotion) {
    staticFinalFrame()
    return
  }

  // pause when off-screen
  if ("IntersectionObserver" in window) {
    var demoIO = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting && !running) {
            running = true
            loop()
          } else if (!e.isIntersecting && running) {
            running = false
            clearTimers()
          }
        })
      },
      { threshold: 0.2 },
    )
    demoIO.observe(demo)
  } else {
    running = true
    loop()
  }
})()
