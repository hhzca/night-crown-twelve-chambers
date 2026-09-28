/* ============================================================
   开场 CG 控制逻辑（夜冠：十二室）
   - 点“开始游戏”(#titleStart) 后：游戏照常切到组队界面(#setup)，
     本覆盖层把 CG 全屏盖在上面播放（游戏一直在运行，只是被视频挡住）。
   - 右上角淡显“ESC / 跳过”，2 秒后淡出；ESC 键或点击提示全程可跳过。
   - 视频结束后：立即纯黑盖住尾部 → 停留 2 秒 → 整个覆盖层淡出露出处已运行的组队界面。
   - 英文字幕按 whisper 提取的时间轴逐句显示，结尾 "We've arrived." 放大。
   ============================================================ */
(function () {
  'use strict';

  const overlay    = document.getElementById('cgOverlay');
  const video      = document.getElementById('cgVideo');
  const sub        = document.getElementById('cgSubtitle');
  const skipBtn    = document.getElementById('cgSkip');
  const black      = document.getElementById('cgBlack');
  const titleStart = document.getElementById('titleStart');

  if (!overlay || !video || !titleStart) return;

  // 字幕时间轴（来自 whisper 转写，单位：秒）
  const LINES = [
    { start: 0.84, end: 5.60,  text: 'Nothing reaches this castle by accident.',        big: false },
    { start: 5.64, end: 10.50, text: 'She has carried this night alone, long enough.',  big: false },
    { start: 34.16, end: 38.50, text: "We've arrived.",                                 big: true  },
  ];

  let revealed   = false;   // 是否已收尾并露出游戏
  let skipHintTimer = null; // 右上角提示淡出计时

  function showLine(line) {
    sub.textContent = line.text;
    sub.classList.toggle('big', !!line.big);
    sub.classList.add('show');
  }
  function hideSubtitle() {
    sub.classList.remove('show');
  }

  // 随播放进度更新字幕（只绑定一次）
  function onTimeUpdate() {
    const t = video.currentTime;
    const line = LINES.find(l => t >= l.start && t < l.end);
    if (line) {
      if (sub.textContent !== line.text || sub.classList.contains('big') !== !!line.big) {
        showLine(line);
      }
    } else {
      hideSubtitle();
    }
  }
  video.addEventListener('timeupdate', onTimeUpdate);

  // 收尾：纯黑 2 秒后整体淡出，露出下方已运行的组队界面
  function revealGame() {
    if (revealed) return;
    revealed = true;
    clearTimeout(skipHintTimer);
    hideSubtitle();
    black.classList.add('show');                 // 立即纯黑，盖住视频尾部
    setTimeout(() => {
      overlay.classList.add('fading');           // 整个覆盖层淡出
      setTimeout(() => {
        overlay.classList.remove('active', 'fading');
        black.classList.remove('show');
        try { video.pause(); } catch (e) {}
      }, 950);
    }, 2000);
  }

  // 跳过：短暂停留后淡出（不走完整 2 秒停留）
  function skipCg() {
    if (!overlay.classList.contains('active') || revealed) return;
    clearTimeout(skipHintTimer);
    hideSubtitle();
    try { video.pause(); } catch (e) {}
    black.classList.add('show');
    setTimeout(() => {
      overlay.classList.add('fading');
      setTimeout(() => {
        overlay.classList.remove('active', 'fading');
        black.classList.remove('show');
      }, 950);
    }, 250);
  }

  function startCg() {
    if (overlay.classList.contains('active')) return;  // 防重复触发
    overlay.classList.add('active');
    revealed = false;
    black.classList.remove('show');
    hideSubtitle();
    try { video.currentTime = 0; } catch (e) {}
    const p = video.play();
    if (p && p.catch) p.catch(() => {});               // 浏览器若拦截则静默

    // 右上角“ESC / 跳过”淡显 2 秒后淡出
    skipBtn.classList.add('show');
    skipHintTimer = setTimeout(() => skipBtn.classList.remove('show'), 2000);
  }

  // 绑定：点“开始游戏”先放 CG（showSetup 仍照常切屏，被 CG 盖住）
  titleStart.addEventListener('click', startCg);

  // 跳过：点击提示 或 按 ESC
  if (skipBtn) skipBtn.addEventListener('click', skipCg);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('active') && !revealed) {
      skipCg();
    }
  });

  // 视频自然播完进入收尾
  video.addEventListener('ended', revealGame, { once: true });
})();
