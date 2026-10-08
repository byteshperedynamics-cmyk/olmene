import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

/**
 * The site's three typefaces (src/app/layout.tsx), bundled locally so renders
 * never depend on a font CDN. Variable files: one request covers every weight,
 * and Newsreader's optical-size axis gives headlines the display cut.
 * All three are SIL OFL — licences sit next to the files in public/fonts/.
 */
export const fontsLoaded = Promise.all([
  loadFont({
    family: "Newsreader",
    url: staticFile("fonts/newsreader-latin-opsz-normal.woff2"),
    weight: "200 800",
    style: "normal",
  }),
  loadFont({
    family: "Newsreader",
    url: staticFile("fonts/newsreader-latin-opsz-italic.woff2"),
    weight: "200 800",
    style: "italic",
  }),
  loadFont({
    family: "Inter",
    url: staticFile("fonts/inter-latin-opsz-normal.woff2"),
    weight: "100 900",
  }),
  loadFont({
    family: "JetBrains Mono",
    url: staticFile("fonts/jetbrains-mono-latin-wght-normal.woff2"),
    weight: "100 800",
  }),
]);
