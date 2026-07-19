# Octagon ERP (OMNISYSTEM) - Knowledge Base & FAQ Module

This is the technical documentation for the in-app **Knowledge Base & FAQ Module** built for Octagon ERP (OMNISYSTEM) in Phase 8D.

---

## 1. Context & Evolution

*   **Before (Offline Reference):** In previous phases, the Knowledge Base was compiled only as offline markdown files (`OCTAGON_ERP_KNOWLEDGE_BASE_FAQ.md` and `00_OCTAGON_ERP_MASTER_REFERENCE.md` under `.agents/skills/octagon_erp/`) as a reference guide for developers and agent prompts.
*   **Now (In-App Feature):** Phase 8D implements a complete, in-app Knowledge Base user interface. It has its own page, database schema integration, sidebar access, search/filtering, bilingual Arabic/English content, and interactive editor for proposing drafts.

---

## 2. Directories & Files

*   **View Template:** `views/knowledge_base.html` (Dynamic section container).
*   **JavaScript Controller:** `modules/knowledge-base.js` (Handles search, filter, render, draft proposals, and data seeding).
*   **JavaScript Seed Data:** `modules/knowledge-base-seed.js` (Bilingual categories, articles, FAQs, and troubleshooting seed arrays).
*   **CSS Stylesheet:** `modules/knowledge-base.css` (Premium glassmorphism and bento layout).
*   **Documentation:** `docs/KNOWLEDGE_BASE_MODULE.md` (This file).

---

## 3. Data Model

The data is integrated under `omni.knowledgeBase` in the core OMNISYSTEM database state:
```js
omni.knowledgeBase = {
  categories: [
    { id: "general", name: { ar: "عام", en: "General" }, icon: "fa-cubes", color: "#818cf8" },
    ...
  ],
  articles: [
    {
      id: "art_001",
      type: "Guide",
      status: "published",
      categoryId: "workshop",
      tags: ["mrp", "accounting", "ledger"],
      visibility: "internal",
      jarvisReadable: true,
      title: { ar: "العنوان بالعربية", en: "English Title" },
      summary: { ar: "ملخص بالعربية", en: "English Summary" },
      content: { ar: "المحتوى", en: "English Content" },
      source: "seed",
      updatedAt: "2026-07-02",
      updatedBy: "system"
    },
    ...
  ],
  faqs: [
    {
      id: "faq_001",
      categoryId: "hr",
      question: { ar: "السؤال بالعربية", en: "English Question" },
      answer: { ar: "الإجابة بالعربية", en: "English Answer" },
      tags: ["seed", "hr"],
      visibility: "internal",
      jarvisReadable: true,
      source: "seed",
      updatedAt: "2026-07-02"
    },
    ...
  ],
  drafts: [],
  activityLog: []
}
```

---

## 4. UI Sections

1.  **KPI Cards Strip:** Live counts of published guides, FAQs, proposed drafts, and documented categories.
2.  **Bilingual Tab Bar:** Tab buttons for "الأسئلة الشائعة" (FAQs), "الأدلة الفنية" (Guides & SOPs), "المسودات والمراجعة" (Drafts & Review), and "روح النظام جارفيس" (Jarvis Governance).
3.  **Sidebar Filters:** Text search box, category list selection, document type dropdown filter, visibility dropdown filter, and Jarvis-readable checkbox.
4.  **Content Grid:** Categorized card layout showing matches.
5.  **Detail Viewer Panel:** Renders full bilingual description, metadata, tags, and user helpfulness voting.
6.  **Draft Proposer (Editor):** Bilingual form to input Arabic and English text for new articles or FAQs. Saved as `status: 'draft'` or under `drafts` list, requiring manual manager/admin approval before publishing.
7.  **Jarvis Governance Panel:** Detailed info cards outlining the strict safety boundaries for Jarvis (Read-only search/briefing allowed; publishing or editing blocked).

---

## 5. Bilingual & RTL/LTR Layout Rules

*   The layout dynamically renders Arabic or English content depending on the active system language (`localStorage.getItem('octagon:language')`).
*   RTL (Right-to-Left) alignment is automatically adjusted for Arabic titles and fields, while LTR (Left-to-Right) is used for English versions.
*   We listen to the global `'octagon:language-applied'` event to trigger a clean UI refresh instantly.

---

## 6. Jarvis AI Integration & Safety

*   **Jarvis Can:** Search the knowledge base metadata, summarize matched articles, explain timesheet rules or backup commands to the user, and draft new proposed FAQs.
*   **Jarvis Cannot:** Publish any draft directly, edit or delete verified articles, bypass permission restrictions for sensitive visibility categories, or make raw Postgres writes.
*   **Exposed AI Tools:** 
    - `report_knowledge_base`: registered within `JarvisBrain.tools` to provide safe summary metrics.
    - `search_knowledge_base`: registered to query published and Jarvis-readable entries by keywords.

---

## 7. Permissions & Security

*   The page is registered under key `knowledge_base` with low-risk sensitivity in `PAGE_METADATA` and public/internal access in `PAGE_PERMISSIONS` inside `services/permissionService.js`.
*   Draft approval and publishing actions are restricted to managers (`workshop.manager`) and admins (`system.admin`).

---

## 8. Future Roadmap

1.  **Draft Approval Workflow:** Adding an email/WhatsApp notification when a new draft is submitted.
2.  **Markdown Importer:** Importing raw `.md` files directly from the attic/dev folders.
3.  **Semantic / RAG Search:** Integrating a local vector database for fuzzy semantic questions.
4.  **File Attachments:** Attaching PDFs, spreadsheets, or blueprint drawings to articles.
5.  **Customer Help Center:** Publishing public-facing articles to a guest customer portal page.
