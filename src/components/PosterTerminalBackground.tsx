"use client";

import { useEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";

// One WebGL renderer feeds all visible fallback posters. A separate context
// per card would exhaust the browser's context limit in a large catalog.
const targets = new Set<CanvasRenderingContext2D>();
let root: Root | null = null;
let host: HTMLDivElement | null = null;
let generation = 0;
let starting = false;
let cachedFrame: HTMLCanvasElement | null = null;

function copyFrame(target: CanvasRenderingContext2D, source: HTMLCanvasElement) {
  target.clearRect(0, 0, target.canvas.width, target.canvas.height);
  target.drawImage(source, 0, 0, target.canvas.width, target.canvas.height);
}

function publishFrame(source: HTMLCanvasElement) {
  cachedFrame ??= document.createElement("canvas");
  if (cachedFrame.width !== source.width || cachedFrame.height !== source.height) {
    cachedFrame.width = source.width;
    cachedFrame.height = source.height;
  }
  const context = cachedFrame.getContext("2d");
  if (context) copyFrame(context, source);
  for (const target of targets) copyFrame(target, source);
}

async function start() {
  if (root || starting || targets.size === 0) return;
  starting = true;
  const current = ++generation;
  try {
    const { default: LoginTerminal } = await import("@/components/LoginTerminal");
    if (current !== generation || targets.size === 0) return;
    host = document.createElement("div");
    host.setAttribute("aria-hidden", "true");
    host.style.cssText = "position:fixed;left:-10000px;top:0;width:180px;height:270px;pointer-events:none";
    document.body.appendChild(host);
    root = createRoot(host);
    root.render(
      <LoginTerminal
        variant="poster"
        pageLoadAnimation={false}
        onFrame={publishFrame}
      />,
    );
  } catch {
    // A failed optional chunk leaves the plain poster and its text intact.
  } finally {
    if (current === generation) starting = false;
  }
}

function stopWhenUnused() {
  // Defer root disposal until React has finished cleaning up the card tree.
  queueMicrotask(() => {
    if (targets.size > 0) return;
    generation++;
    starting = false;
    root?.unmount();
    root = null;
    host?.remove();
    host = null;
    cachedFrame = null;
  });
}

export default function PosterTerminalBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    let visible = false;
    const update = () => {
      if (visible && !document.hidden) {
        targets.add(context);
        if (cachedFrame) copyFrame(context, cachedFrame);
        void start();
      } else {
        targets.delete(context);
        stopWhenUnused();
      }
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      update();
    });
    observer.observe(canvas);
    document.addEventListener("visibilitychange", update);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
      targets.delete(context);
      stopWhenUnused();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={360}
      height={540}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
