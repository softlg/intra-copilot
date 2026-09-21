# Backend Architecture

The backend is organized as a modular monolith with DDD-style layers. The goal is to keep each
business capability discoverable without introducing multi-module build complexity.

## Package Layout

```text
com.intra.copilot
├── application
│   ├── admin
│   ├── agent
│   ├── capability
│   ├── conversation
│   ├── identity
│   └── knowledge
├── domain
│   ├── admin
│   ├── agent
│   ├── capability
│   ├── conversation
│   ├── identity
│   └── knowledge
├── infrastructure
│   ├── agent
│   ├── ai
│   ├── capability
│   ├── config
│   ├── conversation
│   ├── identity
│   ├── knowledge
│   ├── network
│   ├── observability
│   └── persistence
├── interfaces
│   ├── rest
│   └── web
└── shared
    ├── identity
    ├── persistence
    ├── security
    └── util
```

## Bounded Contexts

| Context | Responsibility |
| --- | --- |
| `agent` | Agent definitions, releases, routing, delegation, planning, and validation |
| `capability` | Tools, skills, hooks, MCP servers, and capability execution |
| `conversation` | Sessions, messages, attachments, invocation traces, and streaming |
| `knowledge` | Knowledge bases, documents, parsing, embedding, indexing, and retrieval |
| `identity` | Administrators, devices, login, sessions, roles, and auth rate limits |
| `admin` | Administration audit and the AI administration workspace |

## Dependency Rules

- `interfaces` may depend on `application`, `domain`, and infrastructure adapters required by the
  transport layer.
- `application` coordinates use cases and may depend on `domain` and infrastructure adapters.
- `domain` contains business models and policies. It should not depend on application services or
  web transport code.
- `infrastructure` implements persistence, storage, network, AI, and scheduling adapters.
- `shared` contains small cross-context primitives and must not depend on `application` or
  `interfaces`.
- Cross-context collaboration should use application services or domain identifiers instead of
  reaching into another context's persistence package.

The current persistence models retain MyBatis annotations to keep migration risk low. A future
iteration can split them into separate persistence records if stricter domain isolation is needed.

## Adding a Feature

1. Put business invariants and value objects in the owning `domain` context.
2. Add the use-case orchestration in the matching `application` context.
3. Put database, HTTP, file, MCP, or model integrations in the matching `infrastructure` context.
4. Keep controllers and transport DTOs in the matching `interfaces/rest` package.
5. Add the test beside the class under test in `src/test/java`.
