/**
 * MyPictures — Cloudflare Worker  (src/worker.js)
 *
 * Routes:
 *   POST /describe          → AI image description (existing)
 *   GET  /folders           → list folders in GitHub repo
 *   POST /folders           → create a new folder (.gitkeep)
 *   POST /upload            → upload file(s) to GitHub repo
 *   OPTIONS *               → CORS preflight
 *
 * Secrets (set via: wrangler secret put SECRET_NAME):
 *   GITHUB_TOKEN   — Fine-grained PAT, chỉ cần "Contents: Read & Write"
 *   GITHUB_OWNER   — vd: khonghao0109
 *   GITHUB_REPO    — vd: PhaoHoaDaNang
 *   GITHUB_BRANCH  — vd: main  (mặc định nếu không đặt)
 *   CLAUDE_API_KEY — cho /describe endpoint
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function cors(body, status, extra) {
  return new Response(body, {
    status: status || 200,
    headers: Object.assign(
      { "Content-Type": "application/json" },
      CORS,
      extra || {},
    ),
  });
}

function json(data, status) {
  return cors(JSON.stringify(data), status || 200);
}

function err(msg, status) {
  return json({ error: msg }, status || 400);
}

/* ── GitHub API helper ── */
async function ghFetch(env, path, method, body) {
  const token = env.GITHUB_TOKEN;
  const owner = env.GITHUB_OWNER;
  const repo = env.GITHUB_REPO;
  const branch = env.GITHUB_BRANCH || "main";

  if (!token || !owner || !repo) {
    throw new Error(
      "Worker chưa cấu hình GITHUB_TOKEN / GITHUB_OWNER / GITHUB_REPO",
    );
  }

  const url = "https://api.github.com/repos/" + owner + "/" + repo + path;
  const opts = {
    method: method || "GET",
    headers: {
      Authorization: "token " + token,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "MyPictures-Worker/1.0",
      "Content-Type": "application/json",
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "GitHub API HTTP " + res.status);
  return { data, branch };
}

/* ══════════════════════════════════════════════════════════════
 *  Handler
 * ══════════════════════════════════════════════════════════════ */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const method = request.method.toUpperCase();

    /* CORS preflight */
    if (method === "OPTIONS")
      return new Response(null, { status: 204, headers: CORS });

    /* ── GET /folders ─────────────────────────────────────── */
    if (method === "GET" && path === "/folders") {
      try {
        const branch = env.GITHUB_BRANCH || "main";

        /* Try docs/media first, then docs, then root */
        const tryPaths = ["docs/media", "docs", ""];
        var folders = [];

        for (var pi = 0; pi < tryPaths.length; pi++) {
          var tryPath = tryPaths[pi];
          var apiPath =
            "/contents" + (tryPath ? "/" + tryPath : "") + "?ref=" + branch;
          try {
            var { data } = await ghFetch(env, apiPath);
            if (Array.isArray(data)) {
              data.forEach(function (item) {
                if (item.type === "dir") {
                  folders.push(tryPath ? tryPath + "/" + item.name : item.name);
                }
              });
              if (tryPath) folders.unshift(tryPath); /* add base dir itself */
              break;
            }
          } catch (_) {
            /* try next */
          }
        }

        return json({ folders: folders });
      } catch (e) {
        return err(e.message, 500);
      }
    }

    /* ── POST /folders ────────────────────────────────────── */
    if (method === "POST" && path === "/folders") {
      try {
        var body = await request.json();
        var name = (body.name || "").trim().replace(/^\/+|\/+$/g, "");
        if (!name) return err("Thiếu tên folder");

        var branch = env.GITHUB_BRANCH || "main";
        var filePath = "/contents/" + name + "/.gitkeep";

        /* Check if already exists */
        var sha = null;
        try {
          var { data: existing } = await ghFetch(
            env,
            filePath + "?ref=" + branch,
          );
          if (existing && existing.sha) sha = existing.sha;
        } catch (_) {}

        var putBody = {
          message: "Create folder " + name + " [MyPictures]",
          content: "",
          branch: branch,
        };
        if (sha) putBody.sha = sha;

        await ghFetch(env, filePath, "PUT", putBody);
        return json({ ok: true, folder: name });
      } catch (e) {
        return err(e.message, 500);
      }
    }

    /* ── POST /upload ─────────────────────────────────────── */
    if (method === "POST" && path === "/upload") {
      try {
        var form = await request.formData();
        var file = form.get("file");
        var folder = (form.get("folder") || "")
          .trim()
          .replace(/^\/+|\/+$/g, "");
        var branch = env.GITHUB_BRANCH || "main";

        if (!file || typeof file === "string") return err("Thiếu file");
        if (!folder) return err("Thiếu folder");

        /* Convert file to base64 */
        var arrayBuf = await file.arrayBuffer();
        var bytes = new Uint8Array(arrayBuf);
        var binary = "";
        for (var i = 0; i < bytes.length; i++)
          binary += String.fromCharCode(bytes[i]);
        var b64 = btoa(binary);

        var fileName = file.name;
        var filePath = "/contents/" + folder + "/" + fileName;

        /* Check if file already exists (need SHA for update) */
        var sha = null;
        try {
          var { data: existFile } = await ghFetch(
            env,
            filePath + "?ref=" + branch,
          );
          if (existFile && existFile.sha) sha = existFile.sha;
        } catch (_) {}

        var putBody = {
          message: (sha ? "Update " : "Upload ") + fileName + " via MyPictures",
          content: b64,
          branch: branch,
        };
        if (sha) putBody.sha = sha;

        var { data: result } = await ghFetch(env, filePath, "PUT", putBody);

        return json({
          ok: true,
          filename: fileName,
          url: result.content ? result.content.html_url : "",
          raw_url: result.content ? result.content.download_url : "",
          sha: result.content ? result.content.sha : "",
        });
      } catch (e) {
        return err(e.message, 500);
      }
    }

    /* ── POST /describe ───────────────────────────────────── */
    if (method === "POST" && path === "/describe") {
      try {
        var body = await request.json();
        var imageDataUrl = body.image_data_url || "";
        var filename = body.filename || "";

        if (!imageDataUrl) return err("Thiếu image_data_url");

        var base64Image = imageDataUrl.split(",")[1] || imageDataUrl;
        var mediaType =
          (imageDataUrl.match(/data:([^;]+);/) || [])[1] || "image/jpeg";

        var claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": env.CLAUDE_API_KEY || "",
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 256,
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "image",
                    source: {
                      type: "base64",
                      media_type: mediaType,
                      data: base64Image,
                    },
                  },
                  {
                    type: "text",
                    text:
                      "Mô tả ngắn gọn bức ảnh này bằng tiếng Việt (1-2 câu)." +
                      (filename ? " Tên file: " + filename : ""),
                  },
                ],
              },
            ],
          }),
        });

        var claudeData = await claudeRes.json();
        var description =
          claudeData.content &&
          claudeData.content[0] &&
          claudeData.content[0].text
            ? claudeData.content[0].text.trim()
            : "Không có mô tả.";

        return json({ description });
      } catch (e) {
        return err(e.message, 500);
      }
    }

    /* ── GET /health ─────────────────────────────────────── */
    if (path === "/health") {
      return json({
        ok: true,
        owner: env.GITHUB_OWNER || "(chưa đặt)",
        repo: env.GITHUB_REPO || "(chưa đặt)",
        branch: env.GITHUB_BRANCH || "main",
        token: env.GITHUB_TOKEN ? "✅ đã đặt" : "❌ chưa đặt",
      });
    }

    return new Response("Not found", { status: 404, headers: CORS });
  },
};
