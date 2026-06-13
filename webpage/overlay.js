// Overlay logic: receive config from Lua, render the current phase of the
// active profile as an icon strip, and navigate phases via the on-screen
// buttons or arrow keys. The dropdown switches between rotation profiles.

(function () {
  "use strict";

  let config = { overlay: { iconSize: 20 }, currentProfile: 0, profiles: [] };

  const titleEl = document.getElementById("title");
  const stripEl = document.getElementById("strip");
  const resetBtn = document.getElementById("reset");
  const prevBtn = document.getElementById("prev");
  const nextBtn = document.getElementById("next");
  const gearBtn = document.getElementById("gear");
  const resizeEl = document.getElementById("resize");
  const profileSel = document.getElementById("profile");

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
    if (!Array.isArray(config.profiles)) config.profiles = [];
    config.currentProfile = clampIndex(config.currentProfile, config.profiles.length);
    // When locked, the title cursor and resize grip are hidden via CSS.
    document.body.classList.toggle("locked", !!config.overlay.locked);
    applyAppearance(config.overlay);
    render();
  }

  // Style-only settings arrive as CSS variables; overlay.css carries the
  // defaults as var() fallbacks.
  function applyAppearance(o) {
    const root = document.documentElement.style;
    if (typeof o.opacity === "number") {
      root.setProperty("--bg-opacity", String(Math.max(0, Math.min(100, o.opacity)) / 100));
    }
    if (typeof o.fontSize === "number") {
      root.setProperty("--ov-font", o.fontSize + "px");
    }
    if (o.fontFamily) root.setProperty("--ov-family", o.fontFamily);
    if (o.textColor) root.setProperty("--text-color", o.textColor);
    if (o.titleColor) root.setProperty("--title-color", o.titleColor);
  }

  function clampIndex(i, n) {
    if (n === 0) return 0;
    return Math.max(0, Math.min(i | 0, n - 1));
  }

  function activeProfile() {
    return config.profiles[config.currentProfile] || null;
  }

  function setProfile(index) {
    const next = clampIndex(index, config.profiles.length);
    if (next === config.currentProfile) return;
    config.currentProfile = next;
    render();
    postToLua({ type: "setProfile", index: next });
  }

  function setPhase(index) {
    const profile = activeProfile();
    if (!profile || profile.phases.length === 0) return;
    const next = clampIndex(index, profile.phases.length);
    if (next === profile.currentPhase) return;
    profile.currentPhase = next;
    render();
    postToLua({ type: "setPhase", index: next });
  }

  function renderProfileSelect() {
    const profiles = config.profiles;
    // Only worth showing when there's actually a choice to make.
    profileSel.style.display = profiles.length > 1 ? "" : "none";
    profileSel.innerHTML = "";
    profiles.forEach(function (p, i) {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = p.name || "Profile " + (i + 1);
      profileSel.appendChild(opt);
    });
    profileSel.selectedIndex = config.currentProfile;
  }

  function render() {
    renderProfileSelect();
    stripEl.innerHTML = "";

    const profile = activeProfile();
    if (!profile) {
      titleEl.textContent = "No rotation loaded";
      const hint = document.createElement("span");
      hint.id = "empty";
      hint.textContent = "Click ⚙ to paste a PvME rotation.";
      stripEl.appendChild(hint);
      resetBtn.disabled = true;
      prevBtn.disabled = true;
      nextBtn.disabled = true;
      return;
    }

    const phases = Array.isArray(profile.phases) ? profile.phases : [];
    profile.currentPhase = clampIndex(profile.currentPhase, phases.length);
    const n = phases.length;
    const i = profile.currentPhase;

    if (n === 0) {
      titleEl.textContent = profile.name || "Unnamed";
      const hint = document.createElement("span");
      hint.id = "empty";
      hint.textContent = "(no phases in this profile)";
      stripEl.appendChild(hint);
      resetBtn.disabled = true;
      prevBtn.disabled = true;
      nextBtn.disabled = true;
      return;
    }

    const phase = phases[i] || {};
    titleEl.textContent =
      "Phase " + (i + 1) + "/" + n + (phase.name ? " — " + phase.name : "");
    resetBtn.disabled = i <= 0;
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
  profileSel.addEventListener("change", function () {
    setProfile(profileSel.selectedIndex);
  });
  resetBtn.addEventListener("click", function () {
    setPhase(0);
  });
  prevBtn.addEventListener("click", function () {
    const p = activeProfile();
    if (p) setPhase(p.currentPhase - 1);
  });
  nextBtn.addEventListener("click", function () {
    const p = activeProfile();
    if (p) setPhase(p.currentPhase + 1);
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
    const p = activeProfile();
    if (!p) return;
    if (e.key === "ArrowLeft") {
      setPhase(p.currentPhase - 1);
      e.preventDefault();
    } else if (e.key === "ArrowRight") {
      setPhase(p.currentPhase + 1);
      e.preventDefault();
    }
  });

  // --- Standalone test mode: open overlay.html?mock=1 in a normal browser. ---
  function maybeMock() {
    if (!/[?&]mock=1\b/.test(location.search)) return;
    applyConfig({
      overlay: { iconSize: 20, opacity: 50, fontSize: 15, fontFamily: "Cantarell, sans-serif", textColor: "#9fd0ff", titleColor: "#ffd57a" },
      currentProfile: 0,
      profiles: [
        {
          name: "Rasial — Mage",
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
        },
        {
          name: "Amascut — Range",
          currentPhase: 0,
          phases: [
            {
              name: "Opener",
              text:
                "<:deathskulls:1159434663903899728> → <:soulsap:1137809140476031057>",
            },
          ],
        },
      ],
    });
  }

  // Tell Lua we're ready to receive data, then fall back to mock if standalone.
  postToLua({ type: "ready" });
  maybeMock();
  render();
})();
