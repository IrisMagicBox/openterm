-- Get latest topic
SELECT 
  '最新 Topic' as section,
  id,
  title,
  datetime(createdAt/1000, 'unixepoch', 'localtime') as created_at
FROM topics 
ORDER BY createdAt DESC 
LIMIT 1;

-- Get message count for latest topic
SELECT 
  '消息统计' as section,
  COUNT(*) as total_messages,
  COUNT(CASE WHEN role = 'user' THEN 1 END) as user_messages,
  COUNT(CASE WHEN role = 'assistant' THEN 1 END) as agent_messages,
  COUNT(CASE WHEN role = 'tool' THEN 1 END) as tool_messages
FROM messages 
WHERE topicId = (SELECT id FROM topics ORDER BY createdAt DESC LIMIT 1);

-- Get recent messages
SELECT 
  '💬 最近消息' as section,
  role,
  substr(content, 1, 80) as content_preview,
  datetime(timestamp/1000, 'unixepoch', 'localtime') as time
FROM messages 
WHERE topicId = (SELECT id FROM topics ORDER BY createdAt DESC LIMIT 1)
ORDER BY timestamp DESC
LIMIT 10;

-- Get tasks
SELECT 
  '📋 任务' as section,
  title,
  status,
  datetime(createdAt/1000, 'unixepoch', 'localtime') as created_at
FROM tasks 
WHERE topicId = (SELECT id FROM topics ORDER BY createdAt DESC LIMIT 1)
ORDER BY createdAt DESC;

-- Get recent task steps with errors
SELECT 
  '❌ 最近的步骤' as section,
  ts.title as step_title,
  ts.type,
  ts.status,
  substr(ts.rawOutput, 1, 100) as output_preview,
  t.title as task_title
FROM task_steps ts
JOIN tasks t ON ts.taskId = t.id
WHERE t.topicId = (SELECT id FROM topics ORDER BY createdAt DESC LIMIT 1)
ORDER BY ts.createdAt DESC
LIMIT 10;
