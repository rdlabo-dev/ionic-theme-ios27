import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publishBundle } from './publish.mjs';

const id = '01234567-89ab-cdef-0123-456789abcdef';
for (const accepted of ['PUBLISHING', 'PUBLISHED']) {
  test(`completes at ${accepted} without waiting for distribution`, async () => {
    const events = [];
    const states = ['PENDING', 'VALIDATING', 'VALIDATING', 'VALIDATED', accepted];
    const records = [];
    let waits = 0;
    assert.equal(
      await publishBundle({
        bundle: new Uint8Array(),
        name: 'release',
        token: 'secret',
        record: async (message) => {
          records.push(message);
          events.push('record');
        },
        wait: async () => {
          waits++;
        },
        fetcher: async (url, options) => {
          assert.equal(options.headers.Authorization, 'Bearer secret');
          if (url.includes('/upload?')) {
            assert.equal(new URL(url).searchParams.get('publishingType'), 'AUTOMATIC');
            assert.ok(options.body.get('bundle') instanceof Blob);
            events.push('upload');
            return new Response(id);
          }
          events.push('poll');
          assert.ok(states.length, 'must stop polling after acceptance');
          return Response.json({ deploymentState: states.shift() });
        },
      }),
      id,
    );
    assert.deepEqual(events.slice(0, 3), ['upload', 'record', 'poll']);
    assert.equal(events.filter((event) => event === 'upload').length, 1);
    assert.equal(waits, 4);
    assert.deepEqual(records, [
      `Central deployment: ${id}`,
      ...['PENDING', 'VALIDATING', 'VALIDATED', accepted].map((state) => `Central deployment ${id}: ${state}`),
    ]);
  });
}

test('failed validation stops without retrying upload or exposing server responses', async () => {
  let uploads = 0;
  await assert.rejects(
    publishBundle({
      bundle: new Uint8Array(),
      name: 'release',
      token: 'secret',
      record: async () => {},
      fetcher: async (url) => {
        if (url.includes('/upload?')) {
          uploads++;
          return new Response(id);
        }
        return Response.json({
          deploymentState: 'FAILED',
          errors: 'private server detail',
        });
      },
    }),
    /FAILED; inspect the Portal/,
  );
  assert.equal(uploads, 1);
});

test('upload failure is not retried and polling is bounded', async () => {
  let calls = 0;
  await assert.rejects(
    publishBundle({
      bundle: new Uint8Array(),
      name: 'release',
      token: 'secret',
      fetcher: async () => {
        calls++;
        return new Response('secret', { status: 401 });
      },
    }),
    /HTTP 401/,
  );
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(
    publishBundle({
      bundle: new Uint8Array(),
      name: 'release',
      token: 'secret',
      record: async () => {},
      wait: async () => {},
      fetcher: async () => (++calls === 1 ? new Response(id) : Response.json({ deploymentState: 'VALIDATING' })),
    }),
    /last state: VALIDATING/,
  );
  assert.equal(calls, 81);
});
