(function () {
  'use strict';
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rnd = mulberry32(20260924);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const randInt = (min, max) => min + Math.floor(rnd() * (max - min + 1));
  const digits = (n) => Array.from({ length: n }, () => randInt(0, 9)).join('');
  const randDate = (fromMs, toMs) => Math.floor(fromMs + rnd() * (toMs - fromMs));
  const DAY = 24 * 60 * 60 * 1000;

  const MASTER = {
    businessTypes: ['EC', '卸売', '店舗', '法人'],
    choppleTypes: ['SEP', 'NOR', 'LTD'],
    specTypes: ['通常', '賞味切迫', '抽選'],
    saleForms: ['ピース', 'ボール', 'ケース'],
    productStatuses: ['公開', '非公開', '廃止'],
    hontenStatuses: ['公開', '非公開'],
    channels: ['本', 'd', 'd払', '地方', 'Y', '博', '生', '社', '会', '楽', '外1'],
    shops: ['EC-CUBE SHOP', 'EC-CUBE SHOP_tenant_1', 'EC-CUBE SHOP_tenant_2'],
    historyShops: ['本店', 'd店', 'd払い店', 'Yahoo店', '外部1', '外部2', '外部3']
  };

  const MAKERS = ['井村屋', 'スポミン', 'ハウス食品', 'カルビー', '明治', 'キッコーマン', 'サントリー', 'ニチレイ'];
  const CLASS1 = ['64cm × 64cm', '32mm × 32mm', 'バニラ', 'チョコ', 'ストロベリー', 'S', 'M', 'L', '1L', '500ml'];
  const CLASS2 = ['', '', 'バニラ', '64cm × 64cm', '32mm × 32mm', '6個入', '12個入', '赤', '青'];

  const NAMES = [
    { name: '井村屋つぶ入りおしるこ' },
    { name: 'スポミンもこもこファイバー　アイボリー', set: true, nf: true },
    { name: 'スポミンやわらかスポンジ　イエロー', set: true, nf: true },
    { name: 'ショコラスティックBIGパック' },
    { name: '白きくらげの杏仁風デザート' },
    { name: 'ウコンの力２本＋顆粒Ｒ' },
    { name: '彩のジェラートCUBE' },
    { name: '【SXテスト】' },
    { name: '【SX】画面レビュー' },
    { name: '北海道バターせんべい' },
    { name: '国産りんごジュース 1L' },
    { name: '有機緑茶ティーバッグ 50P' },
    { name: '讃岐うどん 3食入' },
    { name: '天然水 2L×6本', set: true },
    { name: '黒糖かりんとう' },
    { name: '鶏だしの素 顆粒' },
    { name: '濃厚チーズケーキ' },
    { name: 'ミックスナッツ 徳用' },
    { name: '炭酸水 レモン 500ml' },
    { name: 'ふんわり食パン 6枚切' },
    { name: '手延べそうめん' },
    { name: '減塩しょうゆ 1L' },
    { name: '冷凍たこ焼き 20個' },
    { name: 'キッチンペーパー 4ロール', set: true, nf: true },
    { name: '食器用洗剤 詰替', nf: true },
    { name: 'ほうじ茶ラテ スティック' },
    { name: '博多明太子 切子' },
    { name: '信州みそ 750g' },
    { name: '冷凍枝豆 500g' },
    { name: 'アイスコーヒー 無糖 1L' },
  ];

  const T_2017 = new Date(2017, 2, 7, 19, 14, 52).getTime();
  const T_BASE = new Date(2026, 8, 24, 3, 56, 17).getTime();
  const T_END = new Date(2026, 8, 30, 23, 59, 59).getTime();

  const products = NAMES.map((n, i) => {
    const id = i + 1;
    const createdAt = i < 9 ? T_BASE : randDate(T_2017, T_BASE);
    const updatedAt = rnd() < 0.3 ? createdAt : randDate(createdAt, T_END);
    const r = rnd();
    return {
      id, code: String(10000000 + id), name: n.name, isSet: !!n.set, nonFood: !!n.nf,
      jan: rnd() < 0.4 ? String(100000000000 + randInt(1, 999)) : '49' + digits(11),
      maker: rnd() < 0.35 ? pick(MAKERS) : '',
      caseQty: pick([0, 1, 6, 12, 15, 24, 30]), ballQty: pick([0, 0, 2, 4, 6]),
      pieceQty: rnd() < 0.3 ? pick([1, 2, 3, 10]) : null,
      status: r < 0.7 ? '公開' : r < 0.9 ? '非公開' : '廃止',
      createdAt, updatedAt,
    };
  });

  const variants = [];
  let varSeq = 1;
  products.forEach((p) => {
    const n = randInt(1, 4);
    for (let k = 0; k < n; k++) {
      const shop = pick(MASTER.shops);
      const publish = {};
      MASTER.channels.forEach((ch) => { publish[ch] = rnd() < 0.75; });
      variants.push({
        id: varSeq, productId: p.id, productCode: p.code, productName: p.name,
        code: shop === 'EC-CUBE SHOP' || rnd() < 0.6 ? String(100000000000 + varSeq * 7) : '',
        shop, choppleType: rnd() < 0.7 ? pick(MASTER.choppleTypes) : '',
        specType: pick(MASTER.specTypes),
        relatedGroup: pick(['関連グループA', '関連グループB', '']),
        class1: rnd() < 0.85 ? pick(CLASS1) : '', class2: pick(CLASS2),
        saleForm: pick(MASTER.saleForms), saleQty: randInt(0, 30), salePieceQty: randInt(0, 60),
        stock: rnd() < 0.35 ? 0 : randInt(1, 500), updatedAt: randDate(p.createdAt, T_END),
        publish, groupId: rnd() < 0.4 ? randInt(1, 20) : null,
      });
      varSeq++;
    }
  });

  const histories = [];
  let historySeq = 1;
  variants.forEach((v) => {
    const n = randInt(1, 3);
    for (let k = 0; k < n; k++) {
      const postedAt = randDate(T_2017, T_END);
      const prices = {};
      MASTER.historyShops.forEach(shop => { prices[shop] = randInt(10, 500) * 10; });
      histories.push({
        id: historySeq, variantId: v.id, productId: v.productId,
        historyCode: 'PH' + String(historySeq).padStart(7, '0'),
        historyName: v.productName + (rnd() < 0.4 ? '【キャンペーン】' : ''),
        offerQty: randInt(10, 1000),
        postFrom: postedAt, postTo: postedAt + randInt(7, 30) * DAY,
        saleFrom: postedAt + 1 * DAY, saleTo: postedAt + randInt(2, 14) * DAY,
        prices: prices, businessType: pick(MASTER.businessTypes),
        status: rnd() < 0.7 ? '公開' : '非公開', updatedAt: randDate(postedAt, T_END),
      });
      historySeq++;
    }
  });

  // 商品属性情報（既存データの乱数系列を変えないよう別シードで生成）
  const rndA = mulberry32(20261005);
  const pickA = (arr) => arr[Math.floor(rndA() * arr.length)];
  const intA = (min, max) => min + Math.floor(rndA() * (max - min + 1));
  const ORIGINS = ['日本（北海道）', '日本（青森県）', '日本（長野県）', '日本（静岡県）', '日本（香川県）', '日本（福岡県）', '日本', 'アメリカ', 'オーストラリア', '中国', 'タイ', 'イタリア'];
  const ORIGINS_NF = ['日本', '中国', 'ベトナム', 'タイ'];
  const INGREDIENTS = ['砂糖', '小豆', '小麦粉', '植物油脂', '食塩', '乳製品', '卵', 'でん粉', 'ぶどう糖果糖液糖', '香料', '酸味料', '寒天', 'カカオマス', 'りんご', '緑茶', '大豆', '米', 'かつお節エキス'];
  const INGREDIENTS_NF = ['パルプ', 'ポリウレタン', 'ポリエステル', '界面活性剤（アルキルエーテル硫酸エステルナトリウム）', '安定化剤', '香料'];
  const ALLERGENS = ['卵', '乳', '小麦', 'えび', 'かに', 'そば', '落花生', 'くるみ', '大豆', 'ごま', 'りんご'];
  const sampleA = (arr, min, max) => {
    const pool = arr.slice(); const out = []; const n = intA(min, Math.min(max, pool.length));
    for (let i = 0; i < n; i++) out.push(pool.splice(Math.floor(rndA() * pool.length), 1)[0]);
    return out;
  };

  const attributes = [];
  let attrSeq = 1;
  products.forEach((p) => {
    const n = intA(1, 3);
    for (let k = 0; k < n; k++) {
      const nf = p.nonFood;
      const allergens = nf ? [] : (rndA() < 0.3 ? [] : sampleA(ALLERGENS, 1, 4));
      attributes.push({
        id: attrSeq, productId: p.id, productCode: p.code, productName: p.name,
        code: 'PA' + String(attrSeq).padStart(7, '0'),
        attrNo: k + 1,
        isDefault: k === 0,
        origin: nf ? pickA(ORIGINS_NF) : pickA(ORIGINS),
        ingredients: (nf ? sampleA(INGREDIENTS_NF, 1, 3) : sampleA(INGREDIENTS, 2, 6)).join('、'),
        nutrition: nf ? null : {
          energy: intA(5, 600), protein: intA(0, 200) / 10, fat: intA(0, 300) / 10,
          carbs: intA(0, 800) / 10, salt: intA(0, 50) / 10,
        },
        allergens: allergens.join('、'),
        contamination: nf || rndA() < 0.5 ? '' : '本品製造工場では' + sampleA(ALLERGENS, 1, 3).join('・') + 'を含む製品を生産しています。',
        isLabelless: rndA() < 0.2,
      });
      attrSeq++;
    }
  });

  window.MOCK_DATA = { MASTER, products, attributes, histories, variants };
})();
