"""
build_zine.py — 把創刊號會刊 PDF 轉成網頁用的頁面圖片

來源：專案根目錄的「Galgame同好會 創刊號01：還在共通線中！.pdf」（34 頁，含封面與封底）。
換成新版會刊時，把新的 PDF 放在專案根目錄（只放一個 .pdf），重新執行本腳本即可。
輸出：assets/img/zine/NN.jpg 與 assets/js/zine-data.js
PDF 本身很大（約 44 MB），已列在 .gitignore，不會被提交或部署。

需要 pypdfium2：pip install pypdfium2
"""
import glob, json, os, sys
import pypdfium2 as pdfium

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "img", "zine")
W = 1100  # 輸出寬度

pdfs = glob.glob(os.path.join(ROOT, "*.pdf"))
if len(pdfs) != 1:
    sys.exit(f"專案根目錄需要剛好一個 .pdf，目前有 {len(pdfs)} 個")

pdf = pdfium.PdfDocument(pdfs[0])
w, h = pdf[0].get_size()
H = round(W * h / w)

os.makedirs(OUT, exist_ok=True)
for old in glob.glob(os.path.join(OUT, "*.jpg")):
    os.remove(old)

pages = []
for i in range(len(pdf)):
    img = pdf[i].render(scale=W / w).to_pil().convert("RGB").resize((W, H))
    name = f"{i + 1:02d}.jpg"
    img.save(os.path.join(OUT, name), "JPEG", quality=78, optimize=True, progressive=True)
    pages.append(f"assets/img/zine/{name}")

data = {"title": "創刊號　還在共通線中！", "w": W, "h": H, "pages": pages}
js = "/* 由 tools/build_zine.py 產生，不要手動編輯 */\nwindow.ZINE = " + json.dumps(data, ensure_ascii=False, indent=2) + ";\n"
with open(os.path.join(ROOT, "assets", "js", "zine-data.js"), "w", encoding="utf-8") as f:
    f.write(js)
print(len(pages), "pages", W, "x", H)
