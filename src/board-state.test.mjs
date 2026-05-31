import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_BOARD_ID,
  chooseBoardAfterDelete,
  missingBoardIdThings,
  resolveActiveBoardId,
  visibleThingsForBoard,
} from './board-state.mjs';

test('DEFAULT_BOARD_ID is a valid UUID for InstantDB entity IDs', () => {
  assert.match(
    DEFAULT_BOARD_ID,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  );
});

test('visibleThingsForBoard shows legacy things only on the default board', () => {
  const things = [
    { id: 'legacy', value: 'old note' },
    { id: 'legacy-invalid-id', boardId: 'default-board', value: 'old backfill' },
    { id: 'default-note', boardId: DEFAULT_BOARD_ID, value: 'default note' },
    { id: 'second-note', boardId: 'second-board', value: 'second note' },
  ];

  assert.deepEqual(
    visibleThingsForBoard(things, DEFAULT_BOARD_ID).map((thing) => thing.id),
    ['legacy', 'legacy-invalid-id', 'default-note']
  );
  assert.deepEqual(
    visibleThingsForBoard(things, 'second-board').map((thing) => thing.id),
    ['second-note']
  );
});

test('resolveActiveBoardId keeps the selected board when it still exists', () => {
  const boards = [
    { id: DEFAULT_BOARD_ID, name: 'Main Board', createdAt: 10 },
    { id: 'second-board', name: 'Second', createdAt: 20 },
  ];

  assert.equal(resolveActiveBoardId(boards, 'second-board'), 'second-board');
});

test('resolveActiveBoardId falls back to the default board when selection is missing', () => {
  const boards = [
    { id: DEFAULT_BOARD_ID, name: 'Main Board', createdAt: 10 },
    { id: 'second-board', name: 'Second', createdAt: 20 },
  ];

  assert.equal(resolveActiveBoardId(boards, 'missing-board'), DEFAULT_BOARD_ID);
});

test('missingBoardIdThings returns only cloud things that need backfill', () => {
  const things = [
    { id: 'legacy', value: 'old note' },
    { id: 'empty', boardId: '', value: 'empty id' },
    { id: 'legacy-invalid-id', boardId: 'default-board', value: 'old backfill' },
    { id: 'current', boardId: DEFAULT_BOARD_ID, value: 'current note' },
  ];

  assert.deepEqual(
    missingBoardIdThings(things).map((thing) => thing.id),
    ['legacy', 'empty', 'legacy-invalid-id']
  );
});

test('chooseBoardAfterDelete selects the oldest remaining board', () => {
  const boards = [
    { id: DEFAULT_BOARD_ID, name: 'Main Board', createdAt: 10 },
    { id: 'second-board', name: 'Second', createdAt: 20 },
    { id: 'third-board', name: 'Third', createdAt: 30 },
  ];

  assert.equal(chooseBoardAfterDelete(boards, DEFAULT_BOARD_ID), 'second-board');
});

test('chooseBoardAfterDelete recreates the default board when deleting the last board', () => {
  const boards = [
    { id: DEFAULT_BOARD_ID, name: 'Main Board', createdAt: 10 },
  ];

  assert.equal(chooseBoardAfterDelete(boards, DEFAULT_BOARD_ID), DEFAULT_BOARD_ID);
});
