"use client";

import dynamic from "next/dynamic";

// Loaded in the browser and only when it is the one being shown: the shader
// and ogl with it are a few tens of kilobytes that a catalog with posters
// never needs to fetch.
const FaultyTerminal = dynamic(() => import("@/components/FaultyTerminal"), { ssr: false });

/** The sign-in background for a catalog that has no wall to show yet. */
export default function LoginTerminal() {
  return (
    <div aria-hidden className="absolute inset-0">
      <FaultyTerminal
        scale={1.6}
        gridMul={[2, 1]}
        digitSize={1.2}
        timeScale={0.25}
        scanlineIntensity={0.6}
        glitchAmount={1}
        flickerAmount={0.8}
        noiseAmp={1}
        curvature={0.1}
        // The catalog's own accent, dimmed: this sits under a card that has to
        // stay readable.
        tint="#22c55e"
        brightness={0.55}
        mouseReact
        mouseStrength={0.3}
      />
    </div>
  );
}
