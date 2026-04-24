import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { getAuth } from "@/lib/route-auth";
import { generateContentBriefs } from "@/lib/pipeline/content-brief";
import type { PipelineTemplate } from "@/lib/types";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

type TemplateWithTenant = Pick<PipelineTemplate, "id" | "name" | "description" | "type" | "tenant_id"> & {
  tenant_name?: string | null;
};

function parseCount(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.min(12, Math.max(1, Math.floor(numeric)));
}

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuth();
  if (!auth) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const templateId = Number(id);
  if (Number.isNaN(templateId)) {
    return NextResponse.json({ error: "Invalid template ID" }, { status: 400 });
  }

  const template = db
    .prepare(
      `SELECT pt.id, pt.name, pt.description, pt.type, pt.tenant_id, t.name as tenant_name
       FROM pipeline_templates pt
       LEFT JOIN tenants t ON pt.tenant_id = t.id
       WHERE pt.id = ?`,
    )
    .get(templateId) as TemplateWithTenant | undefined;

  if (!template) {
    return NextResponse.json({ error: "Pipeline template not found" }, { status: 404 });
  }

  if (template.type === "custom") {
    return NextResponse.json({ error: "AI draft generation is only available for non-custom pipelines" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const category = typeof body?.category === "string" ? body.category.trim() : "";
  const count = parseCount(body?.count);

  if (!category) {
    return NextResponse.json({ error: "category is required" }, { status: 400 });
  }

  try {
    const briefs = await generateContentBriefs(
      {
        category,
        pipelineName: template.name,
        pipelineDescription: template.description,
        tenantName: template.tenant_name || template.tenant_id,
      },
      count,
    );

    return NextResponse.json({
      data: count === 1 ? briefs[0] : briefs,
      items: briefs,
      count: briefs.length,
      category,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate content brief";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
