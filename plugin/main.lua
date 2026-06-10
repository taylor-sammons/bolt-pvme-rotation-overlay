-- PvME Rotation Overlay — Bolt plugin entry point.
--
-- This Lua layer is deliberately thin. All parsing of PvME text and all rendering
-- happens in the embedded browser (webpage/overlay.html), because:
--   * the overlay needs to load ability icons from https://cdn.discordapp.com/emojis/<id>.png,
--     and Lua has no HTTP — but a Bolt browser can load remote images directly;
--   * HTML/CSS is far better suited to the horizontal icon strip than raw Lua surfaces.
--
-- Lua's job: own the persisted config, create/position the overlay + config windows,
-- and relay messages between them.
--
-- Message bridge (per Bolt docs):
--   Lua  -> JS : browser:sendmessage("<json string>")
--               JS receives it as a window "message" event; content is an ArrayBuffer.
--   JS   -> Lua: fetch("https://bolt-api/...", { method: "POST", body: "<json string>" })
--               Lua receives the POST body as a string in browser:onmessage(fn).
-- We tag every message with a "type" field inside the JSON body.

local bolt = require("bolt")
local json = require("modules.json")

bolt.checkversion(1, 0)

-- ---------------------------------------------------------------------------
-- Config
-- ---------------------------------------------------------------------------

local CONFIG_FILE = "rotation.json"

local function default_config()
	return {
		overlay = { x = 40, y = 40, w = 640, h = 110, iconSize = 20, visible = true, locked = false },
		currentPhase = 0,
		phases = {},
	}
end

-- Merge loaded values over defaults so missing keys never crash the UI.
local function normalize(cfg)
	local d = default_config()
	if type(cfg) ~= "table" then
		return d
	end
	cfg.overlay = cfg.overlay or {}
	for k, v in pairs(d.overlay) do
		if cfg.overlay[k] == nil then
			cfg.overlay[k] = v
		end
	end
	if type(cfg.phases) ~= "table" then
		cfg.phases = {}
	end
	if type(cfg.currentPhase) ~= "number" then
		cfg.currentPhase = 0
	end
	return cfg
end

local config = default_config()

local function load_config()
	local ok, contents = pcall(bolt.loadconfig, CONFIG_FILE)
	if ok and type(contents) == "string" and #contents > 0 then
		local decoded_ok, decoded = pcall(json.decode, contents)
		if decoded_ok then
			config = normalize(decoded)
			return
		end
	end
	config = default_config()
end

local function save_config()
	bolt.saveconfig(CONFIG_FILE, json.encode(config))
end

-- ---------------------------------------------------------------------------
-- Browsers
-- ---------------------------------------------------------------------------

local overlay = nil
local config_window = nil
local open_config_window -- forward declaration (defined below)

local function send_data_to(browser)
	if browser == nil then
		return
	end
	browser:sendmessage(json.encode({ type = "data", config = config }))
end

local function create_overlay()
	if overlay ~= nil then
		overlay:close()
		overlay = nil
	end
	if not config.overlay.visible then
		return
	end
	local o = config.overlay
	overlay = bolt.createembeddedbrowser(o.x, o.y, o.w, o.h, "plugin://webpage/overlay.html")
	overlay:onmessage(function(msg)
		local ok, data = pcall(json.decode, msg)
		if not ok or type(data) ~= "table" then
			return
		end
		if data.type == "ready" then
			send_data_to(overlay)
		elseif data.type == "setPhase" then
			config.currentPhase = data.index or 0
			save_config()
		elseif data.type == "openConfig" then
			open_config_window()
		elseif data.type == "startdrag" then
			-- Begin an interactive move (both axes 0 = move, not resize).
			overlay:startreposition(0, 0)
		elseif data.type == "startresize" then
			-- Begin an interactive resize from the bottom-right corner.
			overlay:startreposition(1, 1)
		end
	end)
	-- When the user finishes dragging, persist the new position.
	overlay:onreposition(function(event)
		local x, y, w, h = event:xywh()
		config.overlay.x = x
		config.overlay.y = y
		config.overlay.w = w
		config.overlay.h = h
		save_config()
	end)
end

open_config_window = function()
	if config_window ~= nil then
		-- already open; just refresh its data
		send_data_to(config_window)
		return
	end
	config_window = bolt.createbrowser(720, 560, "plugin://webpage/config.html")
	config_window:onmessage(function(msg)
		local ok, data = pcall(json.decode, msg)
		if not ok or type(data) ~= "table" then
			return
		end
		if data.type == "ready" then
			send_data_to(config_window)
		elseif data.type == "save" then
			local incoming = normalize(data.config)
			-- Did overlay geometry/visibility change? If so we must recreate it
			-- (an embedded browser's position is fixed at creation time).
			local o1, o2 = config.overlay, incoming.overlay
			local geometry_changed = o1.x ~= o2.x
				or o1.y ~= o2.y
				or o1.w ~= o2.w
				or o1.h ~= o2.h
				or o1.visible ~= o2.visible
			config = incoming
			save_config()
			if geometry_changed then
				create_overlay()
			end
			send_data_to(overlay)
		elseif data.type == "close" then
			if config_window ~= nil then
				config_window:close()
				config_window = nil
			end
		end
	end)
end

-- ---------------------------------------------------------------------------
-- Startup
-- ---------------------------------------------------------------------------

load_config()
create_overlay()

-- First run with no phases yet: pop the config window so the user can paste a rotation.
if #config.phases == 0 then
	open_config_window()
end
