import os, re, json, sys
from PIL import Image, ImageOps
Image.MAX_IMAGE_PIXELS = None

SRC = r"D:\Galgame同好會\對外活動照"
OUT = r"D:\claude工作區\Galgame週邊線上展覽\assets\img\events"
MAXEDGE = 1600

# folder -> (slug, 標題, 日期, 要排在最前面的檔名)   顯示順序 = 這個清單的順序
EVENTS = [
    ("北醫社課X東京大學視覺小說同好會來訪", "tmu-tokyo", "北醫社課 × 東京大學視覺小說同好會來訪", "2026/05/08", ["5-ALL2.png", "5-JAPAN1.png"]),
    ("上海galonly fes", "shanghai-galonly", "上海 Galonly Fes", "", []),
    ("素晴日討論會", "subarashi-hibi", "素晴日討論會", "2026/07/19", []),
    ("台大 1016", "ntu-1016", "台大社課", "2026/10/16", []),
    ("長庚社課", "cgu", "長庚社課", "", []),
]

def nat(s):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", s)]

albums = []
for folder, slug, title, date, first in EVENTS:
    d = os.path.join(SRC, folder)
    if not os.path.isdir(d):
        print("MISSING", folder); sys.exit(1)
    files = sorted([f for f in os.listdir(d) if f.lower().endswith((".jpg", ".jpeg", ".png"))], key=nat)
    # 指定要放最前面的照片（依清單順序），其餘維持檔名順序
    files = [f for f in first if f in files] + [f for f in files if f not in first]
    od = os.path.join(OUT, slug)
    os.makedirs(od, exist_ok=True)
    photos = []
    for i, f in enumerate(files, 1):
        im = Image.open(os.path.join(d, f))
        im = ImageOps.exif_transpose(im)
        if im.mode in ("RGBA", "LA", "P"):
            im = im.convert("RGBA")
            bg = Image.new("RGB", im.size, (255, 255, 255))
            bg.paste(im, mask=im.split()[3])
            im = bg
        else:
            im = im.convert("RGB")
        im.thumbnail((MAXEDGE, MAXEDGE), Image.LANCZOS)
        name = f"{i:02d}.jpg"
        im.save(os.path.join(od, name), "JPEG", quality=80, optimize=True, progressive=True)
        photos.append({"src": f"assets/img/events/{slug}/{name}", "w": im.size[0], "h": im.size[1]})
    albums.append({"id": slug, "title": title, "date": date, "photos": photos})
    print(slug, len(photos))

js = "/* 由 tools/build_photos.py 產生，不要手動編輯 */\nwindow.EVENT_ALBUMS = " + json.dumps(albums, ensure_ascii=False, indent=2) + ";\n"
open(os.path.join(r"D:\claude工作區\Galgame週邊線上展覽\assets\js", "events-data.js"), "w", encoding="utf-8").write(js)

# ---- logo: black-background JPG -> transparent PNG ----
import numpy as np
L = Image.open(r"D:\claude工作區\Galgame週邊線上展覽\logo.jpg").convert("RGB")
a = np.asarray(L).astype(float)
mx = a.max(axis=2)
alpha = np.clip((mx - 30) / (190 - 30), 0, 1)
rgb = np.where(alpha[..., None] > 0, np.clip(a / np.maximum(alpha[..., None], 0.35), 0, 255), 0)
out = np.dstack([rgb, alpha * 255]).astype("uint8")
img = Image.fromarray(out, "RGBA")
img512 = img.resize((512, 512), Image.LANCZOS)
img512.save(r"D:\claude工作區\Galgame週邊線上展覽\assets\img\logo.png", optimize=True)
img.resize((96, 96), Image.LANCZOS).save(r"D:\claude工作區\Galgame週邊線上展覽\assets\img\favicon.png", optimize=True)
# preview on light background
bg = Image.new("RGB", (512, 512), (255, 243, 248)); bg.paste(img512, mask=img512.split()[3])
bg.save(r"C:\Users\maxx\AppData\Local\Temp\claude\D--claude---\d1c53914-1adc-4073-862b-2fcd9bc049ad\scratchpad\logo_preview.png")
print("logo done")
