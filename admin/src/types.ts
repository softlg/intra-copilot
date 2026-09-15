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
  version?: number;
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
  planningMode?: "OFF" | "AUTO" | "ALWAYS" | string;
  maxPlanSteps?: number;
};

export type AgentConfigVersion = {
  id: string;
  agentId: string;
  version: number;
  status: string;
  snapshot?: string;
  releaseNote?: string;
  publishedBy?: string;
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
  remoteName?: string;
  parameterSchema?: string;
  timeoutMs?: number;
  authHeaderName?: string;
  authEnv?: string;
  authScheme?: string;
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
  status: "DRAFT" | "PUBLISHED" | string;
  activationMode: "ALWAYS" | "KEYWORD" | string;
  activationConfig?: string;
  priority: number;
  maxPromptChars: number;
  publishedVersion: number;
  invocationCount: number;
  lastUsedAt?: string;
  lockVersion: number;
  updatedBy?: string;
  updatedAt?: string;
  toolIds: string[];
  toolCount: number;
  agentIds: string[];
  agentCount: number;
  agentNames: string[];
  promptChars: number;
  promptTokenEstimate: number;
  enabled: boolean;
};

export type SkillDefinitionVersion = {
  id: string;
  skillId: string;
  version: number;
  versionLabel: string;
  status: string;
  prompt: string;
  toolIds: string;
  snapshot?: string;
  changeNote?: string;
  createdBy?: string;
  createdAt?: string;
};

export type SkillAuditLog = {
  id: string;
  skillId: string;
  action: string;
  actor?: string;
  beforeConfig?: string;
  afterConfig?: string;
  createdAt?: string;
};

export type SkillTestResult = {
  systemPrompt: string;
  toolIds: string[];
  appliedSkills: {
    id: string;
    name: string;
    version: number;
    versionLabel: string;
    promptChars: number;
    promptTokenEstimate: number;
  }[];
  warnings: string[];
  promptChars: number;
  promptTokenEstimate: number;
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
  version: number;
  failMode: "BLOCK" | "WARN";
  updatedBy?: string;
  createdAt?: string;
  updatedAt?: string;
  bindings: HookBinding[];
};

export type HookBinding = {
  id?: string;
  hookId?: string;
  targetType: "GLOBAL" | "AGENT" | "AGENT_ROLE";
  targetId: string;
};

export type HookDefinitionVersion = {
  id: string;
  hookId: string;
  version: number;
  snapshot: string;
  changeNote?: string;
  createdBy?: string;
  createdAt: string;
};

export type HookCheck = {
  hookId: string;
  hookName: string;
  ruleType: string;
  phase: string;
  ruleVersion: number;
  ruleConfig: string;
  failMode: "BLOCK" | "WARN";
  passed: boolean;
  message: string;
  evaluationError?: string;
  durationMs: number;
};

export type HookTestResult = {
  allowed: boolean;
  checks: HookCheck[];
  durationMs: number;
};

export type HookValidationResult = {
  valid: boolean;
  errors: string[];
  normalized?: HookDefinition;
};

export type HookStats = {
  executions: number;
  passed: number;
  blocked: number;
  lastEvaluatedAt?: string;
  lastMessage?: string;
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
  agentName?: string;
  rating: "up" | "down";
  comment?: string;
  reasonCode?: string;
  reasonText?: string;
  messageContent?: string;
  userMessage?: string;
  status?: string;
  createdAt?: string;
  ratedAt?: string;
  updatedAt?: string;
};
export type FeedbackTrendPoint = {
  date: string;
  label: string;
  up: number;
  down: number;
};
export type FeedbackAgentInsight = {
  agentId: string;
  agentName: string;
  total: number;
  up: number;
  down: number;
  positiveRate: number;
  noReason: number;
  topReasonCode?: string;
};
export type FeedbackSummary = {
  total: number;
  up: number;
  down: number;
  positiveRate: number;
  reasonCoverage: number;
  noReason: number;
  byAgent: Record<string, number>;
  agentNames: Record<string, string>;
  agentBreakdown: FeedbackAgentInsight[];
  downReasons: Record<string, number>;
  suggestionCodes: string[];
  trendDays: number;
  trend: FeedbackTrendPoint[];
};
export type FeedbackPage = {
  items: AgentFeedback[];
  total: number;
  page: number;
  size: number;
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
  retrievalTopK?: number;
  retrievalSimilarityThreshold?: number;
  retrievalMode?: "DENSE" | "HYBRID";
  retrievalLexicalWeight?: number;
  retrievalFallbackEnabled?: boolean;
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
  chunkId?: string;
  documentId: string;
  filename: string;
  pageNumber?: number;
  content: string;
  distance: number;
  similarity: number;
  lexicalScore: number;
  score: number;
  retrievalMode: "DENSE" | "HYBRID" | string;
  belowThreshold: boolean;
  rank: number;
};

export type QASceneSettings = {
  prompt: string;
  topK: number;
  similarityThreshold: number;
  retrievalMode: "DENSE" | "HYBRID";
  lexicalWeight: number;
  fallbackEnabled: boolean;
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
  agentVersion?: number;
  durationMs?: number;
  error?: string;
  createdAt?: string;
};

export type ConversationInvocationEvent = {
  id: string;
  invocationId?: string;
  planId?: string;
  planStepId?: string;
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

export type ConversationPlanStep = {
  id: string;
  stepIndex: number;
  title: string;
  description?: string;
  agentId?: string;
  toolNames: string[];
  dependsOn: string[];
  successCriteria?: string;
  status: string;
  resultSummary?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
};

export type ConversationPlan = {
  plan: {
    id: string;
    conversationId: string;
    invocationId: string;
    correlationId?: string;
    parentPlanId?: string;
    routeAgentId?: string;
    executorAgentId?: string;
    revision: number;
    goal: string;
    summary?: string;
    status: string;
    planningMode?: string;
    startedAt?: string;
    completedAt?: string;
    error?: string;
    createdAt?: string;
    updatedAt?: string;
  };
  steps: ConversationPlanStep[];
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
  plans?: ConversationPlan[];
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
