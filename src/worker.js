/**
 * MyPictures — Cloudflare Worker  (src/worker.js)
 *
 * Routes:
 *   GET  /health     → kiểm tra kết nối & secrets
 *   GET  /folders    → liệt kê folder trong repo
 *   POST /folders    → tạo folder mới (push .gitkeep)
 *   POST /upload     → upload file lên GitHub
 *   POST /describe   → AI mô tả ảnh (dùng Claude)
 *   OPTIONS *        → CORS preflight
 *
 * Secrets (wrangler secret put <NAME>):
 *   GITHUB_TOKEN   — Fine-grained PAT: Contents Read+Write
 *   GITHUB_OWNER   — vd: khonghao0109
 *   GITHUB_REPO    — vd: PhaoHoaDaNang
 *   GITHUB_BRANCH  — vd: main
 *   CLAUDE_API_KEY — cho /describe
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const json = (data, status) =>
  new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "Content-Type": "application/json", ...CORS },
  });

const err = (msg, status) => json({ error: msg }, status || 400);

/* ── Safe base64 encoder (no spread, handles large buffers) ── */
function arrayBufferToBase64(buffer) {
  var bytes = new Uint8Array(buffer);
  var binary = "";
  var CHUNK = 8192;
  for (var i = 0; i < bytes.length; i += CHUNK) {
    var slice = bytes.subarray(i, i + CHUNK);
    for (var j = 0; j < slice.length; j++) {
      binary += String.fromCharCode(slice[j]);
    }
  }
  return btoa(binary);
}

/* ── GitHub Contents API helper ── */
async function ghFetch(env, path, method, body) {
  var token = env.GITHUB_TOKEN;
  var owner = env.GITHUB_OWNER;
  var repo = env.GITHUB_REPO;
  var branch = env.GITHUB_BRANCH || "main";

  if (!token || !owner || !repo) {
    throw new Error(
      "Worker chưa cấu hình GITHUB_TOKEN / GITHUB_OWNER / GITHUB_REPO",
    );
  }

  var url = "https://api.github.com/repos/" + owner + "/" + repo + path;
  var opts = {
    method: method || "GET",
    headers: {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "MyPictures-Worker/2.0",
      "Content-Type": "application/json",
    },
  };
  if (body) opts.body = JSON.stringify(body);

  var res = await fetch(url, opts);
  var data = await res.json().catch(function () {
    return {};
  });
  if (!res.ok) throw new Error(data.message || "GitHub API HTTP " + res.status);
  return { data: data, branch: branch };
}

/* ── Get existing file SHA (null if not found) ── */
async function getFileSha(env, filePath) {
  var branch = env.GITHUB_BRANCH || "main";
  try {
    var result = await ghFetch(env, filePath + "?ref=" + branch);
    return result.data && result.data.sha ? result.data.sha : null;
  } catch (_) {
    return null;
  }
}

/* ══════════════════════════════════════════════════════════════
 *  Main Handler
 * ══════════════════════════════════════════════════════════════ */
export default {
  async fetch(request, env) {
    var url = new URL(request.url);
    var path = url.pathname.replace(/\/$/, "") || "/";
    var method = request.method.toUpperCase();

    /* CORS preflight */
    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    /* ── GET /health ──────────────────────────────────────── */
    if (path === "/health") {
      return json({
        ok: true,
        owner: env.GITHUB_OWNER || "(chưa đặt)",
        repo: env.GITHUB_REPO || "(chưa đặt)",
        branch: env.GITHUB_BRANCH || "main",
        token: env.GITHUB_TOKEN ? "da dat" : "chua dat",
      });
    }

    /* ── GET /folders ─────────────────────────────────────── */
    if (method === "GET" && path === "/folders") {
      try {
        var branch = env.GITHUB_BRANCH || "main";
        var folders = [];

        /* Try docs/media → docs → root */
        var tryPaths = ["docs/media", "docs", ""];
        for (var pi = 0; pi < tryPaths.length; pi++) {
          var tryPath = tryPaths[pi];
          var apiPath =
            "/contents" + (tryPath ? "/" + tryPath : "") + "?ref=" + branch;
          try {
            var fetched = await ghFetch(env, apiPath);
            var items = fetched.data;
            if (Array.isArray(items)) {
              /* add base path itself first */
              if (tryPath) folders.push(tryPath);
              for (var k = 0; k < items.length; k++) {
                if (items[k].type === "dir") {
                  folders.push(
                    tryPath ? tryPath + "/" + items[k].name : items[k].name,
                  );
                }
              }
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
        if (!name) return err("Thieu ten folder");

        var branch = env.GITHUB_BRANCH || "main";
        var filePath = "/contents/" + name + "/.gitkeep";
        var sha = await getFileSha(env, filePath);

        var putBody = {
          message: "Create folder " + name + " [MyPictures]",
          content: btoa(" "),
          /* space char — GitHub rejects empty content */
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

        if (!file || typeof file === "string") return err("Thieu file");
        if (!folder) return err("Thieu folder");

        /* Safe base64 conversion */
        var arrayBuf = await file.arrayBuffer();
        var b64 = arrayBufferToBase64(arrayBuf);

        var fileName = file.name;
        var filePath = "/contents/" + folder + "/" + fileName;
        var sha = await getFileSha(env, filePath);

        var putBody = {
          message: (sha ? "Update " : "Upload ") + fileName + " [MyPictures]",
          content: b64,
          branch: branch,
        };
        if (sha) putBody.sha = sha;

        var result = await ghFetch(env, filePath, "PUT", putBody);

        return json({
          ok: true,
          filename: fileName,
          url: result.data.content ? result.data.content.html_url : "",
          raw_url: result.data.content ? result.data.content.download_url : "",
          sha: result.data.content ? result.data.content.sha : "",
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

        if (!imageDataUrl) return err("Thieu image_data_url");

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
                      "Mo ta ngan gon buc anh nay bang tieng Viet (1-2 cau)." +
                      (filename ? " Ten file: " + filename : ""),
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
            : "Khong co mo ta.";

        return json({ description: description });
      } catch (e) {
        return err(e.message, 500);
      }
    }

    return new Response("Not found", { status: 404, headers: CORS });
  },
};
