/**
 * OCTAGON ERP - SERVER-SIDE KNOWLEDGE BASE RAG
 * Local deterministic retriever for Jarvis grounding.
 */
'use strict';

// ---------------------------------------------------------
// 1. Normalization
// ---------------------------------------------------------

function normalizeArabic(text) {
  if (!text) return '';
  return text
    // Remove diacritics (tashkeel)
    .replace(/[\u064B-\u065F\u0670]/g, '')
    // Normalize Alif
    .replace(/[أإآ]/g, 'ا')
    // Normalize Yaa / Alif Maqsura
    .replace(/[ىي]/g, 'ي')
    // Normalize Taa Marbuta / Haa
    .replace(/ة/g, 'ه')
    // Remove tatweel
    .replace(/ـ/g, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeEnglish(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeKnowledgeEntry(text) {
  if (!text) return '';
  let str = String(text);
  return normalizeEnglish(normalizeArabic(str));
}

// ---------------------------------------------------------
// 2. Load Sources
// ---------------------------------------------------------

function loadKnowledgeSources(db) {
  const sources = [];
  const omni = db.omni || {};

  // Articles
  const articles = (omni.knowledge && Array.isArray(omni.knowledge.articles)) ? omni.knowledge.articles : [];
  for (const art of articles) {
    if (art.status !== 'published') continue;
    sources.push({
      id: art.id,
      type: 'article',
      title: String(art.title || ''),
      body: String(art.body || ''),
      tags: String(art.tags || ''),
      status: art.status
    });
  }

  // SOPs
  const sops = Array.isArray(omni.sops) ? omni.sops : [];
  for (const sop of sops) {
    if (sop.approvalStatus !== 'approved' && sop.approvalStatus !== 'published') {
      // Allow draft if it's explicitly asked or maybe just skip drafts for RAG?
      // "Do NOT invent KB entries". We should only expose approved/published SOPs.
      // But some might just have empty status. Let's include if it's not explicitly drafted out.
      // Wait, let's include approved only, but if there's no approvalStatus, include it.
      if (sop.approvalStatus === 'draft') continue;
    }
    
    const stepsText = Array.isArray(sop.steps) ? sop.steps.map(s => s.title + ': ' + s.description).join(' ') : '';
    
    sources.push({
      id: sop.id || sop.code,
      type: 'sop',
      title: String(sop.title || ''),
      body: String(sop.description || '') + ' ' + stepsText,
      tags: String(sop.taskTypes ? sop.taskTypes.join(',') : ''),
      status: sop.approvalStatus
    });
  }

  return sources;
}

// ---------------------------------------------------------
// 3. Corpus & Search
// ---------------------------------------------------------

function buildKnowledgeCorpus(db) {
  const sources = loadKnowledgeSources(db);
  return sources.map(src => {
    return {
      ...src,
      normTitle: normalizeKnowledgeEntry(src.title),
      normBody: normalizeKnowledgeEntry(src.body),
      normTags: normalizeKnowledgeEntry(src.tags)
    };
  });
}

function searchKnowledgeBase(corpus, queryText, limit = 5) {
  const qNorm = normalizeKnowledgeEntry(queryText);
  if (!qNorm) return [];

  const queryTerms = qNorm.split(' ').filter(t => t.length > 1);
  if (queryTerms.length === 0) return [];

  const results = [];

  for (const entry of corpus) {
    let score = 0;

    // Exact phrase match
    if (entry.normTitle.includes(qNorm)) score += 50;
    if (entry.normBody.includes(qNorm)) score += 20;

    // Term matching
    for (const term of queryTerms) {
      if (entry.normTitle.includes(term)) score += 10;
      if (entry.normTags.includes(term)) score += 5;
      if (entry.normBody.includes(term)) score += 2;
    }

    if (score > 0) {
      results.push({ entry, score });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit).map(r => ({
    id: r.entry.id,
    type: r.entry.type,
    title: r.entry.title,
    tags: r.entry.tags,
    score: r.score,
    excerpt: trimExcerpt(r.entry.body, 300)
  }));
}

function trimExcerpt(text, maxLen) {
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen) + '...';
}

// ---------------------------------------------------------
// 4. Formatting & Redaction
// ---------------------------------------------------------

function redactKbResult(result) {
  // Deep clone to avoid mutating original
  const clone = JSON.parse(JSON.stringify(result));
  
  const censor = (str) => {
    if (typeof str !== 'string') return str;
    // Replace sequences that look like keys
    let s = str.replace(/sk-[a-zA-Z0-9]{20,}/g, '[REDACTED]');
    s = s.replace(/AIza[a-zA-Z0-9_-]{30,}/g, '[REDACTED]');
    s = s.replace(/Bearer\s+[a-zA-Z0-9\-._~+/]+=*/ig, 'Bearer [REDACTED]');
    // Hide known secret keywords
    if (/password|secret|apikey/i.test(s)) {
      return '[REDACTED]';
    }
    return s;
  };

  if (clone.excerpt) clone.excerpt = censor(clone.excerpt);
  if (clone.title) clone.title = censor(clone.title);
  
  return clone;
}

function estimateKbContextSize(context) {
  try { return JSON.stringify(context).length; } catch (e) { return 0; }
}

function buildKbGroundingContext(db, query) {
  const corpus = buildKnowledgeCorpus(db);
  const rawResults = searchKnowledgeBase(corpus, query, 3);
  
  const redactedResults = rawResults.map(redactKbResult);
  
  if (redactedResults.length === 0) {
    return {
      noResults: true,
      mustNotInvent: true,
      query: query
    };
  }

  const context = {
    results: redactedResults,
    mustNotInvent: true,
    instruction: "Use the provided KB results to answer. Do not invent rules or policies. Cite the source title."
  };
  
  if (estimateKbContextSize(context) > 20000) {
    // Failsafe truncate
    context.results = context.results.slice(0, 1);
  }

  return context;
}

module.exports = {
  loadKnowledgeSources,
  normalizeKnowledgeEntry,
  buildKnowledgeCorpus,
  searchKnowledgeBase,
  buildKbGroundingContext,
  redactKbResult,
  estimateKbContextSize
};
