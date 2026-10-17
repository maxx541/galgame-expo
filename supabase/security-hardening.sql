-- =============================================================================
-- 資安強化（2026-10）— 在 Supabase Dashboard → SQL Editor 整份貼上執行一次
-- -----------------------------------------------------------------------------
-- 修的問題：
--   舊版流程是「先問密碼對不對 → 對了才在瀏覽器裡呼叫 signInAnonymously()」。
--   但 signInAnonymously() 只要有公開的 anon key 誰都能直接呼叫，根本不用先答對密碼；
--   而舊版 RLS 只看「是不是 authenticated」，所以任何人都能拿到匿名 session，
--   然後新增、修改、刪除全部展品。密碼形同虛設。
--
-- 新的做法：
--   1. 先匿名登入（拿到自己的 user id）
--   2. 呼叫 claim_uploader(密碼)：密碼在資料庫裡比對，答對才把這個 user id 記進 uploaders
--   3. 寫入的 RLS 政策改成「必須在 uploaders 名單裡」（且 30 天內答對過密碼）
--   → 只拿到匿名 session、沒答對密碼的人，一筆都寫不進去。
--
--   另外加上：猜密碼次數限制、圖片網址只接受本站的 Cloudinary、view 改用呼叫者權限、
--   函式固定 search_path。
--
-- 這份檔案可以重複執行。執行完記得照最下面的說明「重設密碼」一次。
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. 上傳者名單：答對密碼的匿名使用者會被記在這裡
-- -----------------------------------------------------------------------------
create table if not exists public.uploaders (
  user_id    uuid        primary key references auth.users (id) on delete cascade,
  granted_at timestamptz not null default now()
);

-- 不加任何 policy：前端完全讀寫不到，只有下面的 security definer 函式能碰
alter table public.uploaders enable row level security;
revoke all on table public.uploaders from anon, authenticated;


-- -----------------------------------------------------------------------------
-- 2. 猜密碼紀錄（限制暴力破解）
-- -----------------------------------------------------------------------------
create table if not exists public.login_attempts (
  id      bigserial   primary key,
  user_id uuid,
  ip      text,
  at      timestamptz not null default now()
);

alter table public.login_attempts enable row level security;
revoke all on table public.login_attempts from anon, authenticated;

create index if not exists login_attempts_user_idx on public.login_attempts (user_id, at);
create index if not exists login_attempts_ip_idx   on public.login_attempts (ip, at);


-- -----------------------------------------------------------------------------
-- 3. 「我是不是上傳者」— RLS 政策與前端都用這個判斷
--    答對密碼後 30 天有效，過期要重新輸入密碼。
-- -----------------------------------------------------------------------------
create or replace function public.is_uploader()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.uploaders
    where user_id = auth.uid()
      and granted_at > now() - interval '30 days'
  );
$$;

revoke all on function public.is_uploader() from public;
grant execute on function public.is_uploader() to authenticated;


-- -----------------------------------------------------------------------------
-- 4. 輸入共用密碼，答對就把目前登入的匿名使用者加入上傳者名單
--    同一個使用者 15 分鐘內最多錯 5 次、同一個 IP 15 分鐘內最多錯 20 次，
--    超過就直接拒絕（連密碼都不比對）。
-- -----------------------------------------------------------------------------
create or replace function public.claim_uploader(pw text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_uid    uuid := auth.uid();
  v_ip     text;
  v_byuser integer;
  v_byip   integer;
  v_ok     boolean;
begin
  if v_uid is null then
    return false;
  end if;

  if pw is null or char_length(pw) = 0 or char_length(pw) > 200 then
    return false;
  end if;

  -- PostgREST 會把請求標頭放在 request.headers；取 x-forwarded-for 的第一個位址當來源 IP
  begin
    v_ip := trim(split_part(
      coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''),
      ',', 1));
  exception when others then
    v_ip := '';
  end;

  -- 舊紀錄留一天就夠
  delete from public.login_attempts where at < now() - interval '1 day';

  select count(*) into v_byuser
  from public.login_attempts
  where user_id = v_uid and at > now() - interval '15 minutes';

  select count(*) into v_byip
  from public.login_attempts
  where v_ip <> '' and ip = v_ip and at > now() - interval '15 minutes';

  if v_byuser >= 5 or v_byip >= 20 then
    raise exception 'too_many_attempts' using errcode = 'P0001';
  end if;

  select exists (
    select 1 from public.admin_secret
    where password_hash = crypt(pw, password_hash)
  ) into v_ok;

  if not v_ok then
    insert into public.login_attempts (user_id, ip) values (v_uid, v_ip);
    return false;
  end if;

  insert into public.uploaders (user_id) values (v_uid)
  on conflict (user_id) do update set granted_at = now();

  return true;
end;
$$;

revoke all on function public.claim_uploader(text) from public;
revoke all on function public.claim_uploader(text) from anon;
grant execute on function public.claim_uploader(text) to authenticated;

-- 舊的「只回答對不對」函式：任何人都能無限次呼叫來猜密碼，而且答對也不會綁定到誰，拿掉
drop function if exists public.verify_upload_password(text);


-- -----------------------------------------------------------------------------
-- 5. 寫入政策：必須是上傳者
-- -----------------------------------------------------------------------------
alter table public.exhibits enable row level security;

drop policy if exists "公開可讀"     on public.exhibits;
drop policy if exists "登入者可新增" on public.exhibits;
drop policy if exists "登入者可修改" on public.exhibits;
drop policy if exists "登入者可刪除" on public.exhibits;
drop policy if exists "上傳者可新增" on public.exhibits;
drop policy if exists "上傳者可修改" on public.exhibits;
drop policy if exists "上傳者可刪除" on public.exhibits;

create policy "公開可讀"
  on public.exhibits
  for select
  to anon, authenticated
  using (true);

create policy "上傳者可新增"
  on public.exhibits
  for insert
  to authenticated
  with check (public.is_uploader());

create policy "上傳者可修改"
  on public.exhibits
  for update
  to authenticated
  using (public.is_uploader())
  with check (public.is_uploader());

create policy "上傳者可刪除"
  on public.exhibits
  for delete
  to authenticated
  using (public.is_uploader());

-- 前端只需要讀；匿名訪客不該有任何寫入權限（RLS 之外再擋一層）
revoke insert, update, delete, truncate, references, trigger on table public.exhibits from anon;
revoke truncate, references, trigger on table public.exhibits from authenticated;


-- -----------------------------------------------------------------------------
-- 6. 資料內容限制
--    圖片網址只接受本站 Cloudinary 帳號底下的 https 網址，避免有人把展品圖
--    換成外部網址（追蹤像素、不當圖片、或拿來塞奇怪字元）。
--    檔名可以有中文，但不能有空白、引號、角括號、括號（這些是拿來插入程式碼的字元）。
--    換了 Cloudinary 帳號（cloud name）要記得一起改這裡。
-- -----------------------------------------------------------------------------
alter table public.exhibits drop constraint if exists exhibits_image_url_check;
alter table public.exhibits drop constraint if exists exhibits_image_url_cloudinary;
alter table public.exhibits
  add constraint exhibits_image_url_cloudinary
  check (image_url ~ '^https://res\.cloudinary\.com/zymfvyzu/image/upload/[^[:space:]"''<>()]+$');

alter table public.exhibits drop constraint if exists exhibits_public_id_check;
alter table public.exhibits
  add constraint exhibits_public_id_check
  check (public_id is null or (char_length(public_id) <= 300 and public_id ~ '^[^[:space:]"''<>()]+$'));

alter table public.exhibits drop constraint if exists exhibits_category_format;
alter table public.exhibits
  add constraint exhibits_category_format
  check (category ~ '^[a-z][a-z0-9_-]{0,39}$');

alter table public.exhibits drop constraint if exists exhibits_size_check;
alter table public.exhibits
  add constraint exhibits_size_check
  check ((width is null or width <= 20000) and (height is null or height <= 20000));


-- -----------------------------------------------------------------------------
-- 7. 篩選清單 view 改用呼叫者權限（不再以建立者身分繞過 RLS）
-- -----------------------------------------------------------------------------
alter view public.exhibit_circles set (security_invoker = true);
alter view public.exhibit_series  set (security_invoker = true);


-- -----------------------------------------------------------------------------
-- 8. 觸發器函式固定 search_path（Supabase 安全檢查會提醒這一項）
-- -----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- =============================================================================
-- 執行完之後：重設密碼（建議 12 字以上、不要跟其他網站共用）
-- -----------------------------------------------------------------------------
-- 把 '新的密碼' 換掉再執行。這段同時會清空上傳者名單，所有人都要用新密碼重新登入：
--
--   insert into public.admin_secret (id, password_hash)
--   values (1, crypt('新的密碼', gen_salt('bf', 10)))
--   on conflict (id) do update
--     set password_hash = excluded.password_hash,
--         updated_at = now();
--   delete from public.uploaders;
--
-- 之後每次換密碼都跑這段；有人離開團隊時也換一次。
-- =============================================================================
