import { loadKnowledgeSources, normalizeKnowledgeEntry, buildKnowledgeCorpus, searchKnowledgeBase, buildKbGroundingContext, redactKbResult } from '../server-jarvis-kb-rag.js';
import fs from 'fs';
import path from 'path';

const dbPath = path.join(process.cwd(), 'database.json');
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log('PASS ' + message);
    passCount++;
  } else {
    console.error('FAIL ' + message);
    failCount++;
  }
}

async function runTests() {
  console.log('--- KB RAG Smoke Tests ---');

  try {
    // 1. Corpus builds without crash
    const corpus = buildKnowledgeCorpus(db);
    assert(Array.isArray(corpus) && corpus.length > 0, 'KB corpus builds without crash');

    // 2. KB search endpoint returns valid JSON (mocked via local call here)
    const emptyResults = searchKnowledgeBase(corpus, '', 5);
    assert(Array.isArray(emptyResults) && emptyResults.length === 0, 'Empty query fails cleanly (returns empty array)');

    // 3. Arabic normalization works
    const normAr = normalizeKnowledgeEntry('  أَلْسَلامُ عَلَيْكُم  وَـرَحْمَةُ اللّٰه  ');
    assert(normAr === 'السلام عليكم ورحمه الله', 'Arabic normalization works (got: ' + normAr + ')');

    // 4. English normalization works
    const normEn = normalizeKnowledgeEntry('  Hello, World! This is a TEST.  ');
    assert(normEn === 'hello world this is a test', 'English normalization works (got: ' + normEn + ')');

    // 5. Relevant query returns ranked results
    const relResults = searchKnowledgeBase(corpus, 'دليل', 5);
    assert(relResults.length > 0 && typeof relResults[0].score === 'number', 'Relevant query returns ranked results');

    // 6. KB context returns source ids/citations
    const context = buildKbGroundingContext(db, 'النظام');
    assert(context.results && context.results.length > 0 && context.results[0].id, 'KB context returns source ids/citations');

    // 7. KB context does not expose secrets
    const secretResult = redactKbResult({ title: 'System API', excerpt: 'Here is your Bearer token: Bearer abc123def456 and password is 123456' });
    assert(!secretResult.excerpt.includes('abc123def456') && !secretResult.excerpt.includes('123456'), 'KB context does not expose secrets');

    // 8. KB context does not dump full database
    const contextSize = JSON.stringify(context).length;
    assert(contextSize < 50000, 'KB context does not dump full database (Size: ' + contextSize + ')');

  } catch (e) {
    console.error('FATAL ERROR in tests', e);
    failCount++;
  }

  console.log(`\n${passCount}/${passCount + failCount} passed.`);
  process.exit(failCount > 0 ? 1 : 0);
}

runTests();
