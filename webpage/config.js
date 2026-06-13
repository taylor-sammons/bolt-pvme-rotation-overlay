// Config window: manage rotation profiles, edit each profile's phases,
// preview live, edit overlay geometry, and save back to Lua.

(function () {
  "use strict";

  const PREVIEW_ICON = 28;

  let state = {
    overlay: { x: 40, y: 40, w: 640, h: 110, iconSize: 20, visible: true },
    currentProfile: 0,
    profiles: [],
  };

  const phasesEl = document.getElementById("phases");
  const statusEl = document.getElementById("status");
  const profileSel = document.getElementById("profile-select");
  const profileName = document.getElementById("profile-name");
  const addProfileBtn = document.getElementById("add-profile");
  const dupProfileBtn = document.getElementById("dup-profile");
  const delProfileBtn = document.getElementById("del-profile");
  const fields = {
    x: document.getElementById("ov-x"),
    y: document.getElementById("ov-y"),
    w: document.getElementById("ov-w"),
    h: document.getElementById("ov-h"),
    icon: document.getElementById("ov-icon"),
    visible: document.getElementById("ov-visible"),
    locked: document.getElementById("ov-locked"),
    opacity: document.getElementById("ov-opacity"),
    fontSize: document.getElementById("ov-fontsize"),
    fontFamily: document.getElementById("ov-fontfamily"),
    textColor: document.getElementById("ov-textcolor"),
    titleColor: document.getElementById("ov-titlecolor"),
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
    // Defensive v1 migration (Lua normally migrates before sending).
    if (!Array.isArray(state.profiles)) {
      state.profiles = Array.isArray(state.phases) && state.phases.length
        ? [{ name: "Default", currentPhase: state.currentPhase | 0, phases: state.phases }]
        : [];
    }
    delete state.phases;
    delete state.currentPhase;
    state.currentProfile = clampIndex(state.currentProfile, state.profiles.length);
    fields.x.value = state.overlay.x ?? 40;
    fields.y.value = state.overlay.y ?? 40;
    fields.w.value = state.overlay.w ?? 640;
    fields.h.value = state.overlay.h ?? 110;
    fields.icon.value = state.overlay.iconSize ?? 20;
    fields.visible.checked = state.overlay.visible !== false;
    fields.locked.checked = !!state.overlay.locked;
    fields.opacity.value = state.overlay.opacity ?? 72;
    fields.fontSize.value = state.overlay.fontSize ?? 13;
    setSelect(fields.fontFamily, state.overlay.fontFamily || "Fira Sans, sans-serif");
    fields.textColor.value = state.overlay.textColor || "#e8e8e8";
    fields.titleColor.value = state.overlay.titleColor || "#ffd57a";
    renderProfileBar();
    renderPhases();
  }

  function clampIndex(i, n) {
    if (n === 0) return 0;
    return Math.max(0, Math.min(i | 0, n - 1));
  }

  // Select an <option> by value; if the saved value isn't one of the presets,
  // add it so it round-trips instead of silently resetting to the first option.
  function setSelect(sel, value) {
    let found = false;
    for (let i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value === value) {
        found = true;
        break;
      }
    }
    if (!found) {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = value;
      sel.appendChild(opt);
    }
    sel.value = value;
  }

  function currentProfile() {
    return state.profiles[state.currentProfile] || null;
  }

  // Used when adding a phase with no profiles yet: phases need a home.
  function ensureProfile() {
    if (state.profiles.length === 0) {
      state.profiles.push({ name: "Default", currentPhase: 0, phases: [] });
      state.currentProfile = 0;
      renderProfileBar();
    }
    return currentProfile();
  }

  // --- Profile bar ---
  function renderProfileBar() {
    profileSel.innerHTML = "";
    state.profiles.forEach(function (p, i) {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = p.name || "Profile " + (i + 1);
      profileSel.appendChild(opt);
    });
    const has = state.profiles.length > 0;
    profileSel.disabled = !has;
    profileName.disabled = !has;
    dupProfileBtn.disabled = !has;
    delProfileBtn.disabled = !has;
    if (has) {
      profileSel.selectedIndex = state.currentProfile;
      profileName.value = currentProfile().name || "";
    } else {
      profileName.value = "";
    }
  }

  profileSel.addEventListener("change", function () {
    state.currentProfile = clampIndex(profileSel.selectedIndex, state.profiles.length);
    renderProfileBar();
    renderPhases();
  });

  profileName.addEventListener("input", function () {
    const p = currentProfile();
    if (!p) return;
    p.name = profileName.value;
    const opt = profileSel.options[state.currentProfile];
    if (opt) opt.textContent = p.name || "Profile " + (state.currentProfile + 1);
  });

  addProfileBtn.addEventListener("click", function () {
    state.profiles.push({ name: "New profile", currentPhase: 0, phases: [] });
    state.currentProfile = state.profiles.length - 1;
    renderProfileBar();
    renderPhases();
    profileName.focus();
    profileName.select();
  });

  dupProfileBtn.addEventListener("click", function () {
    const p = currentProfile();
    if (!p) return;
    const copy = JSON.parse(JSON.stringify(p));
    copy.name = (p.name || "Profile") + " (copy)";
    state.profiles.splice(state.currentProfile + 1, 0, copy);
    state.currentProfile += 1;
    renderProfileBar();
    renderPhases();
  });

  delProfileBtn.addEventListener("click", function () {
    const p = currentProfile();
    if (!p) return;
    const label = p.name || "this profile";
    if (!confirm('Delete "' + label + '" and all its phases?')) return;
    state.profiles.splice(state.currentProfile, 1);
    state.currentProfile = clampIndex(state.currentProfile, state.profiles.length);
    renderProfileBar();
    renderPhases();
  });

  // --- Phase list rendering (always the current profile's phases) ---
  function renderPhases() {
    phasesEl.innerHTML = "";
    const p = currentProfile();
    if (!p) {
      const empty = document.createElement("p");
      empty.className = "hint";
      empty.textContent = 'No profiles yet. Click "+ New profile" to start.';
      phasesEl.appendChild(empty);
      return;
    }
    if (p.phases.length === 0) {
      const empty = document.createElement("p");
      empty.className = "hint";
      empty.textContent = 'No phases yet. Click "+ Add phase" to start.';
      phasesEl.appendChild(empty);
      return;
    }
    p.phases.forEach(function (phase, i) {
      phasesEl.appendChild(buildPhaseRow(p, phase, i));
    });
  }

  function buildPhaseRow(profile, phase, i) {
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
      profile.phases[i].name = name.value;
    });

    const up = mkBtn("↑", "Move up", function () {
      if (i > 0) {
        swap(profile, i, i - 1);
      }
    });
    const down = mkBtn("↓", "Move down", function () {
      if (i < profile.phases.length - 1) {
        swap(profile, i, i + 1);
      }
    });
    const del = mkBtn("✕", "Delete phase", function () {
      profile.phases.splice(i, 1);
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
      profile.phases[i].text = ta.value;
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

  function swap(profile, a, b) {
    const tmp = profile.phases[a];
    profile.phases[a] = profile.phases[b];
    profile.phases[b] = tmp;
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
      opacity: Math.max(0, Math.min(100, num(fields.opacity, 72))),
      fontSize: Math.max(10, Math.min(28, num(fields.fontSize, 13))),
      fontFamily: fields.fontFamily.value || "Fira Sans, sans-serif",
      textColor: fields.textColor.value || "#e8e8e8",
      titleColor: fields.titleColor.value || "#ffd57a",
    };
    state.currentProfile = clampIndex(state.currentProfile, state.profiles.length);
    state.profiles.forEach(function (p) {
      p.currentPhase = clampIndex(p.currentPhase, p.phases.length);
    });
    return state;
  }

  document.getElementById("add-phase").addEventListener("click", function () {
    const p = ensureProfile();
    p.phases.push({ name: "", text: "" });
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
      currentProfile: 0,
      profiles: [
        {
          name: "Rasial — Mage",
          currentPhase: 0,
          phases: [
            {
              name: "Pre Living Death",
              text:
                "(tc) → <:deathskulls:1159434663903899728> → <:soulsap:1137809140476031057> *2t*",
            },
          ],
        },
        {
          name: "Amascut — Range",
          currentPhase: 0,
          phases: [],
        },
      ],
    });
  }

  postToLua({ type: "ready" });
  maybeMock();
  renderProfileBar();
  renderPhases();
})();
