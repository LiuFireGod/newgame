# GameHub 管理面板 - 数据库升级 SQL

在 Supabase 控制台执行以下 SQL（SQL Editor → New query → 粘贴 → Run）：

```sql
-- 1. 给 users 表添加「封禁」字段（默认不封禁）
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS banned boolean NOT NULL DEFAULT false;

-- 2. 给 users 表添加「管理员」字段（默认不是管理员）
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- 3. 给 users 表添加「个人简介」字段（云端资料同步必需）
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS bio text;

-- 4. 给 users 表添加「头像图片」字段（云端资料同步必需）
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar_img text;

-- 5.（可选）把当前已有管理员账号标记为管理员，这样即使改代码里的名单也不会丢权限
UPDATE public.users SET is_admin = true WHERE lname = 'asd1316947244';
```

执行完刷新管理后台页面即可使用「封禁 / 解封 / 设置管理员」功能。

> 说明：不执行这段 SQL 时，管理后台仍可使用统计、用户/帖子/评论查看与删除功能，只是封禁和管理员指派按钮会提示数据库未升级。
>
> 更新（2026-10-11）：第 3、4 条已在你的 Supabase 项目中执行成功（实测 PATCH users bio/avatar_img → 204 已打通）。若日后新建项目或重置数据库，请整段执行。

---

## 安全加固 SQL（2026-10-11 已全部在线上执行）

以下四段均已在本项目 Supabase 执行并实测通过；若日后重置数据库需按顺序整段执行。

```sql
-- ============ A. P0-1 提权防护 ============
-- 禁止匿名修改 is_admin/banned（触发器按执行角色放行 RPC 内部操作）
CREATE OR REPLACE FUNCTION protect_admin_fields()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.is_admin IS DISTINCT FROM OLD.is_admin) OR (NEW.banned IS DISTINCT FROM OLD.banned) THEN
    IF current_user NOT IN ('postgres','supabase_admin','service_role') THEN
      RAISE EXCEPTION '需要管理员密钥才能修改管理字段';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_protect_admin_fields ON users;
CREATE TRIGGER trg_protect_admin_fields BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION protect_admin_fields();

-- 禁止匿名删除用户
CREATE OR REPLACE FUNCTION protect_user_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF current_user NOT IN ('postgres','supabase_admin','service_role') THEN
    RAISE EXCEPTION '需要管理员密钥才能删除用户';
  END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS trg_protect_user_delete ON users;
CREATE TRIGGER trg_protect_user_delete BEFORE DELETE ON users
FOR EACH ROW EXECUTE FUNCTION protect_user_delete();

-- ============ B. P0-2 密码体系 ============
-- 撤销 password_hash 公开读写（表级权限改为按列授权）
REVOKE SELECT, UPDATE, DELETE ON public.users FROM anon, authenticated;
GRANT SELECT (lname, name, avatar_color, bio, avatar_img, uid, is_admin, banned, created_at) ON public.users TO anon, authenticated;
GRANT UPDATE (name, avatar_color, bio, avatar_img) ON public.users TO anon, authenticated;
GRANT INSERT ON public.users TO anon, authenticated;

-- 登录验证 RPC（哈希比对在服务端完成，password_hash 永不下发；旧 djb2 哈希登录成功后自动迁移）
CREATE OR REPLACE FUNCTION public.login_check(p_lname text, p_hash text, p_hash_legacy text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u public.users%ROWTYPE; migrated boolean := false;
BEGIN
  SELECT * INTO u FROM public.users WHERE lname = p_lname LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_user'); END IF;
  IF u.password_hash IS DISTINCT FROM p_hash AND u.password_hash IS DISTINCT FROM p_hash_legacy THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_pass');
  END IF;
  IF u.banned = true THEN RETURN jsonb_build_object('ok', false, 'reason', 'banned'); END IF;
  IF u.password_hash = p_hash_legacy AND u.password_hash NOT LIKE 'pbkdf2$%' THEN
    UPDATE public.users SET password_hash = p_hash WHERE lname = p_lname; migrated := true;
  END IF;
  RETURN jsonb_build_object('ok', true, 'lname', u.lname, 'name', u.name, 'is_admin', u.is_admin,
    'banned', u.banned, 'avatar_color', u.avatar_color, 'bio', u.bio, 'avatar_img', u.avatar_img,
    'uid', u.uid, 'migrated', migrated);
END $$;
GRANT EXECUTE ON FUNCTION public.login_check(text,text,text) TO anon, authenticated;

-- 修改密码 RPC（需验证旧密码；新哈希由前端 PBKDF2 生成）
CREATE OR REPLACE FUNCTION public.change_password(p_lname text, p_old text, p_old_legacy text, p_new text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.users SET password_hash = p_new
  WHERE lname = p_lname AND (password_hash = p_old OR password_hash = p_old_legacy);
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false); END IF;
  RETURN jsonb_build_object('ok', true);
END $$;
GRANT EXECUTE ON FUNCTION public.change_password(text,text,text,text) TO anon, authenticated;

-- ============ C. 管理 RPC（密钥在函数内校验，SECRET 仅存在于管理后台页面） ============
-- ⚠️ 安全说明（2026-10-11）：历史明文密钥已从本文档移除。若在全新数据库执行本段，
--    必须先将下方所有 __ADMIN_SECRET__ 替换为第 I 节生成的新密钥后再执行；切勿使用历史明文。
-- SECRET: __ADMIN_SECRET__（执行前替换）
CREATE OR REPLACE FUNCTION public.admin_set_admin(p_lname text, p_admin boolean, p_secret text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_secret <> '__ADMIN_SECRET__' THEN RAISE EXCEPTION '管理员密钥错误'; END IF;
  UPDATE public.users SET is_admin = p_admin WHERE lname = p_lname;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false); END IF;
  RETURN jsonb_build_object('ok', true);
END $$;
CREATE OR REPLACE FUNCTION public.admin_set_banned(p_lname text, p_banned boolean, p_secret text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_secret <> '__ADMIN_SECRET__' THEN RAISE EXCEPTION '管理员密钥错误'; END IF;
  UPDATE public.users SET banned = p_banned WHERE lname = p_lname;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false); END IF;
  RETURN jsonb_build_object('ok', true);
END $$;
CREATE OR REPLACE FUNCTION public.admin_delete_user(p_lname text, p_secret text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_secret <> '__ADMIN_SECRET__' THEN RAISE EXCEPTION '管理员密钥错误'; END IF;
  DELETE FROM public.users WHERE lname = p_lname;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false); END IF;
  RETURN jsonb_build_object('ok', true);
END $$;
CREATE OR REPLACE FUNCTION public.admin_delete_user_content(p_lname text, p_name text, p_secret text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_secret <> '__ADMIN_SECRET__' THEN RAISE EXCEPTION '管理员密钥错误'; END IF;
  DELETE FROM public.posts WHERE lname = p_lname OR user_name = p_name;
  DELETE FROM public.comments WHERE lname = p_lname OR user_name = p_name;
  DELETE FROM public.online_users WHERE lname = p_lname OR user_name = p_name;
  RETURN jsonb_build_object('ok', true);
END $$;
CREATE OR REPLACE FUNCTION public.admin_delete_post(p_id bigint, p_secret text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_secret <> '__ADMIN_SECRET__' THEN RAISE EXCEPTION '管理员密钥错误'; END IF;
  DELETE FROM public.comments WHERE post_id = p_id;
  DELETE FROM public.posts WHERE id = p_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false); END IF;
  RETURN jsonb_build_object('ok', true);
END $$;
CREATE OR REPLACE FUNCTION public.admin_delete_comment(p_id bigint, p_secret text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_secret <> '__ADMIN_SECRET__' THEN RAISE EXCEPTION '管理员密钥错误'; END IF;
  DELETE FROM public.comments WHERE id = p_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false); END IF;
  RETURN jsonb_build_object('ok', true);
END $$;
GRANT EXECUTE ON FUNCTION public.admin_set_admin(text,boolean,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_banned(text,boolean,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_user_content(text,text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_post(bigint,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_comment(bigint,text) TO anon, authenticated;

-- ============ D. P2 数据完整性 ============
-- 帖子：匿名仅可发布与点赞，删除/改内容需管理员
CREATE OR REPLACE FUNCTION protect_posts_write()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_user NOT IN ('postgres','supabase_admin','service_role') THEN RAISE EXCEPTION '删除帖子需要管理员权限'; END IF;
    RETURN OLD;
  END IF;
  IF NEW.user_name IS DISTINCT FROM OLD.user_name OR NEW.lname IS DISTINCT FROM OLD.lname
     OR NEW.game IS DISTINCT FROM OLD.game OR NEW.title IS DISTINCT FROM OLD.title
     OR NEW.content IS DISTINCT FROM OLD.content OR NEW.image IS DISTINCT FROM OLD.image THEN
    IF current_user NOT IN ('postgres','supabase_admin','service_role') THEN RAISE EXCEPTION '修改帖子内容需要管理员权限'; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_protect_posts_write ON posts;
CREATE TRIGGER trg_protect_posts_write BEFORE UPDATE OR DELETE ON posts FOR EACH ROW EXECUTE FUNCTION protect_posts_write();

-- 评论：匿名仅可发布，修改/删除需管理员
CREATE OR REPLACE FUNCTION protect_comments_write()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF current_user NOT IN ('postgres','supabase_admin','service_role') THEN RAISE EXCEPTION '修改评论需要管理员权限'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_protect_comments_write ON comments;
CREATE TRIGGER trg_protect_comments_write BEFORE UPDATE OR DELETE ON comments FOR EACH ROW EXECUTE FUNCTION protect_comments_write();

REVOKE DELETE ON public.posts FROM anon, authenticated;
REVOKE DELETE, UPDATE ON public.comments FROM anon, authenticated;
```

---

## E. 帖子作者编辑/删除权限（2026-10-11 已执行）

作者凭发帖时生成的随机凭证（edit_token，仅存本机，云端该列不可公开读取）编辑/删除自己的帖子；管理员不受限。旧帖无凭证，仅管理员可管理。

```sql
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS edit_token text;
REVOKE SELECT (edit_token) ON public.posts FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.author_edit_post(p_id bigint, p_token text, p_title text, p_content text, p_image text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.posts%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.posts WHERE id = p_id LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_post'); END IF;
  IF r.edit_token IS NULL OR r.edit_token <> p_token THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_perm');
  END IF;
  UPDATE public.posts SET title = p_title, content = p_content, image = p_image WHERE id = p_id;
  RETURN jsonb_build_object('ok', true);
END $$;
GRANT EXECUTE ON FUNCTION public.author_edit_post(bigint,text,text,text,text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.author_delete_post(p_id bigint, p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.posts%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.posts WHERE id = p_id LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_post'); END IF;
  IF r.edit_token IS NULL OR r.edit_token <> p_token THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_perm');
  END IF;
  DELETE FROM public.comments WHERE post_id = p_id;
  DELETE FROM public.posts WHERE id = p_id;
  RETURN jsonb_build_object('ok', true);
END $$;
GRANT EXECUTE ON FUNCTION public.author_delete_post(bigint,text) TO anon, authenticated;
```

---

## F. UID 连续分配修复（2026-10-11 已执行）

修复新账号拿到 999998 乱号的问题：UID 改由**服务端 RPC 原子分配**（连续补空号），前端不再用时间戳兜底凑号。

```sql
CREATE OR REPLACE FUNCTION public.next_uid()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer := 0;
BEGIN
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE uid = lpad(n::text, 6, '0')) THEN
      RETURN lpad(n::text, 6, '0');
    END IF;
    n := n + 1;
    IF n > 99999999 THEN RAISE EXCEPTION 'UID 编号已耗尽'; END IF;
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.next_uid() TO anon, authenticated;

-- 修正已产生的乱号：999998 → 000003（最小空号）
UPDATE public.users SET uid = '000003' WHERE uid = '999998';
```

---

## G. 安全加固第二轮（2026-10-11 已执行）

对应漏洞清单：邀请码泄露（URL 敏感信息）、登录限流、存档防篡改（IDOR）。

```sql
-- 8. 随机邀请码：users 加 invite_code 列（不再用账号名）
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS invite_code text;
UPDATE public.users SET invite_code = upper(substr(md5(random()::text), 1, 8))
WHERE invite_code IS NULL OR invite_code = '';
CREATE UNIQUE INDEX IF NOT EXISTS users_invite_code_key ON public.users (invite_code);
GRANT SELECT (invite_code) ON public.users TO anon, authenticated;

-- 7. 登录限流：失败 5 次锁 15 分钟（按账号，RPC 内实现）
CREATE TABLE IF NOT EXISTS public.login_attempts (
  lname text PRIMARY KEY,
  fails integer NOT NULL DEFAULT 0,
  locked_until bigint NOT NULL DEFAULT 0
);
REVOKE ALL ON public.login_attempts FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.login_check(p_lname text, p_hash text, p_hash_legacy text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u public.users%ROWTYPE; la public.login_attempts%ROWTYPE; now_ms bigint := floor(extract(epoch from clock_timestamp())*1000);
BEGIN
  SELECT * INTO la FROM public.login_attempts WHERE lname = p_lname LIMIT 1;
  IF la.locked_until > now_ms THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'locked', 'retry_after', (la.locked_until - now_ms + 999) / 1000);
  END IF;
  SELECT * INTO u FROM public.users WHERE lname = p_lname LIMIT 1;
  IF NOT FOUND THEN
    INSERT INTO public.login_attempts(lname, fails, locked_until) VALUES (p_lname, 1, 0)
    ON CONFLICT (lname) DO UPDATE SET fails = login_attempts.fails + 1;
    RETURN jsonb_build_object('ok', false, 'reason', 'no_user');
  END IF;
  IF u.password_hash IS DISTINCT FROM p_hash AND u.password_hash IS DISTINCT FROM p_hash_legacy THEN
    IF la.fails + 1 >= 5 THEN
      INSERT INTO public.login_attempts(lname, fails, locked_until) VALUES (p_lname, 0, now_ms + 15*60*1000)
      ON CONFLICT (lname) DO UPDATE SET fails = 0, locked_until = now_ms + 15*60*1000;
      RETURN jsonb_build_object('ok', false, 'reason', 'locked', 'retry_after', 900);
    END IF;
    INSERT INTO public.login_attempts(lname, fails, locked_until) VALUES (p_lname, 1, 0)
    ON CONFLICT (lname) DO UPDATE SET fails = login_attempts.fails + 1;
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_pass');
  END IF;
  IF u.banned = true THEN RETURN jsonb_build_object('ok', false, 'reason', 'banned'); END IF;
  IF u.password_hash = p_hash_legacy AND u.password_hash NOT LIKE 'pbkdf2$%' THEN
    UPDATE public.users SET password_hash = p_hash WHERE lname = p_lname;
  END IF;
  DELETE FROM public.login_attempts WHERE lname = p_lname;
  RETURN jsonb_build_object('ok', true, 'lname', u.lname, 'name', u.name, 'is_admin', u.is_admin,
    'banned', u.banned, 'avatar_color', u.avatar_color, 'bio', u.bio, 'avatar_img', u.avatar_img,
    'uid', u.uid, 'invite_code', u.invite_code, 'migrated', (u.password_hash = p_hash_legacy AND u.password_hash NOT LIKE 'pbkdf2$%'));
END $$;
GRANT EXECUTE ON FUNCTION public.login_check(text,text,text) TO anon, authenticated;

-- 6. 存档防篡改：game_saves 加 save_token，匿名直连禁 PATCH/DELETE，更新走 save_game RPC
ALTER TABLE public.game_saves ADD COLUMN IF NOT EXISTS save_token text;
CREATE OR REPLACE FUNCTION protect_game_saves_write()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF current_user NOT IN ('postgres','supabase_admin','service_role') THEN
    RAISE EXCEPTION '修改/删除存档需通过存档凭证（save_game）';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_protect_game_saves_write ON game_saves;
CREATE TRIGGER trg_protect_game_saves_write BEFORE UPDATE OR DELETE ON game_saves
FOR EACH ROW EXECUTE FUNCTION protect_game_saves_write();

CREATE OR REPLACE FUNCTION public.save_game(p_user_name text, p_token text, p_save_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.game_saves%ROWTYPE; new_token text;
BEGIN
  SELECT * INTO r FROM public.game_saves WHERE user_name = p_user_name LIMIT 1;
  IF FOUND THEN
    IF r.save_token IS NULL OR r.save_token <> p_token THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'no_perm');
    END IF;
    UPDATE public.game_saves SET save_data = p_save_data WHERE user_name = p_user_name;
    RETURN jsonb_build_object('ok', true, 'token', p_token);
  END IF;
  new_token := 's' || substr(md5(random()::text), 1, 20);
  INSERT INTO public.game_saves(user_name, save_data, save_token) VALUES (p_user_name, p_save_data, new_token);
  RETURN jsonb_build_object('ok', true, 'token', new_token);
END $$;
GRANT EXECUTE ON FUNCTION public.save_game(text,text,jsonb) TO anon, authenticated;
-- save_token 不可公开读（撤销表级 SELECT 后按列授权）
REVOKE SELECT ON public.game_saves FROM anon, authenticated;
GRANT SELECT (user_name, save_data) ON public.game_saves TO anon, authenticated;
```

---

## H. get_login_salt 补建（2026-10-11 修复登录）

**背景**：新版前端登录/改密依赖 `get_login_salt` RPC 读取账号的 PBKDF2 盐来重算哈希，但 A–G 各批 SQL 均未定义该函数，导致密码登录在取盐步骤直接失败（提示"注册/登录失败，请重试"）。**必须在 Supabase 控制台执行以下 SQL 后，密码登录才能恢复。**

```sql
CREATE OR REPLACE FUNCTION public.get_login_salt(p_lname text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u public.users%ROWTYPE; parts text[];
BEGIN
  SELECT * INTO u FROM public.users WHERE lname = p_lname LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('found', false); END IF;
  parts := string_to_array(u.password_hash, '$');
  IF array_length(parts, 1) = 4 AND parts[1] = 'pbkdf2' AND parts[2] ~ '^\d+$' THEN
    RETURN jsonb_build_object('found', true, 'pbkdf2', true, 'salt', parts[3], 'iter', parts[2]::int);
  END IF;
  RETURN jsonb_build_object('found', true, 'pbkdf2', false);
END $$;
GRANT EXECUTE ON FUNCTION public.get_login_salt(text) TO anon, authenticated;
```

> 说明：旧账号（password_hash 为旧 djb2 格式）执行后返回 `pbkdf2:false`，登录时走 login_check 的 legacy 兼容分支并自动迁移；新账号（pbkdf2 格式）返回库中盐，前端重算后等值匹配。两种情况均可恢复登录。

---

## I. P0–P2 修复 SQL（2026-10-11，**待执行**）

> 与新版前端代码配套。**必须先按顺序整段执行本节的 SQL，再使用新版页面**，否则点赞/在线/切换账号等功能会提示云端未升级。
> 每段均幂等，可重复执行。

### I.1 轮换管理密钥（历史明文已泄露，务必执行）

**操作**：把下方 `'<在此填入新密钥>'` 替换为你自己生成的新密钥（推荐 32 位随机十六进制），然后执行本段。执行后旧密钥全部失效；管理后台打开时输入新密钥即可。切勿把新密钥写回本文件。

```sql
DO $$
DECLARE s text := '<在此填入新密钥>';  -- ← 只改这一行
BEGIN
  EXECUTE format($f$
    CREATE OR REPLACE FUNCTION public.admin_set_admin(p_lname text, p_admin boolean, p_secret text)
    RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $b$
    BEGIN
      IF p_secret <> %L THEN RAISE EXCEPTION '管理员密钥错误'; END IF;
      UPDATE public.users SET is_admin = p_admin WHERE lname = p_lname;
      IF NOT FOUND THEN RETURN jsonb_build_object('ok', false); END IF;
      RETURN jsonb_build_object('ok', true);
    END $b$; $f$, s);
  EXECUTE format($f$
    CREATE OR REPLACE FUNCTION public.admin_set_banned(p_lname text, p_banned boolean, p_secret text)
    RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $b$
    BEGIN
      IF p_secret <> %L THEN RAISE EXCEPTION '管理员密钥错误'; END IF;
      UPDATE public.users SET banned = p_banned WHERE lname = p_lname;
      IF NOT FOUND THEN RETURN jsonb_build_object('ok', false); END IF;
      RETURN jsonb_build_object('ok', true);
    END $b$; $f$, s);
  EXECUTE format($f$
    CREATE OR REPLACE FUNCTION public.admin_delete_user(p_lname text, p_secret text)
    RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $b$
    BEGIN
      IF p_secret <> %L THEN RAISE EXCEPTION '管理员密钥错误'; END IF;
      DELETE FROM public.users WHERE lname = p_lname;
      IF NOT FOUND THEN RETURN jsonb_build_object('ok', false); END IF;
      RETURN jsonb_build_object('ok', true);
    END $b$; $f$, s);
  EXECUTE format($f$
    CREATE OR REPLACE FUNCTION public.admin_delete_user_content(p_lname text, p_name text, p_secret text)
    RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $b$
    BEGIN
      IF p_secret <> %L THEN RAISE EXCEPTION '管理员密钥错误'; END IF;
      DELETE FROM public.posts WHERE lname = p_lname OR user_name = p_name;
      DELETE FROM public.comments WHERE lname = p_lname OR user_name = p_name;
      DELETE FROM public.online_users WHERE lname = p_lname OR user_name = p_name;
      RETURN jsonb_build_object('ok', true);
    END $b$; $f$, s);
  EXECUTE format($f$
    CREATE OR REPLACE FUNCTION public.admin_delete_post(p_id bigint, p_secret text)
    RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $b$
    BEGIN
      IF p_secret <> %L THEN RAISE EXCEPTION '管理员密钥错误'; END IF;
      DELETE FROM public.comments WHERE post_id = p_id;
      DELETE FROM public.posts WHERE id = p_id;
      IF NOT FOUND THEN RETURN jsonb_build_object('ok', false); END IF;
      RETURN jsonb_build_object('ok', true);
    END $b$; $f$, s);
  EXECUTE format($f$
    CREATE OR REPLACE FUNCTION public.admin_delete_comment(p_id bigint, p_secret text)
    RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $b$
    BEGIN
      IF p_secret <> %L THEN RAISE EXCEPTION '管理员密钥错误'; END IF;
      DELETE FROM public.comments WHERE id = p_id;
      IF NOT FOUND THEN RETURN jsonb_build_object('ok', false); END IF;
      RETURN jsonb_build_object('ok', true);
    END $b$; $f$, s);
  EXECUTE format($f$
    CREATE OR REPLACE FUNCTION public.admin_reset_password(p_lname text, p_new_hash text, p_secret text)
    RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $b$
    BEGIN
      IF p_secret <> %L THEN RAISE EXCEPTION '管理员密钥错误'; END IF;
      UPDATE public.users SET password_hash = p_new_hash, auth_tokens = '{}'::jsonb WHERE lname = p_lname;
      IF NOT FOUND THEN RETURN jsonb_build_object('ok', false); END IF;
      DELETE FROM public.login_attempts WHERE lname = p_lname;
      RETURN jsonb_build_object('ok', true);
    END $b$; $f$, s);
  EXECUTE format($f$
    CREATE OR REPLACE FUNCTION public.admin_list_users(p_secret text)
    RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $b$
    DECLARE rows jsonb;
    BEGIN
      IF p_secret <> %L THEN RAISE EXCEPTION '管理员密钥错误'; END IF;
      SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO rows FROM (
        SELECT lname, name, uid, is_admin, banned, bio, invite_code, created_at,
          CASE WHEN password_hash LIKE 'pbkdf2$%%' THEN 'pbkdf2'
               WHEN password_hash IS NULL OR password_hash = '' THEN 'none'
               ELSE 'legacy' END AS password_format,
          left(split_part(coalesce(password_hash,''), '$', 4), 6) AS password_prefix
        FROM public.users ORDER BY created_at DESC
      ) x;
      RETURN rows;
    END $b$; $f$, s);
  EXECUTE format($f$
    GRANT EXECUTE ON FUNCTION public.admin_set_admin(text,boolean,text) TO anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.admin_set_banned(text,boolean,text) TO anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.admin_delete_user(text,text) TO anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.admin_delete_user_content(text,text,text) TO anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.admin_delete_post(bigint,text) TO anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.admin_delete_comment(bigint,text) TO anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.admin_reset_password(text,text,text) TO anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.admin_list_users(text) TO anon, authenticated;
    $f$);
END $$;
```

### I.2 本机会话令牌（登录/切换/点赞/在线改用令牌，不再依赖本地密码哈希）

```sql
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS auth_tokens jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 登录：校验通过后签发新会话令牌，保留最近 20 个（多设备）；其余行为与 G 节一致
CREATE OR REPLACE FUNCTION public.login_check(p_lname text, p_hash text, p_hash_legacy text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u public.users%ROWTYPE; la public.login_attempts%ROWTYPE;
        now_ms bigint := floor(extract(epoch from clock_timestamp())*1000);
        new_token text;
BEGIN
  SELECT * INTO la FROM public.login_attempts WHERE lname = p_lname LIMIT 1;
  IF la.locked_until > now_ms THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'locked', 'retry_after', (la.locked_until - now_ms + 999) / 1000);
  END IF;
  SELECT * INTO u FROM public.users WHERE lname = p_lname LIMIT 1;
  IF NOT FOUND THEN
    INSERT INTO public.login_attempts(lname, fails, locked_until) VALUES (p_lname, 1, 0)
    ON CONFLICT (lname) DO UPDATE SET fails = login_attempts.fails + 1;
    RETURN jsonb_build_object('ok', false, 'reason', 'no_user');
  END IF;
  IF u.password_hash IS DISTINCT FROM p_hash AND u.password_hash IS DISTINCT FROM p_hash_legacy THEN
    IF la.fails + 1 >= 5 THEN
      INSERT INTO public.login_attempts(lname, fails, locked_until) VALUES (p_lname, 0, now_ms + 15*60*1000)
      ON CONFLICT (lname) DO UPDATE SET fails = 0, locked_until = now_ms + 15*60*1000;
      RETURN jsonb_build_object('ok', false, 'reason', 'locked', 'retry_after', 900);
    END IF;
    INSERT INTO public.login_attempts(lname, fails, locked_until) VALUES (p_lname, 1, 0)
    ON CONFLICT (lname) DO UPDATE SET fails = login_attempts.fails + 1;
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_pass');
  END IF;
  IF u.banned = true THEN RETURN jsonb_build_object('ok', false, 'reason', 'banned'); END IF;
  IF u.password_hash = p_hash_legacy AND u.password_hash NOT LIKE 'pbkdf2$%' THEN
    UPDATE public.users SET password_hash = p_hash WHERE lname = p_lname;
  END IF;
  DELETE FROM public.login_attempts WHERE lname = p_lname;
  new_token := 't' || substr(md5(random()::text || clock_timestamp()::text), 1, 32);
  u.auth_tokens := coalesce(u.auth_tokens, '{}'::jsonb) || jsonb_build_object(new_token, now_ms::text);
  SELECT coalesce(jsonb_object_agg(k, v), '{}'::jsonb) INTO u.auth_tokens FROM (
    SELECT k, v FROM jsonb_each_text(u.auth_tokens) ORDER BY v::bigint DESC LIMIT 20
  ) t;
  UPDATE public.users SET auth_tokens = u.auth_tokens WHERE lname = p_lname;
  RETURN jsonb_build_object('ok', true, 'lname', u.lname, 'name', u.name, 'is_admin', u.is_admin,
    'banned', u.banned, 'avatar_color', u.avatar_color, 'bio', u.bio, 'avatar_img', u.avatar_img,
    'uid', u.uid, 'invite_code', u.invite_code, 'token', new_token,
    'migrated', (u.password_hash = p_hash_legacy AND u.password_hash NOT LIKE 'pbkdf2$%'));
END $$;

-- 令牌校验：多账号一键切换用（本地不再保存密码哈希）
CREATE OR REPLACE FUNCTION public.verify_token(p_lname text, p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u public.users%ROWTYPE;
BEGIN
  SELECT * INTO u FROM public.users WHERE lname = p_lname LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_user'); END IF;
  IF u.auth_tokens IS NULL OR u.auth_tokens->>p_token IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_token'); END IF;
  IF u.banned = true THEN RETURN jsonb_build_object('ok', false, 'reason', 'banned'); END IF;
  RETURN jsonb_build_object('ok', true, 'lname', u.lname, 'name', u.name, 'is_admin', u.is_admin,
    'banned', u.banned, 'avatar_color', u.avatar_color, 'bio', u.bio, 'avatar_img', u.avatar_img,
    'uid', u.uid, 'invite_code', u.invite_code);
END $$;
GRANT EXECUTE ON FUNCTION public.verify_token(text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.login_check(text,text,text) TO anon, authenticated;

-- 修改密码：校验旧密码后写入新哈希，并轮换全部会话令牌（其他设备下线），返回当前设备新令牌
CREATE OR REPLACE FUNCTION public.change_password(p_lname text, p_old text, p_old_legacy text, p_new text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_token text := 't' || substr(md5(random()::text || clock_timestamp()::text), 1, 32);
BEGIN
  UPDATE public.users SET password_hash = p_new,
    auth_tokens = jsonb_build_object(new_token, floor(extract(epoch from clock_timestamp())*1000)::text)
  WHERE lname = p_lname AND (password_hash = p_old OR password_hash = p_old_legacy);
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false); END IF;
  RETURN jsonb_build_object('ok', true, 'token', new_token);
END $$;
GRANT EXECUTE ON FUNCTION public.change_password(text,text,text,text) TO anon, authenticated;
```

### I.3 点赞防刷（每人每帖限一赞，计数只允许 RPC 修改）

```sql
CREATE TABLE IF NOT EXISTS public.post_likes (
  post_id bigint NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  lname text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, lname)
);
REVOKE ALL ON public.post_likes FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.like_post(p_post_id bigint, p_lname text, p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u public.users%ROWTYPE; new_count bigint;
BEGIN
  SELECT * INTO u FROM public.users WHERE lname = p_lname LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_user'); END IF;
  IF u.auth_tokens IS NULL OR u.auth_tokens->>p_token IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_perm'); END IF;
  IF u.banned = true THEN RETURN jsonb_build_object('ok', false, 'reason', 'banned'); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.post_likes WHERE post_id = p_post_id AND lname = p_lname) THEN
    INSERT INTO public.post_likes (post_id, lname) VALUES (p_post_id, p_lname);
    UPDATE public.posts SET likes = likes + 1 WHERE id = p_post_id;
  END IF;
  SELECT coalesce(likes, 0) INTO new_count FROM public.posts WHERE id = p_post_id;
  RETURN jsonb_build_object('ok', true, 'likes', new_count);
END $$;

CREATE OR REPLACE FUNCTION public.unlike_post(p_post_id bigint, p_lname text, p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u public.users%ROWTYPE; new_count bigint;
BEGIN
  SELECT * INTO u FROM public.users WHERE lname = p_lname LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_user'); END IF;
  IF u.auth_tokens IS NULL OR u.auth_tokens->>p_token IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_perm'); END IF;
  IF EXISTS (SELECT 1 FROM public.post_likes WHERE post_id = p_post_id AND lname = p_lname) THEN
    DELETE FROM public.post_likes WHERE post_id = p_post_id AND lname = p_lname;
    UPDATE public.posts SET likes = GREATEST(likes - 1, 0) WHERE id = p_post_id;
  END IF;
  SELECT coalesce(likes, 0) INTO new_count FROM public.posts WHERE id = p_post_id;
  RETURN jsonb_build_object('ok', true, 'likes', new_count);
END $$;
GRANT EXECUTE ON FUNCTION public.like_post(bigint,text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unlike_post(bigint,text,text) TO anon, authenticated;

-- 关闭匿名直改 posts：内容改走 author_edit_post RPC，计数改走 like/unlike RPC（含防刷）
REVOKE UPDATE ON public.posts FROM anon, authenticated;

-- 新帖点赞数统一从 0 开始：禁止匿名直插伪造高赞帖（INSERT 也可带 likes 字段）
CREATE OR REPLACE FUNCTION protect_posts_insert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.likes := 0;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_protect_posts_insert ON posts;
CREATE TRIGGER trg_protect_posts_insert BEFORE INSERT ON posts
FOR EACH ROW EXECUTE FUNCTION protect_posts_insert();
```

### I.4 评论作者删除（评论凭证只存本机，云端不可读）

```sql
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS comment_token text;
REVOKE SELECT (comment_token) ON public.comments FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.author_delete_comment(p_id bigint, p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.comments%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.comments WHERE id = p_id LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_comment'); END IF;
  IF r.comment_token IS NULL OR r.comment_token <> p_token THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_perm'); END IF;
  DELETE FROM public.comments WHERE id = p_id;
  RETURN jsonb_build_object('ok', true);
END $$;
GRANT EXECUTE ON FUNCTION public.author_delete_comment(bigint,text) TO anon, authenticated;
```

### I.5 在线表防护（删除他人在线记录需令牌，杜绝 IDOR）

```sql
ALTER TABLE public.online_users ADD COLUMN IF NOT EXISTS token text;
REVOKE INSERT, UPDATE, DELETE ON public.online_users FROM anon, authenticated;
GRANT SELECT ON public.online_users TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_online(p_user_name text, p_lname text, p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.online_users%ROWTYPE; new_token text;
BEGIN
  SELECT * INTO r FROM public.online_users WHERE lname = p_lname LIMIT 1;
  IF FOUND THEN
    new_token := COALESCE(r.token, 'o' || substr(md5(random()::text || clock_timestamp()::text), 1, 20));
    UPDATE public.online_users SET last_seen = now(), token = new_token, user_name = p_user_name WHERE lname = p_lname;
    RETURN jsonb_build_object('ok', true, 'token', new_token);
  END IF;
  new_token := 'o' || substr(md5(random()::text || clock_timestamp()::text), 1, 20);
  INSERT INTO public.online_users(user_name, lname, last_seen, token) VALUES (p_user_name, p_lname, now(), new_token);
  RETURN jsonb_build_object('ok', true, 'token', new_token);
END $$;

CREATE OR REPLACE FUNCTION public.clear_online(p_lname text, p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.online_users WHERE lname = p_lname AND token = p_token;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_perm'); END IF;
  RETURN jsonb_build_object('ok', true);
END $$;
GRANT EXECUTE ON FUNCTION public.set_online(text,text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_online(text,text) TO anon, authenticated;
```

### I.6 图片存储桶（帖子图/头像改存 Storage，不再把 base64 写进数据库列）

```sql
INSERT INTO storage.buckets (id, name, public) VALUES
  ('post-images', 'post-images', true),
  ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;
DROP POLICY IF EXISTS "pub_insert_post_images" ON storage.objects;
CREATE POLICY "pub_insert_post_images" ON storage.objects
  FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'post-images');
DROP POLICY IF EXISTS "pub_insert_avatars" ON storage.objects;
CREATE POLICY "pub_insert_avatars" ON storage.objects
  FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'avatars');
```

> 说明：存储桶为 public（图片可公开访问），匿名可上传但**不能覆盖已有文件**（INSERT 策略不授权 UPDATE）。上传路径按账号前缀隔离。

### I.7 排行榜服务端排序（game_saves 增加 score 列，塔防总分由服务端维护）

```sql
ALTER TABLE public.game_saves ADD COLUMN IF NOT EXISTS score bigint NOT NULL DEFAULT 0;
-- score 列需对前端可读（排行榜 select=user_name,save_data,score）
GRANT SELECT (user_name, save_data, score) ON public.game_saves TO anon, authenticated;

-- 回填历史塔防存档的总分（bestScore 数组求和；从未保存过的新档保存一次后自动更新）
UPDATE public.game_saves
SET score = coalesce((SELECT sum(v::bigint) FROM jsonb_array_elements_text(coalesce(save_data->'bestScore','[]'::jsonb)) v), 0)
WHERE save_data->>'game' = 'td';

CREATE OR REPLACE FUNCTION public.save_game(p_user_name text, p_token text, p_save_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.game_saves%ROWTYPE; new_token text; td_score bigint := 0;
BEGIN
  IF (p_save_data->>'game') = 'td' THEN
    SELECT coalesce(sum(v::bigint), 0) INTO td_score
    FROM jsonb_array_elements_text(coalesce(p_save_data->'bestScore', '[]'::jsonb)) v;
  END IF;
  SELECT * INTO r FROM public.game_saves WHERE user_name = p_user_name LIMIT 1;
  IF FOUND THEN
    IF r.save_token IS NULL OR r.save_token <> p_token THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'no_perm');
    END IF;
    UPDATE public.game_saves SET save_data = p_save_data, score = td_score WHERE user_name = p_user_name;
    RETURN jsonb_build_object('ok', true, 'token', p_token);
  END IF;
  new_token := 's' || substr(md5(random()::text), 1, 20);
  INSERT INTO public.game_saves(user_name, save_data, save_token, score) VALUES (p_user_name, p_save_data, new_token, td_score);
  RETURN jsonb_build_object('ok', true, 'token', new_token);
END $$;
GRANT EXECUTE ON FUNCTION public.save_game(text,text,jsonb) TO anon, authenticated;
```

### I.8 防提权补充（封堵「匿名注册时直接带 is_admin=true 自建管理员」）

> 此前触发器只拦截了 UPDATE 修改管理字段，INSERT 可绕过；本段补上 INSERT 拦截。

```sql
CREATE OR REPLACE FUNCTION protect_admin_fields_insert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.is_admin := COALESCE(NEW.is_admin, false);
  NEW.banned := COALESCE(NEW.banned, false);
  IF NEW.is_admin OR NEW.banned THEN
    IF current_user NOT IN ('postgres','supabase_admin','service_role') THEN
      RAISE EXCEPTION '需要管理员密钥才能创建管理员/封禁状态账号';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_protect_admin_fields_insert ON users;
CREATE TRIGGER trg_protect_admin_fields_insert BEFORE INSERT ON users
FOR EACH ROW EXECUTE FUNCTION protect_admin_fields_insert();
```

### 执行清单（一次复制 I.1 → I.8 整段执行即可）

1. 先把 I.1 里的 `<在此填入新密钥>` 替换为你在安全处生成的新密钥（32 位随机十六进制，不要写回本文件）。
2. SQL Editor → New query → 粘贴整段（I.1 到 I.8）→ Run。
3. 用新密钥打开管理后台验证；社区页重新登录一次（签发令牌），之后点赞/在线/切换账号恢复正常。

### J. 部署后功能失效修复（2026-10-11，GitHub Pages 上线后发现）

**背景**：I 段迁移上线后出现两类数据库层故障——
1. `set_online` 心跳报 409：`online_users` 主键为 `user_name`，历史遗留行以显示名作 `user_name` 且 `lname` 为空；心跳 UPDATE 想改写另一行的 `user_name` 时撞主键。
2. `game_saves` 读取报 401：前端 `select=*` 请求了未授权列（`save_token` 等）；**该问题由前端修复**（三个 `game_saves` 查询补 `select=user_name,save_data`：index.html 两处 + td-game.js 一处），无需 SQL。

本段 SQL 只需执行下面的 `set_online` 重定义 + 一次性清理：

```sql
-- J.1 在线心跳自愈：合并历史遗留重复在线行（旧格式曾以显示名作主键且 lname 为空），
--     并给 INSERT 加 ON CONFLICT，杜绝主键冲突 409
CREATE OR REPLACE FUNCTION public.set_online(p_user_name text, p_lname text, p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.online_users%ROWTYPE; new_token text;
BEGIN
  DELETE FROM public.online_users WHERE user_name = p_user_name AND lname IS DISTINCT FROM p_lname;
  SELECT * INTO r FROM public.online_users WHERE lname = p_lname OR user_name = p_lname LIMIT 1;
  IF FOUND THEN
    new_token := COALESCE(r.token, 'o' || substr(md5(random()::text || clock_timestamp()::text), 1, 20));
    UPDATE public.online_users SET last_seen = now(), token = new_token, user_name = p_user_name, lname = p_lname
    WHERE lname = p_lname OR user_name = p_lname;
    RETURN jsonb_build_object('ok', true, 'token', new_token);
  END IF;
  new_token := 'o' || substr(md5(random()::text || clock_timestamp()::text), 1, 20);
  INSERT INTO public.online_users(user_name, lname, last_seen, token) VALUES (p_user_name, p_lname, now(), new_token)
  ON CONFLICT (user_name) DO UPDATE SET last_seen = now(), token = EXCLUDED.token, lname = EXCLUDED.lname;
  RETURN jsonb_build_object('ok', true, 'token', new_token);
END $$;

-- J.2 一次性清理：删除历史遗留（lname 为空）与已过期（>10 分钟无心跳）的在线行
DELETE FROM public.online_users WHERE lname IS NULL OR last_seen < now() - interval '10 minutes';
```

**验证**：`select public.set_online('asdyourgod','asd1316947244','otest');` 应返回 `{"ok": true, "token": ...}`（修复前为 409）。

