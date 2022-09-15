import { apply, diff, expandDiff } from '../src/mod';

function pageSizeBuffer(buf: Buffer, pageSize: number = 512): Buffer {
  const size = Math.ceil(buf.length / pageSize) * pageSize;
  if (size === buf.length) {
    return buf;
  }
  const newBuf = Buffer.alloc(size);
  newBuf.set(buf);
  return newBuf;
}

function cloneBuffer(buf: Buffer): Buffer {
  const newBuf = Buffer.alloc(buf.length);
  buf.copy(newBuf);
  return newBuf;
}

test('Diff the apply should be equal', () => {
  const file1 = pageSizeBuffer(Buffer.from('Hello World'));
  const file2 = pageSizeBuffer(Buffer.from('Hello JavaScript'));

  const diff1 = diff(file1, file2)!;
  const file3 = Buffer.from(apply(file1, diff1));
  expect(file3).toEqual(file2);
});

test('Diff the apply should be equal on big file', () => {
  const file1 = pageSizeBuffer(
    Buffer.from([...Array(100000)].map(() => 2 + Math.floor(Math.random() * 200)))
  );
  const file2 = cloneBuffer(file1);
  file2[100] = 0;
  file2[1000] = 0;
  file2[10000] = 0;

  const diff1 = diff(file1, file2)!;
  expect(diff1).toEqual([
    512,
    196,
    [
      [0, [[100, '00']]],
      [1, [[488, '00']]],
      [19, [[272, '00']]],
    ],
  ]);
  const file3 = Buffer.from(apply(file1, diff1));
  expect(file3).toEqual(file2);
});

test('Add page', () => {
  const pageSize = 64;

  const file1 = pageSizeBuffer(
    Buffer.from([...Array(1024)].map(() => 2 + Math.floor(Math.random() * 200)))
  );
  const file2 = pageSizeBuffer(Buffer.concat([file1, Buffer.from('Hello World')]), pageSize);

  const diff1 = diff(file1, file2, pageSize)!;
  expect(diff1).toEqual([
    64,
    17,
    [
      [
        16,
        [
          [
            0,
            '48656c6c6f20576f726c640000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
          ],
        ],
      ],
    ],
  ]);
  const file3 = Buffer.from(apply(file1, diff1));
  expect(file3).toEqual(file2);
});

test('Remove page', () => {
  const pageSize = 64;

  const file1 = pageSizeBuffer(
    Buffer.from([...Array(1024)].map(() => 2 + Math.floor(Math.random() * 200)))
  );
  const file2 = pageSizeBuffer(file1.subarray(0, 896), pageSize);

  const diff1 = diff(file1, file2, pageSize)!;
  expect(diff1).toEqual([64, 14, []]);
  const file3 = Buffer.from(apply(file1, diff1));
  expect(file3).toEqual(file2);
});

test('No changes', () => {
  const file1 = pageSizeBuffer(Buffer.from('Hello World'));
  const file2 = pageSizeBuffer(Buffer.from('Hello World'));

  const diff1 = diff(file1, file2);
  expect(diff1).toBeNull();
});

test('Expand null returns null', () => {
  expect(expandDiff(null)).toBeNull();
});

test('Many changes should send entire page', () => {
  const pageSize = 64;

  const file1 = pageSizeBuffer(
    Buffer.from([...Array(64 * 4)].map(() => 2 + Math.floor(Math.random() * 200))),
    pageSize
  );
  const file2 = cloneBuffer(file1);
  for (let i = 64; i < 100; i++) {
    file2[i] = 0;
  }

  const diff1 = diff(file1, file2, pageSize)!;
  const expanded = expandDiff(diff1)!;
  expect(expanded.pageSize).toEqual(64);
  expect(expanded.pageCount).toEqual(4);
  expect(expanded.changes.length).toEqual(1);
  expect(expanded.changes[0].pageIndex).toEqual(1);
  expect(expanded.changes[0].commits.length).toEqual(1);
  expect(expanded.changes[0].commits[0].offset).toEqual(0);
  expect(expanded.changes[0].commits[0].data.length).toEqual(pageSize);
  const file3 = Buffer.from(apply(file1, diff1));
  expect(file3).toEqual(file2);
});

test('Detect changes at the end of a page', () => {
  const pageSize = 64;

  const file1 = pageSizeBuffer(
    Buffer.from([...Array(64 * 4)].map(() => 2 + Math.floor(Math.random() * 200))),
    pageSize
  );
  const file2 = cloneBuffer(file1);
  for (let i = 100; i < 128; i++) {
    file2[i] = 0;
  }

  const diff1 = diff(file1, file2, pageSize)!;
  const expanded = expandDiff(diff1)!;
  expect(expanded.pageSize).toEqual(64);
  expect(expanded.pageCount).toEqual(4);
  expect(expanded.changes.length).toEqual(1);
  expect(expanded.changes[0].pageIndex).toEqual(1);
  expect(expanded.changes[0].commits.length).toEqual(1);
  const file3 = Buffer.from(apply(file1, diff1));
  expect(file3).toEqual(file2);
});

test('Throw if length is not a multiple of page size', () => {
  const pageSize = 64;

  expect(() => diff(Buffer.alloc(70), Buffer.alloc(70), pageSize)).toThrow();
  expect(() => diff(Buffer.alloc(64), Buffer.alloc(70), pageSize)).toThrow();
  expect(() => diff(Buffer.alloc(70), Buffer.alloc(64), pageSize)).toThrow();
  expect(() => diff(Buffer.alloc(64), Buffer.alloc(64), pageSize)).not.toThrow();
});
