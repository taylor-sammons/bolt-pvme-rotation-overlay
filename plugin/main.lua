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
		overlay = {
			x = 40,
			y = 40,
			w = 640,
			h = 110,
			iconSize = 20,
			visible = true,
			locked = false,
			opacity = 72,
			fontSize = 13,
			textColor = "#e8e8e8",
			titleColor = "#ffd57a",
		},
		currentProfile = 0,
		profiles = {},
	}
end

-- Merge loaded values over defaults so missing keys never crash the UI.
-- Also migrates the v1 shape (top-level phases/currentPhase) into a single
-- profile so configs saved by 0.1.x keep working.
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
	if type(cfg.profiles) ~= "table" then
		if type(cfg.phases) == "table" and #cfg.phases > 0 then
			cfg.profiles = {
				{
					name = "Default",
					currentPhase = type(cfg.currentPhase) == "number" and cfg.currentPhase or 0,
					phases = cfg.phases,
				},
			}
		else
			cfg.profiles = {}
		end
	end
	cfg.phases = nil
	cfg.currentPhase = nil
	local profiles = {}
	for _, p in ipairs(cfg.profiles) do
		if type(p) == "table" then
			if type(p.name) ~= "string" then
				p.name = "Unnamed"
			end
			if type(p.phases) ~= "table" then
				p.phases = {}
			end
			if type(p.currentPhase) ~= "number" then
				p.currentPhase = 0
			end
			profiles[#profiles + 1] = p
		end
	end
	cfg.profiles = profiles
	-- currentProfile/currentPhase are 0-based (JS indexes); clamp into range.
	if type(cfg.currentProfile) ~= "number" then
		cfg.currentProfile = 0
	end
	if cfg.currentProfile >= #cfg.profiles then
		cfg.currentProfile = math.max(0, #cfg.profiles - 1)
	elseif cfg.currentProfile < 0 then
		cfg.currentProfile = 0
	end
	return cfg
end

local config = default_config()

local function active_profile()
	return config.profiles[(config.currentProfile or 0) + 1]
end

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
			local p = active_profile()
			if p ~= nil then
				p.currentPhase = data.index or 0
				save_config()
			end
		elseif data.type == "setProfile" then
			config.currentProfile = data.index or 0
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

-- First run with no rotation yet: pop the config window so the user can paste one.
if #config.profiles == 0 then
	open_config_window()
end
