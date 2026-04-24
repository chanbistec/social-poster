import { existsSync, readFileSync } from "fs";
import { join } from "path";

const GEMINI_MODEL = "gemini-2.5-flash";
const MAX_BATCH_COUNT = 12;

export interface ContentBriefContext {
  category: string;
  pipelineName?: string | null;
  pipelineDescription?: string | null;
  tenantName?: string | null;
}

export interface ContentBrief {
  title: string;
  tip: string;
  highlight: string;
  hashtags: string[];
}

function getApiKey(): string {
  if (process.env.GOOGLE_API_KEY) return process.env.GOOGLE_API_KEY;
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;

  try {
    const envPath = join(process.cwd(), "..", "area6-health-tips", ".env");
    if (existsSync(envPath)) {
      const content = readFileSync(envPath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("GEMINI_API_KEY=")) {
          return trimmed.split("=", 2)[1].trim();
        }
        if (trimmed.startsWith("GOOGLE_API_KEY=")) {
          return trimmed.split("=", 2)[1].trim();
        }
      }
    }
  } catch {
    // ignore fallback read failures
  }

  throw new Error("No API key found. Set GOOGLE_API_KEY or GEMINI_API_KEY env variable.");
}

function stripCodeFences(value: string): string {
  let cleaned = value.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  }
  return cleaned;
}

function extractJsonValue(raw: string): string {
  const cleaned = stripCodeFences(raw);
  const objectStart = cleaned.indexOf("{");
  const objectEnd = cleaned.lastIndexOf("}");
  const arrayStart = cleaned.indexOf("[");
  const arrayEnd = cleaned.lastIndexOf("]");

  if (arrayStart !== -1 && arrayEnd > arrayStart && (objectStart === -1 || arrayStart < objectStart)) {
    return cleaned.slice(arrayStart, arrayEnd + 1);
  }

  if (objectStart !== -1 && objectEnd > objectStart) {
    return cleaned.slice(objectStart, objectEnd + 1);
  }

  throw new Error("Gemini returned no JSON value");
}

function normalizeText(value: unknown, fallback: string, maxLength: number): string {
  if (typeof value !== "string") return fallback;
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) return fallback;
  return cleaned.slice(0, maxLength).trim();
}

function titleFromCategory(category: string): string {
  return category
    .split(/[-\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function fallbackBrief(category: string, index = 0): ContentBrief {
  const prettyCategory = titleFromCategory(category);
  const suffix = index > 0 ? ` ${index + 1}` : "";
  return {
    title: `${prettyCategory} Tip${suffix}`,
    tip: `Try one simple ${category.replace(/-/g, " ")} habit today and stick with it long enough to notice how your energy and consistency improve.`,
    highlight: prettyCategory.split(" ")[0] || "Focus",
    hashtags: ["#health", `#${category.replace(/[^a-z0-9]+/gi, "") || "wellness"}`, "#wellness"],
  };
}

function normalizeHashtags(value: unknown, category: string): string[] {
  const rawItems = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  const normalized = rawItems
    .map((item) => (typeof item === "string" ? item : String(item ?? "")))
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.replace(/^#+/, ""))
    .map((item) => item.replace(/\s+/g, ""))
    .map((item) => item.replace(/[^a-zA-Z0-9_-]/g, ""))
    .filter(Boolean)
    .map((item) => `#${item}`);

  const deduped = Array.from(new Set(normalized)).slice(0, 6);
  if (deduped.length > 0) return deduped;

  return fallbackBrief(category).hashtags;
}

function normalizeBrief(value: unknown, category: string, index = 0): ContentBrief {
  const fallback = fallbackBrief(category, index);
  const parsed = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

  return {
    title: normalizeText(parsed.title, fallback.title, 120),
    tip: normalizeText(parsed.tip, fallback.tip, 400),
    highlight: normalizeText(parsed.highlight, fallback.highlight, 40),
    hashtags: normalizeHashtags(parsed.hashtags, category),
  };
}

function clampCount(count: number) {
  if (!Number.isFinite(count)) return 1;
  return Math.min(MAX_BATCH_COUNT, Math.max(1, Math.floor(count)));
}

export async function generateContentBrief(context: ContentBriefContext): Promise<ContentBrief> {
  const [brief] = await generateContentBriefs(context, 1);
  return brief;
}

export async function generateContentBriefs(
  context: ContentBriefContext,
  requestedCount = 1,
): Promise<ContentBrief[]> {
  const category = context.category.trim();
  if (!category) {
    throw new Error("category is required");
  }

  const count = clampCount(requestedCount);
  const apiKey = getApiKey();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  const categoryLabel = titleFromCategory(category);

  const response = await fetch(`${url}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: `You write short social content briefs for a dark, modern wellness content app.
Create ${count} distinct draft${count === 1 ? "" : "s"} from the category below.

Category: ${categoryLabel}
Pipeline name: ${context.pipelineName?.trim() || "General social content"}
Pipeline description: ${context.pipelineDescription?.trim() || ""}
Tenant / brand: ${context.tenantName?.trim() || ""}

Return ONLY valid JSON.
- If count is 1, return a single object with this exact shape:
{
  "title": "short title",
  "tip": "2-4 concise sentences of social-ready tip text",
  "highlight": "one punchy word",
  "hashtags": ["#tag1", "#tag2", "#tag3"]
}
- If count is greater than 1, return an array of objects with that same shape.

Rules:
- Make each draft meaningfully different, not reworded duplicates.
- Keep the tone useful, credible, and social-ready.
- Each title should be under 70 characters.
- Each tip should be practical, clean, and under 350 characters.
- Each highlight must be a single word.
- Hashtags should be relevant and safe, max 6.
- Do not include markdown, commentary, or code fences.`,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.8,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!raw) {
    return Array.from({ length: count }, (_, index) => fallbackBrief(category, index));
  }

  try {
    const parsed = JSON.parse(extractJsonValue(raw));
    const items = Array.isArray(parsed) ? parsed : [parsed];
    const normalized = items.slice(0, count).map((item, index) => normalizeBrief(item, category, index));

    if (normalized.length >= count) {
      return normalized;
    }

    return [
      ...normalized,
      ...Array.from({ length: count - normalized.length }, (_, index) => fallbackBrief(category, normalized.length + index)),
    ];
  } catch {
    return Array.from({ length: count }, (_, index) => fallbackBrief(category, index));
  }
}
