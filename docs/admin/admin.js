(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);

  // Small element builder: h('div', { class: 'x', onclick: fn }, child, 'text')
  function h(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) if (c != null && c !== false) node.append(c);
    return node;
  }
  const ico = (name) => h('span', { html: icon(name), style: 'display:contents' });
  const parseVideoLink = window.parseVideoLink;
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  const TABS = [
    { id: 'hero', icon: 'home', label: 'الواجهة الرئيسية', hint: 'العنوان الرئيسي، والصورة، والاسم، والمسمّى الوظيفي' },
    { id: 'works', icon: 'image', label: 'الأعمال', hint: 'الفيديوهات والنصوص والصور: الإضافة والاستبدال والحذف والترتيب بالسحب' },
    { id: 'about', icon: 'user', label: 'من أنا', hint: 'النبذة والصورة الشخصية' },
    { id: 'clients', icon: 'building', label: 'العملاء', hint: 'شعارات الجهات التي تعاملت معها' },
    { id: 'stats', icon: 'chart', label: 'الإنجازات', hint: 'الأرقام التي تظهر بعدّاد متحرك' },
    { id: 'settings', icon: 'settings', label: 'التواصل والمظهر', hint: 'روابط التواصل، ولون الموقع، والتذييل' },
    { id: 'account', icon: 'lock', label: 'الحساب والنسخ السابقة', hint: 'اسم المستخدم وكلمة المرور، واستعادة النسخ السابقة' },
  ];
  const STAT_ICONS = ['pen', 'play', 'video', 'award', 'briefcase', 'users', 'star', 'heart', 'trophy', 'clock', 'eye', 'rocket', 'coffee', 'globe'];
  const SECTION_TYPES = {
    videos: { label: 'فيديوهات', title: 'فيديوهاتي' },
    texts: { label: 'نصوص', title: 'نماذج من كتاباتي' },
    slider: { label: 'صور', title: 'أعمالي' },
    stage: { label: 'صور', title: 'أعمالي' },
  };
  const ACCENTS = ['#8b5cf6', '#6366f1', '#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#f43f5e', '#ec4899'];

  let content = null;
  let dirty = false;
  let current = 'hero';

  // ---------- GitHub ----------
  // The site is a folder in a GitHub repository served by GitHub Pages. The
  // dashboard reads and writes that repository directly with the owner's own
  // access token, so no server is needed. Every save becomes one commit, and
  // the commit history doubles as the backup history.

  const SITE_DIR = 'docs';
  const CONTENT_PATH = `${SITE_DIR}/content.json`;
  const STORE_KEY = 'portfolio-github';
  const MAX_IMAGE = 25 * 1024 * 1024;
  const MAX_VIDEO = 70 * 1024 * 1024;
  const EXT = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'image/avif': '.avif',
    'image/svg+xml': '.svg',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/quicktime': '.mov',
  };

  let gh = readSettings();
  const pending = new Map(); // site path -> blob sha, uploaded but not committed yet
  const previews = new Map(); // site path -> local object URL until the live site has the file
  let recovered = new Map(); // site path -> blob sha from a restored older version

  function readSettings() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY)) || null;
    } catch {
      return null;
    }
  }
  function writeSettings(value) {
    try {
      value ? localStorage.setItem(STORE_KEY, JSON.stringify(value)) : localStorage.removeItem(STORE_KEY);
    } catch {}
  }

  // On GitHub Pages the address already tells us the account and repository.
  function guessRepo() {
    const host = location.hostname;
    if (!host.endsWith('.github.io')) return {};
    const owner = host.split('.')[0];
    const first = location.pathname.split('/').filter(Boolean)[0];
    return { owner, repo: first && first !== 'admin' ? first : host };
  }

  function ghError(status, data) {
    if (status === 401) return 'رمز الدخول غير صالح أو انتهت صلاحيته';
    if (status === 403) return 'رمز الدخول لا يملك صلاحية الكتابة على المستودع';
    if (status === 404) return 'لم يُعثر على المستودع أو الملف، أو أن رمز الدخول لا يملك صلاحية الوصول إليه';
    if (status === 413) return 'الملف أكبر من الحد الذي يقبله GitHub';
    return (data && data.message) || 'تعذّر الاتصال بـ GitHub';
  }

  async function ghApi(path, opts = {}) {
    const res = await fetch(`https://api.github.com/repos/${gh.owner}/${gh.repo}${path}`, {
      method: opts.method || 'GET',
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${gh.token}`,
        ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401) showAuth(ghError(401));
      throw new Error(ghError(res.status, data));
    }
    return data;
  }

  // XHR so large uploads can report progress.
  function ghUpload(body, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `https://api.github.com/repos/${gh.owner}/${gh.repo}/git/blobs`);
      xhr.setRequestHeader('Accept', 'application/vnd.github+json');
      xhr.setRequestHeader('Authorization', `Bearer ${gh.token}`);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
      xhr.onload = () => {
        let data = {};
        try {
          data = JSON.parse(xhr.responseText);
        } catch {}
        xhr.status < 300 ? resolve(data) : reject(new Error(ghError(xhr.status, data)));
      };
      xhr.onerror = () => reject(new Error('انقطع الاتصال أثناء الرفع'));
      xhr.send(JSON.stringify(body));
    });
  }

  const fromBase64 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0)));
  const toBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.onerror = () => reject(new Error('تعذّرت قراءة الملف'));
      reader.readAsDataURL(file);
    });

  async function loadContent(ref) {
    const file = await ghApi(`/contents/${CONTENT_PATH}?ref=${encodeURIComponent(ref)}`);
    return JSON.parse(fromBase64(file.content));
  }

  // Paths in the content are relative to the site root, one level above /admin/.
  function mediaUrl(path) {
    if (!path) return '';
    if (previews.has(path)) return previews.get(path);
    if (/^(https?:|blob:|data:)/.test(path)) return path;
    return `../${path}`;
  }

  async function treeOf(treeSha) {
    const tree = await ghApi(`/git/trees/${treeSha}?recursive=1`);
    return new Map(tree.tree.filter((t) => t.type === 'blob').map((t) => [t.path, t.sha]));
  }

  // One commit: the new content, any newly uploaded files it uses, and the
  // removal of uploads nothing points to any more.
  async function commitContent(message) {
    const ref = await ghApi(`/git/ref/heads/${encodeURIComponent(gh.branch)}`);
    const head = await ghApi(`/git/commits/${ref.object.sha}`);
    const existing = await treeOf(head.tree.sha);
    const json = `${JSON.stringify(content, null, 2)}\n`;
    const used = (path) => json.includes(`"${path}"`);
    const entries = [{ path: CONTENT_PATH, mode: '100644', type: 'blob', content: json }];
    for (const [path, sha] of [...recovered, ...pending]) {
      const full = `${SITE_DIR}/${path}`;
      if (used(path) && !existing.has(full)) entries.push({ path: full, mode: '100644', type: 'blob', sha });
    }
    for (const full of existing.keys()) {
      if (!full.startsWith(`${SITE_DIR}/uploads/`) || full.endsWith('/.gitkeep')) continue;
      if (!used(full.slice(SITE_DIR.length + 1))) entries.push({ path: full, mode: '100644', type: 'blob', sha: null });
    }
    const tree = await ghApi('/git/trees', { method: 'POST', body: { base_tree: head.tree.sha, tree: entries } });
    const commit = await ghApi('/git/commits', { method: 'POST', body: { message, tree: tree.sha, parents: [head.sha] } });
    await ghApi(`/git/refs/heads/${encodeURIComponent(gh.branch)}`, { method: 'PATCH', body: { sha: commit.sha } });
    pending.clear();
    recovered = new Map();
  }

  function toast(msg, type = '') {
    const t = h('div', { class: `toast ${type}`, text: msg });
    $('#toasts').append(t);
    setTimeout(() => t.remove(), type === 'err' ? 5000 : 3200);
  }

  // ---------- sign in ----------
  // Day to day the owner signs in with a username and password. The GitHub
  // token is stored encrypted in admin/login.json, and only that username and
  // password can unlock it (PBKDF2 + AES-GCM, all in the browser). The token
  // form is used once, to set things up.

  const LOGIN_PATH = `${SITE_DIR}/admin/login.json`;
  const KDF_ROUNDS = 600000;
  const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
  const unb64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
  let sealed = null;

  async function deriveKey(user, pass, salt, rounds) {
    const secret = new TextEncoder().encode(`${user.trim().toLowerCase()}\n${pass}`);
    const base = await crypto.subtle.importKey('raw', secret, 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: rounds, hash: 'SHA-256' },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function sealLogin(user, pass) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(user, pass, salt, KDF_ROUNDS);
    const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(gh)));
    return { v: 1, rounds: KDF_ROUNDS, salt: b64(salt), iv: b64(iv), data: b64(data) };
  }

  async function openLogin(box, user, pass) {
    const key = await deriveKey(user, pass, unb64(box.salt), box.rounds);
    try {
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.data));
      return JSON.parse(new TextDecoder().decode(plain));
    } catch {
      throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة');
    }
  }

  // The file sits next to this page. Right after it is first saved GitHub Pages
  // may still be publishing it, so the repository copy is the fallback.
  async function fetchSealed() {
    const guess = guessRepo();
    const owner = (gh && gh.owner) || guess.owner;
    const repo = (gh && gh.repo) || guess.repo;
    const urls = [`login.json?v=${Date.now()}`];
    if (owner && repo) urls.push(`https://raw.githubusercontent.com/${owner}/${repo}/${(gh && gh.branch) || 'main'}/${LOGIN_PATH}?v=${Date.now()}`);
    for (const url of urls) {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (res.ok) return await res.json();
      } catch {}
    }
    return null;
  }

  // Writes one file to the repository (used for login.json).
  async function putFile(path, text, message) {
    let sha;
    try {
      sha = (await ghApi(`/contents/${path}?ref=${encodeURIComponent(gh.branch)}`)).sha;
    } catch {}
    const content = b64(new TextEncoder().encode(text));
    await ghApi(`/contents/${path}`, { method: 'PUT', body: { message, content, branch: gh.branch, ...(sha ? { sha } : {}) } });
  }

  async function showAuth(error) {
    $('#app').hidden = true;
    $('#auth').hidden = false;
    sealed = await fetchSealed();
    showForm(sealed ? 'password' : 'token', error);
  }

  function showForm(mode, error) {
    $('#loginForm').hidden = mode !== 'password';
    $('#authForm').hidden = mode !== 'token';
    $('#setupNote').hidden = !!sealed;
    $('#backToLogin').hidden = !sealed;
    const guess = guessRepo();
    $('#ghOwner').value = (gh && gh.owner) || guess.owner || '';
    $('#ghRepo').value = (gh && gh.repo) || guess.repo || '';
    $('#ghBranch').value = (gh && gh.branch) || '';
    $('#loginError').textContent = mode === 'password' ? error || '' : '';
    $('#authError').textContent = mode === 'token' ? error || '' : '';
    (mode === 'password' ? $('#loginUser') : $('#ghOwner').value ? $('#ghToken') : $('#ghOwner')).focus();
  }

  $('#toSetup').addEventListener('click', () => showForm('token'));
  $('#backToLogin').addEventListener('click', () => showForm('password'));

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#loginBtn');
    $('#loginError').textContent = '';
    btn.disabled = true;
    btn.textContent = 'جارٍ تسجيل الدخول…';
    try {
      sealed = sealed || (await fetchSealed());
      if (!sealed) throw new Error('لم يُنشأ اسم مستخدم وكلمة مرور بعد');
      gh = await openLogin(sealed, $('#loginUser').value, $('#loginPass').value);
      await loadApp();
      writeSettings(gh);
      $('#loginPass').value = '';
    } catch (err) {
      $('#loginError').textContent = err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = 'تسجيل الدخول';
    }
  });

  $('#authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#authError').textContent = '';
    $('#authBtn').disabled = true;
    // Pasting on an Arabic page can bring along direction marks or other text.
    const clean = (id, allowed) => $(id).value.replace(allowed, '');
    gh = {
      owner: clean('#ghOwner', /[^\w.-]/g),
      repo: clean('#ghRepo', /[^\w.-]/g),
      branch: clean('#ghBranch', /[^\w./-]/g),
      token: clean('#ghToken', /[^\w]/g),
    };
    try {
      if (!/^(github_pat_|ghp_)\w{20,}$/.test(gh.token)) {
        throw new Error('ما لُصق ليس رمز دخول. الرمز نص طويل يبدأ بـ github_pat_، انسخه من صفحة GitHub ثم الصقه هنا.');
      }
      const repo = await ghApi('');
      if (!repo.permissions || !repo.permissions.push) throw new Error(ghError(403));
      gh.branch = gh.branch || repo.default_branch;
      await loadApp();
      writeSettings(gh);
      $('#ghToken').value = '';
      if (!sealed) {
        switchTab('account');
        toast('أنشئ اسم مستخدم وكلمة مرور لتدخل بهما من أي جهاز.', 'ok');
      }
    } catch (err) {
      $('#authError').textContent = err.message;
    } finally {
      $('#authBtn').disabled = false;
    }
  });

  $('#logout').addEventListener('click', () => {
    if (dirty && !confirm('لديك تغييرات غير محفوظة. هل تريد الخروج دون حفظ؟')) return;
    gh = { ...gh, token: '' };
    writeSettings({ owner: gh.owner, repo: gh.repo, branch: gh.branch });
    setDirty(false);
    showAuth();
  });

  // ---------- app shell ----------

  async function loadApp() {
    content = await loadContent(gh.branch);
    normalize(content);
    $('#auth').hidden = true;
    $('#app').hidden = false;
    $('#repoName').textContent = `${gh.owner}/${gh.repo}`;
    setDirty(false);
    renderTabs();
    render();
  }

  function normalize(c) {
    c.site = c.site || {};
    c.hero = c.hero || {};
    c.about = c.about || {};
    c.galleries = c.galleries || [];
    c.clients = c.clients || { items: [] };
    c.clients.items = c.clients.items || [];
    c.stats = c.stats || { items: [] };
    c.stats.items = c.stats.items || [];
    c.contact = c.contact || {};
  }

  function renderTabs() {
    const nav = $('#tabs');
    nav.replaceChildren(
      ...TABS.map((t) =>
        h('button', { type: 'button', class: t.id === current ? 'on' : '', onclick: () => switchTab(t.id) }, ico(t.icon), h('span', { text: t.label }))
      )
    );
  }

  function switchTab(id) {
    current = id;
    renderTabs();
    render();
    scrollTo({ top: 0, behavior: 'smooth' });
  }

  function render() {
    const tab = TABS.find((t) => t.id === current);
    $('#tabTitle').textContent = tab.label;
    $('#tabHint').textContent = tab.hint;
    const view = $('#view');
    view.replaceChildren(...VIEWS[current]());
  }

  function setDirty(v) {
    dirty = v;
    $('#save').disabled = !v;
    $('#save').classList.toggle('dirty', v);
    $('#save').textContent = v ? 'حفظ التغييرات' : 'محفوظ';
  }
  const touch = () => setDirty(true);

  let saving = false;
  async function save() {
    if (!dirty || saving) return;
    saving = true;
    $('#save').disabled = true;
    $('#save').textContent = 'جارٍ الحفظ…';
    try {
      await commitContent('تحديث المحتوى من لوحة التحكم');
      setDirty(false);
      toast('تم الحفظ. يظهر التحديث على الموقع خلال دقيقة تقريبًا.', 'ok');
    } catch (err) {
      setDirty(true);
      toast(err.message, 'err');
    } finally {
      saving = false;
    }
  }
  $('#save').addEventListener('click', save);
  addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      save();
    }
  });
  addEventListener('beforeunload', (e) => {
    if (dirty) e.preventDefault();
  });

  // ---------- uploads ----------

  function pickFiles(multiple, accept = 'image/*') {
    return new Promise((resolve) => {
      const input = $('#filePicker');
      input.multiple = multiple;
      input.accept = accept;
      input.value = '';
      input.onchange = () => resolve([...input.files]);
      input.click();
    });
  }

  // Files go to GitHub straight away as blobs; they join the site with the next save.
  async function uploadOne(file, onProgress) {
    const ext = EXT[file.type];
    if (!ext) throw new Error('نوع الملف غير مدعوم');
    const limit = file.type.startsWith('video/') ? MAX_VIDEO : MAX_IMAGE;
    if (file.size > limit) throw new Error(`حجم الملف أكبر من ${limit / 1024 / 1024} ميجابايت`);
    const blob = await ghUpload({ content: await toBase64(file), encoding: 'base64' }, onProgress);
    const path = `uploads/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    pending.set(path, blob.sha);
    previews.set(path, URL.createObjectURL(file));
    return path;
  }

  async function uploadFiles(files, kind = 'image') {
    const noun = kind === 'video' ? ['الفيديو', 'فيديوهات'] : ['الصورة', 'صور'];
    const valid = files.filter((f) => f.type.startsWith(`${kind}/`));
    if (valid.length < files.length) toast(`تم تجاهل ملفات ليست ${noun[1]}`, 'err');
    if (!valid.length) return [];
    const progress = h('div', { class: 'toast' });
    $('#toasts').append(progress);
    const urls = [];
    for (const [i, file] of valid.entries()) {
      const label = valid.length > 1 ? `جارٍ رفع ${noun[1]} ${i + 1} من ${valid.length}` : `جارٍ رفع ${noun[0]}`;
      progress.textContent = `${label}…`;
      try {
        urls.push(await uploadOne(file, (p) => (progress.textContent = `${label}… ${Math.round(p * 100)}%`)));
      } catch (err) {
        toast(`${file.name}: ${err.message}`, 'err');
      }
    }
    progress.remove();
    if (urls.length) toast(urls.length > 1 ? `تم رفع ${urls.length} ${noun[1]}` : `تم رفع ${noun[0]}`, 'ok');
    return urls;
  }

  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');

  // ---------- field builders ----------

  function field(label, control, hint) {
    return h('div', { class: 'field' }, h('label', { text: label }), control, hint && h('span', { class: 'hint', text: hint }));
  }

  function text(label, obj, key, opts = {}) {
    const input = opts.multiline ? h('textarea', { rows: opts.rows || 6 }) : h('input', { type: opts.type || 'text' });
    input.value = obj[key] ?? '';
    if (opts.placeholder) input.placeholder = opts.placeholder;
    if (opts.ltr) input.classList.add('ltr');
    input.addEventListener('input', () => {
      obj[key] = opts.type === 'number' ? Number(input.value) || 0 : input.value;
      touch();
      opts.onInput && opts.onInput(input.value);
    });
    return field(label, input, opts.hint);
  }

  function image(label, obj, key, hint) {
    const img = h('img', { alt: '' });
    if (obj[key]) img.src = mediaUrl(obj[key]);
    const replace = async (files) => {
      const [url] = await uploadFiles(files);
      if (!url) return;
      obj[key] = url;
      img.src = mediaUrl(url);
      touch();
    };
    const prev = h('div', { class: 'img-prev', title: 'اضغط لتغيير الصورة', onclick: async () => replace(await pickFiles(false)) }, img);
    prev.addEventListener('dragover', (e) => hasFiles(e) && e.preventDefault());
    prev.addEventListener('drop', (e) => {
      e.preventDefault();
      replace([...e.dataTransfer.files].slice(0, 1));
    });
    return field(
      label,
      h(
        'div',
        { class: 'img-field' },
        prev,
        h(
          'div',
          { class: 'stack' },
          h('button', { type: 'button', class: 'btn btn-sm', onclick: async () => replace(await pickFiles(false)) }, ico('upload'), 'رفع صورة جديدة'),
          hint && h('span', { class: 'hint', text: hint })
        )
      )
    );
  }

  function panel(title, actions, ...body) {
    return h('section', { class: 'panel' }, h('div', { class: 'panel-head' }, h('h2', { text: title }), actions && h('div', { class: 'panel-actions' }, actions)), ...body);
  }

  function move(list, from, to) {
    if (to < 0 || to >= list.length || from === to) return false;
    const [item] = list.splice(from, 1);
    list.splice(to, 0, item);
    return true;
  }

  // Grid of media items (images or videos) with upload, replace, reorder
  // (drag or arrows) and delete.
  function itemsEditor(list, opts) {
    const kind = opts.kind || 'image';
    const accept = `${kind}/*`;
    const noun = kind === 'video' ? 'الفيديوهات' : 'الصور';
    const wrap = h('div', { class: 'field' });
    let dragFrom = null;
    const thumbOf = opts.thumb || ((item) => h('img', { src: mediaUrl(item[opts.imageKey]), alt: '' }));

    const draw = () => {
      const grid = h('div', { class: `items ${opts.variant || ''}` });
      if (!list.length) grid.append(h('div', { class: 'empty', text: `لا توجد عناصر بعد. أضف ${noun} من المربع أدناه.` }));
      list.forEach((item, i) => {
        const replace = async () => {
          const [url] = await uploadFiles(await pickFiles(false, accept), kind);
          if (!url) return;
          item[opts.imageKey] = url;
          touch();
          draw();
        };
        const card = h(
          'div',
          { class: 'item', draggable: 'true' },
          h(
            'div',
            { class: 'item-thumb', ondblclick: replace },
            thumbOf(item),
            h(
              'div',
              { class: 'item-tools' },
              h(
                'div',
                {},
                h('button', { type: 'button', class: 'icon-btn', title: 'تقديم', onclick: () => move(list, i, i - 1) && (touch(), draw()) }, ico('chevronR')),
                h('button', { type: 'button', class: 'icon-btn', title: 'تأخير', onclick: () => move(list, i, i + 1) && (touch(), draw()) }, ico('chevronL'))
              ),
              h(
                'div',
                {},
                opts.tools && opts.tools(item, draw),
                h('button', { type: 'button', class: 'icon-btn', title: kind === 'video' ? 'استبدال ملف الفيديو' : 'تبديل الصورة', onclick: replace }, ico('refresh')),
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'icon-btn danger',
                    title: 'حذف',
                    onclick: () => {
                      if (!confirm('هل تريد حذف هذا العنصر؟')) return;
                      list.splice(i, 1);
                      touch();
                      draw();
                    },
                  },
                  ico('trash')
                )
              )
            ),
            h('span', { class: 'item-num', text: i + 1 })
          ),
          (() => {
            const input = h('input', { type: 'text', placeholder: opts.textPlaceholder });
            input.value = item[opts.textKey] || '';
            input.addEventListener('input', () => {
              item[opts.textKey] = input.value;
              touch();
            });
            return input;
          })(),
          opts.fields && opts.fields(item, draw)
        );
        card.addEventListener('dragstart', (e) => {
          dragFrom = i;
          card.classList.add('dragging');
          e.dataTransfer.effectAllowed = 'move';
        });
        card.addEventListener('dragend', () => {
          dragFrom = null;
          card.classList.remove('dragging');
        });
        card.addEventListener('dragover', (e) => {
          if (dragFrom == null) return;
          e.preventDefault();
          card.classList.add('drop-target');
        });
        card.addEventListener('dragleave', () => card.classList.remove('drop-target'));
        card.addEventListener('drop', (e) => {
          if (dragFrom == null) return;
          e.preventDefault();
          if (move(list, dragFrom, i)) {
            touch();
            draw();
          }
        });
        grid.append(card);
      });

      const add = async (files) => {
        const urls = await uploadFiles(files, kind);
        if (!urls.length) return;
        urls.forEach((url) => list.push(opts.make(url)));
        touch();
        draw();
      };
      const drop = h(
        'div',
        { class: 'drop', onclick: async () => add(await pickFiles(true, accept)) },
        ico('upload'),
        h('strong', { text: opts.addLabel }),
        h('span', { text: opts.dropHint || `اضغط هنا أو اسحب ${noun} وأفلتها، ويمكنك اختيار أكثر من ملف` })
      );
      drop.addEventListener('dragover', (e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        drop.classList.add('over');
      });
      drop.addEventListener('dragleave', () => drop.classList.remove('over'));
      drop.addEventListener('drop', (e) => {
        e.preventDefault();
        drop.classList.remove('over');
        add([...e.dataTransfer.files]);
      });
      wrap.replaceChildren(grid, drop, ...(opts.after ? [opts.after(draw)] : []));
    };
    draw();
    return wrap;
  }

  // Preview for a video item: its cover, the uploaded clip, or the link's platform.
  function videoThumb(item) {
    const link = parseVideoLink(item.link);
    if (item.poster) return h('img', { src: mediaUrl(item.poster), alt: '' });
    if (item.video) return h('video', { src: `${mediaUrl(item.video)}#t=0.1`, muted: true, preload: 'metadata', playsinline: true });
    if (link && link.thumb) return h('img', { src: link.thumb, alt: '' });
    return h('div', { class: 'item-ph', html: icon(link ? (link.platform === 'link' ? 'link' : link.platform) : 'video') });
  }

  // Video items carry either an uploaded file or a pasted link, plus an optional cover image.
  function videosEditor(list) {
    return itemsEditor(list, {
      kind: 'video',
      variant: 'tall',
      imageKey: 'video',
      textKey: 'caption',
      textPlaceholder: 'عنوان الفيديو (اختياري)',
      addLabel: 'رفع فيديوهات من جهازك',
      dropHint: 'بصيغة MP4 أو MOV أو WEBM، وبحد أقصى 70 ميجابايت للملف، وللفيديوهات الأكبر استخدم الروابط',
      thumb: videoThumb,
      make: (url) => ({ id: uid(), video: url, link: '', poster: '', caption: '' }),
      tools: (item, draw) =>
        h(
          'button',
          {
            type: 'button',
            class: 'icon-btn',
            title: item.poster ? 'تغيير صورة الغلاف' : 'إضافة صورة غلاف',
            onclick: async () => {
              const [url] = await uploadFiles(await pickFiles(false), 'image');
              if (!url) return;
              item.poster = url;
              touch();
              draw();
            },
          },
          ico('image')
        ),
      fields: (item, draw) => {
        const parts = [];
        if (item.video) parts.push(h('span', { class: 'item-note', text: 'فيديو مرفوع من جهازك' }));
        else {
          const input = h('input', { type: 'url', class: 'ltr', placeholder: 'رابط الفيديو' });
          input.value = item.link || '';
          input.addEventListener('change', () => {
            item.link = input.value.trim();
            touch();
            draw();
          });
          parts.push(input);
        }
        if (item.poster) {
          parts.push(
            h('button', {
              type: 'button',
              class: 'btn btn-sm btn-ghost',
              text: 'إزالة صورة الغلاف',
              onclick: () => {
                item.poster = '';
                touch();
                draw();
              },
            })
          );
        }
        return parts;
      },
      after: (draw) => {
        const input = h('input', { type: 'url', class: 'ltr', placeholder: 'https://www.instagram.com/reel/…' });
        const addLink = () => {
          const url = input.value.trim();
          if (!parseVideoLink(url)) return toast('الصق رابطًا يبدأ بـ https://', 'err');
          list.push({ id: uid(), video: '', link: url, poster: '', caption: '' });
          touch();
          draw();
          toast('تمت إضافة الرابط', 'ok');
        };
        input.addEventListener('keydown', (e) => e.key === 'Enter' && (e.preventDefault(), addLink()));
        return field(
          'أو أضف رابط فيديو',
          h('div', { class: 'link-row' }, input, h('button', { type: 'button', class: 'btn', onclick: addLink }, ico('link'), 'إضافة الرابط')),
          'تدعم روابط إنستغرام وتيك توك ويوتيوب (بما فيها Shorts) وVimeo. لا تظهر صورة تلقائية لروابط إنستغرام وتيك توك، لذا يُفضّل إضافة صورة غلاف من زر الصورة على البطاقة.'
        );
      },
    });
  }

  // Writing samples: headline, short excerpt for the card, and the full text.
  function textsEditor(list) {
    const wrap = h('div', { class: 'panel-wrap' });
    const draw = () => {
      wrap.replaceChildren(
        ...(list.length ? [] : [h('div', { class: 'empty', text: 'لا توجد نصوص بعد. أضف النموذج الأول.' })]),
        ...list.map((item, i) =>
          h(
            'div',
            { class: 'text-item' },
            h(
              'div',
              { class: 'panel-head' },
              h('strong', { text: `${i + 1}. ${item.headline || 'نص جديد'}` }),
              h(
                'div',
                { class: 'panel-actions' },
                h('button', { type: 'button', class: 'icon-btn', title: 'نقل للأعلى', onclick: () => move(list, i, i - 1) && (touch(), draw()) }, ico('up')),
                h('button', { type: 'button', class: 'icon-btn', title: 'نقل للأسفل', onclick: () => move(list, i, i + 1) && (touch(), draw()) }, ico('down')),
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'icon-btn danger',
                    title: 'حذف',
                    onclick: () => {
                      if (!confirm('هل تريد حذف هذا النص؟')) return;
                      list.splice(i, 1);
                      touch();
                      draw();
                    },
                  },
                  ico('trash')
                )
              )
            ),
            h('div', { class: 'grid-2' }, text('العنوان الرئيسي للنص', item, 'headline'), text('النوع', item, 'tag', { placeholder: 'إعلان، نص فيديو، حملة بريد إلكتروني' })),
            text('مقتطف يظهر على البطاقة', item, 'excerpt', { multiline: true, rows: 2, hint: 'سطران أو ثلاثة أسطر على الأكثر' }),
            text('النص الكامل', item, 'body', { multiline: true, rows: 7, hint: 'يظهر عند الضغط على «اقرأ النص كاملًا». افصل بين الفقرات بسطر فارغ.' }),
            h('div', { class: 'grid-2' }, text('العميل', item, 'client', { placeholder: 'اسم العميل أو المجال' }), text('النتيجة (اختياري)', item, 'result', { placeholder: 'زيادة المبيعات 40%' }))
          )
        ),
        h(
          'div',
          {},
          h(
            'button',
            {
              type: 'button',
              class: 'btn',
              onclick: () => {
                list.push({ id: uid(), tag: '', headline: '', excerpt: '', body: '', client: '', result: '' });
                touch();
                draw();
              },
            },
            ico('plus'),
            'إضافة نص جديد'
          )
        )
      );
    };
    draw();
    return wrap;
  }

  // ---------- views ----------

  const VIEWS = {
    hero() {
      const { site, hero } = content;
      return [
        panel(
          'العنوان الرئيسي',
          null,
          h('div', { class: 'grid-2' }, text('السطر الأول (أبيض)', hero, 'line1'), text('السطر الثاني (ملوّن)', hero, 'line2', { hint: 'يمكنك مدّ الكلمة بحرف المدّ «ـ»، مثل: الفـــرق' })),
          text('نص الزر', hero, 'cta', { placeholder: 'أعمالي' })
        ),
        panel(
          'البيانات الشخصية',
          null,
          h('div', { class: 'grid-2' }, text('الاسم', site, 'name'), text('المسمّى الوظيفي', site, 'role', { placeholder: 'كاتب محتوى إعلاني' }))
        ),
        panel(
          'الصور',
          null,
          h(
            'div',
            { class: 'grid-2' },
            image('الصورة الرئيسية', hero, 'avatar', 'يُفضّل أن تكون بصيغة PNG وبخلفية شفافة، وتظهر في وسط الصفحة'),
            image('الصورة المصغّرة في الشريط العلوي', site, 'logo', 'تظهر بجانب الاسم أعلى الصفحة')
          )
        ),
      ];
    },

    works() {
      const list = content.galleries;
      const sections = list.map((g, gi) => {
        const layoutSeg = h(
          'div',
          { class: 'seg' },
          [
            ['slider', 'شرائح أفقية'],
            ['stage', 'عرض ثلاثي الأبعاد'],
          ].map(([val, label]) =>
            h('button', {
              type: 'button',
              class: g.layout === val ? 'on' : '',
              text: label,
              onclick: () => {
                g.layout = val;
                touch();
                render();
              },
            })
          )
        );
        const actions = [
          h('button', { type: 'button', class: 'btn btn-sm', title: 'نقل للأعلى', onclick: () => move(list, gi, gi - 1) && (touch(), render()) }, ico('up')),
          h('button', { type: 'button', class: 'btn btn-sm', title: 'نقل للأسفل', onclick: () => move(list, gi, gi + 1) && (touch(), render()) }, ico('down')),
          h(
            'button',
            {
              type: 'button',
              class: 'btn btn-sm btn-danger',
              onclick: () => {
                if (!confirm(`هل تريد حذف القسم «${g.subtitle || g.title}» بجميع محتوياته؟`)) return;
                list.splice(gi, 1);
                touch();
                render();
              },
            },
            ico('trash'),
            'حذف القسم'
          ),
        ];
        const type = SECTION_TYPES[g.layout] ? g.layout : 'slider';
        let body;
        if (type === 'videos') body = videosEditor(g.items);
        else if (type === 'texts') body = textsEditor(g.items);
        else {
          body = [
            field('طريقة العرض', layoutSeg),
            itemsEditor(g.items, {
              variant: g.layout === 'stage' ? 'wide' : '',
              imageKey: 'image',
              textKey: 'caption',
              textPlaceholder: 'وصف (اختياري)',
              addLabel: 'إضافة صور لهذا القسم',
              make: (url) => ({ id: uid(), image: url, caption: '' }),
            }),
          ];
        }
        return panel(
          `${SECTION_TYPES[type].label} — ${g.subtitle || g.title || `القسم ${gi + 1}`}`,
          actions,
          h('div', { class: 'grid-2' }, text('العنوان', g, 'title'), text('العنوان الفرعي', g, 'subtitle')),
          body
        );
      });
      const addButtons = Object.entries(SECTION_TYPES)
        .filter(([key]) => key !== 'stage')
        .map(([key, t]) =>
          h(
            'button',
            {
              type: 'button',
              class: 'btn',
              onclick: () => {
                list.push({ id: uid(), title: t.title, subtitle: '', layout: key, items: [] });
                touch();
                render();
                setTimeout(() => scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 50);
              },
            },
            ico('plus'),
            `قسم ${t.label} جديد`
          )
        );
      return [...sections, h('div', { class: 'panel-actions' }, addButtons)];
    },

    about() {
      const a = content.about;
      return [
        panel(
          'النبذة',
          null,
          h('div', { class: 'grid-2' }, text('العنوان الصغير', a, 'label', { placeholder: 'نبذة' }), text('العنوان الكبير', a, 'title', { placeholder: content.site.name || 'اسمك', hint: 'اتركه فارغًا ليظهر الاسم' })),
          text('النص', a, 'text', { multiline: true, rows: 9, hint: 'افصل بين الفقرات بسطر فارغ' })
        ),
        panel('الصورة الشخصية', null, image('الصورة', a, 'photo', 'صورة طولية تظهر داخل إطار ملوّن')),
      ];
    },

    clients() {
      const c = content.clients;
      return [
        panel('عنوان القسم', null, h('div', { class: 'grid-2' }, text('العنوان', c, 'title', { placeholder: 'عملائي' }), text('العنوان الفرعي', c, 'subtitle'))),
        panel(
          `الشعارات (${c.items.length})`,
          null,
          itemsEditor(c.items, {
            variant: 'logos',
            imageKey: 'logo',
            textKey: 'name',
            textPlaceholder: 'اسم العميل',
            addLabel: 'إضافة شعارات',
            make: (url) => ({ id: uid(), name: '', logo: url }),
          }),
          h('span', { class: 'hint muted', text: 'يُفضّل استخدام شعارات بصيغة PNG أو SVG وبخلفية شفافة. تظهر الشعارات باللون الرمادي، وتتلوّن عند تمرير المؤشر عليها.' })
        ),
      ];
    },

    stats() {
      const s = content.stats;
      const rows = h('div', { class: 'panel-wrap' });
      const draw = () => {
        rows.replaceChildren(
          ...(s.items.length ? [] : [h('div', { class: 'empty', text: 'لا توجد أرقام بعد. أضف رقمًا جديدًا.' })]),
          ...s.items.map((item, i) =>
            h(
              'div',
              { class: 'stat-row' },
              field(
                'الأيقونة',
                h(
                  'div',
                  { class: 'icon-pick' },
                  STAT_ICONS.map((name) =>
                    h('button', {
                      type: 'button',
                      class: item.icon === name ? 'on' : '',
                      html: icon(name),
                      onclick: () => {
                        item.icon = name;
                        touch();
                        draw();
                      },
                    })
                  )
                )
              ),
              text('قبل الرقم', item, 'prefix', { placeholder: '+', ltr: true }),
              text('الرقم', item, 'value', { type: 'number', ltr: true }),
              text('الوصف', item, 'label', { placeholder: 'مشروع' }),
              h(
                'div',
                { class: 'panel-actions' },
                h('button', { type: 'button', class: 'icon-btn', title: 'نقل للأعلى', onclick: () => move(s.items, i, i - 1) && (touch(), draw()) }, ico('up')),
                h('button', { type: 'button', class: 'icon-btn', title: 'نقل للأسفل', onclick: () => move(s.items, i, i + 1) && (touch(), draw()) }, ico('down')),
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'icon-btn danger',
                    title: 'حذف',
                    onclick: () => {
                      s.items.splice(i, 1);
                      touch();
                      draw();
                    },
                  },
                  ico('trash')
                )
              )
            )
          )
        );
      };
      draw();
      return [
        panel('عنوان القسم', null, text('العنوان', s, 'title', { placeholder: 'إنجازاتي' })),
        panel(
          'الأرقام',
          [
            h(
              'button',
              {
                type: 'button',
                class: 'btn btn-sm',
                onclick: () => {
                  s.items.push({ id: uid(), icon: 'star', prefix: '+', value: 0, label: '' });
                  touch();
                  draw();
                },
              },
              ico('plus'),
              'إضافة رقم'
            ),
          ],
          rows
        ),
      ];
    },

    settings() {
      const { site, contact } = content;
      const colorInput = h('input', { type: 'color', value: site.accent || '#8b5cf6', title: 'لون مخصص' });
      const swatches = h('div', { class: 'swatches' });
      const drawSwatches = () =>
        swatches.replaceChildren(
          ...ACCENTS.map((c) =>
            h('button', {
              type: 'button',
              class: site.accent === c ? 'on' : '',
              style: `background:${c}`,
              title: c,
              onclick: () => {
                site.accent = c;
                colorInput.value = c;
                touch();
                drawSwatches();
              },
            })
          ),
          colorInput
        );
      colorInput.addEventListener('input', () => {
        site.accent = colorInput.value;
        touch();
        drawSwatches();
      });
      drawSwatches();
      return [
        panel(
          'المظهر',
          null,
          field('اللون الأساسي للموقع', swatches, 'يُطبَّق على الأزرار والعناوين والتأثيرات'),
          text('عنوان تبويب المتصفح', site, 'title', { placeholder: 'معرض الأعمال' })
        ),
        panel(
          'قسم «تواصل معي» في نهاية الصفحة',
          null,
          text('العنوان', contact, 'ctaTitle', { placeholder: 'هل لديك مشروع يحتاج إلى محتوى مؤثر؟', hint: 'اتركه فارغًا لإخفاء القسم' }),
          text('النص', contact, 'ctaText', { multiline: true, rows: 2 }),
          text('نص الزر', contact, 'ctaButton', { placeholder: 'تواصل معي', hint: 'يفتح الزر واتساب، وإن لم يتوفر فالبريد الإلكتروني، وإلا فحساب إنستغرام' })
        ),
        panel(
          'روابط التواصل',
          null,
          h(
            'div',
            { class: 'grid-2' },
            text('حساب إنستغرام', contact, 'instagram', { placeholder: '@username', ltr: true }),
            text('رابط إنستغرام', contact, 'instagramUrl', { placeholder: 'https://instagram.com/username', ltr: true, type: 'url' }),
            text('رقم واتساب', contact, 'whatsapp', { placeholder: '9665xxxxxxxx', ltr: true, hint: 'بالصيغة الدولية، دون علامة + أو أصفار في البداية' }),
            text('البريد الإلكتروني', contact, 'email', { placeholder: 'you@example.com', ltr: true, type: 'email' }),
            text('رابط Behance', contact, 'behance', { placeholder: 'https://behance.net/…', ltr: true, type: 'url' }),
            text('نص التذييل', contact, 'footer', { placeholder: 'جميع الحقوق محفوظة' })
          ),
          h('span', { class: 'hint muted', text: 'لا يظهر في الموقع أي حقل يُترك فارغًا.' })
        ),
      ];
    },

    account() {
      const info = h(
        'div',
        { class: 'grid-2' },
        field('الحساب', h('div', { class: 'readout ltr', text: gh.owner })),
        field('المستودع', h('div', { class: 'readout ltr', text: `${gh.repo} (${gh.branch})` }))
      );
      const repoLink = h('a', { class: 'btn btn-sm', href: `https://github.com/${gh.owner}/${gh.repo}`, target: '_blank', rel: 'noopener' }, 'فتح المستودع على GitHub');

      const list = h('div', { class: 'backups' }, h('div', { class: 'empty', text: 'جارٍ التحميل…' }));
      ghApi(`/commits?path=${encodeURIComponent(CONTENT_PATH)}&sha=${encodeURIComponent(gh.branch)}&per_page=30`)
        .then((commits) => {
          list.replaceChildren(
            ...(commits.length ? [] : [h('div', { class: 'empty', text: 'لا توجد نسخ سابقة بعد.' })]),
            ...commits.map((c, i) => {
              const date = new Date(c.commit.author.date).toLocaleString('ar', { dateStyle: 'medium', timeStyle: 'short' });
              return h(
                'div',
                { class: 'backup' },
                h('span', { text: i === 0 ? `${date} (الحالية)` : date }),
                i === 0
                  ? null
                  : h(
                      'button',
                      {
                        type: 'button',
                        class: 'btn btn-sm',
                        onclick: async () => {
                          if (dirty && !confirm('لديك تغييرات غير محفوظة ستُستبدل بهذه النسخة. هل تريد المتابعة؟')) return;
                          try {
                            const older = await loadContent(c.sha);
                            const tree = await treeOf(c.commit.tree.sha);
                            // Files this version used may have been removed since; bring them back on save.
                            recovered = new Map(
                              [...tree].filter(([p]) => p.startsWith(`${SITE_DIR}/uploads/`)).map(([p, sha]) => [p.slice(SITE_DIR.length + 1), sha])
                            );
                            content = older;
                            normalize(content);
                            setDirty(true);
                            toast('تم تحميل النسخة. اضغط «حفظ التغييرات» لاعتمادها على الموقع.', 'ok');
                          } catch (err) {
                            toast(err.message, 'err');
                          }
                        },
                      },
                      ico('refresh'),
                      'استرجاع'
                    )
              );
            })
          );
        })
        .catch((err) => list.replaceChildren(h('div', { class: 'empty', text: err.message })));

      const userIn = h('input', { type: 'text', class: 'ltr', autocomplete: 'username' });
      const passIn = h('input', { type: 'password', autocomplete: 'new-password' });
      const pass2In = h('input', { type: 'password', autocomplete: 'new-password' });
      const status = h('span', { class: 'hint muted' });
      const drawStatus = () =>
        (status.textContent = sealed
          ? 'بيانات الدخول مُنشأة. يمكنك تغييرها من هنا في أي وقت.'
          : 'لم تُنشأ بيانات دخول بعد. أنشئها الآن لتدخل لوحة التحكم من أي جهاز باسم المستخدم وكلمة المرور فقط.');
      drawStatus();
      if (!sealed) fetchSealed().then((s) => ((sealed = s), drawStatus()));
      const saveLogin = h(
        'button',
        {
          type: 'button',
          class: 'btn btn-primary',
          onclick: async () => {
            const user = userIn.value.trim();
            if (user.length < 3) return toast('يجب ألا يقل اسم المستخدم عن ثلاثة أحرف', 'err');
            if (passIn.value.length < 8) return toast('يجب ألا تقل كلمة المرور عن ثمانية أحرف', 'err');
            if (passIn.value !== pass2In.value) return toast('كلمتا المرور غير متطابقتين', 'err');
            saveLogin.disabled = true;
            try {
              const box = await sealLogin(user, passIn.value);
              await putFile(LOGIN_PATH, `${JSON.stringify(box, null, 2)}\n`, sealed ? 'تغيير بيانات الدخول' : 'إنشاء بيانات الدخول');
              sealed = box;
              passIn.value = pass2In.value = '';
              drawStatus();
              toast('تم الحفظ. يمكنك الآن الدخول من أي جهاز باسم المستخدم وكلمة المرور.', 'ok');
            } catch (err) {
              toast(err.message, 'err');
            } finally {
              saveLogin.disabled = false;
            }
          },
        },
        'حفظ بيانات الدخول'
      );

      return [
        panel(
          'اسم المستخدم وكلمة المرور',
          null,
          status,
          h('div', { class: 'grid-3' }, field('اسم المستخدم', userIn), field('كلمة المرور', passIn, 'ثمانية أحرف على الأقل'), field('تأكيد كلمة المرور', pass2In)),
          h('span', { class: 'hint muted', text: 'اختر كلمة مرور قوية لا تستخدمها في أي مكان آخر، لأنها تحمي صلاحية تعديل موقعك.' }),
          h('div', {}, saveLogin)
        ),
        panel('الربط مع GitHub', [repoLink], info),
        panel(
          'النسخ السابقة',
          null,
          h('span', { class: 'hint muted', text: 'كل عملية حفظ تُسجَّل نسخةً مستقلة في GitHub، ويمكنك استعادة أي نسخة سابقة من هنا (آخر 30 نسخة).' }),
          list
        ),
      ];
    },
  };

  // ---------- boot ----------

  $('#authLogo').innerHTML = icon('pen');
  $('#setupLogo').innerHTML = icon('pen');
  $('#sideLogo').innerHTML = icon('pen');

  if (gh && gh.token) loadApp().catch((err) => showAuth(err.message));
  else showAuth();
})();
