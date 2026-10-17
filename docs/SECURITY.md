# 資安檢查與設定（2026-10）

這份文件記錄網站做過的資安檢查、程式裡已經修好的項目，以及**只能在各服務後台手動設定**的項目。
程式碼的部分改完不代表全部安全：第 2 節的設定一定要做，尤其是 2.1。

---

## 1. 這次發現的問題與處理

| # | 嚴重度 | 問題 | 處理 |
|---|---|---|---|
| 1 | 嚴重 | **任何人都能新增、修改、刪除全部展品。** 舊流程是「先問密碼對不對 → 對了才在瀏覽器裡呼叫 `signInAnonymously()`」，但匿名登入只要有公開的 anon key 誰都能直接呼叫，而 RLS 只檢查「是否 authenticated」。密碼完全可以跳過。 | `supabase/security-hardening.sql`：新增上傳者名單 `uploaders`，密碼改由 `claim_uploader()` 在資料庫裡比對、答對才把該 session 記進名單；寫入政策改成必須是上傳者（30 天內答對過密碼）。前端 `store.js` / `admin.js` 跟著改流程。 |
| 2 | 高 | 猜密碼沒有次數限制（`verify_upload_password()` 任何人可無限呼叫）。 | 舊函式移除；`claim_uploader()` 同一使用者 15 分鐘最多錯 5 次、同一 IP 最多錯 20 次。 |
| 3 | 中 | 後台的 Supabase 函式庫從 CDN 載入「最新的 2.x」，CDN 或套件被入侵時，握有寫入權限的後台會直接執行惡意程式。 | 改用從 npm 官方套件取出、固定版本的 `assets/js/vendor/supabase-2.117.0.min.js`，放在自己網站上。 |
| 4 | 中 | 沒有 Content-Security-Policy，萬一出現注入漏洞，攻擊程式可以任意載入外部腳本、把資料送出去。 | `index.html`、`admin.html` 加上 CSP（只允許自己網站的腳本；圖片只允許 Cloudinary；連線只允許 Supabase 與 Cloudinary；嵌入只允許 FlipHTML5 與 Facebook，後台不允許任何嵌入）。 |
| 5 | 中 | 圖片網址欄位接受任何 `http(s)` 網址，有寫入權限的人可以塞外部網址（追蹤像素）或特殊字元。背景圖的 `url("…")` 是直接字串拼接。 | 資料庫限制只接受本站 Cloudinary 帳號的 https 網址、不得含空白引號括號；`background.js` 改成安全的 CSS 字串。 |
| 6 | 中 | 第三方嵌入（FlipHTML5 免費版有廣告、Facebook 外掛）可以把整個網站導到別的網址。 | 兩個 iframe 都加上 `sandbox`：能跑自己的程式、開新視窗，但不能導走本站。 |
| 7 | 低 | 後台可以被別的網站用 iframe 包起來做點擊劫持。GitHub Pages 不能設 `X-Frame-Options`。 | `admin.js` 偵測到被嵌入就隱藏畫面並跳出。 |
| 8 | 低 | 部署時把整個 repo 上傳到網站，`supabase/`、`docs/`、`tools/`、原始素材都公開可讀。 | GitHub Actions 只上傳 `index.html`、`admin.html`、`robots.txt`、`assets/`。 |
| 9 | 低 | 篩選清單的 view 以建立者身分執行、觸發器函式沒固定 `search_path`（Supabase 安全檢查會警告）。 | view 改 `security_invoker`，函式固定 `search_path`。 |

檢查過、目前沒問題的：
- 展品文字一律以純文字放進畫面；備註的網址轉連結會先跳脫整段文字，只產生 `http(s)` 連結，沒有 XSS。
- 搜尋字會先去掉 PostgREST 的特殊字元再組查詢。
- repo 與 git 歷史裡沒有 service_role key、Cloudinary API Secret 等機密。`config.js` 裡的 publishable key 與 unsigned preset 名稱本來就是公開值。
- 外部連結都有 `rel="noopener noreferrer"`。
- GitHub Actions 權限已是最小（contents: read、pages: write、id-token: write）。

---

## 2. 必須手動完成的設定

### 2.1 Supabase：執行資安 SQL（最重要，沒做的話問題 1、2 仍然存在）

1. Supabase Dashboard → SQL Editor → New query
2. 把 `supabase/security-hardening.sql` 整份貼上 → Run
3. 用檔案最下方的語法**重設一次共用密碼**（12 字以上、不要跟其他網站共用），並清空上傳者名單
4. 通知團隊用新密碼重新登入後台

### 2.2 Supabase：其他設定

- **Authentication → Rate Limits**：把匿名登入（anonymous sign-ins）每小時上限調低，例如 30。
- **Advisors → Security Advisor**：執行一次，確認沒有紅色警告。
- **清理舊的匿名帳號**（執行完 2.1 之後，可以定期跑）：
  ```sql
  delete from auth.users
  where is_anonymous
    and id not in (select user_id from public.uploaders)
    and created_at < now() - interval '7 days';
  ```
- 你的 Supabase 帳號開啟兩步驟驗證（Account → Security）。

### 2.3 Cloudinary（unsigned 上傳的限制）

unsigned preset 的名字寫在前端，**任何人都能用它把檔案上傳到你的 Cloudinary**（不會進資料庫、不會出現在網站，但會佔用額度）。程式端無法完全擋住，請在後台把能上傳的東西限縮到最小：

Settings → Upload → Upload presets → `galgame_expo_host`：
- Folder：固定 `galgame-expo`
- Allowed formats：`jpg, jpeg, png, webp, avif, heic`
- Max file size：例如 20 MB
- Incoming transformation：`c_limit,w_4000,h_4000`（原圖最大 4000px）
- Overwrite：關閉；Unique filename：開啟
- 確認沒有其他 unsigned preset（不用的刪掉）

Settings → Security：
- Restricted media types：勾選 **Fetched URL**（避免別人把你的帳號當成圖片轉址／代理）
- 帳號開啟兩步驟驗證

要完全杜絕陌生人上傳，需要改成「signed 上傳」：由伺服器（例如 Supabase Edge Function，先確認是上傳者）簽名後才能上傳。這需要部署後端程式，列為下一步。

### 2.4 GitHub

- 帳號開啟兩步驟驗證。
- Settings → Pages：確認 Enforce HTTPS 已勾選。

---

## 3. 平台限制（目前做不到的部分）

- GitHub Pages 不能設定 HTTP 回應標頭，所以 `frame-ancestors`、`X-Frame-Options`、HSTS 只能用 meta 或 JS 盡量補。若要完整的標頭，可以把網站搬到 Netlify / Vercel / Cloudflare Pages（repo 裡已有 `netlify.toml`、`vercel.json` 的標頭設定可參考）。
- 共用密碼的模式本身有上限：密碼外流就等於後台外流。人數變多時，建議改成每人一個 Supabase 帳號。
- 嵌入的 FlipHTML5 與 Facebook 內容由對方控制，網站只能用 sandbox 限制它們能做的事。
