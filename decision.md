# HirePilot AI — Architecture Decision Record (ADR)

**Project:** HirePilot AI (workspace: Baatcheet)
**Created:** 2026-10-24
**Last updated:** 2026-10-24

---

## Table of Contents

- [Accepted Decisions](#accepted-decisions)
- [Provisional Decisions](#provisional-decisions)
- [Unresolved Decisions](#unresolved-decisions)
- [Superseded Decisions](#superseded-decisions)

---

## Accepted Decisions

### ADR-001: Product scope

- **Status:** Accepted
- **Date:** 2026-10-24
- **Context:** The project needs a clear boundary to prevent scope creep into generic chatbot, autonomous hiring, outbound calling, or n8n-based workflow territory.
- **Decision:** HirePilot AI is a browser-based, AI-assisted candidate screening system that conducts structured voice interviews, records transcripts, and generates evidence-backed reports for recruiters. It is not a generic chatbot, an autonomous hiring/rejection system, a Streamlit app, a static dashboard with fake data, a thin LLM wrapper, an outbound telephone system, or an n8n-based application.
- **Alternatives considered:** Building a general-purpose interview assistant or a fully autonomous screening pipeline.
- **Rationale:** The product specification explicitly defines what the product is and is not. A constrained scope ensures each feature is built properly rather than superficially.
- **Trade-offs and risks:** Narrower scope limits initial market appeal but produces a more trustworthy, auditable product.
- **Requirements affected:** All (A–F).
- **Revisit condition:** Only if the product specification is formally amended by the stakeholder.

### ADR-002: Initial frontend framework — Vite + React SPA

- **Status:** Accepted
- **Date:** 2026-10-24
- **Context:** The product requires rich interactive UI (dashboards, forms, live voice interviews, real-time transcripts). The workspace is empty and the host has Node.js v23.11 with npm 11.3 available.
- **Decision:** Use Vite as the build tool and React as the UI framework, structured as a single-page application. Scaffold via `npx create-vite`.
- **Alternatives considered:**
  - **Next.js:** Adds server-side rendering complexity not needed for a single-user prototype with no SEO requirement on interview pages.
  - **Vanilla JS:** Feasible but significantly increases UI development time for a forms-heavy, stateful application.
  - **Vue / Svelte:** Viable frameworks, but React has the broadest ecosystem for component patterns needed (forms, tables, modals) and aligns with the available tooling.
- **Rationale:** Vite provides fast HMR, native ES module support, and minimal configuration. React's component model suits the dashboard + live-interview architecture. Both are free, well-documented, and compatible with Node.js v23.
- **Trade-offs and risks:** React adds a framework dependency, but it is widely supported and the component boundaries keep migration feasible.
- **Requirements affected:** A (dashboard), C (voice interface UI), E.5/E.6 (report viewer).
- **Revisit condition:** If a server-rendered architecture becomes necessary (e.g., for SEO, multi-user auth, or SSR-dependent features).

### ADR-003: Styling — Vanilla CSS with design tokens

- **Status:** Accepted
- **Date:** 2026-10-24
- **Context:** The UI must look like a professional recruitment SaaS product with consistent typography, spacing, colour, and component styling. Project guidelines mandate vanilla CSS unless the user explicitly requests Tailwind.
- **Decision:** Use vanilla CSS with CSS custom properties (design tokens) for colours, typography, spacing, and component styles. Do not introduce Tailwind CSS or any CSS framework without explicit user approval.
- **Alternatives considered:**
  - **Tailwind CSS:** Utility-first approach is productive but explicitly prohibited unless requested.
  - **CSS-in-JS (styled-components, Emotion):** Adds runtime overhead and a dependency without clear benefit for this project size.
  - **CSS Modules:** Could be adopted alongside vanilla CSS if component-scoping becomes a problem; compatible with Vite out of the box.
- **Rationale:** Vanilla CSS with custom properties provides full control, zero dependencies, and aligns with project guidelines. A well-structured token system achieves consistency without a framework.
- **Trade-offs and risks:** Requires discipline to maintain consistency manually. Mitigated by defining all tokens upfront and building reusable component styles.
- **Requirements affected:** UI direction (professional SaaS look, responsive, accessible, consistent components).
- **Revisit condition:** If the user explicitly requests Tailwind CSS adoption (confirm version first).

### ADR-004: Routing — react-router-dom

- **Status:** Accepted
- **Date:** 2026-10-24
- **Context:** The SPA requires navigation between dashboard, job configuration, interview list, live interview session, and interview report pages.
- **Decision:** Use `react-router-dom` for client-side routing.
- **Alternatives considered:**
  - **TanStack Router:** More type-safe but adds learning curve and is less established.
  - **Manual hash routing:** Fragile and loses browser history integration.
- **Rationale:** `react-router-dom` is the standard React routing library, lightweight, well-documented, and handles nested routes and URL parameters needed for job/interview navigation.
- **Trade-offs and risks:** Adds one dependency. Acceptable given its stability and the routing complexity required.
- **Requirements affected:** A (dashboard navigation), A.5 (report viewer), B (interview session page).
- **Revisit condition:** If server-side rendering is adopted (would likely switch to framework-integrated routing).

### ADR-005: State management — React Context + useReducer

- **Status:** Accepted
- **Date:** 2026-10-24
- **Context:** The prototype is single-user and runs entirely in the browser. State includes job configurations, interview sessions, and transcripts.
- **Decision:** Use React Context combined with `useReducer` for application state management. Do not introduce Redux, Zustand, Jotai, or other state libraries unless a demonstrated requirement justifies it.
- **Alternatives considered:**
  - **Redux Toolkit:** Powerful but overkill for a single-user prototype with no complex async flows yet.
  - **Zustand:** Simpler API than Redux, but still an unnecessary dependency at this stage.
  - **Component-local state only:** Insufficient for cross-page state like the active interview session.
- **Rationale:** `useReducer` provides predictable state transitions (important for the interview engine later) without external dependencies. Context makes state available across the component tree.
- **Trade-offs and risks:** Context re-renders all consumers on any state change. Acceptable for prototype scale; can be optimised with memoisation or migrated to Zustand if performance degrades.
- **Requirements affected:** A (dashboard state), B (interview engine state), D (transcript state).
- **Revisit condition:** If performance profiling shows Context re-renders causing measurable UI jank, or if the state graph becomes too complex for `useReducer`.

### ADR-006: Initial persistence — localStorage with adapter pattern

- **Status:** Accepted
- **Date:** 2026-10-24
- **Context:** The zero-budget prototype requires persistence without a backend server. Data includes job configurations, interview transcripts, and evaluation reports.
- **Decision:** Persist all data to `localStorage` via an adapter interface (`data/store.js`). The adapter exposes CRUD operations on typed collections and can be replaced with an IndexedDB, REST API, or database-backed adapter without changing consumers.
- **Alternatives considered:**
  - **IndexedDB:** Higher capacity (~50MB+) and supports binary data, but more complex API. Could be adopted if localStorage limits are hit.
  - **Backend server + database:** Required eventually for multi-user, but adds hosting cost and complexity that is premature for Phase 1.
  - **In-memory only:** Loses data on page refresh; unacceptable even for a prototype.
- **Rationale:** localStorage is synchronous, universally supported, and sufficient for a single-user prototype. The adapter pattern ensures the persistence mechanism is swappable.
- **Trade-offs and risks:** ~5–10 MB limit depending on browser. Long transcripts from many interviews could exceed this. Must monitor and migrate before production. Data is lost if the user clears browser storage.
- **Requirements affected:** A (job CRUD), D (transcript persistence), E (report persistence).
- **Revisit condition:** When localStorage usage approaches 3 MB, when multi-user access is needed, or when a backend is introduced.

### ADR-007: Interview engine — explicit state machine

- **Status:** Accepted
- **Date:** 2026-10-24
- **Context:** The product specification requires a controlled interview flow with explicit states, managed transitions, and handling for edge cases (silence, skips, interruptions, errors). The LLM must not control application state freely.
- **Decision:** Implement the interview engine as a pure-JavaScript finite state machine with explicitly defined states, transitions, and guard conditions. Do not use the LLM to determine state transitions. The state machine is framework-agnostic (no React dependency) and tested independently.
- **Alternatives considered:**
  - **XState:** Mature state machine library with visualisation tools, but adds a dependency and learning curve for a state machine that is specific enough to implement directly.
  - **LLM-driven flow:** The specification explicitly prohibits free-form LLM control of application state.
  - **Simple if/else flow:** Fragile for the number of states and edge cases required.
- **Rationale:** A custom state machine is the most direct implementation of the specification's requirements. It keeps transitions auditable, testable, and deterministic.
- **Trade-offs and risks:** Custom implementation requires thorough testing of all transitions. Mitigated by unit tests for every valid and invalid transition.
- **Requirements affected:** B (all sub-requirements), D (event logging driven by state transitions).
- **Revisit condition:** If the state machine grows beyond ~15 states and transition logic becomes hard to maintain, consider adopting XState.

### ADR-008: AI integration — replaceable provider interface with honest mocks

- **Status:** Accepted
- **Date:** 2026-10-24
- **Context:** The prototype must not assume paid API access. AI capabilities (follow-up question generation, evaluation) must be designed for but not dependent on a specific provider.
- **Decision:** Define an abstract AI provider interface (`ai/provider.js`) with methods for follow-up generation and evaluation. Ship a mock provider (`ai/mockProvider.js`) that returns deterministic, clearly labelled mock responses. The mock must never be presented as real AI output in the UI.
- **Alternatives considered:**
  - **Hardcode Gemini/OpenAI SDK:** Creates a paid dependency and vendor lock-in.
  - **No AI interface at all:** Would require significant refactoring when AI is integrated.
  - **Local model (Ollama):** Viable but adds setup complexity and hardware requirements.
- **Rationale:** The interface-first approach lets the application be fully functional and testable without API access, while making real AI integration a provider swap rather than an architecture change.
- **Trade-offs and risks:** Mock responses don't exercise real AI edge cases (malformed output, latency, rate limits). These must be tested when a real provider is integrated.
- **Requirements affected:** B.2 (follow-up questions), E (evaluation), engineering principle (replaceable providers).
- **Revisit condition:** When a specific AI provider is selected and API access is available. Must resolve before Phase 3 (evaluation).

### ADR-009: Voice integration — replaceable browser voice adapter

- **Status:** Accepted
- **Date:** 2026-10-24
- **Context:** The product requires browser-based speech recognition and synthesis. The Web Speech API has inconsistent support across browsers (Safari lacks `SpeechRecognition`; only Chromium browsers have full support). The host machine has Safari and Brave but not Chrome.
- **Decision:** Implement a voice adapter layer (`voice/`) that wraps the Web Speech API with feature detection. If recognition is unsupported, report it honestly and provide a text-input fallback. Never simulate speech recognition. Speech synthesis availability is detected separately.
- **Alternatives considered:**
  - **Third-party speech API (Deepgram, AssemblyAI):** Adds cost and external dependency.
  - **No fallback:** Would make the product unusable in Safari and other non-Chromium browsers.
  - **Pretend it works:** Explicitly prohibited by the specification.
- **Rationale:** Feature detection with honest reporting and text-input fallback satisfies the specification's requirements for graceful degradation and honest capability reporting.
- **Trade-offs and risks:** Text-input fallback changes the interview experience. This is an acceptable trade-off for browser compatibility. Speech analytics will have limited data from text input.
- **Requirements affected:** C (all sub-requirements), F (speech analytics depend on voice data availability).
- **Revisit condition:** If a free/affordable third-party speech API is adopted, or if the product targets Chromium-only.

### ADR-010: Evaluation integrity — transcript-backed, deterministic validation

- **Status:** Accepted
- **Date:** 2026-10-24
- **Context:** The specification requires that evaluation evidence be linked to actual transcript content, quotations be validated against the raw transcript, and missing evidence must not be interpreted as demonstrated lack of skill.
- **Decision:** Implement evaluation with four statuses: demonstrated, partially demonstrated, insufficient evidence, and not assessed. All quotations cited in reports are validated by deterministic string matching against the raw transcript (`evaluation/quotationValidator.js`). The default status for any criterion without supporting evidence is "not assessed", not "insufficient evidence". The AI may propose evaluations, but the application validates them before saving.
- **Alternatives considered:**
  - **Trust AI output directly:** Specification explicitly prohibits this (fabricated statements, negative inference from absence).
  - **Fuzzy quotation matching:** Could mask hallucinated quotes. Exact matching is safer; fuzzy matching may be added later with clear confidence indicators.
- **Rationale:** Deterministic validation is the only reliable way to prevent hallucinated evidence in reports. The four-level status system with "not assessed" as default prevents negative inference.
- **Trade-offs and risks:** Exact string matching may miss valid paraphrases. This is acceptable because the specification requires evidence-backed claims, not interpretive summaries.
- **Requirements affected:** E (all sub-requirements).
- **Revisit condition:** If fuzzy matching is needed, add it with explicit confidence scores and never auto-accept low-confidence matches.

### ADR-011: Speech analytics — observable metrics only

- **Status:** Accepted
- **Date:** 2026-10-24
- **Context:** The specification allows measuring observable speech metrics but explicitly prohibits inferring honesty, personality, competence, nervousness, or script-reading from voice patterns.
- **Decision:** Measure only: response latency (time from question end to answer start), answer duration, speaking pace (words per minute), pause count, and filler-word count. Clearly mark any metric that cannot be reliably measured (e.g., when using text-input fallback). Never derive personality, emotional, or integrity assessments from these metrics.
- **Alternatives considered:**
  - **Sentiment analysis on speech:** Prohibited by the specification.
  - **No analytics at all:** The specification lists analytics as a requirement.
  - **Third-party analytics API:** Adds cost and may include prohibited inferences.
- **Rationale:** Observable metrics provide useful data for recruiters (e.g., how long a candidate took to answer) without crossing ethical boundaries defined in the specification.
- **Trade-offs and risks:** Metrics from text-input fallback are less meaningful (no real speaking pace or pauses). These must be marked as unavailable.
- **Requirements affected:** F (all sub-requirements).
- **Revisit condition:** If additional observable metrics are identified that do not require personality inference.

### ADR-012: Human oversight — recruiter retains decisions

- **Status:** Accepted
- **Date:** 2026-10-24
- **Context:** The specification states the system assists recruiters but does not make autonomous hiring or rejection decisions.
- **Decision:** All reports, evaluations, and analytics are presented as decision-support information. The UI never displays "hire" or "reject" recommendations. Language in reports uses "evidence suggests" rather than definitive assessments. No automated actions (emails, status changes, rejections) are triggered by evaluation results.
- **Alternatives considered:**
  - **Automated shortlisting:** Would violate the human-oversight requirement.
  - **Confidence-scored recommendations:** Could be added later with explicit "recruiter must decide" framing, but is not in the current specification.
- **Rationale:** The specification is explicit that the recruiter is responsible for hiring decisions.
- **Trade-offs and risks:** May feel less "AI-powered" to users expecting automation. This is the correct trade-off for an ethical screening tool.
- **Requirements affected:** E.6, product scope.
- **Revisit condition:** Only if the stakeholder explicitly amends the specification to include recommendation features with appropriate safeguards.

### ADR-013: Testing — automated tests and phase acceptance criteria

- **Status:** Accepted
- **Date:** 2026-10-24
- **Context:** The specification requires that each phase has explicit acceptance criteria and that tests are not weakened to accommodate new code.
- **Decision:** Use Vitest (ships with the Vite ecosystem, zero additional dependency) for unit and integration tests. Each phase defines acceptance criteria in the Phase 0 report. Tests must pass before a phase is declared complete. Existing tests must not be weakened or removed to make new code pass.
- **Alternatives considered:**
  - **Jest:** Would require additional configuration and a separate dependency.
  - **No automated tests:** Explicitly prohibited by the specification.
  - **End-to-end tests (Playwright/Cypress):** Valuable but premature for Phase 1; add when UI interactions become complex.
- **Rationale:** Vitest is free, fast, natively compatible with Vite's module system, and requires no additional installation beyond the Vite dev dependency.
- **Trade-offs and risks:** Unit tests alone don't catch integration or visual issues. Browser-based testing will be added in later phases.
- **Requirements affected:** Engineering principle (testable functions), non-negotiable rule 13 (do not weaken tests).
- **Revisit condition:** If end-to-end testing is needed, adopt Playwright (free, cross-browser).

### ADR-014: UI quality — professional recruitment SaaS

- **Status:** Accepted
- **Date:** 2026-10-24
- **Context:** The specification requires a professional, credible UI that feels like a recruitment SaaS product — not a Streamlit app, generic AI landing page, or oversized hero section.
- **Decision:** Build a design system with CSS custom properties defining colour palette, typography scale (using a professional font from Google Fonts), spacing scale, border radii, and shadows. All components use these tokens. The layout uses a sidebar navigation with a content area. Design priorities: clean, restrained, readable, information-dense, accessible, responsive.
- **Alternatives considered:**
  - **Component library (Material UI, Ant Design, shadcn/ui):** Would accelerate development but adds a significant dependency and makes customisation harder. The specification requires a consistent, custom design.
  - **Streamlit-style layout:** Explicitly prohibited.
  - **Animation-heavy design:** Specification prioritises functionality over effects.
- **Rationale:** A custom design system ensures the product looks distinctive and professional while keeping dependencies minimal. Token-based styling ensures consistency across all pages.
- **Trade-offs and risks:** Slower initial development than using a component library. Mitigated by building a small set of reusable primitives (Button, Input, Badge, Modal, Table, EmptyState).
- **Requirements affected:** UI direction (all points).
- **Revisit condition:** If development velocity becomes critically slow due to custom component work, consider adopting a headless component library (Radix UI) for behaviour while keeping custom styling.

### ADR-015: Cost constraint — zero mandatory paid services

- **Status:** Accepted
- **Date:** 2026-10-24
- **Context:** The specification requires a zero-budget prototype with no assumed paid API access.
- **Decision:** All Phase 1–2 functionality runs entirely in the browser with no external API calls. AI integration (Phase 3+) will target free-tier APIs with mock fallback. No paid hosting, database, or service is required. Free-tier quotas and limitations are documented honestly.
- **Alternatives considered:**
  - **Assume Gemini API access:** Would enable richer AI features but violates the cost constraint.
  - **Self-hosted LLM (Ollama):** Free but requires hardware and setup; document as a provisional option.
- **Rationale:** The specification is explicit about zero-budget constraints. The architecture is designed so paid services can be added later without restructuring.
- **Trade-offs and risks:** Mock AI responses don't demonstrate real AI capability. This is acceptable for a prototype that proves the architecture and UX.
- **Requirements affected:** All (cost constraint is cross-cutting).
- **Revisit condition:** When budget is available or when a suitable free-tier API is identified.

### ADR-016: Scope discipline — no additional tools or frameworks without justification

- **Status:** Accepted
- **Date:** 2026-10-24
- **Context:** The specification prohibits introducing additional frameworks, databases, APIs, agents, orchestration tools, or dependencies without a concrete requirement. n8n is explicitly prohibited.
- **Decision:** Every new dependency must be justified against a concrete requirement and documented in this ADR file before installation. The current approved dependency list is: `react`, `react-dom`, `react-router-dom`, `vite`, `@vitejs/plugin-react`, `vitest`. No n8n, no additional UI framework, no database, no external API client.
- **Alternatives considered:** N/A — this is a process decision, not a technology choice.
- **Rationale:** Directly implements the specification's non-negotiable development rules.
- **Trade-offs and risks:** May slow development if a genuinely useful library is available. Mitigated by the documented justification process (add an ADR, not a blanket prohibition).
- **Requirements affected:** Non-negotiable rules 4, 5, 14, 15.
- **Revisit condition:** Any new dependency triggers this process.

### ADR-020: Interview engine — explicit transition table and separated raw transcripts

- **Status:** Accepted
- **Date:** 2026-10-24
- **Context:** Phase 2 implements the interview engine. The specification demands explicit states, invalid transition guards, repetition/clarification handling, follow-up bounds, and strict separation between raw recognised transcript and AI interpretation.
- **Decision:** Implemented `InterviewStateMachine` as an immutable transition table mapping states to allowed events. Guarded transitions prevent jumping states or continuing past completion. `QuestionManager` enforces `maxFollowUps` and deterministic sequence ordering. `InterviewEventLog` strictly stores raw recognised speech in `recognizedText` and never allows AI summaries or interpretations to overwrite or mask the candidate's actual words.
- **Alternatives considered:** Event-emitter driven free flows, or allowing the LLM to decide when an interview is over.
- **Rationale:** Prevents hallucinated conversation state, ensures predictable auditability, and guarantees recruiter review fidelity.
- **Trade-offs and risks:** Requires explicit code paths for every possible user action (pause, skip, repeat). Mitigated by comprehensive unit test suites covering every transition.
- **Requirements affected:** B.1–B.5, D.1–D.3.
- **Revisit condition:** When voice streaming or websocket transport is introduced in future iterations.

### ADR-021: Dashboard job positions layout — card-based presentation over data table

- **Status:** Accepted
- **Date:** 2026-10-24
- **Context:** The Phase 0 plan listed `src/components/ui/Table.jsx`, but the recruiter dashboard was implemented using interactive, accessible `JobCard` components displaying status badges, descriptions, and counter summaries.
- **Decision:** Retain the card-based layout for the recruiter dashboard's job position overview and deviate from the initial file checklist by deferring `Table.jsx` until Requirement A.4 (Interview List). Do not build an unused `Table.jsx` component simply to satisfy a checklist.
- **Alternatives considered:**
  - **Replace cards with Table:** Degrades readability on mobile/tablet viewports and restricts display of multiline descriptions and multiple count badges.
  - **Build an unused Table component:** Violates scope discipline and introduces dead, untested code into the bundle.
- **Rationale:** Job position items have variable-length descriptions and several metadata badges that naturally suit a card layout. Data tables are better suited for homogeneous, tabular candidate interview rows (Requirement A.4).
- **Trade-offs and risks:** Column sorting by arbitrary attribute is not available directly on the overview; compensated by clear status filtering and timestamps.
- **Requirements affected:** A.1, UI direction.
- **Revisit condition:** Revisit when implementing Requirement A.4 (Interview List) or if recruiter position volume exceeds 50+ items requiring dense tabular pagination.

### ADR-022: Storage initialization and race-condition elimination

- **Status:** Accepted
- **Date:** 2026-10-24
- **Context:** An audit identified that calling `seedIfEmpty()` inside `App.jsx` `useEffect` triggered after child `Dashboard.jsx`'s `useEffect`, resulting in a blank initial render on a user's first visit.
- **Decision:** Execute `seedIfEmpty()` synchronously in `src/main.jsx` before `ReactDOM.createRoot().render()`. Added `typeof localStorage === 'undefined'` environment guards across `store.js` and `synthetic.js`. In `synthetic.js`, if existing jobs are detected, set the `hirepilot:seeded` marker immediately to guarantee that custom user positions are never overwritten and deleted jobs are not resurrected.
- **Alternatives considered:**
  - **Asynchronous polling/setTimeout in Dashboard:** Fragile, conceals the race condition, and adds artificial render delay.
  - **Full state management library (Zustand/Redux):** Violates ADR-005 and ADR-016.
- **Rationale:** Synchronous storage check prior to React component tree mounting guarantees that the store has seed records available on the very first mount without render flashing or race conditions.
- **Trade-offs and risks:** Adds a negligible synchronous storage check during application boot.
- **Requirements affected:** A.1, Engineering principle (reliable data layer).
- **Revisit condition:** When remote API backend persistence is introduced in Phase 4.

### ADR-023: Explicit question skipping and interruption handling in interview engine

- **Status:** Accepted
- **Date:** 2026-10-24
- **Context:** The interview engine required explicit mechanisms to skip questions (Requirement B.4) and handle candidate speech occurring while the interviewer is speaking without corrupting state or prematurely advancing questions.
- **Decision:**
  - **Skipping:** Added `InterviewEvent.SKIP_QUESTION`, permitted exclusively from `SPEAKING_QUESTION`, `LISTENING`, and `FOLLOW_UP`, transitioning to `PROCESSING_RESPONSE`. `QuestionManager.skipQuestion()` registers the skip and guarantees `canFollowUp()` returns `false`. `InterviewEventLog.logSkip()` records the event with `skipped: true` and empty `recognizedText` so downstream evaluation cannot mistake it for an answered question.
  - **Interruption:** Added `InterviewEvent.CANDIDATE_INTERRUPTED`, permitted from `SPEAKING_QUESTION` and `FOLLOW_UP`, transitioning to `LISTENING`. Increments `context.interruptionCount`, tracks `lastAction: 'interrupted'`, and leaves the active question intact. The candidate can then answer (`RESPONSE_RECEIVED`), ask to re-hear the question (`REQUEST_REPEAT` -> `SPEAKING_QUESTION`), or skip (`SKIP_QUESTION`).
- **Alternatives considered:**
  - **Dedicated INTERRUPTED state:** Unnecessary complexity; `LISTENING` already possesses the complete transition vocabulary required for candidate speech, repeat requests, pauses, and timeouts.
  - **Free-form LLM control:** Prohibited by specification and ADR-007.
- **Rationale:** Keeps the engine purely deterministic, preserves question ordering and follow-up limits, and keeps the engine completely independent of browser Web Speech APIs.
- **Trade-offs and risks:** The future voice adapter must coordinate cancelling ongoing speech synthesis upon candidate speech detection.
- **Requirements affected:** B.1–B.5, D.1–D.3.
- **Revisit condition:** If real-time bidirectional audio streaming requires fine-grained millisecond barge-in telemetry.

### ADR-024: Browser voice abstraction layer contracts and runtime boundary

- **Status:** Accepted
- **Date:** 2026-10-24
- **Context:** Phase 2A implements the browser voice abstraction layer. Requirements C.1–C.5 demand runtime feature detection, truthful capability reporting, clean separation from the interview engine, and prevention of duplicate transcription accumulation or infinite restart loops.
- **Decision:**
  - **Module Separation:** Implemented three distinct modules under `src/voice/`:
    1. `capabilities.js`: `detectCapabilities(windowObj)` returns a normalized capability object (`hasSpeechRecognition`, `hasSpeechSynthesis`, `supportsFullVoice`, `supportsTextInputFallback`, `mode`, `summary`, `details`). Operates purely via feature detection rather than user-agent sniffing.
    2. `speechRecognition.js`: `BrowserSpeechRecognizer` wraps `SpeechRecognition` / `webkitSpeechRecognition`. Features dependency-injected constructor, monotonic index tracking to prevent duplicate final transcripts, error mapping (`isPermissionDenied`, `isNoSpeech`, `isAudioCaptureError`), and `onSpeechStart` hook for barge-in detection. Never silently falls back and never loops restarts.
    3. `speechSynthesis.js`: `BrowserSpeechSynthesizer` wraps `window.speechSynthesis`. Features `speak(text, options)`, `stop()`, clean event handler detachment, and automatic pre-cancellation of in-flight utterances.
  - **Engine Boundary:** The voice layer is an I/O adapter. It does not import, touch, or decide interview states or question order. The future interview controller will translate voice callbacks into `InterviewStateMachine` events (`QUESTION_SPOKEN`, `CANDIDATE_INTERRUPTED`, `RESPONSE_RECEIVED`, `SILENCE_TIMEOUT`).
  - **Browser Limitations:** Safari (macOS/iOS) lacks recognition APIs but supports synthesis (`synthesis_only` mode); text-input fallback is mandatory for Safari. Chromium browsers support both APIs but require user gesture activation and permission prompts.
- **Alternatives considered:**
  - **Coupling voice events directly to state machine inside voice adapter:** Rejected because it destroys module independence and makes headless unit testing impossible.
  - **Third-party speech API (Deepgram/Whisper):** Prohibited by zero-budget constraint (ADR-015).
- **Rationale:** Strict adapter interfaces allow mocking browser hardware in unit tests, report browser capabilities honestly without spoofing, and isolate audio quirks from recruitment business logic.
- **Trade-offs and risks:** In `synthesis_only` or `text_fallback_only` modes, speaking pace and audio metrics cannot be captured; they must be marked as unavailable per ADR-011.
- **Requirements affected:** C.1–C.5, F.2, Engineering principles (replaceable providers, module separation).
- **Revisit condition:** When adding server-side speech recognition or WebSocket streaming in multi-user production phases.

### ADR-025: Live interview session controller and UI architecture

- **Status:** Accepted
- **Date:** 2026-10-24
- **Context:** Phase 2B connects the deterministic interview state machine, question manager, event log, voice adapters, and manual text input fallback into a browser-based candidate interview experience.
- **Decision:**
  - **Single Orchestration Controller:** Implemented `InterviewController` (`src/engine/interviewController.js`) as the coordinating authority. The controller coordinates `InterviewStateMachine`, `QuestionManager`, `InterviewEventLog`, `BrowserSpeechRecognizer`, and `BrowserSpeechSynthesizer`.
  - **Explicit Consent Gating:** Candidate must review instructions and grant explicit consent (`grantConsent()`) before audio capture or synthesis is initiated. The action is audited in `InterviewEventLog` as `CANDIDATE_CONSENT_GRANTED`.
  - **Deterministic State Progression:** Question presentation, listening, answering, repetition, clarification, and completion follow strictly guarded state machine transitions. Concurrency guards (`isSubmitting` and `isAdvancing`) eliminate race conditions, duplicate submissions, and double question advancement.
  - **Seamless Manual Text Fallback:** When speech recognition is unsupported or microphone access is denied by the user, `setInputMode('text')` activates a manual text interface. Answers are submitted directly without fabricating audio metrics or raw speech transcripts.
  - **Interruption and Question Preservation:** Detecting candidate speech during question playback (`_handleCandidateSpeechStart` / `interruptQuestion`) halts synthesis and transitions to `LISTENING` while preserving the active question prompt.
  - **Lifecycle Cleanup:** On component unmount or session termination, `destroy()` halts active recognition, cancels speech synthesis, and unregisters all event subscriptions to prevent memory leaks and stale callbacks.
  - **Candidate Session UI:** Implemented `src/pages/InterviewSession.jsx` and `InterviewSession.css` featuring consent acknowledgment, live question presentation, listening/speaking state indicators, transcript review drawer, confirmation before early exit, and polite completion and aborted screens.
- **Alternatives considered:**
  - Embedding session orchestration directly in React state inside `InterviewSession.jsx`: Rejected because domain logic would become coupled to React rendering lifecycles, preventing clean headless unit testing.
  - Auto-submitting on brief pauses: Rejected because candidate hesitation could lead to premature submission; candidate retains explicit submission control.
- **Rationale:** Ensures clean decoupling between presentation and interview logic, prevents stale callbacks from corrupting state, respects candidate consent and privacy, and provides a robust fallback across all browsers.
- **Trade-offs and risks:** Session state is held in client memory during the interview; a browser reload restarts the interview from the introduction screen. Session persistence and crash recovery are deferred to U-005.
### ADR-026: Speech synthesis voice quality, utterance cancellation isolation, and distinct recruiter workflows

- **Status:** Accepted
- **Date:** 2026-10-25
- **Context:** During product-quality verification, spoken interview questions sounded robotic/crackly, cancellation callbacks during pause/skip/repeat could cause race conditions with question playback completion, and the recruiter dashboard and job configuration pages lacked distinct operational focus.
- **Decision:**
  - **Natural Voice Selection Algorithm:** `BrowserSpeechSynthesizer` actively queries `getVoices()` and subscribes to the browser's asynchronous `voiceschanged` event. It scores voice candidates to prioritize neural/natural/enhanced human voices (e.g., Google US English, Samantha, Ava, Daniel) while penalizing legacy novelty/robotic voices (e.g., Fred, Albert, Zarvox).
  - **Calibrated Pacing & Pitch:** Set a moderate, articulate speaking rate (0.92) and neutral pitch (1.0) to deliver composed question prompts.
  - **Monotonic Utterance Tracking:** Assigned a monotonic sequence token (`_currentUtteranceId`) to every speech request. Callbacks from superseded or cancelled utterances are completely discarded, preventing overlapping playback and stale callback corruption.
  - **Cancellation vs. Error Distinction:** `InterviewController` explicitly inspects `err.isCanceled`. Intentional cancellations (pause, interruption, skip, repeat, end) never trigger question advancement or transitions to `QUESTION_SPOKEN`. Genuine synthesis failures recover gracefully into `LISTENING` mode with a visible prompt and non-blocking notification.
  - **Immediate Interruption Mic Activation:** Candidate barge-in (`interruptQuestion`) immediately activates the speech recognizer when in voice mode.
  - **Differentiated Recruiter Architecture:**
    - Recruiter Dashboard: Operations hub answering "What is happening across my hiring activity?" with real pipeline metrics (total roles, active screening, drafts, total configured questions), status filtering, and directory table.
    - Role Configuration Page: Focused role architect answering "How do I configure this role?" with competency framework (Required vs Preferred skills), sequential question ordering with reordering controls, mandatory criteria with evaluation guidance, and a dedicated LinkedIn job URL importer featuring honest loading, error, and review states.
- **Alternatives considered:**
  - Adding a paid cloud TTS provider (ElevenLabs/OpenAI Audio): Prohibited by zero-budget constraint (ADR-015) without prior approval.
  - Hardcoding a single voice name: Rejected because installed voice names vary drastically across macOS, Windows, Linux, and mobile browsers.
- **Rationale:** Resolves audio usability defects purely using free Web Speech APIs, eliminates race conditions between cancellation and question transitions, and provides a distinct, credible B2B recruiting product experience.
- **Trade-offs and risks:** Voice quality remains bounded by browser/OS-installed voices; on systems with only legacy synthesizer voices, quality will be lower than cloud neural voices, but visual text fallback ensures 100% interview accessibility.
- **Requirements affected:** C.2, C.4, A.1–A.4, Objective 1 & 2.
### ADR-027: Versioned interview session persistence, exact evidence validation, and deterministic analysis provider abstraction

- **Status:** Accepted
- **Date:** 2026-10-25
- **Context:** Finishing or aborting an interview produced no durable session record, candidate responses were lost upon returning to the recruiter dashboard, and no honest, evidence-backed evaluation report existed.
- **Decision:**
  - **Versioned InterviewSession Domain Model:** Defined schema version `1` for sessions (`SESSION_SCHEMA_VERSION = 1`) stored under localStorage key `hirepilot:sessions`. Record captures `id`, `jobId`, `jobSnapshot` (immutable copy of role title, requirements, criteria, and questions at interview start), `status` (`in_progress` | `completed` | `aborted`), `startedAt`, `endedAt`, `turns`, and `analysis`.
  - **Incremental Persistence:** `InterviewController` writes to `sessionStore` incrementally at interview start, each question asked, each finalized answer, each skip, and upon completion or abort. Candidate reload or abort preserves all recorded turns.
  - **Requirement Linkage:** Added `requirementIds` to `InterviewQuestion` defaulting to `relatedSkills`. Unlinked questions are reported as "Unmapped", never guessed.
  - **Analysis Provider Abstraction & Deterministic Transcript Provider:** Created `AnalysisProvider` interface (`analyze(session) => Promise<AnalysisResult>`). Default implementation `DeterministicTranscriptProvider` maps recorded finalized answers to linked requirements producing only `Not assessed` (no linked questions answered) and `Awaiting analysis` (verbatim quotes recorded, non-evaluative). Semantic labels (`Demonstrated`, `Partially demonstrated`, `Insufficient evidence`) are prohibited for deterministic providers.
  - **Exact Substring Evidence Validation:** Added `validateEvidenceQuotes` which strictly rejects any evidence quote not found as an exact substring in finalized candidate answers, marking rejected quotes invalid and surfacing their count.
  - **Honest Recruiter Reporting UI:** Added `/interviews` directory and `/interviews/:sessionId` report page displaying honest provider status banners, objective computed-fact executive summaries, requirement coverage, unmapped questions, and full chronological transcripts with follow-up rationales.
- **Alternatives considered:**
  - Mock semantic provider fabricating ratings: Rejected as deceptive; deterministic mode honestly reflects un-evaluated evidence.
  - Deferring session persistence: Rejected because candidates and recruiters lost interview results immediately upon navigating.
- **Rationale:** Satisfies core requirement for durable, evidence-backed screening records with zero hallucinated evaluations or fabricated metrics.
- **Trade-offs and risks:** Single-client localStorage storage is bounded by browser storage limits; multi-user backend migration remains scheduled for future phase.
- **Requirements affected:** D.1–D.4, E.1–E.5, F.2.
- **Revisit condition:** When real semantic AI provider is integrated in Phase 3.

### ADR-028: Multi-layer evidence verification, ServerSemanticAnalysisProvider, and non-destructive retry

- **Status:** Accepted
- **Date:** 2026-10-25
- **Context:** Automated or semantic evaluations must be strictly grounded in verbatim transcript evidence. Model hallucinations, ungrounded competence ratings, wrong-turn attribution, and fabricated quotes must be rejected deterministically by code before reaching recruiter review.
- **Decision:**
  - **5 Code-Enforced Verification Layers:**
    1. Exact Substring Quote Validation: Quotes must be exact substrings of recorded candidate answers (whitespace normalized).
    2. Turn Citation & Linkage: Cited turns must exist and be linked to the requirement (or explicitly flagged as cross-turn evidence).
    3. Status Consistency: `Demonstrated` requires >=1 valid quote (downgraded to `Insufficient evidence` if none); `Partially demonstrated` requires >=1 valid quote and missing evidence explanation; `Not assessed` is computed by code based on interview coverage and cannot be overridden by model ratings.
    4. Contradiction Justification: Contradiction claims must cite >=2 valid quotes demonstrating the opposing statements.
    5. Observation/Inference Separation: Observations are candidate-grounded; confidence is capped by code (single short quotes cannot yield `high` confidence).
  - **ServerSemanticAnalysisProvider & Registry:** Registered `server-semantic-v1` in `ProviderRegistry` calling server boundary `/api/analysis/session`.
  - **Non-Destructive Retry:** When analysis encounters an upstream timeout or failure, the stored session preserves all turns, job snapshots, and candidate responses. Recruiters can retry analysis on the existing transcript without altering interview data.
- **Rationale:** Prevents model hallucination from contaminating candidate evaluation records and guarantees that every displayed quote is factual evidence.
- **Requirements affected:** Checkpoint 5, ADR-020.

---

## Provisional Decisions

### ADR-017: AI provider selection (provisional)

- **Status:** Provisional
- **Date:** 2026-10-24
- **Context:** The evaluation engine and follow-up question generation will need an LLM. No provider has been selected yet.
- **Decision:** Defer provider selection. The mock provider is sufficient for Phases 1–2. Leading candidates are: Gemini free tier, local model via Ollama, OpenAI free tier.
- **Alternatives considered:** See above candidates. No evaluation has been performed yet.
- **Rationale:** Premature to commit without testing free-tier quotas and output quality against the structured evaluation schema.
- **Trade-offs and risks:** Deferral means real AI integration is untested until Phase 3.
- **Requirements affected:** B.2 (follow-ups), E (evaluation).
- **Revisit condition:** Must resolve before Phase 3 (evaluation) begins. Evaluate: rate limits, output format reliability, cost, and structured output support.

### ADR-018: Backend architecture (provisional)

- **Status:** Provisional
- **Date:** 2026-10-24
- **Context:** The current prototype is client-only. A backend will be needed for: secure AI API calls (hiding API keys), persistent multi-user storage, and deployment.
- **Decision:** Defer backend selection. The localStorage adapter pattern ensures the frontend is backend-ready. Leading candidates: Express + SQLite, Hono + SQLite, serverless functions.
- **Alternatives considered:** See above candidates. Not evaluated yet.
- **Rationale:** Phase 1 validates the data model and UI before committing to backend infrastructure.
- **Trade-offs and risks:** Deferral means the prototype is single-user and loses data on browser clear.
- **Requirements affected:** A (multi-user dashboard), D (persistent transcripts), E (persistent reports).
- **Revisit condition:** Must resolve before multi-user or deployment requirements are introduced. Likely Phase 4+.

### ADR-019: Speech recognition fallback for unsupported browsers (provisional)

- **Status:** Provisional
- **Date:** 2026-10-24
- **Context:** Safari and some browsers lack `SpeechRecognition`. The host machine has Safari and Brave (no Chrome). A fallback is needed.
- **Decision:** Provide a manual text-input fallback when speech recognition is unavailable. The fallback is clearly labelled and does not pretend to be voice-based.
- **Alternatives considered:**
  - **Pre-recorded audio upload:** More complex, adds file-handling requirements.
  - **Skip interview entirely:** Unacceptable — makes the product unusable on common browsers.
  - **Third-party speech API:** Adds cost.
- **Rationale:** Text input is the simplest fallback that preserves interview functionality.
- **Trade-offs and risks:** Text input loses speech analytics data. Metrics are marked as unavailable.
- **Requirements affected:** C.4 (graceful handling), F.2 (unavailable measurement marking).
- **Revisit condition:** When voice integration is implemented (Phase 2). If a free speech API becomes available, reconsider.

---

## Unresolved Decisions

| ID | Question | Must resolve by | Blocking? |
|----|----------|-----------------|-----------|
| U-001 | Which AI provider to use for evaluation and follow-ups? | Before Phase 3 | No (mock is sufficient until then) |
| U-002 | Backend framework and database for multi-user persistence? | Before Phase 4 or deployment | No (localStorage is sufficient for prototype) |
| U-003 | End-to-end testing framework (Playwright vs. Cypress)? | Before Phase 2 voice UI completion | No (unit tests are sufficient) |
| U-004 | Deployment target (Vercel, Netlify, self-hosted)? | Before production release | No |
| U-005 | How to handle interview session recovery after browser crash? | Before production release | No |

---

## Superseded Decisions

_None yet._
