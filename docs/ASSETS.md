# 佔位圖替換清單

目前站上所有的 **logo、立繪、Q 版圖示、展品圖** 都是程式即時畫出來的 SVG 佔位圖。
它們的好處是完全離線可用、不會破圖、不依賴任何外部服務；
缺點當然是「一看就知道是暫時的」。

這份文件列出每一個佔位圖在哪裡、怎麼換。
**換掉其中任何一個都不會影響其他部分**，可以一個一個慢慢來。

---

## 一覽表

| # | 用途 | 目前來源 | 建議規格 | 換法 |
|---|---|---|---|---|
| 1 | 站徽 / Logo | `placeholder.js` → `PH.logo()` | 正方形 SVG 或 PNG ≥ 128px | 見下方 §1 |
| 2 | 瀏覽器分頁圖示 | `assets/img/favicon.svg` | SVG 或 32×32 PNG | 直接覆蓋檔案 |
| 3 | 首頁立繪 | `placeholder.js` → `PH.figure()` | 去背 PNG，直式約 520×900 | 見下方 §3 |
| 4 | 分享預覽圖 (OG) | `assets/img/og-image.png` ✅ 已產生 | 1200×630 PNG/JPG | 見下方 §4 |
| 5 | Q 版分類圖示 | `placeholder.js` → `PH.chibi()` | 正方形 SVG，96×96 | 見下方 §5 |
| 6 | 空狀態插圖 | `placeholder.js` → `PH.emptyMark()` | 正方形 SVG ~96px | 見下方 §6 |
| 7 | 後台鎖頭圖示 | `placeholder.js` → `PH.lockMark()` | 正方形 SVG ~64px | 同 §6 |
| 8 | 展品照片 | `placeholder.js` → `PH.exhibit()` | 你自己的週邊照 | 到 `/admin.html` 上傳即可，**不用改程式** |

> **第 8 項是重點**：只要你接好 Supabase 並上傳真實照片，
> 所有佔位展品圖就會自動消失，不需要動任何程式碼。
> 其餘 1–7 項才是要手動替換的裝飾素材。

---

## §1 Logo

**現況**：`assets/js/gallery.js` 與 `admin.js` 啟動時，把 `PH.logo(72)` 產生的
SVG data URI 塞進 `<img id="brand-logo">`。

**換法**：

1. 把你的 logo 放到 `assets/img/logo.svg`（或 `.png`）
2. 在 `index.html` 把這行的 `src` 填上：

   ```html
   <!-- 改成 -->
   <img class="brand__mark" id="brand-logo" src="assets/img/logo.svg" alt="" width="34" height="34" />
   ```

3. 刪掉 `assets/js/gallery.js` 裡這兩行（否則它會把你的圖蓋掉）：

   ```js
   const logo = $('#brand-logo');
   if (logo) logo.src = window.PH.logo(72);
   ```

4. `admin.html` 的 `#brand-logo` 和 `assets/js/admin.js` 裡的
   `$('#brand-logo').src = window.PH.logo(72);` 同樣處理

**設計建議**：header 上只有 34×34 的顯示空間，太細的線條會糊掉。
用一個辨識度高的單一圖形（一朵花、一個字、一個幾何符號）效果最好。

---

## §2 Favicon

直接覆蓋 `assets/img/favicon.svg` 就好，HTML 不用改。

想更完整一點（iOS 加到主畫面、Android 安裝提示），可以再加：

```html
<link rel="apple-touch-icon" href="assets/img/apple-touch-icon.png" />  <!-- 180×180 -->
```

---

## §3 首頁立繪

**現況**：`PH.figure()` 畫出一個粉紫色的女孩剪影，放在首頁右側。

**換法**：

1. 準備一張**去背 PNG**（透明背景），建議直式、約 520×900 或更大
2. 存成 `assets/img/hero-figure.png`
3. `index.html`：

   ```html
   <div class="hero__figure">
     <img id="hero-figure-img" src="assets/img/hero-figure.png" alt="" />
     <!-- 這一行刪掉 -->
     <span class="hero__figure-note">立繪佔位圖 · 待替換</span>
   </div>
   ```

4. `assets/js/gallery.js` 裡這兩行刪掉：

   ```js
   const fig = $('#hero-figure-img');
   if (fig) fig.src = window.PH.figure();
   ```

**注意**：
- 立繪在 **視窗高度 < 760px** 或 **寬度 < 860px** 時會自動隱藏。
  這是刻意的 —— 立繪只是點綴，不能把首屏吃光讓人看不到展品。
- 它的顯示高度上限是 `clamp(200px, 30vh, 300px)`，在 `styles.css` 的 `.hero__figure img`。
- 如果你的圖不是去背的，會出現一塊突兀的方形，記得先去背。

**版權提醒**：立繪如果是官方素材或他人繪製的圖，放在公開網站前請先確認授權。
自己畫的、有明確授權的、或委託繪師時談好可公開展示的最保險。

---

## §4 分享預覽圖（OG image）

**現況**：已經做好一張了（1200×630，約 215 KB），就在 `assets/img/og-image.png`。
配色與站上的夜間主題一致：深紫漸層、逆光暈、五瓣櫻花、ADV 風格的四角框線。

**想換成自己的版本**：做一張 **1200×630** 的圖蓋掉同名檔案就好，HTML 不用改。
內容建議：展覽名稱 + 幾張代表性的**真實**週邊照片拼貼 ——
目前這張是純文字排版，等你有真實照片後，拼貼版的點閱吸引力會好很多。

**重新產生目前這張**：產生腳本收在 `tools/make-og-image.ps1`，用 .NET 的
System.Drawing 畫圖，不需要安裝任何東西。改裡面的文字或顏色後重跑即可：

```powershell
powershell -ExecutionPolicy Bypass -File toolsmake-og-image.ps1
```

> 這個 .ps1 存檔時**必須帶 UTF-8 BOM**，否則 Windows PowerShell 5.1 會用 ANSI 讀檔，
> 裡面的中文與日文會全部變成亂碼並導致語法錯誤。

**驗證方式**：部署後把網址貼到 <https://www.opengraph.xyz/> 就能看到各平台的預覽效果。
記得同時把 `config.js` 的 `site.url` 填成你的正式網址。

---

## §5 Q 版分類圖示

**現況**：`PH.chibi(hue, glyph)` 可以產生小圓章圖示，但**目前版面上沒有用到它** ——
分類目前是用文字加一個符號（`config.js` 裡每個分類的 `icon` 欄位，例如 `◈`、`▤`）。

如果你想改成圖示：

1. 準備 7 張正方形小圖，命名對應分類 id：
   `standee.svg` / `tapestry.svg` / `shikishi.svg` / `artbook.svg` /
   `bonus.svg` / `package.svg` / `other.svg`
2. 放進 `assets/img/cat/`
3. 在 `gallery.js` 的 `buildFilters()` 裡，把文字標籤換成 `<img>`

**但老實說**：分類按鈕在手機上是橫向捲動的一排，加上圖示會讓每顆變寬、
一次看得到的分類變少。目前的純文字版本其實比較好用。
建議先看過實機再決定要不要加。

---

## §6 空狀態 / 鎖頭圖示

這兩個是小裝飾，用 `PH.emptyMark()` 和 `PH.lockMark()` 產生。

要換的話，把 `assets/js/placeholder.js` 裡對應函式的 `return svgUri(...)`
改成回傳你的圖片路徑字串即可，例如：

```js
function emptyMark() {
  return 'assets/img/empty.svg';
}
```

---

## 全部換完之後

當 1–7 項都換成自己的素材、展品也都上傳了真實照片之後，
`assets/js/placeholder.js` 就沒有用了，可以：

1. 從 `index.html` 和 `admin.html` 移除這一行：
   ```html
   <script src="assets/js/placeholder.js"></script>
   ```
2. 刪掉 `assets/js/placeholder.js`
3. 把 `assets/js/store.js` 裡的 demo 資料產生器（`buildDemoItems` 及相關常數）也刪掉

這樣可以少載約 12 KB。不過留著也完全沒有壞處 ——
它只在「設定還沒填好」時才會啟動，正式接上 Supabase 之後根本不會執行。

---

## 我的建議順序

如果時間有限，按這個順序換 CP 值最高：

1. **展品照片**（上傳真實的週邊照）—— 這佔了畫面 95% 的面積，影響最大
2. **OG image** —— 已經有一張能用的了；等有真實照片後換成拼貼版會更吸引人
3. **Logo + Favicon** —— 品牌識別
4. **立繪** —— 氣氛加分，但也可以乾脆不要（刪掉 `.hero__figure` 整塊，版面會更乾淨俐落）

第 5、6、7 項可以永遠不管，幾乎沒人會注意到。
