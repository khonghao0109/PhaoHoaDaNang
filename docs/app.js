/* ==========================================================
 *  MyPictures  —  app.js  (v2.0)
 *  Fixes: renderAlbum v bug, export filter, toolbar separation
 *  New : upload images/videos, video editor panel, trim timeline
 * ========================================================== */

"use strict";

/* ── DOM refs ── */
const albumsEl = document.getElementById("albums");
const filterEl = document.getElementById("filter");
const searchEl = document.getElementById("search");
const dropZone = document.getElementById("dropZone");
const uploadInput = document.getElementById("uploadInput");
const uploadsSection = document.getElementById("uploadsSection");

const lightbox = document.getElementById("lightbox");
const lbClose = document.getElementById("lbClose");
const lbCaption = document.getElementById("lbCaption");
const lbDesc = document.getElementById("lbDesc");

const toolbarImage = document.getElementById("toolbarImage");
const toolbarVideo = document.getElementById("toolbarVideo");
const trimProgress = document.getElementById("trimProgress");
const trimProgressBar = document.getElementById("trimProgressBar");
const trimProgressLabel = document.getElementById("trimProgressLabel");

/* Image editor canvases */
const compareWrapper = document.getElementById("compareWrapper");
const originalCanvas = document.getElementById("originalCanvas");
const originalCtx = originalCanvas.getContext("2d");
const lbCanvas = document.getElementById("lbCanvas");
const ctx = lbCanvas.getContext("2d", { alpha: false });

/* Image toolbar buttons */
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

/* Video toolbar */
const speedControl = document.getElementById("speedControl");
const startBadge = document.getElementById("startBadge");
const endBadge = document.getElementById("endBadge");
const btnDownloadVideo = document.getElementById("btnDownloadVideo");
const btnTrim = document.getElementById("btnTrim");

/* Trim timeline */
const trimTimeline = document.getElementById("trimTimeline");
const trimTrack = document.getElementById("trimTrack");
const trimRange = document.getElementById("trimRange");
const trimHandleStart = document.getElementById("trimStart");
const trimHandleEnd = document.getElementById("trimEnd");
const trimPlayhead = document.getElementById("trimPlayhead");
const trimStartLabel = document.getElementById("trimStartLabel");
const trimEndLabel = document.getElementById("trimEndLabel");
const trimDurLabel = document.getElementById("trimDurLabel");

/* Video element */
const videoEl = document.getElementById("lbVideo");

/* ══════════════════════════════════════════════════════════
 *  STATE
 * ══════════════════════════════════════════════════════════ */

let currentSrc = "";
let currentIsVideo = false;

/* Image editor state */
const imgEl = new Image();
imgEl.crossOrigin = "anonymous";

let state = {
  zoom: 1,
  rot: 0,
  flipX: 1,
  flipY: 1,
  gray: false,
  contrast: 1,
  brightness: 1,
  sharpen: false,
  denoise: false,
  cropMode: false,
  cropRect: null, // {x,y,w,h} in image-space
};

let drag = {
  active: false,
  start: null,
  end: null,
};

/* Video editor state */
let videoState = {
  start: 0,
  end: 0,
  duration: 0,
  speed: 1,
  trimDragging: null, // "start" | "end" | null
};

/* Local uploads store */
let localUploads = {
  images: [], // { url, name, isLocal: true }
  videos: [], // { url, name, isLocal: true }
};

/* AI describe */
const DESCRIBE_ENDPOINT =
  "https://mypictures-describe.khonghao0109.workers.dev";
let describeAbort = null;
const descCache = new Map();

let lastEditedUrl = null;
let dlTimer = null;

/* ══════════════════════════════════════════════════════════
 *  HELPERS
 * ══════════════════════════════════════════════════════════ */

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function fmtTime(sec) {
  if (!isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function fmtSec(sec) {
  if (!isFinite(sec)) return "0.00s";
  return sec.toFixed(2) + "s";
}

function getFileExtFromUrl(url) {
  try {
    const u = new URL(url, location.href);
    const m = u.pathname.match(/\.(jpg|jpeg|png|webp|gif|mp4|webm|ogg)$/i);
    return m ? m[1].toLowerCase() : "jpg";
  } catch {
    const m = (url || "").match(/\.(jpg|jpeg|png|webp|gif|mp4|webm|ogg)$/i);
    return m ? m[1].toLowerCase() : "jpg";
  }
}

function isVideoUrl(url) {
  return /\.(mp4|webm|ogg)$/i.test(url);
}

/* ══════════════════════════════════════════════════════════
 *  LIGHTBOX OPEN / CLOSE
 * ══════════════════════════════════════════════════════════ */

function openLightbox(src, title) {
  currentSrc = src;
  currentIsVideo = isVideoUrl(src);
  lbCaption.textContent = title || "";
  lbDesc.textContent = "";

  if (currentIsVideo) {
    /* ── VIDEO MODE ── */
    toolbarImage.style.display = "none";
    toolbarVideo.style.display = "flex";
    compareWrapper.style.display = "none";
    videoEl.style.display = "block";
    lbHint.hidden = true;
    trimTimeline.hidden = false;
    trimProgress.hidden = true;

    // Reset speed select
    speedControl.value = "1";
    videoState.speed = 1;

    videoEl.src = src;
    videoEl.playbackRate = 1;
    videoEl.load();

    videoEl.onloadedmetadata = () => {
      videoState.duration = videoEl.duration;
      videoState.start = 0;
      videoState.end = videoEl.duration;
      updateTrimBadges();
      updateTrimTimeline();
    };

    // Download link
    btnDownloadVideo.href = src;
    btnDownloadVideo.download = title || "video";
  } else {
    /* ── IMAGE MODE ── */
    toolbarImage.style.display = "flex";
    toolbarVideo.style.display = "none";
    compareWrapper.style.display = "flex";
    videoEl.style.display = "none";
    trimTimeline.hidden = true;
    trimProgress.hidden = true;

    imgEl.onload = () => {
      // Draw original
      originalCanvas.width = imgEl.naturalWidth;
      originalCanvas.height = imgEl.naturalHeight;
      originalCtx.drawImage(imgEl, 0, 0);

      resetEdits();
      draw();
    };
    imgEl.src = src;

    // AI describe
    autoDescribeCurrentImage();
  }

  lightbox.classList.add("open");
  lightbox.setAttribute("aria-hidden", "false");
}

function closeLightbox() {
  lightbox.classList.remove("open");
  lightbox.setAttribute("aria-hidden", "true");
  currentSrc = "";

  if (describeAbort) {
    describeAbort.abort();
    describeAbort = null;
  }
  if (lastEditedUrl) {
    URL.revokeObjectURL(lastEditedUrl);
    lastEditedUrl = null;
  }

  videoEl.pause();
  videoEl.src = "";
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

/* ══════════════════════════════════════════════════════════
 *  IMAGE EDITOR — DRAW
 * ══════════════════════════════════════════════════════════ */

function resetEdits() {
  state.zoom = 1;
  state.rot = 0;
  state.flipX = 1;
  state.flipY = 1;
  state.gray = false;
  state.cropMode = false;
  state.cropRect = null;
  state.contrast = 1;
  state.brightness = 1;
  state.denoise = false;
  state.sharpen = false;
  drag.active = false;
  drag.start = null;
  drag.end = null;

  // Reset button active states
  [btnGray, btnDenoise, btnSharpen, btnCrop].forEach((b) =>
    b.classList.remove("active"),
  );
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
  ctx.filter = [
    state.gray ? "grayscale(1)" : "",
    `brightness(${state.brightness})`,
    `contrast(${state.contrast})`,
  ]
    .filter(Boolean)
    .join(" ");
  ctx.scale(state.flipX, state.flipY);
  ctx.rotate((rot * Math.PI) / 180);
  const dw = iw * scaleToFit;
  const dh = ih * scaleToFit;
  ctx.drawImage(imgEl, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();

  if (state.denoise) {
    applyDenoise();
    applyDenoise();
  }
  if (state.sharpen) applySharpen();
  if (state.cropMode || state.cropRect) drawCropOverlay();

  scheduleDownloadLinksUpdate();
}

window.addEventListener("resize", () => {
  if (!currentIsVideo) draw();
});

/* ══════════════════════════════════════════════════════════
 *  IMAGE EDITOR — PIXEL FILTERS
 * ══════════════════════════════════════════════════════════ */

function applyConvolution(kernel, divisor) {
  const id = ctx.getImageData(0, 0, lbCanvas.width, lbCanvas.height);
  const data = id.data;
  const copy = new Uint8ClampedArray(data);
  const w = lbCanvas.width,
    h = lbCanvas.height;
  const gi = (x, y) => (y * w + x) * 4;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let r = 0,
        g = 0,
        b = 0,
        k = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const i = gi(x + dx, y + dy),
            wgt = kernel[k++];
          r += copy[i] * wgt;
          g += copy[i + 1] * wgt;
          b += copy[i + 2] * wgt;
        }
      const i = gi(x, y);
      data[i] = clamp(r / divisor, 0, 255);
      data[i + 1] = clamp(g / divisor, 0, 255);
      data[i + 2] = clamp(b / divisor, 0, 255);
    }
  }
  ctx.putImageData(id, 0, 0);
}

function applyDenoise() {
  applyConvolution([1, 2, 1, 2, 4, 2, 1, 2, 1], 16);
}

function applySharpen() {
  applyConvolution([0, -1, 0, -1, 7, -1, 0, -1, 0], 3);
}

/* ══════════════════════════════════════════════════════════
 *  IMAGE EDITOR — CROP
 * ══════════════════════════════════════════════════════════ */

function canvasToImageSpace(cx, cy) {
  const { iw, ih, rot, scaleToFit, cw, ch } = getDrawParams();
  let x = cx - cw / 2,
    y = cy - ch / 2;
  const ang = (-rot * Math.PI) / 180;
  const cos = Math.cos(ang),
    sin = Math.sin(ang);
  let rx = x * cos - y * sin;
  let ry = x * sin + y * cos;
  rx /= state.flipX;
  ry /= state.flipY;
  rx /= scaleToFit;
  ry /= scaleToFit;
  return { ix: clamp(rx + iw / 2, 0, iw), iy: clamp(ry + ih / 2, 0, ih) };
}

function imageToCanvasSpace(ix, iy) {
  const { iw, ih, rot, scaleToFit, cw, ch } = getDrawParams();
  let x = (ix - iw / 2) * scaleToFit * state.flipX;
  let y = (iy - ih / 2) * scaleToFit * state.flipY;
  const ang = (rot * Math.PI) / 180;
  const cos = Math.cos(ang),
    sin = Math.sin(ang);
  return { cx: x * cos - y * sin + cw / 2, cy: x * sin + y * cos + ch / 2 };
}

function drawCropOverlay() {
  const cw = lbCanvas.width,
    ch = lbCanvas.height;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(0, 0, cw, ch);

  let crop = state.cropRect;
  if (state.cropMode && drag.start && drag.end) {
    const p1 = canvasToImageSpace(drag.start.x, drag.start.y);
    const p2 = canvasToImageSpace(drag.end.x, drag.end.y);
    const x = Math.min(p1.ix, p2.ix),
      y = Math.min(p1.iy, p2.iy);
    const w = Math.abs(p1.ix - p2.ix),
      h = Math.abs(p1.iy - p2.iy);
    if (w > 2 && h > 2) {
      crop = { x, y, w, h };
      state.cropRect = crop;
      updateCropButtons();
    }
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

function getCanvasPoint(evt) {
  const rect = lbCanvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  return {
    x: (evt.clientX - rect.left) * dpr,
    y: (evt.clientY - rect.top) * dpr,
  };
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
  if (!state.cropMode || !drag.active) return;
  drag.active = false;
  draw();
});

/* ══════════════════════════════════════════════════════════
 *  IMAGE EDITOR — EXPORT (with full filter support)
 * ══════════════════════════════════════════════════════════ */

function exportEditedBlob() {
  return new Promise((resolve) => {
    const iw = imgEl.naturalWidth,
      ih = imgEl.naturalHeight;
    const crop = state.cropRect;

    // Step 1: apply crop to source
    const srcCanvas = document.createElement("canvas");
    const sctx = srcCanvas.getContext("2d");
    const baseW = crop ? Math.max(1, Math.round(crop.w)) : iw;
    const baseH = crop ? Math.max(1, Math.round(crop.h)) : ih;
    srcCanvas.width = baseW;
    srcCanvas.height = baseH;
    if (crop)
      sctx.drawImage(imgEl, crop.x, crop.y, crop.w, crop.h, 0, 0, baseW, baseH);
    else sctx.drawImage(imgEl, 0, 0);

    // Step 2: apply rotation / flip / brightness / contrast / grayscale
    const rot = ((state.rot % 360) + 360) % 360;
    const outW = rot === 90 || rot === 270 ? baseH : baseW;
    const outH = rot === 90 || rot === 270 ? baseW : baseH;

    const outCanvas = document.createElement("canvas");
    const octx = outCanvas.getContext("2d");
    outCanvas.width = outW;
    outCanvas.height = outH;

    octx.fillStyle = "#000";
    octx.fillRect(0, 0, outW, outH);

    octx.save();
    octx.translate(outW / 2, outH / 2);
    octx.filter = [
      state.gray ? "grayscale(1)" : "",
      `brightness(${state.brightness})`,
      `contrast(${state.contrast})`,
    ]
      .filter(Boolean)
      .join(" ");
    octx.scale(state.flipX, state.flipY);
    octx.rotate((rot * Math.PI) / 180);
    octx.drawImage(srcCanvas, -baseW / 2, -baseH / 2, baseW, baseH);
    octx.restore();

    // Step 3: pixel-level sharpen / denoise on export canvas
    if (state.denoise || state.sharpen) {
      const exportCtx = outCanvas.getContext("2d");
      const applyKernelExport = (kernel, divisor) => {
        const id = exportCtx.getImageData(0, 0, outW, outH);
        const data = id.data;
        const copy = new Uint8ClampedArray(data);
        const gi = (x, y) => (y * outW + x) * 4;
        for (let y = 1; y < outH - 1; y++)
          for (let x = 1; x < outW - 1; x++) {
            let r = 0,
              g = 0,
              b = 0,
              k = 0;
            for (let dy = -1; dy <= 1; dy++)
              for (let dx = -1; dx <= 1; dx++) {
                const i = gi(x + dx, y + dy),
                  wgt = kernel[k++];
                r += copy[i] * wgt;
                g += copy[i + 1] * wgt;
                b += copy[i + 2] * wgt;
              }
            const i = gi(x, y);
            data[i] = clamp(r / divisor, 0, 255);
            data[i + 1] = clamp(g / divisor, 0, 255);
            data[i + 2] = clamp(b / divisor, 0, 255);
          }
        exportCtx.putImageData(id, 0, 0);
      };
      if (state.denoise) {
        applyKernelExport([1, 2, 1, 2, 4, 2, 1, 2, 1], 16);
        applyKernelExport([1, 2, 1, 2, 4, 2, 1, 2, 1], 16);
      }
      if (state.sharpen) applyKernelExport([0, -1, 0, -1, 7, -1, 0, -1, 0], 3);
    }

    outCanvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.92);
  });
}

function scheduleDownloadLinksUpdate() {
  clearTimeout(dlTimer);
  dlTimer = setTimeout(() => updateDownloadLinks().catch(() => {}), 180);
}

async function updateDownloadLinks() {
  if (!currentSrc || currentIsVideo) return;
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

/* ══════════════════════════════════════════════════════════
 *  IMAGE EDITOR — TOOLBAR BUTTONS
 * ══════════════════════════════════════════════════════════ */

btnZoomIn.addEventListener("click", () => {
  state.zoom = clamp(state.zoom * 1.15, 0.2, 8);
  draw();
});
btnZoomOut.addEventListener("click", () => {
  state.zoom = clamp(state.zoom / 1.15, 0.2, 8);
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
  btnGray.classList.toggle("active", state.gray);
  draw();
});

btnBrightUp.addEventListener("click", () => {
  state.brightness = clamp(state.brightness + 0.1, 0, 4);
  draw();
});
btnBrightDown.addEventListener("click", () => {
  state.brightness = clamp(state.brightness - 0.1, 0, 4);
  draw();
});
btnContrastUp.addEventListener("click", () => {
  state.contrast = clamp(state.contrast + 0.1, 0, 4);
  draw();
});
btnContrastDown.addEventListener("click", () => {
  state.contrast = clamp(state.contrast - 0.1, 0, 4);
  draw();
});

btnSharpen.addEventListener("click", () => {
  state.sharpen = !state.sharpen;
  btnSharpen.classList.toggle("active", state.sharpen);
  draw();
});
btnDenoise.addEventListener("click", () => {
  state.denoise = !state.denoise;
  btnDenoise.classList.toggle("active", state.denoise);
  draw();
});

btnAuto.addEventListener("click", () => {
  state.gray = false;
  state.brightness = 1.2;
  state.contrast = 1.25;
  state.denoise = true;
  state.sharpen = true;
  btnGray.classList.remove("active");
  btnDenoise.classList.add("active");
  btnSharpen.classList.add("active");
  draw();
});

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

/* ══════════════════════════════════════════════════════════
 *  VIDEO EDITOR — SPEED, TRIM, TIMELINE
 * ══════════════════════════════════════════════════════════ */

function changeSpeed(val) {
  videoState.speed = parseFloat(val);
  videoEl.playbackRate = videoState.speed;
}

function setStart() {
  videoState.start = videoEl.currentTime;
  // Clamp: start must be < end
  if (videoState.start >= videoState.end) {
    videoState.end = Math.min(videoState.start + 1, videoState.duration);
  }
  updateTrimBadges();
  updateTrimTimeline();
}

function setEnd() {
  videoState.end = videoEl.currentTime;
  // Clamp: end must be > start
  if (videoState.end <= videoState.start) {
    videoState.start = Math.max(videoState.end - 1, 0);
  }
  updateTrimBadges();
  updateTrimTimeline();
}

function updateTrimBadges() {
  startBadge.textContent = fmtSec(videoState.start);
  endBadge.textContent = fmtSec(videoState.end);
}

function updateTrimTimeline() {
  const dur = videoState.duration;
  if (!dur) return;

  const startPct = (videoState.start / dur) * 100;
  const endPct = (videoState.end / dur) * 100;

  trimHandleStart.style.left = startPct + "%";
  trimHandleEnd.style.left = endPct + "%";
  trimRange.style.left = startPct + "%";
  trimRange.style.width = endPct - startPct + "%";

  trimStartLabel.textContent = fmtTime(videoState.start);
  trimEndLabel.textContent = fmtTime(videoState.end);
  trimDurLabel.textContent =
    "Thời lượng cắt: " + fmtTime(videoState.end - videoState.start);
}

/* Sync playhead on timeupdate */
videoEl.addEventListener("timeupdate", () => {
  const dur = videoState.duration;
  if (!dur) return;
  const pct = (videoEl.currentTime / dur) * 100;
  trimPlayhead.style.left = pct + "%";
  trimStartLabel.textContent = fmtTime(videoState.start);
  trimEndLabel.textContent = fmtTime(videoState.end);
});

/* Click on timeline scrubs video */
trimTrack.addEventListener("click", (e) => {
  if (videoState.trimDragging) return;
  const rect = trimTrack.getBoundingClientRect();
  const pct = clamp((e.clientX - rect.left) / rect.width, 0, 1);
  videoEl.currentTime = pct * videoState.duration;
});

/* Drag trim handles */
function startTrimDrag(e, which) {
  e.preventDefault();
  e.stopPropagation();
  videoState.trimDragging = which;

  const onMove = (mv) => {
    const rect = trimTrack.getBoundingClientRect();
    const pct = clamp((mv.clientX - rect.left) / rect.width, 0, 1);
    const t = pct * videoState.duration;
    if (which === "start") {
      videoState.start = clamp(t, 0, videoState.end - 0.1);
    } else {
      videoState.end = clamp(t, videoState.start + 0.1, videoState.duration);
    }
    updateTrimBadges();
    updateTrimTimeline();
    videoEl.currentTime = which === "start" ? videoState.start : videoState.end;
  };
  const onUp = () => {
    videoState.trimDragging = null;
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
  };
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
}

trimHandleStart.addEventListener("mousedown", (e) => startTrimDrag(e, "start"));
trimHandleEnd.addEventListener("mousedown", (e) => startTrimDrag(e, "end"));

/* Touch support for timeline */
function startTrimDragTouch(e, which) {
  e.preventDefault();
  e.stopPropagation();
  videoState.trimDragging = which;
  const onMove = (mv) => {
    const t = mv.touches[0];
    const rect = trimTrack.getBoundingClientRect();
    const pct = clamp((t.clientX - rect.left) / rect.width, 0, 1);
    const time = pct * videoState.duration;
    if (which === "start")
      videoState.start = clamp(time, 0, videoState.end - 0.1);
    else
      videoState.end = clamp(time, videoState.start + 0.1, videoState.duration);
    updateTrimBadges();
    updateTrimTimeline();
  };
  const onUp = () => {
    videoState.trimDragging = null;
    window.removeEventListener("touchmove", onMove);
    window.removeEventListener("touchend", onUp);
  };
  window.addEventListener("touchmove", onMove, { passive: false });
  window.addEventListener("touchend", onUp);
}
trimHandleStart.addEventListener(
  "touchstart",
  (e) => startTrimDragTouch(e, "start"),
  { passive: false },
);
trimHandleEnd.addEventListener(
  "touchstart",
  (e) => startTrimDragTouch(e, "end"),
  { passive: false },
);

/* Trim video and download */
async function trimVideo() {
  const dur = videoState.end - videoState.start;
  if (dur <= 0) {
    alert("Vui lòng đặt điểm Start và End hợp lệ!");
    return;
  }

  btnTrim.disabled = true;
  btnTrim.textContent = "⏳ Đang xử lý…";
  trimProgress.hidden = false;
  trimProgressBar.style.width = "0%";
  trimProgressLabel.textContent = "Đang cắt video…";

  try {
    const stream = videoEl.captureStream
      ? videoEl.captureStream()
      : videoEl.mozCaptureStream();
    const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
    const chunks = [];

    recorder.ondataavailable = (e) => chunks.push(e.data);

    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `trimmed_${videoState.start.toFixed(1)}s-${videoState.end.toFixed(1)}s.webm`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);

      btnTrim.disabled = false;
      btnTrim.textContent = "🎬 Xuất đoạn cắt";
      trimProgress.hidden = true;
    };

    videoEl.currentTime = videoState.start;
    videoEl.playbackRate = videoState.speed;

    // Wait for seek
    await new Promise((r) => {
      videoEl.onseeked = r;
    });

    recorder.start(100);
    videoEl.play();

    const realDuration = dur / videoState.speed;

    // Animate progress bar
    let elapsed = 0;
    const tick = 150; // ms
    const interval = setInterval(() => {
      elapsed += tick;
      const pct = Math.min((elapsed / (realDuration * 1000)) * 100, 95);
      trimProgressBar.style.width = pct + "%";
      const remaining = Math.max(0, realDuration - elapsed / 1000);
      trimProgressLabel.textContent = `Đang cắt… (còn ~${remaining.toFixed(1)}s)`;
    }, tick);

    setTimeout(() => {
      videoEl.pause();
      recorder.stop();
      clearInterval(interval);
      trimProgressBar.style.width = "100%";
      trimProgressLabel.textContent = "✅ Hoàn tất! Đang tải xuống…";
    }, realDuration * 1000);
  } catch (err) {
    console.error("Trim error:", err);
    alert("Lỗi cắt video: " + (err.message || err));
    btnTrim.disabled = false;
    btnTrim.textContent = "🎬 Xuất đoạn cắt";
    trimProgress.hidden = true;
  }
}

/* Expose globals called from inline HTML */
window.setStart = setStart;
window.setEnd = setEnd;
window.changeSpeed = changeSpeed;
window.trimVideo = trimVideo;

/* ══════════════════════════════════════════════════════════
 *  AI AUTO DESCRIBE
 * ══════════════════════════════════════════════════════════ */

function getCurrentImageDataURL(maxW = 1024) {
  const iw = imgEl.naturalWidth,
    ih = imgEl.naturalHeight;
  let w = iw,
    h = ih;
  if (Math.max(w, h) > maxW) {
    const s = maxW / Math.max(w, h);
    w = Math.round(w * s);
    h = Math.round(h * s);
  }
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d").drawImage(imgEl, 0, 0, w, h);
  return c.toDataURL("image/jpeg", 0.85);
}

async function autoDescribeCurrentImage() {
  if (!imgEl || !imgEl.naturalWidth) return;
  if (!DESCRIBE_ENDPOINT || DESCRIBE_ENDPOINT.includes("YOUR_BACKEND")) {
    lbDesc.textContent = "⚠️ Chưa cấu hình DESCRIBE_ENDPOINT.";
    return;
  }
  if (descCache.has(currentSrc)) {
    lbDesc.textContent = descCache.get(currentSrc);
    return;
  }
  if (describeAbort) describeAbort.abort();
  describeAbort = new AbortController();
  try {
    lbDesc.textContent = "⏳ Đang mô tả ảnh…";
    const res = await fetch(DESCRIBE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: describeAbort.signal,
      body: JSON.stringify({
        image_data_url: getCurrentImageDataURL(),
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
    lbDesc.textContent = "";
  }
}

/* ══════════════════════════════════════════════════════════
 *  UPLOAD FEATURE
 * ══════════════════════════════════════════════════════════ */

const btnOpenUpload = document.getElementById("btnOpenUpload");
const btnBrowse = document.getElementById("btnBrowse");

btnOpenUpload.addEventListener("click", () => {
  dropZone.hidden = !dropZone.hidden;
});

btnBrowse.addEventListener("click", () => uploadInput.click());
uploadInput.addEventListener("change", () => handleFiles(uploadInput.files));

/* Drag-and-drop */
dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("drag-over");
});
dropZone.addEventListener("dragleave", () =>
  dropZone.classList.remove("drag-over"),
);
dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");
  handleFiles(e.dataTransfer.files);
});

/* Also support dropping on the whole page */
document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("drop", (e) => {
  if (e.target === dropZone || dropZone.contains(e.target)) return;
  e.preventDefault();
  handleFiles(e.dataTransfer.files);
});

function handleFiles(fileList) {
  if (!fileList || !fileList.length) return;
  let added = 0;
  for (const file of fileList) {
    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      localUploads.images.push({ url, name: file.name, isLocal: true });
      added++;
    } else if (file.type.startsWith("video/")) {
      const url = URL.createObjectURL(file);
      localUploads.videos.push({ url, name: file.name, isLocal: true });
      added++;
    }
  }
  if (added) {
    renderLocalUploads();
    dropZone.hidden = true;
    // Scroll to uploads
    uploadsSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function removeUploadImage(idx) {
  URL.revokeObjectURL(localUploads.images[idx].url);
  localUploads.images.splice(idx, 1);
  renderLocalUploads();
}

function removeUploadVideo(idx) {
  URL.revokeObjectURL(localUploads.videos[idx].url);
  localUploads.videos.splice(idx, 1);
  renderLocalUploads();
}

function clearAllUploads() {
  localUploads.images.forEach((i) => URL.revokeObjectURL(i.url));
  localUploads.videos.forEach((v) => URL.revokeObjectURL(v.url));
  localUploads.images = [];
  localUploads.videos = [];
  renderLocalUploads();
}

/* Expose remove functions for inline onclick */
window.removeUploadImage = removeUploadImage;
window.removeUploadVideo = removeUploadVideo;
window.clearAllUploads = clearAllUploads;

function renderLocalUploads() {
  const total = localUploads.images.length + localUploads.videos.length;

  if (!total) {
    uploadsSection.hidden = true;
    uploadsSection.innerHTML = "";
    // Remove uploads option from filter
    const opt = filterEl.querySelector('option[value="__uploads__"]');
    if (opt) opt.style.display = "none";
    return;
  }

  uploadsSection.hidden = false;

  // Show filter option
  const opt = filterEl.querySelector('option[value="__uploads__"]');
  if (opt) opt.style.display = "";

  const article = document.createElement("article");
  article.className = "album";
  article.dataset.category = "__uploads__";
  article.dataset.keywords = "upload local";

  article.innerHTML = `
        <div class="album-head">
            <h2>📁 Ảnh & Video của tôi <span class="album-badge">${total} file</span></h2>
            <p style="color:var(--muted);font-size:0.88rem">File được lưu tạm trong trình duyệt, không upload lên server.</p>
        </div>
    `;

  // Actions
  const actions = document.createElement("div");
  actions.className = "album-actions";
  actions.innerHTML = `
        <button class="album-action-btn" onclick="document.getElementById('uploadInput').click()">➕ Thêm file</button>
        <button class="album-action-btn danger" onclick="clearAllUploads()">🗑 Xóa tất cả</button>
    `;
  article.appendChild(actions);

  // Images grid
  if (localUploads.images.length) {
    const grid = document.createElement("div");
    grid.className = "grid";
    localUploads.images.forEach((item, idx) => {
      const card = document.createElement("div");
      card.className = "card";
      const img = document.createElement("img");
      img.src = item.url;
      img.alt = item.name;
      img.loading = "lazy";
      img.addEventListener("click", () => openLightbox(item.url, item.name));
      const rmBtn = document.createElement("button");
      rmBtn.className = "card-remove";
      rmBtn.title = "Xóa ảnh này";
      rmBtn.textContent = "✕";
      rmBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        removeUploadImage(idx);
      });
      card.appendChild(img);
      card.appendChild(rmBtn);
      grid.appendChild(card);
    });
    article.appendChild(grid);
  }

  // Videos list
  if (localUploads.videos.length) {
    const videoWrap = document.createElement("div");
    videoWrap.className = "video";
    videoWrap.innerHTML = `<div class="video-title">🎥 Video (${localUploads.videos.length})</div>`;

    localUploads.videos.forEach((item, idx) => {
      const row = document.createElement("div");
      row.style.cssText =
        "display:flex;align-items:center;gap:10px;width:min(960px,100%);margin-bottom:10px;";

      const ratio = document.createElement("div");
      ratio.className = "ratio";
      ratio.style.flex = "1";
      const v = document.createElement("video");
      v.controls = true;
      v.preload = "metadata";
      v.playsInline = true;
      v.src = item.url;
      v.addEventListener("click", () => openLightbox(item.url, item.name));
      ratio.appendChild(v);

      const rmBtn = document.createElement("button");
      rmBtn.className = "album-action-btn danger";
      rmBtn.style.flexShrink = "0";
      rmBtn.textContent = "✕ Xóa";
      rmBtn.addEventListener("click", () => removeUploadVideo(idx));

      row.appendChild(ratio);
      row.appendChild(rmBtn);
      videoWrap.appendChild(row);

      const nameLabel = document.createElement("div");
      nameLabel.style.cssText =
        "font-size:0.82rem;color:var(--muted);width:min(960px,100%);margin-bottom:8px;";
      nameLabel.textContent = item.name;
      videoWrap.appendChild(nameLabel);
    });

    article.appendChild(videoWrap);
  }

  uploadsSection.innerHTML = "";
  uploadsSection.appendChild(article);

  // keep uploads visible in filter
  applyFilters();
}

/* ══════════════════════════════════════════════════════════
 *  RENDER ALBUMS (from manifest.json)
 * ══════════════════════════════════════════════════════════ */

const USE_BLOB_WORKAROUND = true;

async function attachVideoBlob(el, url) {
  const res = await fetch(url, { cache: "force-cache" });
  if (!res.ok) throw new Error(`Fetch ${res.status} ${url}`);
  const blob = await res.blob();
  el.src = URL.createObjectURL(new Blob([blob], { type: "video/mp4" }));
}

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
  if ((album.images || []).length) {
    const grid = document.createElement("div");
    grid.className = "grid";
    album.images.forEach((src, idx) => {
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
    article.appendChild(grid);
  }

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

      // FIX: click handler is now after v is defined
      v.addEventListener("click", () =>
        openLightbox(src, "Video — " + src.split("/").pop()),
      );

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
      link.innerHTML = `<a href="${src}" target="_blank" rel="noopener noreferrer">↗ Mở / tải video</a>`;
      videoWrap.appendChild(link);
    });

    article.appendChild(videoWrap);
  }

  return article;
}

/* ══════════════════════════════════════════════════════════
 *  FILTER / SEARCH
 * ══════════════════════════════════════════════════════════ */

function applyFilters() {
  const f = filterEl.value;
  const q = (searchEl.value || "").trim().toLowerCase();

  const allAlbums = [
    ...document.querySelectorAll("#albums .album"),
    ...document.querySelectorAll("#uploadsSection .album"),
  ];

  allAlbums.forEach((a) => {
    const cat = a.dataset.category;
    const kw = a.dataset.keywords || "";
    const txt = a.innerText.toLowerCase();
    const matchCat = f === "all" || cat === f;
    const matchQ = !q || txt.includes(q) || kw.includes(q);
    a.style.display = matchCat && matchQ ? "" : "none";
  });

  if (uploadsSection.querySelector(".album")) {
    const uAlbum = uploadsSection.querySelector(".album");
    if (uAlbum) {
      const matchCat = f === "all" || f === "__uploads__";
      const matchQ = !q || uAlbum.innerText.toLowerCase().includes(q);
      uploadsSection.hidden =
        !(matchCat && matchQ) ||
        localUploads.images.length + localUploads.videos.length === 0;
    }
  }
}

filterEl.addEventListener("change", applyFilters);
searchEl.addEventListener("input", applyFilters);

/* ══════════════════════════════════════════════════════════
 *  INIT
 * ══════════════════════════════════════════════════════════ */

async function init() {
  try {
    const res = await fetch("./manifest.json", { cache: "no-store" });
    const data = await res.json();
    albumsEl.innerHTML = "";
    data.albums.forEach((album) => albumsEl.appendChild(renderAlbum(album)));
  } catch (e) {
    albumsEl.innerHTML = `<div class="empty-state">⚠️ Không tải được manifest.json: ${e.message}</div>`;
  }
  applyFilters();
}

init();
