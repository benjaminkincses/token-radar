/* Offline snapshot explorer. All data strings enter the DOM through textContent. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const data = window.RADAR;
  if (!data || !Array.isArray(data.rows)) {
    $('load-error').hidden = false;
    $('listing').hidden = true;
    return;
  }
  const valid = (n) => typeof n === 'number' && Number.isFinite(n);
  const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const full = (n) => valid(n) ? usd.format(n) : 'Unknown';
  const money = (n) => {
    if (!valid(n)) return '—';
    for (const [size, suffix] of [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']]) {
      if (Math.abs(n) >= size) return '$' + (n / size).toFixed(2) + suffix;
    }
    return usd.format(n);
  };
  const pct = (n) => valid(n) ? (n > 0 ? '+' : '') + n.toFixed(2) + '%' : '—';
  const mult = (n) => valid(n) ? n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '') + '×' : '—';
  const compareSlug = (a, b) => a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
  function node(tag, text, className) {
    const el = document.createElement(tag);
    if (text !== undefined && text !== null) el.textContent = String(text);
    if (className) el.className = className;
    return el;
  }
  const state = { view: 'board', query: '', category: '', chain: '', watchlist: false, sort: 'implied', scale: 1, growth: 0.6, selected: null, scroll: 0, tableScroll: 0 };

  // Preserve unrelated query parameters and the anchor when copying view state.
  // Some local-file browser contexts disallow history edits; rendering still works.
  function syncUrl() {
    const url = new URL(window.location.href);
    const values = {
      q: state.query, cat: state.category, chain: state.chain,
      watchlist: state.watchlist ? '1' : '', sort: state.sort,
      view: state.view, detail: state.selected ?? '',
    };
    for (const [key, value] of Object.entries(values)) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    if (url.href === window.location.href) return;
    try {
      window.history.replaceState(window.history.state, '', url.href);
    } catch (error) {
      if (error.name !== 'SecurityError') throw error;
    }
  }

  // Compact radar-2 data omits base and plans. Derive them from the same snapshot
  // fields; richer data can supply these directly without changing this view.
  const source = data.rows.map((r) => ({
    ...r,
    chains: Array.isArray(r.chains) ? r.chains : [],
    base_usd: valid(r.base_usd) ? r.base_usd : r.tvl_usd * r.category_multiple,
  }));
  const live = (Array.isArray(data.live) ? data.live : []).map((r, i) => ({
    ...r, rank: r.rank ?? i + 1,
    ratio: r.ratio !== undefined ? r.ratio : valid(r.mcap_usd) && r.tvl_usd > 0 ? r.mcap_usd / r.tvl_usd : null,
  }));
  let ranked = [];
  function recalculate() {
    ranked = source.map((r) => {
      const growth = Math.max(0.45, 1 + Math.min(150, Math.max(-50, r.change_7d ?? 0)) / 100 * state.growth);
      const implied = Math.round(r.base_usd * state.scale * growth * r.maturity_multiplier * r.breadth_multiplier);
      return { ...r, growth_multiplier: growth, implied_value_usd: implied, band_low_usd: Math.round(implied * 0.5), band_high_usd: Math.round(implied * 1.8) };
    }).sort((a, b) => b.implied_value_usd - a.implied_value_usd || compareSlug(a, b));
    ranked.forEach((r, i) => { r.rank = i + 1; });
    renderStats();
    if (state.selected !== null) renderDetail();
    else renderTable();
  }
  function renderStats() {
    const count = ranked.length;
    const middle = Math.floor(count / 2);
    const median = count ? count % 2 ? ranked[middle].implied_value_usd : (ranked[middle - 1].implied_value_usd + ranked[middle].implied_value_usd) / 2 : 0;
    const metrics = [
      ['Protocols ranked', String(count), 'pre-token'],
      ['Watchlist covered', String(ranked.filter((r) => r.watchlist).length), 'protocols'],
      ['Combined implied value', money(ranked.reduce((sum, r) => sum + r.implied_value_usd, 0)), 'USD'],
      ['Median implied value', money(median), 'USD'],
    ];
    $('stats').replaceChildren(...metrics.map(([label, value, suffix]) => {
      const card = node('div', null, 'stat');
      const number = node('div', value, 'stat-value');
      number.append(node('small', suffix));
      card.append(node('div', label, 'stat-label'), number);
      return card;
    }));
  }
  function fillOptions(id, values, label) {
    const select = $(id);
    const first = node('option', label);
    first.value = '';
    select.replaceChildren(first);
    [...new Set(values)].sort().forEach((value) => {
      const option = node('option', value);
      option.value = value;
      select.append(option);
    });
  }
  function filteredRows() {
    const query = state.query.trim().toLowerCase();
    const rows = ranked.filter((r) => (!query || r.name.toLowerCase().includes(query) || r.slug.toLowerCase().includes(query))
      && (!state.category || (r.category ?? 'Uncategorized') === state.category)
      && (!state.chain || r.chains.includes(state.chain))
      && (!state.watchlist || r.watchlist));
    const value = (r) => state.sort === 'tvl' ? r.tvl_usd : state.sort === 'change' ? r.change_7d : state.sort === 'age' ? r.age_days : r.implied_value_usd;
    return rows.sort((a, b) => {
      if (state.sort === 'name') return a.name.localeCompare(b.name) || compareSlug(a, b);
      const x = value(a), y = value(b);
      if (!valid(x) || !valid(y)) return (valid(x) ? -1 : valid(y) ? 1 : 0) || compareSlug(a, b);
      return (state.sort === 'age' ? x - y : y - x) || compareSlug(a, b);
    });
  }
  function cell(row, text, className, title) {
    const td = node('td', text, className);
    if (title) td.title = title;
    row.append(td);
    return td;
  }
  function protocolCell(tr, r, clickable) {
    const td = cell(tr);
    const wrap = node('div', null, 'protocol-cell');
    const info = node('div');
    const line = node('div');
    const name = node(clickable ? 'button' : 'span', r.name, 'protocol-name');
    if (clickable) {
      name.type = 'button';
      name.setAttribute('aria-label', 'Inspect ' + r.name);
      // The table row handles the bubbled click, including keyboard button activation.
    }
    line.append(name);
    if (r.watchlist) line.append(node('span', 'watchlist', 'tag watch-tag'));
    info.append(line, node('div', r.symbol || r.slug, 'slug'));
    wrap.append(node('span', r.name.slice(0, 2).toUpperCase(), 'avatar'), info);
    td.append(wrap);
  }
  function tableHeader(labels) {
    const tr = node('tr');
    labels.forEach(([text, numeric]) => {
      const th = node('th', text, numeric ? 'number' : '');
      th.scope = 'col';
      tr.append(th);
    });
    $('table-head').replaceChildren(tr);
  }
  function renderTable() {
    const isLive = state.view === 'live';
    const rows = isLive ? live : filteredRows();
    $('controls').hidden = isLive;
    $('listing-title').textContent = isLive ? 'Already in the market' : 'Pre-token radar';
    $('view-description').textContent = isLive ? 'Tokenized peers from the same snapshot. Market cap is an observed value, not an implied FDV; use these ratios as context.' : 'Ranked by implied token value. Select a protocol to inspect its model and farm plan.';
    $('show-board').setAttribute('aria-pressed', String(!isLive));
    $('show-live').setAttribute('aria-pressed', String(isLive));
    $('result-count').textContent = isLive ? rows.length + ' live protocols' : rows.length + ' of ' + ranked.length + ' protocols';
    const hints = { implied: 'highest implied value first', tvl: 'highest TVL first', change: 'highest growth first', age: 'youngest first', name: 'A–Z' };
    $('table-hint').textContent = isLive ? 'USD · observed market values' : 'USD · ' + hints[state.sort];
    tableHeader(isLive
      ? [['#'], ['Protocol'], ['Category'], ['Market cap', true], ['TVL', true], ['Mcap / TVL', true]]
      : [['#'], ['Protocol'], ['Category'], ['Chains'], ['TVL', true], ['7d change', true], ['Implied value', true], ['Low–high band', true]]);
    const fragment = document.createDocumentFragment();
    rows.forEach((r) => {
      const tr = node('tr');
      if (!isLive) tr.dataset.slug = r.slug;
      cell(tr, String(r.rank).padStart(2, '0'), 'rank' + (r.rank <= 3 ? ' top-rank' : ''));
      protocolCell(tr, r, !isLive);
      cell(tr, r.category ?? 'Uncategorized', 'category-cell');
      if (isLive) {
        cell(tr, money(r.mcap_usd), 'number implied', full(r.mcap_usd));
        cell(tr, money(r.tvl_usd), 'number', full(r.tvl_usd));
        cell(tr, valid(r.ratio) ? '$' + r.ratio.toFixed(2) : '—', 'number', 'Market cap per $1 of TVL');
      } else {
        const chains = cell(tr);
        const tags = node('div', null, 'chain-tags');
        r.chains.slice(0, 2).forEach((chain) => tags.append(node('span', chain, 'chain-tag')));
        if (r.chains.length > 2) tags.append(node('span', '+' + (r.chains.length - 2), 'chain-tag'));
        chains.title = r.chains.join(', ');
        chains.append(r.chains.length ? tags : node('span', '—', 'muted'));
        cell(tr, money(r.tvl_usd), 'number', full(r.tvl_usd));
        cell(tr, pct(r.change_7d), 'number ' + (r.change_7d > 0 ? 'positive' : r.change_7d < 0 ? 'negative' : 'muted'));
        cell(tr, money(r.implied_value_usd), 'number implied', full(r.implied_value_usd));
        cell(tr, money(r.band_low_usd) + ' – ' + money(r.band_high_usd), 'number band', full(r.band_low_usd) + ' – ' + full(r.band_high_usd));
      }
      fragment.append(tr);
    });
    $('table-body').replaceChildren(fragment);
    $('empty').hidden = rows.length !== 0;
    $('protocol-table').hidden = rows.length === 0;
  }

  // The fallback matches radar-2's seven steps; supplied farm_steps always win.
  function farmPlan(p) {
    if (Array.isArray(p.farm_steps)) return p.farm_steps;
    const capital = p.tvl_usd >= 5e9 ? 250 : p.tvl_usd >= 1e9 ? 150 : p.tvl_usd >= 1e8 ? 100 : 50;
    const hold = p.age_days == null ? 45 : p.age_days < 180 ? 60 : p.age_days < 365 ? 45 : 30;
    const app = p.name + ' on ' + (p.chains[0] || 'its main chain');
    const secondPool = `Provide $25 to a second pool in the same ${p.name} app.`;
    const vote = `Vote on a governance proposal in the same ${p.name} app.`;
    let main = `Deposit $${capital} of USDC into ${app} and keep the position open.`;
    let weekly = 'Each week, repeat a small deposit in the app.';
    let second = secondPool;
    switch (p.category) {
      case 'Lending': case 'CDP':
        main = `Supply $${capital} of USDC to ${app} and keep the position open.`;
        weekly = 'Each week, borrow a small amount against the position or repay and re-supply.';
        second = `Borrow a small amount against the position in the same ${p.name} app.`; break;
      case 'Dexs':
        main = `Provide $${capital} of liquidity to the main pool in ${app}.`;
        weekly = 'Each week, swap a small amount in the app.'; break;
      case 'Derivatives': case 'Perpetuals':
        main = `Deposit $${capital} of margin into ${app} and open one small hedge.`;
        weekly = 'Each week, adjust the small hedge in the app.'; second = vote; break;
      case 'Yield': case 'Yield Aggregator': case 'Risk Curators': case 'Onchain Capital Allocator': case 'Liquidity Manager':
        main = `Deposit $${capital} into a vault in ${app}.`;
        weekly = 'Each week, deposit a small top-up or claim and restake rewards.'; break;
      case 'RWA':
        main = `Mint $${capital} of the yield asset through ${app} and hold it.`;
        weekly = 'Each week, check the yield asset redemption window.'; second = vote; break;
      case 'Chain':
        main = `Bridge $${capital} of funds into ${app} and use two native apps.`;
        weekly = 'Each week, make one transaction in a native app.'; break;
      case 'Basis Trading':
        main = `Deposit $${capital} of USDC into the basis vault in ${app}.`;
        weekly = 'Each week, top up the basis vault with $10 of USDC.'; break;
      case 'Staking Pool':
        main = `Stake $${capital} of the chain asset through ${app}.`;
        weekly = 'Each week, restake the staking rewards.'; second = vote; break;
      case 'Farm':
        main = `Deposit $${capital} into the farm pool in ${app}.`;
        weekly = 'Each week, harvest and restake the farm rewards.'; break;
    }
    return [
      ['Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', 'free to create the wallet', '5 minutes'],
      [main, `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`, '15 minutes to set up'],
      [weekly, p.category === 'Basis Trading' ? '$10 of capital plus about $2 of gas a week' : 'about $2 of gas a week plus any small action amount', '10 minutes a week'],
      [`Hold the position for ${hold} days to span multiple activity snapshots; follow the exit rule if the token launches sooner.`, `the $${capital} stays in the position`, `${hold} days`],
      [p.chains.length >= 2 ? `Bridge a smaller amount of $25 to ${p.chains[1]} and use it in ${p.name}.` : second, p.chains.length >= 2 ? '$25 of capital plus about $5 in bridge fees and gas' : 'up to $25 of capital plus about $2 of gas', '15 minutes'],
      [`Check ${p.name}'s own points or rewards page and claim only from links the protocol publishes. Never pay to claim.`, 'no fee to check, and never pay to claim', '10 minutes'],
      [`Keep a farm log of the wallet, dates and transactions. Set an exit rule: withdraw when the token launches or the position has run ${hold * 2} days (2x the ${hold}-day hold window), whichever comes first.`, 'free to log; allow about $4 of gas to withdraw', '5 minutes to log and 10 minutes to exit'],
    ].map(([text, cost, time]) => {
      const s = `${text} Cost: ${cost}. Time: ${time}.`;
      return s.length > 600 ? s.slice(0, 596) + '...' : s;
    });
  }
  function renderDetail() {
    const r = ranked.find((row) => row.slug === state.selected);
    if (!r) return;
    const detail = $('detail');
    const back = node('button', '← Back to radar', 'back-button');
    back.type = 'button';
    back.addEventListener('click', closeDetail);
    const heading = node('div', null, 'detail-heading');
    const title = node('div');
    const h = node('h2', r.name);
    h.id = 'detail-title'; h.tabIndex = -1;
    title.append(node('p', 'Protocol / ' + r.slug, 'eyebrow'), h);
    heading.append(node('span', r.name.slice(0, 2).toUpperCase(), 'avatar'), title, node('span', r.watchlist ? 'WATCHLIST PROTOCOL' : 'EARLY RADAR', 'tag'));
    const facts = node('dl', null, 'panel detail-facts');
    const values = [
      ['Global rank', '#' + r.rank + ' of ' + ranked.length], ['Category', r.category ?? 'Uncategorized'],
      ['TVL', full(r.tvl_usd)], ['7d change', pct(r.change_7d)],
      ['Listed', r.listed_at ?? 'Unknown'], ['Age', valid(r.age_days) ? r.age_days + ' days' : 'Unknown · model uses 300 days'],
      ['Chains', r.chains.join(', ') || 'Not specified'], ['Status', 'Pre-token'],
    ];
    values.forEach(([label, value]) => {
      const fact = node('div', null, 'fact');
      fact.append(node('dt', label), node('dd', value)); facts.append(fact);
    });
    const grid = node('div', null, 'detail-grid');
    const model = node('article', null, 'panel detail-card');
    model.append(node('p', 'Show the arithmetic', 'eyebrow amber'), node('h3', 'Valuation breakdown'), node('p', 'Current sandbox settings · ' + data.model_version, 'small muted'));
    const breakdown = node('dl', null, 'breakdown');
    [
      ['TVL', full(r.tvl_usd)], ['Category multiple', mult(r.category_multiple)], ['Base · TVL × category', full(r.base_usd)],
      ['Value scale', mult(state.scale)], ['Growth multiplier', mult(r.growth_multiplier)],
      ['Maturity multiplier', mult(r.maturity_multiplier)], ['Breadth multiplier', mult(r.breadth_multiplier)],
      ['Implied value', full(r.implied_value_usd)], ['Low band · 0.5×', full(r.band_low_usd)], ['High band · 1.8×', full(r.band_high_usd)],
    ].forEach(([label, value]) => {
      const line = node('div', null, label === 'Implied value' ? 'total' : '');
      line.append(node('dt', label), node('dd', value)); breakdown.append(line);
    });
    model.append(breakdown, node('p', 'Bands are model scenarios, not statistical confidence intervals. Sandbox changes affect valuations and ranks, not the snapshot inputs.', 'detail-note'));
    const plan = node('article', null, 'panel detail-card');
    plan.append(node('p', 'A repeatable process', 'eyebrow amber'), node('h3', 'Your farm plan'), node('p', 'Actions, capital and time — derived from this protocol’s snapshot.', 'small muted'));
    const steps = node('ol', null, 'farm-plan');
    farmPlan(r).forEach((text) => steps.append(node('li', text)));
    plan.append(steps); grid.append(model, plan);
    detail.replaceChildren(back, heading, facts, grid);
  }
  function openDetail(slug) {
    if (!ranked.some((row) => row.slug === slug)) return;
    state.scroll = window.scrollY;
    state.tableScroll = $('protocol-table').parentElement.scrollLeft;
    state.selected = slug;
    $('listing').hidden = true;
    $('detail').hidden = false;
    renderDetail();
    $('detail-title').focus({ preventScroll: true });
    window.scrollTo(0, Math.max(0, $('detail').getBoundingClientRect().top + window.scrollY - document.querySelector('.header').offsetHeight - 18));
    syncUrl();
  }
  function closeDetail() {
    const slug = state.selected;
    state.selected = null;
    $('detail').hidden = true;
    $('listing').hidden = false;
    renderTable();
    const row = [...$('table-body').children].find((tr) => tr.dataset.slug === slug);
    row?.querySelector('button')?.focus({ preventScroll: true });
    $('protocol-table').parentElement.scrollLeft = state.tableScroll;
    window.scrollTo(0, state.scroll);
    syncUrl();
  }
  $('table-body').addEventListener('click', (event) => {
    const row = event.target.closest('tr[data-slug]');
    if (row) openDetail(row.dataset.slug);
  });
  for (const [id, key, eventName] of [['search', 'query', 'input'], ['category', 'category', 'change'], ['chain', 'chain', 'change'], ['sort', 'sort', 'change'], ['watchlist', 'watchlist', 'change']]) {
    $(id).addEventListener(eventName, () => {
      state[key] = id === 'watchlist' ? $(id).checked : $(id).value;
      renderTable();
      syncUrl();
    });
  }
  function updateSandbox() {
    state.scale = Number($('value-scale').value);
    state.growth = Number($('growth-weight').value);
    $('scale-output').textContent = state.scale.toFixed(2) + '×';
    $('growth-output').textContent = state.growth.toFixed(2);
    $('sandbox-status').textContent = state.scale === 1 && state.growth === 0.6 ? 'Baseline model · adjust to explore' : 'Custom scenario · values and ranks recalculated';
    recalculate();
    syncUrl();
  }
  $('value-scale').addEventListener('input', updateSandbox);
  $('growth-weight').addEventListener('input', updateSandbox);
  $('reset-model').addEventListener('click', () => {
    $('value-scale').value = '1'; $('growth-weight').value = '0.6'; updateSandbox();
  });
  $('clear-filters').addEventListener('click', () => {
    state.query = state.category = state.chain = '';
    state.watchlist = false;
    $('search').value = $('category').value = $('chain').value = '';
    $('watchlist').checked = false;
    renderTable();
    syncUrl();
  });
  for (const [id, view] of [['show-board', 'board'], ['show-live', 'live']]) {
    $(id).addEventListener('click', () => { state.view = view; renderTable(); syncUrl(); });
  }
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.selected !== null) closeDetail();
  });
  $('snapshot-label').textContent = 'Snapshot ' + data.as_of;
  $('version').textContent = data.model_version;
  $('live-count').textContent = live.length;
  $('provenance').textContent = 'Sealed snapshot dated ' + data.as_of + '. Every figure on this page comes from that snapshot; nothing is fetched live.';
  fillOptions('category', source.map((r) => r.category ?? 'Uncategorized'), 'All categories');
  fillOptions('chain', source.flatMap((r) => r.chains), 'All chains');

  // Apply validated deep-link state before any table or detail is rendered.
  // Initial navigation starts at the top; only in-session detail navigation
  // captures a board position for the back button to restore.
  window.history.scrollRestoration = 'manual';
  const params = new URL(window.location.href).searchParams;
  state.query = params.get('q') ?? '';
  state.category = source.some((r) => (r.category ?? 'Uncategorized') === params.get('cat')) ? params.get('cat') : '';
  state.chain = source.some((r) => r.chains.includes(params.get('chain'))) ? params.get('chain') : '';
  state.watchlist = params.get('watchlist') === '1';
  state.sort = ['implied', 'tvl', 'change', 'age', 'name'].includes(params.get('sort')) ? params.get('sort') : 'implied';
  state.view = params.get('view') === 'live' ? 'live' : 'board';
  state.selected = source.some((r) => r.slug === params.get('detail')) ? params.get('detail') : null;
  $('search').value = state.query;
  $('category').value = state.category;
  $('chain').value = state.chain;
  $('watchlist').checked = state.watchlist;
  $('sort').value = state.sort;
  $('listing').hidden = state.selected !== null;
  $('detail').hidden = state.selected === null;
  recalculate();
  window.scrollTo(0, 0);
  window.addEventListener('load', () => window.scrollTo(0, 0), { once: true });
})();
