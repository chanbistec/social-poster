"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DEFAULT_VIDEO_SAFE_ZONES,
  type PlatformType,
  type VideoOverlayAnchor,
  type VideoPlatformSafeZoneConfig,
  type VideoSafeZonesConfig,
} from "@/lib/types";

const TYPES = [
  { value: "reel", label: "Reel" },
  { value: "short", label: "Short" },
  { value: "social_image", label: "Social Image" },
  { value: "custom", label: "Custom" },
];

const PLATFORMS = ["youtube", "instagram", "facebook"];
const OVERLAY_ANCHORS: VideoOverlayAnchor[] = [
  "top-left",
  "top-center",
  "top-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
];

const ASPECT_RATIOS = ["9:16", "1:1", "16:9"];

function CollapsibleSection({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-zinc-900/40">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-zinc-300 hover:text-white transition-colors"
      >
        {title}
        <svg
          className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="border-t border-white/10 px-4 py-4 space-y-4">{children}</div>}
    </div>
  );
}

export default function NewPipelinePage() {
  const router = useRouter();
  const [tenants, setTenants] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Form state
  const [tenantId, setTenantId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("reel");
  const [platforms, setPlatforms] = useState<string[]>([]);

  // Collapsible sections
  const [ttsOpen, setTtsOpen] = useState(false);
  const [imagenOpen, setImagenOpen] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);

  // TTS config
  const [ttsModelPath, setTtsModelPath] = useState("");
  const [ttsLengthScale, setTtsLengthScale] = useState(1.15);

  // Imagen config
  const [imagenModel, setImagenModel] = useState("imagen-4.0-fast-generate-001");
  const [imagenAspectRatio, setImagenAspectRatio] = useState("9:16");
  const [imagenSceneCount, setImagenSceneCount] = useState(3);

  // Video config
  const [videoIntroDuration, setVideoIntroDuration] = useState(2);
  const [videoOutroDuration, setVideoOutroDuration] = useState(3);
  const [videoVoiceDelay, setVideoVoiceDelay] = useState(2);
  const [videoBgmVolume, setVideoBgmVolume] = useState(0.2);
  const [videoSafeZones, setVideoSafeZones] = useState<VideoSafeZonesConfig>({
    ...DEFAULT_VIDEO_SAFE_ZONES,
  });

  useEffect(() => {
    fetch("/api/tenants")
      .then((r) => r.json())
      .then((d) => setTenants(d.data || []))
      .catch(() => {});
  }, []);

  const togglePlatform = (p: string) => {
    setPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  };

  const showVideoConfig = type === "reel" || type === "short";

  const updatePlatformSafeZone = (
    platform: PlatformType,
    field: "top" | "bottom" | "left" | "right",
    value: number
  ) => {
    setVideoSafeZones((prev) => ({
      ...prev,
      [platform]: {
        ...(prev[platform] ?? DEFAULT_VIDEO_SAFE_ZONES[platform]),
        safe_zone: {
          ...((prev[platform] ?? DEFAULT_VIDEO_SAFE_ZONES[platform]).safe_zone),
          [field]: Math.max(0, value || 0),
        },
      },
    }));
  };

  const updateOverlayPosition = (
    platform: PlatformType,
    overlay: "logo" | "watermark",
    field: "anchor" | "offset_x" | "offset_y",
    value: string | number
  ) => {
    setVideoSafeZones((prev) => ({
      ...prev,
      [platform]: {
        ...(prev[platform] ?? DEFAULT_VIDEO_SAFE_ZONES[platform]),
        overlays: {
          ...(prev[platform]?.overlays ?? DEFAULT_VIDEO_SAFE_ZONES[platform].overlays),
          [overlay]: {
            ...((prev[platform]?.overlays ?? DEFAULT_VIDEO_SAFE_ZONES[platform].overlays)[overlay]),
            [field]: field === "anchor" ? value : Number(value) || 0,
          },
        },
      },
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const body: any = {
      tenant_id: tenantId,
      name,
      description: description || undefined,
      type,
      platforms,
    };

    if (ttsOpen && ttsModelPath) {
      body.tts_config = {
        model_path: ttsModelPath,
        length_scale: ttsLengthScale,
      };
    }

    if (imagenOpen) {
      body.imagen_config = {
        model: imagenModel,
        aspect_ratio: imagenAspectRatio,
        scene_count: imagenSceneCount,
      };
    }

    if (showVideoConfig) {
      body.video_config = {
        intro_duration: videoIntroDuration,
        outro_duration: videoOutroDuration,
        voice_delay: videoVoiceDelay,
        bgm_volume: videoBgmVolume,
        safe_zones: videoSafeZones,
      };
    }

    try {
      const res = await fetch("/api/pipelines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to create pipeline");
        setLoading(false);
        return;
      }

      router.push(`/pipelines/${data.data.id}`);
    } catch {
      setError("Network error");
      setLoading(false);
    }
  };

  const inputClass =
    "w-full rounded-md border border-white/10 bg-zinc-900 px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 min-h-[44px] sm:min-h-0 sm:py-2";
  const labelClass = "block text-xs text-zinc-400 mb-1";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Create Pipeline</h1>
        <p className="text-sm text-zinc-400">
          Set up a new content generation pipeline template
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Tenant */}
        <div>
          <label className={labelClass}>
            Tenant <span className="text-red-400">*</span>
          </label>
          <select
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            required
            className={inputClass}
          >
            <option value="">Select tenant…</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        {/* Name */}
        <div>
          <label className={labelClass}>
            Name <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="e.g. Daily Reel Generator"
            className={inputClass}
          />
        </div>

        {/* Description */}
        <div>
          <label className={labelClass}>Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Optional description…"
            className={inputClass + " min-h-[80px]"}
          />
        </div>

        {/* Type */}
        <div>
          <label className={labelClass}>
            Type <span className="text-red-400">*</span>
          </label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className={inputClass}
          >
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        {/* Platforms */}
        <div>
          <label className={labelClass}>Platforms</label>
          <div className="flex flex-wrap gap-3">
            {PLATFORMS.map((p) => (
              <label
                key={p}
                className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={platforms.includes(p)}
                  onChange={() => togglePlatform(p)}
                  className="rounded border-white/20 bg-zinc-800 text-orange-500 focus:ring-orange-500 focus:ring-offset-0"
                />
                <span className="capitalize">{p}</span>
              </label>
            ))}
          </div>
        </div>

        {/* TTS Config */}
        <CollapsibleSection
          title="TTS Configuration"
          open={ttsOpen}
          onToggle={() => setTtsOpen(!ttsOpen)}
        >
          <div>
            <label className={labelClass}>Model Path</label>
            <input
              type="text"
              value={ttsModelPath}
              onChange={(e) => setTtsModelPath(e.target.value)}
              placeholder="Path to TTS model"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Length Scale</label>
            <input
              type="number"
              step="0.01"
              value={ttsLengthScale}
              onChange={(e) => setTtsLengthScale(parseFloat(e.target.value) || 1.15)}
              className={inputClass}
            />
          </div>
        </CollapsibleSection>

        {/* Imagen Config */}
        <CollapsibleSection
          title="Imagen Configuration"
          open={imagenOpen}
          onToggle={() => setImagenOpen(!imagenOpen)}
        >
          <div>
            <label className={labelClass}>Model</label>
            <input
              type="text"
              value={imagenModel}
              onChange={(e) => setImagenModel(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Aspect Ratio</label>
            <select
              value={imagenAspectRatio}
              onChange={(e) => setImagenAspectRatio(e.target.value)}
              className={inputClass}
            >
              {ASPECT_RATIOS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Scene Count</label>
            <input
              type="number"
              min={1}
              value={imagenSceneCount}
              onChange={(e) => setImagenSceneCount(parseInt(e.target.value) || 3)}
              className={inputClass}
            />
          </div>
        </CollapsibleSection>

        {/* Video Config — only for reel/short */}
        {showVideoConfig && (
          <CollapsibleSection
            title="Video Configuration"
            open={videoOpen}
            onToggle={() => setVideoOpen(!videoOpen)}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Intro Duration (s)</label>
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  value={videoIntroDuration}
                  onChange={(e) => setVideoIntroDuration(parseFloat(e.target.value) || 2)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Outro Duration (s)</label>
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  value={videoOutroDuration}
                  onChange={(e) => setVideoOutroDuration(parseFloat(e.target.value) || 3)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Voice Delay (s)</label>
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  value={videoVoiceDelay}
                  onChange={(e) => setVideoVoiceDelay(parseFloat(e.target.value) || 2)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>BGM Volume</label>
                <input
                  type="number"
                  step="0.05"
                  min={0}
                  max={1}
                  value={videoBgmVolume}
                  onChange={(e) => setVideoBgmVolume(parseFloat(e.target.value) || 0.2)}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <div>
                <h3 className="text-sm font-medium text-white">Platform safe zones</h3>
                <p className="mt-1 text-xs text-zinc-400">
                  Fine-tune how far overlays stay away from platform UI chrome. When multiple
                  platforms are selected, rendering uses the most conservative bounds.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                {PLATFORMS.map((platform) => {
                  const config =
                    (videoSafeZones[platform as PlatformType] as VideoPlatformSafeZoneConfig | undefined) ??
                    DEFAULT_VIDEO_SAFE_ZONES[platform as PlatformType];
                  const selected = platforms.includes(platform);

                  return (
                    <div
                      key={platform}
                      className={`rounded-xl border p-4 transition-colors ${
                        selected
                          ? "border-orange-500/40 bg-orange-500/5"
                          : "border-white/10 bg-zinc-950/70"
                      }`}
                    >
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <h4 className="text-sm font-medium capitalize text-white">{platform}</h4>
                          <p className="text-xs text-zinc-500">
                            {selected ? "Selected for this template" : "Saved as a platform preset"}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                            selected
                              ? "bg-orange-500/15 text-orange-300"
                              : "bg-zinc-800 text-zinc-400"
                          }`}
                        >
                          {selected ? "Active" : "Preset"}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        {(["top", "bottom", "left", "right"] as const).map((field) => (
                          <div key={field}>
                            <label className={labelClass}>{field[0].toUpperCase() + field.slice(1)} inset</label>
                            <input
                              type="number"
                              min={0}
                              value={config.safe_zone[field]}
                              onChange={(e) =>
                                updatePlatformSafeZone(
                                  platform as PlatformType,
                                  field,
                                  parseInt(e.target.value, 10) || 0
                                )
                              }
                              className={inputClass}
                            />
                          </div>
                        ))}
                      </div>

                      <div className="mt-4 space-y-4 rounded-lg border border-white/10 bg-zinc-900/70 p-3">
                        {(["logo", "watermark"] as const).map((overlay) => (
                          <div key={overlay} className="space-y-3">
                            <div>
                              <h5 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                                {overlay}
                              </h5>
                            </div>
                            <div>
                              <label className={labelClass}>Anchor</label>
                              <select
                                value={config.overlays[overlay].anchor}
                                onChange={(e) =>
                                  updateOverlayPosition(
                                    platform as PlatformType,
                                    overlay,
                                    "anchor",
                                    e.target.value
                                  )
                                }
                                className={inputClass}
                              >
                                {OVERLAY_ANCHORS.map((anchor) => (
                                  <option key={anchor} value={anchor}>
                                    {anchor}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className={labelClass}>Offset X</label>
                                <input
                                  type="number"
                                  value={config.overlays[overlay].offset_x ?? 0}
                                  onChange={(e) =>
                                    updateOverlayPosition(
                                      platform as PlatformType,
                                      overlay,
                                      "offset_x",
                                      parseInt(e.target.value, 10) || 0
                                    )
                                  }
                                  className={inputClass}
                                />
                              </div>
                              <div>
                                <label className={labelClass}>Offset Y</label>
                                <input
                                  type="number"
                                  value={config.overlays[overlay].offset_y ?? 0}
                                  onChange={(e) =>
                                    updateOverlayPosition(
                                      platform as PlatformType,
                                      overlay,
                                      "offset_y",
                                      parseInt(e.target.value, 10) || 0
                                    )
                                  }
                                  className={inputClass}
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </CollapsibleSection>
        )}

        {/* Submit */}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end pt-2">
          <button
            type="button"
            onClick={() => router.push("/pipelines")}
            className="rounded-md border border-white/10 bg-zinc-800 px-4 py-2.5 text-sm text-white hover:bg-zinc-700 min-h-[44px] w-full sm:w-auto"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-orange-500 px-6 py-2.5 text-sm font-medium text-white hover:bg-orange-400 disabled:opacity-50 min-h-[44px] w-full sm:w-auto"
          >
            {loading ? "Creating…" : "Create Pipeline"}
          </button>
        </div>
      </form>
    </div>
  );
}
