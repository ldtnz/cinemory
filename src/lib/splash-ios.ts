/**
 * iOS launch (splash) screens.
 *
 * On Android Chrome builds the splash from the manifest (icon + background
 * colour). iOS ignores the manifest and wants one image per screen-size
 * combination instead: without them, opening the app from the Home screen
 * leaves a blank page until the server answers.
 *
 * Portrait only, because the app is locked to portrait.
 */
export const IOS_SPLASH = [
  {
    url: "/splash/splash-320x568@2x.png",
    media:
      "(device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)",
  }, // iPhone SE (1st gen)
  {
    url: "/splash/splash-375x667@2x.png",
    media:
      "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)",
  }, // iPhone 8, SE 2/3
  {
    url: "/splash/splash-414x736@3x.png",
    media:
      "(device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)",
  }, // iPhone 8 Plus
  {
    url: "/splash/splash-375x812@3x.png",
    media:
      "(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)",
  }, // iPhone X/XS/11 Pro, 12/13 mini
  {
    url: "/splash/splash-414x896@2x.png",
    media:
      "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)",
  }, // iPhone XR, 11
  {
    url: "/splash/splash-414x896@3x.png",
    media:
      "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)",
  }, // iPhone XS Max, 11 Pro Max
  {
    url: "/splash/splash-390x844@3x.png",
    media:
      "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)",
  }, // iPhone 12/13/14
  {
    url: "/splash/splash-428x926@3x.png",
    media:
      "(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)",
  }, // iPhone 12/13 Pro Max, 14 Plus
  {
    url: "/splash/splash-393x852@3x.png",
    media:
      "(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)",
  }, // iPhone 14 Pro, 15, 16
  {
    url: "/splash/splash-430x932@3x.png",
    media:
      "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)",
  }, // iPhone 15/16 Plus, Pro Max
  {
    url: "/splash/splash-402x874@3x.png",
    media:
      "(device-width: 402px) and (device-height: 874px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)",
  }, // iPhone 16 Pro
  {
    url: "/splash/splash-440x956@3x.png",
    media:
      "(device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)",
  }, // iPhone 16 Pro Max
];
