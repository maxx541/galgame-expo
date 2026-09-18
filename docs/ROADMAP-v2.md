# v2 規劃：隨機背景圖庫 + 玻璃遮罩

> **狀態（2026-09-18）**：方案 1 已經實作完成，程式在 `assets/js/background.js`。
> 但預設是**關閉**的，原因見下方「實測到的硬性限制」。
> 等你接好 Cloudinary、上傳真實照片之後，把 `config.js` 的
> `ux.randomBackground` 改成 `'exhibits'` 就會生效。

> 你的原話：
> 「最底層背景是每次點開都隨機替換，基於我的圖片庫（再看要怎麼上傳）半透明的玻璃遮罩效果」

v1 已經把這件事的**版面與樣式全部寫好了**，缺的只有「圖片從哪來」。
這份文件把剩下的決定和實作步驟寫清楚，早上你挑一個方案，接上去就會動。

---

## v1 已經預留好的部分

`assets/css/styles.css` 第 3 節裡已經有：

```css
.bg-photo   /* 背景照片層：夜間 blur(20px) + 降彩度 + 壓暗到 50% 亮度
               日間則反過來提亮到 122% —— 淺色主題壓暗會變成一塊灰泥 */
.bg-glass   /* 玻璃遮罩：半透明底色 + backdrop-filter */
body.has-bg-photo .bg-sky { opacity: 0.35 }  /* 有照片時漸層自動讓位 */
```

`index.html` 裡也已經有對應的 DOM：

```html
<div class="bg-stage" aria-hidden="true">
  <div class="bg-photo" id="bg-photo"></div>   <!-- ← 只要給它 background-image -->
  <div class="bg-glass"></div>
  ...
</div>
```

**所以 v2 要做的只有兩件事：**

1. 決定圖片從哪裡來
2. 寫一支約 30 行的 `background.js`，隨機挑一張塞進去、給 body 加上 `has-bg-photo`

---

## 需要你決定：圖片從哪來

### 方案 1：直接用展品照片（0 額外工作，推薦先試這個）

站上本來就有 100 多張圖，隨機挑一張當背景。

```js
// assets/js/background.js
(async function () {
  await window.STORE.ready();
  const { items } = await window.STORE.list({ from: 0, to: 99, sort: 'new' });
  if (!items.length) return;

  const pick = items[Math.floor(Math.random() * items.length)];
  // 背景會被模糊到看不出細節，所以載最小的尺寸就好，省流量
  const url = window.CLOUD.tx(pick.imageUrl, 'w_900,e_blur:300,f_auto,q_auto:eco');

  const img = new Image();
  img.onload = () => {
    document.getElementById('bg-photo').style.backgroundImage = `url("${url}")`;
    document.body.classList.add('has-bg-photo');
  };
  img.src = url;
})();
```

**優點**：不用另外上傳、不用改資料庫、每次進站都不一樣、風格自然統一。
**缺點**：背景會是週邊商品照，不是「場景圖」，氣氛可能沒那麼強。
**成本**：多載一張約 30–60 KB 的模糊小圖。

> `e_blur:300` 讓 Cloudinary **在伺服器端就先模糊好**，
> 這比在瀏覽器用 CSS `filter: blur()` 省很多效能 —— 尤其手機。
> 雙重模糊的問題已經處理掉了：`background.js` 拿到伺服器端模糊好的圖時，
> 會給 `.bg-photo` 加上 `.is-preblurred`，那條規則裡沒有 `blur()`，
> 所以不用手動改 CSS。

---

### 方案 2：獨立的背景圖庫（效果最好，要多做一點）

專門放橫式的場景圖 / 桌布 / CG。

**做法 A — 純靜態，不用資料庫**（最簡單）

1. 建 `assets/img/bg/` 資料夾，把圖丟進去
2. 建一個清單檔 `data/backgrounds.json`：

   ```json
   ["assets/img/bg/01.webp", "assets/img/bg/02.webp", "assets/img/bg/03.webp"]
   ```

3. `background.js` 讀這個檔、隨機挑一張

換圖的方式就是丟檔案 + 改 JSON，再重新部署一次。

**做法 B — 也放 Cloudinary，後台可上傳**（最完整）

1. 在 Cloudinary 建第二個資料夾 `galgame-expo-bg`
2. Supabase 加一張表：

   ```sql
   create table public.backgrounds (
     id         uuid primary key default gen_random_uuid(),
     image_url  text not null,
     public_id  text,
     label      text,
     enabled    boolean not null default true,
     created_at timestamptz not null default now()
   );

   alter table public.backgrounds enable row level security;
   create policy "公開可讀" on public.backgrounds
     for select to anon, authenticated using (true);
   create policy "登入者可寫" on public.backgrounds
     for all to authenticated using (true) with check (true);
   ```

3. `admin.html` 加一個分頁「背景圖管理」，重用現有的 dropzone 元件
4. `background.js` 從這張表隨機挑

**優點**：之後換背景完全不用碰程式碼，在後台拖拉就好。
**缺點**：要多寫一個後台分頁，大概是 1–2 小時的工。

---

## 我的建議

**先做方案 1**（20 分鐘，用現有展品照）。

理由：實際看過效果之後，你才知道「隨機背景」這個點子在你的圖上好不好看。
有可能會發現：

- 週邊照當背景其實很好看 → 就停在方案 1，省下所有額外工作
- 模糊後太髒 / 太花 → 需要方案 2 的專門場景圖
- 深色圖好看、淺色圖會讓文字看不清 → 需要加一層更強的壓暗，或篩選只用深色圖

**這些都是要看過真圖才判斷得出來的。** 先花 20 分鐘做方案 1 當實驗，
再決定要不要投資方案 2 的工。

---

## 實測到的硬性限制：不能用 CSS 做全螢幕模糊

實作過程中實際量到的問題，記錄下來免得之後又踩：

對一張**全螢幕**的背景圖套用 CSS `filter: blur(20px)`，再疊上 `.bg-glass` 的
`backdrop-filter`，瀏覽器每次重繪都要重新光柵化並模糊整個畫面。
測試時分頁直接**卡死十幾秒**，完全沒有反應。

所以 `background.js` 現在有一條硬性規定：

> **只接受已經在伺服器端模糊好的圖**（也就是帶 `e_blur` 參數的 Cloudinary 網址）。
> 拿不到這種網址時就直接不顯示背景，不做 CSS 模糊的退路。

這也代表：

- 展示模式（demo 的 SVG 佔位圖）**不會**有背景，這是正確行為 —— 反正也還沒有真實照片
- 方案 2 做法 A（純靜態的本地圖檔）如果要用，**必須事先把圖模糊好再存檔**，
  不能指望瀏覽器即時模糊。用任何圖片編輯器做一次高斯模糊再存成 WebP 即可，
  順便還能把檔案壓得很小（模糊過的圖壓縮率極高，一張全螢幕背景大概只要 20–40 KB）

## 不管哪個方案都要注意

### 1. 可讀性是硬底線

背景再漂亮，文字看不清就是失敗。`.bg-photo` 夜間預設 `brightness(0.5)`、
日間 `brightness(1.22)`（淺色主題要反過來提亮，壓暗會變成一塊灰泥）。
如果換上真圖後還是覺得字糊在背景裡，就各自再往極端調一階。

**檢查方法**：挑你圖庫裡**最亮**的那張當背景，看卡片標題還讀不讀得出來。
過得了最亮那張，其他就都沒問題。

### 2. 不要讓背景拖慢首屏

背景是裝飾，展品才是主角。所以：

- 背景圖**最後**才載入（等展品的第一批圖載完再開始）
- 用 `new Image()` 預載，**載完才淡入**，不要讓使用者看到圖片一條一條刷出來
- 給它 `w_900` 就夠了 —— 反正要模糊，解析度再高也看不出來

### 3. 手機上建議直接關掉

`backdrop-filter` 在中低階 Android 上很吃效能，捲動會頓。

**這點已經做了** —— `background.js` 開頭就有 `max-width: 760px` 的檢查，
手機根本不會去載背景圖。下面的 CSS 只是備用寫法：

```css
@media (max-width: 760px) {
  body.has-bg-photo .bg-photo,
  body.has-bg-photo .bg-glass {
    display: none;
  }
}
```

手機螢幕小，背景本來就幾乎被內容蓋住，關掉幾乎沒有視覺損失，
但捲動流暢度差很多。這符合你說的「重點是不花俏、清楚呈現週邊商品圖片」。

### 4. 記得尊重 `prefers-reduced-motion`

如果使用者開了系統的「減少動態」，就不要做淡入，直接顯示或直接不顯示。

---

## 其他可以一起做的 v2 項目

依我覺得的價值排序：

| 項目 | 價值 | 工作量 |
|---|---|---|
| 展品支援多張圖（正面 / 背面 / 細節） | 高 —— 週邊很需要看背面和細節 | 中 |
| 展品排序可拖拉（自訂展出順序） | 低 —— 要加 `sort_order` 欄位 | 中 |
| PWA（可加到主畫面離線看） | 低 | 中 |

> **已完成，這裡只是留存紀錄：**
> - 「燈箱翻到最後自動載下一頁」—— v1 唯一一個「用起來會覺得怪」的地方
>   （按右鍵翻到第 24 張就卡住），已修掉。實作在 `lightbox.js` 的
>   `go()` / `maybeLoadMore()`，搭配 `gallery.js` 對外暴露的 `window.GALLERY`。
>   計數器會顯示 `28 / 48+`，`+` 表示後面還有沒載完的。
> - 「隨機看一件」按鈕 —— header 的骰子鈕，或按 `R`。
> - 隨機背景 —— `assets/js/background.js`，預設關閉（見上面「實測到的硬性限制」）。
> - **作品篩選** —— 見下方獨立段落。
> - **團隊共用密碼登入** —— 見下方獨立段落。
> - **擁有者欄位** —— 見下方獨立段落。

---

## 已完成：作品篩選

> 你的原話：「篩選也要多一欄有作品篩選」

篩選列的分類 chips 右邊多了一個「作品」下拉選單，跟分類是 **AND 關係**
（兩個一起套用，例如「立牌」+「櫻色協奏曲」）。

- `store.js`：`list()` 加了 `series` 參數（demo 模式做精確比對，Supabase 模式
  是 `.eq('series', ...)`）；新增 `STORE.seriesList()` 取得目前有哪些作品
- Supabase 端靠一個新的 view `exhibit_series`（見 `schema.sql`）取得去重後的
  作品清單，不會受 PostgREST 預設 1000 列上限影響 —— 去重的動作在資料庫做，
  view 回來的列數就是「有幾部作品」，不是「有幾件展品」
- 作品清單是下拉選單而不是 chips：作品數量沒有上限，chips 排版在手機上會
  捲得很長，下拉選單比較合適
- 找不到符合的作品時，空狀態文字會分別處理「分類找不到」跟「作品找不到」

---

## 已完成：團隊共用密碼 + 擁有者欄位

- **後台登入**新增 `authMode: 'shared'`（目前預設）：團隊共用一組密碼，
  但密碼雜湊存在資料庫、比對邏輯在資料庫的函式裡跑，前端看不到判斷式 ——
  比純前端密碼安全，又不用像各自 Supabase 帳號那樣每人開一個帳號。
  設定步驟在 `docs/SETUP.md` 第三節「方案 C」。
- **擁有者欄位**：後台登入後在「擁有者列」設定一次名字，之後這個瀏覽器
  上傳的展品都自動標記同一個擁有者，不用每批重填。存在 localStorage，
  隨時可以在後台按「設定／更換」改。上傳前沒設定會被擋下並跳出設定視窗。
  燈箱的展品詳細資訊（原本顯示「收錄日期」跟「尺寸」）改成顯示「擁有者」——
  收錄日期跟尺寸對訪客來說不是重要資訊，擁有者才是團隊展覽真正想呈現的。
  （尺寸資料本身還在，繼續用於卡片版面的 `aspect-ratio` 佔位，只是不再顯示
  給訪客看；後台管理列表仍會顯示日期，方便管理排序。）
