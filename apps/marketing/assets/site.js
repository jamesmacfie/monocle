/* Monocle marketing site — interactions
 * 1. platform-aware <kbd data-key> rewriting
 * 2. scripted demo-palette loop (hero)
 * 3. mobile nav toggle
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
    var closeNav = () => {
      links.classList.remove("is-open")
      toggle.setAttribute("aria-expanded", "false")
    }
    toggle.addEventListener("click", () => {
      var open = links.classList.toggle("is-open")
      toggle.setAttribute("aria-expanded", open ? "true" : "false")
    })
    links.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", closeNav)
    })
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeNav()
    })
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
  var demoVisible = !("IntersectionObserver" in window)
  var demoPaused = false

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

  function stopDemo() {
    running = false
    clearTimers()
  }

  function syncDemo() {
    if (demoVisible && !demoPaused && !running) {
      running = true
      loop()
    } else if ((!demoVisible || demoPaused) && running) {
      stopDemo()
    }
  }

  demo.addEventListener("mouseenter", () => {
    demoPaused = true
    syncDemo()
  })
  demo.addEventListener("mouseleave", () => {
    demoPaused = false
    syncDemo()
  })
  demo.addEventListener("focusin", () => {
    demoPaused = true
    syncDemo()
  })
  demo.addEventListener("focusout", (event) => {
    if (!demo.contains(event.relatedTarget)) {
      demoPaused = false
      syncDemo()
    }
  })

  // Pause when off-screen; hover and keyboard focus also pause the loop.
  if ("IntersectionObserver" in window) {
    var demoIO = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          demoVisible = e.isIntersecting
          syncDemo()
        })
      },
      { threshold: 0.2 },
    )
    demoIO.observe(demo)
  } else {
    syncDemo()
  }
})()
