"use client";

import { useState, useRef, useCallback, useEffect } from "react";

const CATEGORIES = [
  "sleep",
  "exercise",
  "nutrition",
  "hydration",
  "mental",
  "posture",
  "habits",
  "recovery",
  "breathing",
  "gut-health",
] as const;

const WATERMARK_POSITIONS = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
  "center",
] as const;

interface BrandingData {
  tenant_id: string;
  logo_path: string | null;
  colors: Record<string, string>;
  fonts: Record<string, string>;
  intro_frame: string | null;
  outro_frame: string | null;
  watermark: string | null;
  bgm_path: string | null;
  backgrounds: Record<string, string>;
}

interface Props {
  tenantId: string;
  initialBranding: BrandingData | null;
}

export default function BrandingSection({ tenantId, initialBranding }: Props) {
  const [branding, setBranding] = useState<BrandingData>(
    initialBranding ?? {
      tenant_id: tenantId,
      logo_path: null,
      colors: {},
      fonts: {},
      intro_frame: null,
      outro_frame: null,
      watermark: null,
      bgm_path: null,
      backgrounds: {},
    }
  );

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadContextRef = useRef<{
    type: string;
    category?: string;
  } | null>(null);

  // Colors state
  const [colors, setColors] = useState({
    primary: branding.colors?.primary || "#6366f1",
    accent: branding.colors?.accent || "#f59e0b",
    dark: branding.colors?.dark || "#18181b",
    white: branding.colors?.white || "#fafafa",
  });

  // Watermark state
  const [watermarkText, setWatermarkText] = useState(branding.watermark || "");
  const [watermarkPosition, setWatermarkPosition] = useState(
    branding.fonts?.watermark_position || "bottom-right"
  );

  // Font state
  const [fontPath, setFontPath] = useState(branding.fonts?.path || "");

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const refreshBranding = useCallback(async () => {
    try {
      const res = await fetch(`/api/tenants/${tenantId}/branding`);
      if (res.ok) {
        const { data } = await res.json();
        setBranding(data);
      }
    } catch {
      /* ignore */
    }
  }, [tenantId]);

  const triggerUpload = (type: string, category?: string) => {
    uploadContextRef.current = { type, category };
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadContextRef.current) return;

    const { type, category } = uploadContextRef.current;
    const label = category ? `${type}/${category}` : type;
    setUploading(label);

    try {
      const form = new FormData();
      form.append("file", file);
      form.append("type", type);
      if (category) form.append("category", category);

      const res = await fetch(`/api/tenants/${tenantId}/branding/upload`, {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Upload failed" }));
        showToast(`Error: ${err.error}`);
        return;
      }

      const { data } = await res.json();

      // Update branding record with the new path
      const update: Record<string, unknown> = {};
      if (type === "logo") update.logo_path = data.path;
      else if (type === "intro_frame") update.intro_frame = data.path;
      else if (type === "outro_frame") update.outro_frame = data.path;
      else if (type === "bgm") update.bgm_path = data.path;
      else if (type === "background" && category) {
        update.backgrounds = { ...branding.backgrounds, [category]: data.path };
      }

      // Save to branding record
      await fetch(`/api/tenants/${tenantId}/branding`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      });

      await refreshBranding();
      showToast(`Uploaded ${label} successfully`);
    } catch {
      showToast("Upload failed");
    } finally {
      setUploading(null);
      uploadContextRef.current = null;
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/branding`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          colors,
          watermark: watermarkText || null,
          fonts: {
            path: fontPath || undefined,
            watermark_position: watermarkPosition,
          },
        }),
      });

      if (res.ok) {
        await refreshBranding();
        showToast("Branding saved successfully");
      } else {
        showToast("Failed to save branding");
      }
    } catch {
      showToast("Failed to save branding");
    } finally {
      setSaving(false);
    }
  };

  // Sync local state when branding refreshes
  useEffect(() => {
    setColors({
      primary: branding.colors?.primary || "#6366f1",
      accent: branding.colors?.accent || "#f59e0b",
      dark: branding.colors?.dark || "#18181b",
      white: branding.colors?.white || "#fafafa",
    });
    setWatermarkText(branding.watermark || "");
    setWatermarkPosition(branding.fonts?.watermark_position || "bottom-right");
    setFontPath(branding.fonts?.path || "");
  }, [branding]);

  const assetUrl = (p: string | null) =>
    p ? `/${p.replace(/\\/g, "/")}` : null;

  return (
    <div className="rounded-lg border border-white/10 bg-zinc-900/60 p-4 space-y-6">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileSelected}
      />

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded-lg bg-emerald-600/90 px-4 py-2 text-sm text-white shadow-lg animate-in fade-in slide-in-from-top-2">
          {toast}
        </div>
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-300">Branding</h3>
        <button
          onClick={saveSettings}
          disabled={saving}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving…" : "Save Settings"}
        </button>
      </div>

      {/* Logo */}
      <div>
        <label className="mb-2 block text-xs font-medium text-zinc-400 uppercase tracking-wider">
          Logo
        </label>
        <div className="flex items-center gap-4">
          {branding.logo_path ? (
            <div className="relative h-16 w-16 overflow-hidden rounded-lg border border-white/10 bg-zinc-800">
              <img
                src={assetUrl(branding.logo_path)!}
                alt="Logo"
                className="h-full w-full object-contain"
              />
            </div>
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-white/20 bg-zinc-800/50 text-zinc-500 text-xs">
              None
            </div>
          )}
          <button
            onClick={() => triggerUpload("logo")}
            disabled={!!uploading}
            className="rounded-md border border-dashed border-white/20 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 hover:border-white/30 transition-colors disabled:opacity-50"
          >
            {uploading === "logo" ? "Uploading…" : "Upload Logo"}
          </button>
        </div>
      </div>

      {/* Colors */}
      <div>
        <label className="mb-2 block text-xs font-medium text-zinc-400 uppercase tracking-wider">
          Colors
        </label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(["primary", "accent", "dark", "white"] as const).map((key) => (
            <div key={key} className="space-y-1.5">
              <span className="text-xs text-zinc-400 capitalize">{key}</span>
              <div className="flex items-center gap-2">
                <div
                  className="h-8 w-8 shrink-0 rounded-md border border-white/10"
                  style={{ backgroundColor: colors[key] }}
                />
                <input
                  type="text"
                  value={colors[key]}
                  onChange={(e) =>
                    setColors((c) => ({ ...c, [key]: e.target.value }))
                  }
                  className="w-full rounded-md border border-white/10 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 font-mono focus:border-indigo-500 focus:outline-none"
                  placeholder="#000000"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Category Backgrounds */}
      <div>
        <label className="mb-2 block text-xs font-medium text-zinc-400 uppercase tracking-wider">
          Category Backgrounds
        </label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
          {CATEGORIES.map((cat) => {
            const bg = branding.backgrounds?.[cat];
            return (
              <div key={cat} className="space-y-1">
                <span className="text-[10px] text-zinc-500 capitalize">
                  {cat.replace("-", " ")}
                </span>
                <button
                  onClick={() => triggerUpload("background", cat)}
                  disabled={!!uploading}
                  className="group relative flex h-[100px] w-full items-center justify-center overflow-hidden rounded-lg border border-dashed border-white/20 bg-zinc-800/50 hover:border-white/30 hover:bg-zinc-800 transition-colors disabled:opacity-50"
                >
                  {bg ? (
                    <img
                      src={assetUrl(bg)!}
                      alt={cat}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-xs text-zinc-500 group-hover:text-zinc-400">
                      +
                    </span>
                  )}
                  {uploading === `background/${cat}` && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-xs text-white">
                      …
                    </div>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Intro / Outro Frames */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {(["intro_frame", "outro_frame"] as const).map((type) => {
          const label = type === "intro_frame" ? "Intro Frame" : "Outro Frame";
          const val = branding[type];
          return (
            <div key={type}>
              <label className="mb-2 block text-xs font-medium text-zinc-400 uppercase tracking-wider">
                {label}
              </label>
              <div className="flex items-center gap-3">
                {val ? (
                  <div className="relative h-16 w-24 overflow-hidden rounded-lg border border-white/10 bg-zinc-800">
                    <img
                      src={assetUrl(val)!}
                      alt={label}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="flex h-16 w-24 items-center justify-center rounded-lg border border-dashed border-white/20 bg-zinc-800/50 text-zinc-500 text-xs">
                    None
                  </div>
                )}
                <button
                  onClick={() => triggerUpload(type)}
                  disabled={!!uploading}
                  className="rounded-md border border-dashed border-white/20 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 hover:border-white/30 transition-colors disabled:opacity-50"
                >
                  {uploading === type ? "Uploading…" : `Upload ${label}`}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* BGM */}
      <div>
        <label className="mb-2 block text-xs font-medium text-zinc-400 uppercase tracking-wider">
          Background Music (BGM)
        </label>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-300 font-mono truncate max-w-[200px]">
            {branding.bgm_path
              ? branding.bgm_path.split("/").pop()
              : "No file"}
          </span>
          <button
            onClick={() => triggerUpload("bgm")}
            disabled={!!uploading}
            className="rounded-md border border-dashed border-white/20 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 hover:border-white/30 transition-colors disabled:opacity-50"
          >
            {uploading === "bgm" ? "Uploading…" : "Upload BGM"}
          </button>
        </div>
      </div>

      {/* Watermark */}
      <div>
        <label className="mb-2 block text-xs font-medium text-zinc-400 uppercase tracking-wider">
          Watermark
        </label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="text"
            value={watermarkText}
            onChange={(e) => setWatermarkText(e.target.value)}
            placeholder="Watermark text"
            className="flex-1 rounded-md border border-white/10 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 focus:border-indigo-500 focus:outline-none"
          />
          <select
            value={watermarkPosition}
            onChange={(e) => setWatermarkPosition(e.target.value)}
            className="rounded-md border border-white/10 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 focus:border-indigo-500 focus:outline-none"
          >
            {WATERMARK_POSITIONS.map((pos) => (
              <option key={pos} value={pos}>
                {pos.replace("-", " ")}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Font */}
      <div>
        <label className="mb-2 block text-xs font-medium text-zinc-400 uppercase tracking-wider">
          Font Path
        </label>
        <input
          type="text"
          value={fontPath}
          onChange={(e) => setFontPath(e.target.value)}
          placeholder="/path/to/font.ttf"
          className="w-full rounded-md border border-white/10 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 font-mono focus:border-indigo-500 focus:outline-none"
        />
      </div>
    </div>
  );
}
