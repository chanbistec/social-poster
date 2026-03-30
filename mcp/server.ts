import { Server } from "@modelcontextprotocol/sdk/dist/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/dist/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/dist/types.js";

const BASE = process.env.SOCIAL_POSTER_URL || "http://localhost:3000";

async function api(path: string, method = "GET", body?: Record<string, unknown>) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error((json as any).error || "API error");
  return (json as any).data;
}

const tools = [
  {
    name: "list_tenants",
    description: "List all tenants",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "create_post",
    description: "Create a draft post",
    inputSchema: {
      type: "object" as const,
      properties: {
        tenant_id: { type: "string" },
        caption: { type: "string" },
        media_paths: { type: "array", items: { type: "string" } },
        platforms: { type: "array", items: { type: "string" } },
      },
      required: ["tenant_id", "caption", "media_paths", "platforms"],
    },
  },
  {
    name: "approve_post",
    description: "Approve a post",
    inputSchema: {
      type: "object" as const,
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "schedule_post",
    description: "Schedule a post",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string" },
        scheduled_at: { type: "string" },
      },
      required: ["id", "scheduled_at"],
    },
  },
  {
    name: "list_posts",
    description: "List posts, optionally filtered by tenant",
    inputSchema: {
      type: "object" as const,
      properties: { tenant_id: { type: "string" } },
    },
  },
];

const server = new Server(
  { name: "social-poster", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const input = (args || {}) as Record<string, any>;

  let data: unknown;

  switch (name) {
    case "list_tenants":
      data = await api("/api/tenants");
      break;
    case "create_post":
      data = await api("/api/posts", "POST", {
        ...input,
        hashtags: [],
        status: "draft",
      });
      break;
    case "approve_post":
      data = await api(`/api/posts/${input.id}/approve`, "POST", {});
      break;
    case "schedule_post":
      data = await api(`/api/posts/${input.id}/schedule`, "POST", {
        scheduled_at: input.scheduled_at,
      });
      break;
    case "list_posts": {
      const q = input.tenant_id ? `?tenant_id=${input.tenant_id}` : "";
      data = await api(`/api/posts${q}`);
      break;
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }

  return {
    content: [{ type: "text", text: JSON.stringify(data) }],
  };
});

const transport = new StdioServerTransport();
server.connect(transport);
