import { describe, test, expect } from 'vitest';
import server, { smartAnswer } from './index.js';

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

// ─── Tools Tests ────────────────────────────────────────────────────

describe('Tool: greet', () => {
  test('should greet a person by name with default greeting', async () => {
    const req = createRequest('tools/call', {
      name: 'greet',
      arguments: { name: 'Alice' },
    });
    const res = await server.fetch(req);
    const data = await getResponse(res);

    expect(data.result.content[0].text).toBe('Hello, Alice!');
  });

  test('should handle different names', async () => {
    const req = createRequest('tools/call', {
      name: 'greet',
      arguments: { name: 'Bob' },
    });
    const res = await server.fetch(req);
    const data = await getResponse(res);

    expect(data.result.content[0].text).toBe('Hello, Bob!');
  });

  test('should trim whitespace from name', async () => {
    const req = createRequest('tools/call', {
      name: 'greet',
      arguments: { name: '  Alice  ' },
    });
    const res = await server.fetch(req);
    const data = await getResponse(res);

    expect(data.result.content[0].text).toBe('Hello, Alice!');
  });

  test('should use GREETING environment variable when set', async () => {
    const originalGreeting = process.env.GREETING;
    process.env.GREETING = 'Howdy';

    const req = createRequest('tools/call', {
      name: 'greet',
      arguments: { name: 'Charlie' },
    });
    const res = await server.fetch(req);
    const data = await getResponse(res);

    expect(data.result.content[0].text).toBe('Howdy, Charlie!');

    // Restore original value
    if (originalGreeting === undefined) {
      delete process.env.GREETING;
    } else {
      process.env.GREETING = originalGreeting;
    }
  });
});

describe('Tool: calculate', () => {
  test('should add two numbers', async () => {
    const req = createRequest('tools/call', {
      name: 'calculate',
      arguments: { operation: 'add', a: 5, b: 3 },
    });
    const res = await server.fetch(req);
    const data = await getResponse(res);

    const result = JSON.parse(data.result.content[0].text);
    expect(result).toEqual({ operation: 'add', a: 5, b: 3, result: 8 });
  });

  test('should subtract two numbers', async () => {
    const req = createRequest('tools/call', {
      name: 'calculate',
      arguments: { operation: 'subtract', a: 10, b: 4 },
    });
    const res = await server.fetch(req);
    const data = await getResponse(res);

    const result = JSON.parse(data.result.content[0].text);
    expect(result).toEqual({ operation: 'subtract', a: 10, b: 4, result: 6 });
  });

  test('should multiply two numbers', async () => {
    const req = createRequest('tools/call', {
      name: 'calculate',
      arguments: { operation: 'multiply', a: 6, b: 7 },
    });
    const res = await server.fetch(req);
    const data = await getResponse(res);

    const result = JSON.parse(data.result.content[0].text);
    expect(result).toEqual({
      operation: 'multiply',
      a: 6,
      b: 7,
      result: 42,
    });
  });

  test('should divide two numbers', async () => {
    const req = createRequest('tools/call', {
      name: 'calculate',
      arguments: { operation: 'divide', a: 20, b: 4 },
    });
    const res = await server.fetch(req);
    const data = await getResponse(res);

    const result = JSON.parse(data.result.content[0].text);
    expect(result).toEqual({ operation: 'divide', a: 20, b: 4, result: 5 });
  });

  test('should handle division by zero', async () => {
    const req = createRequest('tools/call', {
      name: 'calculate',
      arguments: { operation: 'divide', a: 10, b: 0 },
    });
    const res = await server.fetch(req);
    const data = await getResponse(res);

    expect(data.result.isError).toBe(true);
    expect(data.result.content[0].text).toContain('by zero');
  });
});

describe('Tool: analyze', () => {
  test('should complete analysis with progress tracking', async () => {
    const req = createRequest('tools/call', {
      name: 'analyze',
      arguments: { topic: 'AI trends' },
    });
    const res = await server.fetch(req);
    const data = await getResponse(res);

    expect(data.result.content[0].text).toContain('AI trends');
    expect(data.result.content[0].text).toContain('complete');
    expect(data.result.content[0].text).toContain('42 insights');
  });

  test('should analyze different topics', async () => {
    const req = createRequest('tools/call', {
      name: 'analyze',
      arguments: { topic: 'Cloud computing' },
    });
    const res = await server.fetch(req);
    const data = await getResponse(res);

    expect(data.result.content[0].text).toContain('Cloud computing');
  });
});

describe('Tool: smart-answer', () => {
  // In HTTP/stateless transport the framework passes ask=null to handlers,
  // so these tests exercise the fallback path. The sampling path (ask != null)
  // is exercised in streaming transports (WebSocket/SSE) at runtime.
  test('should include the question in the response', async () => {
    const req = createRequest('tools/call', {
      name: 'smart-answer',
      arguments: { question: 'What is TypeScript?' },
    });
    const res = await server.fetch(req);
    const data = await getResponse(res);

    expect(data.result.content[0].text).toContain('What is TypeScript?');
  });

  test('should include both Question and Answer sections in the response', async () => {
    const req = createRequest('tools/call', {
      name: 'smart-answer',
      arguments: { question: 'How does MCP work?' },
    });
    const res = await server.fetch(req);
    const data = await getResponse(res);

    const text: string = data.result.content[0].text;
    expect(text).toContain('Question:');
    expect(text).toContain('Answer:');
    expect(text).toContain('How does MCP work?');
  });

  test('should explain that LLM sampling requires a streaming transport', async () => {
    const req = createRequest('tools/call', {
      name: 'smart-answer',
      arguments: { question: 'Why is the sky blue?' },
    });
    const res = await server.fetch(req);
    const data = await getResponse(res);

    // Fallback response should tell the caller how to get full sampling support
    expect(data.result.content[0].text).toContain('streaming transport');
  });

  test('should not return an error for a valid question', async () => {
    const req = createRequest('tools/call', {
      name: 'smart-answer',
      arguments: { question: 'What is the capital of France?' },
    });
    const res = await server.fetch(req);
    const data = await getResponse(res);

    expect(data.result.isError).toBeFalsy();
  });

  // The ask-available path cannot go through server.fetch() (HTTP transport always
  // passes ask=null). These tests invoke the exported handler directly with a mock
  // ask function to cover that code path.

  test('should return LLM response content when ask is available and succeeds', async () => {
    const mockAsk = async () => 'Paris is the capital of France.';
    const result = await smartAnswer({ question: 'What is the capital of France?' }, mockAsk);

    expect(result).toContain('What is the capital of France?');
    expect(result).toContain('Paris is the capital of France.');
    expect(result).toContain('Question:');
    expect(result).toContain('Answer:');
  });

  test('should propagate error when ask throws', async () => {
    const mockAsk = async () => {
      throw new Error('Sampling failed: model unavailable');
    };

    await expect(
      smartAnswer({ question: 'What is TypeScript?' }, mockAsk),
    ).rejects.toThrow('Sampling failed: model unavailable');
  });
});

// ─── Resources Tests ────────────────────────────────────────────────

describe('Resource: docs://readme', () => {
  test('should return static readme content', async () => {
    const req = createRequest('resources/read', {
      uri: 'docs://readme',
    });
    const res = await server.fetch(req);
    const data = await getResponse(res);

    expect(data.result.contents[0].text).toContain('Welcome to the example MCP server');
    expect(data.result.contents[0].text).toContain('@mctx-ai/mcp-server');
    expect(data.result.contents[0].mimeType).toBe('text/plain');
  });
});

describe('Resource: user://{userId}', () => {
  test('should return user profile for userId 123', async () => {
    const req = createRequest('resources/read', {
      uri: 'user://123',
    });
    const res = await server.fetch(req);
    const data = await getResponse(res);

    const profile = JSON.parse(data.result.contents[0].text);
    expect(profile).toEqual({
      id: '123',
      name: 'User 123',
      joined: '2024-01-01',
      plan: 'pro',
    });
    expect(data.result.contents[0].mimeType).toBe('application/json');
  });

  test('should return user profile for userId 456', async () => {
    const req = createRequest('resources/read', {
      uri: 'user://456',
    });
    const res = await server.fetch(req);
    const data = await getResponse(res);

    const profile = JSON.parse(data.result.contents[0].text);
    expect(profile).toEqual({
      id: '456',
      name: 'User 456',
      joined: '2024-01-01',
      plan: 'pro',
    });
  });
});

// ─── Prompts Tests ──────────────────────────────────────────────────

describe('Prompt: code-review', () => {
  test('should generate code review prompt', async () => {
    const code = 'function add(a, b) { return a + b; }';
    const req = createRequest('prompts/get', {
      name: 'code-review',
      arguments: { code, language: 'javascript' },
    });
    const res = await server.fetch(req);
    const data = await getResponse(res);

    expect(data.result.messages).toHaveLength(1);
    expect(data.result.messages[0].role).toBe('user');
    expect(data.result.messages[0].content.text).toContain('review');
    expect(data.result.messages[0].content.text).toContain(code);
    expect(data.result.messages[0].content.text).toContain('javascript');
  });

  test('should handle code without language specified', async () => {
    const code = 'print("Hello")';
    const req = createRequest('prompts/get', {
      name: 'code-review',
      arguments: { code },
    });
    const res = await server.fetch(req);
    const data = await getResponse(res);

    expect(data.result.messages[0].content.text).toContain(code);
    expect(data.result.messages[0].content.text).toContain('code');
  });
});

describe('Prompt: debug', () => {
  test('should generate debug prompt with error only', async () => {
    const error = 'TypeError: Cannot read property of undefined';
    const req = createRequest('prompts/get', {
      name: 'debug',
      arguments: { error },
    });
    const res = await server.fetch(req);
    const data = await getResponse(res);

    expect(data.result.messages).toHaveLength(2);
    expect(data.result.messages[0].role).toBe('user');
    expect(data.result.messages[0].content.text).toContain(error);
    expect(data.result.messages[1].role).toBe('assistant');
    expect(data.result.messages[1].content.text).toContain('debugging');
  });

  test('should generate debug prompt with error and context', async () => {
    const error = 'ReferenceError: x is not defined';
    const context = 'Function call stack: main() -> processData()';
    const req = createRequest('prompts/get', {
      name: 'debug',
      arguments: { error, context },
    });
    const res = await server.fetch(req);
    const data = await getResponse(res);

    expect(data.result.messages).toHaveLength(3);
    expect(data.result.messages[0].content.text).toContain(error);
    expect(data.result.messages[1].content.text).toContain(context);
    expect(data.result.messages[2].role).toBe('assistant');
  });
});

// ─── Server Capabilities Tests ─────────────────────────────────────

describe('Server capabilities', () => {
  test('should list all available tools', async () => {
    const req = createRequest('tools/list');
    const res = await server.fetch(req);
    const data = await getResponse(res);

    const toolNames = data.result.tools.map((t: { name: string }) => t.name);
    expect(toolNames).toContain('greet');
    expect(toolNames).toContain('calculate');
    expect(toolNames).toContain('analyze');
    expect(toolNames).toContain('smart-answer');
  });

  test('should list all available resources', async () => {
    const reqResources = createRequest('resources/list');
    const resResources = await server.fetch(reqResources);
    const dataResources = await getResponse(resResources);

    const resourceUris = dataResources.result.resources.map((r: { uri: string }) => r.uri);
    expect(resourceUris).toContain('docs://readme');

    const reqTemplates = createRequest('resources/templates/list');
    const resTemplates = await server.fetch(reqTemplates);
    const dataTemplates = await getResponse(resTemplates);

    const templateUris = dataTemplates.result.resourceTemplates.map((t: { uriTemplate: string }) => t.uriTemplate);
    expect(templateUris).toContain('user://{userId}');
  });

  test('should list all available prompts', async () => {
    const req = createRequest('prompts/list');
    const res = await server.fetch(req);
    const data = await getResponse(res);

    const promptNames = data.result.prompts.map((p: { name: string }) => p.name);
    expect(promptNames).toContain('code-review');
    expect(promptNames).toContain('debug');
  });
});
