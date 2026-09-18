# 設定步驟：Supabase + Cloudinary

這份文件帶你把網站從「展示模式」接到真正的後端。
全程免費，不需要信用卡，大約 **20 分鐘**。

不想現在設定也沒關係 —— 網站在沒填任何設定時會自動跑展示模式，
用 108 件自動產生的佔位展品讓你先看完整個版面。

---

## 這套架構長什麼樣

```
          瀏覽器（你的訪客）
                 │
     ┌───────────┴────────────┐
     │                        │
     ▼                        ▼
  Cloudinary               Supabase
  （圖片 + CDN）           （資料庫）
  ─────────────            ──────────
  存實體圖檔                存文字資料
  自動壓縮 / 轉 WebP        title / series
  全球 CDN 加速             category / note
                            image_url ──┐
                                        │
                        指回 Cloudinary 的網址
```

**為什麼要拆成兩個服務？**
資料庫擅長存小小的文字、擅長篩選排序；圖床擅長存大檔案、擅長就近送到使用者面前。
各做各擅長的事，網站才會快。

**為什麼不用 Google Drive？**
Drive 的分享連結有每日流量上限，超過就整站圖片一起掛掉；而且它會擋跨網域載入、
會把圖片重新導向到一個會變動的網址。它是雲端硬碟，不是圖床。

---

## 一、Cloudinary（圖床 + CDN）

免費方案每月 25 credits，大約等於 **25 GB 流量 + 25 GB 儲存空間**。
以一個百來張圖的展覽來說，這個額度非常充裕。

### 1. 註冊

1. 前往 <https://cloudinary.com/users/register_free>
2. 用 Email 或 Google 帳號註冊
3. 註冊時會問你用途，隨便選（例如 Programmable Media）即可

### 2. 抄下 Cloud name

登入後在 Dashboard 首頁最上方就看得到：

```
Cloud name:  dxxxxxxxx      ← 抄這個
API Key:     123456789012   ← 用不到
API Secret:  ************   ← 千萬不要放進前端！
```

> **為什麼 API Secret 不能用？**
> 前端的所有程式碼使用者都下載得到。Secret 一旦寫進 config.js，
> 等於公開發放你帳號的完整控制權。下一步的 unsigned preset 就是為了避免這件事。

### 3. 建立 Unsigned upload preset

這一步是讓網頁能「不帶密鑰」直接上傳圖片的關鍵。

1. 右上角齒輪 **Settings** → 左側 **Upload** → 往下找到 **Upload presets**
2. 點 **Add upload preset**
3. 設定：

   | 欄位 | 填什麼 |
   |---|---|
   | Upload preset name | `galgame_expo_host`（自己取，記下來） |
   | Signing Mode | **Unsigned** ← 最重要 |
   | Folder | `galgame-expo` |

4. 建議一併打開的選項（都在同一頁往下捲）：

   | 選項 | 建議 | 原因 |
   |---|---|---|
   | Unique filename | 開啟 | 檔名相同的圖不會互相覆蓋 |
   | Overwrite | 關閉 | 避免誤覆蓋既有圖片 |
   | Auto-tagging / Backup | 關閉 | 會額外消耗 credits |

5. 按 **Save**

### 4. 限制上傳大小（選用，但建議）

同一頁可以設定 **Max file size**，填 `10000000`（10 MB）。
這樣就算 preset 網址外流，別人也不能拿你的帳號傳大檔。

### 5. 填進 config.js

打開 `assets/js/config.js`：

```js
cloudinary: {
  cloudName: 'dxxxxxxxx',              // ← 步驟 2 抄的
  uploadPreset: 'galgame_expo_host', // ← 步驟 3 取的名字
  folder: 'galgame-expo',
},
```

### 圖片轉檔是怎麼運作的

你只要存一份原圖，不同尺寸靠改網址就能拿到，Cloudinary 會即時產生並快取在 CDN：

```
原圖    https://res.cloudinary.com/dxxx/image/upload/v123/galgame-expo/a.jpg
卡片縮圖 https://res.cloudinary.com/dxxx/image/upload/w_600,f_auto,q_auto/v123/...
燈箱大圖 https://res.cloudinary.com/dxxx/image/upload/w_1800,f_auto,q_auto/v123/...
                                                     ▲
                                        只是在網址中間插了這一段
```

- `w_600` 寬度縮到 600px
- `f_auto` 瀏覽器支援 WebP/AVIF 就自動送更小的格式
- `q_auto` 自動挑肉眼看不出差別的壓縮率

實際效果：一張 4 MB 的原圖，卡片上只會載到大約 **40–80 KB**。
這就是為什麼 100 多張圖能捲得很順。這段邏輯在 `assets/js/cloudinary.js`。

---

## 二、Supabase（資料庫）

免費方案 500 MB 資料庫。我們只存文字，百來筆資料連 1 MB 都用不到。

> 注意：Supabase 免費專案在 **連續 7 天完全沒有任何請求** 之後會自動暫停，
> 到 Dashboard 點一下即可恢復。只要展覽有人在看就不會發生。

### 1. 建立專案

1. 前往 <https://supabase.com/dashboard> 註冊（可用 GitHub 帳號）
2. **New project**
3. 填寫：
   - **Name**：`galgame-expo`
   - **Database Password**：按產生器隨機產一組，**存到你的密碼管理器**
     （這是資料庫的主密碼，前端用不到，但之後要直連資料庫時會需要）
   - **Region**：選 **Northeast Asia (Tokyo)** 或 **Southeast Asia (Singapore)**，台灣連過去最快
4. 按 Create，等待約 2 分鐘

### 2. 建立資料表

1. 左側選單 → **SQL Editor** → **New query**
2. 打開專案裡的 `supabase/schema.sql`，**整個檔案複製貼上**
3. 按 **Run**（或 Ctrl+Enter）
4. 看到 `Success. No rows returned` 就完成了
5. 左側 **Table Editor** 應該能看到 `exhibits` 這張表

這個 SQL 檔會一次做完：建表、建索引（含模糊搜尋用的 pg_trgm）、
自動更新 `updated_at`、以及開啟 RLS 安全政策。

### 3. 抄下網址與金鑰

左側 **Project Settings**（齒輪）→ **API**：

```
Project URL:  https://abcdefghijklmn.supabase.co     ← 抄這個
Project API keys
  anon / public:  eyJhbGciOiJIUzI1NiIsInR5cCI6...    ← 抄這個
  service_role:   eyJhbGciOiJIUzI1NiIsInR5cCI6...    ← 絕對不要放進前端！
```

> **anon key 寫在前端是安全的嗎？**
> 是的，它本來就設計成公開的。它只代表「一個匿名訪客」，
> 能做什麼完全由資料庫的 RLS 政策決定。
> `service_role` 則會繞過所有 RLS，等於資料庫的萬能鑰匙，只能放在伺服器端。

### 4. 填進 config.js

```js
supabase: {
  url: 'https://abcdefghijklmn.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6...',
  table: 'exhibits',
  authMode: 'password',   // 或 'supabase'，見下一節
},
```

存檔重新整理首頁 —— 展示模式的黃色提示條會消失，
展品數變成 0（因為資料庫還是空的）。接著就可以去 `/admin.html` 上傳第一張圖了。

---

## 三、決定後台要鎖多緊

這是整個專案唯一需要你做決定的地方。請誠實評估這個展覽會不會被分享出去、
會不會有其他人一起上傳。

|  | 方案 C：團隊共用密碼 | 方案 A：各自帳號 | 方案 B：前端密碼 |
|---|---|---|---|
| 設定難度 | 中（多一步資料庫設定） | 中（要幫每人開帳號） | 最簡單 |
| 多人上傳 | ✅ 大家共用一組密碼 | ✅ 但每人要各自帳號 | ✅ 但不安全 |
| 真的擋得住懂 F12 的人 | ✅ | ✅ | ❌ |
| 換密碼要不要重新部署網站 | 不用（改資料庫就好） | 不適用 | 要（改完 config.js 要重新部署）|
| 適合 | **團隊一起上傳、不想開帳號**（目前預設） | 想知道是誰上傳的 | 純自己收藏，網址不外流 |

### 方案 C：團隊共用密碼，驗證在雲端（推薦，目前的預設）

**適合**：不只你一個人要上傳，團隊裡好幾個人共用同一組密碼。

原理：密碼雜湊存在資料庫裡，前端只是把輸入的密碼送去問「對不對」，
真正的比對邏輯在資料庫的函式裡執行，瀏覽器看不到、改不了 ——
比方案 B 安全，又不用像方案 A 那樣每個人開一個帳號。

1. Supabase → **Authentication** → **Sign In / Providers** → 找到 **Anonymous Sign-ins**，打開它。
   （不同版本的 Supabase 介面文字可能是「Allow anonymous sign-ins」，
   總之要找到「匿名登入」相關的開關並啟用 —— 這是方案 C 能運作的必要條件）
2. SQL Editor 執行 `supabase/schema.sql`（如果之前執行過舊版，重跑一次沒關係，
   建表跟建政策的語句都有防重複保護）
3. 設定共用密碼：SQL Editor 另外執行一次（把 `你的密碼` 換成團隊要用的密碼）：

   ```sql
   insert into public.admin_secret (id, password_hash)
   values (1, crypt('你的密碼', gen_salt('bf')))
   on conflict (id) do update
     set password_hash = excluded.password_hash,
         updated_at = now();
   ```

4. `config.js`：

   ```js
   supabase: { ..., authMode: 'shared' },
   ```

之後進 `/admin.html`，團隊裡任何人輸入這組密碼就能進去上傳。
**要換密碼**：只要重跑一次上面第 3 步的 SQL，不用改前端程式碼、不用重新部署。

> 這個模式底層用的是 Supabase 的「匿名登入」—— 密碼答對後，
> 瀏覽器會拿到一個真正的登入 session（不需要 email），
> 套用的正是方案 A 那組「只有登入者能寫入」的 RLS 政策，安全性是一樣的。

### 方案 A：Supabase 帳號登入（每人各自帳號，最適合想知道是誰上傳的）

**適合**：想清楚知道每筆展品是誰上傳的，或團隊成員的信任程度不一。

1. Supabase → **Authentication** → **Users** → **Add user**
   - 填每個人的 Email 和密碼
   - 勾選 **Auto Confirm User**（不然要收驗證信）
2. Supabase → **Authentication** → **Providers** → **Email**
   - 把 **Enable Signup** 關掉
   - 不關的話路人可以自己註冊帳號，那就等於沒鎖
3. `config.js`：

   ```js
   supabase: { ..., authMode: 'supabase' },
   ```

4. `schema.sql` 的「方案 A」政策預設就已經啟用了，不用再改

之後進 `/admin.html` 會要求輸入 Email + 密碼。

### 方案 B：前端密碼（最簡單，但只是門簾）

**適合**：純自己收藏、網址不會給別人、資料丟了也無所謂。

1. `config.js` 設 `authMode: 'password'`
2. 換掉預設密碼（預設是 `sakura2024`，一定要換）：
   - 打開網站任一頁，按 F12 開 Console
   - 執行：`await expoHashPassword('你想要的新密碼')`
   - 把印出來的那串 64 位元的十六進位字串，貼到 `config.js` 的 `adminPasswordHash`
3. 打開 `supabase/schema.sql` 最下面「方案 B」的三行，把註解 `--` 拿掉，在 SQL Editor 重跑一次

> ⚠️ **請認清這道鎖的真實強度**
> 密碼的比對發生在瀏覽器裡，任何人按 F12 就能看到判斷邏輯並直接跳過。
> 而且方案 B 的 RLS 等於開放寫入 —— 知道你網址的人可以用 anon key 直接新增或刪除資料。
> 只要這個網址會傳給第三個人，就請改用方案 C 或方案 A。

---

## 四、上傳第一批展品

1. 開 `/admin.html`，用你設定的方式登入
2. 把圖片拖進虛線框（可一次選多張，也可以直接 Ctrl+V 貼上截圖）
3. 每張圖各自填「展品名稱」（預設會帶入檔名，通常改一下就好）
4. 下面的「分類 / 作品名稱 / 角色 / 備註」會**套用到這一批全部的圖**
   - 所以建議一次傳「同一部作品的同一類週邊」，最省事
5. 按「上傳到展覽」，看著進度條跑完
6. 回首頁，展品就在牆上了

---

## 五、部署上線

三個平台都是免費的，選一個就好。

### Netlify（最快，不需要 Git）

1. 打開 <https://app.netlify.com/drop>
2. 把整個專案資料夾直接拖進網頁
3. 幾秒後就會給你一個網址

之後要更新，再拖一次就好。專案裡的 `netlify.toml` 已經設定好快取規則。

### Vercel

```bash
npm i -g vercel
cd "D:\claude工作區\Galgame週邊線上展覽"
vercel
```

一路按 Enter 即可。設定檔是 `vercel.json`。

### GitHub Pages

```bash
cd "D:\claude工作區\Galgame週邊線上展覽"
git init
git add .
git commit -m "Galgame 週邊線上展覽"
git branch -M main
git remote add origin https://github.com/<你的帳號>/<repo 名>.git
git push -u origin main
```

推上去之後到 repo 的 **Settings → Pages → Source** 選 **GitHub Actions**，
`.github/workflows/deploy-pages.yml` 會自動接手部署。

> **注意**：`config.js` 裡有你的 anon key 和 upload preset。
> 這兩個本來就是公開值，放進公開 repo 沒問題（前提是你已經照第三節設好 RLS）。
> 但 `service_role` key 和 Cloudinary 的 API Secret **永遠不要 commit**。

---

## 六、疑難排解

| 症狀 | 原因與解法 |
|---|---|
| 首頁一直是展示模式 | `config.js` 的 `supabase.url` 或 `anonKey` 沒填，或貼的時候多了空白／引號 |
| 「資料表 exhibits 不存在」 | `schema.sql` 還沒在 SQL Editor 執行過 |
| 上傳時「被 RLS 政策擋下」 | 方案 A / C：確認已登入；方案 B：`schema.sql` 最下面三行的註解沒拿掉 |
| 方案 C 登入說「function ... does not exist」 | `schema.sql` 最下面「方案 C」那段還沒在 SQL Editor 執行過 |
| 方案 C 登入說「Anonymous sign-ins are disabled」 | Supabase → Authentication → Providers 裡的匿名登入開關還沒打開 |
| 方案 C 密碼一直說不對 | 確認有先執行過「設定共用密碼」那段 SQL；密碼是即時輸入比對，不用先算雜湊 |
| 上傳時「Upload preset not found」 | preset 名字拼錯，或 Signing Mode 忘了選 Unsigned |
| 密碼永遠說不正確 | `adminPasswordHash` 要放 **SHA-256 雜湊**，不是明文密碼 |
| Console 說沒有 `crypto.subtle` | 用 `file://` 直接開檔案會這樣。要用 `http://localhost` 或正式網址（HTTPS） |
| 圖片破圖 | 開 F12 Network 看圖片網址回幾號。403 通常是 Cloudinary 的 preset 權限問題 |
| 手機上排版跑掉 | 先強制重新整理清快取（Ctrl+Shift+R）；還是有問題就把畫面截圖下來 |

### 本機預覽

不要用檔案總管直接雙擊 `index.html`（`file://` 會擋掉 `crypto.subtle`，後台會壞）。
請起一個本機伺服器：

```bash
cd "D:\claude工作區\Galgame週邊線上展覽"
npx serve .
# 或
python -m http.server 5173
```

然後開 <http://localhost:5173>。

---

## 額度會不會爆？

以一個 120 張圖、每月 2000 次瀏覽的展覽估算：

| 項目 | 用量 | 免費額度 | 佔比 |
|---|---|---|---|
| Cloudinary 儲存 | ~400 MB（原圖） | 25 GB | 2% |
| Cloudinary 流量 | ~3 GB/月 | 25 GB/月 | 12% |
| Supabase 資料庫 | < 1 MB | 500 MB | < 1% |
| Supabase 流量 | ~50 MB/月 | 5 GB/月 | 1% |

有很大的餘裕。真的開始逼近上限時，`config.js` 的 `ux.pageSize` 調小、
或把 `cloudinary.js` 裡的縮圖寬度從 600 調到 450，流量大概能再省三成。
