// frontend/src/components/diagramstudio/showcase.ts
/**
 * One record per diagram type, holding the three things that tell the product
 * story in order: the prompt somebody typed, the DiagramDSL it returned, and
 * the SVG it rendered. Same shape as DiagramStudio's own src/showcase.
 *
 * The SVGs are real generator exports, imported with Vite's `?raw` so they
 * stay editable .svg files — regenerate one in DiagramStudio and drop it into
 * ./diagrams/ to update the portfolio.
 *
 * NOTE (sequence): the sequence diagram's SVG is the real export, but its DSL
 * below was reconstructed from that diagram, not copied from DiagramStudio.
 * Paste the real DSL over it when you have it.
 */

import architectureSvg from './diagrams/architecture.svg?raw';
import flowchartSvg from './diagrams/flowchart.svg?raw';
import erdSvg from './diagrams/erd.svg?raw';
import swimlaneSvg from './diagrams/swimlane.svg?raw';
import hlaSvg from './diagrams/hla.svg?raw';
import sequenceSvg from './diagrams/sequence.svg?raw';

export type ShowcaseItem = {
  id: string;
  label: string;
  title: string;
  filename: string;
  prompt: string;
  dsl: string;
  meta: string;
  svg: string;
  /** Frame shape: wide diagrams sit in a short frame, tall ones need height. */
  ratio: 'wide' | 'square' | 'tall';
};

export const SHOWCASE: ShowcaseItem[] = [
  {
    id: 'architecture',
    label: 'Architecture',
    title: 'Architecture',
    filename: 'password-reset.diagram',
    prompt: 'Show password recovery: Request Reset → Verify Email → Set New Password.',
    dsl: `title Password Reset Flow
direction right
colorMode pastel
styleMode plain
typeface clean

"User" [icon: user, color: gray]
"AWS Region" [icon: aws, color: orange] {
  "API Gateway" [icon: aws-api-gateway, color: blue]
  "Auth Service" [icon: aws-lambda, color: purple]
  "User Database" [icon: aws-rds, color: teal]
  "Email Service" [icon: aws-ses, color: orange]
}

"User" > "API Gateway": "Request Reset"
"API Gateway" > "Auth Service": "verify email"
"Auth Service" <> "User Database": "lookup user"
"Auth Service" --> "Email Service": "send reset link"
"User" > "API Gateway": "Set New Password"
"API Gateway" > "Auth Service": "update credentials"
"Auth Service" <> "User Database": "save password"`,
    meta: '5 services · 7 edges · 1 boundary',
    svg: architectureSvg,
    ratio: 'wide',
  },
  {
    id: 'flowchart',
    label: 'Flowchart',
    title: 'Flowchart',
    filename: 'user-login.diagram',
    prompt: 'User login: browser → auth service → Redis cache → PostgreSQL',
    dsl: `title User Login Flow
direction down
colorMode pastel
styleMode watercolor
typeface clean

Start [shape: oval, color: blue]
"Login Success" [shape: oval, color: green]
"Login Failed" [shape: oval, color: red]

Frontend [color: orange] {
  "Browser Login" [shape: parallelogram]
}

Backend [color: purple] {
  "Auth Service"
  "Valid Credentials?" [shape: diamond]
}

Storage [color: teal] {
  "Redis Cache" [shape: cylinder]
  "PostgreSQL" [shape: cylinder]
}

Start > "Browser Login"
"Browser Login" > "Auth Service"
"Auth Service" > "Valid Credentials?"
"Valid Credentials?" > "Redis Cache": "yes"
"Valid Credentials?" --> "Login Failed": "no"
"Redis Cache" > "PostgreSQL"
"PostgreSQL" > "Login Success"`,
    meta: '8 nodes · 7 edges · 5 shapes',
    svg: flowchartSvg,
    ratio: 'tall',
  },
  {
    id: 'erd',
    label: 'ERD',
    title: 'ERD',
    filename: 'library-system.erd',
    prompt: 'Design an ERD for a library with Member, Book, and Loan entities.',
    dsl: `title Library Management System
direction right
colorMode pastel
styleMode plain
typeface clean

Member [icon: user, color: blue] {
  id           integer      pk
  name         varchar(255) not null
  email        varchar(255) unique
  joined_date  date
}

Book [icon: book, color: teal] {
  id           integer      pk
  title        varchar(255) not null
  isbn         varchar(13)  unique
  author       varchar(255) not null
}

Loan [icon: calendar, color: red, weak: true] {
  member_id    integer      fk
  book_id      integer      fk
  loan_date    date         not null
  due_date     date         not null
}

Loan > Member: [sourceColumn: member_id, targetColumn: id, leftCard: "zero-or-many", rightCard: "exactly-one"]
Loan > Book: [sourceColumn: book_id, targetColumn: id, leftCard: "zero-or-many", rightCard: "exactly-one"]`,
    meta: "3 entities · 2 relationships · crow's foot",
    svg: erdSvg,
    ratio: 'square',
  },
  {
    id: 'swimlane',
    label: 'Swimlane',
    title: 'Swimlane',
    filename: 'bug-resolution.diagram',
    prompt: 'Create a swimlane diagram for bug resolution with Customer, Support, and Developer.',
    dsl: `title Bug Resolution Flow
direction right
colorMode pastel
styleMode plain
typeface clean

Customer [color: blue] {
  "Report Bug" [icon: alert-circle, shape: circle, category: manual]
  "Verify Fix" [icon: check-circle, shape: circle, category: manual]
}

Support [color: purple] {
  "Triage Bug" [icon: search, shape: circle, category: manual]
  "Close Ticket" [icon: lock, shape: circle, category: system]
}

Developer [color: teal] {
  "Fix Bug" [icon: code, shape: circle, category: manual]
  "Deploy Patch" [icon: zap, shape: circle, category: automated]
}

"Report Bug" > "Triage Bug": "submit report"
"Triage Bug" > "Fix Bug": "assign task"
"Fix Bug" > "Deploy Patch": "push code"
"Deploy Patch" > "Verify Fix": "notify customer"
"Verify Fix" > "Close Ticket": "confirm resolution"
"Verify Fix" --> "Fix Bug": "issue persists" [badge: error]`,
    meta: '3 lanes · 6 steps · 6 handoffs',
    svg: swimlaneSvg,
    ratio: 'square',
  },
  {
    id: 'sequence',
    label: 'Sequence',
    title: 'Sequence',
    filename: 'ecommerce-order.sequence',
    prompt:
      'E-commerce platform in functional layers: presentation, business logic, data access, and external integrations.',
    dsl: `title E-commerce Order Flow
colorMode pastel
styleMode plain
typeface clean

Customer [shape: actor, color: gray]
"Presentation Layer" [color: blue]
"Business Logic" [color: purple]
"Data Access" [color: teal]
"External Integration" [color: orange]

Customer > "Presentation Layer": "submit order"
"Presentation Layer" > "Business Logic": "validate order request"
"Business Logic" > "Business Logic": "calculate totals"
"Business Logic" > "Data Access": "save order record"
"Data Access" --> "Business Logic": "confirm persistence"
"Business Logic" > "External Integration": "process payment"
"External Integration" --> "Business Logic": "payment success"
"Business Logic" --> "Presentation Layer": "order confirmation"
"Presentation Layer" --> Customer: "display success message"`,
    meta: '5 participants · 9 messages · 5 activations',
    svg: sequenceSvg,
    ratio: 'square',
  },
  {
    id: 'hla',
    label: 'High-level',
    title: 'High-level architecture',
    filename: 'customer-order.diagram',
    prompt:
      'Create a high-level architecture with Customer, Web Store, Backend Service, Payment Gateway, and Database.',
    dsl: `title Customer Order Architecture
direction right
colorMode bold
styleMode shadow
typeface clean

"1. User Interface Layer" [color: blue] {
  "Customer" [icon: user, label: "Customer", sublabel: "web_browser_client"]
  "Web Store" [icon: globe, label: "Web Store", sublabel: "frontend_app.js"]
}

"2. Backend Service Layer" [color: purple] {
  "Backend Service" [icon: server, label: "Backend Service", sublabel: "api_controller.py"]
}

"3. Data & Payment Layer" [color: teal] {
  "Database" [icon: database, shape: cylinder, label: "Database", sublabel: "orders_table.sql"]
  "Payment Gateway" [icon: lock, label: "Payment Gateway", sublabel: "stripe_processor.py"]
}

"External Tools & Services" [color: gray] {
  "Stripe API" [icon: credit-card, style: badge]
}

"Cross-Cutting: Config & Logging" [color: gray] {
  ".env" [icon: settings, label: ".env", sublabel: "DB_URL + API_KEYS"]
  "Logger" [icon: terminal, label: "Logger", sublabel: "error_handler.log"]
}

"1. User Interface Layer" > "2. Backend Service Layer": "HTTP Request"
"2. Backend Service Layer" > "3. Data & Payment Layer": "SQL Query"
"2. Backend Service Layer" --> "External Tools & Services": "Process Payment" [color: orange]
"2. Backend Service Layer" --> "Cross-Cutting: Config & Logging": "Log Event"`,
    meta: '5 layers · 8 blocks · 4 flows',
    svg: hlaSvg,
    ratio: 'wide',
  },
];

/** The documents demo: what the same prompt writes besides the diagram. */
export const DOCS: Record<'TDD' | 'PRD' | 'API', { filename: string; code: string }> = {
  TDD: {
    filename: 'technical-design-doc.md',
    code: `# AI Q&A Service — TDD\n## Overview\nNLP-backed service routing user questions\nthrough a backend to an AI model.\n\n## Data model\n- \`questions(id, text, user_id,...)\`\n- \`answers(id, question_id, model,...)\`\n\n## Failure modes\nFallback to cached answers on model timeout.`,
  },
  PRD: {
    filename: 'product-requirements.md',
    code: `# AI Q&A Feature — PRD\n## Goal\nLet users ask plain-English questions and\nreceive AI-generated answers in real time.\n\n## User stories\n- As a user, I can submit a question\n- As a user, I see an answer in < 3s\n\n## Success metrics\n- Answer satisfaction > 80%`,
  },
  API: {
    filename: 'api-reference.md',
    code: `# AI Q&A API Reference\n## POST /questions\nSubmits a question to the AI pipeline.\n\n**Body**\n\`text\` string — the user's question\n\`context_id\` string — optional session\n\n**Response**\n\`answer\`, \`confidence\`, \`latency_ms\``,
  },
};
