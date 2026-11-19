(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = (value) => value == null ? '—' : new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value);
  const pct = (value) => value == null ? '—' : `${value > 0 ? '+' : ''}${Number(value).toFixed(1)}%`;
  const radar = window.RADAR;
  const rows = radar && Array.isArray(radar.rows) ? radar.rows : [];
  const selected = new Set();
  let currentDetail = null;

  function convictionTone(score) { return Number(score) >= 70 ? 'high' : Number(score) >= 45 ? 'mid' : 'low'; }
  function meter(score) { const value = Math.max(0, Math.min(100, Number(score) || 0)); return `<div class="meter"><div class="meter-fill ${convictionTone(value)}" style="width:${value}%"></div></div>`; }
  function fillFilters() {
    const categories = [...new Set(rows.map(r => r.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    const chains = [...new Set(rows.flatMap(r => Array.isArray(r.chains) ? r.chains : []))].sort((a,b)=>a.localeCompare(b));
    $('category').innerHTML = '<option value="">All categories</option>' + categories.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');
    $('chain').innerHTML = '<option value="">All chains</option>' + chains.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');
  }
  function filtered() {
    const query = $('search').value.trim().toLowerCase(), category = $('category').value, chain = $('chain').value;
    const minTVL = Number($('min-tvl').value) || 0, sort = $('sort').value;
    return rows.filter(r => (!query || `${r.name} ${r.slug} ${r.category || ''} ${(r.chains || []).join(' ')}`.toLowerCase().includes(query)) && (!category || r.category === category) && (!chain || (r.chains || []).includes(chain)) && Number(r.tvl_usd) >= minTVL)
      .sort((a,b) => sort === 'conviction' ? Number(b.conviction)-Number(a.conviction) || a.rank-b.rank : sort === 'tvl' ? Number(b.tvl_usd)-Number(a.tvl_usd) || a.rank-b.rank : sort === 'name' ? String(a.name).localeCompare(String(b.name)) : Number(b.implied_value_usd)-Number(a.implied_value_usd) || a.rank-b.rank);
  }
  function topConviction() {
    const top = [...rows].sort((a,b)=>Number(b.conviction)-Number(a.conviction)||a.rank-b.rank).slice(0,5);
    $('top-conviction').innerHTML = top.length ? top.map(r=>`<article class="conviction-card" data-open="${esc(r.slug)}"><div class="card-top"><span class="rank-tag">RANK ${esc(r.rank)}</span><span class="conviction-score">${esc(r.conviction)}<small>/100</small></span></div><h3 title="${esc(r.name)}">${esc(r.name)}</h3>${meter(r.conviction)}<div class="meta"><span>${money(r.implied_value_usd)}</span><span>${esc(r.category || 'Unclassified')}</span></div></article>`).join('') : '<p class="empty">No radar rows available.</p>';
    $('top-conviction').querySelectorAll('[data-open]').forEach(el=>el.addEventListener('click',()=>openDetail(el.dataset.open)));
  }
  function renderBoard() {
    const data = filtered();
    $('result-count').textContent = data.length;
    $('no-results').hidden = data.length !== 0;
    $('board-body').innerHTML = data.map(r=>`<tr data-open="${esc(r.slug)}"><td class="rank-cell">${esc(r.rank)}</td><td class="name-cell">${esc(r.name)}<span class="protocol-sub">${esc(r.slug)}</span></td><td><div class="conviction-score">${esc(r.conviction)}<small>/100</small></div>${meter(r.conviction)}</td><td class="money">${money(r.implied_value_usd)}</td><td><span class="category-tag">${esc(r.category || 'Unclassified')}</span></td><td class="money">${money(r.tvl_usd)}</td><td class="${r.change_7d == null ? 'change-null' : Number(r.change_7d) >= 0 ? 'change-positive' : 'change-negative'}">${pct(r.change_7d)}</td><td><input class="compare-check" type="checkbox" aria-label="Select ${esc(r.name)} for comparison" data-compare="${esc(r.slug)}" ${selected.has(r.slug) ? 'checked' : ''}></td></tr>`).join('');
    $('board-body').querySelectorAll('tr[data-open]').forEach(tr=>tr.addEventListener('click', e=>{ if (!e.target.closest('[data-compare]')) openDetail(tr.dataset.open); }));
    $('board-body').querySelectorAll('[data-compare]').forEach(box=>box.addEventListener('click',e=>e.stopPropagation()));
    $('board-body').querySelectorAll('[data-compare]').forEach(box=>box.addEventListener('change',()=>toggleCompare(box.dataset.compare,box.checked)));
  }
  function toggleCompare(slug, checked) {
    if (checked && selected.size >= 2) { selected.delete([...selected][0]); }
    if (checked) selected.add(slug); else selected.delete(slug);
    updateCompareToolbar(); renderBoard();
  }
  function updateCompareToolbar() {
    $('compare-toolbar').hidden = selected.size === 0;
    $('compare-count').textContent = `${selected.size} selected`;
    $('compare-button').disabled = selected.size !== 2;
  }
  function factors(r) {
    const change = Math.max(-50,Math.min(150,Number(r.change_7d)||0));
    const breadth = Math.min(1.15,1+0.03*((r.chains||[]).length-1));
    const imminent = r.age_days == null ? .8 : r.age_days < 365 ? .75 : r.age_days <= 1095 ? 1 : r.age_days <= 1825 ? .85 : .7;
    const group = rows.filter(x=>x.category===r.category && x.category).reduce((s,x)=>s+Number(x.tvl_usd||0),0);
    const leadership = 1 + Math.min(group ? Number(r.tvl_usd)/group : 0,.5);
    const vals=[['Base',Number(r.tvl_usd)*.30],['Leadership',leadership],['Growth',1+change/100],['Imminence',imminent],['Breadth',breadth]];
    return vals.map(([name,val])=>({name,value:Number(val),label:name==='Base'?money(val):`${Number(val).toFixed(2)}×`}));
  }
  function factorHTML(r) {
    return factors(r).map(f=>`<div class="factor"><span>${f.name}</span><span class="factor-track"><i style="width:${Math.max(7,Math.min(100,Number(f.value)*55))}%"></i></span><strong>${esc(f.label)}</strong></div>`).join('');
  }
  function openDetail(slug) {
    const r=rows.find(x=>x.slug===slug); if(!r) return;
    currentDetail=slug;
    $('detail-panel').innerHTML=`<div class="detail-head"><div><div class="detail-title"><h2>${esc(r.name)}</h2><span class="rank-tag">RANK ${esc(r.rank)}</span></div><div class="detail-summary"><span>Implied value<br><strong>${money(r.implied_value_usd)}</strong></span><span>TVL<br><strong>${money(r.tvl_usd)}</strong></span><span>7d change<br><strong class="${r.change_7d==null?'change-null':Number(r.change_7d)>=0?'change-positive':'change-negative'}">${pct(r.change_7d)}</strong></span><span>Conviction<br><strong>${esc(r.conviction)}/100</strong></span><span>Age<br><strong>${r.age_days==null?'Unknown':`${Math.round(r.age_days)} days`}</strong></span></div>${meter(r.conviction)}</div><button class="button button-back" type="button" onclick="window.backToBoard()">← Back to board</button></div><div class="detail-grid"><section class="detail-block"><h3>MODEL BREAKDOWN</h3><div class="factor-list">${factorHTML(r)}</div><p class="risk-note">Conviction score: ${esc(r.conviction)}/100 · Risk: ${esc(r.risk_level||'unrated')}${r.risk_flags?.length?` · ${r.risk_flags.map(esc).join('; ')}`:''}</p></section><section class="detail-block"><h3>FARM PLAN · ${Array.isArray(r.farm_steps)?r.farm_steps.length:0} STEPS</h3><ol class="farm-list">${(r.farm_steps||[]).map(step=>`<li>${esc(step)}</li>`).join('')}</ol></section><section class="detail-block"><h3>PROTOCOL PROFILE</h3><div class="compare-row"><span>Category</span><strong>${esc(r.category||'Unclassified')}</strong></div><div class="compare-row"><span>Chains</span><strong>${esc((r.chains||[]).join(', ')||'—')}</strong></div><div class="compare-row"><span>Slug</span><strong>${esc(r.slug)}</strong></div><div class="compare-row"><span>Model position</span><strong>${esc(r.rank)} / ${rows.length}</strong></div></section></div>`;
    $('detail-panel').hidden=false;
    $('compare-panel').hidden=true;
    $('detail-panel').scrollIntoView({behavior:'smooth',block:'start'});
  }
  function backToBoard() { currentDetail=null; $('detail-panel').hidden=true; $('compare-panel').hidden=true; }
  window.backToBoard=backToBoard;
  function compare() {
    if(selected.size!==2) return;
    const pair=[...selected].map(slug=>rows.find(r=>r.slug===slug)).filter(Boolean);
    const metrics=[['Conviction',r=>`${r.conviction}/100`],['Implied value',r=>money(r.implied_value_usd)],['TVL',r=>money(r.tvl_usd)],['7d change',r=>pct(r.change_7d)],['Category',r=>r.category||'Unclassified'],['Chains',r=>(r.chains||[]).join(', ')||'—'],['Risk',r=>r.risk_level||'—']];
    $('compare-panel').innerHTML=`<div class="section-heading"><div><p class="eyebrow">SIDE BY SIDE</p><h2>Protocol comparison</h2></div><button class="button button-back" type="button" onclick="window.backToBoard()">← Back to board</button></div><div class="compare-grid">${pair.map(r=>`<article class="compare-col"><h3>${esc(r.name)}</h3>${meter(r.conviction)}${metrics.map(([label,get])=>`<div class="compare-row"><span>${label}</span><strong>${esc(get(r))}</strong></div>`).join('')}</article>`).join('')}</div>`;
    $('detail-panel').hidden=true; $('compare-panel').hidden=false; $('compare-panel').scrollIntoView({behavior:'smooth',block:'start'});
  }
  function init() {
    $('loading').hidden=true;
    $('board-container').hidden=false;
    $('as-of').textContent=radar?.as_of?`As of ${radar.as_of}`:'Snapshot unavailable';
    if(!radar || !Array.isArray(radar.rows)) { $('top-conviction').innerHTML='<p class="empty">Radar data could not be loaded.</p>'; $('no-results').hidden=false; $('no-results').textContent='No data is available. Verify the snapshot bundle.'; $('result-count').textContent='0'; return; }
    fillFilters(); topConviction(); renderBoard();
    ['search','category','chain','min-tvl','sort'].forEach(id=>$(id).addEventListener('input',renderBoard));
    $('compare-button').addEventListener('click',compare);
    $('clear-compare').addEventListener('click',()=>{selected.clear();updateCompareToolbar();renderBoard();});
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
