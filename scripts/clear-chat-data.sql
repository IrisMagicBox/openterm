-- =====================================================
-- OpenTerm 数据清理脚本
-- 保留：主机、模型API配置、权限设置
-- 清空：聊天记录、命令记录、任务记录等
-- =====================================================

-- 关闭外键约束检查，避免删除顺序问题
PRAGMA foreign_keys = OFF;

BEGIN TRANSACTION;

-- 清空命令模式记录
DELETE FROM command_patterns;

-- 清空记忆
DELETE FROM memories;

-- 清空终端IO记录
DELETE FROM terminal_io;

-- 清空终端会话
DELETE FROM terminal_sessions;

-- 清空产物
DELETE FROM artifacts;

-- 清空审批记录
DELETE FROM approvals;

-- 清空任务步骤
DELETE FROM task_steps;

-- 清空任务
DELETE FROM tasks;

-- 清空消息
DELETE FROM messages;

-- 清空Topics（保留local host的关联）
DELETE FROM topics;

-- 重新启用外键约束
PRAGMA foreign_keys = ON;

-- 验证清理结果
SELECT '清理后数据验证' as info;
SELECT 
  'hosts' as table_name, 
  COUNT(*) as count,
  '应保留' as status 
FROM hosts
UNION ALL
SELECT 
  'providers' as table_name, 
  COUNT(*) as count,
  '应保留' as status 
FROM providers
UNION ALL
SELECT 
  'models' as table_name, 
  COUNT(*) as count,
  '应保留' as status 
FROM models
UNION ALL
SELECT 
  'permissions' as table_name, 
  COUNT(*) as count,
  '应保留' as status 
FROM permissions
UNION ALL
SELECT 
  'topics' as table_name, 
  COUNT(*) as count,
  '应清空' as status 
FROM topics
UNION ALL
SELECT 
  'messages' as table_name, 
  COUNT(*) as count,
  '应清空' as status 
FROM messages
UNION ALL
SELECT 
  'terminal_sessions' as table_name, 
  COUNT(*) as count,
  '应清空' as status 
FROM terminal_sessions
UNION ALL
SELECT 
  'terminal_io' as table_name, 
  COUNT(*) as count,
  '应清空' as status 
FROM terminal_io
UNION ALL
SELECT 
  'tasks' as table_name, 
  COUNT(*) as count,
  '应清空' as status 
FROM tasks
UNION ALL
SELECT 
  'memories' as table_name, 
  COUNT(*) as count,
  '应清空' as status 
FROM memories;

COMMIT;

-- 压缩数据库（VACUUM）
VACUUM;
