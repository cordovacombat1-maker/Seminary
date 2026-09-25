// Fake Anthropic Messages API for local tests (stands in for Netlify AI Gateway).
import http from 'node:http';

const PORT = Number(process.env.MOCK_AI_PORT ?? 4010);
const log = [];

/** Bag-of-words hashing embedding: similar texts get similar vectors. */
export function fakeEmbedding(text) {
  const v = new Array(1024).fill(0);
  for (const w of text.toLowerCase().match(/[a-z]{3,}/g) ?? []) {
    let h = 2166136261;
    for (const ch of w) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    v[Math.abs(h) % 1024] += 1;
  }
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / n);
}

const lastUser = (messages) => [...messages].reverse().find((m) => m.role === 'user');
const textOf = (content) => (typeof content === 'string' ? content : content.filter((b) => b.type === 'text').map((b) => b.text).join(' '));

function tutorReply(body) {
  const sys = (body.system ?? []).map((b) => b.text).join('\n');
  const last = lastUser(body.messages);
  const content = last.content;
  if (Array.isArray(content) && content.some((b) => b.type === 'tool_result')) {
    const all = content.some((b) => String(b.content).includes('ALL objectives are now complete'));
    const verse = content.find((b) => String(b.content).includes('"verses"'));
    if (all) return { blocks: [{ type: 'text', text: 'Excellent work — you have met every objective. **The lesson is finished**, and the quiz below is now unlocked.' }] };
    return { blocks: [{ type: 'text', text: `Here is what I found. ${verse ? 'John 3:16 (BSB) reads as quoted in the reading pane.' : ''} (Augustine, On Christian Doctrine, Book I) What do you notice?` }] };
  }
  const t = textOf(content);
  if (t.includes('COMPLETE_ALL')) {
    const ids = [...new Set([...sys.matchAll(/"id": "(o\d+)"/g)].map((m) => m[1]))];
    return {
      blocks: [
        { type: 'text', text: 'You have shown real understanding. Let me record your progress.' },
        ...ids.map((id, i) => ({ type: 'tool_use', id: `toolu_${Date.now()}_${i}`, name: 'mark_objective_complete', input: { objective_id: id } })),
      ],
    };
  }
  if (t.includes('VERSE')) {
    return {
      blocks: [
        { type: 'text', text: 'Let me look that up.' },
        { type: 'tool_use', id: `toolu_${Date.now()}_a`, name: 'lookup_verse', input: { reference: 'John 3:16' } },
        { type: 'tool_use', id: `toolu_${Date.now()}_b`, name: 'lookup_original', input: { reference: 'John 3:16' } },
        { type: 'tool_use', id: `toolu_${Date.now()}_c`, name: 'search_library', input: { query: 'interpretation of Scripture and love' } },
        { type: 'tool_use', id: `toolu_${Date.now()}_d`, name: 'lexicon', input: { strongs_number: 'G25' } },
      ],
    };
  }
  return { blocks: [{ type: 'text', text: 'Welcome to the lesson! Our objectives are listed above. **First question:** what do you think interpretation is?' }] };
}

function jsonReply(body) {
  const schema = JSON.stringify(body.output_config.format);
  const user = textOf(lastUser(body.messages).content);
  if (schema.includes('"questions"')) {
    const n = Number(user.match(/Write (\d+) new questions/)?.[1] ?? 3);
    return {
      questions: Array.from({ length: n }, (_, i) =>
        i % 3 === 2
          ? { type: 'short_answer', question: `Generated short question ${i + 1}?`, options: [], correct_option_index: -1, answer_key: 'Any thoughtful answer.' }
          : { type: 'multiple_choice', question: `Generated question ${i + 1}?`, options: ['Right', 'Wrong A', 'Wrong B', 'Wrong C'], correct_option_index: 0, answer_key: 'Right is right.' },
      ),
    };
  }
  if (schema.includes('"grades"')) {
    const items = JSON.parse(user);
    return { grades: items.map((it) => ({ id: it.id, credit: /wrong/i.test(it.response) ? 0 : 1, feedback: 'Good answer.' })) };
  }
  if (schema.includes('"thesis"')) {
    const c = { thesis: 'Clear.', exegesis: 'Careful.', sources: 'Cited.', reasoning: 'Sound.', clarity: 'Readable.' };
    return { thesis: 4, exegesis: 4, sources: 3, reasoning: 4, clarity: 4, criterion_comments: c, overall_feedback: 'A solid paper. Strengthen your use of sources.' };
  }
  return {};
}

function sse(res, blocks, model) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  const ev = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
  ev('message_start', { message: { id: `msg_${Date.now()}`, type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } } });
  blocks.forEach((b, index) => {
    if (b.type === 'text') {
      ev('content_block_start', { index, content_block: { type: 'text', text: '' } });
      for (const piece of b.text.match(/.{1,12}/gs) ?? []) ev('content_block_delta', { index, delta: { type: 'text_delta', text: piece } });
    } else {
      ev('content_block_start', { index, content_block: { type: 'tool_use', id: b.id, name: b.name, input: {} } });
      ev('content_block_delta', { index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(b.input) } });
    }
    ev('content_block_stop', { index });
  });
  const stop = blocks.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn';
  ev('message_delta', { delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 20 } });
  ev('message_stop', {});
  res.end();
}

http
  .createServer((req, res) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      const url = new URL(req.url, 'http://x');
      if (url.pathname === '/__requests') {
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify(log));
      }
      const body = data ? JSON.parse(data) : {};
      if (url.pathname === '/v1/embeddings') {
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ data: body.input.map((t, index) => ({ embedding: fakeEmbedding(t), index })), model: body.model, usage: { total_tokens: 1 } }));
      }
      if (url.pathname === '/v1/messages') {
        log.push({ model: body.model, messages: body.messages.length, tools: !!body.tools, format: !!body.output_config?.format, stream: !!body.stream });
        if (body.output_config?.format) {
          const out = jsonReply(body);
          res.writeHead(200, { 'content-type': 'application/json' });
          return res.end(JSON.stringify({ id: 'msg_json', type: 'message', role: 'assistant', model: body.model, content: [{ type: 'text', text: JSON.stringify(out) }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } }));
        }
        const blocks = body.tools ? tutorReply(body).blocks : [{ type: 'text', text: 'Summary: the student has been learning about interpretation.' }];
        if (body.stream) return sse(res, blocks, body.model);
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ id: 'msg_x', type: 'message', role: 'assistant', model: body.model, content: blocks, stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } }));
      }
      res.writeHead(404);
      res.end();
    });
  })
  .listen(PORT, () => console.log(`mock AI on :${PORT}`));
