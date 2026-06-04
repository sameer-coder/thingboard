import { normalizeBoardId } from './board-state.mjs';

export const DEFAULT_THEME_ID = 'default';

export function normalizeThemeId(themeId, availableThemeIds = [DEFAULT_THEME_ID]) {
  const themeIds = availableThemeIds instanceof Set
    ? availableThemeIds
    : new Set(availableThemeIds);

  return themeIds.has(themeId) ? themeId : DEFAULT_THEME_ID;
}

export function resolveBoardThemeId(boardThemes = {}, boardId, availableThemeIds) {
  if (!boardThemes || typeof boardThemes !== 'object' || Array.isArray(boardThemes)) {
    return DEFAULT_THEME_ID;
  }

  return normalizeThemeId(boardThemes[normalizeBoardId(boardId)], availableThemeIds);
}

export function updateBoardThemeId(boardThemes = {}, boardId, themeId, availableThemeIds) {
  const safeBoardThemes = boardThemes && typeof boardThemes === 'object' && !Array.isArray(boardThemes)
    ? boardThemes
    : {};

  return {
    ...safeBoardThemes,
    [normalizeBoardId(boardId)]: normalizeThemeId(themeId, availableThemeIds),
  };
}

export function removeBoardThemeId(boardThemes = {}, boardId) {
  if (!boardThemes || typeof boardThemes !== 'object' || Array.isArray(boardThemes)) {
    return {};
  }

  const nextBoardThemes = { ...boardThemes };
  delete nextBoardThemes[normalizeBoardId(boardId)];
  return nextBoardThemes;
}
