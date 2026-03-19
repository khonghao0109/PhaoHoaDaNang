/* =================================================================
 *  MyPictures  —  app.js  v3.0
 *  Fixes:
 *    - "Đang cắt video" showing in image mode  → use CSS [hidden]
 *    - trim progress not resetting on image open
 *  New:
 *    - Video: brightness/contrast/saturation/grayscale filter
 *    - Video: volume slider + mute
 *    - Video: crop overlay with canvas
 *    - Video: export with all edits applied (canvas + audio)
 *    - Video: resolution select (source/1080p/720p/480p/360p)
 *    - Upload: tab UI (local / server)
 *    - Server upload: config URL+token, folder list + create, progress
 * ================================================================= */
"use strict";

/* ───────────────────────────────────────────────────────────────
 *  DOM refs
 * ─────────────────────────────────────────────────────────────── */
const albumsEl = document.getElementById("albums");
const filterEl = document.getElementById("filter");
const searchEl = document.getElementById("search");
const uploadPanel = document.getElementById("uploadPanel");
const uploadsSection = document.getElementById("uploadsSection");

/* Lightbox */
const lightbox = document.getElementById("lightbox");
const lbClose = document.getElementById("lbClose");
const lbCaption = document.getElementById("lbCaption");
const lbDesc = document.getElementById("lbDesc");

const toolbarImage = document.getElementById("toolbarImage");
const toolbarVRow1 = document.getElementById("toolbarVideoRow1");
const toolbarVRow2 = document.getElementById("toolbarVideoRow2");
const trimProgress = document.getElementById("trimProgress");
const trimProgressBar = document.getElementById("trimProgressBar");
const trimProgressLabel = document.getElementById("trimProgressLabel");

/* Image editor */
const compareWrapper = document.getElementById("compareWrapper");
const originalCanvas = document.getElementById("originalCanvas");
const originalCtx = originalCanvas.getContext("2d");
const lbCanvas = document.getElementById("lbCanvas");
const ctx = lbCanvas.getContext("2d", { alpha: false });

/* Image toolbar */
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

/* Video toolbar row 1 */
const speedControl = document.getElementById("speedControl");
const startBadge = document.getElementById("startBadge");
const endBadge = document.getElementById("endBadge");
const btnDownloadVideo = document.getElementById("btnDownloadVideo");
const btnTrim = document.getElementById("btnTrim");
const exportResolution = document.getElementById("exportResolution");

/* Video toolbar row 2 */
const vBtnBrightUp = document.getElementById("vBtnBrightUp");
const vBtnBrightDown = document.getElementById("vBtnBrightDown");
const vBtnContrastUp = document.getElementById("vBtnContrastUp");
const vBtnContrastDown = document.getElementById("vBtnContrastDown");
const vBtnSatUp = document.getElementById("vBtnSatUp");
const vBtnSatDown = document.getElementById("vBtnSatDown");
const vBtnGray = document.getElementById("vBtnGray");
const vBtnResetColor = document.getElementById("vBtnResetColor");
const vBtnMute = document.getElementById("vBtnMute");
const volumeSlider = document.getElementById("volumeSlider");
const volumeBadge = document.getElementById("volumeBadge");
const vBtnCrop = document.getElementById("vBtnCrop");
const vBtnApplyCrop = document.getElementById("vBtnApplyCrop");
const vBtnClearCrop = document.getElementById("vBtnClearCrop");

/* Video elements */
const videoStageWrap = document.getElementById("videoStageWrap");
const videoEl = document.getElementById("lbVideo");
const videoCropCanvas = document.getElementById("videoCropCanvas");
const videoCropHint = document.getElementById("videoCropHint");
const vcCtx = videoCropCanvas.getContext("2d");

/* Trim timeline */
const trimTimeline = document.getElementById("trimTimeline");
const trimTrack = document.getElementById("trimTrack");
const trimRange = document.getElementById("trimRange");
const trimHandleStart = document.getElementById("trimHandleStart");
const trimHandleEnd = document.getElementById("trimHandleEnd");
const trimPlayhead = document.getElementById("trimPlayhead");
const trimStartLabel = document.getElementById("trimStartLabel");
const trimEndLabel = document.getElementById("trimEndLabel");
const trimDurLabel = document.getElementById("trimDurLabel");

/* Upload panel */
var btnOpenUpload = document.getElementById("btnOpenUpload");
var uploadInput = document.getElementById("uploadInput");
var btnBrowse = document.getElementById("btnBrowse");
var dropZone = document.getElementById("dropZone");

/* ───────────────────────────────────────────────────────────────
 *  STATE
 * ─────────────────────────────────────────────────────────────── */
let currentSrc = "";
let currentIsVideo = false;

/* Image editor */
const imgEl = new Image();
imgEl.crossOrigin = "anonymous";

let iState = {
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
  cropRect: null,
};
let drag = { active: false, start: null, end: null };

/* Video editor */
let vState = {
  /* trim */
  start: 0,
  end: 0,
  duration: 0,
  speed: 1,
  /* color */
  brightness: 1,
  contrast: 1,
  saturation: 1,
  gray: false,
  /* audio */
  muted: false,
  volume: 1,
  /* crop */
  cropMode: false,
  cropRect: null, // {x,y,w,h} percent of video frame
  trimDragging: null,
  /* crop drag */
  cropDrag: { active: false, start: null, end: null },
};

/* Local uploads */
let localUploads = { images: [], videos: [] };

/* AI describe */
const DESCRIBE_ENDPOINT =
  "https://mypictures-describe.khonghao0109.workers.dev";
let describeAbort = null;
const descCache = new Map();

let lastEditedUrl = null;
let dlTimer = null;

/* ───────────────────────────────────────────────────────────────
 *  HELPERS
 * ─────────────────────────────────────────────────────────────── */
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const isVid = (url) => /\.(mp4|webm|ogg)$/i.test(url);

function fmtTime(s) {
  if (!isFinite(s) || s < 0) return "0:00";
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

function fmtSec(s) {
  return isFinite(s) ? s.toFixed(2) + "s" : "0.00s";
}

function showProgress(msg) {
  trimProgress.hidden = false;
  trimProgressBar.style.width = "0%";
  trimProgressLabel.textContent = msg;
}

function hideProgress() {
  trimProgress.hidden = true;
}

/* ───────────────────────────────────────────────────────────────
 *  LIGHTBOX OPEN / CLOSE
 * ─────────────────────────────────────────────────────────────── */
function openLightbox(src, title) {
  /* ── Pause every video currently playing on the page ── */
  document.querySelectorAll("video").forEach(function (v) {
    if (v !== videoEl && !v.paused) {
      v.pause();
    }
  });

  currentSrc = src;
  currentIsVideo = isVid(src);
  lbCaption.textContent = title || "";
  lbDesc.textContent = "";

  /* always reset progress when opening anything */
  hideProgress();

  if (currentIsVideo) {
    /* ── VIDEO MODE ── */
    toolbarImage.hidden = true;
    toolbarVRow1.hidden = false;
    toolbarVRow2.hidden = false;
    compareWrapper.hidden = true;
    lbHint.hidden = true;
    videoStageWrap.hidden = false;
    trimTimeline.hidden = false;

    /* reset video state */
    vState.brightness = 1;
    vState.contrast = 1;
    vState.saturation = 1;
    vState.gray = false;
    vState.muted = false;
    vState.volume = 1;
    vState.cropMode = false;
    vState.cropRect = null;
    vState.cropDrag = { active: false, start: null, end: null };
    vState.speed = 1;
    speedControl.value = "1";
    volumeSlider.value = "1";
    volumeBadge.textContent = "100%";
    vBtnGray.classList.remove("active");
    vBtnMute.classList.remove("active");
    vBtnCrop.classList.remove("active");
    vBtnApplyCrop.disabled = true;
    vBtnClearCrop.disabled = true;
    videoCropCanvas.classList.remove("crop-active");
    videoCropHint.hidden = true;
    applyVideoFilter();

    videoEl.src = src;
    videoEl.playbackRate = 1;
    videoEl.volume = 1;
    videoEl.muted = false;
    videoEl.load();

    videoEl.onloadedmetadata = () => {
      vState.duration = videoEl.duration;
      vState.start = 0;
      vState.end = videoEl.duration;
      updateTrimBadges();
      updateTrimTimeline();
    };

    btnDownloadVideo.href = src;
    btnDownloadVideo.download = title || "video";
  } else {
    /* ── IMAGE MODE ── */
    toolbarImage.hidden = false;
    toolbarVRow1.hidden = true;
    toolbarVRow2.hidden = true;
    compareWrapper.hidden = false;
    videoStageWrap.hidden = true;
    trimTimeline.hidden = true;

    imgEl.onload = () => {
      originalCanvas.width = imgEl.naturalWidth;
      originalCanvas.height = imgEl.naturalHeight;
      originalCtx.drawImage(imgEl, 0, 0);
      resetEdits();
      draw();
    };
    imgEl.src = src;
    autoDescribeCurrentImage();
  }

  lightbox.classList.add("open");
  lightbox.setAttribute("aria-hidden", "false");
}

function closeLightbox() {
  lightbox.classList.remove("open");
  lightbox.setAttribute("aria-hidden", "true");
  currentSrc = "";
  hideProgress();

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
  iState.cropRect = null;
  iState.cropMode = false;
  clearVideoCropCanvas();
}

lbClose.addEventListener("click", closeLightbox);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeLightbox();
});
lightbox.addEventListener("click", (e) => {
  if (e.target === lightbox) closeLightbox();
});

/* ───────────────────────────────────────────────────────────────
 *  IMAGE EDITOR — DRAW ENGINE
 * ─────────────────────────────────────────────────────────────── */
function resetEdits() {
  iState.zoom = 1;
  iState.rot = 0;
  iState.flipX = 1;
  iState.flipY = 1;
  iState.gray = false;
  iState.contrast = 1;
  iState.brightness = 1;
  iState.sharpen = false;
  iState.denoise = false;
  iState.cropMode = false;
  iState.cropRect = null;
  drag.active = false;
  drag.start = null;
  drag.end = null;
  [btnGray, btnDenoise, btnSharpen, btnCrop].forEach((b) =>
    b.classList.remove("active"),
  );
  updateCropUI();
  draw();
}

function updateCropUI() {
  btnApplyCrop.disabled = !iState.cropRect;
  btnClearCrop.disabled = !iState.cropRect;
  lbHint.hidden = !iState.cropMode;
  btnCrop.classList.toggle("active", iState.cropMode);
}

function fitCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const r = lbCanvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width * dpr));
  const h = Math.max(1, Math.round(r.height * dpr));
  if (lbCanvas.width !== w || lbCanvas.height !== h) {
    lbCanvas.width = w;
    lbCanvas.height = h;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
}

function getDP() {
  const iw = imgEl.naturalWidth,
    ih = imgEl.naturalHeight;
  const rot = ((iState.rot % 360) + 360) % 360;
  const rotW = rot === 90 || rot === 270 ? ih : iw;
  const rotH = rot === 90 || rot === 270 ? iw : ih;
  const cw = lbCanvas.width,
    ch = lbCanvas.height;
  const scale = Math.min(cw / rotW, ch / rotH) * iState.zoom;
  return { iw, ih, rot, rotW, rotH, scale, cw, ch };
}

function draw() {
  if (!imgEl.naturalWidth) return;
  fitCanvas();
  const { iw, ih, rot, scale, cw, ch } = getDP();

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, cw, ch);
  ctx.save();
  ctx.translate(cw / 2, ch / 2);
  ctx.filter = [
    iState.gray ? "grayscale(1)" : "",
    `brightness(${iState.brightness})`,
    `contrast(${iState.contrast})`,
  ]
    .filter(Boolean)
    .join(" ");
  ctx.scale(iState.flipX, iState.flipY);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.drawImage(
    imgEl,
    (-iw * scale) / 2,
    (-ih * scale) / 2,
    iw * scale,
    ih * scale,
  );
  ctx.restore();

  if (iState.denoise) {
    applyConv([1, 2, 1, 2, 4, 2, 1, 2, 1], 16);
    applyConv([1, 2, 1, 2, 4, 2, 1, 2, 1], 16);
  }
  if (iState.sharpen) applyConv([0, -1, 0, -1, 7, -1, 0, -1, 0], 3);
  if (iState.cropMode || iState.cropRect) drawCropOverlay();
  schedDlUpdate();
}

window.addEventListener("resize", () => {
  if (!currentIsVideo) draw();
});

/* ───────────────────────────────────────────────────────────────
 *  IMAGE EDITOR — PIXEL FILTERS
 * ─────────────────────────────────────────────────────────────── */
function applyConv(kernel, div) {
  const id = ctx.getImageData(0, 0, lbCanvas.width, lbCanvas.height);
  const d = id.data,
    cp = new Uint8ClampedArray(d);
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
            wt = kernel[k++];
          r += cp[i] * wt;
          g += cp[i + 1] * wt;
          b += cp[i + 2] * wt;
        }
      const i = gi(x, y);
      d[i] = clamp(r / div, 0, 255);
      d[i + 1] = clamp(g / div, 0, 255);
      d[i + 2] = clamp(b / div, 0, 255);
    }
  }
  ctx.putImageData(id, 0, 0);
}

/* ───────────────────────────────────────────────────────────────
 *  IMAGE EDITOR — CROP
 * ─────────────────────────────────────────────────────────────── */
function canvasToImg(cx, cy) {
  const { iw, ih, rot, scale, cw, ch } = getDP();
  let x = cx - cw / 2,
    y = cy - ch / 2;
  const ang = (-rot * Math.PI) / 180,
    cos = Math.cos(ang),
    sin = Math.sin(ang);
  let rx = x * cos - y * sin,
    ry = x * sin + y * cos;
  rx /= iState.flipX;
  ry /= iState.flipY;
  rx /= scale;
  ry /= scale;
  return { ix: clamp(rx + iw / 2, 0, iw), iy: clamp(ry + ih / 2, 0, ih) };
}

function imgToCanvas(ix, iy) {
  const { iw, ih, rot, scale, cw, ch } = getDP();
  let x = (ix - iw / 2) * scale * iState.flipX,
    y = (iy - ih / 2) * scale * iState.flipY;
  const ang = (rot * Math.PI) / 180,
    cos = Math.cos(ang),
    sin = Math.sin(ang);
  return { cx: x * cos - y * sin + cw / 2, cy: x * sin + y * cos + ch / 2 };
}

function drawCropOverlay() {
  const cw = lbCanvas.width,
    ch = lbCanvas.height;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(0, 0, cw, ch);

  let crop = iState.cropRect;
  if (iState.cropMode && drag.start && drag.end) {
    const p1 = canvasToImg(drag.start.x, drag.start.y);
    const p2 = canvasToImg(drag.end.x, drag.end.y);
    const x = Math.min(p1.ix, p2.ix),
      y = Math.min(p1.iy, p2.iy);
    const w = Math.abs(p1.ix - p2.ix),
      h = Math.abs(p1.iy - p2.iy);
    if (w > 2 && h > 2) {
      crop = { x, y, w, h };
      iState.cropRect = crop;
      updateCropUI();
    }
  }
  if (!crop) {
    ctx.restore();
    return;
  }

  const c = [
    imgToCanvas(crop.x, crop.y),
    imgToCanvas(crop.x + crop.w, crop.y),
    imgToCanvas(crop.x + crop.w, crop.y + crop.h),
    imgToCanvas(crop.x, crop.y + crop.h),
  ];
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.moveTo(c[0].cx, c[0].cy);
  for (let i = 1; i < 4; i++) ctx.lineTo(c[i].cx, c[i].cy);
  ctx.closePath();
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(c[0].cx, c[0].cy);
  for (let i = 1; i < 4; i++) ctx.lineTo(c[i].cx, c[i].cy);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function getCP(e) {
  const r = lbCanvas.getBoundingClientRect(),
    dpr = window.devicePixelRatio || 1;
  return { x: (e.clientX - r.left) * dpr, y: (e.clientY - r.top) * dpr };
}
lbCanvas.addEventListener("mousedown", (e) => {
  if (!iState.cropMode) return;
  drag.active = true;
  drag.start = drag.end = getCP(e);
  draw();
});
lbCanvas.addEventListener("mousemove", (e) => {
  if (!iState.cropMode || !drag.active) return;
  drag.end = getCP(e);
  draw();
});
window.addEventListener("mouseup", () => {
  if (drag.active) {
    drag.active = false;
    draw();
  }
});

/* ───────────────────────────────────────────────────────────────
 *  IMAGE EDITOR — EXPORT
 * ─────────────────────────────────────────────────────────────── */
function exportEditedBlob() {
  return new Promise((resolve) => {
    const iw = imgEl.naturalWidth,
      ih = imgEl.naturalHeight;
    const crop = iState.cropRect;
    const sc = document.createElement("canvas");
    const sctx = sc.getContext("2d");
    const bw = crop ? Math.max(1, Math.round(crop.w)) : iw;
    const bh = crop ? Math.max(1, Math.round(crop.h)) : ih;
    sc.width = bw;
    sc.height = bh;
    if (crop)
      sctx.drawImage(imgEl, crop.x, crop.y, crop.w, crop.h, 0, 0, bw, bh);
    else sctx.drawImage(imgEl, 0, 0);

    const rot = ((iState.rot % 360) + 360) % 360;
    const oc = document.createElement("canvas");
    const octx = oc.getContext("2d");
    oc.width = rot === 90 || rot === 270 ? bh : bw;
    oc.height = rot === 90 || rot === 270 ? bw : bh;
    octx.fillStyle = "#000";
    octx.fillRect(0, 0, oc.width, oc.height);
    octx.save();
    octx.translate(oc.width / 2, oc.height / 2);
    octx.filter = [
      iState.gray ? "grayscale(1)" : "",
      `brightness(${iState.brightness})`,
      `contrast(${iState.contrast})`,
    ]
      .filter(Boolean)
      .join(" ");
    octx.scale(iState.flipX, iState.flipY);
    octx.rotate((rot * Math.PI) / 180);
    octx.drawImage(sc, -bw / 2, -bh / 2, bw, bh);
    octx.restore();

    /* pixel-level filters on export canvas */
    if (iState.denoise || iState.sharpen) {
      const applyK = (k, div) => {
        const id = octx.getImageData(0, 0, oc.width, oc.height);
        const d = id.data,
          cp = new Uint8ClampedArray(d);
        const W = oc.width,
          H = oc.height;
        const gi = (x, y) => (y * W + x) * 4;
        for (let y = 1; y < H - 1; y++)
          for (let x = 1; x < W - 1; x++) {
            let r = 0,
              g = 0,
              b = 0,
              i2 = 0;
            for (let dy = -1; dy <= 1; dy++)
              for (let dx = -1; dx <= 1; dx++) {
                const i = gi(x + dx, y + dy),
                  wt = k[i2++];
                r += cp[i] * wt;
                g += cp[i + 1] * wt;
                b += cp[i + 2] * wt;
              }
            const i = gi(x, y);
            d[i] = clamp(r / div, 0, 255);
            d[i + 1] = clamp(g / div, 0, 255);
            d[i + 2] = clamp(b / div, 0, 255);
          }
        octx.putImageData(id, 0, 0);
      };
      if (iState.denoise) {
        applyK([1, 2, 1, 2, 4, 2, 1, 2, 1], 16);
        applyK([1, 2, 1, 2, 4, 2, 1, 2, 1], 16);
      }
      if (iState.sharpen) applyK([0, -1, 0, -1, 7, -1, 0, -1, 0], 3);
    }
    oc.toBlob((blob) => resolve(blob), "image/jpeg", 0.92);
  });
}

function schedDlUpdate() {
  clearTimeout(dlTimer);
  dlTimer = setTimeout(() => updateDlLinks().catch(() => {}), 180);
}
async function updateDlLinks() {
  if (!currentSrc || currentIsVideo) return;
  var _em = currentSrc.match(/\.(jpg|jpeg|png|webp|gif)$/i);
  var ext = _em && _em[1] ? _em[1].toLowerCase() : "jpg";
  const base = (lbCaption.textContent || "image").replace(
    /[\\/:*?"<>|]+/g,
    "_",
  );
  btnDownloadOriginal.href = currentSrc;
  btnDownloadOriginal.download = `${base}.${ext}`;
  if (!imgEl.naturalWidth) return;
  if (lastEditedUrl) URL.revokeObjectURL(lastEditedUrl);
  lastEditedUrl = URL.createObjectURL(await exportEditedBlob());
  btnDownloadEdited.href = lastEditedUrl;
  btnDownloadEdited.download = `${base}_edited.jpg`;
}

/* ───────────────────────────────────────────────────────────────
 *  IMAGE TOOLBAR BUTTONS
 * ─────────────────────────────────────────────────────────────── */
btnZoomIn.onclick = () => {
  iState.zoom = clamp(iState.zoom * 1.15, 0.2, 8);
  draw();
};
btnZoomOut.onclick = () => {
  iState.zoom = clamp(iState.zoom / 1.15, 0.2, 8);
  draw();
};
btnReset.onclick = resetEdits;
btnRotate.onclick = () => {
  iState.rot = (iState.rot + 90) % 360;
  draw();
};
btnFlipX.onclick = () => {
  iState.flipX *= -1;
  draw();
};
btnFlipY.onclick = () => {
  iState.flipY *= -1;
  draw();
};
btnGray.onclick = () => {
  iState.gray = !iState.gray;
  btnGray.classList.toggle("active", iState.gray);
  draw();
};
btnBrightUp.onclick = () => {
  iState.brightness = clamp(iState.brightness + 0.1, 0, 4);
  draw();
};
btnBrightDown.onclick = () => {
  iState.brightness = clamp(iState.brightness - 0.1, 0, 4);
  draw();
};
btnContrastUp.onclick = () => {
  iState.contrast = clamp(iState.contrast + 0.1, 0, 4);
  draw();
};
btnContrastDown.onclick = () => {
  iState.contrast = clamp(iState.contrast - 0.1, 0, 4);
  draw();
};
btnSharpen.onclick = () => {
  iState.sharpen = !iState.sharpen;
  btnSharpen.classList.toggle("active", iState.sharpen);
  draw();
};
btnDenoise.onclick = () => {
  iState.denoise = !iState.denoise;
  btnDenoise.classList.toggle("active", iState.denoise);
  draw();
};
btnAuto.onclick = () => {
  iState.gray = false;
  iState.brightness = 1.2;
  iState.contrast = 1.25;
  iState.denoise = true;
  iState.sharpen = true;
  btnGray.classList.remove("active");
  btnDenoise.classList.add("active");
  btnSharpen.classList.add("active");
  draw();
};
btnCrop.onclick = () => {
  iState.cropMode = !iState.cropMode;
  drag.active = false;
  drag.start = null;
  drag.end = null;
  updateCropUI();
  draw();
};
btnApplyCrop.onclick = () => {
  iState.cropMode = false;
  drag.active = false;
  drag.start = null;
  drag.end = null;
  updateCropUI();
  draw();
};
btnClearCrop.onclick = () => {
  iState.cropRect = null;
  drag.active = false;
  drag.start = null;
  drag.end = null;
  updateCropUI();
  draw();
};

/* AI describe */
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
  if (!imgEl.naturalWidth) return;
  if (!DESCRIBE_ENDPOINT || DESCRIBE_ENDPOINT.includes("YOUR_BACKEND")) return;
  if (descCache.has(currentSrc)) {
    lbDesc.textContent = descCache.get(currentSrc);
    return;
  }
  if (describeAbort) describeAbort.abort();
  describeAbort = new AbortController();
  try {
    lbDesc.textContent = "⏳ Đang mô tả…";
    const res = await fetch(DESCRIBE_ENDPOINT, {
      method: "POST",
      signal: describeAbort.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image_data_url: getCurrentImageDataURL(),
        filename: lbCaption.textContent || "",
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    const j = await res.json();
    const desc = (j.description || "").trim();
    descCache.set(currentSrc, desc);
    lbDesc.textContent = desc;
  } catch (e) {
    if (e && e.name === "AbortError") return;
    lbDesc.textContent = "";
  }
}

/* ───────────────────────────────────────────────────────────────
 *  VIDEO EDITOR — COLOR FILTERS
 * ─────────────────────────────────────────────────────────────── */
function applyVideoFilter() {
  const f = [
    vState.gray ? "grayscale(1)" : "",
    `brightness(${vState.brightness})`,
    `contrast(${vState.contrast})`,
    `saturate(${vState.saturation})`,
  ]
    .filter(Boolean)
    .join(" ");
  videoEl.style.filter = f || "none";
}

vBtnBrightUp.onclick = () => {
  vState.brightness = clamp(vState.brightness + 0.1, 0, 4);
  applyVideoFilter();
};
vBtnBrightDown.onclick = () => {
  vState.brightness = clamp(vState.brightness - 0.1, 0, 4);
  applyVideoFilter();
};
vBtnContrastUp.onclick = () => {
  vState.contrast = clamp(vState.contrast + 0.1, 0, 4);
  applyVideoFilter();
};
vBtnContrastDown.onclick = () => {
  vState.contrast = clamp(vState.contrast - 0.1, 0, 4);
  applyVideoFilter();
};
vBtnSatUp.onclick = () => {
  vState.saturation = clamp(vState.saturation + 0.1, 0, 4);
  applyVideoFilter();
};
vBtnSatDown.onclick = () => {
  vState.saturation = clamp(vState.saturation - 0.1, 0, 4);
  applyVideoFilter();
};
vBtnGray.onclick = () => {
  vState.gray = !vState.gray;
  vBtnGray.classList.toggle("active", vState.gray);
  applyVideoFilter();
};
vBtnResetColor.onclick = () => {
  vState.brightness = 1;
  vState.contrast = 1;
  vState.saturation = 1;
  vState.gray = false;
  vBtnGray.classList.remove("active");
  applyVideoFilter();
};

/* ───────────────────────────────────────────────────────────────
 *  VIDEO EDITOR — AUDIO
 * ─────────────────────────────────────────────────────────────── */
vBtnMute.onclick = () => {
  vState.muted = !vState.muted;
  videoEl.muted = vState.muted;
  vBtnMute.textContent = vState.muted ? "🔇 Unmute" : "🔊 Mute";
  vBtnMute.classList.toggle("active", vState.muted);
};
volumeSlider.addEventListener("input", () => {
  vState.volume = parseFloat(volumeSlider.value);
  videoEl.volume = vState.volume;
  volumeBadge.textContent = Math.round(vState.volume * 100) + "%";
  if (vState.volume === 0) {
    videoEl.muted = true;
    vState.muted = true;
    vBtnMute.textContent = "🔇 Unmute";
    vBtnMute.classList.add("active");
  } else if (vState.muted) {
    videoEl.muted = false;
    vState.muted = false;
    vBtnMute.textContent = "🔊 Mute";
    vBtnMute.classList.remove("active");
  }
});

/* ───────────────────────────────────────────────────────────────
 *  VIDEO EDITOR — CROP OVERLAY
 * ─────────────────────────────────────────────────────────────── */
function getVideoRenderRect() {
  const vw = videoEl.videoWidth || videoEl.clientWidth;
  const vh = videoEl.videoHeight || videoEl.clientHeight;
  const ew = videoEl.clientWidth,
    eh = videoEl.clientHeight;
  if (!vw || !vh) return { x: 0, y: 0, w: ew, h: eh };
  const vr = vw / vh,
    er = ew / eh;
  let rw, rh, rx, ry;
  if (vr > er) {
    rw = ew;
    rh = ew / vr;
    rx = 0;
    ry = (eh - rh) / 2;
  } else {
    rh = eh;
    rw = eh * vr;
    ry = 0;
    rx = (ew - rw) / 2;
  }
  return { x: rx, y: ry, w: rw, h: rh };
}

function drawVideoCropOverlay() {
  const r = videoCropCanvas.getBoundingClientRect();
  videoCropCanvas.width = r.width;
  videoCropCanvas.height = r.height;
  vcCtx.clearRect(0, 0, r.width, r.height);

  const vr = getVideoRenderRect();
  const cd = vState.cropDrag;
  let crop = vState.cropRect;

  if (vState.cropMode && cd.start && cd.end) {
    const x1 = clamp(Math.min(cd.start.x, cd.end.x), vr.x, vr.x + vr.w);
    const y1 = clamp(Math.min(cd.start.y, cd.end.y), vr.y, vr.y + vr.h);
    const x2 = clamp(Math.max(cd.start.x, cd.end.x), vr.x, vr.x + vr.w);
    const y2 = clamp(Math.max(cd.start.y, cd.end.y), vr.y, vr.y + vr.h);
    if (x2 - x1 > 4 && y2 - y1 > 4) {
      const px = (x1 - vr.x) / vr.w,
        py = (y1 - vr.y) / vr.h;
      const pw = (x2 - x1) / vr.w,
        ph = (y2 - y1) / vr.h;
      crop = { x: px, y: py, w: pw, h: ph };
      vState.cropRect = crop;
      updateVideoCropUI();
    }
  }
  if (!crop) return;

  /* dim outside */
  const cx = vr.x + crop.x * vr.w,
    cy = vr.y + crop.y * vr.h;
  const cw = crop.w * vr.w,
    ch = crop.h * vr.h;
  vcCtx.fillStyle = "rgba(0,0,0,0.5)";
  vcCtx.fillRect(0, 0, r.width, r.height);
  vcCtx.clearRect(cx, cy, cw, ch);
  vcCtx.strokeStyle = "rgba(255,255,255,0.9)";
  vcCtx.lineWidth = 2;
  vcCtx.strokeRect(cx, cy, cw, ch);
}

function clearVideoCropCanvas() {
  videoCropCanvas.width = videoCropCanvas.clientWidth || 1;
  vcCtx.clearRect(0, 0, videoCropCanvas.width, videoCropCanvas.height);
}

function updateVideoCropUI() {
  vBtnApplyCrop.disabled = !vState.cropRect;
  vBtnClearCrop.disabled = !vState.cropRect;
  videoCropHint.hidden = !vState.cropMode;
  vBtnCrop.classList.toggle("active", vState.cropMode);
}

vBtnCrop.onclick = () => {
  vState.cropMode = !vState.cropMode;
  videoCropCanvas.classList.toggle("crop-active", vState.cropMode);
  vState.cropDrag = { active: false, start: null, end: null };
  if (!vState.cropMode) clearVideoCropCanvas();
  updateVideoCropUI();
};
vBtnApplyCrop.onclick = () => {
  vState.cropMode = false;
  videoCropCanvas.classList.remove("crop-active");
  vState.cropDrag = { active: false, start: null, end: null };
  updateVideoCropUI();
  if (vState.cropRect) drawVideoCropOverlay();
};
vBtnClearCrop.onclick = () => {
  vState.cropRect = null;
  vState.cropMode = false;
  videoCropCanvas.classList.remove("crop-active");
  vState.cropDrag = { active: false, start: null, end: null };
  clearVideoCropCanvas();
  updateVideoCropUI();
};

/* crop drag on canvas */
function getVCPoint(e) {
  const r = videoCropCanvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}
videoCropCanvas.addEventListener("mousedown", (e) => {
  if (!vState.cropMode) return;
  vState.cropDrag.active = true;
  vState.cropDrag.start = vState.cropDrag.end = getVCPoint(e);
  drawVideoCropOverlay();
});
videoCropCanvas.addEventListener("mousemove", (e) => {
  if (!vState.cropMode || !vState.cropDrag.active) return;
  vState.cropDrag.end = getVCPoint(e);
  drawVideoCropOverlay();
});
window.addEventListener("mouseup", () => {
  if (vState.cropDrag.active) {
    vState.cropDrag.active = false;
    drawVideoCropOverlay();
  }
});

/* ───────────────────────────────────────────────────────────────
 *  VIDEO EDITOR — SPEED / TRIM
 * ─────────────────────────────────────────────────────────────── */
function changeSpeed(val) {
  vState.speed = parseFloat(val);
  videoEl.playbackRate = vState.speed;
}

function setStart() {
  vState.start = videoEl.currentTime;
  if (vState.start >= vState.end)
    vState.end = Math.min(vState.start + 1, vState.duration);
  updateTrimBadges();
  updateTrimTimeline();
}

function setEnd() {
  vState.end = videoEl.currentTime;
  if (vState.end <= vState.start) vState.start = Math.max(vState.end - 1, 0);
  updateTrimBadges();
  updateTrimTimeline();
}

function updateTrimBadges() {
  startBadge.textContent = fmtSec(vState.start);
  endBadge.textContent = fmtSec(vState.end);
}

function updateTrimTimeline() {
  const dur = vState.duration;
  if (!dur) return;
  const sp = (vState.start / dur) * 100,
    ep = (vState.end / dur) * 100;
  trimHandleStart.style.left = sp + "%";
  trimHandleEnd.style.left = ep + "%";
  trimRange.style.left = sp + "%";
  trimRange.style.width = ep - sp + "%";
  trimStartLabel.textContent = fmtTime(vState.start);
  trimEndLabel.textContent = fmtTime(vState.end);
  trimDurLabel.textContent =
    "Thời lượng cắt: " + fmtTime(vState.end - vState.start);
}

videoEl.addEventListener("timeupdate", () => {
  const pct = vState.duration
    ? (videoEl.currentTime / vState.duration) * 100
    : 0;
  trimPlayhead.style.left = pct + "%";
  trimStartLabel.textContent = fmtTime(vState.start);
  trimEndLabel.textContent = fmtTime(vState.end);
});

/* Timeline click */
trimTrack.addEventListener("click", (e) => {
  if (vState.trimDragging) return;
  const r = trimTrack.getBoundingClientRect();
  videoEl.currentTime =
    clamp((e.clientX - r.left) / r.width, 0, 1) * vState.duration;
});

/* Handle drag (mouse) */
function startTrimDrag(e, which) {
  e.preventDefault();
  e.stopPropagation();
  vState.trimDragging = which;
  const onMove = (mv) => {
    const r = trimTrack.getBoundingClientRect();
    const t = clamp((mv.clientX - r.left) / r.width, 0, 1) * vState.duration;
    if (which === "start") vState.start = clamp(t, 0, vState.end - 0.1);
    else vState.end = clamp(t, vState.start + 0.1, vState.duration);
    updateTrimBadges();
    updateTrimTimeline();
    videoEl.currentTime = which === "start" ? vState.start : vState.end;
  };
  const onUp = () => {
    vState.trimDragging = null;
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
  };
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
}
trimHandleStart.addEventListener("mousedown", (e) => startTrimDrag(e, "start"));
trimHandleEnd.addEventListener("mousedown", (e) => startTrimDrag(e, "end"));

/* Touch */
function startTrimDragTouch(e, which) {
  e.preventDefault();
  e.stopPropagation();
  const onMove = (mv) => {
    const t = mv.touches[0];
    const r = trimTrack.getBoundingClientRect();
    const time = clamp((t.clientX - r.left) / r.width, 0, 1) * vState.duration;
    if (which === "start") vState.start = clamp(time, 0, vState.end - 0.1);
    else vState.end = clamp(time, vState.start + 0.1, vState.duration);
    updateTrimBadges();
    updateTrimTimeline();
  };
  const onUp = () => {
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

/* ───────────────────────────────────────────────────────────────
 *  VIDEO EDITOR — EXPORT (trim + filter + crop + resolution)
 * ─────────────────────────────────────────────────────────────── */
async function trimVideo() {
  const dur = vState.end - vState.start;
  if (dur <= 0) {
    alert("Vui lòng đặt Start và End hợp lệ!");
    return;
  }

  btnTrim.disabled = true;
  btnTrim.textContent = "⏳ Đang xử lý…";
  showProgress("Đang chuẩn bị xuất video…");

  try {
    /* ── Determine output size ── */
    const resVal = exportResolution.value;
    let outW = videoEl.videoWidth || 1280,
      outH = videoEl.videoHeight || 720;
    if (resVal !== "source") {
      const maxH = parseInt(resVal);
      const ratio = outW / outH;
      outH = Math.min(maxH, outH);
      outW = Math.round(outH * ratio);
      if (outW % 2 !== 0) outW++; // ensure even
    }

    /* ── Crop region ── */
    const crop = vState.cropRect;
    let cropX = 0,
      cropY = 0,
      cropW = videoEl.videoWidth || outW,
      cropH = videoEl.videoHeight || outH;
    if (crop) {
      cropX = Math.round(crop.x * cropW);
      cropY = Math.round(crop.y * cropH);
      cropW = Math.round(crop.w * cropW);
      cropH = Math.round(crop.h * cropH);
      if (!resVal || resVal === "source") {
        outW = cropW;
        outH = cropH;
      }
    }

    /* ── Canvas for rendering ── */
    const offCanvas = document.createElement("canvas");
    offCanvas.width = outW;
    offCanvas.height = outH;
    const offCtx = offCanvas.getContext("2d");
    offCtx.imageSmoothingEnabled = true;
    offCtx.imageSmoothingQuality = "high";

    /* ── Build filter string ── */
    const filterStr = [
      vState.gray ? "grayscale(1)" : "",
      `brightness(${vState.brightness})`,
      `contrast(${vState.contrast})`,
      `saturate(${vState.saturation})`,
    ]
      .filter(Boolean)
      .join(" ");

    /* ── Seek and capture ── */
    videoEl.currentTime = vState.start;
    await new Promise((r) => {
      videoEl.onseeked = r;
    });

    /* ── Grab audio (original or volume-adjusted) ── */
    let audioDestStream = null;
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const src2 = audioCtx.createMediaElementSource(videoEl);
      const gainNode = audioCtx.createGain();
      gainNode.gain.value = vState.muted ? 0 : vState.volume;
      src2.connect(gainNode);
      const dest = audioCtx.createMediaStreamDestination();
      gainNode.connect(dest);
      audioDestStream = dest.stream;
    } catch (_) {
      /* audio context may fail; no audio in export */
    }

    /* ── Canvas capture stream ── */
    const canvasStream = offCanvas.captureStream(30);
    if (audioDestStream) {
      audioDestStream.getAudioTracks().forEach((t) => canvasStream.addTrack(t));
    }

    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : "video/webm";
    const recorder = new MediaRecorder(canvasStream, { mimeType });
    const chunks = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `edited_${vState.start.toFixed(1)}s-${vState.end.toFixed(1)}s_${resVal}.webm`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      btnTrim.disabled = false;
      btnTrim.textContent = "🎬 Xuất đã chỉnh";
      hideProgress();
      cancelAnimationFrame(rafId);
    };

    videoEl.playbackRate = vState.speed;
    videoEl.play();
    recorder.start(100);

    const realDur = dur / vState.speed;
    let elapsed = 0;
    const TICK = 150;
    const progInterval = setInterval(() => {
      elapsed += TICK;
      const pct = Math.min((elapsed / (realDur * 1000)) * 100, 95);
      trimProgressBar.style.width = pct + "%";
      const rem = Math.max(0, realDur - elapsed / 1000);
      trimProgressLabel.textContent = `Đang xuất… còn ~${rem.toFixed(1)}s`;
    }, TICK);

    /* rAF draw loop: video frame → canvas with crop+filter */
    let rafId;
    const drawFrame = () => {
      offCtx.filter = filterStr || "none";
      if (crop)
        offCtx.drawImage(videoEl, cropX, cropY, cropW, cropH, 0, 0, outW, outH);
      else offCtx.drawImage(videoEl, 0, 0, outW, outH);
      rafId = requestAnimationFrame(drawFrame);
    };
    drawFrame();

    setTimeout(() => {
      videoEl.pause();
      recorder.stop();
      clearInterval(progInterval);
      trimProgressBar.style.width = "100%";
      trimProgressLabel.textContent = "✅ Hoàn tất! Đang tải xuống…";
    }, realDur * 1000);
  } catch (err) {
    console.error(err);
    alert("Lỗi xuất video: " + (err.message || err));
    btnTrim.disabled = false;
    btnTrim.textContent = "🎬 Xuất đã chỉnh";
    hideProgress();
  }
}

/* Expose globals */
window.setStart = setStart;
window.setEnd = setEnd;
window.changeSpeed = changeSpeed;
window.trimVideo = trimVideo;

/* ───────────────────────────────────────────────────────────────
 *  UPLOAD PANEL — tab switching
 * ─────────────────────────────────────────────────────────────── */
btnOpenUpload.addEventListener("click", () => {
  uploadPanel.hidden = !uploadPanel.hidden;
});

document.querySelectorAll(".upload-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document
      .querySelectorAll(".upload-tab")
      .forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const which = tab.dataset.tab;
    document.getElementById("tabLocal").hidden = which !== "local";
    document.getElementById("tabServer").hidden = which !== "server";
  });
});

/* ───────────────────────────────────────────────────────────────
 *  LOCAL UPLOAD
 * ─────────────────────────────────────────────────────────────── */
btnBrowse.addEventListener("click", () => uploadInput.click());
uploadInput.addEventListener("change", () =>
  handleLocalFiles(uploadInput.files),
);

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
  handleLocalFiles(e.dataTransfer.files);
});

document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("drop", (e) => {
  if (e.target === dropZone || dropZone.contains(e.target)) return;
  e.preventDefault();
  handleLocalFiles(e.dataTransfer.files);
});

function handleLocalFiles(fileList) {
  if (!fileList || !fileList.length) return;
  let added = 0;
  for (let i = 0; i < fileList.length; i++) {
    const f = fileList[i];
    if (f.type.startsWith("image/")) {
      localUploads.images.push({ url: URL.createObjectURL(f), name: f.name });
      added++;
    } else if (f.type.startsWith("video/")) {
      localUploads.videos.push({ url: URL.createObjectURL(f), name: f.name });
      added++;
    }
  }
  if (added) {
    renderLocalUploads();
    uploadPanel.hidden = true;
    uploadsSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function removeLocalImage(idx) {
  URL.revokeObjectURL(localUploads.images[idx].url);
  localUploads.images.splice(idx, 1);
  renderLocalUploads();
}

function removeLocalVideo(idx) {
  URL.revokeObjectURL(localUploads.videos[idx].url);
  localUploads.videos.splice(idx, 1);
  renderLocalUploads();
}

function clearAllLocal() {
  localUploads.images.forEach((i) => URL.revokeObjectURL(i.url));
  localUploads.videos.forEach((v) => URL.revokeObjectURL(v.url));
  localUploads.images = [];
  localUploads.videos = [];
  renderLocalUploads();
}
window.removeLocalImage = removeLocalImage;
window.removeLocalVideo = removeLocalVideo;
window.clearAllLocal = clearAllLocal;

function renderLocalUploads() {
  const total = localUploads.images.length + localUploads.videos.length;
  const opt = filterEl.querySelector(".filter-opt-uploads");
  if (!total) {
    uploadsSection.hidden = true;
    uploadsSection.innerHTML = "";
    if (opt) opt.style.display = "none";
    return;
  }
  if (opt) opt.style.display = "";
  uploadsSection.hidden = false;

  const art = document.createElement("article");
  art.className = "album";
  art.dataset.category = "__uploads__";
  art.dataset.keywords = "upload local";
  art.innerHTML = `<div class="album-head"><h2>📁 Ảnh &amp; Video của tôi <span class="album-badge">${total} file</span></h2><p style="color:var(--muted);font-size:0.88rem">Lưu tạm trong trình duyệt, không lên server.</p></div>`;

  const actions = document.createElement("div");
  actions.className = "album-actions";
  actions.innerHTML = `<button class="album-action-btn" onclick="document.getElementById('uploadInput').click()">➕ Thêm file</button><button class="album-action-btn danger" onclick="clearAllLocal()">🗑 Xóa tất cả</button>`;
  art.appendChild(actions);

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
      const rm = document.createElement("button");
      rm.className = "card-remove";
      rm.title = "Xóa";
      rm.textContent = "✕";
      rm.addEventListener("click", (e) => {
        e.stopPropagation();
        removeLocalImage(idx);
      });
      card.append(img, rm);
      grid.appendChild(card);
    });
    art.appendChild(grid);
  }

  if (localUploads.videos.length) {
    const vw = document.createElement("div");
    vw.className = "video";
    vw.innerHTML = `<div class="video-title">🎥 Video (${localUploads.videos.length})</div>`;
    localUploads.videos.forEach((item, idx) => {
      const row = document.createElement("div");
      row.style.cssText =
        "display:flex;align-items:center;gap:10px;width:min(960px,100%);margin-bottom:6px;";
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
      const rm = document.createElement("button");
      rm.className = "album-action-btn danger";
      rm.style.flexShrink = "0";
      rm.textContent = "✕ Xóa";
      rm.addEventListener("click", () => removeLocalVideo(idx));
      row.append(ratio, rm);
      vw.appendChild(row);
      const nm = document.createElement("div");
      nm.style.cssText =
        "font-size:0.8rem;color:var(--muted);width:min(960px,100%);margin-bottom:10px;";
      nm.textContent = item.name;
      vw.appendChild(nm);
    });
    art.appendChild(vw);
  }

  uploadsSection.innerHTML = "";
  uploadsSection.appendChild(art);
  applyFilters();
}

/* ───────────────────────────────────────────────────────────────
 *  GITHUB UPLOAD
 *  Uses GitHub Contents API:
 *    GET  /repos/{owner}/{repo}/contents/{path}  → list folder
 *    PUT  /repos/{owner}/{repo}/contents/{path}  → create/update file
 * ─────────────────────────────────────────────────────────────── */

/* ── DOM refs for GitHub tab ── */
var ghOwner = document.getElementById("ghOwner");
var ghRepo = document.getElementById("ghRepo");
var ghBranch = document.getElementById("ghBranch");
var ghToken = document.getElementById("ghToken");
var btnSaveGh = document.getElementById("btnSaveGh");
var btnTestGh = document.getElementById("btnTestGh");
var serverStatus = document.getElementById("serverStatus");
var folderSelect = document.getElementById("folderSelect");
var btnRefreshFolders = document.getElementById("btnRefreshFolders");
var newFolderName = document.getElementById("newFolderName");
var btnCreateFolder = document.getElementById("btnCreateFolder");
var dropZoneServer = document.getElementById("dropZoneServer");
var uploadServerInput = document.getElementById("uploadServerInput");
var btnBrowseServer = document.getElementById("btnBrowseServer");
var serverUploadQueue = document.getElementById("serverUploadQueue");

/* ── Config helpers ── */
function getGhConfig() {
  return {
    owner: localStorage.getItem("gh_owner") || "",
    repo: localStorage.getItem("gh_repo") || "",
    branch: localStorage.getItem("gh_branch") || "main",
    token: localStorage.getItem("gh_token") || "",
  };
}

function setGhStatus(msg, type) {
  serverStatus.textContent = msg;
  serverStatus.className = "server-status " + (type || "");
}

/* ── Load saved config ── */
(function () {
  var cfg = getGhConfig();
  if (ghOwner && cfg.owner) ghOwner.value = cfg.owner;
  if (ghRepo && cfg.repo) ghRepo.value = cfg.repo;
  if (ghBranch && cfg.branch) ghBranch.value = cfg.branch;
  if (ghToken && cfg.token) ghToken.value = cfg.token;
})();

/* ── Save ── */
if (btnSaveGh)
  btnSaveGh.addEventListener("click", function () {
    localStorage.setItem("gh_owner", (ghOwner.value || "").trim());
    localStorage.setItem("gh_repo", (ghRepo.value || "").trim());
    localStorage.setItem("gh_branch", (ghBranch.value || "main").trim());
    localStorage.setItem("gh_token", (ghToken.value || "").trim());
    setGhStatus("✅ Đã lưu cấu hình!", "ok");
    setTimeout(function () {
      setGhStatus("");
    }, 2500);
  });

/* ── GitHub API fetch wrapper ── */
async function ghFetch(path, method, body) {
  var cfg = getGhConfig();
  if (!cfg.token) throw new Error("Chưa nhập GitHub Token");
  var opts = {
    method: method || "GET",
    headers: {
      Authorization: "token " + cfg.token,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
    },
  };
  if (body) opts.body = JSON.stringify(body);
  var url = "https://api.github.com" + path;
  var res = await fetch(url, opts);
  if (!res.ok) {
    var err = await res.json().catch(function () {
      return {};
    });
    throw new Error(err.message || "HTTP " + res.status);
  }
  return res.json();
}

/* ── Test connection ── */
if (btnTestGh)
  btnTestGh.addEventListener("click", async function () {
    var cfg = getGhConfig();
    if (!cfg.owner || !cfg.repo) {
      setGhStatus("❌ Nhập Owner và Repo trước", "err");
      return;
    }
    setGhStatus("🔌 Đang kiểm tra…");
    try {
      var data = await ghFetch("/repos/" + cfg.owner + "/" + cfg.repo);
      setGhStatus(
        "✅ Kết nối OK — " + data.full_name + " (" + data.default_branch + ")",
        "ok",
      );
      fetchGhFolders();
    } catch (e) {
      setGhStatus("❌ " + e.message, "err");
    }
  });

/* ── List folders (top-level + docs/media) ── */
async function fetchGhFolders() {
  var cfg = getGhConfig();
  if (!cfg.owner || !cfg.repo || !cfg.token) return;
  setGhStatus("🔄 Đang tải danh sách folder…");
  try {
    /* Try docs/media first (common pattern for this project) */
    var folders = [];
    var tryPaths = ["docs/media", "media", ""];
    var found = false;
    for (var pi = 0; pi < tryPaths.length; pi++) {
      var tryPath = tryPaths[pi];
      try {
        var path =
          "/repos/" +
          cfg.owner +
          "/" +
          cfg.repo +
          "/contents" +
          (tryPath ? "/" + tryPath : "");
        var items = await ghFetch(path + "?ref=" + cfg.branch);
        if (Array.isArray(items)) {
          items.forEach(function (item) {
            if (item.type === "dir") {
              folders.push(tryPath ? tryPath + "/" + item.name : item.name);
            }
          });
          /* Also add the base path itself as an upload target */
          if (tryPath) folders.unshift(tryPath);
          found = true;
          break;
        }
      } catch (_) {
        /* try next path */
      }
    }
    if (!found || folders.length === 0) {
      /* fallback: show root dirs */
      var root = await ghFetch(
        "/repos/" + cfg.owner + "/" + cfg.repo + "/contents?ref=" + cfg.branch,
      );
      if (Array.isArray(root)) {
        root.forEach(function (item) {
          if (item.type === "dir") folders.push(item.name);
        });
      }
    }
    populateGhFolders(folders);
    setGhStatus("✅ Đã tải " + folders.length + " folder", "ok");
    setTimeout(function () {
      setGhStatus("");
    }, 2000);
  } catch (e) {
    setGhStatus("❌ " + e.message, "err");
  }
}

function populateGhFolders(folders) {
  if (!folderSelect) return;
  folderSelect.innerHTML = "<option value=''>-- Chọn folder --</option>";
  folders.forEach(function (f) {
    var o = document.createElement("option");
    o.value = f;
    o.textContent = f;
    folderSelect.appendChild(o);
  });
}

if (btnRefreshFolders)
  btnRefreshFolders.addEventListener("click", fetchGhFolders);

/* ── Create folder (by pushing .gitkeep) ── */
if (btnCreateFolder)
  btnCreateFolder.addEventListener("click", async function () {
    var name = newFolderName.value.trim();
    if (!name) {
      setGhStatus("❌ Nhập tên folder trước", "err");
      return;
    }
    /* Normalise: no leading/trailing slash */
    name = name.replace(/^\/+|\/+$/g, "");
    var cfg = getGhConfig();
    if (!cfg.owner || !cfg.repo) {
      setGhStatus("❌ Cấu hình repo trước", "err");
      return;
    }
    setGhStatus("➕ Đang tạo folder…");
    try {
      var filePath = name + "/.gitkeep";
      await ghFetch(
        "/repos/" + cfg.owner + "/" + cfg.repo + "/contents/" + filePath,
        "PUT",
        {
          message: "Create folder " + name + " via MyPictures",
          content: "",
          /* empty file, base64 of "" */
          branch: cfg.branch,
        },
      );
      setGhStatus('✅ Đã tạo folder "' + name + '"!', "ok");
      newFolderName.value = "";
      fetchGhFolders();
    } catch (e) {
      setGhStatus("❌ " + e.message, "err");
    }
  });

/* ── File → base64 ── */
function fileToBase64(file) {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onload = function () {
      resolve(reader.result.split(",")[1]);
    };
    reader.onerror = function () {
      reject(new Error("Đọc file thất bại"));
    };
    reader.readAsDataURL(file);
  });
}

/* ── Upload files to GitHub ── */
if (btnBrowseServer)
  btnBrowseServer.addEventListener("click", function () {
    uploadServerInput.click();
  });
if (uploadServerInput)
  uploadServerInput.addEventListener("change", function () {
    handleGhUpload(uploadServerInput.files);
  });
if (dropZoneServer) {
  dropZoneServer.addEventListener("dragover", function (e) {
    e.preventDefault();
    dropZoneServer.classList.add("drag-over");
  });
  dropZoneServer.addEventListener("dragleave", function () {
    dropZoneServer.classList.remove("drag-over");
  });
  dropZoneServer.addEventListener("drop", function (e) {
    e.preventDefault();
    dropZoneServer.classList.remove("drag-over");
    handleGhUpload(e.dataTransfer.files);
  });
}

async function handleGhUpload(fileList) {
  if (!fileList || !fileList.length) return;
  var cfg = getGhConfig();
  if (!cfg.token) {
    setGhStatus("❌ Nhập GitHub Token trước", "err");
    return;
  }
  if (!cfg.owner || !cfg.repo) {
    setGhStatus("❌ Cấu hình Owner/Repo trước", "err");
    return;
  }
  var folder = folderSelect ? folderSelect.value : "";
  if (!folder) {
    setGhStatus("❌ Chọn folder đích trước", "err");
    return;
  }

  serverUploadQueue.hidden = false;
  serverUploadQueue.innerHTML = "";

  for (var i = 0; i < fileList.length; i++) {
    var f = fileList[i];
    /* create queue item */
    var itemEl = document.createElement("div");
    itemEl.className = "queue-item";
    var qid = "q_" + Date.now() + "_" + i;
    itemEl.innerHTML =
      "<span class='queue-item-name' title='" +
      f.name +
      "'>" +
      f.name +
      "</span>" +
      "<div class='queue-progress'><div class='queue-progress-bar' id='pb_" +
      qid +
      "'></div></div>" +
      "<span class='queue-item-status' id='st_" +
      qid +
      "'>⏳ Đang đọc…</span>";
    serverUploadQueue.appendChild(itemEl);

    var stEl = document.getElementById("st_" + qid);
    var pbEl = document.getElementById("pb_" + qid);

    try {
      /* 1. read as base64 */
      if (pbEl) pbEl.style.width = "20%";
      var b64 = await fileToBase64(f);
      if (pbEl) pbEl.style.width = "45%";
      if (stEl) stEl.textContent = "📤 Đang push…";

      /* 2. check if file already exists (need SHA to update) */
      var filePath = folder + "/" + f.name;
      var apiPath =
        "/repos/" + cfg.owner + "/" + cfg.repo + "/contents/" + filePath;
      var sha = null;
      try {
        var existing = await ghFetch(apiPath + "?ref=" + cfg.branch);
        if (existing && existing.sha) sha = existing.sha;
      } catch (_) {
        /* file doesn't exist, sha stays null */
      }

      if (pbEl) pbEl.style.width = "65%";

      /* 3. PUT to GitHub */
      var body = {
        message: (sha ? "Update " : "Upload ") + f.name + " via MyPictures",
        content: b64,
        branch: cfg.branch,
      };
      if (sha) body.sha = sha;

      var result = await ghFetch(apiPath, "PUT", body);
      if (pbEl) pbEl.style.width = "100%";
      var fileUrl =
        result && result.content && result.content.html_url
          ? result.content.html_url
          : "#";
      if (stEl) {
        stEl.innerHTML =
          "<a href='" +
          fileUrl +
          "' target='_blank' rel='noopener'>✅ Xem trên GitHub</a>";
        stEl.className = "queue-item-status ok";
      }
    } catch (e) {
      if (stEl) {
        stEl.textContent = "❌ " + e.message;
        stEl.className = "queue-item-status err";
      }
      if (pbEl) {
        pbEl.style.background = "#ff6060";
      }
    }
  }
}

/* ───────────────────────────────────────────────────────────────
 *  ALBUMS (from manifest.json)
 * ─────────────────────────────────────────────────────────────── */
const USE_BLOB = true;
async function attachVideoBlob(el, url) {
  const res = await fetch(url, { cache: "force-cache" });
  if (!res.ok) throw new Error(`Fetch ${res.status}`);
  el.src = URL.createObjectURL(
    new Blob([await res.blob()], { type: "video/mp4" }),
  );
}

function renderAlbum(album) {
  const art = document.createElement("article");
  art.className = "album";
  art.dataset.category = album.folder;
  art.dataset.keywords =
    `${album.folder} ${album.title} ${album.description || ""}`.toLowerCase();

  const head = document.createElement("div");
  head.className = "album-head";
  head.innerHTML = `<h2>${album.title}</h2><p>${album.description || ""}</p>`;
  art.appendChild(head);

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
    art.appendChild(grid);
  }

  if ((album.videos || []).length) {
    const vw = document.createElement("div");
    vw.className = "video";
    vw.innerHTML = `<div class="video-title">🎥 Video</div>`;
    album.videos.forEach((src) => {
      const ratio = document.createElement("div");
      ratio.className = "ratio";
      const v = document.createElement("video");
      v.controls = true;
      v.preload = "metadata";
      v.playsInline = true;
      v.loop = true;
      v.addEventListener("click", () =>
        openLightbox(src, "Video — " + src.split("/").pop()),
      );
      v.addEventListener("ended", () => {
        v.currentTime = 0;
        v.play().catch(() => {});
      });
      if (USE_BLOB)
        attachVideoBlob(v, src).catch(() => {
          const s = document.createElement("source");
          s.src = src;
          s.type = "video/mp4";
          v.appendChild(s);
        });
      else {
        const s = document.createElement("source");
        s.src = src;
        s.type = "video/mp4";
        v.appendChild(s);
      }
      ratio.appendChild(v);
      vw.appendChild(ratio);
      const link = document.createElement("div");
      link.style.marginTop = "8px";
      link.innerHTML = `<a href="${src}" target="_blank" rel="noopener noreferrer">↗ Mở / tải video</a>`;
      vw.appendChild(link);
    });
    art.appendChild(vw);
  }
  return art;
}

/* ───────────────────────────────────────────────────────────────
 *  FILTER / SEARCH
 * ─────────────────────────────────────────────────────────────── */
function applyFilters() {
  const f = filterEl.value,
    q = (searchEl.value || "").trim().toLowerCase();
  document
    .querySelectorAll("#albums .album, #uploadsSection .album")
    .forEach((a) => {
      const matchCat = f === "all" || a.dataset.category === f;
      const matchQ =
        !q ||
        a.innerText.toLowerCase().includes(q) ||
        (a.dataset.keywords || "").includes(q);
      a.style.display = matchCat && matchQ ? "" : "none";
    });
  if (uploadsSection.querySelector(".album")) {
    const ua = uploadsSection.querySelector(".album");
    const matchCat = f === "all" || f === "__uploads__";
    const matchQ = !q || ua.innerText.toLowerCase().includes(q);
    uploadsSection.hidden =
      !(matchCat && matchQ) ||
      localUploads.images.length + localUploads.videos.length === 0;
  }
}
filterEl.addEventListener("change", applyFilters);
searchEl.addEventListener("input", applyFilters);

/* ───────────────────────────────────────────────────────────────
 *  INIT
 * ─────────────────────────────────────────────────────────────── */
async function init() {
  /* Hide the uploads filter option until files are added */
  var initOpt = filterEl.querySelector(".filter-opt-uploads");
  if (initOpt) initOpt.style.display = "none";
  try {
    const res = await fetch("./manifest.json", { cache: "no-store" });
    const data = await res.json();
    albumsEl.innerHTML = "";
    data.albums.forEach((a) => albumsEl.appendChild(renderAlbum(a)));
  } catch (e) {
    albumsEl.innerHTML = `<div class="empty-state">⚠️ Không tải được manifest.json: ${e.message}</div>`;
  }
  applyFilters();
  /* Pre-load GitHub folders if configured */
  if (getGhConfig().token && getGhConfig().owner)
    fetchGhFolders().catch(function () {});
}

init();
