# PMS 11 Copilot: ready-made Copilot Studio assistant inside the app

## Goal
Add an optional "PMS 11 Copilot" side panel to the app. It runs on your company's Copilot Studio agent, which your IT/admin team builds once. Users don't build anything: they just turn the assistant on and ask it things or click quick actions.

## What Copilot Studio can do for us (the parts we'll use)
- **Custom website channel (Direct Line):** shows the agent's chat inside our app, styled to match.
- **Generative orchestration:** the agent works out the user's intent and picks the right tool, so we don't have to script every conversation.
- **Tools / actions:** the agent can call our app through a secure connection (a custom connector or an MCP server). It can also run Power Automate flows (Outlook, Teams, SharePoint, Approvals).
- **Knowledge sources:** rules, IMCA/class documents and SOPs stored in SharePoint or uploaded files, so answers come with citations.
- **Microsoft sign-in (Entra ID):** the agent acts as the signed-in user. It respects their role and department.
- **Adaptive Cards:** buttons and forms inside the chat, for example "Approve", "Assign owner" or "Attach evidence".
- **Teams / M365 Copilot channel:** the same agent also works in Teams, with no extra build.

## Ready-made skills (built once by an admin)
1. **Closure helper:** "Why can't GAP-042 close?" The agent lists what's blocking closure and offers buttons to fix each item.
2. **Evidence check:** reviews an uploaded document against its acceptance criteria and answers with a recommendation only.
3. **My work today:** lists the user's overdue tasks, evidence expiring in 60, 30 or 7 days, and items waiting for their review.
4. **Gate briefing:** a Go/No-Go readiness summary for a gate, with No-Go conditions, sent as a Word/PDF file or a Teams post.
5. **Quick create:** "Raise a corrective action for crane load test on WPS-08". The agent fills in the record, and the user confirms.
6. **Rules Q&A:** answers questions about rules and standards, with citations from the knowledge sources.
7. **Reminders (Power Automate):** a weekly digest to owners, emails to escalate overdue items, and Teams approval requests for gate reviewers.

## Per-user opt-in
- A **Settings → PMS 11 Copilot** switch, off by default.
- Admins can turn the feature on or off for everyone, and limit it to certain roles or departments.
- When a user's switch is off, nothing loads and no data is shared.
- Every action the agent takes is recorded in the audit log as "via Copilot".

## Safety rules
- The agent only acts through the app's existing permissions: department scoping, role checks and closure rules all still apply.
- Any change (create, update, close) needs the user to click confirm on a card. AI never approves reviews or gates.
- A human reviewer always makes the final decision.

## Delivery phases
1. **Phase 1 (in the app):** opt-in setting, Copilot side panel, secure token exchange, admin on/off. Read-only skills: My work today, Rules Q&A, Closure helper (explain only).
2. **Phase 2:** confirmed write actions (quick create, assign, attach evidence), Evidence check, Gate briefing.
3. **Phase 3:** Power Automate reminders and approvals, and publishing the agent to Teams.

## What we need from your company
- A Copilot Studio environment and an agent created by your admin. I'll provide the topic and tool definitions, and step-by-step setup.
- The agent's **Direct Line secret** (stored securely on the server) and an Entra ID app registration for Microsoft sign-in.
- Confirmation that your licence includes "custom website" channel messages. These use Copilot Studio message capacity.

## Technical details
- `profiles.copilot_enabled boolean default false` plus an `app_settings` row for the admin-wide switch and allowed roles.
- Server function `getCopilotToken` (authenticated, checks the opt-in): swaps the `COPILOT_DIRECTLINE_SECRET` for a short-lived Direct Line token and passes the user id and display name.
- Client panel uses `botframework-webchat`, loaded lazily (browser only), themed with the app's design tokens, with page context (current record rid/entity) sent as a `pageContext` event.
- Agent tools endpoint: `src/routes/api/public/copilot/*` (or an MCP server). It verifies the Entra/Direct Line caller and maps them to the app user, then runs as that user so RLS still applies. Tools: listMyWork, getClosureBlockers, getRecord, searchRules, draftRecord, attachEvidence, gateSummary.
- An OpenAPI spec is generated for the Copilot Studio custom connector.
- Audit: `audit_log.detail.channel = 'copilot'`.
