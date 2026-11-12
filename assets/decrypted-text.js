  /* =====================================================================
     DecryptedText — da React Bits, convertito in JavaScript puro
     Uso: createDecryptedText(elemento, { text: '...', ...opzioni })
     ===================================================================== */
  (function () {
    const FADE_FLOOR = 0.16;
    const FADE_PEAK = 0.62;
    const FADE_LEAD = 6;
    const SETTLE = 'color 0.7s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.6s cubic-bezier(0.22, 1, 0.36, 1)';

    const isSpace = c => /\s/.test(c);
    const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    const glyphWidths = new Map();
    let measureContext = null;
    const readFont = node => {
      const st = getComputedStyle(node);
      return {
        font: `${st.fontStyle} ${st.fontWeight} ${st.fontSize} ${st.fontFamily}`,
        spacing: parseFloat(st.letterSpacing) || 0
      };
    };
    const advance = (font, glyph) => {
      let widths = glyphWidths.get(font);
      if (!widths) { widths = new Map(); glyphWidths.set(font, widths); }
      let w = widths.get(glyph);
      if (w === undefined) {
        measureContext = measureContext || document.createElement('canvas').getContext('2d');
        if (!measureContext) return 0;
        measureContext.font = font;
        w = measureContext.measureText(glyph).width;
        widths.set(glyph, w);
      }
      return w;
    };

    function createDecryptedText(el, opts = {}) {
      const o = Object.assign({
        text: '', speed: 50, maxIterations: 10, sequential: false, revealDirection: 'start',
        useOriginalCharsOnly: false,
        characters: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()_+',
        className: '', encryptedClassName: '', animateOn: 'hover', clickMode: 'once',
        effect: 'scramble', scrambleColor: '', loop: false, loopDelay: 2000, hoverRadius: 0,
        introHold: 0
      }, opts);

      const chars = Array.from(String(o.text ?? ''));
      const letters = chars.filter(c => !isSpace(c));
      // Nel font Moderniz (demo) questi caratteri non hanno il glifo ma il logo
      // dell'autore: non li usiamo mai nello scramble.
      const LOGO_GLYPHS = new Set(['£', '¤', '@', '§', '¶', 'µ', '`', '©', '®', '™']);
      let pool = (o.useOriginalCharsOnly ? Array.from(new Set(letters)) : Array.from(o.characters))
        .filter(c => !LOGO_GLYPHS.has(c));
      if (!pool.length) pool = letters;

      const startsHidden = ['click', 'view', 'inViewHover'].includes(o.animateOn);
      const hoverable = o.animateOn === 'hover' || o.animateOn === 'inViewHover';
      const local = hoverable && o.hoverRadius > 0;
      const step = Math.max(16, o.speed);
      const tinted = Boolean(o.scrambleColor);
      const fading = o.effect === 'fade';
      const settles = tinted || fading;

      /* --- costruzione del DOM --- */
      el.textContent = '';
      el.style.whiteSpace = 'pre-wrap';
      const wrap = document.createElement('span');
      wrap.style.display = 'inline-block';
      const sr = document.createElement('span');
      sr.textContent = chars.join('');
      Object.assign(sr.style, {
        position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px',
        overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0
      });
      const visual = document.createElement('span');
      visual.setAttribute('aria-hidden', 'true');
      wrap.append(sr, visual);
      el.appendChild(wrap);

      const cells = [];   // { cell, ghost, glyph }
      let word = null;
      chars.forEach((c, i) => {
        if (isSpace(c)) { visual.append(c); word = null; return; }
        if (!word) {
          word = document.createElement('span');
          word.style.whiteSpace = 'nowrap';
          visual.appendChild(word);
        }
        const cell = document.createElement('span');
        cell.style.position = 'relative';
        cell.style.display = 'inline-block';
        const ghost = document.createElement('span');
        ghost.textContent = c;
        const glyph = document.createElement('span');
        Object.assign(glyph.style, { position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)' });
        cell.append(ghost, glyph);
        word.appendChild(cell);
        cells[i] = { cell, ghost, glyph };
      });

      /* --- stato --- */
      let mask = chars.map(c => !startsHidden || isSpace(c) || (o.animateOn !== 'click' && reducedMotion()));
      let heat = chars.map(() => 0);
      let warmActive = false;
      let pointer = null;
      let run = null;
      let timer = null;
      let hold = null;
      let pending = null;
      let visible = true;
      let target = mask.every(Boolean);
      let played = false;
      let fontMetrics = null;
      let centers = [];

      const revealOrder = () => {
        const order = [];
        chars.forEach((c, i) => { if (!isSpace(c)) order.push(i); });
        if (o.revealDirection === 'end') return order.reverse();
        if (o.revealDirection === 'center') {
          const mid = Math.floor(chars.length / 2);
          return order.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid));
        }
        if (o.revealDirection === 'random') {
          for (let i = order.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [order[i], order[j]] = [order[j], order[i]];
          }
        }
        return order;
      };

      const fit = (i, g) => {
        if (!fontMetrics) fontMetrics = readFont(el);
        const room = advance(fontMetrics.font, chars[i] ?? g) + fontMetrics.spacing;
        const need = advance(fontMetrics.font, g) + fontMetrics.spacing;
        return need > room + 0.01 ? Math.round(Math.max(0.05, room / need) * 1000) / 1000 : 1;
      };

      const paint = () => {
        const ranks = run?.forward && o.sequential ? new Map(run.queue.map((idx, r) => [idx, r])) : null;
        const ramp = run?.forward && !o.sequential ? Math.min(1, run.iteration / Math.max(1, o.maxIterations)) : 0;

        chars.forEach((c, i) => {
          if (isSpace(c)) return;
          const { cell, ghost, glyph } = cells[i];
          const hot = heat[i] || 0;
          const hidden = !mask[i];
          const scrambled = hidden || (hot > 0 && Math.random() < hot * 2);

          let tint = 0, dim = 1;
          if (scrambled && !hidden) {
            const level = Math.min(1, hot * 1.5);
            tint = level;
            dim = 1 - (1 - FADE_FLOOR) * level;
          } else if (hidden) {
            const rank = ranks?.get(i);
            const lift = rank === undefined ? ramp : Math.max(0, 1 - rank / FADE_LEAD);
            tint = 1;
            dim = FADE_FLOOR + (FADE_PEAK - FADE_FLOOR) * lift;
          }

          cell.className = scrambled ? o.encryptedClassName : o.className;
          if (scrambled) {
            const g = pool[Math.floor(Math.random() * pool.length)];
            const squeeze = fit(i, g);
            ghost.style.visibility = 'hidden';
            glyph.style.display = '';
            glyph.textContent = g;
            glyph.style.transform = squeeze < 1 ? `translateX(-50%) scaleX(${squeeze})` : 'translateX(-50%)';
          } else {
            ghost.style.visibility = '';
            glyph.style.display = 'none';
          }

          if (settles) cell.style.transition = scrambled ? `color 0.12s linear, opacity ${step}ms linear` : SETTLE;
          if (tinted) {
            if (scrambled) {
              const amount = Math.round(tint * 100);
              cell.style.color = amount >= 100 ? o.scrambleColor
                : `color-mix(in srgb, ${o.scrambleColor} ${amount}%, currentColor)`;
            } else {
              cell.style.color = '';
            }
          }
          if (fading) cell.style.opacity = scrambled ? dim : 1;
        });
      };

      const stopTicker = () => { clearInterval(timer); timer = null; };
      const ensureTicker = () => { if (!timer) timer = setInterval(tick, step); };
      const stopRun = () => { run = null; clearTimeout(hold); hold = null; pending = null; };

      const schedule = (task, delay) => {
        clearTimeout(hold);
        hold = setTimeout(() => {
          hold = null;
          if (visible) task(); else pending = task;
        }, delay);
      };

      const startRun = (forward, { from, cycle = false, lead = 0 } = {}) => {
        stopRun();
        target = forward;
        if (from) mask = from;
        if (reducedMotion()) {
          mask = chars.map(c => forward || isSpace(c));
          paint();
          return;
        }
        const order = forward ? revealOrder() : revealOrder().reverse();
        const queue = o.sequential ? order.filter(i => mask[i] !== forward) : [];
        run = { forward, cycle, iteration: 0, queue: [...new Array(lead).fill(null), ...queue] };
        paint();
        ensureTicker();
      };

      const finishRun = r => {
        if (!o.loop) return;
        if (r.forward) {
          schedule(() => startRun(false, { cycle: true }), Math.max(0, o.loopDelay));
        } else if (r.cycle) {
          startRun(true, { cycle: true, lead: o.sequential ? Math.max(2, Math.round(320 / step)) : 0 });
        }
      };

      const warm = () => {
        const box = pointer ? el.getBoundingClientRect() : null;
        const cool = 1 / Math.max(1, o.maxIterations);
        let active = false;
        chars.forEach((c, i) => {
          if (isSpace(c)) return;
          let t = 0;
          const center = centers[i];
          if (box && center) {
            const d = Math.hypot(box.left + center.x - pointer.x, box.top + center.y - pointer.y) / Math.max(1, o.hoverRadius);
            if (d < 1) t = 1 - d * d * (3 - 2 * d);
          }
          const v = Math.max((heat[i] || 0) - cool, t);
          heat[i] = v > 0.001 ? v : 0;
          if (heat[i] > 0) active = true;
        });
        warmActive = active;
      };

      function tick() {
        if (run) {
          run.iteration += 1;
          let done;
          if (o.sequential) {
            const idx = run.queue.shift();
            if (idx !== undefined && idx !== null) {
              mask = mask.slice();
              mask[idx] = run.forward;
            }
            done = run.queue.length === 0;
          } else if (run.forward) {
            done = run.iteration >= o.maxIterations;
            if (done) mask = chars.map(() => true);
          } else {
            const vis = [];
            mask.forEach((s, i) => { if (s && !isSpace(chars[i])) vis.push(i); });
            const hideCount = Math.max(1, Math.ceil(letters.length / Math.max(1, o.maxIterations)));
            mask = mask.slice();
            for (let k = 0; k < hideCount && vis.length; k++) {
              mask[vis.splice(Math.floor(Math.random() * vis.length), 1)[0]] = false;
            }
            done = vis.length === 0 || run.iteration >= o.maxIterations;
            if (done) mask = chars.map(c => isSpace(c));
          }
          if (done) { const r = run; run = null; finishRun(r); }
        }
        if (local) warm(); else warmActive = false;
        paint();
        if (!run && !warmActive) stopTicker();
      }

      const measure = () => {
        const box = el.getBoundingClientRect();
        centers = chars.map((c, i) => {
          if (isSpace(c) || !cells[i]) return null;
          const r = cells[i].cell.getBoundingClientRect();
          return { x: r.left - box.left + r.width / 2, y: r.top - box.top + r.height / 2 };
        });
      };

      /* --- eventi --- */
      const trackPointer = e => {
        if (reducedMotion()) return;
        if (!pointer) measure();
        pointer = { x: e.clientX, y: e.clientY };
        ensureTicker();
      };

      // Su iPhone/telefoni il "mouseleave" non arriva mai dopo un tocco:
      // senza questo l'effetto resterebbe acceso all'infinito.
      // Al tocco facciamo un solo scramble breve, poi si ferma da solo.
      let lastTouch = 0;
      let touchTimer = null;
      const fromTouch = () => Date.now() - lastTouch < 1000;
      if (hoverable) {
        el.addEventListener('touchstart', e => {
          lastTouch = Date.now();
          const t = e.touches[0];
          if (!t) return;
          if (local) {
            trackPointer({ clientX: t.clientX, clientY: t.clientY });
            clearTimeout(touchTimer);
            touchTimer = setTimeout(() => { pointer = null; }, 250);
          } else if (!run) {
            startRun(true, { from: chars.map(c => isSpace(c)) });
          }
        }, { passive: true });
        el.addEventListener('touchend', () => { lastTouch = Date.now(); }, { passive: true });
      }

      if (hoverable) {
        el.addEventListener('mouseenter', e => {
          if (fromTouch()) return;
          if (local) { trackPointer(e); return; }
          if (run) return;
          startRun(true, { from: chars.map(c => isSpace(c)) });
        });
        el.addEventListener('mousemove', e => { if (local && !fromTouch()) trackPointer(e); });
        el.addEventListener('mouseleave', () => {
          if (fromTouch()) return;
          if (local) { pointer = null; return; }
          stopRun();
          target = true;
          mask = chars.map(() => true);
          paint();
          if (o.loop && o.animateOn === 'inViewHover') {
            schedule(() => startRun(false, { cycle: true }), Math.max(0, o.loopDelay));
          }
        });
      } else if (o.animateOn === 'click') {
        el.addEventListener('click', () => {
          if (o.clickMode === 'toggle') { startRun(!target); return; }
          if (!target) startRun(true);
        });
      }

      // Rimisura quando cambia la dimensione (o quando arriva il font)
      new ResizeObserver(() => {
        const m = readFont(el);
        glyphWidths.delete(m.font);
        fontMetrics = m;
        centers = [];
        pointer = null;
        paint();
      }).observe(el);
      document.fonts?.ready?.then(() => { glyphWidths.clear(); fontMetrics = null; paint(); });

      const viewTrigger = o.animateOn === 'view' || o.animateOn === 'inViewHover';
      if (viewTrigger || o.loop) {
        const io = new IntersectionObserver(entries => {
          visible = entries.some(en => en.isIntersecting);
          if (!visible) return;
          if (viewTrigger && !played) { played = true; startRun(true, { lead: o.sequential ? Math.round(o.introHold / step) : 0 }); }
          const resume = pending;
          pending = null;
          resume?.();
          if (!o.loop) io.disconnect();
        }, { threshold: 0.1 });
        io.observe(el);
      }

      paint();
    }

    window.createDecryptedText = createDecryptedText;
  })();
