// Config window: edit phases + overlay geometry, preview live, save back to Lua.

(function () {
  "use strict";

  const PREVIEW_ICON = 28;

  let state = {
    overlay: { x: 40, y: 40, w: 640, h: 110, iconSize: 20, visible: true },
    currentPhase: 0,
    phases: [],
  };

  const phasesEl = document.getElementById("phases");
  const statusEl = document.getElementById("status");
  const fields = {
    x: document.getElementById("ov-x"),
    y: document.getElementById("ov-y"),
    w: document.getElementById("ov-w"),
    h: document.getElementById("ov-h"),
    icon: document.getElementById("ov-icon"),
    visible: document.getElementById("ov-visible"),
    locked: document.getElementById("ov-locked"),
  };

  // --- Bridge ---
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
      loadState(parsed.config);
    }
  });

  function loadState(cfg) {
    state = cfg;
    if (!state.overlay) state.overlay = {};
    if (!Array.isArray(state.phases)) state.phases = [];
    fields.x.value = state.overlay.x ?? 40;
    fields.y.value = state.overlay.y ?? 40;
    fields.w.value = state.overlay.w ?? 640;
    fields.h.value = state.overlay.h ?? 110;
    fields.icon.value = state.overlay.iconSize ?? 20;
    fields.visible.checked = state.overlay.visible !== false;
    fields.locked.checked = !!state.overlay.locked;
    renderPhases();
  }

  // --- Phase list rendering ---
  function renderPhases() {
    phasesEl.innerHTML = "";
    if (state.phases.length === 0) {
      const empty = document.createElement("p");
      empty.className = "hint";
      empty.textContent = 'No phases yet. Click "+ Add phase" to start.';
      phasesEl.appendChild(empty);
      return;
    }
    state.phases.forEach(function (phase, i) {
      phasesEl.appendChild(buildPhaseRow(phase, i));
    });
  }

  function buildPhaseRow(phase, i) {
    const wrap = document.createElement("div");
    wrap.className = "phase";

    const head = document.createElement("div");
    head.className = "phase-head";

    const idx = document.createElement("span");
    idx.className = "idx";
    idx.textContent = "Phase " + (i + 1);

    const name = document.createElement("input");
    name.className = "name";
    name.type = "text";
    name.placeholder = "Phase name (e.g. Pre Living Death)";
    name.value = phase.name || "";
    name.addEventListener("input", function () {
      state.phases[i].name = name.value;
    });

    const up = mkBtn("↑", "Move up", function () {
      if (i > 0) {
        swap(i, i - 1);
      }
    });
    const down = mkBtn("↓", "Move down", function () {
      if (i < state.phases.length - 1) {
        swap(i, i + 1);
      }
    });
    const del = mkBtn("✕", "Delete phase", function () {
      state.phases.splice(i, 1);
      renderPhases();
    });

    head.append(idx, name, up, down, del);

    const ta = document.createElement("textarea");
    ta.placeholder = "Paste PvME 'Copy Discord' text here…";
    ta.value = phase.text || "";

    const previewLabel = document.createElement("div");
    previewLabel.className = "preview-label";
    previewLabel.textContent = "Preview";

    const preview = document.createElement("div");
    preview.className = "preview";

    function refreshPreview() {
      preview.innerHTML = "";
      preview.appendChild(PvME.renderPhase(PvME.parsePhase(ta.value), PREVIEW_ICON));
    }
    ta.addEventListener("input", function () {
      state.phases[i].text = ta.value;
      refreshPreview();
    });
    refreshPreview();

    wrap.append(head, ta, previewLabel, preview);
    return wrap;
  }

  function mkBtn(label, title, onClick) {
    const b = document.createElement("button");
    b.className = "btn small";
    b.textContent = label;
    b.title = title;
    b.addEventListener("click", onClick);
    return b;
  }

  function swap(a, b) {
    const tmp = state.phases[a];
    state.phases[a] = state.phases[b];
    state.phases[b] = tmp;
    renderPhases();
  }

  // --- Save ---
  function collect() {
    const num = (el, d) => {
      const v = parseInt(el.value, 10);
      return Number.isFinite(v) ? v : d;
    };
    state.overlay = {
      x: num(fields.x, 40),
      y: num(fields.y, 40),
      w: num(fields.w, 640),
      h: num(fields.h, 110),
      iconSize: Math.max(12, Math.min(128, num(fields.icon, 20))),
      visible: fields.visible.checked,
      locked: fields.locked.checked,
    };
    if (state.currentPhase >= state.phases.length) {
      state.currentPhase = Math.max(0, state.phases.length - 1);
    }
    return state;
  }

  document.getElementById("add-phase").addEventListener("click", function () {
    state.phases.push({ name: "", text: "" });
    renderPhases();
  });

  document.getElementById("save").addEventListener("click", function () {
    postToLua({ type: "save", config: collect() });
    statusEl.textContent = "Saved ✓";
    setTimeout(function () {
      statusEl.textContent = "";
    }, 2000);
  });

  document.getElementById("close").addEventListener("click", function () {
    postToLua({ type: "close" });
  });

  // --- Standalone test mode: config.html?mock=1 ---
  function maybeMock() {
    if (!/[?&]mock=1\b/.test(location.search)) return;
    loadState({
      overlay: { x: 40, y: 40, w: 640, h: 110, iconSize: 20, visible: true },
      currentPhase: 0,
      phases: [
        {
          name: "Pre Living Death",
          text:
            "(tc) → <:deathskulls:1159434663903899728> → <:soulsap:1137809140476031057> *2t*",
        },
      ],
    });
  }

  postToLua({ type: "ready" });
  maybeMock();
  renderPhases();
})();
