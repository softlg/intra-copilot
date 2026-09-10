/** Shared domain types for the admin console. */

export type Theme = "dark" | "light";

/** Status filter shared by the tool and skill registries. */
export type ResourceStatus = "all" | "enabled" | "disabled";

export type Agent = {
  id: string;
  displayName: string;
  description?: string;
  role?: "MAIN" | "GENERAL" | "DOMAIN" | "SUB" | string;
  parentAgentId?: string;
  handlingMode?: "DIRECT" | "DELEGATE" | "AUTO" | string;
  returnMode?: "CHILD_DIRECT" | "DOMAIN_SUMMARY" | string;
  enabled: boolean;
  published?: boolean;
  publishedVersion?: number;
  systemPrompt: string;
  systemAgent?: boolean;
  supportsBrowserActions?: boolean;
  priority?: number;
  routingRules?: string;
  model?: string;
  temperature?: number;
  knowledgeBaseIds?: string;
  toolIds?: string;
  skillIds?: string;
};

export type AgentConfigVersion = {
  id: string;
  agentId: string;
  version: number;
  status: string;
  snapshot?: string;
  releaseNote?: string;
  createdAt?: string;
};

export type AgentChildBinding = {
  id: string;
  parentAgentId: string;
  childAgentId: string;
  priority?: number;
  routingRule?: string;
  enabled: boolean;
};

export type ToolDefinition = {
  id: string;
  name: string;
  description?: string;
  type?: string;
  method?: string;
  endpoint?: string;
  mcpServerUrl?: string;
  mcpTransport?: string;
  mcpAuthEnv?: string;
  enabled: boolean;
};

export type McpInterface = {
  name?: string;
  description?: string;
  inputSchema?: unknown;
  [key: string]: unknown;
};

export type McpServer = {
  id: string;
  name: string;
  description?: string;
  serverUrl: string;
  transport: "SSE" | "STREAMABLE_HTTP" | string;
  authEnv?: string;
  enabled: boolean;
  status?: "UNKNOWN" | "HEALTHY" | "DEGRADED" | "UNHEALTHY" | string;
  interfaceCount?: number;
  interfacesJson?: string;
  capabilitiesJson?: string;
  lastError?: string;
  lastCheckedAt?: string;
  lastLatencyMs?: number;
};

/** Updater shared by the tool and skill lists, which have different shapes. */
export type ResourceListUpdater = (
  items: (ToolDefinition | SkillDefinition)[],
) => (ToolDefinition | SkillDefinition)[];

export type SkillDefinition = {
  id: string;
  name: string;
  description?: string;
  prompt: string;
  version?: string;
  enabled: boolean;
};

export type HookDefinition = {
  id: string;
  name: string;
  description?: string;
  phase: string;
  ruleType: string;
  ruleConfig: string;
  failureMessage?: string;
  priority: number;
  enabled: boolean;
};

export type ResourceDetails =
  | { kind: "tool"; resource: ToolDefinition }
  | { kind: "skill"; resource: SkillDefinition };

export type AgentFeedback = {
  id: string;
  sessionId?: string;
  messageId?: string;
  messageIndex?: number;
  agentId?: string;
  rating: "up" | "down";
  comment?: string;
  messageContent?: string;
  userMessage?: string;
  createdAt?: string;
};
export type FeedbackSummary = {
  total: number;
  up: number;
  down: number;
  satisfactionRate: number;
  byAgent: Record<string, number>;
  downReasons: Record<string, number>;
  suggestions: string[];
};

export type Base = {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  embeddingProfileId?: string;
  useSystemEmbedding?: boolean;
  embeddingProvider?: string;
  embeddingModel?: string;
  embeddingDimension?: number;
};
export type EmbeddingProfile = {
  id: string;
  name: string;
  provider: string;
  model: string;
  dimension: number;
  enabled: boolean;
  defaultProfile: boolean;
  configVersion?: string;
};
export type EmbeddingConfig = {
  profile: EmbeddingProfile;
  inheritedOrResolved: boolean;
};
export type EmbeddingConfigRequest = {
  useSystemEmbedding?: boolean;
  provider?: string;
  model?: string;
  dimension?: number;
  profileId?: string;
};
export type EmbeddingValidation = {
  reachable: boolean;
  profile: EmbeddingProfile;
  actualDimension?: number;
  latencyMs: number;
  error?: string;
};
export type KnowledgeDiagnostics = {
  issues: string[];
  documentCount: number;
  errorCount: number;
  embeddingTableExists: boolean;
};

export type KnowledgeDocument = {
  id: string;
  knowledgeBaseId: string;
  filename: string;
  mediaType?: string;
  status: "PENDING" | "INDEXING" | "READY" | "ERROR" | string;
  error?: string;
  fileHash?: string;
  sizeBytes?: number;
  createdAt?: string;
  updatedAt?: string;
};

export type DocumentChunk = {
  id: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  pageNumber?: number;
};

export type RetrievalResult = {
  documentId: string;
  filename: string;
  pageNumber?: number;
  content: string;
  distance: number;
};

export type QASceneSettings = {
  prompt: string;
  topK: number;
};

export type ConversationAttachment = {
  id: string;
  filename: string;
  contentType?: string;
  size?: number;
  isImage: boolean;
  url: string;
};

export type ConversationInvocation = {
  id: string;
  requestedAgentId?: string;
  selectedAgentId?: string;
  routeReason?: string;
  confidence?: number;
  routeSource?: string;
  intent?: string;
  contextSent?: string;
  responseContent?: string;
  clientIp?: string;
  durationMs?: number;
  error?: string;
  createdAt?: string;
};

export type ConversationInvocationEvent = {
  id: string;
  eventType: string;
  eventName?: string;
  status?: string;
  payload?: Record<string, unknown> | null;
  durationMs?: number;
  sequence?: number;
  createdAt?: string;
};

export type ConversationInvocationTrace = {
  invocation: ConversationInvocation;
  events: ConversationInvocationEvent[];
};

export type ConversationLog = {
  id: string;
  title: string;
  createdAt?: string;
  updatedAt?: string;
  messages: {
    id: string;
    role: string;
    content: string;
    agentId?: string;
    contextSummary?: string;
    createdAt?: string;
    attachments?: ConversationAttachment[];
  }[];
  invocations: ConversationInvocation[];
  invocationTraces?: ConversationInvocationTrace[];
  actions: {
    actionId: string;
    type?: string;
    target?: string;
    reason?: string;
    risk?: string;
    status?: string;
    result?: string;
    expiresAt?: string;
  }[];
};

export type ConversationLogSummary = {
  id: string;
  title: string;
  createdAt?: string;
  updatedAt?: string;
  messageCount: number;
};

export type ConversationLogPage = {
  items: ConversationLogSummary[];
  total: number;
  page: number;
  size: number;
};

export type AgentPreset = {
  id: string;
  displayName: string;
  systemPrompt: string;
};
