#!/usr/bin/env python3
"""Phase sweep: render the symmetric 5-petal at rotations 0..71 step 2,
find best IoU vs original. Diagnoses phase vs shape error."""
import subprocess
import re
import numpy as np
from PIL import Image

mask = np.array(Image.open("/home/z/my-project/public/img/logo-mark.png").convert("RGBA"))[:, :, 3] > 40
CX, CY = 274.400, 255.050

svg0 = open("/home/z/my-project/scripts/flower_petals.svg").read()
vb = int(re.search(r'viewBox="(-\d+) (-\d+) (\d+) (\d+)"', svg0).group(3)) // 2
petal_d = re.search(r'd="([^"]+)"', svg0).group(1)

results = []
for extra in range(0, 72, 2):
    lines = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{-vb} {-vb} {2*vb} {2*vb}" width="{2*vb}" height="{2*vb}">']
    for k in range(5):
        lines.append(f'  <path class="petal p{k}" d="{petal_d}" fill="#000000" transform="rotate({k*72 + extra})"/>')
    lines.append("</svg>")
    open("/tmp/flower_traced.svg", "w").write("\n".join(lines))
    r = subprocess.run(["node", "/home/z/my-project/scripts/render_traced.js"], capture_output=True, text=True)
    assert "rendered" in r.stdout, r.stderr
    m2r = np.array(Image.open("/tmp/flower_traced.png").convert("RGBA"))[:, :, 3] > 40
    canvas = np.zeros((512, 512), dtype=bool)
    dy, dx = int(round(CY - vb)), int(round(CX - vb))
    hh, ww = m2r.shape
    y0, y1 = max(0, dy), min(512, dy + hh)
    x0, x1 = max(0, dx), min(512, dx + ww)
    canvas[y0:y1, x0:x1] = m2r[y0 - dy:y1 - dy, x0 - dx:x1 - dx]
    inter = (mask & canvas).sum(); union = (mask | canvas).sum()
    results.append((extra, inter / union, canvas.sum() / mask.sum()))

for e, iou, ratio in results:
    bar = "#" * int(iou * 50)
    print(f"rot {e:2d}: IoU={iou:.4f} ratio={ratio:.3f} {bar}")
best = max(results, key=lambda t: t[1])
print(f"\nBEST: rotation +{best[0]} deg, IoU={best[1]:.4f}")
