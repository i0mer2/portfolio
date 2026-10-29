(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  };
  const safeUrl = (url) => (/^(https?:|mailto:|tel:)/i.test(url || '') ? url : '');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- content ----------

  function applyTheme(site) {
    const root = document.documentElement.style;
    if (/^#[0-9a-f]{6}$/i.test(site.accent || '')) {
      root.setProperty('--accent', site.accent);
      root.setProperty('--accent-2', `color-mix(in oklab, ${site.accent} 62%, white)`);
    }
    document.title = [site.name, site.title].filter(Boolean).join(' | ');
  }

  function socialLinks(contact) {
    const links = [];
    if (contact.instagram || contact.instagramUrl) {
      const handle = (contact.instagram || '').replace(/^@?/, '@');
      const url = safeUrl(contact.instagramUrl) || `https://instagram.com/${handle.slice(1)}`;
      links.push({ icon: 'instagram', label: handle || 'Instagram', url });
    }
    if (contact.whatsapp) links.push({ icon: 'whatsapp', label: 'واتساب', url: `https://wa.me/${contact.whatsapp.replace(/\D/g, '')}` });
    if (contact.email) links.push({ icon: 'mail', label: contact.email, url: `mailto:${contact.email}` });
    if (safeUrl(contact.behance)) links.push({ icon: 'behance', label: 'Behance', url: contact.behance });
    return links.map((l) => {
      const a = el('a', 'social');
      a.href = l.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.innerHTML = icon(l.icon);
      a.append(el('bdi', '', l.label));
      return a;
    });
  }

  function renderHero(c) {
    const name = c.site.name || '';
    $('.brand-img').src = c.site.logo || c.hero.avatar;
    $('.brand-name').textContent = name;
    $('.hero-l1').textContent = c.hero.line1 || '';
    $('.hero-l2-text').textContent = c.hero.line2 || '';
    $('.hero-avatar img').src = c.hero.avatar;
    $('.hero-avatar').hidden = !c.hero.avatar;
    $('.hero-name').textContent = name;
    $('.hero-role').textContent = c.site.role || '';
    const cta = $('.hero-cta');
    cta.textContent = c.hero.cta || 'أعمالي';
    cta.insertAdjacentHTML('beforeend', icon('arrow'));
  }

  function renderGalleries(c) {
    const anchor = $('#works');
    const sections = c.galleries
      .filter((g) => g.items && g.items.length)
      .map((g, i) => {
        const sec = el('section', 'works');
        sec.id = i === 0 ? 'works' : `works-${i + 1}`;
        if (i === 0) sec.dataset.nav = g.title || 'أعمالي';
        else sec.dataset.spy = 'works';
        const head = el('header', 'sec-head');
        head.dataset.reveal = '';
        head.append(el('h2', '', g.title), el('p', '', g.subtitle));
        sec.append(head);
        const kind = KINDS[g.layout] ? g.layout : 'images';
        const body = g.layout === 'stage' ? buildStage(g.items) : buildSlider(g.items, kind);
        body.dataset.reveal = '';
        sec.append(body);
        return sec;
      });
    anchor.replaceWith(...sections);
  }

  function renderAbout(c) {
    const a = c.about || {};
    const sec = $('#about');
    if (!a.text && !a.photo) return sec.remove();
    $('.eyebrow', sec).textContent = a.label || '';
    $('.about-title', sec).textContent = a.title || c.site.name || '';
    const body = $('.about-body', sec);
    for (const para of (a.text || '').split(/\n\s*\n/)) {
      if (para.trim()) body.append(el('p', '', para.trim()));
    }
    if (a.photo) $('.about-photo img', sec).src = a.photo;
    else $('.about-photo', sec).remove();
  }

  function renderClients(c) {
    const data = c.clients || {};
    const sec = $('#clients');
    if (!data.items || !data.items.length) return sec.remove();
    sec.dataset.nav = data.title || 'عملائي';
    $('.sec-head h2', sec).textContent = data.title || '';
    $('.sec-head p', sec).textContent = data.subtitle || '';
    const grid = $('.clients-grid', sec);
    data.items.forEach((item, i) => {
      const tile = el('div', 'client');
      tile.dataset.reveal = '';
      tile.style.setProperty('--d', `${(i % 6) * 0.07}s`);
      tile.title = item.name || '';
      const img = el('img');
      img.src = item.logo;
      img.alt = item.name || '';
      img.loading = 'lazy';
      tile.append(img);
      grid.append(tile);
    });
  }

  function renderStats(c) {
    const data = c.stats || {};
    const sec = $('#stats');
    if (!data.items || !data.items.length) return sec.remove();
    sec.dataset.nav = data.title || 'إنجازاتي';
    $('.sec-head h2', sec).textContent = data.title || '';
    const row = $('.stats-row', sec);
    data.items.forEach((s, i) => {
      const card = el('div', 'stat');
      card.dataset.reveal = '';
      card.style.setProperty('--d', `${i * 0.12}s`);
      card.innerHTML = `<div class="stat-icon">${icon(s.icon)}</div>`;
      const num = el('bdi', 'stat-num');
      num.dir = 'ltr';
      num.dataset.value = Number(s.value) || 0;
      num.dataset.prefix = s.prefix || '';
      num.textContent = `${s.prefix || ''}0`;
      card.append(num, el('span', 'stat-label', s.label));
      row.append(card);
    });
  }

  function renderContact(c) {
    const contact = c.contact || {};
    const sec = $('#contact');
    if (!contact.ctaTitle) return sec.remove();
    $('h2', sec).textContent = contact.ctaTitle;
    $('p', sec).textContent = contact.ctaText || '';
    // The button goes to the most direct channel that is filled in.
    const btn = $('.cta-btn', sec);
    const social = socialLinks(contact);
    const target =
      (contact.whatsapp && `https://wa.me/${contact.whatsapp.replace(/\D/g, '')}`) ||
      (contact.email && `mailto:${contact.email}`) ||
      (social[0] && social[0].href);
    if (target) {
      btn.href = target;
      btn.textContent = contact.ctaButton || 'تواصل معي';
      btn.insertAdjacentHTML('beforeend', icon('arrow'));
    } else btn.remove();
    $('.cta-social', sec).append(...social);
  }

  function renderFooter(c) {
    const contact = c.contact || {};
    $('.footer-social').append(...socialLinks(contact));
    $('.drawer-social').append(...socialLinks(contact));
    $('.footer-copy').textContent = `© ${new Date().getFullYear()} ${c.site.name || ''} · ${contact.footer || ''}`;
  }

  // ---------- cards ----------

  const parseVideoLink = window.parseVideoLink;

  function mediaImg(src, alt) {
    const img = el('img');
    img.src = src;
    img.alt = alt || '';
    img.loading = 'lazy';
    img.draggable = false;
    return img;
  }

  // One card per item type; every card opens the lightbox when clicked.
  const KINDS = {
    images(item) {
      const card = el('figure', 'card');
      card.append(mediaImg(item.image, item.caption), el('figcaption', '', item.caption || ''));
      return card;
    },

    videos(item) {
      const card = el('figure', 'card card--video');
      const link = parseVideoLink(item.link);
      let preview = null;
      if (item.poster) card.append(mediaImg(item.poster, item.caption));
      else if (item.video) {
        preview = el('video');
        preview.src = `${item.video}#t=0.1`;
        preview.muted = true;
        preview.loop = true;
        preview.playsInline = true;
        preview.preload = 'metadata';
        card.append(preview);
      } else if (link && link.thumb) card.append(mediaImg(link.thumb, item.caption));
      else {
        const ph = el('div', 'card-ph');
        ph.innerHTML = icon(link ? link.platform : 'video');
        card.append(ph);
      }
      if (link && !item.video) {
        const badge = el('span', 'card-badge');
        badge.innerHTML = icon(link.platform === 'link' ? 'link' : link.platform);
        card.append(badge);
      }
      const play = el('span', 'card-play');
      play.innerHTML = icon('play');
      card.append(play, el('figcaption', '', item.caption || ''));
      // Uploaded videos preview silently while hovered.
      if (preview) {
        card.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && preview.play().catch(() => {}));
        card.addEventListener('pointerleave', () => {
          preview.pause();
          preview.currentTime = 0.1;
        });
      }
      return card;
    },

    texts(item) {
      const card = el('article', 'card card--text');
      if (item.tag) card.append(el('span', 'text-tag', item.tag));
      const q = el('span', 'text-quote');
      q.innerHTML = icon('quote');
      card.append(q, el('h3', '', item.headline || ''), el('p', '', item.excerpt || ''));
      const foot = el('footer');
      if (item.client) foot.append(el('span', 'text-client', item.client));
      if (item.result) foot.append(el('span', 'text-result', item.result));
      const more = el('span', 'text-more', 'اقرأ النص كاملًا');
      more.insertAdjacentHTML('beforeend', icon('arrow'));
      card.append(foot, more);
      return card;
    },
  };

  // ---------- slider ----------

  function buildSlider(items, kind = 'images') {
    const wrap = el('div', `slider slider--${kind}`);
    const track = el('div', 'slider-track');
    items.forEach((item, i) => {
      const card = KINDS[kind](item);
      card.addEventListener('click', () => openLightbox(items, i, kind));
      track.append(card);
    });
    const bar = el('div', 'slider-bar');
    const thumb = el('span');
    bar.append(thumb);
    const arrows = el('div', 'slider-arrows');
    const prev = el('button', 'arrow-btn');
    const next = el('button', 'arrow-btn');
    prev.innerHTML = icon('chevronR');
    next.innerHTML = icon('chevronL');
    prev.setAttribute('aria-label', 'السابق');
    next.setAttribute('aria-label', 'التالي');
    arrows.append(prev, next);
    wrap.append(track, bar, arrows);

    const step = () => {
      const card = track.firstElementChild;
      return card ? card.offsetWidth + 22 : 300;
    };
    const maxScroll = () => track.scrollWidth - track.clientWidth;
    const atEnd = () => Math.abs(track.scrollLeft) >= maxScroll() - 4;
    const atStart = () => Math.abs(track.scrollLeft) <= 4;
    const goNext = () => track.scrollBy({ left: -step(), behavior: 'smooth' });
    const goPrev = () => track.scrollBy({ left: step(), behavior: 'smooth' });
    // Autoplay bounces between the ends instead of rushing back to the start.
    let forward = true;
    const autoStep = () => {
      if (forward && atEnd()) forward = false;
      else if (!forward && atStart()) forward = true;
      forward ? goNext() : goPrev();
    };
    next.addEventListener('click', () => (goNext(), player.pause()));
    prev.addEventListener('click', () => (goPrev(), player.pause()));

    let ticking = false;
    const update = () => {
      ticking = false;
      const max = maxScroll();
      const visible = Math.min(1, track.clientWidth / track.scrollWidth);
      const p = max > 0 ? Math.abs(track.scrollLeft) / max : 0;
      thumb.style.width = `${visible * 100}%`;
      thumb.style.transform = `translateX(${-p * (1 / visible - 1) * 100}%)`;
      const box = track.getBoundingClientRect();
      const mid = box.left + box.width / 2;
      for (const card of track.children) {
        const r = card.getBoundingClientRect();
        const off = Math.max(-1, Math.min(1, (r.left + r.width / 2 - mid) / (box.width / 2)));
        card.style.setProperty('--ry', `${off * -14}deg`);
      }
    };
    const schedule = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };
    track.addEventListener('scroll', schedule, { passive: true });
    addEventListener('resize', schedule);
    requestAnimationFrame(update);

    // Mouse drag (touch uses native scrolling).
    let drag = null;
    track.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse') return;
      drag = { x: e.clientX, left: track.scrollLeft, moved: false };
    });
    addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      if (Math.abs(dx) > 5 && !drag.moved) {
        drag.moved = true;
        track.classList.add('dragging');
      }
      if (drag.moved) track.scrollLeft = drag.left - dx;
    });
    addEventListener('pointerup', () => {
      if (!drag) return;
      const moved = drag.moved;
      drag = null;
      track.classList.remove('dragging');
      if (moved) {
        // A drag must not count as a click on the card under the cursor.
        suppressClick(track);
        player.pause();
      }
    });
    track.addEventListener('touchstart', () => player.pause(), { passive: true });

    const player = autoplay(wrap, autoStep, 3200);
    return wrap;
  }

  // ---------- 3D stage ----------

  function buildStage(items) {
    const wrap = el('div', 'stage-wrap');
    const stage = el('div', 'stage');
    const caption = el('p', 'stage-caption');
    const dots = el('div', 'dots');
    let current = 0;

    const nodes = items.map((item, i) => {
      const node = el('div', 'stage-item');
      const frame = el('div', 'frame');
      const img = el('img');
      img.src = item.image;
      img.alt = item.caption || '';
      img.draggable = false;
      frame.append(img);
      node.append(frame);
      for (let k = 0; k < 4; k++) node.append(el('span', 'handle'));
      node.addEventListener('click', () => {
        player.pause();
        i === current ? openLightbox(items, i) : go(i);
      });
      stage.append(node);
      const dot = el('button');
      dot.setAttribute('aria-label', `عرض ${i + 1}`);
      dot.addEventListener('click', () => (go(i), player.pause()));
      dots.append(dot);
      return node;
    });

    const offsets = nodes.map(() => null);
    function layout() {
      const n = nodes.length;
      nodes.forEach((node, i) => {
        let off = i - current;
        if (off > n / 2) off -= n;
        if (off < -n / 2) off += n;
        const abs = Math.abs(off);
        // A card that wraps from one end to the other jumps instantly
        // instead of sliding across the whole stage.
        const wrapped = offsets[i] != null && Math.abs(off - offsets[i]) > 1;
        offsets[i] = off;
        if (wrapped) node.style.transition = 'none';
        node.style.transform =
          `translate(-50%, -50%) translateX(${off * -72}%) translateZ(${-abs * 300}px) ` +
          `rotateY(${off * 30}deg) rotateX(${abs ? 12 : 8}deg) rotateZ(${abs ? off * 4 : -3}deg)`;
        node.style.opacity = wrapped || abs > 2 ? 0 : 1 - abs * 0.3;
        node.style.setProperty('--dim', Math.min(abs * 0.3, 0.7));
        if (wrapped) {
          node.offsetWidth;
          node.style.transition = '';
          if (abs <= 2) node.style.opacity = 1 - abs * 0.3;
        }
        node.style.zIndex = 10 - Math.round(abs);
        node.style.pointerEvents = abs > 2 ? 'none' : '';
        node.classList.toggle('current', off === 0);
        dots.children[i].classList.toggle('on', off === 0);
      });
      caption.textContent = items[current].caption || '';
    }
    function go(i) {
      current = (i + nodes.length) % nodes.length;
      layout();
    }

    let startX = null;
    stage.addEventListener('pointerdown', (e) => (startX = e.clientX));
    stage.addEventListener('pointerup', (e) => {
      if (startX == null) return;
      const dx = e.clientX - startX;
      startX = null;
      if (Math.abs(dx) > 40) {
        suppressClick(stage);
        player.pause();
        go(current + (dx < 0 ? 1 : -1));
      }
    });
    addEventListener('keydown', (e) => {
      if (!lightbox.hidden || !wrap.matches(':hover')) return;
      if (e.key === 'ArrowLeft') go(current + 1);
      if (e.key === 'ArrowRight') go(current - 1);
    });

    wrap.append(stage, caption, dots);
    layout();
    const player = autoplay(wrap, () => go(current + 1), 3800);
    return wrap;
  }

  // Swallow the click that a browser fires at the end of a drag or swipe.
  function suppressClick(node) {
    const stop = (e) => {
      e.stopPropagation();
      e.preventDefault();
    };
    node.addEventListener('click', stop, { capture: true, once: true });
    setTimeout(() => node.removeEventListener('click', stop, { capture: true }), 50);
  }

  // Advance on a timer while visible and not hovered. pause() holds it off
  // for a while after the visitor moves things themselves.
  function autoplay(node, fn, ms) {
    let visible = false;
    let hovered = false;
    let quietUntil = 0;
    const player = { pause: () => (quietUntil = Date.now() + ms * 2) };
    if (reduceMotion) return player;
    node.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && (hovered = true));
    node.addEventListener('pointerleave', () => (hovered = false));
    new IntersectionObserver(([e]) => (visible = e.isIntersecting), { threshold: 0.3 }).observe(node);
    setInterval(() => {
      if (visible && !hovered && !document.hidden && lightbox.hidden && Date.now() > quietUntil) fn();
    }, ms);
    return player;
  }

  // ---------- lightbox ----------

  const lightbox = $('.lightbox');
  let lbItems = [];
  let lbIndex = 0;
  let lbKind = 'images';

  function videoMedia(item) {
    if (item.video) {
      const v = el('video');
      v.src = item.video;
      v.controls = true;
      v.autoplay = true;
      v.playsInline = true;
      if (item.poster) v.poster = item.poster;
      return v;
    }
    const link = parseVideoLink(item.link);
    if (link && link.embed) {
      const frame = el('iframe', link.tall ? 'lb-embed tall' : 'lb-embed');
      frame.src = link.embed;
      frame.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture';
      frame.allowFullscreen = true;
      return frame;
    }
    // Links we cannot embed open on the platform itself.
    const box = el('div', 'lb-out');
    if (item.poster) box.append(mediaImg(item.poster, item.caption));
    if (link) {
      const a = el('a', 'btn-glow', 'شاهد الفيديو على المنصة');
      a.href = item.link;
      a.target = '_blank';
      a.rel = 'noopener';
      box.append(a);
    }
    return box;
  }

  function textMedia(item) {
    const art = el('article', 'lb-text');
    if (item.tag) art.append(el('span', 'text-tag', item.tag));
    art.append(el('h3', '', item.headline || ''));
    for (const para of (item.body || item.excerpt || '').split(/\n\s*\n/)) {
      if (para.trim()) art.append(el('p', '', para.trim()));
    }
    const foot = el('footer');
    if (item.client) foot.append(el('span', 'text-client', item.client));
    if (item.result) foot.append(el('span', 'text-result', item.result));
    art.append(foot);
    return art;
  }

  function showLightbox() {
    const item = lbItems[lbIndex];
    let media;
    if (lbKind === 'videos') media = videoMedia(item);
    else if (lbKind === 'texts') media = textMedia(item);
    else media = mediaImg(item.image, item.caption);
    $('.lb-media', lightbox).replaceChildren(media);
    $('figcaption', lightbox).textContent = lbKind === 'texts' ? '' : item.caption || '';
    lightbox.dataset.kind = lbKind;
  }
  function openLightbox(items, index, kind = 'images') {
    lbItems = items;
    lbIndex = index;
    lbKind = kind;
    showLightbox();
    lightbox.hidden = false;
    requestAnimationFrame(() => lightbox.classList.add('open'));
    document.body.style.overflow = 'hidden';
  }
  function closeLightbox() {
    lightbox.classList.remove('open');
    document.body.style.overflow = '';
    // Stop any playing video or embed.
    $('.lb-media', lightbox).replaceChildren();
    setTimeout(() => (lightbox.hidden = true), 300);
  }
  function stepLightbox(d) {
    lbIndex = (lbIndex + d + lbItems.length) % lbItems.length;
    showLightbox();
  }
  $('.lb-close').innerHTML = icon('close');
  $('.lb-prev').innerHTML = icon('chevronR');
  $('.lb-next').innerHTML = icon('chevronL');
  $('.lb-close').addEventListener('click', closeLightbox);
  $('.lb-prev').addEventListener('click', () => stepLightbox(-1));
  $('.lb-next').addEventListener('click', () => stepLightbox(1));
  lightbox.addEventListener('click', (e) => e.target === lightbox && closeLightbox());
  addEventListener('keydown', (e) => {
    if (lightbox.hidden) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') stepLightbox(1);
    if (e.key === 'ArrowRight') stepLightbox(-1);
  });

  // ---------- navigation ----------

  function buildNav() {
    const nav = $('.nav');
    const pill = $('.nav-pill');
    const drawerNav = $('.drawer-nav');
    const sections = [...document.querySelectorAll('[data-nav]')];
    const links = new Map();

    sections.forEach((sec, i) => {
      for (const container of [nav, drawerNav]) {
        const a = el('a', '', sec.dataset.nav);
        a.href = `#${sec.id}`;
        a.style.transitionDelay = `${i * 0.05}s`;
        container.append(a);
        if (!links.has(sec)) links.set(sec, []);
        links.get(sec).push(a);
      }
    });

    function setActive(sec) {
      for (const [s, anchors] of links) anchors.forEach((a) => a.classList.toggle('active', s === sec));
      const a = links.get(sec) && links.get(sec)[0];
      if (a && a.offsetWidth) {
        pill.style.left = `${a.offsetLeft}px`;
        pill.style.width = `${a.offsetWidth}px`;
        pill.style.opacity = 1;
      }
    }
    // Extra gallery sections highlight the first gallery's link.
    const owner = (node) => (node.dataset.spy ? document.getElementById(node.dataset.spy) : node);
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(owner(e.target))),
      { rootMargin: '-45% 0px -50% 0px' }
    );
    document.querySelectorAll('[data-nav], [data-spy]').forEach((s) => io.observe(s));
    setActive(sections[0]);
    addEventListener('resize', () => setActive(sections.find((s) => links.get(s)[0].classList.contains('active'))));
    document.fonts && document.fonts.ready.then(() => setActive(sections.find((s) => links.get(s)[0].classList.contains('active'))));

    // Drawer menu
    const btn = $('.menu-btn');
    const drawer = $('.drawer');
    btn.innerHTML = icon('menu');
    const toggle = (open) => {
      btn.setAttribute('aria-expanded', open);
      btn.innerHTML = icon(open ? 'close' : 'menu');
      if (open) {
        drawer.hidden = false;
        requestAnimationFrame(() => drawer.classList.add('open'));
      } else {
        drawer.classList.remove('open');
        setTimeout(() => (drawer.hidden = true), 400);
      }
    };
    btn.addEventListener('click', () => toggle(drawer.hidden));
    drawerNav.addEventListener('click', (e) => e.target.closest('a') && toggle(false));
  }

  // ---------- reveal + counters ----------

  function countUp(node) {
    const target = Number(node.dataset.value);
    const prefix = node.dataset.prefix;
    if (reduceMotion) return (node.textContent = prefix + target);
    const start = performance.now();
    const dur = 1800;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 4);
      node.textContent = prefix + Math.round(target * eased);
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function observeReveals() {
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.classList.add('in');
          const num = e.target.querySelector('.stat-num');
          if (num) countUp(num);
          io.unobserve(e.target);
        }),
      { threshold: 0.15 }
    );
    document.querySelectorAll('[data-reveal]').forEach((n) => io.observe(n));
  }

  // ---------- boot ----------

  fetch(`content.json?v=${Date.now()}`, { cache: 'no-store' })
    .then((r) => r.json())
    .then((c) => {
      applyTheme(c.site);
      renderHero(c);
      renderGalleries(c);
      renderAbout(c);
      renderClients(c);
      renderStats(c);
      renderContact(c);
      renderFooter(c);
      buildNav();
      observeReveals();
      const img = $('.hero-avatar img');
      const start = () => requestAnimationFrame(() => document.body.classList.remove('is-loading'));
      if (img.complete || !img.src) start();
      else {
        img.addEventListener('load', start, { once: true });
        img.addEventListener('error', start, { once: true });
        setTimeout(start, 1500);
      }
    })
    .catch((err) => {
      console.error(err);
      document.body.classList.remove('is-loading');
    });
})();
