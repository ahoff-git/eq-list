// A custom node:test reporter: dots while running, full detail only for
// failures, and one summary line at the end — instead of the default
// reporter's one ✔ line per test (thousands of lines for this suite,
// which buries the one thing you actually need to read).
import path from 'node:path';

const WRAP_AT = 80;

function errorDetail(data) {
  const err = data.details?.error;
  const cause = err?.cause ?? err;
  const message = cause?.message ?? String(err ?? 'unknown error');
  const stack = typeof cause?.stack === 'string' ? cause.stack : '';
  return { message, stack };
}

export default async function* reporter(source) {
  let pass = 0;
  let fail = 0;
  let skipped = 0;
  const failures = [];
  let col = 0;
  const start = Date.now();

  function* mark(char) {
    yield char;
    col++;
    if (col >= WRAP_AT) {
      col = 0;
      yield '\n';
    }
  }

  for await (const event of source) {
    switch (event.type) {
      case 'test:pass':
        pass++;
        yield* mark('.');
        break;
      case 'test:fail':
        fail++;
        failures.push(event.data);
        yield* mark('F');
        break;
      case 'test:skip':
      case 'test:todo':
        skipped++;
        yield* mark('-');
        break;
      default:
        break;
    }
  }

  if (col !== 0) yield '\n';

  if (failures.length) {
    yield '\n' + '='.repeat(70) + '\n';
    yield `FAILURES (${failures.length})\n`;
    yield '='.repeat(70) + '\n';
    for (const data of failures) {
      const file = data.file ? path.relative(process.cwd(), data.file) : '(unknown file)';
      const { message, stack } = errorDetail(data);
      yield `\n✖ ${data.name}\n`;
      yield `  ${file}:${data.line ?? '?'}\n`;
      yield '  ' + message.split('\n').join('\n  ') + '\n';
      if (stack) {
        yield '  ' + stack.split('\n').slice(0, 8).join('\n  ') + '\n';
      }
    }
    yield '\n';
  }

  const duration = ((Date.now() - start) / 1000).toFixed(1);
  yield '='.repeat(70) + '\n';
  yield `${fail === 0 ? 'PASS' : 'FAIL'} — ${pass} passed, ${fail} failed` +
    `${skipped ? `, ${skipped} skipped` : ''} (${duration}s)\n`;
}
