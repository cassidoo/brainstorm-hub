// Extension: brainstorm-hub
// Turns this repo into a brainstorming hub. The agent leads as a brainstorm
// interviewer; finished ideas are summarized into Result Documents and saved
// under ideas/. A canvas lists every idea and lets you start a new one or riff
// on an existing one.
//
// Wiring lives here; prompts live in prompts.mjs and the iframe markup lives in
// ui.mjs.

import { createServer } from "node:http";
import { readFile, readdir, writeFile, mkdir, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { joinSession, createCanvas } from "@github/copilot-sdk/extension";
import { INTERVIEW_PROMPT, RESULT_PROMPT, REACTION_PROMPT, CONTROL_TAG } from "./prompts.mjs";
import { renderHtml } from "./ui.mjs";

// This extension lives at <repo>/.github/extensions/brainstorm-hub/, so the repo
// root is three levels up. Ideas are stored in <repo>/ideas/ (git-ignored), which
// is what we want regardless of where the session workspace happens to point.
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

// ---------------------------------------------------------------------------
// Module state (single shared server + per-session conversation/workflow state)
// ---------------------------------------------------------------------------

let sessionRef = null;          // CopilotSession, set after joinSession
let httpServer = null;          // single shared loopback server
let baseUrl = null;             // http://127.0.0.1:<port>/
const sseClients = new Set();   // open SSE response objects

let workflowState = "idle";     // idle | interviewing | finishing | saving
let transcript = [];            // [{ role: "H" | "A", text }]
let riffSource = null;          // idea id this interview riffs on (if any)

const IDEAS_DIR_NAME = "ideas";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(message, level) {
    if (sessionRef) {
        try { sessionRef.log(message, level ? { level } : undefined); } catch {}
    }
}

function ideasDir() {
    return join(REPO_ROOT, IDEAS_DIR_NAME);
}

function broadcast(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data || {})}\n\n`;
    for (const res of sseClients) {
        try { res.write(payload); } catch {}
    }
}

function setState(next) {
    workflowState = next;
    broadcast("state", { state: next });
}

function slugify(title) {
    const base = String(title)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60)
        .replace(/-+$/g, "");
    return base || "idea";
}

function stripFrontmatter(text) {
    const m = /^---\n[\s\S]*?\n---\n?/.exec(text);
    return m ? text.slice(m[0].length).replace(/^\n+/, "") : text;
}

function titleFromContent(text, fallbackId) {
    const body = stripFrontmatter(text);
    const heading = /^#\s+(.+)$/m.exec(body);
    if (heading) return heading[1].trim();
    const firstLine = body.split("\n").map((l) => l.trim()).find(Boolean);
    if (firstLine) return firstLine.replace(/^#+\s*/, "");
    if (fallbackId) {
        return fallbackId.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    }
    return "Untitled idea";
}

function metaFromFrontmatter(text, key) {
    const m = new RegExp("^" + key + ":\\s*\"?([^\"\\n]+)\"?\\s*$", "m").exec(text);
    return m ? m[1].trim() : null;
}

async function listIdeas() {
    const dir = ideasDir();
    if (!dir) return [];
    let files;
    try {
        files = await readdir(dir);
    } catch {
        return []; // directory missing — treated as no ideas yet
    }
    const ideas = [];
    for (const file of files) {
        if (!file.endsWith(".md")) continue;
        const id = file.slice(0, -3);
        let raw = "";
        try { raw = await readFile(join(dir, file), "utf8"); } catch { continue; }
        ideas.push({
            id,
            title: metaFromFrontmatter(raw, "title") || titleFromContent(raw, id),
            created: metaFromFrontmatter(raw, "created") || "",
        });
    }
    ideas.sort((a, b) => (b.created || "").localeCompare(a.created || "") || a.title.localeCompare(b.title));
    return ideas;
}

async function readIdea(id) {
    const dir = ideasDir();
    if (!dir) return null;
    if (!/^[a-z0-9-]+$/.test(id)) return null; // guard against path traversal
    try {
        const raw = await readFile(join(dir, id + ".md"), "utf8");
        return stripFrontmatter(raw);
    } catch {
        return null;
    }
}

async function uniquePath(dir, slug) {
    let candidate = slug;
    let n = 2;
    // eslint-disable-next-line no-constant-condition
    while (true) {
        try {
            await access(join(dir, candidate + ".md"));
            candidate = `${slug}-${n++}`;
        } catch {
            return { id: candidate, path: join(dir, candidate + ".md") };
        }
    }
}

function buildTranscript() {
    return transcript.map((t) => `${t.role}: ${t.text}`).join("\n\n");
}

// Send a control prompt to the chat. Tagged so the transcript capture ignores
// it, and the agent never sees the literal tag (stripped in onUserPromptSubmitted).
function sendControl(text) {
    if (!sessionRef) return;
    Promise.resolve()
        .then(() => sessionRef.send(`${CONTROL_TAG} ${text}`))
        .catch((err) => log(`brainstorm-hub: send failed: ${err}`, "error"));
}

// ---------------------------------------------------------------------------
// HTTP server (single shared loopback instance)
// ---------------------------------------------------------------------------

function readBody(req) {
    return new Promise((resolve) => {
        let data = "";
        req.on("data", (c) => (data += c));
        req.on("end", () => {
            try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); }
        });
        req.on("error", () => resolve({}));
    });
}

function json(res, code, obj) {
    res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(obj));
}

async function handleRequest(req, res) {
    const url = new URL(req.url, "http://127.0.0.1");
    const path = url.pathname;

    // Server-Sent Events stream
    if (path === "/events") {
        res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
        });
        res.write(`event: state\ndata: ${JSON.stringify({ state: workflowState })}\n\n`);
        sseClients.add(res);
        req.on("close", () => sseClients.delete(res));
        return;
    }

    if (path === "/api/state") return json(res, 200, { state: workflowState });

    if (path === "/api/ideas") return json(res, 200, { ideas: await listIdeas() });

    if (path.startsWith("/api/ideas/")) {
        const id = decodeURIComponent(path.slice("/api/ideas/".length));
        const content = await readIdea(id);
        if (content == null) return json(res, 404, { error: "not_found" });
        return json(res, 200, { id, content });
    }

    if (req.method === "POST" && path === "/api/new-idea") {
        if (workflowState !== "idle") return json(res, 409, { error: "busy", state: workflowState });
        transcript = [];
        riffSource = null;
        setState("interviewing");
        sendControl(
            "Let's start a brand-new idea. Greet me warmly and begin the brainstorm " +
            "interview by asking what I'm working on or thinking about today. Ask one " +
            "concise question at a time."
        );
        return json(res, 200, { ok: true });
    }

    if (req.method === "POST" && path === "/api/riff") {
        if (workflowState !== "idle") return json(res, 409, { error: "busy", state: workflowState });
        const body = await readBody(req);
        const ideaId = body && body.ideaId;
        const existing = ideaId ? await readIdea(ideaId) : null;
        if (existing == null) return json(res, 404, { error: "not_found" });
        transcript = [];
        riffSource = ideaId;
        setState("interviewing");
        sendControl(
            `I want to start a new idea that builds on an existing one.\n\n${REACTION_PROMPT}\n\n` +
            `Here is the existing idea to riff on:\n<idea>\n${existing}\n</idea>`
        );
        return json(res, 200, { ok: true });
    }

    if (req.method === "POST" && path === "/api/finish") {
        if (workflowState !== "interviewing") return json(res, 409, { error: "not_interviewing", state: workflowState });
        setState("finishing");
        const t = buildTranscript();
        sendControl(
            "I'm done brainstorming for now. Produce the Result Document for our " +
            "conversation, strictly following your result-document rules, then call the " +
            "save_idea tool with the full document as `content`. Do not show me a preamble " +
            "— just create the document and save it.\n\n" +
            `Here is the transcript of our conversation:\n<t>\n${t}\n</t>`
        );
        return json(res, 200, { ok: true });
    }

    // Everything else → the canvas page.
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(renderHtml());
}

async function ensureServer() {
    if (baseUrl) return baseUrl;
    httpServer = createServer((req, res) => {
        handleRequest(req, res).catch((err) => {
            log(`brainstorm-hub: request error: ${err}`, "error");
            try { json(res, 500, { error: "internal" }); } catch {}
        });
    });
    await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
    const addr = httpServer.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    baseUrl = `http://127.0.0.1:${port}/`;
    return baseUrl;
}

// ---------------------------------------------------------------------------
// save_idea tool
// ---------------------------------------------------------------------------

async function saveIdea(args) {
    const content = (args && typeof args.content === "string") ? args.content.trim() : "";
    if (!content) {
        return { textResultForLlm: "save_idea failed: `content` is required and must be the full Result Document markdown.", resultType: "failure" };
    }
    const dir = ideasDir();
    if (!dir) {
        return { textResultForLlm: "save_idea failed: no workspace path is available to write ideas/.", resultType: "failure" };
    }
    setState("saving");
    try {
        await mkdir(dir, { recursive: true });
        const title = titleFromContent(content);
        const { id, path } = await uniquePath(dir, slugify(title));
        const created = new Date().toISOString().slice(0, 10);
        const fm = [
            "---",
            `title: "${title.replace(/"/g, "'")}"`,
            `created: ${created}`,
            ...(riffSource ? [`riffed_from: ${riffSource}`] : []),
            "---",
            "",
        ].join("\n");
        await writeFile(path, fm + content + "\n", "utf8");

        riffSource = null;
        transcript = [];
        setState("idle");
        broadcast("saved", { id, title });
        broadcast("ideas", {});
        log(`Saved idea "${title}" to ideas/${id}.md`);
        return `Saved the idea as ideas/${id}.md (title: "${title}"). It now appears in the Brainstorm Hub canvas.`;
    } catch (err) {
        setState("interviewing");
        return { textResultForLlm: `save_idea failed: ${err}`, resultType: "failure" };
    }
}

// ---------------------------------------------------------------------------
// Standing system guidance (fully steer into brainstorm interviewer)
// ---------------------------------------------------------------------------

const HUB_INSTRUCTIONS = `# Brainstorm Hub

You are the assistant for a brainstorming hub. Your one job is to help the user
explore and clarify their own ideas through conversation, and to turn finished
brainstorms into saved idea documents. Do not take on coding, file-editing, or
other unrelated tasks; if asked, gently redirect to brainstorming.

${INTERVIEW_PROMPT}

## The Brainstorm Hub canvas
A side-panel canvas called "Brainstorm Hub" lists every saved idea and provides
buttons that drive you:
* "New idea" starts a fresh brainstorm.
* "Riff on this idea" starts a new brainstorm that builds on an existing idea.
* "Finish & save idea" asks you to write up and save the current conversation.
When a brainstorm begins, just follow the interview guidance above.

## Saving an idea
When the user finishes (you'll receive an explicit instruction with the
transcript), write a Result Document and persist it by calling the **save_idea**
tool with the full markdown document as the \`content\` argument. Never write
files into ideas/ yourself or by any other means — save_idea is the only save
path. Follow these Result Document rules exactly:

${RESULT_PROMPT}`;

// ---------------------------------------------------------------------------
// Canvas
// ---------------------------------------------------------------------------

const hubCanvas = createCanvas({
    id: "brainstorm-hub",
    displayName: "Brainstorm Hub",
    description: "Dashboard of your brainstormed ideas; start a new idea or riff on an existing one.",
    inputSchema: {
        type: "object",
        properties: {
            ideaId: { type: "string", description: "Optional idea id to open directly in the idea view." },
        },
        additionalProperties: false,
    },
    actions: [
        {
            name: "refresh",
            description: "Refresh the Brainstorm Hub canvas (re-read the ideas list).",
            handler: async () => {
                broadcast("ideas", {});
                return { ok: true, ideas: (await listIdeas()).length };
            },
        },
    ],
    open: async (ctx) => {
        const url = await ensureServer();
        const ideaId = ctx.input && ctx.input.ideaId;
        if (ideaId) {
            const exists = await readIdea(ideaId);
            if (exists != null) {
                return { title: "Brainstorm Hub", url: `${url}?ideaId=${encodeURIComponent(ideaId)}` };
            }
        }
        return { title: "Brainstorm Hub", url };
    },
});

// ---------------------------------------------------------------------------
// Join session
// ---------------------------------------------------------------------------

sessionRef = await joinSession({
    canvases: [hubCanvas],
    systemMessage: {
        mode: "customize",
        sections: {
            custom_instructions: { action: "replace", content: HUB_INSTRUCTIONS },
        },
    },
    tools: [
        {
            name: "save_idea",
            description:
                "Persist a finished brainstorm as an idea document under ideas/. Pass the " +
                "complete Result Document markdown as `content` (it must start with a single " +
                "`# ` title heading). This is the only way ideas are saved.",
            parameters: {
                type: "object",
                properties: {
                    content: {
                        type: "string",
                        description: "The full Result Document markdown, beginning with a `# ` title heading.",
                    },
                },
                required: ["content"],
            },
            handler: async (args) => saveIdea(args),
        },
    ],
    hooks: {
        onUserPromptSubmitted: async (input) => {
            const prompt = (input && input.prompt) || "";
            if (prompt.startsWith(CONTROL_TAG)) {
                // Strip the control tag so the agent never sees it; keep it out of the transcript.
                return { modifiedPrompt: prompt.slice(CONTROL_TAG.length).trimStart() };
            }
            // A genuine user turn. If we weren't already interviewing, this kicks one off.
            if (workflowState === "idle") {
                transcript = [];
                setState("interviewing");
            }
            if (workflowState === "interviewing") {
                transcript.push({ role: "H", text: prompt.trim() });
            }
        },
    },
});

// Capture assistant turns from the root agent for the transcript.
sessionRef.on("assistant.message", (event) => {
    if (event && event.agentId) return; // ignore sub-agents
    const content = event && event.data && event.data.content;
    if (workflowState === "interviewing" && content && content.trim()) {
        transcript.push({ role: "A", text: content.trim() });
    }
});
