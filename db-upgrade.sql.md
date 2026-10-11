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
-- SECRET: a8a4255fcff10fcdab0037b4eba047dcd8992b22717d2333
CREATE OR REPLACE FUNCTION public.admin_set_admin(p_lname text, p_admin boolean, p_secret text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_secret <> 'a8a4255fcff10fcdab0037b4eba047dcd8992b22717d2333' THEN RAISE EXCEPTION '管理员密钥错误'; END IF;
  UPDATE public.users SET is_admin = p_admin WHERE lname = p_lname;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false); END IF;
  RETURN jsonb_build_object('ok', true);
END $$;
CREATE OR REPLACE FUNCTION public.admin_set_banned(p_lname text, p_banned boolean, p_secret text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_secret <> 'a8a4255fcff10fcdab0037b4eba047dcd8992b22717d2333' THEN RAISE EXCEPTION '管理员密钥错误'; END IF;
  UPDATE public.users SET banned = p_banned WHERE lname = p_lname;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false); END IF;
  RETURN jsonb_build_object('ok', true);
END $$;
CREATE OR REPLACE FUNCTION public.admin_delete_user(p_lname text, p_secret text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_secret <> 'a8a4255fcff10fcdab0037b4eba047dcd8992b22717d2333' THEN RAISE EXCEPTION '管理员密钥错误'; END IF;
  DELETE FROM public.users WHERE lname = p_lname;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false); END IF;
  RETURN jsonb_build_object('ok', true);
END $$;
CREATE OR REPLACE FUNCTION public.admin_delete_user_content(p_lname text, p_name text, p_secret text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_secret <> 'a8a4255fcff10fcdab0037b4eba047dcd8992b22717d2333' THEN RAISE EXCEPTION '管理员密钥错误'; END IF;
  DELETE FROM public.posts WHERE lname = p_lname OR user_name = p_name;
  DELETE FROM public.comments WHERE lname = p_lname OR user_name = p_name;
  DELETE FROM public.online_users WHERE lname = p_lname OR user_name = p_name;
  RETURN jsonb_build_object('ok', true);
END $$;
CREATE OR REPLACE FUNCTION public.admin_delete_post(p_id bigint, p_secret text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_secret <> 'a8a4255fcff10fcdab0037b4eba047dcd8992b22717d2333' THEN RAISE EXCEPTION '管理员密钥错误'; END IF;
  DELETE FROM public.comments WHERE post_id = p_id;
  DELETE FROM public.posts WHERE id = p_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false); END IF;
  RETURN jsonb_build_object('ok', true);
END $$;
CREATE OR REPLACE FUNCTION public.admin_delete_comment(p_id bigint, p_secret text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_secret <> 'a8a4255fcff10fcdab0037b4eba047dcd8992b22717d2333' THEN RAISE EXCEPTION '管理员密钥错误'; END IF;
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
