export const DEFAULT_BOARD_ID = '00000000-0000-4000-8000-000000000001';
export const DEFAULT_BOARD_NAME = 'Main Board';
const LEGACY_DEFAULT_BOARD_IDS = new Set(['default-board']);

export function normalizeBoardId(boardId) {
  if (!boardId || LEGACY_DEFAULT_BOARD_IDS.has(boardId)) {
    return DEFAULT_BOARD_ID;
  }
  return boardId;
}

export function sortBoards(boards = []) {
  return [...boards].sort((a, b) => {
    const aTime = Number.isFinite(a.createdAt) ? a.createdAt : 0;
    const bTime = Number.isFinite(b.createdAt) ? b.createdAt : 0;
    if (aTime !== bTime) return aTime - bTime;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
}

export function visibleThingsForBoard(things = [], activeBoardId = DEFAULT_BOARD_ID) {
  return things.filter((thing) => {
    const boardId = normalizeBoardId(thing.boardId);
    return boardId === normalizeBoardId(activeBoardId);
  });
}

export function resolveActiveBoardId(boards = [], activeBoardId = DEFAULT_BOARD_ID) {
  const sortedBoards = sortBoards(boards);
  const normalizedActiveBoardId = normalizeBoardId(activeBoardId);
  if (sortedBoards.some((board) => board.id === normalizedActiveBoardId)) {
    return normalizedActiveBoardId;
  }
  if (sortedBoards.some((board) => board.id === DEFAULT_BOARD_ID)) {
    return DEFAULT_BOARD_ID;
  }
  return sortedBoards[0]?.id || DEFAULT_BOARD_ID;
}

export function missingBoardIdThings(things = []) {
  return things.filter((thing) => normalizeBoardId(thing.boardId) !== thing.boardId);
}

export function chooseBoardAfterDelete(boards = [], deletedBoardId) {
  const remainingBoards = sortBoards(boards).filter((board) => board.id !== deletedBoardId);
  return remainingBoards[0]?.id || DEFAULT_BOARD_ID;
}
