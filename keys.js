/* ---------------------------------------------------------------------------
 * 键位配置：按钮标签、教程文案与实际监听唯一来源。
 * ---------------------------------------------------------------------------
 * 设计约束（对应「经典双影」独立操作要求）：
 *   1. 两侧按键完全不相交，不要求小键盘、不要求组合键。
 *   2. 一律使用 KeyboardEvent.code，避免输入法与键盘布局影响。
 *   3. 任何一处改键位，只改这张表，标签与监听同时生效。
 *
 *   操作            玩家一（左区）        玩家二（右区）
 *   ─────────────────────────────────────────────────
 *   当前页选项 1–4   Q / W / E / R        U / I / O / P
 *   确认 / 下一句    F                    J
 *   返回子页 / 收起  G                    H
 *   行囊展开 / 收起  T                    Y
 *   继续对话 / 展开  C                    N
 *   上一页 / 下一页  A / D                K / L
 *   主动道具 1–4      1 / 2 / 3 / 4        M / , / . / /
 *   对话历史开关     V                    M（仅对话层内）
 * ---------------------------------------------------------------------------
 */
const KEYMAP = {
  0: {
    side: 'left',
    sideLabel: '左区',
    choices: ['KeyQ', 'KeyW', 'KeyE', 'KeyR'],
    items: ['Digit1', 'Digit2', 'Digit3', 'Digit4'],
    confirm: 'KeyF',
    back: 'KeyG',
    bag: 'KeyT',
    advance: 'KeyC',
    prevPage: 'KeyA',
    nextPage: 'KeyD',
    history: 'KeyV',
    bonus: 'KeyB'
  },
  1: {
    side: 'right',
    sideLabel: '右区',
    choices: ['KeyU', 'KeyI', 'KeyO', 'KeyP'],
    items: ['KeyM', 'Comma', 'Period', 'Slash'],
    confirm: 'KeyJ',
    back: 'KeyH',
    bag: 'KeyY',
    advance: 'KeyN',
    prevPage: 'KeyK',
    nextPage: 'KeyL',
    history: 'KeyM',
    bonus: 'Semicolon'
  }
};

// code → 便于阅读的键帽文字
const CODE_LABEL = {
  KeyQ: 'Q', KeyW: 'W', KeyE: 'E', KeyR: 'R', KeyT: 'T', KeyY: 'Y',
  KeyU: 'U', KeyI: 'I', KeyO: 'O', KeyP: 'P', KeyA: 'A', KeyS: 'S',
  KeyD: 'D', KeyF: 'F', KeyG: 'G', KeyH: 'H', KeyJ: 'J', KeyK: 'K',
  KeyL: 'L', KeyZ: 'Z', KeyX: 'X', KeyC: 'C', KeyV: 'V', KeyB: 'B',
  KeyN: 'N', KeyM: 'M', Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Space: '空格', Escape: 'Esc', Tab: 'Tab',
  Enter: 'Enter', ArrowLeft: '←', ArrowRight: '→',
  Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4', Digit5: '5',
  Digit6: '6', Digit7: '7', Digit8: '8', Digit9: '9'
};

const keyLabel = code => CODE_LABEL[code] || String(code || '').replace(/^(Key|Digit|Numpad)/, '');

// 某个 code 归属哪一侧；-1 表示不属于任何一侧的玩法键。
function playerOfCode(code) {
  for (const index of [0, 1]) {
    const row = KEYMAP[index];
    if (!row) continue;
    if (row.choices.includes(code)) return { playerIndex: index, role: 'choice' };
    if (row.items.includes(code)) return { playerIndex: index, role: 'item' };
    if (code === row.confirm) return { playerIndex: index, role: 'confirm' };
    if (code === row.back) return { playerIndex: index, role: 'back' };
    if (code === row.bag) return { playerIndex: index, role: 'bag' };
    if (code === row.advance) return { playerIndex: index, role: 'advance' };
    if (code === row.prevPage) return { playerIndex: index, role: 'prevPage' };
    if (code === row.nextPage) return { playerIndex: index, role: 'nextPage' };
    if (code === row.history) return { playerIndex: index, role: 'history' };
    if (code === row.bonus) return { playerIndex: index, role: 'bonus' };
  }
  return { playerIndex: -1, role: '' };
}

// 行动点对应的选项键帽（第 n 条选项用第 n 个键）
function choiceKeyCode(playerIndex, choiceIndex) {
  return KEYMAP[playerIndex]?.choices?.[choiceIndex] || '';
}
function choiceKeyLabel(playerIndex, choiceIndex) {
  return keyLabel(choiceKeyCode(playerIndex, choiceIndex)) || String(choiceIndex + 1);
}

// 帮助面板的按键表也从同一份配置生成，避免文档与实现漂移。
function controlTableRows() {
  return [
    ['当前页选项 1–4', KEYMAP[0].choices, KEYMAP[1].choices],
    ['主动道具 1–4', KEYMAP[0].items, KEYMAP[1].items],
    ['确认 / 下一句 / 我已读完', [KEYMAP[0].confirm], [KEYMAP[1].confirm]],
    ['返回子页 / 收起本侧', [KEYMAP[0].back], [KEYMAP[1].back]],
    ['行囊展开 / 收起', [KEYMAP[0].bag], [KEYMAP[1].bag]],
    ['继续当前对话 / 展开结果', [KEYMAP[0].advance], [KEYMAP[1].advance]],
    ['上一页 / 下一页', [KEYMAP[0].prevPage, KEYMAP[0].nextPage], [KEYMAP[1].prevPage, KEYMAP[1].nextPage]],
    ['历史记录', [KEYMAP[0].history], [KEYMAP[1].history]],
    ['体系加成展开 / 收起', [KEYMAP[0].bonus], [KEYMAP[1].bonus]],
    /* 【msg8 §21 / 反馈修复】主动技能面板与快捷治疗走「全局键」：不归任一侧独占，
       由 handleKeydown 取当前可行动的人类玩家。技能键避开 R（玩家一第 4 选项）改用 X。 */
    ['主动技能面板 开 / 合', ['X'], ['X']],
    ['快捷治疗（用最合理的治疗道具）', ['H'], ['H']]
  ].map(([action, left, right]) => ({
    action,
    left: left.map(keyLabel).join(' / '),
    right: right.map(keyLabel).join(' / ')
  }));
}

if (typeof window !== 'undefined') {
  window.KEYMAP = KEYMAP;
  window.controlTableRows = controlTableRows;
  window.keyLabel = keyLabel;
}
