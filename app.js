/**
 * 商品横断検索 モック
 *
 * 検索の考え方
 *  1. 検索条件を「商品」「商品属性情報」「商品規格」のどれにかかる条件かで振り分ける
 *  2. 次の3つをすべて満たす商品をヒットとする
 *     - 商品の条件を満たす
 *     - 属性の条件がある場合、条件を満たす属性を1件以上持つ
 *     - 規格の条件がある場合、条件を満たす規格を1件以上持つ
 *  3. ヒットした商品に紐づく属性・規格を各タブに表示する
 *     （条件に直接一致した行には「一致」バッジを付ける）
 */
(function () {
  'use strict';

  const { MASTER, products, attributes, variants } = window.MOCK_DATA;

  const TAB_LABEL = { products: '商品', attributes: '商品属性情報', variants: '商品規格' };

  const state = {
    cond: {},
    hasCond: { attributes: false, variants: false },
    results: { products: [], attributes: [], variants: [] },
    linkCount: { attributes: new Map(), variants: new Map() },
    focusProductId: null,
    matchOnly: false,
    perPage: 20,
    page: { products: 1, attributes: 1, variants: 1 },
    sort: {
      products: { key: 'code', dir: 'asc' },
      attributes: { key: 'historyCode', dir: 'asc' },
      variants: { key: 'productCode', dir: 'asc' },
    },
    checked: { products: new Set(), attributes: new Set(), variants: new Set() },
  };

  // ============================================================
  // ユーティリティ
  // ============================================================
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const fmtDate = (ms) => {
    if (!ms) return '';
    const d = new Date(ms);
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}<br>` +
           `${d.getHours()}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };
  const yen = (n) => (n == null ? '' : '¥' + n.toLocaleString());
  const like = (val, q) => !q || String(val ?? '').toLowerCase().includes(q.toLowerCase());
  // カンマ区切り（, 、 空白）で複数指定 → いずれかに部分一致すればOK
  const likeAny = (val, q) => {
    if (!q) return true;
    const terms = q.split(/[,、，\s]+/).filter(Boolean);
    return terms.length === 0 || terms.some((t) => like(val, t));
  };
  const inRange = (ms, from, to) => {
    if (from && ms < new Date(from).getTime()) return false;
    if (to && ms > new Date(to).getTime()) return false;
    return true;
  };
  const groupBy = (arr, key) => arr.reduce((m, x) => {
    if (!m.has(x[key])) m.set(x[key], []);
    m.get(x[key]).push(x);
    return m;
  }, new Map());

  const attrsByProduct = groupBy(attributes, 'productId');
  const variantsByProduct = groupBy(variants, 'productId');
  const productById = new Map(products.map((p) => [p.id, p]));

  // ============================================================
  // 検索条件
  // ============================================================
  // 各条件がどのデータにかかるか（条件表示にも使う）
  const COND_DEFS = [
    { key: 'productName', id: 's-name',         label: '商品名',           scope: 'products' },
    { key: 'productCode', id: 's-code',         label: '商品コード',       scope: 'products' },
    { key: 'jan',         id: 's-jan',          label: 'JANコード',        scope: 'products' },
    { key: 'productStatus', id: 's-pstatus',    label: '公開状態（商品）', scope: 'products' },
    { key: 'pUpdFrom',    id: 's-pupd-from',    label: '更新日時（商品）から', scope: 'products' },
    { key: 'pUpdTo',      id: 's-pupd-to',      label: '更新日時（商品）まで', scope: 'products' },
    { key: 'historyCode', id: 's-history',      label: '掲載履歴コード',   scope: 'attributes' },
    { key: 'businessType', id: 's-business',    label: '業態区分',         scope: 'attributes' },
    { key: 'postFrom',    id: 's-post-from',    label: '掲載日時から',     scope: 'attributes' },
    { key: 'postTo',      id: 's-post-to',      label: '掲載日時まで',     scope: 'attributes' },
    { key: 'variantCode', id: 's-variant-code', label: '商品規格コード',   scope: 'variants' },
    { key: 'choppleType', id: 's-chopple',      label: 'ちょっぷル種別',   scope: 'variants' },
    { key: 'specType',    id: 's-spec',         label: '規格区分',         scope: 'variants' },
    { key: 'saleForm',    id: 's-saleform',     label: '販売形態',         scope: 'variants' },
    { key: 'stock',       id: null,             label: '在庫',             scope: 'variants' },
    { key: 'hontenStatus', id: 's-honten',      label: '本店公開状態',     scope: 'variants' },
    { key: 'vUpdFrom',    id: 's-vupd-from',    label: '更新日時（規格）から', scope: 'variants' },
    { key: 'vUpdTo',      id: 's-vupd-to',      label: '更新日時（規格）まで', scope: 'variants' },
  ];

  function readConditions() {
    const c = {};
    COND_DEFS.forEach((d) => {
      c[d.key] = d.id ? $('#' + d.id).value.trim() : '';
    });
    c.stock = $('input[name="s-stock"]:checked').value;
    return c;
  }

  const hasScopeCond = (c, scope) => COND_DEFS.some((d) => d.scope === scope && c[d.key]);

  function matchProduct(p, c) {
    return like(p.name, c.productName)
      && likeAny(p.code, c.productCode)
      && likeAny(p.jan, c.jan)
      && (!c.productStatus || p.status === c.productStatus)
      && inRange(p.updatedAt, c.pUpdFrom, c.pUpdTo);
  }

  function matchAttribute(a, c) {
    return likeAny(a.historyCode, c.historyCode)
      && (!c.businessType || a.businessType === c.businessType)
      && inRange(a.postedAt, c.postFrom, c.postTo);
  }

  function matchVariant(v, c) {
    const stockOk = c.stock === 'あり' ? v.stock > 0 : c.stock === 'なし' ? v.stock === 0 : true;
    const hontenOk = c.hontenStatus === '公開' ? v.publish['本']
      : c.hontenStatus === '非公開' ? !v.publish['本'] : true;
    return likeAny(v.code, c.variantCode)
      && (!c.choppleType || v.choppleType === c.choppleType)
      && (!c.specType || v.specType === c.specType)
      && (!c.saleForm || v.saleForm === c.saleForm)
      && stockOk && hontenOk
      && inRange(v.updatedAt, c.vUpdFrom, c.vUpdTo);
  }

  function runSearch() {
    const c = state.cond;
    const useAttr = hasScopeCond(c, 'attributes');
    const useVar = hasScopeCond(c, 'variants');
    state.hasCond = { attributes: useAttr, variants: useVar };

    const hitProducts = products.filter((p) => {
      if (!matchProduct(p, c)) return false;
      if (useAttr && !(attrsByProduct.get(p.id) || []).some((a) => matchAttribute(a, c))) return false;
      if (useVar && !(variantsByProduct.get(p.id) || []).some((v) => matchVariant(v, c))) return false;
      return true;
    });
    const ids = new Set(hitProducts.map((p) => p.id));

    state.results.products = hitProducts;
    state.results.attributes = attributes
      .filter((a) => ids.has(a.productId))
      .map((a) => ({ ...a, _hit: useAttr && matchAttribute(a, c) }));
    state.results.variants = variants
      .filter((v) => ids.has(v.productId))
      .map((v) => ({ ...v, _hit: useVar && matchVariant(v, c) }));

    // 商品ごとの紐づき件数
    ['attributes', 'variants'].forEach((t) => {
      const m = new Map();
      state.results[t].forEach((r) => {
        if (state.matchOnly && state.hasCond[t] && !r._hit) return;
        m.set(r.productId, (m.get(r.productId) || 0) + 1);
      });
      state.linkCount[t] = m;
    });
  }

  // ============================================================
  // 一覧の列定義
  // ============================================================
  const imgCell = () => '<div class="thumb"><i class="bi bi-image"></i></div>';
  const productLink = (r) =>
    `<a href="#" class="js-focus" data-pid="${r.productId ?? r.id}" title="この商品に紐づく情報で絞り込む">${esc(r.productName ?? r.name)}</a>`;
  const hitBadge = (r) => (r._hit ? '<span class="badge-hit">一致</span>' : '');
  const statusBadge = (s) => `<span class="status status-${esc(s)}">${esc(s)}</span>`;
  const pubGrid = (pub) => '<div class="pub-grid">' + MASTER.channels.map((ch) =>
    `<span>${esc(ch)} <span class="${pub[ch] ? 'on' : 'off'}" title="${pub[ch] ? '公開' : '非公開'}">${pub[ch] ? '◯' : '－'}</span></span>`
  ).join('') + '</div>';
  const eyeBtn = (label) =>
    `<button type="button" class="icon-btn js-mock" data-msg="${esc(label)}の詳細画面へ遷移します（モック）" aria-label="詳細"><i class="bi bi-eye"></i></button>`;

  const COLUMNS = {
    products: [
      { key: 'code', label: '商品コード', sort: true, cls: 'nowrap',
        render: (p) => (p.isSet ? '<span class="badge-set">セット品</span><br>' : '') + esc(p.code) },
      { key: '_img', label: '画像', render: imgCell },
      { key: 'name', label: '商品名', sort: true, cls: 'col-name', render: productLink },
      { key: 'jan', label: 'JANコード', sort: true },
      { key: 'maker', label: 'メーカー', cls: 'col-narrow' },
      { key: 'itf', label: 'ITFコード', cls: 'col-narrow' },
      { key: 'caseQty', label: 'ケース入数', sort: true },
      { key: 'ballQty', label: 'ボール入数', sort: true },
      { key: 'pieceQty', label: 'ピース数', sort: true },
      { key: 'createdAt', label: '登録日時', sort: true, cls: 'nowrap', render: (p) => fmtDate(p.createdAt) },
      { key: 'updatedAt', label: '更新日時', sort: true, cls: 'nowrap', render: (p) => fmtDate(p.updatedAt) },
      { key: '_links', label: '紐づき', render: (p) => {
          const a = state.linkCount.attributes.get(p.id) || 0;
          const v = state.linkCount.variants.get(p.id) || 0;
          return `<div class="link-btns">
            <button type="button" class="btn btn-outline-secondary js-goto" data-pid="${p.id}" data-goto="attributes">属性 ${a}件</button>
            <button type="button" class="btn btn-outline-secondary js-goto" data-pid="${p.id}" data-goto="variants">規格 ${v}件</button>
          </div>`;
        } },
      { key: '_actions', label: '', render: (p) => `<div class="actions">
          <button type="button" class="btn btn-primary btn-receive js-mock" data-msg="入庫登録画面へ遷移します（モック）">入庫登録</button>
          ${eyeBtn('商品')}
          <button type="button" class="icon-btn js-mock" data-msg="商品「${esc(p.name)}」を複製します（モック）" aria-label="複製"><i class="bi bi-copy"></i></button>
        </div>` },
    ],

    // ※ 商品属性情報の項目は仮
    attributes: [
      { key: 'historyCode', label: '掲載履歴コード', sort: true, cls: 'nowrap', render: (a) => esc(a.historyCode) + hitBadge(a) },
      { key: 'productCode', label: '商品コード', sort: true },
      { key: 'productName', label: '商品名', sort: true, cls: 'col-name', render: productLink },
      { key: 'shop', label: '店舗', sort: true },
      { key: 'businessType', label: '業態区分', sort: true },
      { key: 'displayName', label: '表示商品名', cls: 'col-name' },
      { key: 'catchCopy', label: 'キャッチコピー' },
      { key: 'price', label: '販売価格', sort: true, cls: 'nowrap', render: (a) => yen(a.price) },
      { key: 'taxRate', label: '税率' },
      { key: 'postedAt', label: '掲載日時', sort: true, cls: 'nowrap', render: (a) => fmtDate(a.postedAt) },
      { key: 'postEndAt', label: '掲載終了日時', sort: true, cls: 'nowrap', render: (a) => fmtDate(a.postEndAt) || '－' },
      { key: 'status', label: '公開状態', sort: true, render: (a) => statusBadge(a.status) },
      { key: 'updatedAt', label: '更新日時', sort: true, cls: 'nowrap', render: (a) => fmtDate(a.updatedAt) },
      { key: '_actions', label: '', render: () => eyeBtn('商品属性情報') },
    ],

    variants: [
      { key: 'code', label: '商品規格コード', sort: true, cls: 'nowrap',
        render: (v) => (v.code ? `<a href="#" class="js-mock" data-msg="商品規格の編集画面へ遷移します（モック）">${esc(v.code)}</a>` : '') + hitBadge(v) },
      { key: '_img', label: '画像', render: imgCell },
      { key: 'shop', label: '店舗', sort: true },
      { key: 'productName', label: '商品名', sort: true, cls: 'col-name', render: productLink },
      { key: 'choppleType', label: 'ちょっぷル種別', sort: true },
      { key: 'specType', label: '規格区分', sort: true },
      { key: 'class1', label: '規格分類1', sort: true },
      { key: 'class2', label: '規格分類2', sort: true },
      { key: 'saleForm', label: '販売形態', sort: true },
      { key: 'saleQty', label: '販売数', sort: true },
      { key: 'salePieceQty', label: '販売ピース数', sort: true },
      { key: 'stock', label: '在庫数', sort: true },
      { key: 'updatedAt', label: '更新日時', sort: true, cls: 'nowrap', render: (v) => fmtDate(v.updatedAt) },
      { key: 'publish', label: '公開状態', render: (v) => pubGrid(v.publish) },
      { key: 'groupId', label: '規格グループID', sort: true },
      { key: 'price', label: '販売価格', sort: true, cls: 'nowrap', render: (v) => yen(v.price) },
    ],
  };

  // ============================================================
  // 描画
  // ============================================================
  function visibleRows(tab) {
    let rows = state.results[tab];
    if (state.focusProductId != null) {
      rows = rows.filter((r) => (tab === 'products' ? r.id : r.productId) === state.focusProductId);
    }
    if (tab !== 'products' && state.matchOnly && state.hasCond[tab]) {
      rows = rows.filter((r) => r._hit);
    }
    const { key, dir } = state.sort[tab];
    const mul = dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = a[key], y = b[key];
      if (x === y) return 0;
      if (x == null || x === '') return 1;   // 空は常に末尾
      if (y == null || y === '') return -1;
      return (typeof x === 'number' && typeof y === 'number'
        ? x - y : String(x).localeCompare(String(y), 'ja', { numeric: true })) * mul;
    });
  }

  function pagerHtml(tab, pages) {
    const cur = state.page[tab];
    if (pages <= 1) return '';
    const item = (p, text, active = false) =>
      `<li class="page-item${active ? ' active' : ''}"><a class="page-link" href="#" data-page="${p}">${text}</a></li>`;
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
    const cols = COLUMNS[tab];
    const rows = visibleRows(tab);
    const total = rows.length;
    const pages = Math.max(1, Math.ceil(total / state.perPage));
    if (state.page[tab] > pages) state.page[tab] = pages;
    const start = (state.page[tab] - 1) * state.perPage;
    const pageRows = rows.slice(start, start + state.perPage);
    const checked = state.checked[tab];
    const allChecked = pageRows.length > 0 && pageRows.every((r) => checked.has(r.id));
    const { key: sKey, dir: sDir } = state.sort[tab];

    const thead = '<tr>' +
      `<th><input type="checkbox" class="form-check-input js-check-all" aria-label="このページをすべて選択"${allChecked ? ' checked' : ''}></th>` +
      cols.map((c) => {
        if (!c.sort) return `<th>${c.label}</th>`;
        const active = c.key === sKey;
        const ico = active && sDir === 'desc' ? 'bi-arrow-down' : 'bi-arrow-up';
        return `<th class="sortable" data-sort="${c.key}">${c.label}<i class="bi ${ico} sort-ico${active ? ' active' : ''}"></i></th>`;
      }).join('') + '</tr>';

    const tbody = pageRows.length
      ? pageRows.map((r) => `<tr class="${r._hit ? 'row-hit' : ''}">` +
          `<td><input type="checkbox" class="form-check-input js-check" data-id="${r.id}" aria-label="選択"${checked.has(r.id) ? ' checked' : ''}></td>` +
          cols.map((c) => `<td class="${c.cls || ''}">${c.render ? c.render(r) : esc(r[c.key])}</td>`).join('') +
        '</tr>').join('')
      : `<tr><td colspan="${cols.length + 1}" class="empty">条件に一致する${TAB_LABEL[tab]}はありません。検索条件を変えて検索してください。</td></tr>`;

    const info = total
      ? `全 ${total} 件中 ${start + 1}〜${Math.min(start + state.perPage, total)} 件を表示` +
        (checked.size ? `（${checked.size} 件選択中）` : '')
      : '0 件';

    pane.innerHTML = `
      <div class="pane-top">
        <div class="pane-info">${info}</div>
        <nav class="pager" aria-label="ページ送り">${pagerHtml(tab, pages)}</nav>
        <div class="pane-info" style="visibility:hidden">${info}</div>
      </div>
      <div class="table-wrap">
        <table class="table-x"><thead>${thead}</thead><tbody>${tbody}</tbody></table>
      </div>`;

    $(`#count-${tab}`).textContent = total;
  }

  function renderSummary() {
    const r = state.results;
    $('#resultSummary').innerHTML =
      `検索結果：商品<span class="num">${r.products.length}</span>件 ／ ` +
      `商品属性情報<span class="num">${r.attributes.length}</span>件 ／ ` +
      `商品規格<span class="num">${r.variants.length}</span>件`;

    const chips = COND_DEFS
      .filter((d) => state.cond[d.key])
      .map((d) => {
        let v = state.cond[d.key];
        if (/From|To$/.test(d.key)) v = v.replace('T', ' ').replace(/-/g, '/');
        return `<span class="cond-chip"><span class="scope">[${TAB_LABEL[d.scope]}]</span>${esc(d.label)}：${esc(v)}</span>`;
      });
    $('#condList').innerHTML = chips.length ? chips.join('') : '<span class="cond-chip">条件なし（全件）</span>';

    const bar = $('#focusBar');
    if (state.focusProductId != null) {
      const p = productById.get(state.focusProductId);
      bar.hidden = false;
      bar.innerHTML = `<i class="bi bi-funnel"></i>
        商品 <strong>${esc(p.code)}</strong>「${esc(p.name)}」に紐づく情報だけを表示しています
        <button type="button" class="btn btn-sm btn-outline-primary ms-auto js-unfocus">絞り込みを解除</button>`;
    } else {
      bar.hidden = true;
      bar.innerHTML = '';
    }
  }

  function renderAll() {
    renderSummary();
    ['products', 'attributes', 'variants'].forEach(renderTab);
  }

  // ============================================================
  // 操作
  // ============================================================
  function doSearch() {
    state.cond = readConditions();
    state.focusProductId = null;
    state.page = { products: 1, attributes: 1, variants: 1 };
    Object.values(state.checked).forEach((s) => s.clear());
    runSearch();
    renderAll();
  }

  function setFocus(pid) {
    state.focusProductId = pid;
    state.page = { products: 1, attributes: 1, variants: 1 };
    renderAll();
  }

  function showTab(tab) {
    bootstrap.Tab.getOrCreateInstance($(`[data-tab="${tab}"].nav-link`)).show();
  }

  function toast(msg) {
    $('#toastBody').textContent = msg;
    bootstrap.Toast.getOrCreateInstance($('#toast'), { delay: 2200 }).show();
  }

  function bindEvents() {
    $('#searchForm').addEventListener('submit', (e) => {
      e.preventDefault();
      doSearch();
      $('#results').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    $('#btnClear').addEventListener('click', () => {
      $('#searchForm').reset();
      doSearch();
    });

    $('#perPage').addEventListener('change', (e) => {
      state.perPage = Number(e.target.value);
      state.page = { products: 1, attributes: 1, variants: 1 };
      renderAll();
    });

    $('#matchOnly').addEventListener('change', (e) => {
      state.matchOnly = e.target.checked;
      runSearch();
      renderAll();
    });

    // 結果エリアのクリックはまとめて委譲
    $('#results').addEventListener('click', (e) => {
      const pane = e.target.closest('.tab-pane');
      const tab = pane && pane.dataset.tab;

      const sortTh = e.target.closest('th[data-sort]');
      if (sortTh && tab) {
        const s = state.sort[tab];
        if (s.key === sortTh.dataset.sort) s.dir = s.dir === 'asc' ? 'desc' : 'asc';
        else { s.key = sortTh.dataset.sort; s.dir = 'asc'; }
        renderTab(tab);
        return;
      }

      const pageLink = e.target.closest('[data-page]');
      if (pageLink && tab) {
        e.preventDefault();
        state.page[tab] = Number(pageLink.dataset.page);
        renderTab(tab);
        return;
      }

      const focus = e.target.closest('.js-focus');
      if (focus) {
        e.preventDefault();
        setFocus(Number(focus.dataset.pid));
        return;
      }

      const go = e.target.closest('.js-goto');
      if (go) {
        setFocus(Number(go.dataset.pid));
        showTab(go.dataset.goto);
        return;
      }

      if (e.target.closest('.js-unfocus')) {
        setFocus(null);
        return;
      }

      const mock = e.target.closest('.js-mock');
      if (mock) {
        e.preventDefault();
        toast(mock.dataset.msg);
      }
    });

    $('#results').addEventListener('change', (e) => {
      const pane = e.target.closest('.tab-pane');
      if (!pane) return;
      const tab = pane.dataset.tab;
      const set = state.checked[tab];
      if (e.target.classList.contains('js-check')) {
        const id = Number(e.target.dataset.id);
        e.target.checked ? set.add(id) : set.delete(id);
        renderTab(tab);
      } else if (e.target.classList.contains('js-check-all')) {
        $$('.js-check', pane).forEach((cb) => {
          const id = Number(cb.dataset.id);
          e.target.checked ? set.add(id) : set.delete(id);
        });
        renderTab(tab);
      }
    });
  }

  // ============================================================
  // 初期化
  // ============================================================
  function initSelects() {
    $$('select[data-master]').forEach((sel) => {
      const opts = MASTER[sel.dataset.master] || [];
      sel.innerHTML = '<option value="">選択してください</option>' +
        opts.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join('');
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initSelects();
    $$('[data-bs-toggle="tooltip"]').forEach((el) => new bootstrap.Tooltip(el));
    bindEvents();
    doSearch(); // 初期表示は全件
  });
})();
