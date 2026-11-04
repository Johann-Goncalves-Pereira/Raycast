#!/usr/bin/env node
/**
 * Local Ask Bridge for Omnibar `@Ask`.
 * POST /ask { prompt, provider, model, thinking_level } → { answer }
 *
 * Tries `agi` / Antigravity CLI when available; otherwise returns a clear
 * offline message so the bang still surfaces in the UI.
 */
import http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const PORT = Number(process.env.OMNIBAR_ASK_BRIDGE_PORT || 17834);

async function runAntigravity(prompt, options) {
  const model = options?.model || "gemini-3.8-flash";
  const thinking = options?.thinking_level || "medium";
  const candidates = [
    ["agi", ["ask", "--model", model, "--thinking", thinking, prompt]],
    ["antigravity", ["ask", "--model", model, prompt]],
  ];
  for (const [bin, args] of candidates) {
    try {
      const { stdout } = await execFileAsync(bin, args, {
        timeout: 120_000,
        maxBuffer: 2 * 1024 * 1024,
        env: process.env,
      });
      const answer = stdout.trim();
      if (answer) return answer;
    } catch {
      // try next
    }
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method !== "POST" || req.url !== "/ask") {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid JSON" }));
    return;
  }

  const prompt = String(body.prompt || "").trim();
  if (!prompt) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Missing prompt" }));
    return;
  }

  try {
    const answer = await runAntigravity(prompt, body);
    if (answer) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ answer }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        answer: `Ask Bridge is running, but no Antigravity CLI responded for: “${prompt.slice(0, 120)}”. Install/configure agi with gemini-3.8-flash (thinking_level medium).`,
      }),
    );
  } catch (error) {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Omnibar Ask Bridge listening on http://127.0.0.1:${PORT}`);
});
