-- =============================================================================
-- 口袋中的夏末號 — Supabase 資料表與安全政策
-- -----------------------------------------------------------------------------
-- 用法：
--   1. 打開 Supabase Dashboard → 左側 SQL Editor → New query
--   2. 把這整個檔案貼上，按 Run
--   3. 完成後到 Table Editor 應該看得到 exhibits 這張表
--
-- 這個檔案可以重複執行（都有 if not exists / drop if exists 保護）。
-- =============================================================================


-- =============================================================================
-- 1. 資料表
-- =============================================================================
create table if not exists public.exhibits (
  id          uuid         primary key default gen_random_uuid(),

  -- 展品名稱（必填），例：「月見坂 雫 亞克力立牌」
  title       text         not null check (char_length(title) between 1 and 200),

  -- 社團 / 品牌，例：「ゆずソフト（柚子社）」「Key」。
  -- 這是展覽頁的主要篩選維度（比作品層級更適合整理這種橫跨多作品的收藏）。
  circle      text         check (char_length(circle) <= 120),

  -- 作品名稱，例：「白色相簿2」。比社團更細一層的資訊，選填。
  series      text         check (char_length(series) <= 200),

  -- 角色名稱
  -- character 在 SQL 裡是關鍵字，加上雙引號才不會踩到解析上的邊界情況
  "character" text        check (char_length("character") <= 120),

  -- 擁有者：這件收藏是誰的。團隊多人上傳時，上傳者登入後只設定一次，
  -- 之後這批全部自動掛同一個擁有者，不用每張圖都重填（見 admin.js）。
  owner       text         check (char_length(owner) <= 60),

  -- 分類 id，要跟 config.js 的 categories[].id 對得起來
  category    text         not null default 'other'
                           check (char_length(category) between 1 and 40),

  -- Cloudinary 的 CDN 網址（必填）
  image_url   text         not null check (image_url ~ '^https?://'),

  -- Cloudinary 的 public_id，之後要刪圖 / 換圖時會用到
  public_id   text,

  -- 原圖尺寸。存起來是為了讓前端在圖片載入前就佔好版面位置，
  -- 捲動時畫面不會跳動（CLS = 0）。
  width       integer      check (width  is null or width  > 0),
  height      integer      check (height is null or height > 0),

  -- 備註說明，顯示在燈箱下方的對話框
  note        text         check (char_length(note) <= 4000),

  created_at  timestamptz  not null default now(),
  updated_at  timestamptz  not null default now()
);


-- =============================================================================
-- 1.5 既有資料表的欄位遷移
-- -----------------------------------------------------------------------------
-- 如果你是第一次跑這份檔案，上面的 create table 早就把 owner 欄位建好了，
-- 這幾行等於沒做事。如果你的 exhibits 表是舊版本建的（沒有 owner 欄位），
-- 這裡會幫你補上，不會動到既有資料。可以放心重複執行。
-- =============================================================================
alter table public.exhibits add column if not exists owner text;
alter table public.exhibits
  drop constraint if exists exhibits_owner_check;
alter table public.exhibits
  add constraint exhibits_owner_check check (char_length(owner) <= 60);

alter table public.exhibits add column if not exists circle text;
alter table public.exhibits
  drop constraint if exists exhibits_circle_check;
alter table public.exhibits
  add constraint exhibits_circle_check check (char_length(circle) <= 120);


-- =============================================================================
-- 2. 索引
--    百來筆資料其實不建索引也很快，但加了不吃虧，之後長到幾千筆也不用改。
-- =============================================================================

-- 首頁預設就是「最新收錄」排序
create index if not exists exhibits_created_at_idx
  on public.exhibits (created_at desc);

-- 分類篩選
create index if not exists exhibits_category_idx
  on public.exhibits (category);

-- 跨欄位模糊搜尋（ilike '%keyword%'）。
-- 一般的 B-tree 索引對前後都有 % 的查詢沒用，要靠 pg_trgm 的 GIN 索引。
create extension if not exists pg_trgm;

-- 這是「運算式索引」——CREATE INDEX IF NOT EXISTS 只看名字，不會發現運算式
-- 內容變了（例如新增 owner 欄位），所以每次運算式有改動都要先 DROP 再重建。
drop index if exists exhibits_search_idx;

create index exhibits_search_idx
  on public.exhibits
  using gin (
    (coalesce(title, '') || ' ' ||
     coalesce(circle, '') || ' ' ||
     coalesce(series, '') || ' ' ||
     coalesce("character", '') || ' ' ||
     coalesce(owner, '') || ' ' ||
     coalesce(note, '')) gin_trgm_ops
  );

-- 擁有者不算常用篩選條件，但這欄之後很可能會拿來排序 / 統計，先建個陽春索引
create index if not exists exhibits_owner_idx
  on public.exhibits (owner);

-- 社團是展覽頁的主要篩選維度，建索引
create index if not exists exhibits_circle_idx
  on public.exhibits (circle);


-- =============================================================================
-- 2.5 篩選 / 建議用的清單 view
-- -----------------------------------------------------------------------------
-- 篩選列的下拉選單需要知道「目前有哪些社團 / 作品」。
-- 用 view 列出去重後的清單，前端查 view 就好，不用把整張 exhibits 表撈下來
-- 自己在瀏覽器裡去重（那樣資料一旦超過 PostgREST 預設的 1000 列上限就會漏掉）。
-- =============================================================================

-- 社團：展覽頁的主要篩選維度
create or replace view public.exhibit_circles as
  select distinct circle
  from public.exhibits
  where circle is not null and circle <> ''
  order by circle;

grant select on public.exhibit_circles to anon, authenticated;

-- 作品：不再是主要篩選維度，但上傳時的「作品名稱」建議還會用到
create or replace view public.exhibit_series as
  select distinct series
  from public.exhibits
  where series is not null and series <> ''
  order by series;

grant select on public.exhibit_series to anon, authenticated;


-- =============================================================================
-- 3. updated_at 自動更新
-- =============================================================================
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists exhibits_touch_updated_at on public.exhibits;

create trigger exhibits_touch_updated_at
  before update on public.exhibits
  for each row
  execute function public.touch_updated_at();


-- =============================================================================
-- 4. Row Level Security（真正的安全防線）
-- -----------------------------------------------------------------------------
-- 前端的密碼框只是「門簾」，任何人打開 F12 都能繞過，因為判斷在瀏覽器裡。
-- anon key 本來就是公開的，寫在 config.js 裡完全正常。
-- 真正決定「誰能寫入」的是這裡的 RLS 政策，它跑在 Supabase 的伺服器上。
--
-- 這個專案的登入方式固定是「團隊共用密碼」（見下面第 6 節）：
-- 密碼答對後，前端會拿到一個匿名但真實的登入 session，角色是 authenticated，
-- 下面的政策就是照這個角色判斷「誰能寫入」。
-- =============================================================================

alter table public.exhibits enable row level security;

-- 先清掉舊政策，避免重複執行時互相打架
drop policy if exists "公開可讀"     on public.exhibits;
drop policy if exists "登入者可新增" on public.exhibits;
drop policy if exists "登入者可修改" on public.exhibits;
drop policy if exists "登入者可刪除" on public.exhibits;

-- 展覽是給大家看的，讀取一律公開
create policy "公開可讀"
  on public.exhibits
  for select
  to anon, authenticated
  using (true);

-- 只有登入的人（答對共用密碼、換到匿名登入 session）能寫入
create policy "登入者可新增"
  on public.exhibits
  for insert
  to authenticated
  with check (true);

create policy "登入者可修改"
  on public.exhibits
  for update
  to authenticated
  using (true)
  with check (true);

create policy "登入者可刪除"
  on public.exhibits
  for delete
  to authenticated
  using (true);


-- =============================================================================
-- 5. 測試資料（選用）
--    想確認前端接得起來，可以把下面的註解拿掉跑一次，看首頁有沒有出現。
--    確認完記得把它刪掉：delete from public.exhibits where series = 'TEST';
-- =============================================================================

-- insert into public.exhibits (title, series, character, category, image_url, width, height, note)
-- values (
--   '測試展品',
--   'TEST',
--   'テスト',
--   'standee',
--   'https://res.cloudinary.com/demo/image/upload/sample.jpg',
--   864, 576,
--   '這是一筆測試資料，確認前端讀得到之後請刪掉。'
-- );


-- =============================================================================
-- 6. 團隊共用密碼登入
-- -----------------------------------------------------------------------------
-- 適合：不只你一個人要上傳，團隊裡好幾個人共用同一組密碼，
--       但又不想幫每個人開 Supabase 帳號。
--
-- 密碼雜湊存在這張表，比對邏輯在下面這個資料庫函式裡跑，瀏覽器只是把密碼
-- 送過去問「對不對」，真正的判斷你看不到、改不了（不是寫死在前端 JS 裡
-- 誰都能按 F12 看到判斷式跳過的那種）。
--
-- 原理：
--   1. 密碼答對 → 呼叫下面的 verify_upload_password() 函式，在資料庫裡比對
--   2. 答對 → 前端呼叫 supabase.auth.signInAnonymously()，
--             跟 Supabase 要一個「匿名但真實」的登入 session
--   3. 這個 session 的角色是 authenticated，套用的就是上面第 4 節的 RLS 政策
--
-- 要在 Supabase Dashboard 手動開一個開關才能用（Authentication → Providers →
-- Anonymous Sign-ins），見 docs/SETUP.md 的說明。
-- =============================================================================

-- Supabase 的 SQL Editor 預設會把新裝的 extension 裝進 "extensions" schema，
-- 不是 public。明確指定 schema，跟下面 security definer 函式的 search_path 對得上。
create extension if not exists pgcrypto with schema extensions;

-- 只存一列：目前生效的密碼雜湊
create table if not exists public.admin_secret (
  id            smallint primary key default 1,
  password_hash text not null,
  updated_at    timestamptz not null default now(),
  constraint admin_secret_single_row check (id = 1)
);

-- 這張表完全不開放給前端直接讀寫 —— 不加任何 policy，RLS 開著就等於全部擋住。
-- 唯一能碰到它的只有下面這個函式（security definer：用建立者的權限跑，繞過 RLS）。
alter table public.admin_secret enable row level security;

create or replace function public.verify_upload_password(pw text)
returns boolean
language sql
security definer
-- security definer 函式的 search_path 是寫死的，不會照抄呼叫者的設定，
-- 所以要把 pgcrypto 實際安裝的 schema（extensions）也加進來，
-- 不然 crypt() 會報 "function crypt(text, text) does not exist"。
set search_path = public, extensions
as $$
  select exists (
    select 1 from public.admin_secret
    where password_hash = crypt(pw, password_hash)
  );
$$;

-- 明確只給 anon / authenticated 執行權限，其餘什麼都不用開
revoke all on function public.verify_upload_password(text) from public;
grant execute on function public.verify_upload_password(text) to anon, authenticated;


-- ---- 設定／更換密碼 ---------------------------------------------------------
-- 第一次設定，或之後要換密碼，都執行這段（把 '你的密碼' 換掉再跑）：
--
--   insert into public.admin_secret (id, password_hash)
--   values (1, crypt('你的密碼', gen_salt('bf')))
--   on conflict (id) do update
--     set password_hash = excluded.password_hash,
--         updated_at = now();
--
-- 這段故意不直接執行（沒有預設密碼），你一定要自己跑一次設定真正要用的密碼。
