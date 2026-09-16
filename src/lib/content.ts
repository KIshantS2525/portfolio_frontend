/**
 * The content layer. Every fact on this site lives here.
 * Both routes import from this file. Nothing is hardcoded in a component.
 *
 * Content decisions applied (from PORTFOLIO_SETUP.md §2):
 *   · Ascentt shown as "Feb 2025 – Present", trainee/full-time split dropped.
 *   · Experience phrased as "~1.5 years", not a month count, so it can't go stale.
 *   · Canonical spellings: "Auranova" (one word), "Kisaan Vani" (résumé spelling).
 */

export type Link = { label: string; href: string };

export type Project = {
  slug: string;
  name: string;
  year: string;
  context: string;
  /** One line. This is what shows in the collapsed work row. */
  blurb: string;
  challenge?: string;
  approach?: string;
  outcome?: string;
  /** Extra paragraphs shown only when a row is expanded. */
  detail?: string[];
  tech: string[];
  domains: string[];
  links?: Link[];
  featured?: boolean;
};

/**
 * Profile shape. Kept as a named type (not just `typeof profile`) so the
 * admin panel can produce a mutated copy of it — `as const` narrows every
 * field to its literal string type, which is fine for reads but blocks the
 * admin from ever assigning a *different* string. Named as the type-of-record.
 */
export type Profile = {
  name: string;
  title: string;
  location: string;
  email: string;
  phone: string;
  github: string;
  linkedin: string;
  liveProject: string;
  resume: string;
  positioning: string;
  availability: string;
  experienceLength: string;
};

export const profile: Profile = {
  name: 'Ishant Shrivastava',
  title: 'AI/ML Engineer',
  location: 'Indore, Madhya Pradesh, India',
  email: 'reach.ishantshrivastava@gmail.com',
  phone: '+91 6266826122',
  github: 'https://github.com/KIshantS2525',
  linkedin: 'https://linkedin.com/in/ishant-shrivastava-481b45255',
  liveProject: 'https://diagramstudio.in',
  resume: '/resume.pdf',
  positioning:
    'I build AI systems that run in production — computer vision, RAG pipelines, and on-device inference.',
  availability: 'Open to opportunities. Immediate joiner.',
  experienceLength: '~1.5 years',
};

/* ── Experience ─────────────────────────────────────────────────────────── */

export type Role = {
  slug: string;
  company: string;
  title: string;
  location: string;
  period: string;
  summary: string;
  projects: string[];
};

export const roles: Role[] = [
  {
    slug: 'ascentt',
    company: 'Ascentt AITek Pvt. Ltd.',
    title: 'Software Developer, AI/ML & Computer Vision',
    location: 'Indore, India',
    period: 'Feb 2025 – Present',
    summary:
      'Builds and deploys production AI systems across computer vision, LLMs and RAG, generative AI, and time-series forecasting. Owns projects end to end: data pipelines, model training, API development, frontend integration, and Docker/AWS EC2 deployment.',
    projects: [
      'hrtal-copilot',
      'ppe-compliance',
      'engine-test-forecasting',
      'asc-cadence',
      'auranova',
      'hr-copilot',
      'rust-detection',
      'barcode-ocr',
      'grid',
      'sandbox-system',
    ],
  },
  {
    slug: 'uoons',
    company: 'Uoons Ecommerce Pvt. Ltd.',
    title: 'Flutter Intern',
    location: 'Indore, India',
    period: 'May 2024 – Jul 2024',
    summary:
      'Integrated 15+ API endpoints averaging under 300ms response time. Designed 30+ UI screens. Implemented 25+ features across seller, services, and partner apps covering inventory management, order tracking, booking flows, and partner workflows. Joined as one of two Flutter developers and ended up leading Flutter development; the Seller App shipped to the Play Store.',
    projects: ['uoons-seller'],
  },
];

/* ── Education ──────────────────────────────────────────────────────────── */

export const education = [
  {
    qualification: 'B.Tech, Artificial Intelligence and Machine Learning',
    institution: 'Acropolis Institute of Technology and Research, Indore (RGPV)',
    period: '2021–2025',
    result: 'CGPA 7.3/10',
  },
  {
    qualification: 'Class XII',
    institution: 'Small Wonders Sr. Sec. School, Jabalpur (CBSE)',
    period: '2021',
    result: '82%',
  },
  {
    qualification: 'Class X',
    institution: "St. Michael's Sr. Sec. School, Satna (MP Board)",
    period: '2019',
    result: '88%',
  },
];

/* ── Projects ───────────────────────────────────────────────────────────────
   Order is deliberate. Recall and OmniTrace lead: the engineering stories are
   a stronger signal for AI roles than any accuracy number.
──────────────────────────────────────────────────────────────────────────── */

export const projects: Project[] = [
  {
    slug: 'recall',
    name: 'Recall',
    year: '2025',
    context: 'Snapdragon Multiverse Hackathon, Qualcomm Noida',
    featured: true,
    blurb:
      'A multi-device AI memory companion that runs entirely on-device across the Snapdragon ecosystem.',
    challenge:
      'The event machine was a Snapdragon X Elite — Windows on ARM64. At 2am, neither Qdrant nor ChromaDB would install: no win_arm64 wheels. Same for sqlite-vec. Every standard vector database was unavailable and there was no time to wait on upstream support.',
    approach:
      'Wrote a brute-force vector search from scratch, replicating what sqlite-vec provides, directly in NumPy — storing vectors as plain BLOBs in SQLite instead of a vec0 virtual table. Embeddings are stored int8-quantized at 256 dimensions (Matryoshka coarse vectors) as raw bytes in a vec_chunks table. Search loads candidate rows, reconstructs one (n, 256) int32 matrix with np.frombuffer(...).reshape(...), computes squared L2 distance against the query vector in a single vectorized np.sum((mat - q) ** 2, axis=1), and takes top-k with np.argsort. Non-vector metadata filters apply after the KNN pass.',
    outcome:
      'Runs on plain SQLite and NumPy with no native vector-DB binary, portable to any ARM64 machine. At demo scale — a few thousand int8[256] vectors — O(n) distance computation is effectively free. Approximate nearest neighbour was never the bottleneck; ARM64 wheel support was.',
    detail: [
      'It listens to conversations, reads what you highlight or upload, and turns all of it into one private searchable memory. Ask it "What did we decide about the API?" and it answers in plain language with the original source attached. Nothing leaves your devices.',
      'Four pieces: a Snapdragon X Elite PC hub as the brain (storage, ASR, embedding, LLM), a Flutter Android app with a "Hey Recall" wake word that works standalone if the hub is down, a Chrome/Edge browser extension, and an Arduino UNO Q acting as an ambient room microphone with an LED status face.',
      'My part: built the browser extension solo — highlight-to-save, PDF capture via pdf.js with a review step, screenshot OCR via Tesseract.js, and a GitHub repo capture feature that reads a repo, builds a file-relationship graph, and renders it as an interactive draggable diagram. Co-built the RAG pipeline on the PC hub: ingestion, chunking, embedding, vector storage, retrieval, rerank, LLM synthesis.',
      'Second story worth telling — the silent CPU fallback. onnxruntime-qnn ships the QNN execution provider as a plugin, not compiled into the base wheel. Without explicit registration, ONNX Runtime silently falls back to CPU per-node rather than raising an error: the model runs, just slowly, with no warning. Fixed with explicit provider registration plus an assertion that the first effective provider really is QNNExecutionProvider. Accelerator fallback order is Hexagon NPU (HTP), then Adreno GPU, then CPU — opening a fresh session per candidate, since one QNN session targets one accelerator.',
      'Models, all on the Hexagon NPU via ONNX Runtime + QNN: Whisper-Base-En for speech-to-text, Nomic-Embed-Text v1.5 for embeddings, Qwen3-4B-Instruct-2507 for synthesis via GenieX, and Qwen3-Reranker-0.6B for re-scoring.',
    ],
    tech: [
      'ONNX Runtime',
      'QNN',
      'NumPy',
      'SQLite',
      'Flutter',
      'Python',
      'Whisper',
      'Qwen3',
      'JavaScript',
      'pdf.js',
      'Tesseract.js',
      'Arduino',
    ],
    domains: ['On-device AI', 'RAG', 'Edge inference', 'Speech'],
  },
  {
    slug: 'omnitrace',
    name: 'OmniTrace',
    year: '2025–present',
    context: 'Personal project',
    featured: true,
    blurb:
      'A local-first observability platform for AI applications — the AI equivalent of browser dev tools.',
    challenge:
      'Debugging an LLM application means reconstructing what happened across a chain of calls from scattered logs. Hosted tracing tools exist, but they want your prompts and your data on their servers.',
    approach:
      'A pip-installable Python SDK that gives function-level tracing from a single decorator. A FastAPI + SQLAlchemy server (SQLite or Postgres) ingests through a background queue so instrumentation never blocks the traced application. A React dashboard renders live execution graphs with ReactFlow and elkjs.',
    outcome:
      'Two complete shipped generations. The foundation release covered provider integrations for OpenAI, Anthropic, Gemini, and Ollama plus LangChain and LangGraph callback support. The second release covered authentication, server-side cost computation, streaming instrumentation, prompt versioning, and pluggable storage — 41 tickets, verified against real Postgres and S3 infrastructure, with 239 backend and 95 frontend tests passing. The third adds OpenTelemetry ingestion, so any language’s OTel SDK reports into the same local dashboard.',
    detail: [
      'It does not just show you the trace, it tells you what is wrong with it. Fourteen deterministic rules catch things like a retrieval step asking for four documents and getting three back with no error raised, or a model starting to generate before retrieval finished returning — meaning whatever was fetched could not possibly have been in the prompt.',
      'Those diagnostics are a rule engine, not a model call, and that is the architectural stance. Every finding is a direct comparison between values already recorded on a span, so it is exact, instant, works offline, and never sends your prompts anywhere. An LLM-based analyser would have been easier in places and would have violated the entire premise.',
      'A full security and correctness audit shipped as its own numbered release rather than folded quietly into feature work. It found a real authentication bypass on key management, a stored XSS in the media store, and a latency percentile query that was silently returning numbers from the fastest spans — measured at 200x understated on skewed real data, the kind of bug that passes code review and only breaks on a real dataset.',
      'The SDK tiers are documented honestly rather than oversold: a published matrix marks which capabilities are verified end to end versus should-work-but-not-yet-demonstrated, so someone one tier down knows that, instead of concluding the tool is broken.',
      'Every historical bug fix was backed by a reproduction against a live server or a real client library, not a code-review judgement — because several of the real ones were invisible from reading the code and from a passing type-checker.',
    ],
    tech: [
      'Python',
      'FastAPI',
      'SQLAlchemy',
      'PostgreSQL',
      'SQLite',
      'React',
      'ReactFlow',
      'elkjs',
      'OpenTelemetry',
      'S3',
    ],
    domains: ['Observability', 'Developer tools', 'LLM infrastructure'],
  },
  {
    slug: 'diagramstudio',
    name: 'DiagramStudio',
    year: '2025',
    context: 'Personal project',
    featured: true,
    blurb: 'Converts plain English into live, interactive architecture diagrams.',
    challenge:
      'Text-to-diagram tools either hand the model raw SVG coordinates, which it gets wrong, or lock you into one rigid diagram grammar. Neither survives a real architecture that needs editing afterwards.',
    approach:
      'Built a custom domain-specific language — DiagramDSL — with a hand-written lexer, parser, and resolver compiling to an ELK layout graph. Six diagram types (flowchart, cloud architecture, high-level architecture, ERD, swimlane, and sequence, which gets its own separate compiler path), each with its own layout profile and grammar rules. The model writes DSL, not geometry; layout is deterministic, and the DSL text is the real document — the AST, the layout, the canvas, and every export are rebuilt from it, which is why text editing and visual editing can never disagree.',
    outcome:
      'Live at diagramstudio.in. Beyond diagrams it turns a GitHub repo or a local project ZIP into a code-dependency graph with an LLM-written architecture summary (tree-sitter + networkx), and generates researched technical documents by pulling real sources — npm, PyPI, Hacker News, Wikipedia, GitHub, Stack Overflow — before writing. Nine document modes. Real-time multi-user collaboration over WebSocket with presence, live cursors, node-anchored comments, and snapshot handoff.',
    detail: [
      'Worth mentioning in an interview: the DSL text editor is hand-built — syntax highlighting, bracket matching, indent guides, live AST viewer — with no Monaco or CodeMirror dependency. Live cursors are imperative and rAF-driven rather than React-state-driven, specifically to survive 20 packets per second per peer.',
      'Deterministic before generative, everywhere it is checkable. For ERDs, schema detection parses SQLAlchemy, Django, Prisma, TypeORM, or raw SQL models directly into DSL with no LLM call at all; Instant mode builds a skeleton diagram straight from the code graph. The model is the fallback, not the default.',
      'One fix that removed a whole class of hallucination: never send the model a truncated function. An earlier 400-character slice would show a branch opening and never closing, and the model would confidently invent the rest. Now every node in the context is a full signature or a full body, and anything summarised is labelled as summarised.',
      'Two guards with deliberately opposite failure modes. The refine guard fails open, because it is a quality gate on an AI feature and a classifier outage should not disable refinement. The snapshot guard fails closed, because it protects stored data that every viewer of a diagram will load, and the browser-side validator is trivially bypassed by calling the API directly.',
      'Deployed for real: every push to main builds a Docker image, authenticates to AWS through OIDC role assumption with no stored keys, pushes to ECR, and rolls the container onto EC2. Storage moved from browser-to-Firestore writes onto DynamoDB behind the API, so ownership, membership, and validation are enforced in one place.',
      'Collaboration is single-process on purpose. Room state is an in-memory dict, so --workers 1 is load-bearing. It was rewritten for Redis-backed multi-instance fan-out, but the Redis was never provisioned, so it was reverted rather than shipped as untested infrastructure and the constraint written into the Dockerfile and the READMEs.',
      'The v5.0 sharing audit is the story I would tell. A copied share link simply did not work for a teammate on the same WiFi, and there were four independent blockers: the sharer was never in the room they shared, CORS blocked every API call from LAN origins while WebSockets sailed through — so cursors moved while the diagram never rendered — neither Vite nor uvicorn bound to the network, and the links hardcoded localhost.',
      'Two repos, six documented major versions, roughly 112k lines, built with Mohini Sharma.',
    ],
    tech: [
      'Python',
      'FastAPI',
      'Gemini',
      'tree-sitter',
      'networkx',
      'React',
      'D3',
      'elkjs',
      'Firebase',
      'WebSocket',
      'DynamoDB',
      'Docker',
      'AWS EC2',
      'GitHub Actions',
    ],
    domains: ['Compilers', 'LLM applications', 'Real-time collaboration', 'DevOps'],
    links: [{ label: 'diagramstudio.in', href: 'https://diagramstudio.in' }],
  },
  {
    slug: 'email-admin-system',
    name: 'Email Admin System',
    year: '2025',
    context: 'Freelance',
    blurb:
      'Delegated mailbox access for a whole company, without handing anyone the actual password.',
    challenge:
      'A company needs dozens of people reading and sending from shared Gmail and Outlook mailboxes, and managers above them need to see their team’s activity. Sharing the real account password is the usual answer, and it is the wrong one.',
    approach:
      'A three-tier platform — super admin, company admin, delegated user — where mailboxes are connected once via App Password or OAuth2 and stored AES-256-CBC encrypted with a per-record IV. Delegated users get a real inbox over IMAP/SMTP (async, provider-specific quirks handled per service) with threading, attachments, and scheduled send. The org hierarchy — Floor Manager, Team Lead, Candidate — is resolved with a recursive CTE, so a subtree query works at any depth, and every KPI is scoped to subordinates only, never the signed-in person’s own activity.',
    outcome:
      'Roughly 7,600 lines of async FastAPI over PostgreSQL, with JWT role middleware, billing and subscription plans, device and session monitoring, and Docker Compose packaging for both services. The scheduled-send dispatcher claims due rows with UPDATE ... RETURNING, so two server processes can never double-send the same message.',
    detail: [
      'The row-claiming scheduler was deliberate rather than clever: a naive polling loop double-sends the moment there is more than one backend instance behind a load balancer, and that failure is invisible until a client notices duplicate emails.',
      'The repo tracks its own security debt openly — delegated-user passwords still stored reversibly, a default super-admin credential, mail bodies rendered without sanitisation. Known and written down, not discovered later.',
    ],
    tech: [
      'FastAPI',
      'PostgreSQL',
      'Python',
      'JWT',
      'OAuth2',
      'React',
      'Docker',
      'nginx',
    ],
    domains: ['Backend', 'Security', 'Multi-tenant SaaS'],
  },
  {
    slug: 'vibecheck',
    name: 'VibeCheck',
    year: '2025',
    context: 'Freelance, with Mohini Sharma',
    blurb: 'Honest café feedback from customers who would never say it to your face.',
    challenge:
      'A café owner finds out about a bad shift days later, as a one-star Google review with no table, no time, and no detail. People will not be honest in person, and they will not be honest with their name attached.',
    approach:
      'A QR code per table opens a sub-minute anonymous flow: a selfie mood check where a client-side TensorFlow.js model reads the expression and only the detected mood ever leaves the device, a playful vibe scale instead of stars, optional voice feedback transcribed in-browser with the Web Speech API, one rotating pointed question per visit, and a free-text Ghost Note. Submitting returns a shareable receipt card with a Gemini-written one-liner, which doubles as the growth loop.',
    outcome:
      'A FastAPI backend over Supabase Postgres feeding an owner dashboard — live feed, table × time-slot mood heatmap, table rankings, repeat-visitor stats, keyword insights. No accounts anywhere: repeat visits are tracked by a localStorage token scoped per café.',
    detail: [
      'On-device face detection was the trust argument, not an optimisation. Asking a stranger for a selfie only works if “the photo never leaves your phone” is structurally true rather than a privacy-policy sentence.',
      'The brief called for recording real voice, deleting it, and generating an AI voice-over for anonymity. Browser speech-to-text delivers the same outcome — the owner never hears the customer — for none of the cost. Solving the actual problem rather than the literally-described feature.',
      'The one-liner call degrades to a static line if Gemini is unconfigured or down, so the submission flow never depends on a third-party API being up.',
    ],
    tech: [
      'React',
      'Vite',
      'TensorFlow.js',
      'face-api.js',
      'FastAPI',
      'Python',
      'Supabase',
      'Gemini',
    ],
    domains: ['LLM applications', 'Privacy', 'Product'],
  },
  {
    slug: 'hrtal-copilot',
    name: 'HRTAL Copilot',
    year: '2025',
    context: 'Ascentt AITek',
    blurb: 'A Power BI-embedded HR analytics chatbot built on multi-LLM orchestration.',
    challenge:
      'HR analytics needs an LLM to answer questions about employee data — but sending employee records to a model is unacceptable.',
    approach:
      'Schema-only architecture: the model sees table structure, never rows. Backed by an 8-layer security model, RBAC, hybrid BM25 + FAISS semantic retrieval, persistent ChromaDB sessions, and a sandboxed pandas execution engine that runs generated queries in isolation. Query routing, intent classification, and parallel LLM processing sit in front of it.',
    outcome:
      'Natural-language HR analytics with zero raw employee data exposure to the model. Deployed via Docker on AWS EC2.',
    tech: ['Python', 'LangChain', 'ChromaDB', 'FAISS', 'BM25', 'pandas', 'Docker', 'AWS EC2', 'Power BI'],
    domains: ['RAG', 'LLM applications', 'Security'],
  },
  {
    slug: 'ppe-compliance',
    name: 'PPE Compliance System',
    year: '2025',
    context: 'Ascentt AITek, presented at Amazon re:Invent',
    featured: true,
    blurb: 'Real-time workplace safety monitoring across live CCTV feeds.',
    challenge:
      'One general-purpose detector trained on every class at once loses the small, frequently-occluded ones — gloves and boots disappear behind bodies and machinery.',
    approach:
      'Five specialized YOLOv8 models, each tuned to its own class group: helmets, vests, gloves, boots, fire, and persons. Face recognition ties a detection to a specific employee so compliance is tracked per person, not per frame, and violations raise automated alerts.',
    outcome:
      '~85% detection accuracy in production. React dashboard with live CCTV feeds, lane-wise monitoring, and compliance logs. Presented at Amazon re:Invent.',
    tech: ['Python', 'YOLOv8', 'OpenCV', 'Face Recognition', 'React.js'],
    domains: ['Computer vision', 'Real-time systems'],
  },
  {
    slug: 'engine-test-forecasting',
    name: 'Engine Test Forecasting',
    year: '2025',
    context: 'Ascentt AITek, for VECV',
    blurb: 'Predicting engine test cycles from a dataset far too small to train on.',
    challenge:
      'Predict engine test cycles to cut testing time, with real data from only 83 engines — far too little to train a time-series model.',
    approach:
      'Generated 5,000+ synthetic test cycles with a Transformer-VAE and validated them against the real distribution using skewness, kurtosis, and distribution analysis before trusting any of it. Trained an Informer model on the augmented set.',
    outcome:
      'R² = 0.849 on real validation data, reducing test cycle analysis time by 15–20%.',
    tech: ['Python', 'PyTorch', 'Informer', 'Transformer-VAE'],
    domains: ['Time series', 'Synthetic data', 'Generative AI'],
  },
  {
    slug: 'asc-cadence',
    name: 'Asc-CADence',
    year: '2025',
    context: 'Ascentt AITek',
    blurb: 'AI-driven CAD design optimization that automates the engineering iteration loop.',
    challenge:
      'A structural design iteration is manual: read the FEA results, decide what to change, change the CAD, re-run. The reading and deciding steps are where engineers lose days.',
    approach:
      'Ingests FEA result files and CAD STEP files, uses Gemini via LangChain to generate quantitative structural improvement suggestions, and applies them automatically through CADomatic. A self-healing retry system handles failed modifications, and an AI validation step compares original against modified geometry before anything is accepted.',
    outcome: 'Improved modification accuracy from 60% to 75%.',
    tech: ['Python', 'FastAPI', 'Gemini', 'LangChain'],
    domains: ['LLM applications', 'Engineering automation'],
  },
  {
    slug: 'auranova',
    name: 'Auranova',
    year: '2025',
    context: 'Ascentt AITek, AR/VR proof of concept',
    blurb: 'Multi-view 3D reconstruction on the TRELLIS diffusion model, running without a GPU budget.',
    challenge:
      'TRELLIS reconstructs from a single image, which loses everything the camera could not see, and the available environment was CPU-constrained Colab.',
    approach:
      'Modified the pipeline to accept multiple images instead of one, substantially improving reconstruction accuracy over single-image generation, and adapted it to run in CPU-constrained environments. Built automated mesh colour modification via hue manipulation.',
    outcome: 'Reduced 3D asset creation cost by 40% and showroom load time by 20%.',
    detail: [
      'Ten-plus reconstruction approaches were evaluated before landing on TRELLIS — among them TripoSR, LGM, Hunyuan3D, Shap-E, OpenMVS, and classical photogrammetry via pycolmap.',
      'Multi-view matters because a single photo of a car cannot show you the back of it. Feeding several angles gives the model real geometric signal instead of asking it to invent the occluded half.',
      'Exports land as GLB with the mesh simplified and the texture capped, so the output opens directly in a browser viewer, Blender, or a game engine rather than staying a research artifact.',
      'Built with Mohini Sharma, Aditi Zingre, and Tanisha Raghuvanshi.',
    ],
    tech: ['Python', 'PyTorch', 'TRELLIS', 'Diffusion Models'],
    domains: ['Generative AI', '3D'],
  },
  {
    slug: 'hr-copilot',
    name: 'HR Copilot',
    year: '2025',
    context: 'Ascentt AITek',
    blurb: 'A fully local HR assistant that answers from the handbook and refuses everything else.',
    challenge:
      'An employee handbook is sensitive by definition, so no employee question and no policy text could go to an external API. The model also had to be small enough to self-host, which meant a 3B model doing work usually given to a much larger one.',
    approach:
      'Two separate LLM calls rather than one. A validation gate classifies each query as HR or not against an explicit scope taxonomy and returns structured JSON, with a greeting whitelist short-circuiting the model call entirely and a deliberately permissive 0.20 confidence threshold, because wrongly blocking a real HR concern costs far more than letting a stray question through. Only validated queries reach retrieval: dense search over ChromaDB plus BM25, merged with Reciprocal Rank Fusion, then synthesis with twelve worked examples in the prompt.',
    outcome:
      'Runs entirely on Ollama with Qwen 2.5:3B — no data leaves the network. Built as one of two competing internal versions; the hybrid retrieval and the two-stage validate-then-synthesise pipeline were carried into the merged product that shipped.',
    detail: [
      'BM25 earns its place because HR policy text is full of acronyms — PF, ESI, UAN, FNF, LOP, comp-off — that carry almost no semantic signal for an embedding model but are exactly what someone types into the box.',
      'Splitting classification from generation was about accuracy, not tidiness. At 3B parameters a prompt doing two jobs does both worse, and separate prompts can be tuned or swapped independently.',
    ],
    tech: ['Python', 'Ollama', 'Qwen', 'ChromaDB', 'BM25', 'Streamlit', 'FastAPI'],
    domains: ['RAG', 'LLM applications', 'Security'],
  },
  {
    slug: 'rust-detection',
    name: 'Rust Detection',
    year: '2024',
    context: 'Ascentt AITek, for VECV',
    blurb: 'Measuring corrosion area in real-world units from a photograph.',
    challenge:
      'Detecting rust in an image is the easy half. The useful answer is how much of the component is corroded, in millimetres, from a photo taken at an unknown distance.',
    approach:
      'Annotated a polygon segmentation dataset in COCO format with LabelMe, then benchmarked OpenCV and YOLOv8-based approaches for the detection stage. Real-world sizing comes from a pixel-to-millimetre ratio derived from a reference sticker of known dimensions placed in frame, which turns a segmentation mask into an actual measured area.',
    tech: ['Python', 'YOLOv8', 'OpenCV', 'LabelMe'],
    domains: ['Computer vision', 'Industrial inspection'],
  },
  {
    slug: 'anuvaad',
    name: 'Anuvaad',
    year: '2024',
    context: 'Personal project',
    blurb: 'Multilingual translation across text, speech, audio, image, and video in 14 languages.',
    approach:
      'Built the entire Flutter app for the shipped version over an existing Flask backend, plus two features end to end including their backend integration: ScanIt, which extracts text from a photograph, and SnapTranslate, which extracts it and translates it into any of thirteen Indian languages. Each feature is its own module — card, input modal, result screen — so adding one touches no other feature’s code.',
    outcome:
      'Live on the Play Store: 100+ downloads, rated 4.8 from 26 reviews. Cut manual translation work by 60%.',
    detail: [
      'OCR started on-device with ML Kit and moved server-side, and the four commented-out versions above the live code are the record of it. On-device was fast and worked offline but was Latin-script only — useless for Devanagari or Tamil, which was the entire point of the app.',
      'Credits are deducted through a Firestore transaction: read, verify above zero, decrement, atomically. Two requests arriving together from the same user cannot double-spend.',
      'The home screen is a grid of flip cards. Six features with non-obvious names would otherwise mean tapping each one to find out what it does; long-press to read the description keeps discovery on the home screen.',
    ],
    tech: ['Flutter', 'Dart', 'Python', 'Flask', 'Firebase', 'Azure', 'OCR'],
    domains: ['NLP', 'Speech', 'Mobile', 'OCR'],
  },
  {
    slug: 'uoons-seller',
    name: 'Uoons Seller App',
    year: '2024',
    context: 'Uoons Ecommerce, live on Google Play',
    blurb: 'The seller-side app for an electronics and home-services marketplace.',
    challenge:
      'A two-person Flutter team at a small company with no dedicated mobile mentor, three apps planned, and a real Play Store release at the end of it. Everything — API integration, SSO, Firebase phone auth, signed .aab release builds — had to be learned while shipping.',
    approach:
      'Built the full seller workflow against live production endpoints: registration and OTP login layered with Firebase Phone Authentication, paginated order lists with tag filtering behind a Provider/ChangeNotifier state layer, product and store management, bank details and payouts, KYC upload, a shipping cost calculator, and a dashboard of charted business analytics.',
    outcome:
      'Live on Google Play as com.seller.uoons with 100+ installs — the only one of the three planned apps that reached production, and the only one wired to a real backend. Started as one of two Flutter developers on the team and ended up leading it.',
    detail: [
      'Three apps were planned. The Service app (a customer-facing booking flow across 14 screens, built from a 2,144-row service catalogue handed over as raw CSV) and the Service Partner app (gig-worker side: KYC upload, job assignment and tracking, earnings and bank transfers, performance targets) both shipped working Google Sign-In but stayed UI-first with hardcoded data — they never got their backend layer. The Seller App is where that learning actually landed.',
      'What I went in without: any of it. There was no dedicated mobile mentor at the company, so API integration, SSO, Firebase phone auth, and producing a signed release .aab were all self-taught on a real deadline with real users waiting.',
    ],
    tech: ['Flutter', 'Dart', 'Firebase', 'REST APIs', 'Provider'],
    domains: ['Mobile', 'E-commerce'],
    links: [
      {
        label: 'Google Play',
        href: 'https://play.google.com/store/apps/details?id=com.seller.uoons',
      },
    ],
  },
  {
    slug: 'dark-pattern-buster',
    name: 'Dark Pattern Buster',
    year: '2023',
    context: 'IIT BHU Hackathon, Top 25 Finalist',
    blurb: 'A Chrome extension that flags manipulative e-commerce UI in real time.',
    challenge:
      'The hard part was never the models. Amazon, Flipkart, and Meesho have completely different DOM structures, inconsistent class names, deeply nested layouts, and content that loads dynamically — and the classifier is only as good as the text blocks handed to it.',
    approach:
      'A custom recursive DOM segmentation pass rather than a flat querySelectorAll: it walks the tree respecting block boundaries, skips invisible and pixel-sized elements, and treats viewport area as a heuristic — anything covering more than 30% of the screen is too coarse to be one unit, so it recurses instead. That yields semantically meaningful blocks. Four detectors run on top: urgency and scarcity (SVM + TF-IDF, 91.14%), fake reviews (Logistic Regression + TF-IDF, 84.6%, flagging products where over 40% of reviews read as AI-generated), hidden costs in Terms & Conditions including PDFs (custom binary classifier, 81.2%), and a deterministic pricing check that follows sponsored links and compares the advertised price against the real product page.',
    outcome:
      'Top 25 out of 150+ national teams at a hackathon run by IIT BHU with the Ministry of Consumer Affairs, presented to Department of Consumer Affairs officials.',
    detail: [
      'The pricing module came from a real experience, not a hypothetical: a phone advertised in a sponsored listing at one price and priced very differently on the actual product page.',
      'Logistic Regression was chosen for reviews specifically because its calibrated output aggregates cleanly into the 40% threshold — below that the review set is still worth trusting, above it the social proof is too polluted to mean anything.',
      'The Flipkart-specific class names in the scrapers are brittle by nature and any frontend update breaks them. That is a known limitation of the approach rather than an oversight.',
    ],
    tech: ['JavaScript', 'Python', 'scikit-learn', 'Flask', 'BeautifulSoup'],
    domains: ['Machine learning', 'Browser extensions', 'NLP'],
  },
  {
    slug: 'skin-disease-detection',
    name: 'Skin Disease Detection',
    year: '2024',
    context: 'Personal project',
    blurb: 'Detection and segmentation of skin lesions on a dataset built from scratch.',
    approach:
      'Detectron2 Faster R-CNN R50-FPN for bounding box detection and SAM ViT-B for high-precision segmentation. Built and annotated a custom two-class dataset (Malignant, Benign) with LabelImg in Pascal VOC, converted to COCO.',
    outcome: 'AP of 40.6.',
    tech: ['Python', 'Detectron2', 'SAM', 'PyTorch'],
    domains: ['Computer vision', 'Medical imaging'],
  },
  {
    slug: 'barcode-ocr',
    name: 'Barcode OCR Pipeline',
    year: '2025',
    context: 'Ascentt AITek',
    blurb: 'Reads the alphanumeric string printed beneath a barcode.',
    approach:
      'Pretrained YOLOv8 for barcode detection and bounding boxes, then GOT-OCR 2.0 fine-tuned on a custom annotated dataset for text extraction. Built the full annotation pipeline and integrated both models into one end-to-end inference pipeline.',
    tech: ['Python', 'YOLOv8', 'GOT-OCR 2.0'],
    domains: ['Computer vision', 'OCR'],
  },
  {
    slug: 'kisaan-vani',
    name: 'Kisaan Vani',
    year: '2023',
    context: 'College major project, funded at IIT Indore',
    blurb: 'Push a probe into the soil, get the five crops most worth growing in it.',
    challenge:
      'The commercial sensors made the idea unscalable before it started. The NPK sensor alone was ₹5,400 — more than half the entire ₹9,200 college grant — and a pH sensor another ₹1,724. At those prices the system could never reach the small farmers it was built for. The datasets were the second problem: the standard public crop-recommendation sets cover twenty to twenty-five common crops and carry no economics at all.',
    approach:
      'Built the sensors instead of buying them. The moisture sensor is two stainless steel probes an inch apart in a voltage divider into the ESP32’s analog pin — dry soil reads low, wet reads high, mapped to a percentage after calibration. The pH sensor uses two probes across different fixed resistors with a variable resistor for trimming, calibrated once against the commercial unit and then used independently in the field. For the model, curated 92,000 rows by hand from Indian government agricultural manuals and soil research covering 108 crops, including high-margin ones no existing tool suggests — Ashwagandha, Asafoetida, dragon fruit, tulsi — and layered in irrigation cost, seasonal viability, and market price.',
    outcome:
      'A Random Forest returning the top five crops with confidence and profitability, plus an Xception CNN diagnosing disease across 42 crops with both an organic and a chemical treatment path. Pitched at SHAKTI 1.0, IIT Indore, and received ₹40,000 in funding as one of 33 teams selected.',
    detail: [
      'Two DIY sensors cost effectively nothing. That is the difference between a lab demo and something deployable across thousands of farms, where hardware cost is the actual barrier rather than the software.',
      'Random Forest was chosen for the shape of the problem: 108 classes, non-linear relationships across mixed soil parameters, real sensor noise, and feature importances that let the app tell a farmer which parameter is constraining their options.',
      'The recommendations deliberately surface crops that are viable but not commonly grown nearby. Telling a farmer to grow what everyone around them already grows is advice against their own margins.',
      'Built the entire Flutter app — sensor readings via Firebase, live weather, crop prediction and disease flows, a farming chatbot, English and Hindi — plus the ESP32 wiring, including bridging the NPK sensor’s 12V RS485 output to the ESP32 through an RS485-to-TTL converter.',
    ],
    tech: ['Python', 'scikit-learn', 'TensorFlow', 'Flutter', 'ESP32', 'Firebase', 'IoT'],
    domains: ['Machine learning', 'IoT', 'Computer vision', 'Mobile'],
  },
  {
    slug: 'handwriting-ocr',
    name: 'Handwriting OCR',
    year: '2023',
    context: 'B.Tech minor project',
    blurb: 'Reading handwritten pages without retyping them — and the bug that looked like corruption.',
    challenge:
      'Handwritten text has no fixed character positions, so a recogniser cannot be trained on per-character labels. The page also has to be cut into words before anything can read them, across lines that are never perfectly horizontal.',
    approach:
      'Two stages. Segmentation is classical computer vision: an anisotropic Gaussian filter smears strokes into word-shaped blobs, Otsu thresholding binarises, contours find candidates, and DBSCAN clusters boxes into lines by vertical overlap using a Jaccard distance matrix — which handles slanted lines that a row-projection would not. Recognition is a CRNN: four convolutional layers into two stacked bidirectional LSTMs, trained with CTC loss on the IAM Words dataset, so alignment is learned from the target word alone.',
    outcome:
      'A working end-to-end pipeline through at least eight checkpoint iterations, with edit distance tracked as the metric rather than raw accuracy.',
    detail: [
      'The story worth telling is the debugging. A trained model reloaded in a fresh session kept producing confident, fluent output that was not English — never garbage, just consistently wrong. Training and predicting in one session worked fine, which pointed hard at the saved files, so I went through every Keras serialisation format looking for a corruption bug.',
      'There was no corruption bug. The vocabulary — the character-to-index mapping — was never saved. In-session it was still in memory; reloaded, the predictions were being decoded against the wrong mapping. Chasing the wrong hypothesis taught me more about model serialisation than the working code did, and every model I have saved since ships its artifacts together.',
    ],
    tech: ['Python', 'TensorFlow', 'Keras', 'OpenCV', 'scikit-learn', 'NumPy'],
    domains: ['Computer vision', 'OCR', 'Deep learning'],
  },
  {
    slug: 'depixelation',
    name: 'Depixelation',
    year: '2024',
    context: 'Intel Unnati Industrial Training',
    blurb: 'Detecting pixelated images, then reconstructing them.',
    approach:
      'A compact CNN — three convolution and pooling stages into a dense head with dropout — handles binary detection of whether an image is pixelated, with an SRGAN doing the upscaling and correction pass afterwards.',
    outcome:
      'The detection model was quantised through TFLite from 96.5MB down to under 10MB, small enough to run where it would actually be used rather than only on the training machine.',
    tech: ['Python', 'TensorFlow', 'TFLite', 'SRGAN', 'CNN'],
    domains: ['Computer vision', 'Generative AI'],
  },
  {
    slug: 'e-samadhan',
    name: 'E-Samadhan',
    year: '2024',
    context: "Hack'Ndore, Indore Municipal Corporation",
    blurb: 'One app for municipal e-services, built in a day.',
    challenge:
      'A civic brief from the Indore Municipal Corporation: unify scattered municipal services — certificates, licences, utility requests — behind one citizen-facing app with a staff-side panel, in a 48-hour hackathon.',
    approach:
      'A cross-platform Flutter app targeting Android, iOS, and web from one codebase, with a role-split login, a service grid, a live application status timeline, and a voice-and-text chatbot tab. One service — marriage certificates — was built all the way through, bilingual form and document capture included, rather than six services built shallowly.',
    outcome:
      'Did not reach the top-ten finals. The depth-over-breadth call was the right one for a one-day build: the hardest parts of the real problem get demonstrated once, and the remaining five services are the same pattern repeated.',
    tech: ['Flutter', 'Dart', 'GetX'],
    domains: ['Mobile', 'Civic tech'],
  },
  {
    slug: 'qr-bridge',
    name: 'QR Bridge',
    year: '2025',
    context: 'Personal project',
    blurb: 'Moving a file from a laptop to a phone using nothing but blinking QR codes.',
    challenge:
      'No Wi-Fi transfer, no Bluetooth, no internet, no server relay between the two devices. Only light, and a phone camera that has to read it reliably while someone holds it by hand.',
    approach:
      'A chunking and reassembly protocol written from scratch and shared by both ends. A file becomes base64 and is split into roughly 480-character chunks — deliberately small, because a denser QR code carries more data per frame and is far harder for a camera to lock onto at speed. Each chunk is one frame carrying a small JSON envelope with its transfer id, index, total, and mime type. The receiver drops frames into a Map keyed by index and reassembles once the count matches, so it is order-independent and duplicate-tolerant, and the sender just loops the sequence until told to stop.',
    outcome:
      'A zero-dependency Node static server using only built-in modules, with both QR libraries vendored rather than pulled from a CDN — an air-gapped transfer tool loses its own point if it needs a network to boot. Also exports the sequence as a .webm through canvas.captureStream and MediaRecorder, with no video encoding library.',
    detail: [
      'The gotcha worth knowing: phones block camera access on plain HTTP unless the address is literally localhost, and the phone has to load the laptop’s IP. The server auto-detects a self-signed cert and starts an HTTPS listener when one exists, and says plainly why the camera will fail when it does not.',
    ],
    tech: ['Node.js', 'JavaScript', 'getUserMedia', 'MediaRecorder', 'Canvas'],
    domains: ['Browser APIs', 'Protocols'],
  },
  {
    slug: 'llm-fit-checker',
    name: 'Will It Fit?',
    year: '2025',
    context: 'Personal project',
    blurb: 'Whether a given open LLM fits on your machine, and where every gigabyte goes.',
    challenge:
      'Most “will this model fit” calculators multiply parameters by bits and stop there, which ignores the KV cache entirely — often the larger cost at long context. And laptop memory specs, especially unified memory sizes, are not reliably in any model’s training data.',
    approach:
      'A hand-built catalogue of around twenty open models carrying their real architecture parameters from each published config — layer count, hidden size, KV head count, head dimension — so the KV cache maths is GQA-aware and uses n_kv_heads rather than total attention heads. Twenty quantization formats are defined with their real effective bits per weight and their own format overhead. Hardware lookup goes to Gemini with Google Search grounding, falling back through ungrounded Gemini, a raw search API, an offline catalogue, and finally manual entry.',
    outcome:
      'Every number is shown with the formula that produced it rather than as a verdict, a comparison table shows which quantization formats fit at a glance, and a binary search reports the largest context length that would fit when the requested one does not. Runs with no API keys at all.',
    detail: [
      'Getting GQA right is the difference between correct and merely working: modern models have far fewer KV heads than query heads, and using the wrong count inflates the cache estimate several times over.',
      'Unified-memory machines get more OS headroom reserved than discrete-GPU ones, because the operating system and every other running app share the exact same pool as the model.',
    ],
    tech: ['Python', 'Streamlit', 'Gemini'],
    domains: ['LLM infrastructure', 'Developer tools'],
  },
  {
    slug: 'cocacola-intelligence',
    name: 'Market Share Intelligence',
    year: '2024',
    context: 'Ascentt AITek, customer proof of concept',
    blurb: 'Reading shelf presence from photographs of retail displays.',
    approach:
      'Built and annotated the image dataset from scratch with LabelImg and LabelMe, then augmented it to cover the lighting, angle, and occlusion variation that real store photographs have and a clean training set does not. Prepared the documentation and the stakeholder presentation alongside it.',
    tech: ['Python', 'OpenCV', 'LabelImg', 'LabelMe'],
    domains: ['Computer vision', 'Data annotation'],
  },
  {
    slug: 'e-raksha',
    name: 'E-Raksha',
    year: '2025',
    context: 'Hackathon, with Kashi Sankhla and Sanskriti Malviya',
    blurb: 'Research, system architecture, and the pitch for a safety platform.',
    approach:
      'A design-stage entry rather than a build: scoped the problem, researched the existing landscape, designed the system architecture, and put together the pitch deck. Worth listing honestly as what it was — architecture and positioning work, not shipped code.',
    tech: ['System design'],
    domains: ['Research'],
  },
  {
    slug: 'grid',
    name: 'GRID',
    year: '2025',
    context: 'Ascentt AITek',
    blurb: 'Backend development and QA on an enterprise platform.',
    approach:
      'Refactored the Python REST API codebase — removed redundancies, added docstrings, improved PostgreSQL query efficiency to production standards. Ran end-to-end QA across all platform functionality.',
    tech: ['Python', 'FastAPI', 'PostgreSQL'],
    domains: ['Backend', 'QA'],
  },
  {
    slug: 'sandbox-system',
    name: 'Sandbox System',
    year: '2025',
    context: 'Ascentt AITek',
    blurb: 'A secure, lightweight sandbox for demonstrating products to clients remotely.',
    approach:
      'Evaluated Flatpak, Docker, and tunnelling approaches, then shipped a Docker + Caddy solution with automatic HTTPS, reverse proxying, and low latency for isolated browser-accessible demos.',
    tech: ['Docker', 'Caddy', 'Linux'],
    domains: ['Infrastructure', 'DevOps'],
  },
];

/* ── Skills ─────────────────────────────────────────────────────────────── */

export const skills: Record<string, string[]> = {
  'Computer Vision': ['YOLOv8', 'YOLOv10', 'Detectron2', 'SAM', 'OpenCV', 'Face Recognition'],
  'LLMs & RAG': [
    'LangChain',
    'ChromaDB',
    'FAISS',
    'BM25',
    'Gemini',
    'Qwen',
    'Mistral',
    'Sentence Transformers',
    'Prompt Engineering',
  ],
  'Generative AI': [
    'GANs',
    'VAEs',
    'Transformer-VAE',
    'TabDDPM',
    'Diffusion Models',
    'Synthetic Data Generation',
  ],
  'Time Series': ['Informer', 'LSTM', 'GRU', 'XGBoost'],
  'On-device AI': [
    'ONNX Runtime',
    'Qualcomm QNN',
    'Quantization',
    'Edge Inference',
    'TensorFlow.js',
    'TFLite',
  ],
  Embedded: ['ESP32', 'Arduino', 'RS485', 'Sensor calibration'],
  Backend: [
    'Python',
    'FastAPI',
    'REST APIs',
    'PostgreSQL',
    'SQLAlchemy',
    'Flask',
    'SQLite',
    'Neo4j',
    'Node.js',
    'WebSocket',
    'OAuth2',
  ],
  Frontend: [
    'React.js',
    'TypeScript',
    'Flutter',
    'D3',
    'ReactFlow',
    'Streamlit',
    'Power BI Custom Visuals',
  ],
  MLOps: [
    'MLflow',
    'Docker',
    'AWS EC2',
    'GitHub Actions',
    'Jenkins',
    'PySpark',
    'Databricks',
    'OpenTelemetry',
  ],
};

/* ── Achievements ───────────────────────────────────────────────────────── */

export type Achievement = { slug: string; name: string; detail: string; project?: string };

export const achievements: Achievement[] = [
  {
    slug: 'reinvent',
    name: 'Amazon re:Invent',
    detail: 'PPE Compliance System presented at Amazon re:Invent',
    project: 'ppe-compliance',
  },
  {
    slug: 'iit-bhu',
    name: 'Top 25 Finalist',
    detail: 'Dark Pattern Buster Hackathon 2023, IIT BHU',
    project: 'dark-pattern-buster',
  },
  {
    slug: 'snapdragon',
    name: 'Snapdragon Multiverse',
    detail: 'Selected for the Snapdragon Multiverse Hackathon, Qualcomm (Noida)',
    project: 'recall',
  },
  {
    slug: 'drishti-shakti',
    name: 'Drishti Shakti 2.0',
    detail: 'Selected for the IIT Drishti Shakti 2.0 Ideation Program',
  },
  {
    slug: 'shakti',
    name: 'SHAKTI 1.0 grant',
    detail:
      '₹40,000 in funding at SHAKTI 1.0, IIT Indore — one of 33 teams selected at the valedictory session',
    project: 'kisaan-vani',
  },
  {
    slug: 'acm-w',
    name: 'ACM-W Ideathon',
    detail: 'Regional finalist, ACM-W 2024 Ideathon',
    project: 'kisaan-vani',
  },
  {
    slug: 'play-store',
    name: 'Shipped to the Play Store',
    detail: 'Two apps live on Google Play with 100+ installs each',
    project: 'anuvaad',
  },
  {
    slug: 'intel-unnati',
    name: 'Intel Unnati',
    detail: 'Completed Intel Unnati Industrial Training 2024',
    project: 'depixelation',
  },
  { slug: 'iic', name: 'IIC Idea Pitching', detail: 'Runner-up, IIC Idea Pitching Competition' },
  { slug: 'ev-paper', name: 'Paper presentation', detail: 'Paper presentation on AI in EVs' },
];

/* ── About ──────────────────────────────────────────────────────────────── */

export const about = [
  'I work on AI systems that have to survive contact with production. Most of what I ship is not the model — it is the pipeline around it: the ingestion, the quantization, the security boundary, the deployment, the thing you do when the library you need has no wheel for the architecture you are on. Computer vision and RAG are where I spend most of my time, with on-device inference the most recent addition.',
  `Currently ${roles[0].title.split(', ')[0]} at ${roles[0].company.replace(' Pvt. Ltd.', '')} in Indore, ${profile.experienceLength} into industry, after a B.Tech in Artificial Intelligence and Machine Learning at Acropolis Institute of Technology and Research.`,
];

/* ── Stack rows (marquee) ───────────────────────────────────────────────── */

export const stackRows: { label: string; items: string[] }[] = [
  {
    label: 'AI/ML',
    items: [
      'PyTorch',
      'YOLOv8',
      'Detectron2',
      'SAM',
      'OpenCV',
      'ONNX Runtime',
      'Qualcomm QNN',
      'LangChain',
      'ChromaDB',
      'FAISS',
      'Informer',
      'Transformer-VAE',
      'Hugging Face',
      'scikit-learn',
      'NumPy',
      'pandas',
      'Gemini',
    ],
  },
  {
    label: 'Backend & Infra',
    items: [
      'Python',
      'FastAPI',
      'PostgreSQL',
      'SQLAlchemy',
      'SQLite',
      'Neo4j',
      'Node.js',
      'DynamoDB',
      'Supabase',
      'Docker',
      'AWS EC2',
      'Caddy',
      'Linux',
      'GitHub Actions',
      'Jenkins',
      'MLflow',
      'PySpark',
    ],
  },
  {
    label: 'Frontend',
    items: [
      'React',
      'TypeScript',
      'Next.js',
      'Flutter',
      'Dart',
      'D3',
      'ReactFlow',
      'elkjs',
      'WebSocket',
      'Firebase',
      'Streamlit',
      'Tailwind',
      'Power BI',
    ],
  },
];

/* ── Studio metrics (split-flap) ────────────────────────────────────────── */

export const metrics: { value: string; label: string }[] = [
  { value: '25', label: 'systems shipped' },
  { value: '0.849', label: 'R² on real data, 83 engines' },
  { value: '5,000', label: 'synthetic cycles generated' },
  { value: '256', label: 'dims, int8, hand-rolled KNN' },
];

/* ── Derived helpers ────────────────────────────────────────────────────── */

export const featuredProjects = projects.filter((p) => p.featured);

export const allDomains = Array.from(new Set(projects.flatMap((p) => p.domains))).sort();

export const projectBySlug = (slug: string) => projects.find((p) => p.slug === slug);

/** Chat empty state. Lives here so the client never imports lib/context.ts,
 *  which would drag the entire generated biography into the browser bundle. */
export const SUGGESTED_QUESTIONS = [
  "What's the hardest bug you've solved?",
  'Have you deployed anything to production?',
  'What have you built with RAG?',
  'Tell me about your on-device work.',
];

export const navLinks = [
  { label: 'Work', href: '#work' },
  { label: 'About', href: '#about' },
  { label: 'Contact', href: '#contact' },
];