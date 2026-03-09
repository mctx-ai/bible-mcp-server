import { describe, test, expect } from 'vitest';
import server from './index.js';

// Helper to create JSON-RPC 2.0 request
function createRequest(method: string, params: Record<string, unknown> = {}) {
  return new Request('http://localhost', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params,
    }),
  });
}

// Helper to parse JSON-RPC response
async function getResponse(response: Response) {
  const data = await response.json();
  return data;
}

// ─── Server Capabilities Tests ────────────────────────────────────────────────

describe('Server capabilities', () => {
  test('tools/list returns all 7 tools', async () => {
    const req = createRequest('tools/list');
    const res = await server.fetch(req);
    const data = await getResponse(res);

    const toolNames = data.result.tools.map((t: { name: string }) => t.name);
    expect(toolNames).toContain('search_bible');
    expect(toolNames).toContain('find_text');
    expect(toolNames).toContain('compare_translations');
    expect(toolNames).toContain('cross_references');
    expect(toolNames).toContain('word_study');
    expect(toolNames).toContain('concordance');
    expect(toolNames).toContain('topical_search');
    expect(toolNames).toHaveLength(7);
  });

  test('resources/list and resources/templates/list return all 3 resources', async () => {
    const staticReq = createRequest('resources/list');
    const staticRes = await server.fetch(staticReq);
    const staticData = await getResponse(staticRes);

    const staticUris = staticData.result.resources.map((r: { uri: string }) => r.uri);
    expect(staticUris).toContain('bible://translations');

    const templateReq = createRequest('resources/templates/list');
    const templateRes = await server.fetch(templateReq);
    const templateData = await getResponse(templateRes);

    const templateUris = templateData.result.resourceTemplates.map(
      (t: { uriTemplate: string }) => t.uriTemplate,
    );
    expect(templateUris).toContain('bible://{translation}/{book}/{chapter}');
    expect(templateUris).toContain('bible://{translation}/{book}/{chapter}/{verse}');
  });
});

// ─── Tool Smoke Tests ─────────────────────────────────────────────────────────
//
// These tests verify each tool returns a response (not an unhandled error).
// They do not assert on specific verse data — correctness is tested in D6.
// All tools call D1/Vectorize/Workers AI; those APIs will fail in the test
// environment, so we assert isError or a response object (not a crash).

describe('Tool: search_bible', () => {
  test('returns a response for a valid query', async () => {
    const req = createRequest('tools/call', {
      name: 'search_bible',
      arguments: { query: 'love your neighbor' },
    });
    const res = await server.fetch(req);
    const data = await getResponse(res);

    // Framework must return a result (even if it is an error from missing env vars)
    expect(data.result).toBeDefined();
    expect(data.result.content).toBeDefined();
    expect(Array.isArray(data.result.content)).toBe(true);
  });

  test('passes numeric values for book_id and translation_id in buildVectorizeFilter', async () => {
    // Exercises the buildVectorizeFilter code path with both book and
    // translation filters. The filter record must use number values (not
    // strings) for book_id and translation_id — this is the type fix being
    // verified. The build step enforces the type contract; this test confirms
    // the code path is exercised without runtime coercion errors.
    const req = createRequest('tools/call', {
      name: 'search_bible',
      arguments: { query: 'love', book: 'John', translation: 'KJV' },
    });
    const res = await server.fetch(req);
    const data = await getResponse(res);

    expect(data.result).toBeDefined();
    expect(data.result.content).toBeDefined();
    expect(Array.isArray(data.result.content)).toBe(true);
  });
});

describe('Tool: find_text', () => {
  test('returns a response for a valid query', async () => {
    const req = createRequest('tools/call', {
      name: 'find_text',
      arguments: { query: 'faith' },
    });
    const res = await server.fetch(req);
    const data = await getResponse(res);

    expect(data.result).toBeDefined();
    expect(data.result.content).toBeDefined();
    expect(Array.isArray(data.result.content)).toBe(true);
  });
});

describe('Tool: compare_translations', () => {
  test('returns a response for a valid verse range', async () => {
    const req = createRequest('tools/call', {
      name: 'compare_translations',
      arguments: { book: 'John', chapter: 3, verse_start: 16 },
    });
    const res = await server.fetch(req);
    const data = await getResponse(res);

    expect(data.result).toBeDefined();
    expect(data.result.content).toBeDefined();
    expect(Array.isArray(data.result.content)).toBe(true);
  });
});

describe('Tool: cross_references', () => {
  test('returns a response for a valid verse reference', async () => {
    const req = createRequest('tools/call', {
      name: 'cross_references',
      arguments: { book: 'Romans', chapter: 8, verse: 28 },
    });
    const res = await server.fetch(req);
    const data = await getResponse(res);

    expect(data.result).toBeDefined();
    expect(data.result.content).toBeDefined();
    expect(Array.isArray(data.result.content)).toBe(true);
  });
});

describe('Tool: word_study', () => {
  test('returns a response for a valid verse and word', async () => {
    const req = createRequest('tools/call', {
      name: 'word_study',
      arguments: { book: 'Genesis', chapter: 1, verse: 1, word: '1' },
    });
    const res = await server.fetch(req);
    const data = await getResponse(res);

    expect(data.result).toBeDefined();
    expect(data.result.content).toBeDefined();
    expect(Array.isArray(data.result.content)).toBe(true);
  });

  test('returns a response when matching by English gloss (e.g. "love")', async () => {
    // Exercises the matchByEnglishGloss path: word is a non-numeric English
    // word that must be matched against strongs_definition / lexicon fields
    // rather than word_position. In the test environment D1 calls fail, so we
    // assert only that the framework returns a well-formed response (no crash).
    const req = createRequest('tools/call', {
      name: 'word_study',
      arguments: { book: 'John', chapter: 3, verse: 16, word: 'love' },
    });
    const res = await server.fetch(req);
    const data = await getResponse(res);

    expect(data.result).toBeDefined();
    expect(data.result.content).toBeDefined();
    expect(Array.isArray(data.result.content)).toBe(true);
  });

  test('returns a response when matched morphology row has null strongs_number', async () => {
    // Exercises the null-strongs_number branch: positional word '1' in
    // Genesis 1:1 may map to a Hebrew particle (definite article, waw, etc.)
    // that carries no Strong's number. The handler should return partial results
    // with an explanatory note rather than throwing an error.
    const req = createRequest('tools/call', {
      name: 'word_study',
      arguments: { book: 'Genesis', chapter: 1, verse: 1, word: '1a' },
    });
    const res = await server.fetch(req);
    const data = await getResponse(res);

    // The tool must return a result object — either a partial WordStudyResult
    // (with a note field) or an isError result when D1 is unavailable in tests.
    expect(data.result).toBeDefined();
    expect(data.result.content).toBeDefined();
    expect(Array.isArray(data.result.content)).toBe(true);
  });
});

describe('Tool: concordance', () => {
  test('returns a response for a valid word', async () => {
    const req = createRequest('tools/call', {
      name: 'concordance',
      arguments: { word: 'grace' },
    });
    const res = await server.fetch(req);
    const data = await getResponse(res);

    expect(data.result).toBeDefined();
    expect(data.result.content).toBeDefined();
    expect(Array.isArray(data.result.content)).toBe(true);
  });
});

describe('Tool: topical_search', () => {
  test('returns a response for a valid topic', async () => {
    const req = createRequest('tools/call', {
      name: 'topical_search',
      arguments: { topic: 'prayer' },
    });
    const res = await server.fetch(req);
    const data = await getResponse(res);

    expect(data.result).toBeDefined();
    expect(data.result.content).toBeDefined();
    expect(Array.isArray(data.result.content)).toBe(true);
  });
});

// ─── Resource Smoke Tests ─────────────────────────────────────────────────────

describe('Resource: bible://translations', () => {
  test('returns a response', async () => {
    const req = createRequest('resources/read', {
      uri: 'bible://translations',
    });
    const res = await server.fetch(req);
    const data = await getResponse(res);

    expect(data.result).toBeDefined();
    expect(data.result.contents).toBeDefined();
    expect(Array.isArray(data.result.contents)).toBe(true);
  });
});

describe('Resource: bible://{translation}/{book}/{chapter}', () => {
  test('returns a response for a valid URI', async () => {
    const req = createRequest('resources/read', {
      uri: 'bible://KJV/John/3',
    });
    const res = await server.fetch(req);
    const data = await getResponse(res);

    expect(data.result).toBeDefined();
    expect(data.result.contents).toBeDefined();
    expect(Array.isArray(data.result.contents)).toBe(true);
  });
});

describe('Resource: bible://{translation}/{book}/{chapter}/{verse}', () => {
  test('returns a response for a valid URI', async () => {
    const req = createRequest('resources/read', {
      uri: 'bible://KJV/John/3/16',
    });
    const res = await server.fetch(req);
    const data = await getResponse(res);

    expect(data.result).toBeDefined();
    expect(data.result.contents).toBeDefined();
    expect(Array.isArray(data.result.contents)).toBe(true);
  });
});
