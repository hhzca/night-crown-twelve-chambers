/* 夜行模式的角色贴图。
   原来的写法在页面一载入就去拉 assets/spr_pip.png 等三张图 —— 就算玩家根本没选夜行模式，
   控制台也会留下三条 404。这三张图本来就是可选素材（没有就用下面的程序化小人兜底），
   所以改成第一次真正要画的时候才去找，并且明确忽略加载失败。 */
(function () {
  const FR = window.FR;
  const cache = new Map();
  const sheets = [];
  let sheetsRequested = false;

  function ensureSheets() {
    if (sheetsRequested) return;
    sheetsRequested = true;
    ['pip', 'moss', 'nox'].forEach((name, index) => {
      const img = new Image();
      img.onload = () => { sheets[index] = img; };
      img.onerror = () => { sheets[index] = null; };
      img.src = `assets/spr_${name}.png`;
    });
  }

  function build(index = 0, palette = {}) {
    const key = index + JSON.stringify(palette);
    if (cache.has(key)) return cache.get(key);
    const c = document.createElement('canvas');
    c.width = 32; c.height = 48;
    const x = c.getContext('2d');
    const h = FR.heroDefs[index] || FR.heroDefs[0];
    const cloak = palette.cloak || h.cloak, hair = palette.hair || h.hair, lantern = palette.lantern || h.lantern;
    x.imageSmoothingEnabled = false;
    x.fillStyle = '#0008'; x.beginPath(); x.ellipse(16, 45, 11, 3, 0, 0, 7); x.fill();
    x.strokeStyle = '#24182f'; x.lineWidth = 2;
    x.fillStyle = cloak; x.beginPath(); x.moveTo(8, 22); x.quadraticCurveTo(4, 39, 7, 43); x.lineTo(25, 43); x.quadraticCurveTo(28, 39, 24, 22); x.closePath(); x.fill(); x.stroke();
    x.fillStyle = '#8b5772'; x.fillRect(9, 30, 14, 3);
    x.fillStyle = '#f2c7b3'; x.beginPath(); x.arc(16, 16, 10, 0, 7); x.fill(); x.stroke();
    x.fillStyle = hair; x.beginPath(); x.arc(16, 12, 9, Math.PI, 7); x.lineTo(24, 17); x.lineTo(20, 13); x.lineTo(15, 15); x.lineTo(10, 12); x.lineTo(7, 17); x.fill(); x.stroke();
    x.fillStyle = '#24182f'; x.fillRect(12, 17, 2, 2); x.fillRect(19, 17, 2, 2);
    x.fillStyle = lantern; x.shadowColor = lantern; x.shadowBlur = 9; x.fillRect(25, 28, 4, 7); x.strokeRect(25, 28, 4, 7);
    cache.set(key, c);
    return c;
  }

  function draw(ctx, actor, sx, sy, scale = 1) {
    ensureSheets();
    const sheet = sheets[actor.hero || 0];
    const rows = { down: 0, left: 1, right: 2, up: 3 };
    ctx.save();
    ctx.translate(sx, sy);
    if (sheet && sheet.naturalWidth >= 576) {
      const frame = Math.floor(performance.now() / 180) % 2;
      ctx.drawImage(sheet, frame * 32, (rows[actor.dir] || 0) * 48, 32, 48, -16 * scale, -45 * scale, 32 * scale, 48 * scale);
    } else {
      const img = build(actor.hero || 0, actor.palette || { cloak: actor.color });
      if (actor.dir === 'left') ctx.scale(-1, 1);
      ctx.drawImage(img, -16 * scale, -45 * scale, 32 * scale, 48 * scale);
    }
    ctx.restore();
  }

  function tintSprite(source, palette) {
    const key = `tint:${source.src || source.width}:${JSON.stringify(palette)}`;
    if (cache.has(key)) return cache.get(key);
    const c = document.createElement('canvas');
    c.width = source.naturalWidth || source.width;
    c.height = source.naturalHeight || source.height;
    const x = c.getContext('2d');
    x.drawImage(source, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height);
    const hex = palette.cloak || '#e0577a';
    const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    for (let i = 0; i < d.data.length; i += 4) {
      if (d.data[i] > 245 && d.data[i + 1] < 10 && d.data[i + 2] > 245) {
        [d.data[i], d.data[i + 1], d.data[i + 2]] = rgb;
      }
    }
    x.putImageData(d, 0, 0);
    cache.set(key, c);
    return c;
  }

  FR.Sprite = { build, draw, tintSprite, sheets, ensureSheets };
})();
