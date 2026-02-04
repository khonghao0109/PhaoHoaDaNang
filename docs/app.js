const albumsEl = document.getElementById("albums");
const filterEl = document.getElementById("filter");
const searchEl = document.getElementById("search");

/** =========================
 *  LIGHTBOX / IMAGE EDITOR
 *  ========================= */
const lightbox = document.getElementById("lightbox");
const lbClose = document.getElementById("lbClose");
const lbCaption = document.getElementById("lbCaption");

const lbCanvas = document.getElementById("lbCanvas");
const ctx = lbCanvas.getContext("2d", { alpha: false });

const btnZoomIn = document.getElementById("btnZoomIn");
const btnZoomOut = document.getElementById("btnZoomOut");
const btnReset = document.getElementById("btnReset");
const btnRotate = document.getElementById("btnRotate");
const btnFlipX = document.getElementById("btnFlipX");
const btnFlipY = document.getElementById("btnFlipY");
const btnGray = document.getElementById("btnGray");

const btnCrop = document.getElementById("btnCrop");
const btnApplyCrop = document.getElementById("btnApplyCrop");
const btnClearCrop = document.getElementById("btnClearCrop");
const lbHint = document.getElementById("lbHint");

const btnDownloadOriginal = document.getElementById("btnDownloadOriginal");
const btnDownloadEdited = document.getElementById("btnDownloadEdited");

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
  }, 120); // 120ms là mượt khi drag crop/zoom
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
  // Determine the displayed image "logical" size after rotation (before zoom)
  const iw = imgEl.naturalWidth;
  const ih = imgEl.naturalHeight;
  const rot = ((state.rot % 360) + 360) % 360;

  const rotatedW = rot === 90 || rot === 270 ? ih : iw;
  const rotatedH = rot === 90 || rot === 270 ? iw : ih;

  // Fit rotated rect inside canvas
  const cw = lbCanvas.width;
  const ch = lbCanvas.height;

  const scaleToFit = Math.min(cw / rotatedW, ch / rotatedH) * state.zoom;

  return { iw, ih, rot, rotatedW, rotatedH, scaleToFit, cw, ch };
}

function draw() {
  if (!imgEl || !imgEl.naturalWidth) return;

  fitCanvasToCSSSize();
  const { iw, ih, rot, rotatedW, rotatedH, scaleToFit, cw, ch } =
    getDrawParams();

  // Clear
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, cw, ch);

  // Center
  ctx.save();
  ctx.translate(cw / 2, ch / 2);

  // Grayscale filter (preview)
  ctx.filter = state.gray ? "grayscale(1)" : "none";

  // Apply flip (in display space)
  ctx.scale(state.flipX, state.flipY);

  // Apply rotation in display space
  ctx.rotate((rot * Math.PI) / 180);

  // After rotate, draw original image centered with correct scaling:
  // If rot is 90/270, width/height swap in drawing
  // But easiest: rotate context then draw original with its own w/h
  const drawW = iw * scaleToFit;
  const drawH = ih * scaleToFit;

  ctx.drawImage(imgEl, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();

  // Draw crop overlay (if crop mode or cropRect exists)
  if (state.cropMode || state.cropRect) {
    drawCropOverlay();
  }

  // Update download links (debounced)
  scheduleDownloadLinksUpdate();
}

function canvasToImageSpace(canvasX, canvasY) {
  // Map a point from CANVAS coords to IMAGE coords under current transform
  // We'll reverse the draw transform approximately using known params.
  const { iw, ih, rot, scaleToFit, cw, ch } = getDrawParams();

  // Translate so origin is canvas center
  let x = canvasX - cw / 2;
  let y = canvasY - ch / 2;

  // Reverse rotation
  const ang = (-rot * Math.PI) / 180;
  const cos = Math.cos(ang);
  const sin = Math.sin(ang);
  let rx = x * cos - y * sin;
  let ry = x * sin + y * cos;

  // Reverse flips
  rx /= state.flipX;
  ry /= state.flipY;

  // Reverse scale
  rx /= scaleToFit;
  ry /= scaleToFit;

  // Now rx, ry is in original image space centered at (0,0)
  const ix = rx + iw / 2;
  const iy = ry + ih / 2;

  return { ix: clamp(ix, 0, iw), iy: clamp(iy, 0, ih) };
}

function drawCropOverlay() {
  const cw = lbCanvas.width;
  const ch = lbCanvas.height;

  // Darken overlay
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(0, 0, cw, ch);

  // Determine crop rectangle in canvas coords for display
  let crop = state.cropRect;

  // If actively dragging, show temp crop from drag points
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

  // Convert crop rect from image space -> canvas space by sampling 4 corners
  const corners = [
    imageToCanvasSpace(crop.x, crop.y),
    imageToCanvasSpace(crop.x + crop.w, crop.y),
    imageToCanvasSpace(crop.x + crop.w, crop.y + crop.h),
    imageToCanvasSpace(crop.x, crop.y + crop.h),
  ];

  // Clear the crop area from overlay via polygon
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.moveTo(corners[0].cx, corners[0].cy);
  for (let i = 1; i < corners.length; i++)
    ctx.lineTo(corners[i].cx, corners[i].cy);
  ctx.closePath();
  ctx.fill();

  // Draw crop border
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

function imageToCanvasSpace(ix, iy) {
  // Map point from IMAGE coords to CANVAS coords under current transform
  const { iw, ih, rot, scaleToFit, cw, ch } = getDrawParams();

  // Convert image space to centered coords
  let x = ix - iw / 2;
  let y = iy - ih / 2;

  // Apply scale
  x *= scaleToFit;
  y *= scaleToFit;

  // Apply flips
  x *= state.flipX;
  y *= state.flipY;

  // Apply rotation
  const ang = (rot * Math.PI) / 180;
  const cos = Math.cos(ang);
  const sin = Math.sin(ang);
  const rx = x * cos - y * sin;
  const ry = x * sin + y * cos;

  // Translate back to canvas coords
  return { cx: rx + cw / 2, cy: ry + ch / 2 };
}

function renderEditedToCanvas(outputCtx, outW, outH) {
  // Render current transform to a target context at desired size
  const iw = imgEl.naturalWidth;
  const ih = imgEl.naturalHeight;
  const rot = ((state.rot % 360) + 360) % 360;

  outputCtx.save();
  outputCtx.fillStyle = "#000";
  outputCtx.fillRect(0, 0, outW, outH);

  outputCtx.translate(outW / 2, outH / 2);
  outputCtx.filter = state.gray ? "grayscale(1)" : "none";
  outputCtx.scale(state.flipX, state.flipY);
  outputCtx.rotate((rot * Math.PI) / 180);

  outputCtx.drawImage(imgEl, -iw / 2, -ih / 2, iw, ih);
  outputCtx.restore();
}

function exportEditedBlob() {
  return new Promise((resolve) => {
    const iw = imgEl.naturalWidth;
    const ih = imgEl.naturalHeight;

    // If crop exists, we will crop in original image space BEFORE applying transforms?
    // User expectation: crop the area they selected on current view.
    // We stored cropRect in original image coordinates, so we can crop source image first.
    const crop = state.cropRect;

    // Prepare source canvas (cropped original)
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

    // Now apply transform to a final canvas
    // Rotation changes output dimensions
    const rot = ((state.rot % 360) + 360) % 360;
    const outCanvas = document.createElement("canvas");
    const octx = outCanvas.getContext("2d", { alpha: false });

    const outW = rot === 90 || rot === 270 ? baseH : baseW;
    const outH = rot === 90 || rot === 270 ? baseW : baseH;

    outCanvas.width = outW;
    outCanvas.height = outH;

    // Draw transformed
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

  // Original download
  btnDownloadOriginal.href = currentSrc;
  btnDownloadOriginal.download = `${baseName}.${ext}`;

  // Edited download (build blob URL)
  if (!imgEl || !imgEl.naturalWidth) return;

  if (lastEditedUrl) URL.revokeObjectURL(lastEditedUrl);

  const blob = await exportEditedBlob();
  lastEditedUrl = URL.createObjectURL(blob);
  btnDownloadEdited.href = lastEditedUrl;
  btnDownloadEdited.download = `${baseName}_edited.jpg`; // ảnh xuất ra bạn đang set jpeg
}

function openLightbox(src, caption) {
  currentSrc = src;
  lbCaption.textContent = caption || "";

  setLightboxOpen(true);
  resetEdits();

  imgEl = new Image();
  imgEl.crossOrigin = "anonymous";
  imgEl.onload = () => draw();
  imgEl.src = src;

  // keep downloads pointing to correct file
  btnDownloadOriginal.href = src;
  btnDownloadOriginal.download = (caption || "image") + ".jpg";
}

function closeLightbox() {
  setLightboxOpen(false);
  currentSrc = "";
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

window.addEventListener("resize", () => draw());

btnZoomIn.addEventListener("click", () => {
  state.zoom = clamp(state.zoom * 1.15, 0.2, 6);
  draw();
});

btnZoomOut.addEventListener("click", () => {
  state.zoom = clamp(state.zoom / 1.15, 0.2, 6);
  draw();
});

btnReset.addEventListener("click", () => {
  resetEdits();
});

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

btnCrop.addEventListener("click", () => {
  state.cropMode = !state.cropMode;
  drag.active = false;
  drag.start = null;
  drag.end = null;
  updateCropButtons();
  draw();
});

btnApplyCrop.addEventListener("click", () => {
  // Crop already stored in state.cropRect; "apply" just leaves it as is
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

// Crop interactions on canvas
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
      v.loop = true; // ✅ replay tự động
      v.muted = false;

      v.addEventListener("ended", () => {
        // fallback nếu browser không loop
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
