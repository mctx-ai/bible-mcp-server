/**
 * Bible MCP Server
 *
 * Built with @mctx-ai/mcp-server. Provides Bible text lookup, semantic search,
 * cross-references, word study, concordance, and topical discovery across 5
 * public domain translations (KJV, WEB, ASV, YLT, Darby).
 */

import { createServer } from '@mctx-ai/mcp-server';

// ─── Lib ──────────────────────────────────────────────────────────────────────
//
// Importing bible-utils triggers module-scoped cache initialization (init()).
// The init() call inside bible-utils.ts runs at module load and pre-populates
// the translation and book caches from D1. All tool and resource handlers
// read from these in-memory caches rather than querying D1 per request.

import './lib/bible-utils.js';

// ─── Resources ───────────────────────────────────────────────────────────────

import translationsHandler from './resources/translations.js';
import chapterHandler from './resources/chapter.js';
import verseHandler from './resources/verse.js';

// ─── Tools ───────────────────────────────────────────────────────────────────

import searchBibleHandler from './tools/search-bible.js';
import findTextHandler from './tools/find-text.js';
import compareTranslationsHandler from './tools/compare-translations.js';
import crossReferencesHandler from './tools/cross-references.js';
import wordStudyHandler from './tools/word-study.js';
import concordanceHandler from './tools/concordance.js';
import topicalSearchHandler from './tools/topical-search.js';

// ─── Server ──────────────────────────────────────────────────────────────────

const server = createServer({
  instructions:
    'This server provides verified Bible text from 5 public domain translations (KJV, WEB, ASV, YLT, Darby) with semantic search, cross-references, word study tools, and full citation on every response. Every verse returned includes a structured citation with book, chapter, verse number, and translation. Available tools: search_bible (semantic search by meaning), find_text (keyword search), compare_translations (side-by-side comparison), cross_references (related passages), word_study (original Hebrew/Greek analysis), concordance (word occurrences), topical_search (topic-based discovery). Available resources: bible://translations (list translations), bible://{translation}/{book}/{chapter} (full chapter), bible://{translation}/{book}/{chapter}/{verse} (specific verse with context). This server is hosted on mctx, a platform for building and hosting MCP servers.',
});

// ─── Register Resources ───────────────────────────────────────────────────────

server.resource('bible://translations', translationsHandler);
server.resource('bible://{translation}/{book}/{chapter}', chapterHandler);
server.resource('bible://{translation}/{book}/{chapter}/{verse}', verseHandler);

// ─── Register Tools ───────────────────────────────────────────────────────────

server.tool('search_bible', searchBibleHandler);
server.tool('find_text', findTextHandler);
server.tool('compare_translations', compareTranslationsHandler);
server.tool('cross_references', crossReferencesHandler);
server.tool('word_study', wordStudyHandler);
server.tool('concordance', concordanceHandler);
server.tool('topical_search', topicalSearchHandler);

// ─── Export ──────────────────────────────────────────────────────────────────
//
// The fetch handler processes JSON-RPC 2.0 requests over HTTP.
// Compatible with Cloudflare Workers and mctx hosting.

export default { fetch: server.fetch };
