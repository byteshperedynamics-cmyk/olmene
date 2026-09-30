const sharp = require("sharp");
const fs = require("fs");
sharp(Buffer.from(fs.readFileSync("/tmp/flower_traced.svg", "utf8")), { density: 300 })
  .resize(512, 512)
  .png()
  .toFile("/tmp/flower_traced.png")
  .then(() => console.log("rendered"))
  .catch((e) => { console.error(e.message); process.exit(1); });
