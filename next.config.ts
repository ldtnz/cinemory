import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const nextConfig: NextConfig = {
  // The Docker image builds with DOCKER_BUILD=1 and runs the standalone server,
  // which bundles only the files the app actually needs. Serverless platforms
  // build the app their own way, so the option stays off for them.
  output: process.env.DOCKER_BUILD ? "standalone" : undefined,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.tmdb.org",
        pathname: "/t/p/**",
      },
    ],
  },
  // Ship the SQLite file with the bundle when one exists next to the sources.
  // On a serverless platform the function filesystem is read-only, so those
  // deployments keep the real database on Turso and ignore this; self-hosted
  // installs read and write the file directly.
  outputFileTracingIncludes: {
    "/**": ["./prisma/dev.db"],
  },
  // @serwist/next adds a "webpack" config to the project (it uses it to
  // build the service worker for production). Next 16 defaults to Turbopack
  // for "next dev" and would otherwise flag that config as a likely mistake.
  turbopack: {},
};

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  // In development the service worker would slow hot reload down and make
  // debugging harder, so it is only generated for production builds.
  disable: process.env.NODE_ENV === "development",
});

export default withSerwist(nextConfig);
