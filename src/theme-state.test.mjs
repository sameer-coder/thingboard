import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_BOARD_ID } from './board-state.mjs';
import {
  DEFAULT_THEME_ID,
  normalizeThemeId,
  removeBoardThemeId,
  resolveBoardThemeId,
  updateBoardThemeId,
} from './theme-state.mjs';

const availableThemeIds = new Set([DEFAULT_THEME_ID, 'blueprint', 'linen']);

test('normalizeThemeId falls back to the default theme when unavailable', () => {
  assert.equal(normalizeThemeId('blueprint', availableThemeIds), 'blueprint');
  assert.equal(normalizeThemeId('missing-theme', availableThemeIds), DEFAULT_THEME_ID);
  assert.equal(normalizeThemeId(undefined, availableThemeIds), DEFAULT_THEME_ID);
});

test('resolveBoardThemeId restores the stored theme for a board', () => {
  assert.equal(
    resolveBoardThemeId({ 'second-board': 'linen' }, 'second-board', availableThemeIds),
    'linen'
  );
});

test('resolveBoardThemeId falls back to default for boards without an available theme', () => {
  assert.equal(
    resolveBoardThemeId({ 'second-board': 'terminal' }, 'second-board', availableThemeIds),
    DEFAULT_THEME_ID
  );
  assert.equal(resolveBoardThemeId({}, 'second-board', availableThemeIds), DEFAULT_THEME_ID);
});

test('updateBoardThemeId stores themes using normalized board IDs', () => {
  assert.deepEqual(
    updateBoardThemeId({}, 'default-board', 'blueprint', availableThemeIds),
    { [DEFAULT_BOARD_ID]: 'blueprint' }
  );
});

test('removeBoardThemeId removes only the selected board theme', () => {
  assert.deepEqual(
    removeBoardThemeId({ [DEFAULT_BOARD_ID]: 'blueprint', 'second-board': 'linen' }, 'default-board'),
    { 'second-board': 'linen' }
  );
});
