// Render traced SVG vs original PNG side by side for fidelity check
const sharp = require("sharp");
const fs = require("fs");

(async () => {
  const svg = fs.readFileSync("/home/z/my-project/scripts/flower_petals.svg", "utf8");
  const svgBuf = Buffer.from(svg.replace('viewBox="-140 -140 280 280"', 'viewBox="-140 -140 280 280" width="512" height="512"'));

  // Render traced flower: terracotta on cream
  const traced = await sharp(svgBuf, { density: 96 })
    .resize(512, 512)
    .flatten({ background: "#F5F0E8" })
    .png()
    .toFile("/home/z/my-project/shots/flower-traced.png");

  // Original: black on cream for comparison
  const orig = await sharp("/home/z/my-project/public/img/logo-mark.png")
    .resize(512, 512)
    .flatten({ background: "#F5F0E8" })
    .png()
    .toFile("/home/z/my-project/shots/flower-orig.png");

  // Side by side: orig | traced | overlay-diff
  const sideBySide = await sharp({
    create: { width: 1084, height: 512, channels: 4, background: "#F5F0E8" },
  })
    .composite([
      { input: "/home/z/my-project/shots/flower-orig.png", left: 10, top: 0 },
      { input: "/home/z/my-project/shots/flower-traced.png", left: 562, top: 0 },
    ])
    .png()
    .toFile("/home/z/my-project/shots/flower-compare.png");

  console.log("done", { traced, orig, sideBySide });
})();
