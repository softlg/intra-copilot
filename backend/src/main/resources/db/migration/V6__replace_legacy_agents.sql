-- Remove the retired TMS agent and rename the former diagnosis system agent.
DELETE FROM agent_definition WHERE id = 'tms-manual';

UPDATE agent_definition
SET id = 'route-copilot',
    display_name = 'Intra route Copilot',
    description = '识别用户意图，并指派后台 Agent 处理',
    system_prompt = '你是 Intra route Copilot，负责识别用户意图、结合页面上下文和历史消息选择最合适的后台 Agent。你只负责路由和必要的澄清，不直接冒充业务 Agent 回答。必须使用结构化路由结果，不编造不存在的 Agent。',
    supports_browser_actions = FALSE,
    system_agent = TRUE
WHERE id = 'diagnosis';

UPDATE agent_invocation SET selected_agent_id = 'route-copilot' WHERE selected_agent_id = 'diagnosis';
UPDATE agent_invocation SET requested_agent_id = 'route-copilot' WHERE requested_agent_id = 'diagnosis';
UPDATE agent_invocation SET selected_agent_id = 'assistant' WHERE selected_agent_id = 'tms-manual';
UPDATE agent_invocation SET requested_agent_id = NULL WHERE requested_agent_id = 'tms-manual';
UPDATE message SET agent_id = 'route-copilot' WHERE agent_id = 'diagnosis';
UPDATE message SET agent_id = 'assistant' WHERE agent_id = 'tms-manual';
