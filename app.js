/* ============================================================
   NEON GALLERY 3D — frontend
   Loads the gallery from /api/gallery, builds a Three.js scene
   with the cards floating in space, and drives the HUD, filters
   and the fullscreen viewer.
   ============================================================ */

(() => {
  'use strict';

  // ------------------------------------------------------------ config
  const CARD_W = 470;
  const CARD_H = Math.round((CARD_W * 800) / 1200);   // posters are 3:2
  const GAP = 46;
  const FLOOR_Y = -1150;
  const TEX_W = 960;                                  // card texture width
  const TEX_H = Math.round((TEX_W * 800) / 1200);
  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // fit: margin multiplier applied when the composition box is framed by the camera
  const LAYOUTS = {
    wall:     { kind: 'wall',  columns: 6, radius: 2100, spin: 0.10, fit: 1.12, yaw: 0.75 },
    carousel: { kind: 'ring',  radius: 800, spin: 0.14, fit: 1.18,  yaw: Infinity },
    float:    { kind: 'shell', radius: 1150, spin: 0.12, fit: 1.15,  yaw: Infinity },
  };

  const dom = {
    canvas: document.getElementById('scene'),
    boot: document.getElementById('boot'),
    bootFill: document.getElementById('bootBarFill'),
    bootStatus: document.getElementById('bootStatus'),
    chips: document.getElementById('chips'),
    search: document.getElementById('search'),
    layouts: document.getElementById('layouts'),
    btnShuffle: document.getElementById('btnShuffle'),
    btnReset: document.getElementById('btnReset'),
    btnOrbit: document.getElementById('btnOrbit'),
    counterNow: document.getElementById('counterNow'),
    counterTotal: document.getElementById('counterTotal'),
    roIndex: document.getElementById('roIndex'),
    roTitle: document.getElementById('roTitle'),
    roDesc: document.getElementById('roDesc'),
    roCat: document.getElementById('roCat'),
    roAuthor: document.getElementById('roAuthor'),
    roYear: document.getElementById('roYear'),
    lightbox: document.getElementById('lightbox'),
    lbImg: document.getElementById('lbImg'),
    lbGlow: document.getElementById('lbGlow'),
    lbTitle: document.getElementById('lbTitle'),
    lbDesc: document.getElementById('lbDesc'),
    lbCat: document.getElementById('lbCat'),
    lbAuthor: document.getElementById('lbAuthor'),
    lbYear: document.getElementById('lbYear'),
    lbCount: document.getElementById('lbCount'),
    lbStrip: document.getElementById('lbStrip'),
    lbClose: document.getElementById('lbClose'),
    lbPrev: document.getElementById('lbPrev'),
    lbNext: document.getElementById('lbNext'),
  };

  const pad2 = (n) => String(n).padStart(2, '0');
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const easeOut = (x) => 1 - Math.pow(1 - x, 3);

  // ------------------------------------------------------------- state
  const state = {
    byId: new Map(),        // id -> enriched item (holds its card texture)
    items: [],              // items currently visible after filtering
    categories: [],
    category: '',
    query: '',
    order: [],              // permutation driving the layout
    autoOrbit: !REDUCED,
    view: null,             // lightbox index inside state.items
  };

  let scene = null;

  // ------------------------------------------------------- boot helpers
  function progress(pct, label) {
    dom.bootFill.style.width = `${clamp(pct, 0, 100)}%`;
    if (label) dom.bootStatus.textContent = label;
  }

  function finishBoot() {
    progress(100, 'готово');
    setTimeout(() => dom.boot.classList.add('done'), 320);
    document.querySelectorAll('.hud').forEach((el, i) => {
      el.classList.add('reveal');
      el.style.animationDelay = `${0.15 + i * 0.09}s`;
    });
  }

  // -------------------------------------------------------------- data
  async function fetchGallery() {
    const params = new URLSearchParams();
    if (state.category) params.set('category', state.category);
    if (state.query) params.set('q', state.query);
    const res = await fetch(`/api/gallery?${params}`, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`API responded ${res.status}`);
    return res.json();
  }

  let filterTimer = 0;
  function scheduleFilter() {
    clearTimeout(filterTimer);
    filterTimer = setTimeout(() => applyFilter(state.category, state.query), 220);
  }

  async function applyFilter(category, query) {
    state.category = category;
    state.query = query;
    dom.chips.querySelectorAll('.chip').forEach((c) => {
      c.classList.toggle('on', (c.dataset.category || '') === (category || ''));
    });

    try {
      const data = await fetchGallery();
      // Reuse enriched items so already built textures are not reloaded.
      state.items = data.items.map((it) => state.byId.get(it.id) || it);
      state.order = Array.from({ length: state.items.length }, (_, i) => i);
      updateCounter(data.count, data.total);
      if (state.view !== null) closeLightbox();
      if (scene) scene.setItems(state.items, state.order);
    } catch (err) {
      console.error('[neongallery] filter failed:', err);
      progress(100, 'ошибка загрузки API');
    }
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // ------------------------------------------------------------ HUD
  function buildChips(categories, items) {
    dom.chips.textContent = '';
    const make = (label, value, count) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + ((state.category || '') === value ? ' on' : '');
      b.dataset.category = value;
      b.append(label);
      const n = document.createElement('span');
      n.className = 'n';
      n.textContent = count;
      b.appendChild(n);
      b.addEventListener('click', () => applyFilter(value, state.query));
      dom.chips.appendChild(b);
    };

    make('All', '', items.length);
    categories.forEach((c) => make(c, c, items.filter((it) => it.category === c).length));
  }

  function updateCounter(now, total) {
    dom.counterNow.textContent = pad2(now);
    dom.counterTotal.textContent = pad2(total);
  }

  function showReadout(item, index) {
    if (!item) return;
    dom.roIndex.textContent = `FRAME ${pad2(index + 1)}`;
    dom.roTitle.textContent = item.title;
    dom.roDesc.textContent = item.description;
    dom.roCat.textContent = item.category;
    dom.roAuthor.textContent = item.author;
    dom.roYear.textContent = item.year;
  }

  // --------------------------------------------------------- lightbox
  function openLightbox(index) {
    if (!state.items.length) return;
    state.view = clamp(index, 0, state.items.length - 1);
    dom.lightbox.hidden = false;
    renderLightbox();
    dom.lbClose.focus();
  }

  function closeLightbox() {
    if (state.view === null) return;
    state.view = null;
    dom.lightbox.hidden = true;
  }

  function stepLightbox(delta) {
    if (state.view === null) return;
    const n = state.items.length;
    state.view = (state.view + delta + n) % n;
    renderLightbox();
  }

  function renderLightbox() {
    const item = state.items[state.view];
    if (!item) return;

    dom.lbImg.src = item.image;
    dom.lbImg.alt = `${item.title} — ${item.category}`;
    dom.lbTitle.textContent = item.title;
    dom.lbDesc.textContent = item.description;
    dom.lbCat.textContent = item.category;
    dom.lbAuthor.textContent = item.author;
    dom.lbYear.textContent = item.year;
    dom.lbCount.textContent = `${pad2(state.view + 1)} / ${pad2(state.items.length)}`;
    dom.lbGlow.style.setProperty('--lb-accent', hexToRgba(item.accent, 0.45));

    dom.lbStrip.textContent = '';
    state.items.forEach((it, i) => {
      const t = document.createElement('button');
      t.type = 'button';
      t.className = 'lb-thumb' + (i === state.view ? ' on' : '');
      t.title = it.title;
      const img = document.createElement('img');
      img.src = it.image;
      img.alt = '';
      img.loading = 'lazy';
      t.appendChild(img);
      t.addEventListener('click', () => {
        state.view = i;
        renderLightbox();
      });
      dom.lbStrip.appendChild(t);
    });
    const active = dom.lbStrip.querySelector('.lb-thumb.on');
    if (active) active.scrollIntoView({ block: 'nearest', inline: 'center' });

    showReadout(item, state.view);
  }

  function hexToRgba(hex, a) {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    const n = parseInt(full, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }

  // --------------------------------------------------- fallback viewer
  function renderFallback() {
    const wrap = document.createElement('div');
    wrap.className = 'fallback';
    state.items.forEach((it, i) => {
      const card = document.createElement('div');
      card.className = 'fallback-card';
      const img = document.createElement('img');
      img.src = it.image;
      img.alt = it.title;
      const label = document.createElement('span');
      label.textContent = it.title;
      card.append(img, label);
      card.addEventListener('click', () => openLightbox(i));
      wrap.appendChild(card);
    });
    document.body.appendChild(wrap);
    finishBoot();
  }

  // ================================================================ 3D
  function makeScene() {
    const renderer = new THREE.WebGLRenderer({
      canvas: dom.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x05070f, 1);

    const world = new THREE.Scene();
    world.fog = new THREE.FogExp2(0x05070f, 0.00016);

    const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 1, 12000);
    const orbit = { theta: 0.18, phi: 1.22, dist: 5200, thetaT: 0.18, phiT: 1.22, distT: 3200 };
    const focus = new THREE.Vector3(0, 0, 0);
    const focusT = new THREE.Vector3(0, 0, 0);
    let fitDist = 3200;

    const galleryGroup = new THREE.Group();
    world.add(galleryGroup);

    // mirrored copy of every card, used as a polished-floor reflection
    const reflGroup = new THREE.Group();
    reflGroup.position.y = 2 * FLOOR_Y;
    reflGroup.scale.y = -1;
    world.add(reflGroup);

    // ---- shared textures -----------------------------------------------
    const discTex = gradientDisc();
    const beamTex = verticalBeam();
    const labelCache = new Map();

    // ---- floor ---------------------------------------------------------
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(12000, 12000),
      new THREE.MeshBasicMaterial({ color: 0x03060d, transparent: true, opacity: 0.66 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = FLOOR_Y;
    world.add(floor);

    const grid = new THREE.GridHelper(9000, 45, 0x2f6fa8, 0x14304f);
    grid.position.y = FLOOR_Y + 0.5;
    grid.material.transparent = true;
    grid.material.opacity = 0.32;
    world.add(grid);

    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(5200, 5200),
      new THREE.MeshBasicMaterial({
        map: discTex, transparent: true, opacity: 0.26,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      }),
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = FLOOR_Y + 3;
    world.add(pool);

    // ---- light beams ---------------------------------------------------
    const beams = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const beam = new THREE.Mesh(
        new THREE.PlaneGeometry(430, 2500),
        new THREE.MeshBasicMaterial({
          map: beamTex, transparent: true, opacity: 0.12,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
        }),
      );
      const a = (i / 4) * Math.PI * 2 + 0.4;
      beam.position.set(Math.sin(a) * 1850, 700, Math.cos(a) * 1850);
      beam.lookAt(0, 700, 0);
      beam.userData.seed = i * 1.7;
      beams.add(beam);
    }
    world.add(beams);

    // ---- particles -----------------------------------------------------
    const COUNT = window.innerWidth < 760 ? 420 : 900;
    const pos = new Float32Array(COUNT * 3);
    const drift = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 4400;
      pos[i * 3 + 1] = FLOOR_Y + Math.random() * 2500;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 4400;
      drift[i] = 6 + Math.random() * 22;
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const points = new THREE.Points(pGeo, new THREE.PointsMaterial({
      size: 10, map: discTex, transparent: true, opacity: 0.45,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, fog: false,
    }));
    world.add(points);

    // ---- cards ---------------------------------------------------------
    const cards = [];
    const pickables = [];
    let layoutName = 'wall';

    function labelTexture(item) {
      const cached = labelCache.get(item.id);
      if (cached) return cached;

      const w = 1024, h = 190;
      const cv = document.createElement('canvas');
      cv.width = w;
      cv.height = h;
      const g = cv.getContext('2d');
      g.textAlign = 'center';

      g.font = '600 72px Inter, "Segoe UI", system-ui, sans-serif';
      g.fillStyle = '#eaf6ff';
      g.shadowColor = item.accent;
      g.shadowBlur = 28;
      g.fillText(fitText(g, item.title, w - 40), w / 2, 82);

      g.font = '500 38px "DejaVu Sans Mono", monospace';
      g.fillStyle = item.accent;
      g.globalAlpha = 0.9;
      g.shadowBlur = 12;
      g.fillText(`${item.category.toUpperCase()}  ·  ${item.year}`, w / 2, 150);

      const tex = new THREE.CanvasTexture(cv);
      tex.anisotropy = 8;
      labelCache.set(item.id, tex);
      return tex;
    }

    function addCard(item) {
      const group = new THREE.Group();

      const cardMat = new THREE.MeshBasicMaterial({ map: item.texture, transparent: true });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W, CARD_H), cardMat);

      const glowMat = new THREE.MeshBasicMaterial({
        map: discTex, color: new THREE.Color(item.accent), transparent: true, opacity: 0.16,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      });
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W * 2.2, CARD_H * 2.4), glowMat);
      glow.position.z = -16;

      const labelTex = labelTexture(item);
      const labelMat = new THREE.MeshBasicMaterial({
        map: labelTex, transparent: true, opacity: 0.4, depthWrite: false, fog: false,
      });
      const label = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W * 0.9, CARD_W * 0.9 * (190 / 1024)), labelMat);
      label.position.set(0, -CARD_H / 2 - 36, 1);

      group.add(glow, mesh, label);
      group.scale.setScalar(0.001);
      galleryGroup.add(group);

      const reflMat = new THREE.MeshBasicMaterial({
        map: item.texture, transparent: true, opacity: 0.1,
        depthWrite: false, side: THREE.DoubleSide,
      });
      const reflection = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W, CARD_H), reflMat);
      reflGroup.add(reflection);

      const card = {
        item,
        group, mesh, glow, glowMat, label, labelMat, cardMat, reflection, reflMat,
        targetPos: new THREE.Vector3(0, 0, 1400),
        targetQuat: new THREE.Quaternion(),
        targetScale: 1,
        rank: 0,
        hover: 0,
        born: performance.now(),
        seed: Math.random() * Math.PI * 2,
      };
      mesh.userData.card = card;

      cards.push(card);
      pickables.push(mesh);
      return card;
    }

    function dropCard(card) {
      const i = cards.indexOf(card);
      if (i >= 0) cards.splice(i, 1);
      const p = pickables.indexOf(card.mesh);
      if (p >= 0) pickables.splice(p, 1);

      galleryGroup.remove(card.group);
      reflGroup.remove(card.reflection);
      [card.mesh, card.glow, card.label, card.reflection].forEach((m) => m.geometry.dispose());
      [card.cardMat, card.glowMat, card.labelMat, card.reflMat].forEach((m) => m.dispose());
    }

    function setItems(items) {
      const present = new Map(cards.map((c) => [c.item.id, c]));
      const wanted = new Set(items.map((it) => it.id));

      cards.slice().forEach((c) => { if (!wanted.has(c.item.id)) dropCard(c); });
      items.forEach((it, rank) => {
        let card = present.get(it.id);
        if (!card) card = addCard(it);
        card.rank = rank;
      });
      layout();
    }

    function layout() {
      const cfg = LAYOUTS[layoutName];
      const n = cards.length;
      if (!n) return;

      cards.forEach((card) => {
        const k = state.order[card.rank] ?? card.rank;
        card.billboard = cfg.kind === 'shell';

        if (cfg.kind === 'ring') {
          // two stacked tiers so the carousel reads as a volume, not a flat hoop
          const tiers = n > 8 ? 2 : 1;
          const perTier = Math.ceil(n / tiers);
          const tier = Math.floor(k / perTier);
          const idx = k % perTier;
          const inTier = Math.min(perTier, n - tier * perTier);
          const radius = Math.max(cfg.radius, (inTier * (CARD_W + GAP)) / (Math.PI * 2) * 1.12);
          const a = (idx / inTier) * Math.PI * 2 + tier * (Math.PI / inTier);
          card.targetPos.set(
            Math.sin(a) * radius,
            ((tiers - 1) / 2 - tier) * 430,
            Math.cos(a) * radius,
          );
          card.targetQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
          card.targetScale = 1;
        } else if (cfg.kind === 'shell') {
          const golden = Math.PI * (3 - Math.sqrt(5));
          const y = 1 - (k / Math.max(1, n - 1)) * 1.35;
          const rr = Math.sqrt(Math.max(0.08, 1 - y * y));
          const th = golden * k;
          const radius = cfg.radius + (k % 3) * 250;
          card.targetPos.set(Math.cos(th) * rr * radius, y * radius * 0.8, Math.sin(th) * rr * radius);
          card.targetScale = 0.9 + (k % 3) * 0.06;
          // orientation is recomputed every frame so floating cards never turn their back
        } else {
          const cols = clamp(Math.round(Math.sqrt(n * clamp(camera.aspect, 0.75, 2) * 1.25)), 3, cfg.columns);
          const rows = Math.ceil(n / cols);
          const spread = Math.min(0.42, (CARD_W + GAP) / cfg.radius);
          const row = Math.floor(k / cols);
          const col = k % cols;
          const inRow = Math.min(cols, n - row * cols);   // keeps a ragged row centred
          const a = (col - (inRow - 1) / 2) * spread;
          const y = (((rows - 1) / 2) - row) * (CARD_H + GAP + 30);
          card.targetPos.set(Math.sin(a) * cfg.radius, y, Math.cos(a) * cfg.radius);
          card.targetQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
          card.targetScale = 1;
        }
      });

      // frame the composition: fit its bounding box into the viewport
      const box = new THREE.Box3();
      const half = new THREE.Vector3(CARD_W / 2, CARD_H / 2 + 60, 60);
      cards.forEach((c) => {
        box.expandByPoint(c.targetPos.clone().sub(half));
        box.expandByPoint(c.targetPos.clone().add(half));
      });
      const size = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(focusT);

      const vHalf = Math.tan((camera.fov * Math.PI) / 360);
      const hHalf = vHalf * camera.aspect;
      const dist = Math.max(
        size.y / (2 * vHalf),
        size.x / (2 * hHalf),
        size.z / (2 * vHalf),
      ) * cfg.fit;

      fitDist = clamp(dist, 1200, 7000);
      orbit.distT = fitDist;
    }

    function setLayout(name) {
      if (!LAYOUTS[name]) return;
      layoutName = name;
      galleryGroup.rotation.y = 0;
      reflGroup.rotation.y = 0;
      spin = 0;
      layout();
    }

    function shuffleLayout() {
      state.order = shuffle(state.order);
      layout();
    }

    function resetView() {
      orbit.thetaT = 0;
      orbit.phiT = 1.22;
      orbit.distT = fitDist;
      layout();
    }

    // ---- pointer input -------------------------------------------------
    const pointer = new THREE.Vector2(-2, -2);
    const raycaster = new THREE.Raycaster();
    const active = new Map();
    let hovered = null;
    let dragging = false;
    let travelled = 0;
    let pinch = 0;

    const pinchWidth = () => {
      const [a, b] = [...active.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };

    dom.canvas.addEventListener('pointerdown', (e) => {
      active.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (active.size === 1) {
        dragging = true;
        travelled = 0;
        document.body.classList.add('is-dragging');
      }
      if (active.size === 2) pinch = pinchWidth();
      dom.canvas.setPointerCapture(e.pointerId);
    });

    dom.canvas.addEventListener('pointermove', (e) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;

      const prev = active.get(e.pointerId);
      if (!prev) return;
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      active.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (active.size === 2) {
        const width = pinchWidth();
        if (pinch > 0) orbit.distT = clamp(orbit.distT * (pinch / width), 900, 7000);
        pinch = width;
        return;
      }
      if (dragging) {
        travelled += Math.abs(dx) + Math.abs(dy);
        orbit.thetaT -= dx * 0.0055;
        orbit.phiT = clamp(orbit.phiT - dy * 0.004, 0.45, 1.45);
      }
    });

    function releasePointer(e) {
      const tapped = dragging && travelled <= 8;
      active.delete(e.pointerId);
      if (active.size !== 0) return;
      dragging = false;
      pinch = 0;
      document.body.classList.remove('is-dragging');
      if (tapped) {
        const card = cardUnderPointer();
        if (card) {
          const idx = state.items.findIndex((it) => it.id === card.item.id);
          if (idx >= 0) openLightbox(idx);
        }
      }
    }

    dom.canvas.addEventListener('pointerup', releasePointer);
    dom.canvas.addEventListener('pointercancel', releasePointer);
    dom.canvas.addEventListener('pointerleave', (e) => {
      pointer.set(-2, -2);
      releasePointer(e);
    });

    dom.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      orbit.distT = clamp(orbit.distT * Math.exp(e.deltaY * 0.0009), 900, 7000);
    }, { passive: false });

    function cardUnderPointer() {
      if (pointer.x < -1.5) return null;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(pickables, false)[0];
      return hit ? hit.object.userData.card : null;
    }

    // ---- animation -----------------------------------------------------
    const clock = new THREE.Clock();
    let spin = 0;
    const scratch = new THREE.Vector3();
    const faceMat = new THREE.Matrix4();
    const UP = new THREE.Vector3(0, 1, 0);

    function frame() {
      const dt = Math.min(0.05, clock.getDelta());
      const t = clock.elapsedTime;
      const now = performance.now();
      const cfg = LAYOUTS[layoutName];

      if (state.autoOrbit && !dragging && !REDUCED) {
        if (cfg.kind === 'ring') {
          spin += cfg.spin * dt;
          galleryGroup.rotation.y = spin;
          reflGroup.rotation.y = spin;
        } else {
          // slow sweep around the composition instead of a runaway spin
          const amp = Number.isFinite(cfg.yaw) ? cfg.yaw * 0.55 : Math.PI;
          orbit.thetaT = Math.sin(t * cfg.spin) * amp;
          orbit.phiT = 1.22 + Math.sin(t * cfg.spin * 0.63) * 0.07;
        }
      }

      if (Number.isFinite(cfg.yaw)) orbit.thetaT = clamp(orbit.thetaT, -cfg.yaw, cfg.yaw);

      orbit.theta += (orbit.thetaT - orbit.theta) * 0.06;
      orbit.phi += (orbit.phiT - orbit.phi) * 0.08;
      orbit.dist += (orbit.distT - orbit.dist) * 0.07;
      focus.lerp(focusT, 0.05);
      camera.position.set(
        focus.x + Math.sin(orbit.theta) * Math.sin(orbit.phi) * orbit.dist,
        focus.y + Math.cos(orbit.phi) * orbit.dist,
        focus.z + Math.cos(orbit.theta) * Math.sin(orbit.phi) * orbit.dist,
      );
      camera.lookAt(focus);

      if (!dragging) {
        const hit = cardUnderPointer();
        if (hit !== hovered) {
          hovered = hit;
          dom.canvas.style.cursor = hovered ? 'pointer' : '';
          if (hovered) showReadout(hovered.item, state.items.findIndex((it) => it.id === hovered.item.id));
        }
      }

      const anyHover = hovered !== null;
      for (const c of cards) {
        const grow = easeOut(clamp((now - c.born) / 900 - c.rank * 0.035, 0, 1));
        c.hover += ((c === hovered ? 1 : 0) - c.hover) * 0.12;

        const bob = REDUCED ? 0 : Math.sin(t * 0.55 + c.seed) * (cfg.kind === 'shell' ? 24 : 8);
        scratch.copy(c.targetPos);
        scratch.y += bob;
        if (c.hover > 0.001) {
          scratch.add(scratch.clone().normalize().multiplyScalar(c.hover * 110));
        }
        c.group.position.lerp(scratch, 0.075);
        if (c.billboard) {
          // Matrix4.lookAt puts +Z along (eye - target); eye = camera keeps the
          // card's front face pointed at the viewer
          faceMat.lookAt(camera.position, c.group.position, UP);
          c.targetQuat.setFromRotationMatrix(faceMat);
        }
        c.group.quaternion.slerp(c.targetQuat, 0.07);
        c.group.scale.setScalar(Math.max(0.001, c.targetScale * grow * (1 + c.hover * 0.07)));

        const dim = anyHover && c !== hovered;
        c.cardMat.opacity = grow;
        c.cardMat.color.setScalar(dim ? 0.74 : 1);
        c.glowMat.opacity = 0.14 + c.hover * 0.4;
        c.labelMat.opacity = (0.32 + c.hover * 0.62) * grow;
        c.reflection.position.copy(c.group.position);
        c.reflection.quaternion.copy(c.group.quaternion);
        c.reflection.scale.setScalar(c.group.scale.x);
        c.reflection.material.opacity = 0.1 * grow;
      }

      const attr = pGeo.attributes.position;
      for (let i = 0; i < COUNT; i++) {
        let y = attr.array[i * 3 + 1] + drift[i] * dt;
        if (y > FLOOR_Y + 2500) y = FLOOR_Y - 80;
        attr.array[i * 3 + 1] = y;
      }
      attr.needsUpdate = true;

      beams.children.forEach((b, i) => {
        b.material.opacity = 0.09 + Math.abs(Math.sin(t * 0.22 + b.userData.seed)) * 0.1;
        b.rotation.z = Math.sin(t * 0.12 + i) * 0.06;
      });
      grid.material.opacity = 0.28 + Math.sin(t * 0.5) * 0.05;
      pool.material.opacity = 0.2 + (anyHover ? 0.08 : 0) + Math.sin(t * 0.4) * 0.03;

      renderer.render(world, camera);
    }

    function resize() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      camera.aspect = w / h;
      camera.fov = w < 760 ? 66 : 52;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w, h);
      layout();   // refit the composition for the new aspect ratio
    }
    window.addEventListener('resize', resize);

    return { setItems, setLayout, shuffleLayout, resetView, frame, resize };
  }

  // ------------------------------------------------- texture builders
  function fitText(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let cut = text;
    while (cut.length > 4 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
    return `${cut}…`;
  }

  function cardTexture(item, img) {
    const cv = document.createElement('canvas');
    cv.width = TEX_W;
    cv.height = TEX_H;
    const g = cv.getContext('2d');
    const inset = 12;
    const r = 24;
    const w = TEX_W - inset * 2;
    const h = TEX_H - inset * 2;

    roundRect(g, inset, inset, w, h, r);
    g.save();
    g.clip();
    g.drawImage(img, inset, inset, w, h);

    const sheen = g.createLinearGradient(0, 0, TEX_W * 0.8, TEX_H);
    sheen.addColorStop(0, 'rgba(255,255,255,0.12)');
    sheen.addColorStop(0.4, 'rgba(255,255,255,0.02)');
    sheen.addColorStop(1, 'rgba(0,0,0,0.28)');
    g.fillStyle = sheen;
    g.fillRect(0, 0, TEX_W, TEX_H);
    g.restore();

    g.lineWidth = 3;
    g.strokeStyle = hexToRgba(item.accent, 0.7);
    roundRect(g, inset, inset, w, h, r);
    g.stroke();

    const tex = new THREE.CanvasTexture(cv);
    tex.anisotropy = 8;
    return tex;
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.lineTo(x + w - r, y);
    g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r);
    g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h);
    g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r);
    g.quadraticCurveTo(x, y, x + r, y);
    g.closePath();
  }

  function gradientDisc() {
    const s = 256;
    const cv = document.createElement('canvas');
    cv.width = cv.height = s;
    const g = cv.getContext('2d');
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.34)');
    grad.addColorStop(0.6, 'rgba(255,255,255,0.07)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
    return new THREE.CanvasTexture(cv);
  }

  function verticalBeam() {
    const w = 128, h = 512;
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const g = cv.getContext('2d');

    const fade = g.createLinearGradient(0, 0, 0, h);
    fade.addColorStop(0, 'rgba(150,225,255,0)');
    fade.addColorStop(0.28, 'rgba(150,225,255,0.6)');
    fade.addColorStop(0.8, 'rgba(120,190,255,0.16)');
    fade.addColorStop(1, 'rgba(120,190,255,0)');
    g.fillStyle = fade;
    g.fillRect(0, 0, w, h);

    const side = g.createLinearGradient(0, 0, w, 0);
    side.addColorStop(0, 'rgba(0,0,0,1)');
    side.addColorStop(0.5, 'rgba(0,0,0,0)');
    side.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = side;
    g.fillRect(0, 0, w, h);

    return new THREE.CanvasTexture(cv);
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`image failed: ${url}`));
      img.src = url;
    });
  }

  // ---------------------------------------------------------- wire UI
  function wireUI() {
    dom.search.addEventListener('input', (e) => {
      state.query = e.target.value.trim();
      scheduleFilter();
    });

    dom.layouts.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-layout]');
      if (!btn) return;
      dom.layouts.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === btn));
      if (scene) scene.setLayout(btn.dataset.layout);
    });

    dom.btnShuffle.addEventListener('click', () => {
      if (scene) scene.shuffleLayout();
      flash(dom.btnShuffle);
    });

    dom.btnReset.addEventListener('click', () => {
      if (scene) scene.resetView();
      flash(dom.btnReset);
    });

    dom.btnOrbit.addEventListener('click', () => {
      state.autoOrbit = !state.autoOrbit;
      dom.btnOrbit.classList.toggle('on', state.autoOrbit);
      dom.btnOrbit.setAttribute('aria-pressed', String(state.autoOrbit));
    });

    dom.lbClose.addEventListener('click', closeLightbox);
    dom.lbPrev.addEventListener('click', () => stepLightbox(-1));
    dom.lbNext.addEventListener('click', () => stepLightbox(1));
    dom.lightbox.querySelector('.lb-backdrop').addEventListener('click', closeLightbox);

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (state.view !== null) {
          closeLightbox();
        } else if (state.query) {
          dom.search.value = '';
          applyFilter(state.category, '');
        }
        return;
      }
      if (state.view !== null) {
        if (e.key === 'ArrowLeft') { e.preventDefault(); stepLightbox(-1); }
        if (e.key === 'ArrowRight') { e.preventDefault(); stepLightbox(1); }
        return;
      }
      if (e.key === '/' && document.activeElement !== dom.search) {
        e.preventDefault();
        dom.search.focus();
      }
    });

    let swipeX = 0, swipeY = 0, swiping = false;
    dom.lightbox.addEventListener('pointerdown', (e) => {
      swipeX = e.clientX;
      swipeY = e.clientY;
      swiping = true;
    });
    dom.lightbox.addEventListener('pointerup', (e) => {
      if (!swiping) return;
      swiping = false;
      const dx = e.clientX - swipeX;
      const dy = e.clientY - swipeY;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) stepLightbox(dx < 0 ? 1 : -1);
    });
  }

  function flash(btn) {
    btn.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(0.94)' }, { transform: 'scale(1)' }],
      { duration: 240, easing: 'ease-out' },
    );
  }

  // --------------------------------------------------------------- boot
  async function main() {
    try {
      progress(6, 'загрузка данных…');
      const data = await fetchGallery();

      state.byId = new Map(data.items.map((it) => [it.id, it]));
      state.items = data.items;
      state.categories = data.categories;
      state.order = shuffle(Array.from({ length: data.items.length }, (_, i) => i));

      buildChips(state.categories, data.items);
      updateCounter(data.count, data.total);
      wireUI();

      if (typeof THREE === 'undefined') {
        console.error('[neongallery] three.js is unavailable, switching to flat gallery');
        renderFallback();
        return;
      }

      try {
        scene = makeScene();
        document.body.classList.add('is-3d');
      } catch (err) {
        console.error('[neongallery] WebGL unavailable, switching to flat gallery:', err);
        renderFallback();
        return;
      }

      progress(18, 'подготовка кадров…');
      for (let i = 0; i < state.items.length; i++) {
        const item = state.items[i];
        const img = await loadImage(item.image);
        item.texture = cardTexture(item, img);
        progress(18 + ((i + 1) / state.items.length) * 72, `кадр ${pad2(i + 1)} / ${pad2(state.items.length)}`);
      }

      progress(94, 'сборка сцены…');
      scene.setItems(state.items, state.order);
      scene.resize();
      scene.frame();
      requestAnimationFrame(function loop() {
        scene.frame();
        requestAnimationFrame(loop);
      });
      finishBoot();
    } catch (err) {
      console.error('[neongallery] startup failed:', err);
      progress(100, 'ошибка запуска');
    }
  }

  main();
})();
