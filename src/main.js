import { init, id } from '@instantdb/core';
import {
  DEFAULT_BOARD_ID,
  DEFAULT_BOARD_NAME,
  chooseBoardAfterDelete,
  missingBoardIdThings,
  normalizeBoardId,
  resolveActiveBoardId,
  sortBoards,
  visibleThingsForBoard,
} from './board-state.mjs';
import {
  DEFAULT_THEME_ID,
  removeBoardThemeId,
  resolveBoardThemeId,
  updateBoardThemeId,
} from './theme-state.mjs';

// Your InstantDB app (no auth - personal scratchpad only)
const APP_ID = 'c4ac6c0d-dbf5-46dc-8eac-f4b8f4b61d46';
const db = init({ appId: APP_ID });

// Live board reference, used by the module-level helpers below.
let boardRef = null;

// Map InstantDB's connection status to a short human label for the header.
function connectionLabel(status) {
  switch (status) {
    case 'authenticated': return 'synced';
    case 'opened':
    case 'connecting': return 'connecting…';
    case 'closed':
    case 'errored': return 'offline';
    default: return status || '…';
  }
}

// All cloud writes funnel through here so a failure (e.g. a browser
// extension / shield blocking the realtime socket) is never silent.
function safeTransact(chunks, label) {
  try {
    return db.transact(chunks).catch((err) => {
      console.error(`[thingboard] cloud write failed (${label || 'tx'}):`, err);
      if (boardRef) boardRef.showToast('⚠ write failed');
    });
  } catch (err) {
    console.error(`[thingboard] cloud write threw (${label || 'tx'}):`, err);
    if (boardRef) boardRef.showToast('⚠ write failed');
    return Promise.resolve();
  }
}

// Torus globals are provided by the classic <script> tag in index.html
// (executed before this ES module runs)
const {
  Record,
  StoreOf,
  ListOf,
  Component,
} = window.Torus;

const debounce = (fn, delay) => {
  let to = null;
  return (...args) => {
    const dfn = () => fn(...args);
    clearTimeout(to);
    to = setTimeout(dfn, delay);
  };
};

// Theme is a local-only preference (separate from cloud-synced `things`).
const THEME_KEY = 'thingboard:theme';
const BOARD_THEMES_KEY = 'thingboard:boardThemes';
const ACTIVE_BOARD_KEY = 'thingboard:activeBoardId';
const THEMES = [
  { id: 'default', label: 'Default' },
  { id: 'blueprint', label: 'Blueprint' },
  { id: 'linen', label: 'Linen' },
  { id: 'terminal', label: 'Terminal' },
];
const THEME_IDS = new Set(THEMES.map((theme) => theme.id));

const getLegacyTheme = () => {
  try {
    return localStorage.getItem(THEME_KEY) || DEFAULT_THEME_ID;
  } catch (e) {
    return DEFAULT_THEME_ID;
  }
};

const getStoredBoardThemes = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(BOARD_THEMES_KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (e) {
    return {};
  }
};

const setStoredBoardThemes = (boardThemes) => {
  try {
    localStorage.setItem(BOARD_THEMES_KEY, JSON.stringify(boardThemes));
  } catch (e) { }
};

const getBoardTheme = (boardId) => (
  resolveBoardThemeId(getStoredBoardThemes(), boardId, THEME_IDS)
);

const getInitialBoardTheme = (boardId) => {
  const boardThemes = getStoredBoardThemes();
  const normalizedBoardId = normalizeBoardId(boardId);
  return Object.prototype.hasOwnProperty.call(boardThemes, normalizedBoardId)
    ? resolveBoardThemeId(boardThemes, normalizedBoardId, THEME_IDS)
    : resolveBoardThemeId({ [normalizedBoardId]: getLegacyTheme() }, normalizedBoardId, THEME_IDS);
};

const applyTheme = (themeId) => {
  document.documentElement.dataset.theme = themeId;
};

const setBoardTheme = (boardId, themeId) => {
  const nextThemeId = resolveBoardThemeId(
    { [normalizeBoardId(boardId)]: themeId },
    boardId,
    THEME_IDS
  );
  applyTheme(nextThemeId);
  setStoredBoardThemes(updateBoardThemeId(
    getStoredBoardThemes(),
    boardId,
    nextThemeId,
    THEME_IDS
  ));
  try {
    localStorage.setItem(THEME_KEY, nextThemeId);
  } catch (e) { }
  return nextThemeId;
};

const removeBoardTheme = (boardId) => {
  setStoredBoardThemes(removeBoardThemeId(getStoredBoardThemes(), boardId));
};

const getStoredActiveBoardId = () => {
  try {
    return normalizeBoardId(localStorage.getItem(ACTIVE_BOARD_KEY));
  } catch (e) {
    return DEFAULT_BOARD_ID;
  }
};

const setStoredActiveBoardId = (boardId) => {
  try {
    localStorage.setItem(ACTIVE_BOARD_KEY, boardId);
  } catch (e) { }
};

const boardName = (board) => board?.name || DEFAULT_BOARD_NAME;

function xy(evt) {
  let event = evt;
  if (!evt.clientX) {
    if (evt.touches && evt.touches.length) {
      event = evt.touches[0];
    } else if (evt.changedTouches && evt.changedTouches.length) {
      event = evt.changedTouches[0];
    }
  }
  return {
    x: event.clientX,
    y: event.clientY,
  };
}

class Thing extends Record { }
class ThingStore extends StoreOf(Thing) { }

class ThingCard extends Component {
  init(thing, remover, creator) {
    this.remover = remover;
    this.creator = creator;

    this.startX = 0;
    this.startY = 0;
    this.tempX = 0;
    this.tempY = 0;
    this.active = false;

    this.handleDown = this.handleDown.bind(this);
    this.handleHandleDown = this.handleHandleDown.bind(this);
    this.handleMove = this.handleMove.bind(this);
    this.handleUp = this.handleUp.bind(this);

    this.bind(thing, data => this.render(data));

    const setDimensions = debounce((width, height) => {
      this.record.update({ width, height });
    }, 500);
    const observer = new MutationObserver(mutationList => {
      for (const mutation of mutationList) {
        if (mutation.type !== 'attributes' || mutation.attributeName !== 'style') {
          continue;
        }

        const { width, height } = mutation.target.getBoundingClientRect();
        if (width !== this.record.get('width') || height !== this.record.get('height')) {
          setDimensions(width, height);
        }
        return;
      }
    });
    observer.observe(this.node.querySelector('textarea'), {
      attributes: true,
    });
  }
  handleDown(evt) {
    if (!evt.ctrlKey && !evt.metaKey) return;

    evt.preventDefault();

    const { x, y } = xy(evt);
    this.startX = x;
    this.startY = y;
    this.tempX = 0;
    this.tempY = 0;
    document.addEventListener('mousemove', this.handleMove, {
      passive: true,
    });
    document.addEventListener('mouseup', this.handleUp);
    document.addEventListener('touchmove', this.handleMove, {
      passive: true,
    });
    document.addEventListener('touchend', this.handleUp);
  }
  handleHandleDown(evt) {
    evt.preventDefault();

    const { x, y } = xy(evt);
    this.startX = x;
    this.startY = y;
    this.tempX = 0;
    this.tempY = 0;
    document.addEventListener('mousemove', this.handleMove, {
      passive: true,
    });
    document.addEventListener('mouseup', this.handleUp);
    document.addEventListener('touchmove', this.handleMove, {
      passive: true,
    });
    document.addEventListener('touchend', this.handleUp);
  }
  handleMove(evt) {
    const { x, y } = xy(evt);
    this.tempX = x - this.startX;
    this.tempY = y - this.startY;
    this.render();
  }
  handleUp(evt) {
    evt.preventDefault();

    const { tempX, tempY } = this;
    this.startX = 0;
    this.startY = 0;
    this.tempX = 0;
    this.tempY = 0;

    this.record.update({
      x: this.record.get('x') + tempX,
      y: this.record.get('y') + tempY,
    });

    document.removeEventListener('mousemove', this.handleMove);
    document.removeEventListener('mouseup', this.handleUp);
    document.removeEventListener('touchmove', this.handleMove);
    document.removeEventListener('touchend', this.handleUp);
  }
  compose(data) {
    const { value, x, y, width, height } = data;
    return jdom`<div class="tb-thing ${this.active ? 'active' : 'inactive'}"
      style="transform: translate(${x + this.tempX}px,${y + this.tempY}px)">
      <div class="tb-handle"
        style="width:${width}px"
        onmousedown=${this.handleHandleDown}
        ontouchstart=${this.handleHandleDown}></div>
      <div class="tb-buttons">
        <button class="tb-button movable paper"
          onclick=${() => {
            const t = this.record.serialize();
            this.creator({
              value: t.value,
              x: t.x + 10,
              y: t.y + 10,
              width: t.width,
              height: t.height,
            });
          }}>clone</button>
        <button class="tb-button movable paper"
          onclick=${() => {
            const iid = this.record._instantId;
            if (iid) {
              safeTransact(db.tx.things[iid].delete(), 'delete');
            }
            this.remover();
          }}>delete</button>
        <button class="tb-button movable paper"
          onclick=${() => {
            this.record.update({
              width: 300,
              height: 200,
            });
          }}>reset</button>
      </div>
      <textarea class="tb-textarea paper paper-border-top"
        style="width:${width}px;height:${height}px"
        value=${value}
        placeholder="say something..."
        onmousedown=${this.handleDown}
        ontouchstart=${this.handleDown}
        onmouseup=${(evt) => {
          const { width, height } = evt.target.getBoundingClientRect();
          if (width !== this.record.get('width') || height !== this.record.get('height')) {
            this.record.update({ width, height });
          }
        }}
        onfocus=${() => {
          this.active = true;
          this.render(data);
        }}
        onblur=${() => {
          setTimeout(() => {
            this.active = false;
            if (!this.record) {
              return;
            }
            this.render();
          }, 250);
        }}
        oninput=${evt => {
          this.record.update({ value: evt.target.value });
        }}>
      </textarea>
    </div>`;
  }
}

class ThingList extends ListOf(ThingCard) {
  compose() {
    return jdom`<div class="tb-things">${this.nodes}</div>`;
  }
}

class Board extends Component {
  init() {
    boardRef = this;
    this.connection = connectionLabel('connecting');
    this.boards = [];
    this.remoteThings = [];
    this.activeBoardId = getStoredActiveBoardId();
    this.things = new ThingStore();
    this.thingList = new ThingList(
      this.things,
      (data) => this.createThing(data),
    );
    this.instantIdToRecord = new Map();
    this.backfilledThingIds = new Set();
    this.defaultBoardCreateRequested = false;
    this.isSyncingFromRemote = false;

    this.ctrlDown = false;
    this.toast = '';
    this.theme = setBoardTheme(this.activeBoardId, getInitialBoardTheme(this.activeBoardId));
    this.boardActionsOpen = false;
    this.handleKeydown = this.handleKeydown.bind(this);
    this.handleGlobalClick = this.handleGlobalClick.bind(this);

    // Real-time sync from InstantDB (core requirement)
    this.unsubscribe = db.subscribeQuery({ boards: {}, things: {} }, (resp) => {
      if (resp.error) {
        console.error('InstantDB query error', resp.error);
        this.showToast('⚠ query error');
        return;
      }
      if (resp.data) {
        this.syncFromRemote(resp.data.boards || [], resp.data.things || []);
      }
    });

    // Surface realtime connection state in the header so sync problems
    // (e.g. an ad-blocker / Brave Shields blocking the WebSocket) are visible.
    if (typeof db.subscribeConnectionStatus === 'function') {
      this.unsubscribeStatus = db.subscribeConnectionStatus((status) => {
        this.connection = connectionLabel(status);
        this.render();
      });
    }

    // One-time migration from old localStorage (if this is first cloud load)
    this.migrateFromLocalIfNeeded();

    this.bind(this.things, () => this.render());

    window.addEventListener('keydown', this.handleKeydown);
    window.addEventListener('click', this.handleGlobalClick);
  }

  createThing(initialData = {}) {
    const iid = id();
    const boardId = normalizeBoardId(initialData.boardId || this.activeBoardId);
    const rec = this.things.create({
      value: '',
      x: 0,
      y: 0,
      width: 300,
      height: 200,
      ...initialData,
      boardId,
    });
    rec._instantId = iid;
    const handler = () => {
      if (!this.isSyncingFromRemote) this.pushToCloud(rec);
    };
    rec.addHandler(handler);
    this.instantIdToRecord.set(iid, rec);

    const snap = rec.serialize ? rec.serialize() : initialData;
    safeTransact(
      db.tx.things[iid].update({
        value: snap.value || '',
        x: snap.x || 0,
        y: snap.y || 0,
        width: snap.width || 300,
        height: snap.height || 200,
        boardId: snap.boardId || boardId,
      }),
      'create'
    );
    this.showToast('...');
    return rec;
  }

  pushToCloud(rec) {
    const iid = rec._instantId;
    if (!iid) return;
    const d = rec.serialize ? rec.serialize() : {};
    safeTransact(
      db.tx.things[iid].update({
        value: d.value || '',
        x: d.x || 0,
        y: d.y || 0,
        width: d.width || 300,
        height: d.height || 200,
        boardId: normalizeBoardId(d.boardId || this.activeBoardId),
      }),
      'update'
    );
    this.showToast('...');
  }

  ensureDefaultBoard(remoteBoards) {
    if (remoteBoards.length || this.defaultBoardCreateRequested) return;
    this.defaultBoardCreateRequested = true;
    safeTransact(
      db.tx.boards[DEFAULT_BOARD_ID].update({
        name: DEFAULT_BOARD_NAME,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
      'create default board'
    );
  }

  backfillLegacyThings(remoteThings) {
    const missing = missingBoardIdThings(remoteThings)
      .filter((thing) => thing.id && !this.backfilledThingIds.has(thing.id));
    if (!missing.length) return;

    for (const thing of missing) {
      this.backfilledThingIds.add(thing.id);
    }
    safeTransact(
      missing.map((thing) => db.tx.things[thing.id].update({
        boardId: DEFAULT_BOARD_ID,
      })),
      'backfill board ids'
    );
  }

  syncVisibleThings() {
    const visibleThings = visibleThingsForBoard(this.remoteThings, this.activeBoardId);
    const remoteMap = new Map(visibleThings.map(t => [t.id, t]));

    // Upsert / update in place (keeps existing cards mounted during typing)
    this.isSyncingFromRemote = true;
    try {
      for (const [iid, remote] of remoteMap) {
        if (this.instantIdToRecord.has(iid)) {
          const rec = this.instantIdToRecord.get(iid);
          rec.update({
            value: remote.value ?? '',
            x: remote.x ?? 0,
            y: remote.y ?? 0,
            width: remote.width ?? 300,
            height: remote.height ?? 200,
            boardId: normalizeBoardId(remote.boardId),
          });
        } else {
          const rec = this.things.create({
            value: remote.value ?? '',
            x: remote.x ?? 0,
            y: remote.y ?? 0,
            width: remote.width ?? 300,
            height: remote.height ?? 200,
            boardId: normalizeBoardId(remote.boardId),
          });
          rec._instantId = iid;
          rec.addHandler(() => {
            if (!this.isSyncingFromRemote) this.pushToCloud(rec);
          });
          this.instantIdToRecord.set(iid, rec);
        }
      }
    } finally {
      this.isSyncingFromRemote = false;
    }

    // Remove cards that were deleted or belong to a different active board.
    for (const [iid, rec] of [...this.instantIdToRecord]) {
      if (!remoteMap.has(iid)) {
        this.things.remove(rec);
        this.instantIdToRecord.delete(iid);
      }
    }

  }

  syncFromRemote(remoteBoards, remoteThings) {
    this.ensureDefaultBoard(remoteBoards);

    this.boards = sortBoards(remoteBoards.length ? remoteBoards : [{
      id: DEFAULT_BOARD_ID,
      name: DEFAULT_BOARD_NAME,
      createdAt: 0,
      updatedAt: 0,
    }]);
    this.remoteThings = remoteThings;

    const nextActiveBoardId = resolveActiveBoardId(this.boards, this.activeBoardId);
    if (nextActiveBoardId !== this.activeBoardId) {
      this.activeBoardId = nextActiveBoardId;
      setStoredActiveBoardId(this.activeBoardId);
      this.theme = setBoardTheme(this.activeBoardId, getBoardTheme(this.activeBoardId));
    }

    this.backfillLegacyThings(remoteThings);
    this.syncVisibleThings();

    // One-time migration: if we had local data and cloud was empty
    if (this._pendingLocalMigration && remoteThings.length === 0) {
      for (const old of this._pendingLocalMigration) {
        this.createThing(old);
      }
      localStorage.removeItem('thingboard');
      this._pendingLocalMigration = null;
      this.showToast('migrated');
    }

    this.render();
  }

  activeBoard() {
    return this.boards.find((board) => board.id === this.activeBoardId) || null;
  }

  switchBoard(boardId) {
    this.activeBoardId = normalizeBoardId(boardId);
    setStoredActiveBoardId(this.activeBoardId);
    this.theme = setBoardTheme(this.activeBoardId, getBoardTheme(this.activeBoardId));
    this.syncVisibleThings();
    this.render();
  }

  createBoard() {
    const suggestedName = `Board ${this.boards.length + 1}`;
    const rawName = window.prompt('New board name', suggestedName);
    const name = rawName && rawName.trim();
    if (!name) return;

    const boardId = id();
    const now = Date.now();
    const board = { id: boardId, name, createdAt: now, updatedAt: now };
    this.boards = sortBoards([...this.boards, board]);
    this.switchBoard(boardId);
    safeTransact(
      db.tx.boards[boardId].update({
        name,
        createdAt: now,
        updatedAt: now,
      }),
      'create board'
    );
    this.showToast('board created');
  }

  renameActiveBoard() {
    const board = this.activeBoard();
    if (!board) return;

    const rawName = window.prompt('Rename board', boardName(board));
    const name = rawName && rawName.trim();
    if (!name || name === boardName(board)) return;

    const updatedAt = Date.now();
    this.boards = sortBoards(this.boards.map((item) => (
      item.id === this.activeBoardId ? { ...item, name, updatedAt } : item
    )));
    safeTransact(
      db.tx.boards[this.activeBoardId].update({ name, updatedAt }),
      'rename board'
    );
    this.showToast('renamed');
    this.render();
  }

  deleteActiveBoard() {
    const board = this.activeBoard();
    if (!board) return;

    const boardThings = visibleThingsForBoard(this.remoteThings, this.activeBoardId);
    const cardLabel = boardThings.length === 1 ? 'card' : 'cards';
    const ok = window.confirm(
      `Delete "${boardName(board)}" and ${boardThings.length} ${cardLabel}?`
    );
    if (!ok) return;

    const deletedBoardId = this.activeBoardId;
    const nextBoardId = chooseBoardAfterDelete(this.boards, deletedBoardId);
    const remainingBoards = sortBoards(
      this.boards.filter((item) => item.id !== deletedBoardId)
    );
    const txs = boardThings.map((thing) => db.tx.things[thing.id].delete());

    if (remainingBoards.length) {
      txs.push(db.tx.boards[deletedBoardId].delete());
      this.boards = remainingBoards;
    } else if (deletedBoardId === DEFAULT_BOARD_ID) {
      txs.push(db.tx.boards[DEFAULT_BOARD_ID].update({
        name: DEFAULT_BOARD_NAME,
        updatedAt: Date.now(),
      }));
      this.boards = [{
        id: DEFAULT_BOARD_ID,
        name: DEFAULT_BOARD_NAME,
        createdAt: board.createdAt || Date.now(),
        updatedAt: Date.now(),
      }];
    } else {
      const now = Date.now();
      txs.push(db.tx.boards[deletedBoardId].delete());
      txs.push(db.tx.boards[DEFAULT_BOARD_ID].update({
        name: DEFAULT_BOARD_NAME,
        createdAt: now,
        updatedAt: now,
      }));
      this.boards = [{
        id: DEFAULT_BOARD_ID,
        name: DEFAULT_BOARD_NAME,
        createdAt: now,
        updatedAt: now,
      }];
    }

    this.remoteThings = this.remoteThings.filter((thing) => (
      normalizeBoardId(thing.boardId) !== deletedBoardId
    ));
    removeBoardTheme(deletedBoardId);
    this.activeBoardId = nextBoardId;
    setStoredActiveBoardId(this.activeBoardId);
    this.theme = setBoardTheme(this.activeBoardId, getBoardTheme(this.activeBoardId));
    this.instantIdToRecord.clear();
    this.things.reset();
    this.syncVisibleThings();
    if (txs.length) safeTransact(txs, 'delete board');
    this.showToast('board deleted');
  }

  clearActiveBoard() {
    const txs = [];
    for (const rec of this.things.records) {
      if (rec._instantId) {
        txs.push(db.tx.things[rec._instantId].delete());
      }
    }

    this.remoteThings = this.remoteThings.filter((thing) => (
      normalizeBoardId(thing.boardId) !== this.activeBoardId
    ));
    if (txs.length) safeTransact(txs, 'clear');
    this.instantIdToRecord.clear();
    this.things.reset();
  }

  migrateFromLocalIfNeeded() {
    try {
      const saved = localStorage.getItem('thingboard');
      if (saved) {
        this._pendingLocalMigration = JSON.parse(saved);
      }
    } catch (e) {
      localStorage.removeItem('thingboard');
    }
  }

  showToast(msg) {
    this.toast = msg;
    this.render();
    setTimeout(() => {
      if (this.toast === msg) {
        this.toast = '';
        this.render();
      }
    }, 1400);
  }

  closeBoardActions() {
    if (!this.boardActionsOpen) return;
    this.boardActionsOpen = false;
    this.render();
  }

  toggleBoardActions(evt) {
    evt.stopPropagation();
    this.boardActionsOpen = !this.boardActionsOpen;
    this.render();
  }

  handleBoardAction(action) {
    this.boardActionsOpen = false;
    action();
  }

  handleGlobalClick(evt) {
    if (!this.boardActionsOpen) return;
    if (evt.target.closest && evt.target.closest('.tb-board-actions')) return;
    this.closeBoardActions();
  }

  handleKeydown(evt) {
    if (evt.key === 'Control' || evt.key === 'Meta') {
      this.ctrlDown = true;
    }
    this.render();

    const up = evt => {
      if (evt.key === 'Control' || evt.key === 'Meta') {
        this.ctrlDown = false;
        window.removeEventListener('keyup', up);
        this.render();
      }
    };
    window.addEventListener('keyup', up);
  }

  compose() {
    const activeBoard = this.activeBoard();
    return jdom`<div class="tb-board ${this.ctrlDown ? 'ctrlDown' : ''}">
      <header class="tb-header">
        <div class="left">
          <span class="title">thingboard</span>
          (${this.toast || `${this.things.records.size} on ${boardName(activeBoard)}`})
          <span class="tb-conn tb-conn-${(this.connection || '').replace(/[^a-z]/gi, '')}">${this.connection}</span>
        </div>
        <div class="right">
          <div class="tb-board-controls">
            <select class="tb-board-select paper" aria-label="Board" value=${this.activeBoardId}
              onchange=${(evt) => this.switchBoard(evt.target.value)}>
              ${this.boards.map(b => jdom`<option value=${b.id} selected=${b.id === this.activeBoardId}>${boardName(b)}</option>`)}
            </select>
            <div class="tb-board-actions">
              <button class="tb-button movable paper"
                aria-haspopup="menu"
                aria-expanded=${this.boardActionsOpen ? 'true' : 'false'}
                onclick=${(evt) => this.toggleBoardActions(evt)}>board</button>
              ${this.boardActionsOpen ? jdom`<div class="tb-board-actions-menu paper" role="menu">
                <button class="tb-button movable paper" role="menuitem"
                  onclick=${() => this.handleBoardAction(() => this.createBoard())}>+ board</button>
                <button class="tb-button movable paper" role="menuitem"
                  onclick=${() => this.handleBoardAction(() => this.renameActiveBoard())}>rename</button>
                <button class="tb-button movable paper" role="menuitem"
                  onclick=${() => this.handleBoardAction(() => this.deleteActiveBoard())}>delete board</button>
              </div>` : null}
            </div>
          </div>
          <select class="tb-theme-select paper" aria-label="Theme" value=${this.theme}
            onchange=${(evt) => {
              this.theme = setBoardTheme(this.activeBoardId, evt.target.value);
              this.render();
            }}>
            ${THEMES.map(t => jdom`<option value=${t.id} selected=${t.id === this.theme}>${t.label}</option>`)}
          </select>
          <a class="tb-button movable paper" target="_blank"
            href="https://github.com/thesephist/thingboard">about</a>
          <button class="tb-button movable paper"
            onclick=${() => this.clearActiveBoard()}>clear</button>
          <button class="tb-button movable paper"
            onclick=${() => {
              let i = 1;
              const { height } = this.node.querySelector('header').getBoundingClientRect();
              for (const thing of this.things) {
                thing.update({
                  x: i * 10,
                  y: i * 10 + height,
                });
                i++;
              }
            }}>stack</button>
        </div>
      </header>
      ${this.things.records.size ? this.thingList.node : (
        jdom`<div class="tb-slate">
          ${boardName(activeBoard)} is empty. Click + to create a card. <br/>
          Ctrl/Cmd + drag to move cards.
        </div>`
      )}
      <button class="tb-fab paper"
        onclick=${() => {
          const { height } = this.node.querySelector('header').getBoundingClientRect();
          this.createThing({
            x: Math.max(0, window.innerWidth / 2 - 150),
            y: Math.max(0, window.innerHeight / 2 - 100) + height,
            width: 300,
            height: 200,
            value: '',
          });
        }}>+</button>
    </div>`;
  }
}

// Safe bootstrap: Torus global is loaded via classic script tag in index.html.
// In some bundler/dev setups the module can start before the classic script executes,
// so we guard + wait a tick.
function startApp() {
  if (!window.Torus) {
    console.warn('Torus not yet on window — retrying in 50ms');
    setTimeout(startApp, 50);
    return;
  }
  const board = new Board();
  document.body.appendChild(board.node);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp, { once: true });
} else {
  startApp();
}
