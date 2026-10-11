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
