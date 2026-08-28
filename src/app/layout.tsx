import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SerwistProvider } from "@serwist/next/react";
import DisableContextMenu from "@/components/DisableContextMenu";
import OrientationLock from "@/components/OrientationLock";
import ZoomLock from "@/components/ZoomLock";
import LandscapeNotice from "@/components/LandscapeNotice";
import { IOS_SPLASH } from "@/lib/splash-ios";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Cinemory",
  description:
    "Personal catalog of movies and TV series watched on Netflix, Prime Video, Disney+ and in theaters.",
  icons: {
    icon: [{ url: "/icon-512.png", sizes: "512x512", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    title: "Cinemory",
    statusBarStyle: "black-translucent",
    startupImage: IOS_SPLASH,
  },
  other: {
    // Next only emits "mobile-web-app-capable", the standard tag that
    // replaced this one. iOS still requires the legacy one to honour
    // apple-touch-startup-image: without it the splash screen never shows
    // when the app is launched from the home screen.
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: "#09090a",
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
  // Required for env(safe-area-inset-*) to return real values on notched
  // phones (the status bar is "black-translucent").
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <SerwistProvider swUrl="/sw.js" disable={process.env.NODE_ENV === "development"}>
          <DisableContextMenu />
          <OrientationLock />
          <ZoomLock />
          {children}
          <LandscapeNotice />
        </SerwistProvider>
      </body>
    </html>
  );
}
