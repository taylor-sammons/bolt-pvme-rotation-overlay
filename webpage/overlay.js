// Overlay logic: receive config from Lua, render the current phase as an icon
// strip, and navigate phases via the on-screen buttons or arrow keys.

(function () {
  "use strict";

  let config = { overlay: { iconSize: 20 }, currentPhase: 0, phases: [] };

  const titleEl = document.getElementById("title");
  const stripEl = document.getElementById("strip");
  const prevBtn = document.getElementById("prev");
  const nextBtn = document.getElementById("next");
  const gearBtn = document.getElementById("gear");
  const resizeEl = document.getElementById("resize");

  // --- Bridge: JS -> Lua via POST to https://bolt-api/. Silently no-ops when
  // running standalone in a normal browser (the host won't exist). ---
  function postToLua(obj) {
    try {
      fetch("https://bolt-api/send-message", {
        method: "POST",
        body: JSON.stringify(obj),
      }).catch(function () {});
    } catch (e) {
      /* standalone */
    }
  }

  // --- Bridge: Lua -> JS arrives as a window "message" event. ---
  window.addEventListener("message", function (event) {
    const data = event.data;
    if (!data || data.type !== "pluginMessage" || !data.content) return;
    let parsed;
    try {
      parsed = JSON.parse(new TextDecoder().decode(data.content));
    } catch (e) {
      return;
    }
    if (parsed.type === "data" && parsed.config) {
      applyConfig(parsed.config);
    }
  });

  function applyConfig(cfg) {
    config = cfg;
    if (!config.overlay) config.overlay = { iconSize: 20 };
    if (!Array.isArray(config.phases)) config.phases = [];
    // When locked, the title cursor and resize grip are hidden via CSS.
    document.body.classList.toggle("locked", !!config.overlay.locked);
    clampPhase();
    render();
  }

  function clampPhase() {
    const n = config.phases.length;
    if (n === 0) {
      config.currentPhase = 0;
    } else {
      config.currentPhase = Math.max(0, Math.min(config.currentPhase | 0, n - 1));
    }
  }

  function setPhase(index) {
    const n = config.phases.length;
    if (n === 0) return;
    const next = Math.max(0, Math.min(index, n - 1));
    if (next === config.currentPhase) return;
    config.currentPhase = next;
    render();
    postToLua({ type: "setPhase", index: next });
  }

  function render() {
    const n = config.phases.length;
    const i = config.currentPhase;
    stripEl.innerHTML = "";

    if (n === 0) {
      titleEl.textContent = "No rotation loaded";
      const hint = document.createElement("span");
      hint.id = "empty";
      hint.textContent = "Click ⚙ to paste a PvME rotation.";
      stripEl.appendChild(hint);
      prevBtn.disabled = true;
      nextBtn.disabled = true;
      return;
    }

    const phase = config.phases[i] || {};
    titleEl.textContent =
      "Phase " + (i + 1) + "/" + n + (phase.name ? " — " + phase.name : "");
    prevBtn.disabled = i <= 0;
    nextBtn.disabled = i >= n - 1;

    const iconSize = (config.overlay && config.overlay.iconSize) || 20;
    const parsed = PvME.parsePhase(phase.text || "");
    if (parsed.length === 0) {
      const hint = document.createElement("span");
      hint.id = "empty";
      hint.textContent = "(empty phase)";
      stripEl.appendChild(hint);
      return;
    }
    stripEl.appendChild(PvME.renderPhase(parsed, iconSize));
  }

  // --- Input ---
  prevBtn.addEventListener("click", function () {
    setPhase(config.currentPhase - 1);
  });
  nextBtn.addEventListener("click", function () {
    setPhase(config.currentPhase + 1);
  });
  gearBtn.addEventListener("click", function () {
    postToLua({ type: "openConfig" });
  });

  // Drag-to-move: pressing the title bar asks Lua to begin a window reposition.
  // Bolt then handles the drag internally and reports the new position via
  // onreposition. The ◀/▶/⚙ buttons are separate elements, so they still click.
  titleEl.addEventListener("mousedown", function (e) {
    if (e.button !== 0 || isLocked()) return;
    postToLua({ type: "startdrag" });
  });

  // Resize: pressing the corner grip asks Lua to begin a bottom-right resize.
  resizeEl.addEventListener("mousedown", function (e) {
    if (e.button !== 0 || isLocked()) return;
    e.preventDefault();
    postToLua({ type: "startresize" });
  });

  function isLocked() {
    return !!(config.overlay && config.overlay.locked);
  }

  // Arrow keys work while the overlay has focus. (Bolt exposes no Lua keyboard
  // hook, so this is best-effort; the ◀/▶ buttons are the reliable path.)
  window.addEventListener("keydown", function (e) {
    if (e.key === "ArrowLeft") {
      setPhase(config.currentPhase - 1);
      e.preventDefault();
    } else if (e.key === "ArrowRight") {
      setPhase(config.currentPhase + 1);
      e.preventDefault();
    }
  });

  // --- Standalone test mode: open overlay.html?mock=1 in a normal browser. ---
  function maybeMock() {
    if (!/[?&]mock=1\b/.test(location.search)) return;
    applyConfig({
      overlay: { iconSize: 20 },
      currentPhase: 0,
      phases: [
        {
          name: "Pre Living Death",
          text:
            "(tc) → <:deathskulls:1159434663903899728> → <:soulsap:1137809140476031057> → <:touchofdeath:1137809175980810380> *2t*",
        },
        {
          name: "Equilibrium",
          text:
            "<:soulsap:1137809140476031057> + <:deathskulls:1159434663903899728> → <:touchofdeath:1137809175980810380>",
        },
      ],
    });
  }

  // Tell Lua we're ready to receive data, then fall back to mock if standalone.
  postToLua({ type: "ready" });
  maybeMock();
  render();
})();
