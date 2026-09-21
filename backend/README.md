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

## Browser Runtime

Browser tasks are expressed as durable `BrowserTask` records. The backend can route the same
capability to:

- `EXTENSION`: the user's Chrome or Edge page through the MV3 extension.
- `EMBEDDED`: a host page using `@intra-copilot/embed` and the durable browser-command queue.
- `SERVER`: an unattended Selenium/Chrome session.

The extension and embedded runtimes claim leases and commands through
`/api/v1/browser/runtimes`. Commands, leases, protocol versions, supported interaction modes,
origin allowlists, and idempotency keys are persisted independently from the chat SSE stream, so
page operations survive tab switches and transient disconnects. The server runtime is implemented
by `SeleniumBrowserRuntime` and is exposed through `/api/v1/browser/tasks`.
`browser.selenium.driver-path` and `browser.selenium.binary-path` can be configured when browser
binaries are not on the default system path.

Interaction modes are `FAST`, `VISIBLE_VIRTUAL`, `BROWSER_TRUSTED`, and `SYSTEM_TRUSTED`.
`BROWSER_TRUSTED` uses Chrome's debugger protocol for trusted page input. `SYSTEM_TRUSTED` uses the
optional Native Messaging host in `native-host/` and moves the real operating-system pointer.

## Adding a Feature

1. Put business invariants and value objects in the owning `domain` context.
2. Add the use-case orchestration in the matching `application` context.
3. Put database, HTTP, file, MCP, or model integrations in the matching `infrastructure` context.
4. Keep controllers and transport DTOs in the matching `interfaces/rest` package.
5. Add the test beside the class under test in `src/test/java`.
