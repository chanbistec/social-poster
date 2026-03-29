import { Server } from "@modelcontextprotocol/sdk/server";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio";

const BASE = process.env.SOCIAL_POSTER_URL || "http://localhost:3000";

async function api(path: string, method = "GET", body?: any) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "API error");
  return json.data;
}

const server = new Server({ name: "social-poster", version: "0.1.0" });

server.addTool({
  name: "list_tenants",
  description: "List all tenants",
  inputSchema: { type: "object", properties: {} },
}, async () => {
  const data = await api("/api/tenants");
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
});

server.addTool({
  name: "create_post",
  description: "Create a draft post",
  inputSchema: {
    type: "object",
    properties: {
      tenant_id: { type: "string" },
      caption: { type: "string" },
      media_paths: { type: "array", items: { type: "string" } },
      platforms: { type: "array", items: { type: "string" } }
    },
    required: ["tenant_id", "caption", "media_paths", "platforms"]
  },
}, async (input) => {
  const data = await api("/api/posts", "POST", {
    ...input,
    hashtags: [],
    status: "draft",
  });
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
});

server.addTool({
  name: "approve_post",
  description: "Approve a post",
  inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
}, async (input) => {
  const data = await api(`/api/posts/${input.id}/approve`, "POST", {});
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
});

server.addTool({
  name: "schedule_post",
  description: "Schedule a post",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string" }, scheduled_at: { type: "string" } },
    required: ["id", "scheduled_at"]
  },
}, async (input) => {
  const data = await api(`/api/posts/${input.id}/schedule`, "POST", { scheduled_at: input.scheduled_at });
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
});

server.addTool({
  name: "list_posts",
  description: "List posts",
  inputSchema: { type: "object", properties: { tenant_id: { type: "string" } } },
}, async (input) => {
  const q = input.tenant_id ? `?tenant_id=${input.tenant_id}` : "";
  const data = await api(`/api/posts${q}`);
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
});

const transport = new StdioServerTransport();
server.connect(transport);
