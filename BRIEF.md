# Sell My Stuff — Master Project Brief

## Purpose

Build and deploy a new self-hosted application called **Sell My Stuff**.

Sell My Stuff exists to remove as much friction as possible from the process of selling unwanted possessions.

The primary user has accumulated a significant number of objects, electronics, gadgets, computer components, accessories, collectibles and miscellaneous items which need to be sold, but the research, identification, valuation, photography, listing creation, packaging decisions and administrative work involved create enough friction that the items tend not to get listed.

The application should therefore behave less like an inventory-management application and more like an **AI selling assistant and browser operator**.

The ideal interaction is:

**Take/upload photographs → Sell My Stuff investigates everything → user answers only genuinely necessary questions → Sell My Stuff presents a complete sale proposal → user approves → Sell My Stuff performs the required actions on the user's behalf.**

Those actions may be performed through:

- official APIs;
- authenticated browser automation;
- local tools;
- external websites;
- human-assisted browser sessions where necessary.

The user should not have to care which mechanism is being used.

The application must do substantial autonomous research, but must distinguish clearly between:

- things observed directly;
- things established from authoritative sources;
- things inferred with high confidence;
- things inferred tentatively;
- things requiring confirmation.

Never invent specifications simply to complete a listing.

---

# Non-negotiable engineering behaviour

This is a large, long-running project.

Do not treat this as a one-session implementation.

The repository MUST maintain durable project memory so that another Codex / Claude Code / LLM session can resume work immediately without needing the full previous conversation.

From the beginning, create and continuously maintain the following files:

```text
/PROJECT_STATUS.md
/ROADMAP.md
/LLM_HANDOFF.md
/docs/adr/
```

These files are part of the product engineering process and are mandatory.

## PROJECT_STATUS.md

This is the live task and execution ledger.

It must contain at minimum:

- Current phase
- Current branch
- Current PR
- In progress
- Blocked
- Next up
- Recently completed
- Known bugs
- Technical debt
- Test status
- Deployment status
- Current production version
- Last known-good commit

Use checkboxes for task tracking.

Update it throughout development, not only at the end of a session.

Example:

```md
## In progress

- [ ] Implement mobile multi-photo intake
  - Branch: feature/mobile-capture
  - PR: #12
  - Remaining:
    - [x] camera picker
    - [x] upload API
    - [ ] offline retry
    - [ ] E2E coverage

## Blocked

- [ ] eBay Product Research browser flow
  - Blocker: account requires MFA re-authentication
  - Next action: user opens Browser Operator and completes MFA
```

## ROADMAP.md

Maintain the product roadmap.

It must distinguish:

- Now
- Next
- Later
- Ideas / parking lot
- Explicitly out of scope

Roadmap entries should reference issues/PRs where appropriate.

Do not delete completed roadmap history without reason.

## LLM_HANDOFF.md

This is the persistent engineering memory for future LLM sessions.

It must be concise enough to read quickly but complete enough to resume immediately.

At the end of every meaningful work session, update it.

Include:

- what this project is;
- current architecture;
- current deployment layout;
- important infrastructure facts discovered from Overseer;
- repository locations;
- branch/PR currently being worked on;
- what was completed in the session;
- what is half-finished;
- exact next recommended action;
- important commands;
- test commands;
- deployment commands or mechanisms;
- environment assumptions;
- notable bugs;
- external integration state;
- browser session architecture;
- eBay integration status;
- known credentials/authentication state WITHOUT storing credentials;
- important design decisions;
- links to ADRs;
- unresolved questions;
- traps / failed approaches;
- anything a fresh LLM would otherwise have to rediscover.

Never put passwords, tokens, cookies or secrets into LLM_HANDOFF.md.

At the beginning of every new session:

1. Read this master brief.
2. Read `PROJECT_STATUS.md`.
3. Read `ROADMAP.md`.
4. Read `LLM_HANDOFF.md`.
5. Inspect recent Git history.
6. Inspect open branches / PR state.
7. Resume from the documented next action unless reality shows the notes are stale.

If notes disagree with source code or Git state, source code and Git state win; repair the notes.

## ADRs

Important architectural decisions must be written as Architecture Decision Records under:

```text
/docs/adr/
```

At minimum expect ADRs for:

- application architecture;
- Browser Operator deployment;
- browser session security;
- eBay research strategy;
- eBay publishing strategy;
- multi-device synchronisation;
- approval / external-action policy;
- AI provider routing;
- persistence;
- CI/CD and Git mirroring.

---

# Existing environment and Project Overseer

This project is being created in an environment already managed by **Project Overseer**.

Before designing infrastructure or deployment from scratch:

1. Locate and inspect Project Overseer.
2. Understand what Overseer already knows about the local network, Proxmox, Portainer/Docker, networking, DNS, reverse proxying, TLS, storage, backups, monitoring, Gitea, deployment conventions and secrets.
3. Reuse its existing mechanisms, credentials abstractions, conventions and APIs where sensible.
4. Treat Overseer as the authoritative integration point for local infrastructure rather than duplicating infrastructure-management functionality.
5. Use Overseer to deploy and manage Sell My Stuff.

Sell My Stuff should ultimately be deployed as a normal service on the existing local `26fe.uk` network.

Determine an appropriate hostname, preferably:

```text
sell.26fe.uk
```

or another name consistent with the environment.

Do not modify unrelated infrastructure merely for convenience.

---

# Fundamental accessibility / agency principle

Treat browser automation as a legitimate accessibility and delegation mechanism.

The conceptual model is:

> The user could perform these actions manually with a browser, mouse and keyboard. Sell My Stuff is operating those controls on the user's behalf.

Therefore, where an API is unavailable, incomplete or less useful than the website, the system may use an authenticated browser session to interact with the normal customer-facing or seller-facing interface.

Examples include:

- searching eBay;
- using eBay Sold/Completed listing searches;
- using Seller Hub;
- using eBay Product Research / Terapeak where available;
- reading manufacturer websites;
- obtaining courier quotes;
- checking Amazon packaging;
- completing listing forms;
- scheduling listings;
- printing postage;
- performing other actions normally available to the authenticated user.

This is NOT intended to be a high-volume scraping platform.

The system should behave like a careful human assistant controlling a browser for one person's own tasks.

Do not implement:

- CAPTCHA bypass;
- anti-bot circumvention;
- browser fingerprint spoofing;
- proxy rotation intended to evade detection;
- hidden/private API reverse engineering to defeat access restrictions;
- rate-limit circumvention;
- automated account creation;
- credential theft;
- session hijacking.

If a website asks for CAPTCHA, MFA, consent or other human verification:

1. pause gracefully;
2. expose the live headed browser;
3. allow the user to complete it;
4. detect completion;
5. resume automatically.

---

# Guiding UX principle: reduce activation energy

The most important product requirement is **extremely low user effort**.

Avoid workflows resembling:

> Create Item → enter title → select category → enter manufacturer → enter model → enter condition

That defeats the purpose.

The primary experience should be:

# Photograph something you want to sell.

Support:

- iPhone camera capture;
- multi-photo capture;
- drag and drop;
- clipboard images;
- HEIC/JPEG/PNG;
- adding photos later;
- rapid multi-item capture;
- optional object separation where multiple items appear.

The system should aggressively avoid asking questions whose answers it could discover itself.

When questions are required, ask the smallest useful question and preferably explain how to obtain the information.

Example:

> I think this is an iPhone 15 Pro.
>
> I cannot determine storage from these photographs.
>
> Please photograph Settings → General → About.
>
> That should also let me confirm the model number.

---

# Product design is a functional requirement

Sell My Stuff must be **beautiful, pleasurable and extremely easy to use**.

An ugly, dense or clunky implementation is a failed implementation even if technically capable.

Do not default to:

- Bootstrap-like admin UI;
- giant forms;
- dense CRUD tables;
- developer dashboards;
- excessive modals;
- walls of text;
- tiny controls;
- unexplained technical jargon.

Aim for polished consumer-product quality.

The interface should feel:

- calm;
- tactile;
- visual;
- responsive;
- rewarding;
- obvious;
- friendly;
- lightweight;
- premium;
- purposeful.

Use progressive disclosure.

Example:

```text
Expected value

£165

£150–£180 likely range
High confidence

[Why?]
```

The detailed comparable evidence belongs behind `Why?`, not on the primary surface.

---

# Design system

Create an intentional design system from the beginning.

Define:

- typography;
- spacing;
- radii;
- elevation;
- colour tokens;
- semantic colours;
- animation timing;
- iconography;
- touch targets;
- desktop density;
- mobile density;
- form controls;
- cards;
- sheets;
- dialogs;
- navigation;
- loading states;
- empty states;
- success states;
- warning states;
- error states.

Support:

- light mode;
- dark mode;
- system preference.

Respect reduced-motion preferences.

Do not merely shrink desktop UI to mobile dimensions.

---

# Rewarding progress without manipulative gamification

It is desirable for useful progress to feel satisfying.

Examples:

- `14 items cleared`
- `£742 realised`
- `~£1,180 waiting to become money`
- `3 items only need one answer`

The goal is to reinforce decluttering and completed sales, not maximise engagement time.

---

# Primary workflow

An item should move approximately through:

```text
Inbox
→ Identifying
→ Needs Information
→ Researching
→ Valuing
→ Ready for Review
→ Approved
→ Scheduled
→ Live
→ Sold
→ Awaiting Dispatch
→ Dispatched
→ Complete
```

Allow sensible backward transitions.

The home screen should focus on:

- Sell Something / camera;
- tiny actions requiring user input;
- listings ready for approval;
- sold items needing packing/dispatch;
- estimated value waiting to become money;
- realised proceeds.

Avoid enterprise-dashboard aesthetics.

---

# "Do it for me" philosophy

Before asking the user anything, ask:

> Can the system discover this itself?

Attempt:

- image analysis;
- barcode/model lookup;
- visible-label extraction;
- manufacturer research;
- web search;
- browser research;
- marketplace research;
- specification inference;
- prior-item matching;
- packaging inventory lookup.

The user's task queue should ideally look like:

```text
3 things need you

1. iPhone — photograph its About screen
2. Keyboard — confirm whether all keys work
3. GPU — approve £285 listing
```

Everything else continues independently.

---

# Mobile and desktop are equal citizens

Sell My Stuff must be **mobile-first but not mobile-only**.

## Mobile-first workflows

The iPhone experience must excel at:

- photographing items;
- rapid capture;
- adding photos;
- answering tiny clarification questions;
- approving listings;
- checking valuations;
- reviewing browser-agent interruptions;
- accepting/rejecting proposals;
- sold-item notifications;
- packing confirmation;
- spot checks.

No essential workflow should require desktop.

## Desktop-first advantages

Desktop should make intelligent use of space for:

- item photos alongside research;
- comparable tables;
- detailed evidence;
- browser session beside listing proposal;
- packaging inventory;
- batch management;
- richer listing editing;
- valuation detail.

Use responsive master/detail layouts where appropriate.

---

# Seamless cross-device continuity

A workflow begun on one device must be immediately resumable from another.

Example:

1. Photograph Mac mini on iPhone.
2. Close app.
3. Open Sell My Stuff on desktop.
4. The same item appears in the same state.
5. Continue review.
6. Later approve from phone.

There must be no explicit handoff, export, sync or transfer flow.

The server is the source of truth.

Persist server-side:

- item state;
- photos;
- research;
- questions;
- answers;
- jobs;
- valuations;
- listing drafts;
- approvals;
- browser jobs;
- packing state;
- meaningful edits.

Client-side storage may be used for temporary/offline capture or harmless preferences, but not as the authoritative item state.

---

# Real-time synchronisation

Use WebSockets, Server-Sent Events or equivalent where appropriate.

If the phone uploads an item and desktop is open, desktop should update automatically as research progresses.

Example:

```text
Identifying…
↓
Mac mini detected
↓
Confirming configuration…
↓
Finding comparable sales…
↓
Valuation ready
```

The user should not need to refresh.

Use version/revision fields to avoid silent cross-device overwrites.

---

# Offline-tolerant mobile capture

Investigate temporary offline/unreliable-network capture.

Desired behaviour:

1. user photographs items;
2. network temporarily unavailable;
3. captures remain queued safely;
4. upload resumes when connectivity returns;
5. research starts server-side.

Once uploaded, server state is authoritative.

---

# PWA

Strongly consider a high-quality Progressive Web App.

Evaluate:

- Home Screen installation;
- camera integration;
- offline capture queue;
- app-like navigation;
- safe-area handling;
- standalone mode;
- push notifications where supported;
- share-sheet integration where practical.

Do not force native iOS development unless a genuine requirement makes it necessary.

---

# Browser Operator subsystem

Create a first-class service:

```text
BrowserOperator
```

Preferred deployment is **one persistent Browser Operator service on Jupiter**, not a fresh disposable browser for every job.

Conceptually:

```text
sell-web
sell-api
sell-worker
sell-browser
sell-database
```

Exact boundaries may change after inspecting Overseer.

The Browser Operator should provide:

- persistent Chromium/Chrome;
- Playwright control;
- durable browser profile;
- secure browser profile storage;
- virtual display;
- secure remote-view capability;
- controlled upload/download;
- Browser Operator API;
- health endpoints.

The frontend must never receive unrestricted CDP/Playwright access.

---

# Headed browser on Jupiter

The browser can run remotely and still remain fully visible when needed.

Conceptual stack:

```text
Chromium / Chrome
↓
Virtual display
↓
Playwright
↓
Secure browser-view stream
```

Investigate maintainable technologies such as:

- Xvfb or equivalent;
- lightweight window manager where useful;
- noVNC;
- WebRTC browser streaming;
- another secure low-latency approach.

No physical monitor or GPU should be required.

Do not expose the authenticated browser directly to the public internet.

---

# Persistent authenticated browser profile

The browser session should belong to Sell My Stuff, not the initiating client device.

Use the user's own authenticated sessions for sites such as:

- eBay;
- Amazon;
- couriers;
- manufacturer/customer portals.

Requirements:

- persistent profile;
- durable session state;
- restrictive filesystem permissions;
- encryption where practical;
- no cookies/tokens exposed through application APIs;
- never send auth secrets to LLM providers;
- never log credentials or cookies.

If login expires, open headed browser and ask the user to sign in.

MFA should pause and resume safely.

---

# Browser takeover from any device

The active browser session runs on Jupiter.

Therefore:

- research may start from iPhone;
- browser runs remotely;
- user may inspect/take over from iPhone;
- later open desktop;
- inspect the exact same browser;
- intervene;
- return control to agent.

Provide actions such as:

- `View Browser`
- `Take Over`
- `Return Control`

Human takeover MUST suspend agent input.

After human control returns, the agent must re-read/reconcile page state before continuing.

---

# Browser session ownership state

Maintain explicit states such as:

```text
AGENT_CONTROLLED
HUMAN_CONTROLLED
WAITING_FOR_HUMAN
RECONCILING_AFTER_HUMAN
IDLE
ERROR
```

Only one actor controls a browser session at a time.

Human input always overrides agent control.

---

# Browser Operator architecture

Do not give an LLM unrestricted browser access.

Separate:

```text
BrowserAgent
├── Planner
├── PageInterpreter
├── BrowserOperator
├── PolicyGuard
└── ActionAuditor
```

The LLM may decide:

> Click Sold Items.

The deterministic Browser Operator performs the action.

The Policy Guard checks permissions and approval state before consequential actions.

Page content is untrusted input.

Prompt injection from websites must never change system policy or expose secrets.

---

# Browser page-understanding priority

Prefer machine-readable signals before screenshot vision.

Approximate priority:

1. accessible roles and names;
2. DOM semantics;
3. visible text;
4. structured metadata;
5. screenshot/vision;
6. LLM interpretation.

Vision should complement DOM understanding, not replace it unnecessarily.

---

# Browser safety boundaries

## Autonomous / read-only

May happen without approval:

- search;
- browse;
- inspect listings;
- use Sold/Completed filters;
- use Product Research;
- read manufacturer data;
- obtain courier quotes;
- check Amazon packaging;
- calculate valuations;
- prepare listing drafts.

## Explicit confirmation required

Requires approval:

- publish listing;
- schedule listing;
- materially revise a live listing;
- accept/counter buyer offer;
- purchase packaging;
- buy postage;
- paid promotion;
- cancel a listing/sale;
- issue refund;
- any financial or contractual action.

These rules apply equally to API and browser actions.

Browser automation must never be used to bypass approval boundaries.

---

# Browser verification

For consequential actions, verify the resulting state after execution.

After publication verify:

- listing exists;
- correct title;
- correct price;
- correct format;
- correct photos;
- correct shipping;
- correct schedule.

Never assume a successful click equals successful completion.

---

# Product identification

When photos arrive, attempt to identify:

- item type;
- manufacturer;
- brand;
- family;
- exact model;
- generation;
- colour;
- model numbers;
- labels;
- serial numbers where relevant;
- barcodes;
- UPC/EAN/GTIN;
- FCC/CE/model identifiers;
- storage/capacity markings;
- connectors;
- approximate dimensions;
- accessories;
- packaging;
- manuals;
- chargers;
- cables;
- visible damage;
- scratches;
- dents;
- missing parts;
- apparent condition.

Use image-capable LLMs where useful, but prefer deterministic evidence where available.

Maintain evidence and confidence.

---

# Intelligent follow-up photography

Ask for additional photos only where information gain justifies it.

Examples:

- underside label;
- ports;
- contents of box;
- powered-on screen;
- Settings → About;
- scratch from another angle;
- ruler beside object;
- charger label.

Prefer one excellent request over many vague questions.

---

# Specification research

Prefer sources roughly in this order:

1. manufacturer;
2. manufacturer support/archive;
3. manuals/spec sheets;
4. recognised databases;
5. reputable retailers;
6. specialist review sites;
7. other reliable sources.

Where simple web research is insufficient, use Browser Operator.

Store:

```text
value
confidence
source
retrieval_date
evidence
user_confirmed
```

---

# Variant disambiguation

A visually identified item may still have unknown price-sensitive configuration.

Examples:

- phone storage;
- Mac RAM/storage;
- SSD capacity;
- GPU memory;
- processor variant;
- keyboard layout;
- console revision.

Classify:

- Confirmed
- Probable
- Unknown but price-sensitive
- Unknown but immaterial

Only interrupt the user when the answer materially affects price, correctness, compatibility, shipping, safety or marketplace requirements.

---

# Condition model

Represent:

- new/sealed;
- unused/open-box;
- excellent;
- very good;
- good;
- fair;
- spares/repair;
- functional status;
- cosmetic wear;
- battery condition;
- screen/enclosure condition;
- missing parts;
- original accessories;
- replacement accessories;
- packaging;
- manuals;
- modifications;
- defects.

Condition must be evidence-backed and quickly correctable by the user.

---

# Comparable-sales provider architecture

Use an abstraction such as:

```text
ComparableSalesProvider
├── EbayMarketplaceInsightsProvider
├── EbayBrowseApiProvider
├── EbayBrowserResearchProvider
├── EbayProductResearchBrowserProvider
├── OtherMarketplaceProvider
└── LocalComparableCacheProvider
```

Do not couple valuation to one eBay API.

Prioritise actual historical sale evidence where available.

---

# Authenticated eBay browser research

Use the user's authenticated eBay session where useful.

Potential workflows:

- Advanced Search;
- Sold Items;
- Completed Items;
- Seller Hub;
- Product Research / Terapeak;
- individual listing pages.

The browser operator may:

- formulate search;
- enter it;
- set filters;
- inspect results;
- paginate/scroll sensibly;
- open likely matches;
- inspect item specifics;
- inspect descriptions;
- capture sold price;
- shipping;
- sale date;
- condition;
- listing type;
- source reference.

This should resemble a careful human researching one item, not a large-scale crawler.

---

# Comparable record schema

Capture where available:

```text
marketplace
listing_id
source_url
title
sale_price
postage
total_buyer_price
sale_date
listing_format
condition
seller_type
product_identity
variant
included_accessories
original_packaging
defects
retrieval_timestamp
provider
```

Calculate matching dimensions:

```text
product_match
generation_match
capacity_match
memory_match
condition_match
accessory_match
packaging_match
recency_score
overall_comparability
```

---

# Local research corpus / comparable cache

Persist historical comparable observations locally.

Do not repeatedly rediscover the same sold listings.

Index by product identity and meaningful variant dimensions.

Cached data retains original sale dates and must be recency weighted.

If sufficient recent data exists, perform only a lightweight refresh.

Over time Sell My Stuff should develop a useful personal second-hand market dataset.

---

# Valuation engine

Do not ask an LLM simply:

> What is this worth?

Use deterministic valuation logic informed by structured evidence.

Consider:

- sold comparables;
- similarity;
- recency;
- condition;
- specification;
- accessories;
- packaging;
- listing format;
- geography.

Normalise shipping where relevant.

Detect outliers.

Produce:

- likely sale range;
- quick-sale price;
- recommended listing price;
- stretch price;
- expected realised sale price;
- confidence.

Example:

```text
Likely achieved: £145–£175
Recommended BIN: £179.99
Likely accepted offer: £160–£170
Quick sale: ~£145
Confidence: High
Evidence: 14 strong comparable sales within 60 days
```

LLMs interpret evidence; deterministic code performs the maths.

---

# Auction vs Buy It Now

Recommend the best format based on:

- demand;
- sales frequency;
- price variance;
- rarity;
- time-to-sale;
- auction activity;
- fixed-price outcomes;
- speed vs return.

Explain the recommendation succinctly.

---

# Listing timing

If auction timing matters, use available historical evidence.

Otherwise use sensible configurable UK defaults.

Prefer target end time and derive start time where required.

Account for:

- UK timezone;
- daylight saving;
- listing duration;
- eBay scheduling;
- category rules;
- any fees.

Prefer native marketplace scheduling.

---

# Listing generation

Generate a complete proposal:

- title;
- category;
- item specifics;
- condition;
- condition description;
- description;
- price;
- format;
- Best Offer;
- auction starting price;
- duration;
- schedule;
- quantity;
- dispatch time;
- returns;
- postage;
- dimensions;
- weight;
- photos;
- required marketplace fields.

Descriptions must be factual.

Disclose defects.

Never fabricate claims such as:

- perfect condition;
- barely used;
- smoke-free home;
- fully tested;

unless established.

---

# Marketplace publishing abstraction

Conceptually:

```text
MarketplacePublisher
├── EbayApiPublisher
└── EbayBrowserPublisher
```

Prefer whichever mechanism is most reliable and maintainable.

It is acceptable to use a hybrid.

Persist marketplace IDs regardless of mechanism.

---

# eBay integration

Research CURRENT eBay capabilities before implementation.

Investigate:

- OAuth;
- Sell Inventory API;
- Sell Account API;
- Sell Fulfillment API;
- Sell Finances API;
- Commerce Taxonomy;
- Browse API;
- Seller Hub;
- Product Research/Terapeak;
- Sold/Completed UI;
- scheduling;
- fees;
- listing revisions;
- order sync.

Document ADRs for research and publication strategy.

Do not assume API > browser merely because an API exists.

---

# Approval model

Before publication present:

- hero photo;
- identity;
- confidence;
- condition;
- recommended price;
- comparable range;
- comparable evidence;
- format;
- estimated net;
- shipping;
- packaging;
- title;
- description;
- specifics;
- schedule.

Also show checks such as:

```text
Exact model confirmed? YES
Functionality tested? YES
Sensitive photo content removed? YES
Packaging available? YES
Material factual uncertainty? NONE
```

Then:

- `Approve & Schedule`
- `Approve & Publish`

Approval must be scoped to the exact commercial proposal.

If a browser/API workflow requires a material deviation, ask again.

---

# Photograph quality and privacy assistant

Evaluate:

- blur;
- bad lighting;
- reflections;
- distracting backgrounds;
- missing angles;
- poorly shown damage;
- visible private data;
- shipping labels;
- QR codes;
- notifications;
- family photos;
- people/reflections;
- serial numbers where disclosure is undesirable;
- Wi-Fi/auth details.

Allow safe non-destructive corrections such as:

- rotation;
- crop;
- exposure correction;
- privacy redaction.

Never alter condition deceptively.

Always retain originals.

---

# Functional testing

Infer appropriate lightweight checks by category.

Examples:

Keyboard:
- power;
- connection;
- keys;
- charging.

Phone:
- boot;
- display;
- touch;
- cameras;
- charging;
- battery health;
- activation lock.

SSD:
- detected;
- capacity;
- SMART;
- secure erase where needed.

If user chooses `Not tested`, list and price accordingly.

---

# Device data-removal safety

For devices storing personal data, add pre-sale checks:

- factory reset;
- Find My removed;
- activation lock removed;
- storage erased;
- memory cards removed;
- accounts removed;
- smart-home deregistration.

Never assume data removal happened from appearance alone.

---

# Shipping research

Estimate:

- bare dimensions;
- bare weight;
- packed dimensions;
- packaging weight;
- final parcel size;
- final parcel weight.

Research current UK delivery options.

Potential carriers:

- Royal Mail;
- Evri;
- DPD;
- DHL;
- UPS;
- Parcelforce;
- others.

Consider:

- size;
- weight;
- compensation;
- tracking;
- signature;
- insurance;
- batteries;
- exclusions;
- value;
- speed.

Do not hard-code dynamic rates.

---

# Packaging engine

Determine safe packaging:

- antistatic bags;
- bubble wrap;
- foam;
- cardboard boxes;
- Jiffy/padded envelopes;
- rigid mailers;
- paper;
- tape;
- corner protection.

Calculate required internal dimensions.

Check existing inventory first.

---

# Packaging inventory

Track:

- type;
- internal dimensions;
- external dimensions;
- weight;
- quantity;
- location;
- cost;
- supplier;
- purchase URL/reference;
- purchase date;
- notes.

Consumables may be approximate.

Make consumption one-tap where possible.

---

# Packaging purchasing

When needed, find exact suitable options, initially including Amazon UK.

Recommend:

- cheapest appropriate;
- best fit;
- best multipack/value.

Consider queued items before recommending multipacks.

Purchases always require explicit approval.

The browser may prepare a basket but not complete checkout without approval.

---

# Fees and estimated net proceeds

Show:

```text
Sale proceeds
− marketplace charges
− optional upgrades
− seller-paid postage
− packaging
− other costs
= estimated net
```

Retrieve current fee rules dynamically where practical.

Show:

```text
Buyer pays: £X
Expected costs: £Y
Expected net: £Z
```

---

# Live sale lifecycle

Track:

```text
Scheduled
Live
Offer Received
Sold
Payment Pending
Paid
Needs Packing
Ready to Dispatch
Dispatched
Delivered
Complete
Returned
Cancelled
```

Use APIs where available and browser workflows where needed.

---

# Offers

Analyse offers autonomously.

Present:

```text
Offer received: £162

Recommended acceptable range: £160–£170
Estimated net: £154
Recommendation: Accept

[Accept] [Counter] [Decline]
```

Actual action requires approval.

---

# Sale and dispatch workflow

Example:

```text
Sold for £168.

Pack using:
- Box B12
- 1 antistatic bag
- bubble wrap

Recommended shipping:
Royal Mail Tracked 48

[I've packed it]
```

Then prepare postage.

Postage purchase requires approval.

After purchase:

- capture tracking;
- update marketplace;
- decrement packaging;
- record actual shipping cost;
- calculate final net proceeds.

---

# Effort-adjusted selling

Maximum theoretical price is not always the objective.

Estimate effort.

For low-value/high-effort items recommend:

- bundle;
- local sale;
- donate;
- recycle;
- do not bother.

Support strategy:

- Maximise return
- Balanced
- Minimise hassle

Default: **Balanced**.

---

# Multi-item capture

Support rapid decluttering sessions.

The user should be able to photograph A, B, C, D without waiting for research.

Background workers process independently.

---

# Bundle detection

Detect sensible bundles such as:

- matching peripherals;
- RAM pairs;
- cable lots;
- device + accessory;
- groups of low-value components.

Compare separate vs bundled return including effort, postage and packaging.

---

# LLM architecture

Use provider-independent abstractions.

Support:

- OpenAI;
- Anthropic;
- local llama.cpp;
- local OpenAI-compatible endpoints;
- future providers.

Allow different models for:

- vision;
- extraction;
- classification;
- difficult reasoning;
- web/browser interpretation;
- listing copy.

Never send browser credentials/cookies to LLMs.

Track approximate model cost per item where available.

---

# Agentic research workflow

Implement as auditable persistent stages:

```text
inspect images
→ candidate identities
→ resolve evidence
→ authoritative specs
→ identify price-sensitive unknowns
→ ask user only if necessary
→ search local comparable cache
→ refresh marketplace research
→ authenticated browser research if needed
→ score comparables
→ calculate valuation
→ determine sale format
→ research shipping
→ check packaging
→ prepare listing
→ validate
→ await approval
→ publish
→ verify
```

Jobs must survive restarts.

---

# Confidence and provenance

Important fields must support:

```text
value
confidence
origin
evidence
source
retrieval_timestamp
user_confirmed
```

Example:

```yaml
storage:
  value: 512 GB
  confidence: 1.0
  origin: user-evidence
  evidence: IMG_1421 showing About screen
```

Another:

```yaml
colour:
  value: Space Grey
  confidence: 0.72
  origin: image-inference
```

AI inference must never silently become confirmed marketplace copy.

---

# Why do we think this?

Allow the user to inspect evidence.

For valuation show:

- title;
- image where useful;
- sale price;
- shipping;
- date;
- condition;
- specification;
- source;
- similarity;
- why included.

Research provenance must survive whether it came from API or browser.

---

# Search freshness

Support configurable windows:

- 30 days;
- 60 days;
- 90 days;
- 180 days;
- older where necessary.

Old evidence must be visibly older and weighted accordingly.

---

# Application architecture

Choose stack after inspecting Overseer and existing conventions.

Conceptually separate:

- responsive Web/PWA;
- API;
- background workers;
- PostgreSQL or established persistent DB;
- image/object storage;
- durable job queue;
- AI adapters;
- Browser Operator;
- marketplace adapters;
- carrier adapters;
- packaging supplier adapters.

---

# Persistent state

Use a real database.

Prefer PostgreSQL unless the existing environment provides a stronger convention.

Do not use JSON files as authoritative state.

Images belong in durable storage.

Browser profile/session data is separate and highly sensitive.

---

# Job processing

Support:

- retries;
- timeouts;
- failure state;
- resumability;
- progress;
- idempotency.

Do not blindly retry consequential actions.

If publication times out, first verify whether the listing already exists.

---

# Notifications

Notify only when useful.

Examples:

- additional photo required;
- user answer needed;
- listing ready;
- MFA/browser takeover required;
- publication succeeded;
- offer received;
- item sold;
- dispatch required;
- browser workflow failed.

Support in-app first and investigate PWA push notifications.

---

# Testing is a release requirement

Testing is mandatory.

Maintain:

- unit tests;
- component tests;
- integration tests;
- contract tests;
- end-to-end tests;
- browser automation tests;
- visual regression tests where useful;
- accessibility tests;
- security/policy tests.

A feature is not complete merely because it works manually.

---

# Unit tests

Aggressively test deterministic logic:

- valuation;
- recency weighting;
- outlier rejection;
- comparable scoring;
- shipping;
- packaging fit;
- fees;
- workflow transitions;
- approval rules;
- permissions;
- data transformations.

LLM output must be schema validated.

---

# Integration tests

Test boundaries such as:

- API + DB;
- worker + queue;
- object storage;
- browser service;
- AI provider adapters;
- marketplace providers;
- auth;
- realtime events.

Use disposable infrastructure where practical.

---

# Browser automation tests

Maintain local deterministic fixtures/pages for:

- search;
- pagination;
- forms;
- modals;
- login interruption;
- MFA pause;
- human takeover;
- changed DOM;
- uploads;
- confirmation screens;
- failures.

Do not make all browser tests depend on live eBay.

---

# End-to-end journeys

At minimum test:

## Capture

```text
mobile viewport
→ upload/capture item
→ item created
→ research starts
→ clarification appears
→ answer
→ valuation ready
```

## Cross-device continuity

```text
create in mobile context
→ continue in desktop context
→ edit
→ reopen mobile
→ same state immediately visible
```

## Approval

```text
review
→ approve
→ marketplace adapter called
→ publication verified
→ item becomes LIVE
```

## Human takeover

```text
agent navigates
→ simulated MFA
→ WAITING_FOR_HUMAN
→ user takes control
→ completes challenge
→ returns control
→ agent reconciles
→ continues
```

## Packing

```text
sold
→ packaging recommendation
→ confirm packing
→ inventory decremented
→ shipping step begins
```

---

# Visual regression

Protect visual quality.

Cover key states at representative mobile/desktop sizes:

- home;
- capture;
- researching;
- needs information;
- item detail;
- valuation;
- approval;
- browser takeover;
- sold/packing;
- dark mode;
- light mode.

UI regressions are regressions.

---

# Accessibility

Target WCAG 2.2 AA where practical.

Test:

- keyboard;
- focus;
- screen readers;
- semantic controls;
- contrast;
- reduced motion;
- text scaling;
- touch targets;
- error messaging.

---

# Performance

The application must feel fast.

Track:

- initial load;
- interaction latency;
- photo upload responsiveness;
- navigation latency;
- bundle size;
- memory use.

Use thumbnails/responsive images instead of loading full originals unnecessarily.

---

# Source control

Use proper version control from the first meaningful commit.

The authoritative development repository should live on the user's local Gitea server.

Create a fresh dedicated repository.

Do not do substantial work in an untracked directory and import it later.

---

# Git workflow

Use short-lived branches:

```text
feature/*
fix/*
refactor/*
chore/*
docs/*
test/*
```

Normal flow:

```text
main
↓
feature branch
↓
commits
↓
push
↓
PR
↓
CI
↓
review
↓
merge
↓
main
```

Do not develop substantial features directly on `main`.

---

# Pull requests

Meaningful changes should go through PRs.

PRs should include:

- purpose;
- design decisions;
- screenshots/video for UI changes where useful;
- tests;
- migration implications;
- security implications.

Do not merge failing CI.

---

# Commit hygiene

Prefer logical commits.

Use Conventional Commits unless existing conventions dictate otherwise.

Examples:

```text
feat(capture): add multi-photo intake
feat(browser): persist Chrome profile
fix(valuation): exclude mismatched storage variants
test(browser): cover human takeover
```

Avoid meaningless commit messages.

---

# CI

Inspect existing Gitea CI capabilities and use existing conventions where possible.

Expected checks include:

```text
format
lint
typecheck
unit tests
integration tests
browser tests
build
migration validation
security/static checks
```

Run heavier E2E tests at an appropriate stage.

---

# Protected main

Protect `main` where supported.

Require suitable checks.

Prevent accidental force pushes.

Keep process appropriate for a single-developer project; avoid bureaucracy for its own sake.

---

# GitHub mirror

Create a fresh GitHub repository.

Default to **private** unless explicitly instructed otherwise.

Local Gitea is the development authority.

Mirror approved `main` to GitHub after successful merge.

Conceptually:

```text
feature/*
   ↓
Gitea PR
   ↓
Gitea main
   ↓
automatic mirror
   ↓
GitHub main
```

Never mirror:

- secrets;
- browser profiles;
- env files;
- database dumps;
- item photographs;
- authenticated page caches;
- private logs;
- cookies/session data.

---

# Database migrations

Version all schema changes.

Migrations must:

- live in source control;
- be tested;
- deploy predictably;
- avoid unsafe destructive behaviour without explicit handling.

Do not manually mutate production schema as normal practice.

---

# Environments

Maintain conceptual separation between:

- development;
- test;
- production;
- staging where useful.

Never run destructive automated tests against production.

Production browser profiles must not be used by automated test suites.

---

# Feature flags

Use flags for risky incomplete behaviours such as:

- real eBay publication;
- offer acceptance;
- postage purchase;
- browser publisher.

Allow workflows to be developed while final external side effects remain disabled.

---

# Deployment

Overseer owns deployment.

Desired flow:

```text
merge to main
↓
CI passes
↓
build immutable artifact/container
↓
Overseer deploys
↓
database migration
↓
health checks
↓
application healthy
↓
GitHub mirror updated
```

Reuse existing infrastructure instead of building parallel deployment machinery.

---

# Rollback

Every production deployment needs a rollback story.

Record:

- app version;
- Git commit;
- image tag/digest;
- migration version;
- deployment timestamp.

Retain previous deployable version.

Overseer must be able to identify what is running.

---

# Versioning

Expose app version under Settings/About.

Example:

```text
Sell My Stuff
v0.8.0
commit 4d12fa7
```

Use semantic versioning or another explicit documented scheme.

Tag meaningful releases.

---

# Documentation

Maintain:

```text
README.md
ARCHITECTURE.md
DEVELOPMENT.md
TESTING.md
DEPLOYMENT.md
SECURITY.md
PROJECT_STATUS.md
ROADMAP.md
LLM_HANDOFF.md
docs/adr/
```

Documentation is not optional cleanup.

Update it continuously.

---

# Definition of Done

A meaningful feature is not Done until relevant items are complete:

- implementation;
- mobile UI;
- desktop UI;
- loading state;
- empty state;
- error state;
- accessibility;
- unit tests;
- integration tests;
- E2E coverage;
- visual coverage where appropriate;
- docs;
- no secrets;
- migrations;
- CI green;
- PR;
- review;
- merge;
- deployment verification.

Do not accumulate testing/UI/documentation debt for later.

---

# UX review checklist

For every substantial interface, review at mobile and desktop widths.

Ask:

- Is the primary action obvious?
- Is unnecessary information hidden?
- Is anything visually ugly or developer-like?
- Does it feel fast?
- Is status immediately understandable?
- Are touch targets comfortable?
- Can interactions be reduced?
- Does device switching preserve everything?

If switching device loses meaningful state, the feature is incomplete.

---

# Development roadmap

Build vertical slices.

## Milestone 0 — Repository and engineering foundations

Before substantial feature work:

- create local Gitea repository;
- establish branching;
- establish PR workflow;
- set up CI;
- create GitHub private mirror;
- create documentation skeleton;
- create PROJECT_STATUS.md;
- create ROADMAP.md;
- create LLM_HANDOFF.md;
- create initial ADRs;
- establish deployment path through Overseer.

## Milestone 1 — Magic demo

Deliver:

```text
photo
→ identify
→ research specs
→ ask only necessary questions
→ create draft item
```

Use real models and real research.

## Milestone 2 — Browser Operator

Build:

- persistent headed Chrome;
- secure persistent profile;
- Playwright;
- human takeover;
- return-control flow;
- browser streaming;
- planner/interpreter/operator separation;
- policy guard;
- audit log.

Demonstrate using harmless research.

## Milestone 3 — Valuation

Add:

- eBay active-market research;
- authenticated Sold/Completed research;
- Product Research investigation;
- comparable cache;
- comparable scoring;
- valuation engine;
- evidence UI.

## Milestone 4 — Complete sale proposal

Add:

- condition;
- photo checks;
- shipping;
- packaging;
- packaging inventory;
- fees;
- auction vs BIN;
- approval screen.

The product should already be genuinely useful here.

## Milestone 5 — eBay publication

Research and implement the best API/browser/hybrid publishing strategy.

Add:

- listing creation;
- scheduling;
- images;
- taxonomy/aspects;
- publication verification;
- marketplace IDs;
- status sync.

Require explicit approval before real production publication.

## Milestone 6 — Sale lifecycle

Add:

- offers;
- orders;
- packing;
- postage;
- tracking;
- packaging consumption;
- proceeds.

## Milestone 7 — Optimisation

Add:

- prediction accuracy;
- bundle recommendations;
- effort-adjusted value;
- timing optimisation;
- broader carriers/marketplaces.

---

# First implementation task

Start by exploring reality.

Do NOT stop after writing a plan unless there is a genuine blocker.

Perform:

1. Find Project Overseer.
2. Read its architecture and source.
3. Determine current deployment conventions.
4. Determine authentication.
5. Determine secrets handling.
6. Determine DB/storage conventions.
7. Determine monitoring/backups.
8. Determine Gitea conventions.
9. Determine CI capabilities.
10. Determine how Overseer provisions services.
11. Create the Sell My Stuff Gitea repository.
12. Create the fresh private GitHub mirror repository.
13. Create branch protection / PR workflow.
14. Add this brief to the repository.
15. Create PROJECT_STATUS.md.
16. Create ROADMAP.md.
17. Create LLM_HANDOFF.md.
18. Create initial ADR structure.
19. Research current eBay API capabilities.
20. Inspect authenticated eBay UK UI.
21. Investigate Sold/Completed search.
22. Investigate Seller Hub.
23. Investigate Product Research/Terapeak availability.
24. Compare browser vs API research.
25. Compare browser vs API listing creation.
26. Investigate scheduling.
27. Investigate fees.
28. Investigate fulfilment/order sync.
29. Write ADRs.
30. Begin Milestone 1.
31. Keep PROJECT_STATUS.md updated while working.
32. Before ending any session, update LLM_HANDOFF.md with the exact state and next action.

Do not merely describe what code should exist.

Implement it.

---

# Definition of success

The target experience is:

I pick up an object.

I take two or three photographs on my phone.

Sell My Stuff investigates it.

Behind the scenes it may:

- identify it;
- read labels;
- confirm specs;
- search manufacturer data;
- open my authenticated eBay account;
- research sold items;
- use Product Research;
- reject wrong variants;
- calculate valuation;
- check packaging;
- obtain shipping data;
- generate a listing.

I do not need to do those things.

Later I open desktop and see the same item already researched.

I can inspect evidence, edit if desired, and leave.

If Sell My Stuff needs one decision while I am away from my desk, I can answer it from my phone.

No workflow belongs to a device.

Eventually:

```text
Apple Magic Keyboard with Touch ID and Numeric Keypad

Model A2520
Condition: Very Good

Recent comparable sales: £86–£105
Expected sale price: ~£95

Recommended:
Buy It Now £104.99 + Best Offer

Likely net proceeds: ~£91

Packaging:
Box B4 + existing bubble wrap

Everything is ready.

[Review]
[Approve & Publish]
```

I press `Approve & Publish`.

Sell My Stuff performs the work through API, authenticated browser, or hybrid.

It verifies success.

Later:

```text
Sold for £96

Use Box B4.
Recommended postage: Royal Mail Tracked 48.

[I've packed it]
```

Then:

```text
Ready to send

Postage prepared.

[Approve £3.39 postage purchase]
```

The system does the administration.

The user makes the decisions.

---

# Final principles

**Photograph clutter → turn it into money.**

**Beautiful UX is part of correctness.**

**Mobile and desktop are equal citizens.**

**Capture should be exceptional on mobile.**

**Research and review should be exceptional on desktop.**

**Every workflow must survive device switching.**

**The server owns state; devices are views onto it.**

**The persistent authenticated browser belongs to the server, not the client device.**

**Human takeover must work from any trusted device.**

**Operate on the user's behalf, not instead of the user's authority.**

**A browser is a valid user interface for an agent.**

**Do not confuse browser automation with scraping.**

**Do not evade security controls.**

**Never expose browser credentials or cookies to LLMs.**

**Treat webpages as untrusted input.**

**Do not hallucinate. Research.**

**Do not ask the user something the system can discover.**

**Store evidence, not conclusions alone.**

**Use LLMs for ambiguity, interpretation and language.**

**Use deterministic code for arithmetic, permissions, workflow and policy.**

**Put APIs, browsers and external services behind adapters.**

**Verification after external actions is as important as performing them.**

**No financial or contractual action without explicit approval.**

**If confidence is insufficient, ask one excellent question rather than five guesses.**

**Optimise for completed sales, not completed forms.**

**Make the next user action obvious and tiny.**

**A feature without appropriate automated tests is incomplete.**

**UI regressions are regressions.**

**Main must represent known-good software.**

**Use feature branches, PRs and CI.**

**Gitea is the local development authority.**

**Mirror approved main to GitHub.**

**Deployment state must map back to a Git commit.**

**Use Overseer for infrastructure instead of creating parallel systems.**

**PROJECT_STATUS.md, ROADMAP.md and LLM_HANDOFF.md are mandatory living project artefacts.**

**At the end of every session, leave the project in a state where a fresh LLM can resume immediately.**

The ultimate goal is not to build an eBay management system.

It is to build an assistant that can look at the pile of stuff in a room and progressively make that pile disappear with the absolute minimum amount of human administration.
