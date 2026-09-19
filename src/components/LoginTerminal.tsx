"use client";

import dynamic from "next/dynamic";

// Loaded in the browser and only when it is the one being shown: the shader
// and ogl with it are a few tens of kilobytes that a catalog with posters
// never needs to fetch.
const FaultyTerminal = dynamic(() => import("@/components/FaultyTerminal"), { ssr: false });

// Cells are twice as dense across as down, which used to come out square
// only because the shader stretched x to fill the width. Now that it does
// not, 1.25 is what reproduces the shape a wide screen always showed.
const GRID: [number, number] = [1.25, 1];
const POSTER_GRID: [number, number] = [1, 1];

/** The sign-in background for a catalog that has no wall to show yet. */
export default function LoginTerminal({
  onFrame,
  pageLoadAnimation = true,
  variant = "login",
  tint = "#8db3ce",
}: {
  onFrame?: (canvas: HTMLCanvasElement) => void;
  pageLoadAnimation?: boolean;
  variant?: "login" | "poster";
  /** The shader's colour; the pale blue of the catalog's selection by default. */
  tint?: string;
} = {}) {
  return (
    <div aria-hidden className="absolute inset-0">
      <FaultyTerminal
        scale={variant === "poster" ? 1.8 : 3.2}
        gridMul={variant === "poster" ? POSTER_GRID : GRID}
        digitSize={1.2}
        timeScale={0.01}
        scanlineIntensity={variant === "poster" ? 0 : 1.5}
        glitchAmount={0}
        flickerAmount={0}
        noiseAmp={1}
        curvature={variant === "poster" ? 0 : 0.1}
        tint={tint}
        brightness={variant === "poster" ? 0.28 : 0.65}
        mouseReact={false}
        onFrame={onFrame}
        pageLoadAnimation={pageLoadAnimation}
      />
    </div>
  );
}
