const albumsEl = document.getElementById("albums");
const filterEl = document.getElementById("filter");
const searchEl = document.getElementById("search");

const lightbox = document.getElementById("lightbox");
const lbClose = document.getElementById("lbClose");
const lbCaption = document.getElementById("lbCaption");
const lbDesc = document.getElementById("lbDesc");

const originalCanvas = document.getElementById("originalCanvas");
const originalCtx = originalCanvas.getContext("2d");
const lbCanvas = document.getElementById("lbCanvas");
const ctx = lbCanvas.getContext("2d", { alpha: false });

const btnZoomIn = document.getElementById("btnZoomIn");
const btnZoomOut = document.getElementById("btnZoomOut");
const btnReset = document.getElementById("btnReset");
const btnRotate = document.getElementById("btnRotate");
const btnFlipX = document.getElementById("btnFlipX");
const btnFlipY = document.getElementById("btnFlipY");
const btnGray = document.getElementById("btnGray");
const btnBrightUp = document.getElementById("btnBrightUp");
const btnBrightDown = document.getElementById("btnBrightDown");
const btnContrastUp = document.getElementById("btnContrastUp");
const btnContrastDown = document.getElementById("btnContrastDown");
const btnDenoise = document.getElementById("btnDenoise");
const btnSharpen = document.getElementById("btnSharpen");
const btnAuto = document.getElementById("btnAuto");
const btnCrop = document.getElementById("btnCrop");
const btnApplyCrop = document.getElementById("btnApplyCrop");
const btnClearCrop = document.getElementById("btnClearCrop");
const lbHint = document.getElementById("lbHint");

const btnDownloadOriginal = document.getElementById("btnDownloadOriginal");
const btnDownloadEdited = document.getElementById("btnDownloadEdited");

/** =========================
 *  AI caption config
 *  ========================= */
const DESCRIBE_ENDPOINT =
    "https://mypictures-describe.khonghao0109.workers.dev"; // 👈 thay URL worker tại đây
let describeAbort = null;
const descCache = new Map();

/** =========================
 *  LIGHTBOX / IMAGE EDITOR
 *  ========================= */

// State
let imgEl = new Image();
imgEl.crossOrigin = "anonymous";

let currentSrc = "";
let state = {
    zoom: 1,
    rot: 0, // 0, 90, 180, 270
    flipX: 1, // 1 or -1
    flipY: 1, // 1 or -1
    gray: false,
    contrast: 1,
    brightness: 1,
    sharpen: false,
    denoise: false,
    cropMode: false,
    cropRect: null, // {x,y,w,h} in IMAGE-SPACE (original image coords)
};

// Crop dragging
let drag = {
    active: false,
    start: null, // {x,y} in CANVAS coords
    end: null, // {x,y} in CANVAS coords
};

function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

function getFileExtFromUrl(url) {
    try {
        const u = new URL(url, location.href);
        const path = u.pathname || "";
        const m = path.match(/\.(jpg|jpeg|png|webp|gif)$/i);
        return m ? m[1].toLowerCase() : "jpg";
    } catch {
        const m = (url || "").match(/\.(jpg|jpeg|png|webp|gif)$/i);
        return m ? m[1].toLowerCase() : "jpg";
    }
}

let dlTimer = null;

function scheduleDownloadLinksUpdate() {
    clearTimeout(dlTimer);
    dlTimer = setTimeout(() => {
        updateDownloadLinks().catch(() => {});
    }, 120);
}

function setLightboxOpen(open) {
    if (open) {
        lightbox.classList.add("open");
        lightbox.setAttribute("aria-hidden", "false");
    } else {
        lightbox.classList.remove("open");
        lightbox.setAttribute("aria-hidden", "true");
    }
}

function resetEdits() {
    state.zoom = 1;
    state.rot = 0;
    state.flipX = 1;
    state.flipY = 1;
    state.gray = false;
    state.cropMode = false;
    state.cropRect = null;
    state.denoise = false;
    state.brightness = 1;
    state.sharpen = false;
    btnDenoise.classList.remove("active");
    drag.active = false;
    drag.start = null;
    drag.end = null;

    updateCropButtons();
    draw();
}

function updateCropButtons() {
    btnApplyCrop.disabled = !state.cropRect;
    btnClearCrop.disabled = !state.cropRect;
    lbHint.hidden = !state.cropMode;
    btnCrop.classList.toggle("active", state.cropMode);
}

function fitCanvasToCSSSize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = lbCanvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (lbCanvas.width !== w || lbCanvas.height !== h) {
        lbCanvas.width = w;
        lbCanvas.height = h;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
}

function getDrawParams() {
    const iw = imgEl.naturalWidth;
    const ih = imgEl.naturalHeight;
    const rot = ((state.rot % 360) + 360) % 360;

    const rotatedW = rot === 90 || rot === 270 ? ih : iw;
    const rotatedH = rot === 90 || rot === 270 ? iw : ih;

    const cw = lbCanvas.width;
    const ch = lbCanvas.height;

    const scaleToFit = Math.min(cw / rotatedW, ch / rotatedH) * state.zoom;

    return { iw, ih, rot, rotatedW, rotatedH, scaleToFit, cw, ch };
}

function draw() {
    if (!imgEl || !imgEl.naturalWidth) return;

    fitCanvasToCSSSize();
    const { iw, ih, rot, scaleToFit, cw, ch } = getDrawParams();

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, cw, ch);

    ctx.save();
    ctx.translate(cw / 2, ch / 2);

    ctx.filter = `
  ${state.gray ? "grayscale(1)" : ""}
  brightness(${state.brightness})
  contrast(${state.contrast})
`;
    ctx.scale(state.flipX, state.flipY);
    ctx.rotate((rot * Math.PI) / 180);

    const drawW = iw * scaleToFit;
    const drawH = ih * scaleToFit;

    ctx.drawImage(imgEl, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();
    if (state.denoise) {
        applyDenoise();
        applyDenoise();
    }
    if (state.sharpen) applySharpen();
    if (state.cropMode || state.cropRect) drawCropOverlay();

    scheduleDownloadLinksUpdate();
}

function canvasToImageSpace(canvasX, canvasY) {
    const { iw, ih, rot, scaleToFit, cw, ch } = getDrawParams();

    let x = canvasX - cw / 2;
    let y = canvasY - ch / 2;

    const ang = (-rot * Math.PI) / 180;
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    let rx = x * cos - y * sin;
    let ry = x * sin + y * cos;

    rx /= state.flipX;
    ry /= state.flipY;

    rx /= scaleToFit;
    ry /= scaleToFit;

    const ix = rx + iw / 2;
    const iy = ry + ih / 2;

    return { ix: clamp(ix, 0, iw), iy: clamp(iy, 0, ih) };
}

function imageToCanvasSpace(ix, iy) {
    const { iw, ih, rot, scaleToFit, cw, ch } = getDrawParams();

    let x = ix - iw / 2;
    let y = iy - ih / 2;

    x *= scaleToFit;
    y *= scaleToFit;

    x *= state.flipX;
    y *= state.flipY;

    const ang = (rot * Math.PI) / 180;
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    const rx = x * cos - y * sin;
    const ry = x * sin + y * cos;

    return { cx: rx + cw / 2, cy: ry + ch / 2 };
}

function drawCropOverlay() {
    const cw = lbCanvas.width;
    const ch = lbCanvas.height;

    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, 0, cw, ch);

    let crop = state.cropRect;

    if (state.cropMode && drag.start && drag.end) {
        const p1 = canvasToImageSpace(drag.start.x, drag.start.y);
        const p2 = canvasToImageSpace(drag.end.x, drag.end.y);
        const x = Math.min(p1.ix, p2.ix);
        const y = Math.min(p1.iy, p2.iy);
        const w = Math.abs(p1.ix - p2.ix);
        const h = Math.abs(p1.iy - p2.iy);
        crop = w > 2 && h > 2 ? { x, y, w, h } : null;
        state.cropRect = crop;
        updateCropButtons();
    }

    if (!crop) {
        ctx.restore();
        return;
    }

    const corners = [
        imageToCanvasSpace(crop.x, crop.y),
        imageToCanvasSpace(crop.x + crop.w, crop.y),
        imageToCanvasSpace(crop.x + crop.w, crop.y + crop.h),
        imageToCanvasSpace(crop.x, crop.y + crop.h),
    ];

    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.moveTo(corners[0].cx, corners[0].cy);
    for (let i = 1; i < corners.length; i++)
        ctx.lineTo(corners[i].cx, corners[i].cy);
    ctx.closePath();
    ctx.fill();

    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(corners[0].cx, corners[0].cy);
    for (let i = 1; i < corners.length; i++)
        ctx.lineTo(corners[i].cx, corners[i].cy);
    ctx.closePath();
    ctx.stroke();

    ctx.restore();
}

function exportEditedBlob() {
    return new Promise((resolve) => {
        const iw = imgEl.naturalWidth;
        const ih = imgEl.naturalHeight;
        const crop = state.cropRect;

        const srcCanvas = document.createElement("canvas");
        const sctx = srcCanvas.getContext("2d");

        let baseW = iw;
        let baseH = ih;

        if (crop) {
            baseW = Math.max(1, Math.round(crop.w));
            baseH = Math.max(1, Math.round(crop.h));
            srcCanvas.width = baseW;
            srcCanvas.height = baseH;
            sctx.drawImage(imgEl, crop.x, crop.y, crop.w, crop.h, 0, 0, baseW, baseH);
        } else {
            srcCanvas.width = baseW;
            srcCanvas.height = baseH;
            sctx.drawImage(imgEl, 0, 0);
        }

        const rot = ((state.rot % 360) + 360) % 360;
        const outCanvas = document.createElement("canvas");
        const octx = outCanvas.getContext("2d", { alpha: false });

        const outW = rot === 90 || rot === 270 ? baseH : baseW;
        const outH = rot === 90 || rot === 270 ? baseW : baseH;

        outCanvas.width = outW;
        outCanvas.height = outH;

        octx.fillStyle = "#000";
        octx.fillRect(0, 0, outW, outH);
        octx.save();
        octx.translate(outW / 2, outH / 2);
        octx.filter = state.gray ? "grayscale(1)" : "none";
        octx.scale(state.flipX, state.flipY);
        octx.rotate((rot * Math.PI) / 180);
        octx.drawImage(srcCanvas, -baseW / 2, -baseH / 2, baseW, baseH);
        octx.restore();

        outCanvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.92);
    });
}

let lastEditedUrl = null;
async function updateDownloadLinks() {
    if (!currentSrc) return;

    const ext = getFileExtFromUrl(currentSrc);
    const baseName = (lbCaption.textContent || "image").replace(
        /[\\/:*?"<>|]+/g,
        "_",
    );

    btnDownloadOriginal.href = currentSrc;
    btnDownloadOriginal.download = `${baseName}.${ext}`;

    if (!imgEl || !imgEl.naturalWidth) return;

    if (lastEditedUrl) URL.revokeObjectURL(lastEditedUrl);

    const blob = await exportEditedBlob();
    lastEditedUrl = URL.createObjectURL(blob);
    btnDownloadEdited.href = lastEditedUrl;
    btnDownloadEdited.download = `${baseName}_edited.jpg`;
}

/** =========================
 *  AUTO DESCRIBE (AI)
 *  ========================= */

function getCurrentImageDataURL(maxW = 1024) {
    const iw = imgEl.naturalWidth;
    const ih = imgEl.naturalHeight;

    let w = iw;
    let h = ih;
    if (Math.max(w, h) > maxW) {
        const s = maxW / Math.max(w, h);
        w = Math.round(w * s);
        h = Math.round(h * s);
    }

    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const cctx = c.getContext("2d");
    cctx.drawImage(imgEl, 0, 0, w, h);
    return c.toDataURL("image/jpeg", 0.85);
}

async function autoDescribeCurrentImage() {
    if (!imgEl || !imgEl.naturalWidth) return;

    if (!DESCRIBE_ENDPOINT ||
        DESCRIBE_ENDPOINT.includes("YOUR_BACKEND_DESCRIBE_ENDPOINT")
    ) {
        lbDesc.textContent =
            "⚠️ Chưa cấu hình Cloudflare Worker URL (DESCRIBE_ENDPOINT).";
        return;
    }

    if (descCache.has(currentSrc)) {
        lbDesc.textContent = descCache.get(currentSrc);
        return;
    }

    if (describeAbort) describeAbort.abort();
    describeAbort = new AbortController();

    try {
        const dataUrl = getCurrentImageDataURL(1024);

        const res = await fetch(DESCRIBE_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: describeAbort.signal,
            body: JSON.stringify({
                image_data_url: dataUrl,
                filename: lbCaption.textContent || "",
            }),
        });

        if (!res.ok) throw new Error(await res.text());
        const json = await res.json();

        const desc = (json.description || "Không có mô tả.").trim();
        descCache.set(currentSrc, desc);
        lbDesc.textContent = desc;
    } catch (e) {
        if (e && e.name === "AbortError") return;
        const msg = e && e.message ? e.message : String(e);
        lbDesc.textContent = "❌ Lỗi mô tả ảnh: " + msg;
    }
}

function openLightbox(src, caption) {
    currentSrc = src;
    lbCaption.textContent = caption || "";
    lbDesc.textContent = "⏳ Đang tạo mô tả...";
    lbDesc.classList.add("multiline");

    setLightboxOpen(true);
    resetEdits();

    imgEl = new Image();
    imgEl.crossOrigin = "anonymous";
    img.onload = () => {
        // 🖼️ VẼ ẢNH GỐC (THÊM ĐOẠN NÀY)
        originalCanvas.width = img.width;
        originalCanvas.height = img.height;

        originalCtx.clearRect(0, 0, originalCanvas.width, originalCanvas.height);
        originalCtx.drawImage(img, 0, 0);

        // 👉 code cũ của bạn (GIỮ NGUYÊN)
        lbCanvas.width = img.width;
        lbCanvas.height = img.height;

        draw();
    };
    imgEl.src = src;

    btnDownloadOriginal.href = src;
    btnDownloadOriginal.download = (caption || "image") + ".jpg";
}

function closeLightbox() {
    setLightboxOpen(false);
    currentSrc = "";

    if (describeAbort) {
        describeAbort.abort();
        describeAbort = null;
    }

    if (lastEditedUrl) {
        URL.revokeObjectURL(lastEditedUrl);
        lastEditedUrl = null;
    }

    state.cropRect = null;
    state.cropMode = false;
}

lbClose.addEventListener("click", closeLightbox);
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeLightbox();
});
lightbox.addEventListener("click", (e) => {
    if (e.target === lightbox) closeLightbox();
});
btnDenoise.addEventListener("click", () => {
    state.denoise = !state.denoise;
    btnDenoise.classList.toggle("active", state.denoise);
    draw();
});
window.addEventListener("resize", () => draw());

btnZoomIn.addEventListener("click", () => {
    state.zoom = clamp(state.zoom * 1.15, 0.2, 6);
    draw();
});
btnZoomOut.addEventListener("click", () => {
    state.zoom = clamp(state.zoom / 1.15, 0.2, 6);
    draw();
});
btnReset.addEventListener("click", () => resetEdits());
btnRotate.addEventListener("click", () => {
    state.rot = (state.rot + 90) % 360;
    draw();
});
btnFlipX.addEventListener("click", () => {
    state.flipX *= -1;
    draw();
});
btnFlipY.addEventListener("click", () => {
    state.flipY *= -1;
    draw();
});
btnGray.addEventListener("click", () => {
    state.gray = !state.gray;
    draw();
});

btnBrightUp.onclick = () => {
    state.brightness += 0.3;
    draw();
};

btnBrightDown.onclick = () => {
    state.brightness -= 0.3;
    draw();
};
btnContrastUp.onclick = () => {
    state.contrast += 0.3;
    draw();
};

btnContrastDown.onclick = () => {
    state.contrast -= 0.3;
    draw();
};
btnSharpen.onclick = () => {
    state.sharpen = !state.sharpen;
    btnSharpen.classList.toggle("active", state.sharpen);
    draw();
};
btnAuto.onclick = () => {
    state.gray = false;
    state.brightness = 1.4;
    state.contrast = 1.4;
    state.denoise = true;
    state.sharpen = true;
    draw();
};
btnCrop.addEventListener("click", () => {
    state.cropMode = !state.cropMode;
    drag.active = false;
    drag.start = null;
    drag.end = null;
    updateCropButtons();
    draw();
});

btnApplyCrop.addEventListener("click", () => {
    state.cropMode = false;
    drag.active = false;
    drag.start = null;
    drag.end = null;
    updateCropButtons();
    draw();
});

btnClearCrop.addEventListener("click", () => {
    state.cropRect = null;
    drag.active = false;
    drag.start = null;
    drag.end = null;
    updateCropButtons();
    draw();
});

function getCanvasPoint(evt) {
    const rect = lbCanvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    return {
        x: (evt.clientX - rect.left) * dpr,
        y: (evt.clientY - rect.top) * dpr,
    };
}

function applyDenoise() {
    const imageData = ctx.getImageData(0, 0, lbCanvas.width, lbCanvas.height);
    const data = imageData.data;

    const w = lbCanvas.width;
    const h = lbCanvas.height;

    const kernel = [1, 2, 1, 2, 4, 2, 1, 2, 1];
    const kernelSum = 16;

    const copy = new Uint8ClampedArray(data);

    const getIndex = (x, y) => (y * w + x) * 4;

    for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
            let r = 0,
                g = 0,
                b = 0;
            let k = 0;

            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const i = getIndex(x + dx, y + dy);
                    const weight = kernel[k++];

                    r += copy[i] * weight;
                    g += copy[i + 1] * weight;
                    b += copy[i + 2] * weight;
                }
            }

            const i = getIndex(x, y);
            data[i] = r / kernelSum;
            data[i + 1] = g / kernelSum;
            data[i + 2] = b / kernelSum;
        }
    }

    ctx.putImageData(imageData, 0, 0);
}

function applyKernel(kernel, divisor = 1) {
    const imageData = ctx.getImageData(0, 0, lbCanvas.width, lbCanvas.height);
    const data = imageData.data;
    const copy = new Uint8ClampedArray(data);

    const w = lbCanvas.width;
    const h = lbCanvas.height;

    const getIndex = (x, y) => (y * w + x) * 4;

    for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
            let r = 0,
                g = 0,
                b = 0;
            let k = 0;

            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const i = getIndex(x + dx, y + dy);
                    const wgt = kernel[k++];
                    r += copy[i] * wgt;
                    g += copy[i + 1] * wgt;
                    b += copy[i + 2] * wgt;
                }
            }

            const i = getIndex(x, y);
            data[i] = r / divisor;
            data[i + 1] = g / divisor;
            data[i + 2] = b / divisor;
        }
    }

    ctx.putImageData(imageData, 0, 0);
}

function applySharpen() {
    const kernel = [0, -1, 0, -1, 7, -1, 0, -1, 0];

    applyKernel(kernel, 1);
}
lbCanvas.addEventListener("mousedown", (e) => {
    if (!state.cropMode) return;
    drag.active = true;
    drag.start = getCanvasPoint(e);
    drag.end = drag.start;
    draw();
});

lbCanvas.addEventListener("mousemove", (e) => {
    if (!state.cropMode || !drag.active) return;
    drag.end = getCanvasPoint(e);
    draw();
});

window.addEventListener("mouseup", () => {
    if (!state.cropMode) return;
    if (!drag.active) return;
    drag.active = false;
    draw();
});

/** =========================
 *  VIDEO (loop / replay)
 *  ========================= */
const USE_BLOB_WORKAROUND = true;

async function attachVideoBlob(videoEl, url) {
    const res = await fetch(url, { cache: "force-cache" });
    if (!res.ok) throw new Error(`Fetch video failed: ${res.status} ${url}`);
    const blob = await res.blob();
    const mp4 = new Blob([blob], { type: "video/mp4" });
    videoEl.src = URL.createObjectURL(mp4);
}

/** =========================
 *  Render albums
 *  ========================= */

function renderAlbum(album) {
    const article = document.createElement("article");
    article.className = "album";
    article.dataset.category = album.folder;
    article.dataset.keywords =
        `${album.folder} ${album.title} ${album.description || ""}`.toLowerCase();

    const head = document.createElement("div");
    head.className = "album-head";
    head.innerHTML = `<h2>${album.title}</h2><p>${album.description || ""}</p>`;
    article.appendChild(head);

    // Images
    const grid = document.createElement("div");
    grid.className = "grid";

    (album.images || []).forEach((src, idx) => {
        const card = document.createElement("div");
        card.className = "card";

        const img = document.createElement("img");
        img.loading = "lazy";
        img.src = src;
        img.alt = `${album.folder} ${idx + 1}`;
        img.addEventListener("click", () => openLightbox(src, img.alt));

        card.appendChild(img);
        grid.appendChild(card);
    });

    if ((album.images || []).length) article.appendChild(grid);

    // Videos
    if ((album.videos || []).length) {
        const videoWrap = document.createElement("div");
        videoWrap.className = "video";
        videoWrap.innerHTML = `<div class="video-title">🎥 Video</div>`;

        album.videos.forEach((src) => {
            const ratio = document.createElement("div");
            ratio.className = "ratio";

            const v = document.createElement("video");
            v.controls = true;
            v.preload = "metadata";
            v.playsInline = true;
            v.loop = true;
            v.muted = false;

            v.addEventListener("ended", () => {
                v.currentTime = 0;
                v.play().catch(() => {});
            });

            if (USE_BLOB_WORKAROUND) {
                attachVideoBlob(v, src).catch(() => {
                    const s = document.createElement("source");
                    s.src = src;
                    s.type = "video/mp4";
                    v.appendChild(s);
                });
            } else {
                const s = document.createElement("source");
                s.src = src;
                s.type = "video/mp4";
                v.appendChild(s);
            }

            ratio.appendChild(v);
            videoWrap.appendChild(ratio);

            const link = document.createElement("div");
            link.style.marginTop = "8px";
            link.innerHTML = `<a href="${src}" target="_blank" rel="noopener noreferrer">Mở video ở tab mới / tải về</a>`;
            videoWrap.appendChild(link);

            const spacer = document.createElement("div");
            spacer.style.height = "14px";
            videoWrap.appendChild(spacer);
        });

        article.appendChild(videoWrap);
    }

    return article;
}

function applyFilters() {
    const f = filterEl.value;
    const q = (searchEl.value || "").trim().toLowerCase();

    document.querySelectorAll(".album").forEach((a) => {
        const cat = a.dataset.category;
        const kw = a.dataset.keywords || "";
        const text = a.innerText.toLowerCase();

        const matchCat = f === "all" || cat === f;
        const matchQ = !q || text.includes(q) || kw.includes(q);

        a.style.display = matchCat && matchQ ? "" : "none";
    });
}

async function init() {
    const res = await fetch("./manifest.json", { cache: "no-store" });
    const data = await res.json();

    albumsEl.innerHTML = "";
    data.albums.forEach((album) => albumsEl.appendChild(renderAlbum(album)));

    filterEl.addEventListener("change", applyFilters);
    searchEl.addEventListener("input", applyFilters);
    applyFilters();
}

init();