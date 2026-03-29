#!/usr/bin/env node
import { Command } from "commander";
import fs from "fs";
import os from "os";
import path from "path";

const program = new Command();
const cfgPath = path.join(os.homedir(), ".social-poster", "config.json");

function readConfig() {
  if (!fs.existsSync(cfgPath)) return { baseUrl: "http://localhost:3000", token: "" };
  return JSON.parse(fs.readFileSync(cfgPath, "utf8"));
}

function writeConfig(cfg: any) {
  fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
}

async function api(pathname: string, method = "GET", body?: any) {
  const cfg = readConfig();
  const headers: any = { "Content-Type": "application/json" };
  if (cfg.token) headers.Cookie = `sp_token=${cfg.token}`;
  const res = await fetch(cfg.baseUrl + pathname, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "API error");
  return json.data;
}

program
  .name("social-poster")
  .description("CLI for Social Poster platform")
  .option("--base-url <url>", "API base URL", "http://localhost:3000")
  .hook("preAction", (cmd) => {
    const cfg = readConfig();
    cfg.baseUrl = cmd.opts().baseUrl || cfg.baseUrl;
    writeConfig(cfg);
  });

program
  .command("login")
  .description("Login and store token")
  .requiredOption("-u, --username <username>")
  .requiredOption("-p, --password <password>")
  .action(async (opts) => {
    const cfg = readConfig();
    const res = await fetch(cfg.baseUrl + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: opts.username, password: opts.password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Login failed");
    const token = res.headers.get("set-cookie")?.match(/sp_token=([^;]+)/)?.[1] || "";
    cfg.token = token;
    writeConfig(cfg);
    console.log("Logged in");
  });

program
  .command("tenants:list")
  .action(async () => {
    const data = await api("/api/tenants");
    console.table(data);
  });

program
  .command("tenants:create")
  .requiredOption("--id <id>")
  .requiredOption("--name <name>")
  .option("--description <desc>")
  .action(async (opts) => {
    const data = await api("/api/tenants", "POST", opts);
    console.log(data);
  });

program
  .command("tenants:delete")
  .requiredOption("--id <id>")
  .action(async (opts) => {
    const data = await api(`/api/tenants/${opts.id}`, "DELETE");
    console.log(data);
  });

program
  .command("posts:list")
  .option("--tenant <id>")
  .action(async (opts) => {
    const q = opts.tenant ? `?tenant_id=${opts.tenant}` : "";
    const data = await api(`/api/posts${q}`);
    console.table(data);
  });

program
  .command("posts:create")
  .requiredOption("--tenant <id>")
  .requiredOption("--caption <caption>")
  .requiredOption("--media <path>")
  .requiredOption("--platforms <list>")
  .action(async (opts) => {
    const data = await api("/api/posts", "POST", {
      tenant_id: opts.tenant,
      caption: opts.caption,
      hashtags: [],
      media_paths: [opts.media],
      platforms: opts.platforms.split(","),
      status: "draft",
    });
    console.log(data);
  });

program
  .command("posts:approve")
  .requiredOption("--id <id>")
  .action(async (opts) => {
    const data = await api(`/api/posts/${opts.id}/approve`, "POST", {});
    console.log(data);
  });

program
  .command("posts:publish")
  .requiredOption("--id <id>")
  .action(async (opts) => {
    const data = await api(`/api/posts/${opts.id}/publish`, "POST", {});
    console.log(data);
  });

program.parseAsync(process.argv);
