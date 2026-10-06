(function () {
  'use strict';
  const { MASTER, products, attributes, histories, variants } = window.MOCK_DATA;
  const TABS = ['products', 'attributes', 'variants', 'histories'];
  const TAB_LABEL = { products: '商品', attributes: '商品属性情報', variants: '商品規格', histories: '掲載履歴' };
  const resetPages = () => ({ products: 1, attributes: 1, variants: 1, histories: 1 });
  const state = {
    cond: {}, hasCond: { attributes: false, histories: false, variants: false },
    histSearched: false, // 掲載履歴の条件が入ったときだけ掲載履歴テーブルを検索する
    results: { products: [], attributes: [], histories: [], variants: [] },
    linkCount: { attributes: new Map(), histories: new Map(), variants: new Map() },
    focusProductId: null, focusVariantId: null,
    matchOnly: false, perPage: 20, page: resetPages(),
    sort: { products: { key: 'code', dir: 'asc' }, attributes: { key: 'code', dir: 'asc' }, histories: { key: 'historyCode', dir: 'asc' }, variants: { key: 'code', dir: 'asc' } },
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const fmtDate = (ms) => {
    if (!ms) return '';
    const d = new Date(ms);
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}<br>${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };
  const yen = (n) => (n == null ? '' : '¥' + n.toLocaleString());
  const like = (val, q) => !q || String(val ?? '').toLowerCase().includes(q.toLowerCase());
  // コード項目：カンマ・空白区切りで複数指定、いずれかに完全一致
  const exactAny = (val, q) => {
    if (!q) return true;
    const terms = q.split(/[,、，\s]+/).filter(Boolean);
    return terms.length === 0 || terms.includes(String(val ?? ''));
  };
  const inRange = (ms, from, to) => {
    if (from && ms < new Date(from).getTime()) return false;
    if (to && ms > new Date(to).getTime()) return false;
    return true;
  };
  // 期間の重なり判定：[start, end] と 検索条件 [from, to] が1秒でも重なれば一致
  const overlaps = (start, end, from, to) => {
    if (from && end < new Date(from).getTime()) return false;
    if (to && start > new Date(to).getTime()) return false;
    return true;
  };
  const groupBy = (arr, key) => arr.reduce((m, x) => {
    if (!m.has(x[key])) m.set(x[key], []);
    m.get(x[key]).push(x);
    return m;
  }, new Map());

  const histByProduct = groupBy(histories, 'productId');
  const histByVariant = groupBy(histories, 'variantId');
  const variantsByProduct = groupBy(variants, 'productId');
  const productById = new Map(products.map((p) => [p.id, p]));
  const variantById = new Map(variants.map((v) => [v.id, v]));

  const COND_DEFS = [
    { key: 'productName', id: 's-name', label: '商品名', scope: 'products' },
    { key: 'jan', id: 's-jan', label: 'JANコード', scope: 'products' },
    { key: 'productCode', id: 's-code', label: '商品コード', scope: 'products' },
    { key: 'categories', id: null, label: 'カテゴリ', scope: 'products' },
    { key: 'maker', id: 's-maker', label: 'メーカー', scope: 'products' },
    { key: 'pUpdFrom', id: 's-pupd-from', label: '更新日時から', scope: 'products' },
    { key: 'pUpdTo', id: 's-pupd-to', label: '更新日時まで', scope: 'products' },
    { key: 'variantCode', id: 's-variant-code', label: '商品規格コード', scope: 'variants' },
    { key: 'historyCode', id: 's-history', label: '掲載履歴コード', scope: 'histories' },
    { key: 'choppleType', id: 's-chopple', label: 'ちょっぷル種別', scope: 'variants' },
    { key: 'saleForm', id: 's-saleform', label: '販売形態', scope: 'variants' },
    { key: 'hontenStatus', id: 's-honten', label: '本店公開状態', scope: 'variants' },
    { key: 'specType', id: 's-spec', label: '規格区分', scope: 'variants' },
    { key: 'postFrom', id: 's-post-from', label: '掲載期間から', scope: 'histories' },
    { key: 'postTo', id: 's-post-to', label: '掲載期間まで', scope: 'histories' },
    { key: 'saleFrom', id: 's-sale-from', label: '販売期間から', scope: 'histories' },
    { key: 'saleTo', id: 's-sale-to', label: '販売期間まで', scope: 'histories' },
  ];

  /* ---------- カテゴリ（大 > 中 > 小）の選択行 ---------- */
  const CAT = MASTER.categories;
  const opt = (v, label) => `<option value="${esc(v)}">${esc(label ?? v)}</option>`;
  function catRowHtml() {
    return '<div class="cat-row">' +
      `<select class="form-select cat-l" aria-label="大カテゴリ">${opt('', '大カテゴリを選択')}${Object.keys(CAT).map((l) => opt(l)).join('')}</select>` +
      `<select class="form-select cat-m" aria-label="中カテゴリ" disabled>${opt('', '中カテゴリを選択')}</select>` +
      `<select class="form-select cat-s" aria-label="小カテゴリ" disabled>${opt('', '小カテゴリを選択')}</select>` +
      '</div>';
  }
  function resetCatRows() { $('#catRows').innerHTML = catRowHtml(); }
  function onCatChange(e) {
    const row = e.target.closest('.cat-row');
    if (!row) return;
    const l = $('.cat-l', row), m = $('.cat-m', row), s = $('.cat-s', row);
    if (e.target === l) {
      const mids = l.value ? Object.keys(CAT[l.value]) : [];
      m.innerHTML = opt('', '中カテゴリを選択') + mids.map((x) => opt(x)).join('');
      m.disabled = !l.value;
      s.innerHTML = opt('', '小カテゴリを選択'); s.disabled = true;
    } else if (e.target === m) {
      const smalls = m.value ? CAT[l.value][m.value] : [];
      s.innerHTML = opt('', '小カテゴリを選択') + smalls.map((x) => opt(x)).join('');
      s.disabled = !m.value;
    }
  }
  function readCategories() {
    return $$('#catRows .cat-row')
      .map((row) => ({ l: $('.cat-l', row).value, m: $('.cat-m', row).value, s: $('.cat-s', row).value }))
      .filter((c) => c.l);
  }
  const catLabel = (c) => [c.l, c.m, c.s].filter(Boolean).join(' > ');

  function readConditions() {
    const c = {};
    COND_DEFS.forEach((d) => { if (d.id) c[d.key] = $('#' + d.id).value.trim(); });
    const cats = readCategories();
    c.categories = cats.length ? cats : '';
    return c;
  }
  const hasScopeCond = (c, scope) => COND_DEFS.some((d) => d.scope === scope && c[d.key]);

  // カテゴリ条件は複数行のいずれかに一致すれば OK（OR）。中・小は未選択なら上位カテゴリ配下すべて
  const matchCategory = (p, cats) => !cats || cats.some((c) => p.catL === c.l && (!c.m || p.catM === c.m) && (!c.s || p.catS === c.s));
  function matchProduct(p, c) {
    return like(p.name, c.productName) && exactAny(p.jan, c.jan) && exactAny(p.code, c.productCode) &&
      matchCategory(p, c.categories) && like(p.maker, c.maker) && inRange(p.updatedAt, c.pUpdFrom, c.pUpdTo);
  }
  function matchHistory(h, c) {
    return exactAny(h.historyCode, c.historyCode) && overlaps(h.postFrom, h.postTo, c.postFrom, c.postTo) && overlaps(h.saleFrom, h.saleTo, c.saleFrom, c.saleTo);
  }
  function matchVariant(v, c) {
    const hontenOk = c.hontenStatus === '公開' ? v.publish['本'] : c.hontenStatus === '非公開' ? !v.publish['本'] : true;
    return exactAny(v.code, c.variantCode) && (!c.choppleType || v.choppleType === c.choppleType) && (!c.specType || v.specType === c.specType) && (!c.saleForm || v.saleForm === c.saleForm) && hontenOk;
  }

  function runSearch() {
    const c = state.cond;
    const useHist = hasScopeCond(c, 'histories');
    const useVar = hasScopeCond(c, 'variants');
    state.hasCond = { attributes: false, histories: useHist, variants: useVar };
    state.histSearched = useHist;

    if (useHist) {
      // 掲載履歴を検索したとき：条件に一致した掲載履歴を起点に、紐づく商品・属性・規格だけを表示する
      const hitHist = histories.filter((h) => matchHistory(h, c) &&
        matchProduct(productById.get(h.productId), c) &&
        (!useVar || matchVariant(variantById.get(h.variantId), c)));
      const pids = new Set(hitHist.map((h) => h.productId));
      const vids = new Set(hitHist.map((h) => h.variantId));
      state.results.products = products.filter((p) => pids.has(p.id));
      state.results.attributes = attributes.filter((a) => pids.has(a.productId));
      state.results.variants = variants.filter((v) => vids.has(v.id)).map((v) => ({ ...v, _hit: true }));
      state.results.histories = hitHist.map((h) => ({ ...h, _hit: true }));
    } else {
      const hitProducts = products.filter((p) => {
        if (!matchProduct(p, c)) return false;
        if (useVar && !(variantsByProduct.get(p.id) || []).some((v) => matchVariant(v, c))) return false;
        return true;
      });
      const ids = new Set(hitProducts.map((p) => p.id));
      state.results.products = hitProducts;
      state.results.attributes = attributes.filter((a) => ids.has(a.productId));
      state.results.variants = variants.filter((v) => ids.has(v.productId)).map((v) => ({ ...v, _hit: useVar && matchVariant(v, c) }));
      state.results.histories = [];
    }

    const count = (rows, key, skip) => rows.reduce((m, r) => (skip(r) ? m : m.set(r[key], (m.get(r[key]) || 0) + 1)), new Map());
    state.linkCount.attributes = count(state.results.attributes, 'productId', () => false);
    state.linkCount.variants = count(state.results.variants, 'productId', (r) => state.matchOnly && state.hasCond.variants && !r._hit);
    state.linkCount.histories = count(state.results.histories, 'variantId', (r) => state.matchOnly && state.hasCond.histories && !r._hit);
  }

  const imgCell = () => '<div class="thumb"><i class="bi bi-image"></i></div>';
  // 掲載履歴を検索したときは表示行がすべて条件一致なので「一致」バッジは出さない
  const showHit = (r) => r._hit && !state.histSearched;
  const hitBadge = (r) => (showHit(r) ? '<span class="badge-hit">一致</span>' : '');
  const statusBadge = (s) => `<span class="status status-${esc(s)}">${esc(s)}</span>`;
  const pubGrid = (pub) => '<div class="pub-grid">' + MASTER.channels.map((ch) => `<span>${esc(ch)} <span class="${pub[ch] ? 'on' : 'off'}">${pub[ch] ? '◯' : '－'}</span></span>`).join('') + '</div>';
  const eyeBtn = (label) => `<button type="button" class="icon-btn js-mock" data-msg="${esc(label)}の詳細画面へ"><i class="bi bi-eye"></i></button>`;
  const priceGrid = (prices) => {
    const keys = ['本店', 'd店', 'd払い店', 'Yahoo店', '外部1', '外部2', '外部3'];
    return '<div class="price-grid">' + keys.map((k) => `<div><span class="price-label">${esc(k)}</span><br>${yen(prices[k])}</div>`).join('') + '</div>';
  };
  const goProductBtn = (pid) => `<button type="button" class="btn btn-outline-secondary js-goto" data-pid="${pid}" data-goto="products">商品を表示</button>`;
  const flag = (on) => (on ? '<span class="flag-on">◯</span>' : '<span class="flag-off">－</span>');
  const textOrDash = (t) => (t ? esc(t) : '<span class="empty-val">－</span>');
  const nutritionCell = (n) => (n
    ? `<div class="nutri">エネルギー ${n.energy}kcal<br>たんぱく質 ${n.protein}g<br>脂質 ${n.fat}g<br>炭水化物 ${n.carbs}g<br>食塩相当量 ${n.salt}g</div>`
    : '<span class="flag-off">－</span>');

  const COLUMNS = {
    products: [
      { key: 'code', label: '商品コード', sort: true, cls: 'nowrap', render: (p) => (p.isSet ? '<span class="badge-set">セット品</span><br>' : '') + `<a href="#" class="js-focus" data-pid="${p.id}">${esc(p.code)}</a>` },
      { key: '_img', label: '画像', render: imgCell },
      { key: 'name', label: '商品名', sort: true, cls: 'col-name' },
      { key: 'jan', label: 'JANコード', sort: true },
      { key: 'maker', label: 'メーカー', cls: 'col-narrow' },
      { key: 'caseQty', label: 'ケース入数', sort: true },
      { key: 'ballQty', label: 'ボール入数', sort: true },
      { key: 'pieceQty', label: 'ピース数', sort: true },
      { key: 'createdAt', label: '登録日時', sort: true, cls: 'nowrap', render: (p) => fmtDate(p.createdAt) },
      { key: 'updatedAt', label: '更新日時', sort: true, cls: 'nowrap', render: (p) => fmtDate(p.updatedAt) },
      { key: '_links', label: '紐づき', render: (p) => {
          const a = state.linkCount.attributes.get(p.id) || 0;
          const v = state.linkCount.variants.get(p.id) || 0;
          return `<div class="link-btns"><button type="button" class="btn btn-outline-secondary js-goto" data-pid="${p.id}" data-goto="attributes">商品属性 ${a}件</button><button type="button" class="btn btn-outline-secondary js-goto" data-pid="${p.id}" data-goto="variants">商品規格 ${v}件</button></div>`;
        } },
      { key: '_actions', label: '', render: () => eyeBtn('商品') },
    ],
    attributes: [
      { key: 'code', label: '商品属性コード', sort: true, cls: 'nowrap' },
      { key: 'attrNo', label: '商品属性番号', sort: true },
      { key: 'isDefault', label: 'デフォルトフラグ', sort: true, render: (a) => flag(a.isDefault) },
      { key: 'origin', label: '原産国・産地', sort: true, cls: 'nowrap' },
      { key: 'ingredients', label: '原材料・成分', cls: 'col-text', render: (a) => textOrDash(a.ingredients) },
      { key: 'nutrition', label: '栄養成分情報', render: (a) => nutritionCell(a.nutrition) },
      { key: 'allergens', label: 'アレルゲン情報', cls: 'col-text', render: (a) => textOrDash(a.allergens) },
      { key: 'contamination', label: 'コンタミネーション情報', cls: 'col-text', render: (a) => textOrDash(a.contamination) },
      { key: 'isLabelless', label: 'ラベルレスフラグ', sort: true, render: (a) => flag(a.isLabelless) },
      { key: '_links', label: '紐づき', render: (a) => `<div class="link-btns">${goProductBtn(a.productId)}</div>` },
    ],
    variants: [
      { key: 'code', label: '商品規格コード', sort: true, cls: 'nowrap', render: (v) => `<a href="#" class="js-mock">${esc(v.code)}</a>` + hitBadge(v) },
      { key: '_img', label: '画像', render: imgCell },
      { key: 'name', label: '商品規格名', sort: true, cls: 'col-name' },
      { key: 'specType', label: '規格区分', sort: true },
      { key: 'saleForm', label: '販売形態', sort: true },
      { key: 'saleQty', label: '販売数', sort: true },
      { key: 'stock', label: '在庫数', sort: true },
      { key: 'publish', label: '公開状態', render: (v) => pubGrid(v.publish) },
      { key: 'updatedAt', label: '更新日時', sort: true, cls: 'nowrap', render: (v) => fmtDate(v.updatedAt) },
      { key: '_links', label: '紐づき', render: (v) => {
          const label = state.histSearched ? `掲載履歴 ${state.linkCount.histories.get(v.id) || 0}件` : '掲載履歴を表示';
          return `<div class="link-btns">${goProductBtn(v.productId)}<button type="button" class="btn btn-outline-primary js-goto" data-vid="${v.id}" data-goto="histories">${label}</button></div>`;
        } },
    ],
    histories: [
      { key: 'historyCode', label: '掲載履歴コード', sort: true, cls: 'nowrap', render: (h) => esc(h.historyCode) + hitBadge(h) },
      { key: 'historyName', label: '掲載履歴名', sort: true, cls: 'col-name' },
      { key: 'offerQty', label: '表示提供数', sort: true },
      { key: 'postFrom', label: '掲載開始日時', sort: true, cls: 'nowrap', render: (h) => fmtDate(h.postFrom) },
      { key: 'postTo', label: '掲載終了日時', sort: true, cls: 'nowrap', render: (h) => fmtDate(h.postTo) },
      { key: 'saleFrom', label: '販売開始日時', sort: true, cls: 'nowrap', render: (h) => fmtDate(h.saleFrom) },
      { key: 'saleTo', label: '販売終了日時', sort: true, cls: 'nowrap', render: (h) => fmtDate(h.saleTo) },
      { key: 'prices', label: '販売価格', render: (h) => priceGrid(h.prices) },
      { key: 'status', label: '公開状態', sort: true, render: (h) => statusBadge(h.status) },
      { key: '_links', label: '紐づき', render: (h) => `<div class="link-btns"><button type="button" class="btn btn-outline-secondary js-goto" data-vid="${h.variantId}" data-goto="variants">商品規格を表示</button></div>` },
      { key: '_actions', label: '', render: () => eyeBtn('掲載履歴') },
    ],
  };

  function baseRows(tab) {
    // 掲載履歴を検索していないときは、規格／商品で絞り込んだ分だけその場で取得する
    if (tab === 'histories' && !state.histSearched) {
      if (state.focusVariantId != null) return histByVariant.get(state.focusVariantId) || [];
      if (state.focusProductId != null) return histByProduct.get(state.focusProductId) || [];
      return [];
    }
    let rows = state.results[tab];
    if (state.focusVariantId != null) {
      // 商品規格で絞り込み中：その規格と、紐づく商品・属性・掲載履歴だけ
      const v = variantById.get(state.focusVariantId);
      rows = rows.filter((r) => (tab === 'histories' ? r.variantId === v.id
        : tab === 'variants' ? r.id === v.id
        : tab === 'products' ? r.id === v.productId
        : r.productId === v.productId));
    } else if (state.focusProductId != null) {
      rows = rows.filter((r) => (tab === 'products' ? r.id : r.productId) === state.focusProductId);
    }
    if (tab !== 'products' && state.matchOnly && state.hasCond[tab] && !state.histSearched) rows = rows.filter((r) => r._hit);
    return rows;
  }

  function visibleRows(tab) {
    const rows = baseRows(tab);
    const { key, dir } = state.sort[tab];
    const mul = dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = a[key], y = b[key];
      if (x === y) return 0;
      if (x == null || x === '') return 1;
      if (y == null || y === '') return -1;
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'ja', { numeric: true })) * mul;
    });
  }

  function pagerHtml(tab, pages) {
    const cur = state.page[tab];
    if (pages <= 1) return '';
    const item = (p, text, active = false) => `<li class="page-item${active ? ' active' : ''}"><a class="page-link" href="#" data-page="${p}">${text}</a></li>`;
    let start = Math.max(1, cur - 2);
    const end = Math.min(pages, start + 4);
    start = Math.max(1, end - 4);
    let html = '<ul class="pagination">';
    if (cur > 1) html += item(1, '最初へ') + item(cur - 1, '前へ');
    if (start > 1) html += '<li class="ellipsis">…</li>';
    for (let p = start; p <= end; p++) html += item(p, p, p === cur);
    if (end < pages) html += '<li class="ellipsis">…</li>';
    if (cur < pages) html += item(cur + 1, '次へ') + item(pages, '最後へ');
    return html + '</ul>';
  }

  function renderTab(tab) {
    const pane = $(`#pane-${tab}`);
    if (!pane) return;
    const cols = COLUMNS[tab];
    const rows = visibleRows(tab);
    const total = rows.length;
    const pages = Math.max(1, Math.ceil(total / state.perPage));
    if (state.page[tab] > pages) state.page[tab] = pages;
    const start = (state.page[tab] - 1) * state.perPage;
    const pageRows = rows.slice(start, start + state.perPage);
    const { key: sKey, dir: sDir } = state.sort[tab];

    const thead = '<tr>' + cols.map((c) => {
      if (!c.sort) return `<th>${c.label}</th>`;
      const active = c.key === sKey;
      const ico = active && sDir === 'desc' ? 'bi-arrow-down' : 'bi-arrow-up';
      return `<th class="sortable" data-sort="${c.key}">${c.label}<i class="bi ${ico} sort-ico${active ? ' active' : ''}"></i></th>`;
    }).join('') + '</tr>';

    const tbody = pageRows.length
      ? pageRows.map((r) => `<tr class="${showHit(r) ? 'row-hit' : ''}">` + cols.map((c) => `<td class="${c.cls || ''}">${c.render ? c.render(r) : esc(r[c.key])}</td>`).join('') + '</tr>').join('')
      : `<tr><td colspan="${cols.length}" class="empty">条件に一致する${TAB_LABEL[tab]}はありません。</td></tr>`;

    const info = total ? `全 ${total} 件中 ${start + 1}〜${Math.min(start + state.perPage, total)} 件を表示` : '0 件';
    pane.innerHTML = `<div class="pane-top"><div class="pane-info">${info}</div><nav class="pager">${pagerHtml(tab, pages)}</nav><div class="pane-info pane-info-spacer" aria-hidden="true">${info}</div></div><div class="table-wrap"><table class="table-x"><thead>${thead}</thead><tbody>${tbody}</tbody></table></div>`;
    $(`#count-${tab}`).textContent = total;
  }

  function renderSummary() {
    const r = state.results;
    const parts = [['商品', r.products.length], ['商品属性情報', r.attributes.length], ['商品規格', r.variants.length]];
    if (state.histSearched) parts.push(['掲載履歴', r.histories.length]);
    $('#resultSummary').innerHTML = '検索結果：' + parts.map(([l, n]) => `${l}<span class="num">${n}</span>件`).join(' ／ ');

    const chips = [];
    COND_DEFS.filter((d) => state.cond[d.key]).forEach((d) => {
      const scope = `<span class="scope">[${d.scope === 'products' ? '商品' : TAB_LABEL[d.scope]}]</span>`;
      if (d.key === 'categories') {
        state.cond.categories.forEach((c) => chips.push(`<span class="cond-chip">${scope}カテゴリ：${esc(catLabel(c))}</span>`));
        return;
      }
      let v = state.cond[d.key];
      if (/(From|To)$/.test(d.key)) v = v.replace('T', ' ').replace(/-/g, '/');
      chips.push(`<span class="cond-chip">${scope}${esc(d.label)}：${esc(v)}</span>`);
    });
    $('#condList').innerHTML = chips.length ? chips.join('') : '<span class="cond-chip">条件なし（全件）</span>';

    const bar = $('#focusBar');
    const unfocusBtn = '<button type="button" class="btn btn-sm btn-outline-primary ms-auto js-unfocus">絞り込みを解除</button>';
    if (state.focusProductId != null) {
      const p = productById.get(state.focusProductId);
      bar.hidden = false;
      bar.innerHTML = `<i class="bi bi-funnel"></i> 商品 <strong>${esc(p.code)}</strong>「${esc(p.name)}」に紐づく情報だけを表示しています ${unfocusBtn}`;
    } else if (state.focusVariantId != null) {
      const v = variantById.get(state.focusVariantId);
      bar.hidden = false;
      bar.innerHTML = `<i class="bi bi-funnel"></i> 商品規格 <strong>${esc(v.code || '（コードなし）')}</strong>「${esc(v.name)}」に紐づく情報だけを表示しています ${unfocusBtn}`;
    } else {
      bar.hidden = true; bar.innerHTML = '';
    }
  }

  function renderAll() { renderSummary(); TABS.forEach(renderTab); }

  const histTabItem = () => document.getElementById('tab-item-histories');
  const activeTab = () => ($('.result-tabs .nav-link.active') || {}).dataset?.tab;
  function showTab(tab) {
    if (tab === 'histories') histTabItem().classList.remove('d-none');
    bootstrap.Tab.getOrCreateInstance($(`[data-tab="${tab}"].nav-link`)).show();
  }
  // 掲載履歴を検索しておらず、絞り込みもないときは掲載履歴タブを隠す
  function syncHistTab() {
    const show = state.histSearched || state.focusVariantId != null || (state.focusProductId != null && !histTabItem().classList.contains('d-none'));
    if (show) { histTabItem().classList.remove('d-none'); return; }
    if (activeTab() === 'histories') showTab('variants');
    histTabItem().classList.add('d-none');
  }

  function doSearch() {
    state.cond = readConditions();
    state.focusProductId = null; state.focusVariantId = null;
    state.page = resetPages();
    runSearch();
    histTabItem().classList.toggle('d-none', !state.histSearched);
    showTab('products');
    renderAll();
  }

  function setFocus(pid) { state.focusProductId = pid; state.focusVariantId = null; state.page = resetPages(); syncHistTab(); renderAll(); }
  function setFocusVariant(vid) { state.focusVariantId = vid; state.focusProductId = null; state.page = resetPages(); renderAll(); }

  function toast(msg) { $('#toastBody').textContent = msg; bootstrap.Toast.getOrCreateInstance($('#toast'), { delay: 2200 }).show(); }

  function bindEvents() {
    $('#searchForm').addEventListener('submit', (e) => { e.preventDefault(); doSearch(); $('#results').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    $('#btnClear').addEventListener('click', () => { $('#searchForm').reset(); resetCatRows(); doSearch(); });
    $('#btnAddCat').addEventListener('click', () => $('#catRows').insertAdjacentHTML('beforeend', catRowHtml()));
    $('#catRows').addEventListener('change', onCatChange);
    $('#perPage').addEventListener('change', (e) => { state.perPage = Number(e.target.value); state.page = resetPages(); renderAll(); });
    $('#matchOnly').addEventListener('change', (e) => { state.matchOnly = e.target.checked; runSearch(); renderAll(); });

    $('#results').addEventListener('click', (e) => {
      const pane = e.target.closest('.tab-pane');
      const tab = pane && pane.dataset.tab;
      const sortTh = e.target.closest('th[data-sort]');
      if (sortTh && tab) {
        const s = state.sort[tab];
        if (s.key === sortTh.dataset.sort) s.dir = s.dir === 'asc' ? 'desc' : 'asc'; else { s.key = sortTh.dataset.sort; s.dir = 'asc'; }
        renderTab(tab); return;
      }
      const pageLink = e.target.closest('[data-page]');
      if (pageLink && tab) { e.preventDefault(); state.page[tab] = Number(pageLink.dataset.page); renderTab(tab); return; }

      const focus = e.target.closest('.js-focus');
      if (focus) { e.preventDefault(); setFocus(Number(focus.dataset.pid)); return; }

      const go = e.target.closest('.js-goto');
      if (go) {
        if (go.dataset.pid) setFocus(Number(go.dataset.pid));
        if (go.dataset.vid) setFocusVariant(Number(go.dataset.vid));
        showTab(go.dataset.goto); return;
      }

      if (e.target.closest('.js-unfocus')) { setFocus(null); return; }
      const mock = e.target.closest('.js-mock');
      if (mock) { e.preventDefault(); toast(mock.dataset.msg || 'モック画面のため遷移しません'); }
    });
  }

  function initApp() {
    $$('select[data-master]').forEach((sel) => {
      const opts = MASTER[sel.dataset.master] || [];
      sel.innerHTML = '<option value="">選択</option>' + opts.map((o) => opt(o)).join('');
    });
    resetCatRows();
    $$('[data-bs-toggle="tooltip"]').forEach((el) => new bootstrap.Tooltip(el));
    bindEvents(); doSearch();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();
