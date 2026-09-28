/* ---------------------------------------------------------------------------
 * 场景资源登记与回退
 * ---------------------------------------------------------------------------
 * 旧版 ClassicVisuals.roomAsset() 只查 14 个旧房间的映射，未识别的 ID 一律
 * 返回 hall.png —— 所以新阶段的房间全都静默伪装成大厅，注释里那句
 * 「把同名图片放进 visuals/ 就会自动换上」从来没有兑现。
 *
 * 现在改成一张显式的资源登记表：
 *   1. 阶段专属房间资源 visuals/{房间id}.png
 *   2. 房间基础资源（旧 14 间房各自的图）
 *   3. 显式回退资源（登记表里写明的 fallbackScene）
 *   4. 通用缺失占位 visuals/_missing.svg
 * 每一层都会真的去探测文件是否存在；探测失败才降级，并记录下来。
 * 缺图会在界面上留下可见的「待补素材」标记，而不是悄悄给你一张大厅。
 *
 * 完整版已配齐 17 张阶段图和 14 张回返图。程序化覆盖层仅作文件损坏时
 * 的回退；正式独立图加载成功后，game.js 会移除临时覆盖层。
 * ------------------------------------------------------------------------- */
(() => {
  const SCENE_FILES = {
    'upper-wing': 'visuals/upper-wing.png',
    hall: 'visuals/hall.png',
    kitchen: 'visuals/kitchen.png',
    library: 'visuals/upper-wing.png',
    basement: 'visuals/dungeon.png',
    attic: 'visuals/upper-wing.png',
    secret: 'visuals/secret.png',
    garden: 'visuals/garden.png',
    clock: 'visuals/clock.png',
    storage: 'visuals/upper-wing.png',
    chapel: 'visuals/chapel.png',
    dungeon: 'visuals/dungeon.png',
    reward: 'visuals/secret.png'
  };
  const MISSING_PLACEHOLDER = 'visuals/_missing.svg';

  /* 旧 14 间房的既有映射，一个都没动。 */
  const BASE_ROOMS = {
    bedroom: 'upper-wing', corridor: 'upper-wing', library: 'upper-wing', attic: 'upper-wing', storage: 'upper-wing',
    hall: 'hall', kitchen: 'kitchen', clock: 'clock', chapel: 'chapel', garden: 'garden',
    basement: 'dungeon', secret: 'secret', dungeon: 'dungeon', reward: 'secret'
  };

  /* 新阶段房间：scene 为空表示独立美术还没到位，走 fallback + 覆盖层。
     motif 是每个房间自己的视觉母题，保证相邻房间不会长得一模一样。 */
  const STAGE_ROOMS = {
    windCorridor: { stage: 'summit', scene: true, fallback: 'upper-wing', motif: 'wind', accent: '#9fc4d8' },
    starObservatory: { stage: 'summit', scene: true, fallback: 'clock', motif: 'orrery', accent: '#c8b6ea' },
    courtBanquet: { stage: 'summit', scene: true, fallback: 'hall', motif: 'banquet', accent: '#d9b978' },
    hellOfSin: { stage: 'summit', scene: true, fallback: 'dungeon', motif: 'ash', accent: '#d08a5a' },
    bellTower: { stage: 'finale', scene: true, fallback: 'clock', motif: 'gearwork', accent: '#cbb07a' },
    bloodThrone: { stage: 'finale', scene: true, fallback: 'hall', motif: 'throne', accent: '#b5525f' },
    lastHaven: { stage: 'finale', scene: true, fallback: 'dungeon', motif: 'haven', accent: '#cfa86a' },
    brokenBanner: { stage: 'finale', scene: true, fallback: 'hall', motif: 'banner', accent: '#a88f7a' },
    royalVault: { stage: 'finale', scene: true, fallback: 'upper-wing', motif: 'vault', accent: '#d7c07e' },
    obsidianCouncil: { stage: 'finale', scene: true, fallback: 'library', motif: 'council', accent: '#8f9ec4' },
    ashAltar: { stage: 'finale', scene: true, fallback: 'chapel', motif: 'altar', accent: '#c9a07a' },
    mirrorGallery: { stage: 'finale', scene: true, fallback: 'secret', motif: 'mirror', accent: '#a9c6de' },
    traceGate: { stage: 'shard', scene: true, fallback: 'secret', motif: 'trail', accent: '#9fd8d0' },
    goldVault: { stage: 'shard', scene: true, fallback: 'upper-wing', motif: 'goldflow', accent: '#e2c078' },
    ruinConvergence: { stage: 'shard', scene: true, fallback: 'hall', motif: 'fracture', accent: '#c08f8f' },
    mirrorSanctum: { stage: 'shard', scene: true, fallback: 'garden', motif: 'watermirror', accent: '#9fc7dd' },
    collapseClock: { stage: 'shard', scene: true, fallback: 'clock', motif: 'brokenclock', accent: '#c9b7d8' }
  };

  /* 重返探索的房间变体：光源方向、符文、裂缝、物件状态各自不同。 */
  const RETURN_VARIANTS = {
    bedroom: { light: 'right', overlays: ['runes'] },
    corridor: { light: 'left', overlays: ['cracks'] },
    hall: { light: 'left', overlays: ['runes', 'cracks'] },
    kitchen: { light: 'right', overlays: ['cracks'] },
    library: { light: 'left', overlays: ['runes'] },
    basement: { light: 'right', overlays: ['cracks', 'runes'] },
    attic: { light: 'left', overlays: ['cracks'] },
    secret: { light: 'right', overlays: ['runes'] },
    garden: { light: 'left', overlays: ['frost'] },
    clock: { light: 'right', overlays: ['runes', 'cracks'] },
    storage: { light: 'left', overlays: ['cracks'] },
    chapel: { light: 'right', overlays: ['runes', 'frost'] },
    dungeon: { light: 'left', overlays: ['cracks'] },
    reward: { light: 'right', overlays: ['runes'] }
  };

  /* 文件是否存在的探测结果缓存：同一个 URL 只探一次。 */
  const probeState = new Map();
  const failures = [];

  function probe(url) {
    if (!probeState.has(url)) {
      probeState.set(url, new Promise(resolve => {
        const image = new Image();
        image.onload = () => { probeState.set(url, true); resolve(true); };
        image.onerror = () => {
          probeState.set(url, false);
          failures.push(url);
          resolve(false);
        };
        image.src = url;
      }));
    }
    const state = probeState.get(url);
    return state === true || state === false ? Promise.resolve(state) : state;
  }

  /* 解析链：阶段专属变体 → 阶段专属房间 → 基础资源 → 显式回退 → 占位。
     重返探索会先找 visuals/{房间id}-return.png —— 美术只要把变体图放进去就生效，
     不需要改代码。 */
  function candidates(roomId, stageId = null) {
    const stage = stageId || (typeof state !== 'undefined' && state ? state.stageId : 'explore');
    const stageRoom = STAGE_ROOMS[roomId];
    if (stageRoom) {
      const list = [];
      if (stageRoom.scene) list.push(`visuals/${roomId}.png`);
      list.push(`visuals/${roomId}.png`);            // 素材到位后自动生效
      list.push(SCENE_FILES[stageRoom.fallback]);
      list.push(MISSING_PLACEHOLDER);
      return list.filter(Boolean);
    }
    const scene = BASE_ROOMS[roomId];
    return [
      ['return','shard'].includes(stage) ? `visuals/${roomId}-return.png` : null,
      scene ? SCENE_FILES[scene] : null,
      MISSING_PLACEHOLDER
    ].filter(Boolean);
  }

  /* 富描述：调用方拿它决定背景图、覆盖层与「待补素材」标记。 */
  function roomArt(roomId, stageId = null) {
    const stage = stageId || (typeof state !== 'undefined' && state ? state.stageId : 'explore');
    const stageRoom = STAGE_ROOMS[roomId];
    const base = BASE_ROOMS[roomId];
    const variant = stage === 'return' && base ? RETURN_VARIANTS[roomId] : null;
    return {
      roomId,
      stage,
      url: candidates(roomId, stage)[0] || MISSING_PLACEHOLDER,
      candidates: candidates(roomId, stage),
      /* 独立美术是否到位：登记表里没有 scene 的新房间一律算「待补」。 */
      needsArt: Boolean(stageRoom) && !stageRoom.scene,
      motif: stageRoom?.motif || (base ? `base-${base}` : 'unknown'),
      accent: stageRoom?.accent || '#b08f62',
      fallbackScene: stageRoom?.fallback || base || null,
      variant,
      variantClass: [
        stageRoom ? `art-stage-${stageRoom.stage}` : '',
        stageRoom ? `art-motif-${stageRoom.motif}` : '',
        variant ? `art-return art-light-${variant.light}` : '',
        ...(variant?.overlays || []).map(name => `art-overlay-${name}`)
      ].filter(Boolean).join(' ')
    };
  }

  /* 兼容旧调用：仍旧返回一个字符串 URL。 */
  function roomAsset(roomId) {
    return roomArt(roomId).url;
  }

  /* 按解析链逐个探测，找到第一张真正存在的图。 */
  async function resolveRoomAsset(roomId, stageId = null) {
    const art = roomArt(roomId, stageId);
    for (const url of art.candidates) {
      if (await probe(url)) return { ...art, url, missing: url === MISSING_PLACEHOLDER };
    }
    return { ...art, url: MISSING_PLACEHOLDER, missing: true };
  }

  /* 「是否还需要独立美术」以**磁盘上有没有那张图**为准，而不是以登记表字段为准。
     这样把 visuals/{房间id}.png 放进来，界面上的「素材待补」角标会自动消失，
     不需要再改代码。 */
  async function artStatus(roomId, stageId = null) {
    const art = roomArt(roomId, stageId);
    const own = `visuals/${roomId}.png`;
    const variant = `visuals/${roomId}-return.png`;
    const resolved = await resolveRoomAsset(roomId, stageId);
    const stageRoom = STAGE_ROOMS[roomId];
    return {
      ...resolved,
      ownArtPresent: resolved.url === own || resolved.url === variant,
      /* 只有新阶段的房间才算「必须有独立美术」。原有城堡的变体图是可选项，
         没有就继续用基础图 + 覆盖层，不挂待补角标。 */
      needsArt: stageRoom ? (resolved.url !== own && resolved.url !== variant) : false
    };
  }

  /* 素材清单：交付文档与验收都读这一份，缺哪些一目了然。 */
  function registry() {
    const rows = [];
    for (const [roomId, scene] of Object.entries(BASE_ROOMS)) {
      rows.push({ roomId, stage: 'explore', scene, status: 'existing', url: SCENE_FILES[scene] });
    }
    for (const [roomId, spec] of Object.entries(STAGE_ROOMS)) {
      rows.push({
        roomId, stage: spec.stage, motif: spec.motif,
        status: spec.scene ? 'existing' : 'placeholder',
        url: spec.scene ? `visuals/${roomId}.png` : `待补：visuals/${roomId}.png`,
        fallback: SCENE_FILES[spec.fallback]
      });
    }
    return {
      rows,
      missing: rows.filter(row => row.status === 'placeholder').map(row => row.roomId),
      failures: [...failures]
    };
  }

  const faceSvg = {
    sad: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M13 18l6 3m16-3-6 3" stroke="#9bc9ed" stroke-width="3" stroke-linecap="round"/><path d="M17 34q7-9 14 0" fill="none" stroke="#e6efff" stroke-width="3" stroke-linecap="round"/><path d="M13 22q-5 7 0 12 5-5 0-12Z" fill="#77c6f2"/><path d="M35 22q5 7 0 12-5-5 0-12Z" fill="#77c6f2"/></svg>`,
    happy: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M12 20q5-7 10 0m4 0q5-7 10 0" fill="none" stroke="#fff4cc" stroke-width="3" stroke-linecap="round"/><path d="M14 27q10 15 20 0" fill="none" stroke="#fff4cc" stroke-width="3.5" stroke-linecap="round"/><path d="m39 8 1.5 4.5L45 14l-4.5 1.5L39 20l-1.5-4.5L33 14l4.5-1.5Z" fill="#ffe18e"/></svg>`
  };
  const activeTimers = new WeakMap();

  function setEmotion(node, mood) {
    clearTimeout(activeTimers.get(node));
    node.classList.remove('emotion-sad', 'emotion-happy');
    const old = node.querySelector(':scope > .emotion-face');
    if (old) old.remove();
    void node.offsetWidth; // restart the animation when the same emotion happens twice
    node.classList.add(`emotion-${mood}`);
    const heroClass = [...node.classList].find(name => /^hero-\d+$/.test(name));
    if (heroClass) {
      const heroIndex = Number(heroClass.slice(5));
      node.style.setProperty('--emotion-art', `url('visuals/emotions/hero-${heroIndex}.png')`);
      node.classList.add('emotion-sprite-active');
      node.classList.toggle('emotion-tall-sheet', [3, 5, 7].includes(heroIndex));
    }
    if (node.classList.contains('actor')) {
      const face = document.createElement('span');
      face.className = 'emotion-face';
      face.innerHTML = faceSvg[mood];
      node.appendChild(face);
    }
    activeTimers.set(node, setTimeout(() => {
      node.classList.remove('emotion-sad', 'emotion-happy');
      node.classList.remove('emotion-sprite-active');
      node.classList.remove('emotion-tall-sheet');
      node.querySelector(':scope > .emotion-face')?.remove();
      activeTimers.delete(node);
    }, 2100));
  }

  function moodForResult(result) {
    if (!result) return null;
    const changes = [...(result.changes || []), ...(result.pendingChanges || [])];
    if (changes.some(([, amount]) => amount < 0) || ['fail', 'critical'].includes(result.outcome)) return 'sad';
    if (changes.some(([, amount]) => amount > 0) || ['success', 'great'].includes(result.outcome)) return 'happy';
    return null;
  }

  function playResultEmotions(players, results) {
    players.forEach((player, index) => {
      const mood = moodForResult(results[index]);
      if (!mood) return;
      document.querySelectorAll(`[data-subject-id="${player.id}"]`).forEach(node => {
        const viewer = players[Number(node.closest('.player-view')?.dataset.player)];
        if (viewer?.control === 'human' && viewer.room === player.room) setEmotion(node, mood);
      });
      if (player.control === 'human') {
        const portrait = document.getElementById(`portrait-${player.index}`);
        if (portrait) setEmotion(portrait, mood);
      }
    });
  }

  window.ClassicVisuals = {
    roomAsset,
    roomArt,
    resolveRoomAsset,
    artStatus,
    registry,
    scenes: SCENE_FILES,
    stageRooms: STAGE_ROOMS,
    returnVariants: RETURN_VARIANTS,
    placeholder: MISSING_PLACEHOLDER,
    playResultEmotions,
    moodForResult
  };
})();
