# PMS11 Copilot Integration Plan Rev.0

## Goal
Add an optional "PMS 11 Copilot" side panel to the app. It runs on your company's Copilot Studio agent, which IT/Admin builds once. Users never build anything: they turn the assistant on and use quick actions or plain language. PMS11 always decides who is allowed to do what.

```text
PMS11 UI -> PMS 11 Copilot panel -> Copilot Studio Agent
                                      |-- Tools ---> PMS11 API -> Authorization -> Business Rules -> Database (RLS) -> Audit
                                      |-- Knowledge -> SharePoint (policies, SOPs, standards)
                                      |-- Flows ----> Power Automate -> Outlook / Teams / Approvals
```
Copilot never talks to the database directly. It only uses PMS11 tools, so changing the database later won't affect Copilot.

## Copilot Studio features we use
- **Custom website channel (Direct Line):** the chat panel inside PMS11, using short-lived tokens.
- **Generative orchestration:** the agent picks the right tool, knowledge or topic, with no large scripted conversation trees.
- **Custom Connector to the PMS11 API:** this is the first choice, protected by Microsoft sign-in (Entra ID). We'll consider an MCP server later, only if we need a wider set of tools.
- **Knowledge:** SharePoint SOPs, standards and IMCA/class documents, with citations.
- **Adaptive Cards:** confirm, edit and cancel cards for any change.
- **Teams / Microsoft 365 Copilot channel:** the same agent logic, but this depends on your licence, channel settings and governance (see the licence check below).

## Skills (MVP, 7 only)
| Skill | Phase | Type |
|---|---|---|
| My Work Today | 1 | Read |
| Rules Q&A | 1 | Knowledge |
| Closure Helper ("why can't it close?") | 1 | Read / Explain |
| Evidence Check | 2 | Analyze (advisory only) |
| Gate Briefing | 2 | Analyze / Generate |
| Quick Create | 2 | Write + Confirm |
| Reminders | 3 | Automation (Power Automate) |

**Page context from day one:** the panel tells the agent which record the user is looking at, for example `{entity:"gap", rid:"GAP-042"}`. So "why won't this close?" gets a direct answer straight away.

## Confirmed writes only
User request -> Copilot drafts it (`draftRecord`) -> Adaptive Card shows the details -> the user clicks **Confirm Create** -> PMS11 creates the record (`createRecord`).
Copilot never creates, closes or approves anything directly. AI recommends and drafts; a human authorizes.

## Access decision chain
Global switch on -> user switched it on -> role allowed -> department allowed -> signed in -> PMS11 permission (RLS + business rules) -> run.
The switches and allow-lists are only for turning the feature on or off. Real permission always comes from PMS11 (department, app role, RLS, closure rules).

## Identity
Microsoft user -> Copilot sign-in -> user identity/token -> PMS11 API (Custom Connector) -> matched to a PMS11 user by email (@pms.eg) -> department + app role -> RLS / business rules. Being signed in to Microsoft alone never grants access.

## Licence check before Phase 1 (IT)
- Your Copilot Studio entitlement type: a Teams-only entitlement or Standalone Copilot Studio. Some features need Standalone.
- Copilot capacity set aside for the environment. Usage depends on how much the agent is used, and capacity may be shared across the company.
- Whether the custom website and Teams/M365 channels are enabled.

## Delivery phases
1. **Phase 1:** per-user and global switches, Copilot panel, secure token exchange, page context, read-only skills (My Work Today, Rules Q&A, Closure Helper).
2. **Phase 2:** Quick Create with confirmation, Evidence Check, Gate Briefing.
3. **Phase 3:** Power Automate reminders and approvals, publishing to Teams/M365 if the licence allows.

## What we need from your company
- A Copilot Studio environment and an agent created by IT. I'll provide the connector definition, tool descriptions and setup steps.
- The Direct Line secret (stored on the server only) and an Entra ID app registration that protects the PMS11 API.

## Technical details
- `profiles.copilot_enabled boolean default false` (user opt-in). An `app_settings` row holds `copilot_enabled` (global kill switch), `allowed_roles` and `allowed_departments`. These are feature switches only, not authorization.
- `getCopilotToken` server function (authenticated): checks the access chain, then exchanges the server-only `COPILOT_DIRECTLINE_SECRET` for a short-lived Direct Line token. The secret never reaches the browser.
- Panel: `botframework-webchat` loaded lazily on the client and themed with design tokens. It sends a `pageContext` event `{entity, rid}` on open and on navigation.
- PMS11 tool API at `src/routes/api/public/copilot/*`, with an OpenAPI spec for the Custom Connector. Each call validates the Entra access token (issuer, audience, signature), matches the user, and runs as that user so RLS applies. Explicit contracts only: listMyWork, getClosureBlockers, getRecord, searchRules, draftRecord, createRecord (needs a confirmation token from draftRecord), attachEvidence, gateSummary. No generic "run anything" tool.
- Audit entry `detail`: `{channel:"copilot", agent:"PMS11 Copilot", tool, action, user_id, entity, rid, request_summary, proposal, confirmation:boolean, result, timestamp}`.
