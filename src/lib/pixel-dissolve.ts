/**
 * A card breaking into pixels on its way out.
 *
 * Marking something watched takes it out of the "To watch" grid, and a row
 * that simply stops existing reads as a glitch — you are left wondering
 * whether the click registered on the card you meant. So the card comes apart
 * instead: a grid of squares, each shrinking away on its own beat, which says
 * "this one, gone" in the place the card was.
 *
 * The technique is React Bits' PixelSwap, reduced to the half this needs.
 * PixelSwap crossfades two contents by growing pixel windows onto the incoming
 * one; there is no incoming content here, so the windows only ever close.
 *
 * What makes it look like one picture dissolving rather than a mosaic of
 * shrinking thumbnails is the counter-transform: every square is a window onto
 * its own copy of the whole card, and the copy is scaled by exactly the
 * inverse of its window, about the window's own centre. The two cancel at
 * every frame, so the image stays locked in place while the squares eat it
 * away. That is also why the keyframes are sampled rather than left to the
 * browser: an eased scale and its reciprocal only cancel if both are read off
 * the same eased value.
 *
 * Where each square gets its picture from decides how small the squares can
 * afford to be. Cloning the rendered card once per square is exact but costs a
 * full paint each, which put a ceiling of about a hundred squares on it. A card
 * is a poster, so the squares can share one already-decoded image instead,
 * placed to line up with where the poster sits in the card — hundreds of those
 * cost about what a dozen clones did. The clone is kept as the fallback for a
 * card with no artwork yet.
 *
 * Nothing here touches React. It draws over the rendered node and resolves —
 * so the caller can do its state update after, with the grid reflowing once,
 * when the card is already gone.
 */

/** Square edge, in pixels. Small enough to read as pixels rather than as
 *  tiles, which the shared-image path below makes affordable — a card is
 *  around eleven squares across.
 *
 *  It is a real cost, not a free one: measured on a software-rendered browser
 *  with no GPU, the worst frame over the dissolve goes 50ms at 32px, 83ms at
 *  24px, 117ms here, 183ms at 16px and past 200ms at 14px, against a 33ms
 *  baseline. Anything with a GPU composites these far more cheaply, but the
 *  shape of the curve is why this stops here rather than going smaller. */
const PIXEL_SIZE = 18;
/** A ceiling regardless, so an unusually large card grows its squares rather
 *  than its count. */
const MAX_PIXELS = 240;
/** Cloning is the expensive path; it gets a much lower ceiling of its own, and
 *  correspondingly chunkier squares. */
const MAX_CLONED_PIXELS = 96;

/** Long enough to watch, short enough to stay out of the way. */
const TOTAL_MS = 900;
/** What one square takes to close, leaving TOTAL_MS - PIXEL_MS to stagger. */
const PIXEL_MS = 380;

/** How small a square gets before it is gone. */
const END_SCALE = 0.3;
const KEYFRAME_STEPS = 12;

/** Deterministic per-square noise, so the scatter is stable across a rerun
 *  and does not need a seeded generator. */
function noise(seed: number): number {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

/** cubic-bezier(0.22, 1, 0.36, 1) — the same ease the app's own transitions
 *  use, solved here because the two halves have to be sampled from it. */
function ease(progress: number): number {
  const [x1, y1, x2, y2] = [0.22, 1, 0.36, 1];
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  let t = progress;
  for (let i = 0; i < 5; i += 1) {
    const slope = (3 * ax * t + 2 * bx) * t + cx;
    if (!slope) break;
    t -= (((ax * t + bx) * t + cx) * t - progress) / slope;
  }
  t = Math.min(Math.max(t, 0), 1);
  return ((ay * t + by) * t + cy) * t;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * The card's artwork, laid out the way the card itself lays it out.
 *
 * Next's Image fills the card with object-fit: cover, which crops rather than
 * stretches; a background has to be told the same thing in numbers, or every
 * square would show a subtly different picture from the one it is replacing.
 * Null when there is no artwork loaded — a title whose poster is still missing
 * falls back to cloning.
 */
function posterBacking(
  element: HTMLElement,
  width: number,
  height: number,
): { src: string; drawWidth: number; drawHeight: number; offsetX: number; offsetY: number } | null {
  const image = element.querySelector("img");
  const src = image?.currentSrc || image?.src;
  if (!image || !src || !image.naturalWidth || !image.naturalHeight) return null;

  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  return {
    src,
    drawWidth,
    drawHeight,
    offsetX: (width - drawWidth) / 2,
    offsetY: (height - drawHeight) / 2,
  };
}

type Square = { left: number; top: number; delay: number };

function buildGrid(width: number, height: number, cap: number): { squares: Square[]; size: number } {
  let size = PIXEL_SIZE;
  let columns = Math.max(1, Math.ceil(width / size));
  let rows = Math.max(1, Math.ceil(height / size));

  if (columns * rows > cap) {
    size = Math.ceil(size * Math.sqrt((columns * rows) / cap));
    columns = Math.max(1, Math.ceil(width / size));
    rows = Math.max(1, Math.ceil(height / size));
  }

  const spread = TOTAL_MS - PIXEL_MS;
  const squares: Square[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      squares.push({
        left: column * size,
        top: row * size,
        delay: noise(row * columns + column + 1) * spread,
      });
    }
  }
  return { squares, size };
}

/**
 * Takes the card apart. Resolves when there is nothing left to see.
 *
 * Resolves immediately, having done nothing, when the element is not on screen
 * or the reader has asked for less motion — the caller's own work does not
 * depend on the animation, so there is nothing to special-case at the call
 * site.
 */
export function pixelDissolve(element: HTMLElement): Promise<void> {
  const rect = element.getBoundingClientRect();
  if (!rect.width || !rect.height || prefersReducedMotion() || !("animate" in element)) {
    return Promise.resolve();
  }

  const poster = posterBacking(element, rect.width, rect.height);
  const { squares, size } = buildGrid(
    rect.width,
    rect.height,
    poster ? MAX_PIXELS : MAX_CLONED_PIXELS,
  );

  const overlay = document.createElement("div");
  overlay.setAttribute("aria-hidden", "true");
  // Named so it can be found from outside — by a test watching it appear and
  // go, and by anyone wondering what the extra node in the inspector is.
  overlay.dataset.pixelDissolve = "true";
  Object.assign(overlay.style, {
    position: "fixed",
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    pointerEvents: "none",
    // Square panes have no corners of their own; the card's are put back by
    // clipping the whole ghost to the same shape.
    borderRadius: getComputedStyle(element).borderRadius,
    overflow: "hidden",
    // Under the dialogs (z-50), over the grid.
    zIndex: "40",
  });

  // Sampled rather than interpolated: the window's scale and the content's
  // reciprocal have to come off the same eased value or the picture drifts.
  const windowFrames: Keyframe[] = [];
  const contentFrames: Keyframe[] = [];
  for (let step = 0; step <= KEYFRAME_STEPS; step += 1) {
    const progress = step / KEYFRAME_STEPS;
    const eased = ease(progress);
    const scale = 1 + (END_SCALE - 1) * eased;
    windowFrames.push({ offset: progress, opacity: 1 - eased, transform: `scale(${scale})` });
    contentFrames.push({ offset: progress, transform: `scale(${1 / scale})` });
  }

  const animations: Animation[] = [];
  for (const square of squares) {
    const pane = document.createElement("div");
    Object.assign(pane.style, {
      position: "absolute",
      left: `${square.left}px`,
      top: `${square.top}px`,
      width: `${size}px`,
      height: `${size}px`,
      overflow: "hidden",
      // No will-change: at this many squares it asks for a composited layer
      // each, and paying for hundreds of them up front costs far more than the
      // transform it was meant to make cheap.
    });

    const content = document.createElement("div");
    Object.assign(content.style, {
      position: "absolute",
      left: `${-square.left}px`,
      top: `${-square.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      // About the square's centre, not the card's, so the pair cancels.
      transformOrigin: `${square.left + size / 2}px ${square.top + size / 2}px`,
    });

    if (poster) {
      // One image for the whole grid: the browser decodes it once and every
      // square draws its own window onto the same bitmap.
      Object.assign(content.style, {
        backgroundImage: `url("${poster.src}")`,
        backgroundSize: `${poster.drawWidth}px ${poster.drawHeight}px`,
        backgroundPosition: `${poster.offsetX}px ${poster.offsetY}px`,
        backgroundRepeat: "no-repeat",
      });
    } else {
      const clone = element.cloneNode(true) as HTMLElement;
      // Copies of the card are about to be in the document, and each one
      // carries the card's own id. Left alone, the next lookup by that id
      // could find a ghost instead of the card.
      delete clone.dataset.titleId;
      // A clone is a brand-new element, so the grid's arrival animation starts
      // again on it — the ghost would fade up from nothing while it is meant to
      // be fading away, and with a stagger delay it would spend the first
      // frames invisible. The ghost is a still picture; it animates only as a
      // whole.
      clone.classList.remove("reveal-item");
      clone.style.animation = "none";
      // The card is painted lazily (content-visibility: auto in globals.css)
      // and a clone would inherit that and come out blank.
      clone.style.contentVisibility = "visible";
      clone.style.width = `${rect.width}px`;
      clone.style.height = `${rect.height}px`;
      content.append(clone);
    }
    pane.append(content);
    overlay.append(pane);

    const timing: KeyframeAnimationOptions = {
      duration: PIXEL_MS,
      delay: square.delay,
      easing: "linear",
      fill: "both",
    };
    animations.push(pane.animate(windowFrames, timing), content.animate(contentFrames, timing));
  }

  document.body.append(overlay);
  // The original steps aside for its own ghost. A data attribute rather than a
  // class or an inline style: React rewrites the class attribute wholesale on
  // its next render and would wipe the hiding halfway through.
  element.dataset.dissolving = "true";

  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      animations.forEach((animation) => animation.cancel());
      overlay.remove();
      delete element.dataset.dissolving;
      resolve();
    };
    // The timer, not the animations' own promises: one square finishing last
    // is the end of it, and a cancelled animation rejects rather than settles.
    const timer = window.setTimeout(finish, TOTAL_MS + 20);
  });
}

/** Every card in the list, coming apart together. */
export function pixelDissolveAll(elements: HTMLElement[]): Promise<void> {
  return Promise.all(elements.map(pixelDissolve)).then(() => undefined);
}

/** The rendered card for a title, if it is on screen. */
export function cardElement(id: number): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-title-id="${id}"]`);
}
