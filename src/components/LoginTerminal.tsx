"use client";

import dynamic from "next/dynamic";

// Loaded in the browser and only when it is the one being shown: the shader
// and ogl with it are a few tens of kilobytes that a catalog with posters
// never needs to fetch.
const FaultyTerminal = dynamic(() => import("@/components/FaultyTerminal"), { ssr: false });

const GRID: [number, number] = [2, 1];

/** The sign-in background for a catalog that has no wall to show yet. */
export default function LoginTerminal() {
  return (
    <div aria-hidden className="absolute inset-0">
      <FaultyTerminal
        scale={3.2}
        gridMul={GRID}
        digitSize={1.2}
        timeScale={0.01}
        scanlineIntensity={1.5}
        glitchAmount={0}
        flickerAmount={0}
        noiseAmp={1}
        curvature={0.1}
        // The same pale blue as the catalog's multi-title selection.
        tint="#8db3ce"
        brightness={0.65}
        mouseReact={false}
      />
    </div>
  );
}
