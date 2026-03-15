// Tool: topical_search
//
// Combines Nave's Topical Bible (curated editorial index) with Vectorize
// semantic search to provide comprehensive topic-based Bible discovery.
//
// Flow:
//   1. Concurrently: D1 Nave's query + Vectorize embedding query + topic expansion
//   2. Fetch verse text for each result set from D1
//   3. Deduplicate — Nave's entries take precedence (they carry editorial notes)
//   4. Build major witnesses from expanded topics + semantic results
//   5. Return combined results with source attribution and match explanations

import type { ToolHandler } from '@mctx-ai/mcp-server';
import { T } from '@mctx-ai/mcp-server';
import { d1, vectorize, workersAi } from '../lib/cloudflare.js';
import type { Citation } from '../lib/bible-utils.js';
import { getTranslation, ensureInitialized } from '../lib/bible-utils.js';

// ─── Types ───────────────────────────────────────────────────────────────────

interface TopicalResult {
  text: string;
  citation: Citation;
  source: 'naves' | 'semantic' | 'both';
  note?: string;
  match_reason?: string;
}

interface MajorWitness {
  book: string;
  testament: string;
  verse_count: number;
  chapter_count: number;
  matched_topics: string[];
  narrative?: string;
  match_reason: string;
  representative_verse: {
    text: string;
    citation: Citation;
  };
}

interface TopicalSearchResponse {
  topic: string;
  results: TopicalResult[];
  total_results: number;
  major_witnesses: MajorWitness[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Overfetch from Vectorize to account for deduplication across translations.
const VECTORIZE_OVERFETCH_MULTIPLIER = 8;

const MAJOR_WITNESS_MIN_VERSES = 5;
const MAJOR_WITNESS_MIN_CHAPTERS = 2;
const MAX_MAJOR_WITNESSES = 5;
const MAX_EXPANDED_TOPICS = 50;
const MAX_STEMS = 6;
const WITNESS_INTERLEAVE_INTERVAL = 5;

// ─── D1 row shapes ────────────────────────────────────────────────────────────

interface NaveVerseRow {
  book_name: string;
  chapter: number;
  verse: number;
  translation_abbrev: string;
  text: string;
  note: string | null;
  topic_name: string;
}

interface VerseRow {
  book_id: number;
  chapter: number;
  verse: number;
  book_name: string;
  translation_abbrev: string;
  text: string;
}

interface WitnessCandidate {
  book_id: number;
  book_name: string;
  testament: string;
  verse_count: number;
  chapter_count: number;
  min_chapter: number;
  max_chapter: number;
  topic_names: string;
}

// ─── Total chapter counts for all 66 canonical books ─────────────────────────

const BOOK_TOTAL_CHAPTERS: Record<string, number> = {
  Genesis: 50,
  Exodus: 40,
  Leviticus: 27,
  Numbers: 36,
  Deuteronomy: 34,
  Joshua: 24,
  Judges: 21,
  Ruth: 4,
  '1 Samuel': 31,
  '2 Samuel': 24,
  '1 Kings': 22,
  '2 Kings': 25,
  '1 Chronicles': 29,
  '2 Chronicles': 36,
  Ezra: 10,
  Nehemiah: 13,
  Esther: 10,
  Job: 42,
  Psalms: 150,
  Proverbs: 31,
  Ecclesiastes: 12,
  'Song of Solomon': 8,
  Isaiah: 66,
  Jeremiah: 52,
  Lamentations: 5,
  Ezekiel: 48,
  Daniel: 12,
  Hosea: 14,
  Joel: 3,
  Amos: 9,
  Obadiah: 1,
  Jonah: 4,
  Micah: 7,
  Nahum: 3,
  Habakkuk: 3,
  Zephaniah: 3,
  Haggai: 2,
  Zechariah: 14,
  Malachi: 4,
  Matthew: 28,
  Mark: 16,
  Luke: 24,
  John: 21,
  Acts: 28,
  Romans: 16,
  '1 Corinthians': 16,
  '2 Corinthians': 13,
  Galatians: 6,
  Ephesians: 6,
  Philippians: 4,
  Colossians: 4,
  '1 Thessalonians': 5,
  '2 Thessalonians': 3,
  '1 Timothy': 6,
  '2 Timothy': 4,
  Titus: 3,
  Philemon: 1,
  Hebrews: 13,
  James: 5,
  '1 Peter': 5,
  '2 Peter': 3,
  '1 John': 5,
  '2 John': 1,
  '3 John': 1,
  Jude: 1,
  Revelation: 22,
};

// ─── Nave's topic relevance scoring ───────────────────────────────────────────

// Returns a [0, 1] relevance score for a Nave's topic name against the query.
// Exact match → 1.0; topic name starts with query → 0.8; query is a word in
// topic name → 0.6; topic name contains query → 0.4; partial substring → 0.2.
// This gives a simple but meaningful ordering within the Nave's-only pool.
function naveTopicRelevance(topicName: string, query: string): number {
  const t = topicName.toLowerCase();
  const q = query.toLowerCase();
  if (t === q) return 1.0;
  if (t.startsWith(q)) return 0.8;
  const words = t.split(/\s+/);
  if (words.some((w) => w === q)) return 0.6;
  if (t.includes(q)) return 0.4;
  return 0.2;
}

// ─── Stem extraction ──────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'of', 'in', 'for', 'and', 'or', 'but', 'is', 'to',
  'with', 'on', 'at', 'by', 'from', 'about', 'does', 'what', 'how', 'god',
  'gods', 'bible', 'say', 'says', 'through', 'during', 'long', 'periods',
  'where', 'most', 'parts',
]);

// Suffix rules ordered longest-first to prevent double-stripping.
const SUFFIX_RULES: Array<{ suffix: string; minLen?: number }> = [
  { suffix: 'fulness' },
  { suffix: 'ness' },
  { suffix: 'ment' },
  { suffix: 'tion' },
  { suffix: 'ings' },
  { suffix: 'ing' },
  { suffix: 'ful' },
  { suffix: 'ous' },
  { suffix: 'less' },
  { suffix: 'ance' },
  { suffix: 'ence' },
  { suffix: 'ly' },
  { suffix: 'ed', minLen: 4 },
  { suffix: 'es', minLen: 4 },
  { suffix: 's', minLen: 3 },
];

function stripSuffix(word: string): string {
  for (const rule of SUFFIX_RULES) {
    if (!word.endsWith(rule.suffix)) continue;
    const stripped = word.slice(0, word.length - rule.suffix.length);
    const minLen = rule.minLen ?? 0;
    if (stripped.length > minLen) return stripped;
  }
  return word;
}

function extractStems(topic: string): string[] {
  const words = topic
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0);

  const seen = new Set<string>();
  const stems: string[] = [];

  for (const word of words) {
    if (STOP_WORDS.has(word)) continue;
    const stem = stripSuffix(word);
    if (stem.length <= 2) continue;
    if (seen.has(stem)) continue;
    seen.add(stem);
    stems.push(stem);
    if (stems.length >= MAX_STEMS) break;
  }

  return stems;
}

// ─── Expanded topic query ─────────────────────────────────────────────────────

async function queryExpandedTopics(
  stems: string[],
): Promise<Array<{ id: number; name: string }>> {
  if (stems.length === 0) return [];

  const likeClauses = stems
    .map(() => 'nt.normalized_topic LIKE ? ESCAPE \'\\\'')
    .join('\n   OR ');

  const params = stems.map((s) => `%${s}%`);

  const result = await d1.query(
    `SELECT DISTINCT nt.id, nt.name
     FROM nave_topics nt
     WHERE ${likeClauses}
     LIMIT ${MAX_EXPANDED_TOPICS}`,
    params,
  );

  return result.results.map((row) => ({
    id: row['id'] as number,
    name: row['name'] as string,
  }));
}

// ─── Witness aggregation ──────────────────────────────────────────────────────

const WITNESS_CHUNK_SIZE = 100;

async function aggregateWitnesses(
  topicIds: number[],
): Promise<WitnessCandidate[]> {
  if (topicIds.length === 0) return [];

  // Defensively chunk if topic IDs exceed 100 to stay within D1 parameter limits.
  const chunks: number[][] = [];
  for (let i = 0; i < topicIds.length; i += WITNESS_CHUNK_SIZE) {
    chunks.push(topicIds.slice(i, i + WITNESS_CHUNK_SIZE));
  }

  // Run all chunks and merge results, aggregating by book_id.
  const bookAgg = new Map<
    number,
    {
      book_id: number;
      book_name: string;
      testament: string;
      verse_count: number;
      chapter_set: Set<number>;
      min_chapter: number;
      max_chapter: number;
      topic_name_set: Set<string>;
    }
  >();

  await Promise.all(
    chunks.map(async (chunk) => {
      const placeholders = chunk.map(() => '?').join(', ');
      const result = await d1.query(
        `SELECT
           ntv.book_id,
           b.name AS book_name,
           b.testament,
           COUNT(*) AS verse_count,
           COUNT(DISTINCT ntv.chapter) AS chapter_count,
           MIN(ntv.chapter) AS min_chapter,
           MAX(ntv.chapter) AS max_chapter,
           GROUP_CONCAT(DISTINCT nt.name) AS topic_names
         FROM nave_topic_verses ntv
         JOIN nave_topics nt ON nt.id = ntv.topic_id
         JOIN books b ON b.id = ntv.book_id
         WHERE ntv.topic_id IN (${placeholders})
         GROUP BY ntv.book_id
         ORDER BY verse_count DESC
         LIMIT 10`,
        chunk,
      );

      for (const row of result.results) {
        const bookId = row['book_id'] as number;
        const bookName = row['book_name'] as string;
        const testament = row['testament'] as string;
        const verseCount = row['verse_count'] as number;
        const minChapter = row['min_chapter'] as number;
        const maxChapter = row['max_chapter'] as number;
        const topicNamesStr = row['topic_names'] as string;

        const topicNames = topicNamesStr
          ? topicNamesStr.split(',').map((n) => n.trim())
          : [];

        if (!bookAgg.has(bookId)) {
          bookAgg.set(bookId, {
            book_id: bookId,
            book_name: bookName,
            testament,
            verse_count: 0,
            chapter_set: new Set(),
            min_chapter: minChapter,
            max_chapter: maxChapter,
            topic_name_set: new Set(),
          });
        }

        const agg = bookAgg.get(bookId)!;
        agg.verse_count += verseCount;
        agg.min_chapter = Math.min(agg.min_chapter, minChapter);
        agg.max_chapter = Math.max(agg.max_chapter, maxChapter);

        // Approximate chapter set from min/max range for cross-chunk merging.
        for (let c = minChapter; c <= maxChapter; c++) {
          agg.chapter_set.add(c);
        }

        for (const name of topicNames) {
          if (name) agg.topic_name_set.add(name);
        }
      }
    }),
  );

  // Convert aggregated map to WitnessCandidate array sorted by verse_count desc.
  const candidates: WitnessCandidate[] = Array.from(bookAgg.values())
    .map((agg) => ({
      book_id: agg.book_id,
      book_name: agg.book_name,
      testament: agg.testament,
      verse_count: agg.verse_count,
      chapter_count: agg.chapter_set.size,
      min_chapter: agg.min_chapter,
      max_chapter: agg.max_chapter,
      topic_names: Array.from(agg.topic_name_set).join(','),
    }))
    .sort((a, b) => b.verse_count - a.verse_count);

  return candidates;
}

// ─── Narrative detection ──────────────────────────────────────────────────────

function detectNarrative(
  candidate: WitnessCandidate,
  matchedTopics: string[],
): string | undefined {
  const totalChapters = BOOK_TOTAL_CHAPTERS[candidate.book_name];

  for (const topic of matchedTopics) {
    const words = topic.trim().split(/\s+/);
    // A narrative topic has 1-3 words (e.g., JOSEPH, MOSES, KING DAVID).
    if (words.length < 1 || words.length > 3) continue;

    // If the candidate spans fewer chapters than the full book, it's a subset.
    const spannedChapters = candidate.max_chapter - candidate.min_chapter + 1;
    const isSubset =
      totalChapters !== undefined && spannedChapters < totalChapters * 0.8;

    if (isSubset) {
      // Title-case the topic name as the narrative label.
      return topic
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
    }
  }

  return undefined;
}

// ─── Match reason generation ──────────────────────────────────────────────────

function buildWitnessMatchReason(
  candidate: WitnessCandidate,
  narrative?: string,
): string {
  const topicList = candidate.topic_names
    .split(',')
    .slice(0, 3)
    .join(', ');

  if (narrative) {
    return `${narrative} narrative: ${candidate.verse_count} topical references across ${candidate.book_name} ${candidate.min_chapter}-${candidate.max_chapter} (${topicList})`;
  }
  return `${candidate.verse_count} topical references across ${candidate.chapter_count} chapters (${topicList})`;
}

// ─── Representative verse selection ──────────────────────────────────────────

async function fetchRepresentativeVerse(
  candidate: WitnessCandidate,
  semanticCoords: Map<
    string,
    {
      book_id: number;
      chapter: number;
      verse: number;
      translation_id: number;
      score: number;
    }
  >,
  semanticVerseMap: Map<string, VerseRow>,
): Promise<{ text: string; citation: Citation }> {
  // Try to find the highest-scoring Vectorize hit for this book.
  let bestScore = -Infinity;
  let bestVerseRow: VerseRow | undefined;

  for (const [coordKey, coord] of semanticCoords) {
    if (coord.book_id !== candidate.book_id) continue;
    const verseRow = semanticVerseMap.get(coordKey);
    if (!verseRow) continue;
    if (coord.score > bestScore) {
      bestScore = coord.score;
      bestVerseRow = verseRow;
    }
  }

  if (bestVerseRow) {
    return {
      text: bestVerseRow.text,
      citation: {
        book: bestVerseRow.book_name,
        chapter: bestVerseRow.chapter,
        verse: bestVerseRow.verse,
        translation: bestVerseRow.translation_abbrev,
      },
    };
  }

  // Fallback: fetch verse 1 of the most topic-dense chapter in this book.
  const kjvTranslation = getTranslation('KJV');
  const translationFilter = kjvTranslation
    ? `AND v.translation_id = ${kjvTranslation.id}`
    : `AND t.abbreviation = 'KJV'`;

  const fallbackResult = await d1.query(
    `SELECT
       ntv.chapter,
       COUNT(*) AS topic_hits
     FROM nave_topic_verses ntv
     WHERE ntv.book_id = ?
     GROUP BY ntv.chapter
     ORDER BY topic_hits DESC
     LIMIT 1`,
    [candidate.book_id],
  );

  const denseChapter =
    fallbackResult.results.length > 0
      ? (fallbackResult.results[0]['chapter'] as number)
      : 1;

  const verseResult = await d1.query(
    `SELECT
       v.book_id,
       v.chapter,
       v.verse,
       b.name AS book_name,
       t.abbreviation AS translation_abbrev,
       v.text
     FROM verses v
     JOIN books b ON b.id = v.book_id
     JOIN translations t ON t.id = v.translation_id
     WHERE v.book_id = ?
       AND v.chapter = ?
       AND v.verse = 1
       ${translationFilter}
     LIMIT 1`,
    [candidate.book_id, denseChapter],
  );

  if (verseResult.results.length > 0) {
    const r = verseResult.results[0] as unknown as VerseRow;
    return {
      text: r.text,
      citation: {
        book: r.book_name,
        chapter: r.chapter,
        verse: r.verse,
        translation: r.translation_abbrev,
      },
    };
  }

  // Last resort: return empty placeholder (should never happen in practice).
  return {
    text: '',
    citation: {
      book: candidate.book_name,
      chapter: candidate.min_chapter,
      verse: 1,
      translation: 'KJV',
    },
  };
}

// ─── Major witness builder ────────────────────────────────────────────────────

async function buildMajorWitnesses(
  expandedTopics: Array<{ id: number; name: string }>,
  semanticCoords: Map<
    string,
    {
      book_id: number;
      chapter: number;
      verse: number;
      translation_id: number;
      score: number;
    }
  >,
  semanticVerseMap: Map<string, VerseRow>,
): Promise<MajorWitness[]> {
  const topicIds = expandedTopics.map((t) => t.id);

  const candidates = await aggregateWitnesses(topicIds);

  // Filter to qualified witnesses only.
  const qualified = candidates.filter(
    (c) =>
      c.verse_count >= MAJOR_WITNESS_MIN_VERSES &&
      c.chapter_count >= MAJOR_WITNESS_MIN_CHAPTERS,
  );

  // Build witnesses concurrently (representative verse may need D1 fallback).
  const witnesses: MajorWitness[] = await Promise.all(
    qualified.slice(0, MAX_MAJOR_WITNESSES).map(async (candidate) => {
      const matchedTopics = candidate.topic_names
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean);

      // Prefer short topic names as narrative labels.
      const shortTopics = matchedTopics.filter(
        (t) => t.split(/\s+/).length <= 3,
      );
      const narrative = detectNarrative(candidate, shortTopics);

      const representativeVerse = await fetchRepresentativeVerse(
        candidate,
        semanticCoords,
        semanticVerseMap,
      );

      const witness: MajorWitness = {
        book: candidate.book_name,
        testament: candidate.testament,
        verse_count: candidate.verse_count,
        chapter_count: candidate.chapter_count,
        matched_topics: matchedTopics.slice(0, 10),
        match_reason: buildWitnessMatchReason(candidate, narrative),
        representative_verse: representativeVerse,
      };

      if (narrative !== undefined) {
        witness.narrative = narrative;
      }

      return witness;
    }),
  );

  return witnesses;
}

// ─── Nave's D1 search ─────────────────────────────────────────────────────────

interface NaveSearchEntry {
  result: TopicalResult;
  relevance: number;
}

async function searchNaves(
  topic: string,
  limit: number,
): Promise<Map<string, NaveSearchEntry>> {
  // Normalize the topic the same way the ETL does: lowercase.
  const normalized = topic.toLowerCase();

  // Escape SQLite LIKE metacharacters to prevent callers from using % or _
  // to enumerate all topics.
  const escaped = normalized.replace(/%/g, '\\%').replace(/_/g, '\\_');

  // Resolve translation ID from cache; fall back to JOIN on abbreviation if
  // the cache is not yet populated (e.g. missing env vars at startup).
  const kjvTranslation = getTranslation('KJV');
  const translationFilter = kjvTranslation
    ? `AND v.translation_id = ?`
    : `AND t.abbreviation = 'KJV'`;
  const translationParams: unknown[] = kjvTranslation ? [kjvTranslation.id] : [];

  // Use LIKE with % wildcards for partial matching so 'forgive' matches
  // 'forgiveness', 'forgiven', etc. Also try exact match first via UNION.
  const result = await d1.query(
    `SELECT
       b.name           AS book_name,
       ntv.chapter      AS chapter,
       ntv.verse        AS verse,
       t.abbreviation   AS translation_abbrev,
       v.text           AS text,
       ntv.note         AS note,
       nt.name          AS topic_name
     FROM nave_topic_verses ntv
     JOIN nave_topics nt  ON nt.id = ntv.topic_id
     JOIN books b         ON b.id  = ntv.book_id
     JOIN verses v        ON v.book_id       = ntv.book_id
                         AND v.chapter       = ntv.chapter
                         AND v.verse         = ntv.verse
                         ${translationFilter}
     JOIN translations t  ON t.id = v.translation_id
     WHERE nt.normalized_topic LIKE ? ESCAPE '\\'
     ORDER BY b.canonical_order, ntv.chapter, ntv.verse
     LIMIT ?`,
    [...translationParams, `%${escaped}%`, limit * 3],
  );

  const resultMap = new Map<string, NaveSearchEntry>();

  for (const row of result.results) {
    const r = row as unknown as NaveVerseRow;
    const key = `${r.book_name.trim().toLowerCase()}:${r.chapter}:${r.verse}`;

    // Keep the entry with highest relevance when the same verse appears under
    // multiple matching topics.
    const relevance = naveTopicRelevance(r.topic_name, topic);
    if (resultMap.has(key)) {
      const existing = resultMap.get(key)!;
      if (relevance <= existing.relevance) continue;
    }

    const citation: Citation = {
      book: r.book_name,
      chapter: r.chapter,
      verse: r.verse,
      translation: r.translation_abbrev,
    };

    const matchReason = `Nave's Topical Bible: ${r.topic_name}`;

    const entry: TopicalResult = {
      text: r.text,
      citation,
      source: 'naves',
      match_reason: matchReason,
    };

    if (r.note) {
      entry.note = r.note;
    }

    resultMap.set(key, { result: entry, relevance });
  }

  return resultMap;
}

// ─── Vectorize semantic search ─────────────────────────────────────────────────

async function searchSemantic(
  topic: string,
  limit: number,
): Promise<Map<string, { book_id: number; chapter: number; verse: number; translation_id: number; score: number }>> {
  // Generate embedding for the topic string.
  const embeddings = await workersAi.embed([topic]);
  if (embeddings.length === 0) return new Map();

  const topK = Math.min(limit * VECTORIZE_OVERFETCH_MULTIPLIER, 200);
  const matches = await vectorize.query(embeddings[0], { topK });
  if (matches.length === 0) return new Map();

  // Each match metadata contains book_id, chapter, verse, translation_id.
  const coordMap = new Map<string, { book_id: number; chapter: number; verse: number; translation_id: number; score: number }>();

  for (const match of matches) {
    const meta = match.metadata;
    if (!meta) continue;

    const bookId = meta['book_id'] as number;
    const chapter = meta['chapter'] as number;
    const verse = meta['verse'] as number;
    const translationId = meta['translation_id'] as number;

    if (!bookId || !chapter || !verse || !translationId) continue;

    // Use book_id:chapter:verse as a translation-agnostic dedup key.
    // We'll fetch the actual book name via D1 query below.
    const key = `${bookId}:${chapter}:${verse}`;
    if (!coordMap.has(key)) {
      coordMap.set(key, { book_id: bookId, chapter, verse, translation_id: translationId, score: match.score });
    }
  }

  return coordMap;
}

// ─── Fetch verse text for semantic results ─────────────────────────────────────

// D1 limits bound parameters to 100 per statement. Each verse lookup requires
// 4 parameters (book_id, chapter, verse, translation_id), so cap chunk size at 25.
const VERSE_CHUNK_SIZE = 25;

const VERSE_SELECT_SQL = `SELECT
       v.book_id         AS book_id,
       v.chapter         AS chapter,
       v.verse           AS verse,
       b.name            AS book_name,
       t.abbreviation    AS translation_abbrev,
       v.text            AS text
     FROM verses v
     JOIN books b       ON b.id = v.book_id
     JOIN translations t ON t.id = v.translation_id
     WHERE `;

function buildVerseChunkStatement(
  chunk: Array<{ book_id: number; chapter: number; verse: number; translation_id: number }>,
): { sql: string; params: unknown[] } {
  const clauses = chunk
    .map(() => '(v.book_id = ? AND v.chapter = ? AND v.verse = ? AND v.translation_id = ?)')
    .join(' OR ');

  const params: unknown[] = [];
  for (const c of chunk) {
    params.push(c.book_id, c.chapter, c.verse, c.translation_id);
  }

  return { sql: `${VERSE_SELECT_SQL}${clauses}`, params };
}

async function fetchVerseTexts(
  coords: Array<{ book_id: number; chapter: number; verse: number; translation_id: number }>,
): Promise<Map<string, VerseRow>> {
  if (coords.length === 0) return new Map();

  // Chunk coords to stay within D1's 100-parameter-per-statement ceiling.
  const chunks: Array<typeof coords> = [];
  for (let i = 0; i < coords.length; i += VERSE_CHUNK_SIZE) {
    chunks.push(coords.slice(i, i + VERSE_CHUNK_SIZE));
  }

  // Issue all chunk queries concurrently.
  const statements = chunks.map(buildVerseChunkStatement);
  const resultSets = await Promise.all(
    statements.map((stmt) => d1.query(stmt.sql, stmt.params))
  );

  const verseMap = new Map<string, VerseRow>();

  for (const resultSet of resultSets) {
    for (const row of resultSet.results) {
      const r = row as unknown as VerseRow;
      // Key uses book_id (numeric) to match the coordMap keys from semantic search.
      const key = `${r.book_id}:${r.chapter}:${r.verse}`;
      verseMap.set(key, r);
    }
  }

  return verseMap;
}

// ─── Consecutive verse cap ────────────────────────────────────────────────────

// Caps Nave's results to at most 2 consecutive verses per book:chapter group.
// "Consecutive" means verse numbers are sequential (e.g., 3,4 or 7,8).
// This prevents a dense Nave's cluster from monopolizing the result set.
function capConsecutiveVerses(
  navesMap: Map<string, NaveSearchEntry>,
): Map<string, NaveSearchEntry> {
  // Group entries by book:chapter.
  const byChapter = new Map<string, Array<{ key: string; verse: number; entry: NaveSearchEntry }>>();

  for (const [key, entry] of navesMap) {
    const { book, chapter, verse } = entry.result.citation;
    const chapterKey = `${book.trim().toLowerCase()}:${chapter}`;
    if (!byChapter.has(chapterKey)) {
      byChapter.set(chapterKey, []);
    }
    byChapter.get(chapterKey)!.push({ key, verse, entry });
  }

  const capped = new Map<string, NaveSearchEntry>();

  for (const group of byChapter.values()) {
    // Sort by verse number so consecutive detection is straightforward.
    group.sort((a, b) => a.verse - b.verse);

    let consecutiveRun = 1;
    let prevVerse: number | null = null;

    for (const item of group) {
      if (prevVerse !== null && item.verse === prevVerse + 1) {
        consecutiveRun++;
      } else {
        consecutiveRun = 1;
      }

      if (consecutiveRun <= 2) {
        capped.set(item.key, item.entry);
      }

      prevVerse = item.verse;
    }
  }

  return capped;
}

// ─── Tool handler ─────────────────────────────────────────────────────────────

const topicalSearch: ToolHandler = async (args, _ask?) => {
  await ensureInitialized();

  const { topic, limit: limitArg } = args as { topic: string; limit?: number };
  const limit = Math.min(Math.max(limitArg ?? 20, 1), 50);

  // Phase 1: All three paths start concurrently.
  const stemsPromise = Promise.resolve(extractStems(topic));
  const expandedTopicsPromise = stemsPromise.then((stems) =>
    stems.length > 0 ? queryExpandedTopics(stems) : [],
  );

  const semanticCoordsPromise = searchSemantic(topic, limit);
  const semanticVerseMapPromise = semanticCoordsPromise.then((coords) =>
    fetchVerseTexts(Array.from(coords.values()))
  );

  const [navesResults, semanticCoords, semanticVerseMap, expandedTopics] =
    await Promise.all([
      searchNaves(topic, limit),
      semanticCoordsPromise,
      semanticVerseMapPromise,
      expandedTopicsPromise,
    ]);

  // Phase 2: Build major witnesses (needs expanded topics + semantic results).
  const majorWitnesses =
    expandedTopics.length > 0
      ? await buildMajorWitnesses(expandedTopics, semanticCoords, semanticVerseMap)
      : [];

  // Phase 3: Existing merge + witness interleave + match reasons.

  // Apply consecutive verse cap to Nave's results before merge.
  const navesResultsCapped = capConsecutiveVerses(navesResults);

  // Build semantic TopicalResults with score lookup.
  // coordMap uses book_id:chapter:verse keys; build a unified-key score map via verseMap.
  const semanticScoreByKey = new Map<string, number>();
  for (const [coordKey, coord] of semanticCoords) {
    const verseRow = semanticVerseMap.get(coordKey);
    if (!verseRow) continue;
    const unifiedKey = `${verseRow.book_name.trim().toLowerCase()}:${verseRow.chapter}:${verseRow.verse}`;
    semanticScoreByKey.set(unifiedKey, coord.score);
  }

  const semanticEntries: Array<{ unifiedKey: string; result: TopicalResult }> = [];

  for (const [coordKey] of semanticCoords) {
    const verseRow = semanticVerseMap.get(coordKey);
    if (!verseRow) continue;

    const unifiedKey = `${verseRow.book_name.trim().toLowerCase()}:${verseRow.chapter}:${verseRow.verse}`;

    if (navesResultsCapped.has(unifiedKey)) {
      // Mark as 'both' in the Nave's map and upgrade match_reason.
      const existing = navesResultsCapped.get(unifiedKey)!;
      existing.result.source = 'both';
      const topicName = existing.result.match_reason?.replace("Nave's Topical Bible: ", '') ?? '';
      existing.result.match_reason = topicName
        ? `Nave's Topical Bible: ${topicName} + Semantic similarity`
        : 'Nave\'s Topical Bible + Semantic similarity';
    } else {
      const citation: Citation = {
        book: verseRow.book_name,
        chapter: verseRow.chapter,
        verse: verseRow.verse,
        translation: verseRow.translation_abbrev,
      };

      semanticEntries.push({
        unifiedKey,
        result: {
          text: verseRow.text,
          citation,
          source: 'semantic',
          match_reason: 'Semantic similarity to query',
        },
      });
    }
  }

  // Sort semantic-only entries by descending vector score.
  semanticEntries.sort((a, b) => {
    const scoreA = semanticScoreByKey.get(a.unifiedKey) ?? 0;
    const scoreB = semanticScoreByKey.get(b.unifiedKey) ?? 0;
    return scoreB - scoreA;
  });

  // Deduplicate semantic entries (a unified key may appear multiple times if
  // multiple translations matched in the overfetch pool).
  const uniqueSemanticEntries: Array<{ unifiedKey: string; result: TopicalResult }> = [];
  const semanticSeen = new Set<string>();
  for (const entry of semanticEntries) {
    if (!semanticSeen.has(entry.unifiedKey)) {
      semanticSeen.add(entry.unifiedKey);
      uniqueSemanticEntries.push(entry);
    }
  }

  // Split Nave's results into 'both' (matched semantic too) and 'naves'-only.
  const bothEntries: Array<{ unifiedKey: string; result: TopicalResult }> = [];
  const navesOnlyEntries: Array<{ unifiedKey: string; relevance: number; result: TopicalResult }> = [];

  for (const [key, entry] of navesResultsCapped) {
    if (entry.result.source === 'both') {
      bothEntries.push({ unifiedKey: key, result: entry.result });
    } else {
      navesOnlyEntries.push({ unifiedKey: key, relevance: entry.relevance, result: entry.result });
    }
  }

  // Sort 'both' entries by descending semantic score — strongest combined signal first.
  bothEntries.sort((a, b) => {
    const scoreA = semanticScoreByKey.get(a.unifiedKey) ?? 0;
    const scoreB = semanticScoreByKey.get(b.unifiedKey) ?? 0;
    return scoreB - scoreA;
  });

  // Sort Nave's-only entries by descending topic relevance score.
  navesOnlyEntries.sort((a, b) => b.relevance - a.relevance);

  // Adaptive budget split:
  //   - 'both' entries always come first (capped at limit).
  //   - Remaining slots use a 60/40 split between Nave's-only and semantic.
  //   - If Nave's-only has fewer results than its budget, ALL remaining slots
  //     go to semantic (and vice versa).
  const remainingAfterBoth = Math.max(0, limit - bothEntries.length);
  const navesOnlyBudget = Math.round(remainingAfterBoth * 0.6);
  const semanticBudget = remainingAfterBoth - navesOnlyBudget;

  const navesOnlyPool = navesOnlyEntries.map((e) => e.result);
  const semanticPool = uniqueSemanticEntries.map((e) => e.result);

  const navesOnlySlice = navesOnlyPool.slice(0, navesOnlyBudget);
  const semanticSlice = semanticPool.slice(0, semanticBudget);

  // Graceful degradation: unused slots from either source backfill from the other.
  const naveOnlyOverflow = navesOnlyBudget - navesOnlySlice.length;
  const semanticOverflow = semanticBudget - semanticSlice.length;

  const extraSemantic = naveOnlyOverflow > 0
    ? semanticPool.slice(semanticBudget, semanticBudget + naveOnlyOverflow)
    : [];
  const extraNaves = semanticOverflow > 0
    ? navesOnlyPool.slice(navesOnlyBudget, navesOnlyBudget + semanticOverflow)
    : [];

  // Final ordering: 'both' first (by semantic score), then remaining by relevance.
  const mergedResults = [
    ...bothEntries.map((e) => e.result),
    ...navesOnlySlice,
    ...extraNaves,
    ...semanticSlice,
    ...extraSemantic,
  ].slice(0, limit);

  // Soft-interleave witness-book verses if major witness books are underrepresented.
  // Underrepresented = witness book verses make up less than 15% of results.
  let results = mergedResults;

  if (majorWitnesses.length > 0) {
    // We need candidate book_ids for the interleave check — re-use aggregation
    // data already computed. To avoid another D1 round-trip, derive book_ids
    // from semanticCoords and verseMap that we already have in memory.
    const witnessBookNames = new Set(
      majorWitnesses.map((w) => w.book.toLowerCase()),
    );

    const witnessVerseCount = mergedResults.filter((r) =>
      witnessBookNames.has(r.citation.book.toLowerCase()),
    ).length;

    const witnessRatio =
      mergedResults.length > 0 ? witnessVerseCount / mergedResults.length : 0;

    if (witnessRatio < 0.15) {
      // Collect witness-book verse candidates from semantic pool not already in results.
      const existingKeys = new Set(
        mergedResults.map(
          (r) =>
            `${r.citation.book.trim().toLowerCase()}:${r.citation.chapter}:${r.citation.verse}`,
        ),
      );

      const witnessVerseCandidates: TopicalResult[] = [];
      const candidatePools: TopicalResult[] = [
        ...uniqueSemanticEntries.map((e) => e.result),
        ...navesOnlyEntries.map((e) => e.result),
      ];
      for (const result of candidatePools) {
        if (!witnessBookNames.has(result.citation.book.toLowerCase())) continue;
        const k = `${result.citation.book.trim().toLowerCase()}:${result.citation.chapter}:${result.citation.verse}`;
        if (existingKeys.has(k)) continue;
        witnessVerseCandidates.push(result);
      }

      if (witnessVerseCandidates.length > 0) {
        const interleaved: TopicalResult[] = [];
        let witnessIdx = 0;

        for (let i = 0; i < mergedResults.length; i++) {
          interleaved.push(mergedResults[i]);
          if (
            (i + 1) % WITNESS_INTERLEAVE_INTERVAL === 0 &&
            witnessIdx < witnessVerseCandidates.length
          ) {
            interleaved.push(witnessVerseCandidates[witnessIdx++]);
          }
        }

        results = interleaved.slice(0, limit);
      }
    }
  }

  const response: TopicalSearchResponse = {
    topic,
    results,
    total_results: results.length,
    major_witnesses: majorWitnesses,
  };

  return response;
};

topicalSearch.annotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

topicalSearch.description =
  'Find Bible verses and major thematic witnesses on a theological topic. ' +
  'Combines Nave\'s curated Topical Bible index (5,319 topics) with AI semantic search. ' +
  'Returns major_witnesses (books and narratives central to the topic — e.g., Job for suffering, ' +
  'Psalms for lament) alongside individual verse results with match explanations. ' +
  'Works well for established topics like forgiveness, prayer, faith, love, and salvation.';

topicalSearch.input = {
  topic: T.string({
    required: true,
    description:
      'The topic to search for (e.g., "forgiveness", "prayer", "faith", "love"). ' +
      'Nave\'s index is searched by keyword match; semantic search finds conceptually related verses.',
    minLength: 1,
  }),
  limit: T.number({
    required: false,
    description: 'Maximum number of results to return (default 20, max 50).',
    min: 1,
    max: 50,
    default: 20,
  }),
};

export default topicalSearch;
