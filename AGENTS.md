# Repository Guidelines

## Project Structure & Module Organization

- `backend/` contains the Spring Boot 3 service (Java 17). Application code is under `src/main/java/com/intra/copilot`, configuration under `src/main/resources`, and JUnit tests under `src/test/java`.
- `extension/` contains the Chrome/Edge MV3 client. React/TypeScript UI code lives in `src/`; `content.ts` handles page context and actions, `service-worker.ts` handles extension messaging, and `sidepanel.tsx` contains the chat UI. `public/manifest.json` is copied into the production bundle.
- `README.md` documents local setup. SQLite files and `extension/dist/` are generated artifacts; do not commit credentials or generated build output.

## Build, Test, and Development Commands

Backend (from `backend/`):

```powershell
mvn spring-boot:run   # start the API on 127.0.0.1:8080
mvn test              # run backend tests
mvn fmt:format        # apply Google Java formatting
```

Extension (from `extension/`):

```powershell
npm install
npm run dev           # start Vite development server
npm run build         # type-check and create extension/dist/
npm run format        # format TypeScript, CSS, HTML, and JSON
npm run format:check  # verify formatting without changes
```

## Coding Style & Naming Conventions

Use two-space indentation and let Prettier format extension files. Java follows the Google Java Format plugin. Use `PascalCase` for Java/React types, `camelCase` for variables and methods, and kebab-case IDs for agents or API routes. Keep browser actions structured and allowlisted; never add arbitrary script execution.

## Testing Guidelines

Add backend tests beside the relevant package using `*Test.java` names and JUnit assertions. Run `mvn test` before submitting backend changes. Frontend changes must at least pass `npm run format:check`, `npx tsc --noEmit`, and `npm run build`; manually verify Chrome/Edge behavior for UI or permission changes.

## Commit & Pull Request Guidelines

Use concise Conventional Commit-style subjects such as `feat:`, `fix:`, `style:`, `docs:`, or `chore:`. Pull requests should explain user-visible behavior, list verification commands, identify configuration or permission changes, and include screenshots for side-panel or floating-ball UI work. Keep API keys in environment variables only.

## Security & Configuration

Configure `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`, and CORS settings in the backend environment. Never place secrets in the extension, source files, logs, or committed configuration.
