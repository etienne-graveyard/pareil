import { Buffer } from 'buffer';

// type PageCommit = [offset: number, data: Uint8Array];
export type PageCommit = readonly [offset: number, data: string];

export type PageDiff = readonly [pageIndex: number, commits: Array<PageCommit>];

export type FileDiff = readonly [pageSize: number, pageCount: number, changes: Array<PageDiff>];

const DEFAULT_PAGE_SIZE = 512;

export function diff(
  left: Buffer | Uint8Array,
  right: Buffer | Uint8Array,
  pageSize: number = DEFAULT_PAGE_SIZE,
  entirePageTheshold: number = pageSize / 2
): FileDiff | null {
  const leftBuff = Buffer.from(left);
  const rightBuff = Buffer.from(right);

  if (leftBuff.length % pageSize !== 0 || rightBuff.length % pageSize !== 0) {
    throw new Error('File size must be a multiple of page size');
  }

  const changes: Array<PageDiff> = [];

  const rightPageCount = Math.ceil(right.length / pageSize);

  for (let pageIndex = 0; pageIndex < rightPageCount; pageIndex++) {
    const leftPage = getPage(leftBuff, pageSize, pageIndex);
    const rightPage = getPage(rightBuff, pageSize, pageIndex)!; // can't be null
    if (leftPage === null) {
      changes.push([pageIndex, [[0, rightPage.toString('hex')]]]);
      continue;
    }
    const diff = pageDiff(leftPage, rightPage, entirePageTheshold);

    if (diff) {
      changes.push([pageIndex, diff]);
    }
  }

  if (changes.length === 0 && left.length === right.length) {
    return null;
  }

  return [pageSize, rightPageCount, changes] as const;
}

function getPage(file: Buffer, pageSize: number, pageIndex: number): Buffer | null {
  const pageOffset = pageIndex * pageSize;
  if (pageOffset >= file.length) {
    return null;
  }
  return Buffer.from(file.subarray(pageOffset, pageOffset + pageSize));
}

function pageDiff(left: Buffer, right: Buffer, entirePageTheshold: number): Array<PageCommit> | null {
  if (left.equals(right)) {
    return null;
  }
  // find changes
  const commits: Array<PageCommit> = [];
  let totalChanges = 0;
  let diffRangeStart: null | number = null;
  for (let i = 0; i < left.length; i++) {
    if (totalChanges >= entirePageTheshold) {
      // return entire page diff
      return [[0, right.toString('hex')]];
    }
    const isEqual = left[i] === right[i];
    if (isEqual === false) {
      totalChanges++;
      if (diffRangeStart === null) {
        diffRangeStart = i;
      }
    } else {
      if (diffRangeStart !== null) {
        commits.push([diffRangeStart, Buffer.from(right.subarray(diffRangeStart, i)).toString('hex')]);
        diffRangeStart = null;
      }
    }
  }
  if (diffRangeStart !== null) {
    commits.push([diffRangeStart, Buffer.from(right.subarray(diffRangeStart)).toString('hex')]);
  }
  return commits;
}

export function apply(file: Uint8Array, changes: FileDiff): Uint8Array {
  const [pageSize, pageCount, pageChanges] = changes;
  // resize
  const expectedLength = pageCount * pageSize;
  if (file.length !== expectedLength) {
    const newFile = new Uint8Array(expectedLength);
    newFile.set(file.subarray(0, Math.min(file.length, expectedLength)));
    file = newFile;
  }
  // apply changes
  for (const [pageIndex, commits] of pageChanges) {
    const pageOffset = pageIndex * pageSize;
    for (const [offset, data] of commits) {
      file.set(Buffer.from(data, 'hex'), pageOffset + offset);
    }
  }
  return file;
}

export type ExpandedDiff = {
  pageSize: number;
  pageCount: number;
  changes: Array<{
    pageIndex: number;
    commits: Array<{
      offset: number;
      data: Buffer;
      dataStr: string;
    }>;
  }>;
};

export function expandDiff(diff: FileDiff | null): ExpandedDiff | null {
  if (diff === null) {
    return null;
  }
  const [pageSize, pageCount, changes] = diff;
  return {
    pageSize,
    pageCount,
    changes: changes.map(([pageIndex, commits]) => ({
      pageIndex,
      commits: commits.map(([offset, dataStr]) => ({
        offset,
        data: Buffer.from(dataStr, 'hex'),
        dataStr,
      })),
    })),
  };
}
