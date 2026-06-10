// Shared PvME "Copy Discord" text parser + token renderer.
// Used by both the overlay and the config live-preview.
//
// Input is the raw text PvME's "Copy Discord" button produces, e.g.:
//   (tc) → <:deathskulls:1159434663903899728> → <:soulsap:1137809140476031057> *2t*
// Custom Discord emoji look like <:name:id> (or <a:name:id> for animated). The id is a
// Discord snowflake whose image is served publicly at
//   https://cdn.discordapp.com/emojis/<id>.png   (or .gif for animated)

(function (global) {
  "use strict";

  // One pass, left-to-right. Order of alternatives matters: emoji and separators
  // are tried before the catch-all text run (which excludes separator chars).
  //   group 1: "a" if animated emoji
  //   group 2: emoji name
  //   group 3: emoji id (snowflake)
  //   group 4: *italic note* contents
  const TOKEN_RE = /<(a)?:([^:>\s]+):(\d+)>|\*([^*]+)\*|->|→|\+|[^\s<*+→]+/g;

  function tokenizeLine(line) {
    const tokens = [];
    let m;
    TOKEN_RE.lastIndex = 0;
    while ((m = TOKEN_RE.exec(line)) !== null) {
      if (m[3]) {
        tokens.push({ kind: "icon", id: m[3], name: m[2], animated: !!m[1] });
      } else if (m[4] !== undefined) {
        tokens.push({ kind: "note", text: m[4] });
      } else if (m[0] === "→" || m[0] === "->") {
        tokens.push({ kind: "arrow" });
      } else if (m[0] === "+") {
        tokens.push({ kind: "plus" });
      } else {
        tokens.push({ kind: "text", text: m[0] });
      }
    }
    return tokens;
  }

  // Parse a whole phase's text into rows (one per non-empty line) of tokens.
  function parsePhase(text) {
    if (!text) return [];
    return String(text)
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => ({ tokens: tokenizeLine(line) }));
  }

  function emojiUrl(id, animated, size) {
    const ext = animated ? "gif" : "png";
    return `https://cdn.discordapp.com/emojis/${id}.${ext}?size=${size || 96}`;
  }

  // Build DOM for one parsed phase. iconSize is in px.
  function renderPhase(parsed, iconSize) {
    const frag = document.createDocumentFragment();
    parsed.forEach((row) => {
      const rowEl = document.createElement("div");
      rowEl.className = "pvme-row";
      row.tokens.forEach((t) => {
        rowEl.appendChild(renderToken(t, iconSize));
      });
      frag.appendChild(rowEl);
    });
    return frag;
  }

  function renderToken(t, iconSize) {
    if (t.kind === "icon") {
      const wrap = document.createElement("span");
      wrap.className = "pvme-icon-wrap";
      const img = document.createElement("img");
      img.className = "pvme-icon";
      img.src = emojiUrl(t.id, t.animated, 96);
      img.alt = t.name;
      img.title = t.name;
      img.width = iconSize;
      img.height = iconSize;
      // Graceful fallback if an emoji id can't be fetched: show its name.
      img.addEventListener("error", () => {
        const fallback = document.createElement("span");
        fallback.className = "pvme-text pvme-fallback";
        fallback.textContent = t.name;
        wrap.replaceChild(fallback, img);
      });
      wrap.appendChild(img);
      return wrap;
    }
    if (t.kind === "arrow") {
      const el = document.createElement("span");
      el.className = "pvme-arrow";
      el.textContent = "→";
      return el;
    }
    if (t.kind === "plus") {
      const el = document.createElement("span");
      el.className = "pvme-plus";
      el.textContent = "+";
      return el;
    }
    if (t.kind === "note") {
      const el = document.createElement("span");
      el.className = "pvme-note";
      el.textContent = t.text;
      return el;
    }
    const el = document.createElement("span");
    el.className = "pvme-text";
    el.textContent = t.text;
    return el;
  }

  global.PvME = { parsePhase, renderPhase, emojiUrl, tokenizeLine };
})(window);
