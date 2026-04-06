/* ============================================================
   釜山→阿蘇→福岡  Trip Planner  app.js
   ============================================================ */

let TRIP;
let currentCurr = 'TWD';
let currentWeek = 1;
let currentFilter = 'all';
let leafletMap, markerLayer;

// ── Load trip data (fetch first, fallback to inline) ──
async function loadData() {
  try {
    const r = await fetch('data/trip.json?v=' + Date.now());
    if (r.ok) { TRIP = await r.json(); return; }
  } catch(e) {
    console.log('fetch failed, using inline fallback:', e.message);
  }
  try {
    const el = document.getElementById('trip-data');
    if (el) {
      const txt = el.textContent.trim();
      if (txt) TRIP = JSON.parse(txt);
    }
  } catch(e) {
    console.error('Inline JSON parse failed:', e);
  }
  if (!TRIP) console.error('Failed to load trip data!');
}

// ── Currency helpers ──
function fromTWD(val, curr) {
  const R = TRIP.currency.rates;
  if (curr === 'KRW') return val * R.KRW;
  if (curr === 'JPY') return val * R.JPY;
  if (curr === 'USD') return val * R.USD;
  return val;
}
function fmtCurr(twd) {
  const v = fromTWD(twd, currentCurr);
  const sym = { TWD:'NT$', KRW:'₩', JPY:'¥', USD:'$' };
  return (sym[currentCurr] || '') + Math.round(v).toLocaleString();
}

// ── Cover page ──
function initCover() {
  const cover = document.getElementById('cover');
  const bg = document.getElementById('cover-bg');
  const input = document.getElementById('cover-file-input');
  const uploadBtn = document.getElementById('cover-upload-btn');
  const enterBtn = document.getElementById('cover-enter');

  // Restore saved photo
  const saved = localStorage.getItem('trip-cover-photo');
  if (saved) bg.style.backgroundImage = 'url(' + saved + ')';

  // Upload button
  uploadBtn.addEventListener('click', () => input.click());
  input.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const data = ev.target.result;
      bg.style.backgroundImage = 'url(' + data + ')';
      bg.style.backgroundSize = 'cover';
      bg.style.backgroundPosition = 'center';
      try { localStorage.setItem('trip-cover-photo', data); } catch(_) {}
    };
    reader.readAsDataURL(file);
  });

  // Enter app
  function enterApp() {
    cover.classList.add('cover-hidden');
    setTimeout(() => { cover.style.display = 'none'; }, 700);
  }
  enterBtn.addEventListener('click', enterApp);

  // Swipe up detection
  let touchStartY = 0;
  cover.addEventListener('touchstart', e => { touchStartY = e.touches[0].clientY; }, { passive: true });
  cover.addEventListener('touchend', e => {
    const dy = touchStartY - e.changedTouches[0].clientY;
    if (dy > 60) enterApp();
  }, { passive: true });
}

// ── Tab switching ──
const TAB_IDS = ['attractions','calendar','booking','budget','time','checklist'];

function showTab(id) {
  // If already on this tab, do nothing
  var currentPanel = document.querySelector('.tab-panel.active');
  if (currentPanel && currentPanel.id === 'tab-' + id) return;

  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-' + id).classList.add('active');
  window.scrollTo(0, 0);

  document.querySelectorAll('.sb[data-tab]').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === id));
  document.querySelectorAll('.bb[data-tab]').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === id));

  // Update More menu items active state
  document.querySelectorAll('.bb-more-item[data-tab]').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === id));

  // Highlight More button if a More-menu tab is active
  var moreBtn = document.getElementById('bb-more-btn');
  var moreTabIds = ['budget', 'checklist'];
  if (moreBtn) moreBtn.classList.toggle('has-active', moreTabIds.indexOf(id) !== -1);

  if (id === 'budget') renderBudget();
  if (id === 'attractions') renderOverviewExtras();
  if (id === 'time' && leafletMap) leafletMap.invalidateSize();
}

function initTabs() {
  document.querySelectorAll('.sb[data-tab], .bb[data-tab]').forEach(btn =>
    btn.addEventListener('click', () => showTab(btn.dataset.tab)));

  // More button toggle
  var moreBtn = document.getElementById('bb-more-btn');
  var moreMenu = document.getElementById('bb-more-menu');
  if (moreBtn && moreMenu) {
    moreBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      // Close lang menus when toggling More
      document.querySelectorAll('.lang-menu').forEach(function(m) { m.classList.remove('show'); });
      moreMenu.classList.toggle('open');
    });
    // More menu item clicks (tab switches)
    moreMenu.querySelectorAll('.bb-more-item[data-tab]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        showTab(btn.dataset.tab);
        moreMenu.classList.remove('open');
      });
    });
  }
}

// ── Leaflet Map ──
const CAT_COLORS_MAP = {
  attraction:'#e8664a', food:'#4aad5b', shopping:'#e8964a',
  cafe:'#9b6ad4', transport:'#4ab8c9', work:'#6a6ad4', hotel:'#4a7ce8'
};
// CITY_LABELS now via getCityLabel(city)

function initMap() {
  leafletMap = L.map('map', { zoomControl: true, scrollWheelZoom: true })
    .setView([34.2, 130.5], 7);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19
  }).addTo(leafletMap);

  markerLayer = L.layerGroup().addTo(leafletMap);
  renderMapMarkers('all');
}

function renderMapMarkers(filter) {
  if (!markerLayer || !TRIP) return;
  markerLayer.clearLayers();
  const bounds = [];

  TRIP.pois.filter(p => {
    if (filter === 'all') return true;
    return p.city === filter || p.cat === filter;
  }).forEach(p => {
    const col = CAT_COLORS_MAP[p.cat] || '#888';
    const marker = L.circleMarker([p.lat, p.lng], {
      radius: 9, fillColor: col, color: '#fff',
      weight: 2, fillOpacity: 0.9
    }).addTo(markerLayer);

    const mapQ = encodeURIComponent(p.nameLocal + ' ' + p.addr);
    marker.bindPopup(
      '<strong>' + p.name + '</strong>' +
      '<div class="popup-meta">' + getCityLabel(p.city) + ' · ' + p.addr + ' · ' + p.hours + '</div>' +
      '<div class="popup-meta">' + p.desc + '</div>' +
      '<a class="popup-link" href="https://www.google.com/maps/search/?api=1&query=' + mapQ + '" target="_blank">📍 Google Maps</a>'
    );

    bounds.push([p.lat, p.lng]);
  });

  if (bounds.length > 0) {
    leafletMap.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
  }
}

function focusPOI(id) {
  const p = TRIP.pois.find(x => x.id === id);
  if (!p) return;
  leafletMap.setView([p.lat, p.lng], 15);
  // Open popup
  markerLayer.eachLayer(layer => {
    if (layer.getLatLng && Math.abs(layer.getLatLng().lat - p.lat) < 0.001 &&
        Math.abs(layer.getLatLng().lng - p.lng) < 0.001) {
      layer.openPopup();
    }
  });
  // On mobile, scroll to map so user can see the pin location
  if (window.innerWidth <= 900) {
    var mapEl = document.getElementById('map');
    if (mapEl) mapEl.scrollIntoView({behavior:'smooth', block:'start'});
  }
}

// ── Google Maps import ──
function initGoogleMapsImport() {
  document.getElementById('btn-import-gmaps').addEventListener('click', () => {
    const pois = TRIP.pois.filter(p => {
      if (currentFilter === 'all') return true;
      return p.city === currentFilter || p.cat === currentFilter;
    });
    if (pois.length === 0) return;

    // Build Google Maps directions URL (max ~25 waypoints)
    const pts = pois.slice(0, 25);
    if (pts.length === 1) {
      window.open('https://www.google.com/maps/search/?api=1&query=' +
        encodeURIComponent(pts[0].nameLocal + ' ' + pts[0].addr), '_blank');
      return;
    }
    const origin = pts[0].lat + ',' + pts[0].lng;
    const dest = pts[pts.length - 1].lat + ',' + pts[pts.length - 1].lng;
    const waypoints = pts.slice(1, -1).map(p => p.lat + ',' + p.lng).join('|');
    let url = 'https://www.google.com/maps/dir/?api=1&origin=' + origin +
      '&destination=' + dest + '&travelmode=transit';
    if (waypoints) url += '&waypoints=' + waypoints;
    window.open(url, '_blank');
  });
}

// ── POI rendering ──
function renderPOIs(filter) {
  currentFilter = filter;
  const list = document.getElementById('poi-list');
  const catNames = {}; ['attraction','food','cafe','shopping','transport','work','hotel'].forEach(c => catNames[c] = getCatName(c));

  list.innerHTML = TRIP.pois.filter(p => {
    if (filter === 'all') return true;
    return p.city === filter || p.cat === filter;
  }).map(p => {
    const col = CAT_COLORS_MAP[p.cat] || '#888';
    const price = p.price_twd > 0
      ? 'NT$' + p.price_twd + (p.price_krw ? '（₩' + p.price_krw.toLocaleString() + '）' : p.price_jpy ? '（¥' + p.price_jpy.toLocaleString() + '）' : '')
      : t('lbl_free');
    const mapQ = encodeURIComponent(p.nameLocal + ' ' + p.addr);
    const searchQ = encodeURIComponent(p.nameLocal || p.name);
    const displayName = (currentLang === 'ko' || currentLang === 'ja') && p.nameLocal ? p.nameLocal : p.name;
    const localName = (currentLang === 'ko' || currentLang === 'ja') ? p.name : (p.nameLocal || '');

    return '<div class="poi" data-id="' + p.id + '">' +
      '<div class="poi-dot" style="background:' + col + '"></div>' +
      '<div class="poi-info">' +
        '<div class="poi-header">' +
          '<div class="poi-name">' + displayName + '</div>' +
          '<span class="poi-cat-badge" style="background:' + col + '20;color:' + col + '">' + (catNames[p.cat] || p.cat) + '</span>' +
        '</div>' +
        (localName ? '<div class="poi-local-name">' + localName + '</div>' : '') +
        '<div class="poi-meta"><span class="mi" style="font-size:13px">location_on</span> ' + getCityLabel(p.city) + ' · ' + p.addr + '</div>' +
        '<div class="poi-meta"><span class="mi" style="font-size:13px">schedule</span> ' + p.hours + ' · <span class="mi" style="font-size:13px">payments</span> ' + price + '</div>' +
        '<div class="poi-meta">' + p.desc + '</div>' +
      '</div>' +
    '</div>';
  }).join('');

  // Click to focus on map (no modal)
  list.querySelectorAll('.poi').forEach(el => {
    el.addEventListener('click', () => focusPOI(el.dataset.id));
  });

  // Update map markers
  renderMapMarkers(filter);
}

function initFilters() {
  document.getElementById('poi-filters').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    document.querySelectorAll('#poi-filters .chip').forEach(c => c.classList.remove('on'));
    chip.classList.add('on');
    renderPOIs(chip.dataset.filter);
  });
}

// ── Calendar ──
const CAT_COLORS_CAL = {
  attraction:{bg:'#fde8e3',text:'#a33'}, food:{bg:'#e3f5e6',text:'#2a7a36'},
  cafe:{bg:'#ede3f5',text:'#6a3a9b'}, work:{bg:'#e3e3f5',text:'#4a4a9b'},
  transport:{bg:'#e0f2f5',text:'#2a7a8a'}, shopping:{bg:'#fef3e0',text:'#9a6a1a'},
  hotel:{bg:'#e3ecf8',text:'#2a5a9b'}, other:{bg:'#f5f5f5',text:'#666'},
  personal:{bg:'#f5ede0',text:'#8a6a3a'}
};
// DAY_NAMES now via getDayNames()
const HOUR_START = 7, HOUR_END = 22;

function renderCalendar(week) {
  currentWeek = week;
  const startIdx = (week - 1) * 7;
  const days = TRIP.schedule.slice(startIdx, startIdx + 7);

  // Desktop
  const desktop = document.getElementById('cal-desktop');
  let hdr = '<div class="cal-header"><div class="cal-corner"></div>';
  days.forEach(day => {
    const d = new Date(day.date);
    const today = new Date().toISOString().slice(0, 10) === day.date;
    hdr += '<div class="cal-day-hdr' + (today ? ' today' : '') + '">' +
      getDayNames()[d.getDay()] +
      '<span class="cal-day-num">' + (d.getMonth()+1) + '/' + d.getDate() + '</span>' +
      '<span class="cal-city-tag">' + translateCity(day.city) + '</span></div>';
  });
  hdr += '</div>';

  let body = '<div class="cal-body"><div class="cal-time-col">';
  for (let h = HOUR_START; h <= HOUR_END; h++) {
    body += '<div class="cal-time-slot">' + (h < 10 ? '0' : '') + h + ':00</div>';
  }
  body += '</div>';

  days.forEach(day => {
    body += '<div class="cal-day-col">';
    day.events.forEach(ev => {
      const top = (ev.sh - HOUR_START) * 60;
      const height = Math.max((ev.eh - ev.sh) * 60, 24);
      body += '<div class="cal-ev" data-cat="' + ev.cat + '" style="top:' + top + 'px;height:' + height + 'px">' +
        '<div class="cal-ev-title">' + getEventName(ev) + '</div>' +
        (height > 30 && getEventNote(ev) ? '<div class="cal-ev-note">' + getEventNote(ev) + '</div>' : '') +
        (height > 40 && ev.restaurant ? '<div class="cal-ev-note">' + (ev.reservation === 'needed' ? '⚠️' : ev.reservation === true ? '✅' : '🍽️') + ' ' + ev.restaurant + (ev.map ? ' <a href="' + ev.map + '" target="_blank" onclick="event.stopPropagation()" style="color:inherit;text-decoration:underline">📍</a>' : '') + '</div>' : '') +
      '</div>';
    });
    body += '</div>';
  });
  body += '</div>';
  desktop.innerHTML = hdr + body;

  // Mobile — only show the current week's days (FIX: was showing all 14 days)
  const mobile = document.getElementById('cal-mobile');
  mobile.innerHTML = days.map(day => {
    const d = new Date(day.date);
    return '<div class="cal-m-day">' +
      '<div class="cal-m-date"><div class="cal-m-day-name">' + getDayNames()[d.getDay()] + '</div><div class="cal-m-day-num">' + (d.getMonth()+1) + '/' + d.getDate() + '</div><div class="cal-m-city">' + translateCity(day.city) + '</div></div>' +
      '<div class="cal-m-events">' + day.events.map(ev => {
        const c = CAT_COLORS_CAL[ev.cat] || CAT_COLORS_CAL.other;
        const hh = Math.floor(ev.sh);
        const mm = ev.sh % 1 >= 0.5 ? '30' : (ev.sh % 1 >= 0.25 ? '15' : '00');
        const timeStr = (hh < 10 ? '0' : '') + hh + ':' + mm;
        const resIcon = ev.reservation === 'needed' ? ' <span style="color:#e8664a;font-weight:600">⚠️訂位</span>' : ev.reservation === true ? ' <span style="color:#4aad5b">✅已訂</span>' : '';
        const mapLink = ev.map ? ' <a href="' + ev.map + '" target="_blank" onclick="event.stopPropagation()" style="font-size:.65rem;color:var(--cat-food);text-decoration:none">📍地圖</a>' : '';
        const restLine = ev.restaurant ? '<div class="cal-m-note" style="font-size:.62rem">🍽️ ' + ev.restaurant + mapLink + resIcon + '</div>' : '';
        return '<div class="cal-m-event"><div class="cal-m-bar" style="background:' + c.text + '"></div>' +
          '<div class="cal-m-time">' + timeStr + '</div>' +
          '<div><div class="cal-m-name">' + getEventName(ev) + '</div>' + (getEventNote(ev) ? '<div class="cal-m-note">' + getEventNote(ev) + '</div>' : '') + restLine + '</div></div>';
      }).join('') + '</div></div>';
  }).join('');
}

function initWeekPills() {
  document.getElementById('week-pills').addEventListener('click', e => {
    const pill = e.target.closest('.pill');
    if (!pill) return;
    document.querySelectorAll('#week-pills .pill').forEach(p => p.classList.remove('on'));
    pill.classList.add('on');
    renderCalendar(parseInt(pill.dataset.week));
  });
}

// ── Budget ──
let budgetCityFilter = null;
let budgetMode = 'estimated'; // 'estimated' | 'actual'

function getBudgetItemName(item) {
  if (currentLang === 'en' && item.name_en) return item.name_en;
  if (currentLang === 'ko' && item.name_ko) return item.name_ko;
  if (currentLang === 'ja' && item.name_ja) return item.name_ja;
  return item.name;
}

const budgetCatColorMap = {
  hotel:  { icon:'<span class="mi" style="font-size:14px">hotel</span>', color:'var(--cat-hotel)' },
  food:   { icon:'<span class="mi" style="font-size:14px">restaurant</span>', color:'var(--cat-food)' },
  transport:{ icon:'<span class="mi" style="font-size:14px">train</span>', color:'var(--cat-transport)' },
  attraction:{ icon:'<span class="mi" style="font-size:14px">confirmation_number</span>', color:'var(--cat-attraction)' },
  shopping:{ icon:'<span class="mi" style="font-size:14px">shopping_bag</span>', color:'var(--cat-shopping)' },
  other:  { icon:'<span class="mi" style="font-size:14px">inventory_2</span>', color:'var(--cat-other)' },
  personal:{ icon:'<span class="mi" style="font-size:14px">bedtime</span>', color:'var(--cat-personal)' }
};

function getAllActualItems() {
  var expenses = TRIP.budget.actual_expenses || [];
  var all = [];
  expenses.forEach(function(day) { day.items.forEach(function(item) { all.push(item); }); });
  return all;
}

function renderBudget() {
  var isActual = budgetMode === 'actual';

  // Update mode toggle
  document.querySelectorAll('.budget-mode-btn').forEach(function(btn) {
    btn.classList.toggle('on', btn.dataset.mode === budgetMode);
  });

  // Update total label
  document.getElementById('budget-total-label').textContent = isActual ? t('budget_actual_total') : t('stat_total');

  if (isActual) {
    renderBudgetActual();
  } else {
    renderBudgetEstimated();
  }
}

function renderBudgetEstimated() {
  var allItems = TRIP.budget.items;
  var items = budgetCityFilter ? allItems.filter(function(i) { return i.city === budgetCityFilter; }) : allItems;
  var fullTotal = allItems.reduce(function(s, i) { return s + i.cost_twd; }, 0);
  var filteredTotal = items.reduce(function(s, i) { return s + i.cost_twd; }, 0);

  // City horizontal bars
  var cities = { busan: 0, aso: 0, fukuoka: 0 };
  allItems.forEach(function(i) { cities[i.city] = (cities[i.city] || 0) + i.cost_twd; });
  document.getElementById('city-hbars').innerHTML = ['busan', 'aso', 'fukuoka'].map(function(k) {
    var label = getCityName(k);
    var active = budgetCityFilter === k;
    var dimmed = budgetCityFilter && !active;
    return '<div class="h-bar-row budget-city-hbar' + (active ? ' active' : '') + (dimmed ? ' dimmed' : '') + '" data-city="' + k + '" style="cursor:pointer">' +
      '<div class="h-bar-label">' + label + '</div>' +
      '<div class="h-bar-track"><div class="h-bar-fill" style="width:' + (fullTotal > 0 ? Math.round(cities[k] / fullTotal * 100) : 0) + '%"></div></div>' +
      '<div class="h-bar-val">' + fmtCurr(cities[k]) + '</div></div>';
  }).join('');

  // Filter indicator
  var filterLabelEl = document.getElementById('budget-filter-label');
  if (filterLabelEl) {
    if (budgetCityFilter) {
      filterLabelEl.innerHTML = t('filter_label') + '：<strong>' + getCityName(budgetCityFilter) + '</strong> <span class="budget-clear-filter" style="cursor:pointer;color:var(--text-3);font-size:.78rem;margin-left:8px;text-decoration:underline">' + t('filter_clear') + '</span>';
      filterLabelEl.style.display = '';
      var clearBtn = filterLabelEl.querySelector('.budget-clear-filter');
      if (clearBtn) clearBtn.addEventListener('click', function() { budgetCityFilter = null; renderBudget(); });
    } else {
      filterLabelEl.style.display = 'none';
    }
  }

  // Total
  document.getElementById('budget-total-val').textContent = fmtCurr(budgetCityFilter ? filteredTotal : fullTotal);
  document.getElementById('budget-total-sub').textContent = budgetCityFilter
    ? getCityName(budgetCityFilter) + ' · ' + items.length + ' ' + t('budget_items')
    : items.length + ' ' + t('budget_items');

  // Category bars
  var cats = {};
  items.forEach(function(i) { cats[i.cat] = (cats[i.cat] || 0) + i.cost_twd; });
  var maxCat = Math.max.apply(null, Object.values(cats).concat([1]));
  var catTotal = items.reduce(function(s, i) { return s + i.cost_twd; }, 0);
  document.getElementById('cat-hbars').innerHTML = Object.entries(cats).sort(function(a, b) { return b[1] - a[1]; }).map(function(entry) {
    var k = entry[0], v = entry[1];
    var info = budgetCatColorMap[k] || { icon:'📌', color:'var(--chart-bar)' };
    return '<div class="h-bar-row"><div class="h-bar-label">' + info.icon + ' ' + getCatName(k) + '</div>' +
      '<div class="h-bar-track"><div class="h-bar-fill" style="width:' + Math.round(v / maxCat * 100) + '%;background:' + info.color + '"></div></div>' +
      '<div class="h-bar-val">' + fmtCurr(v) + ' (' + (catTotal > 0 ? Math.round(v / catTotal * 100) : 0) + '%)</div></div>';
  }).join('');

  // Items list
  document.getElementById('items-list-wrap').innerHTML = '<div class="items-table-wrap"><div class="items-table-head"><span>' + t('budget_th_item') + '</span><span>' + t('budget_th_city') + '</span><span style="text-align:right">' + t('budget_th_amount') + '</span></div><div id="items-list">' +
    allItems.map(function(item) {
      var hidden = budgetCityFilter && item.city !== budgetCityFilter;
      return '<div class="item-row' + (hidden ? ' hidden' : '') + '"><div><div class="item-name">' + getBudgetItemName(item) + '</div></div><div class="item-city">' + getCityName(item.city) + '</div><div class="item-cost">' + fmtCurr(item.cost_twd) + '</div></div>';
    }).join('') + '</div></div>';

  document.getElementById('stat-total').textContent = fmtCurr(fullTotal);

  // City bar click handlers
  document.querySelectorAll('.budget-city-bar, .budget-city-hbar').forEach(function(el) {
    el.addEventListener('click', function() {
      budgetCityFilter = (budgetCityFilter === el.dataset.city) ? null : el.dataset.city;
      renderBudget();
    });
  });
}

function renderBudgetActual() {
  var expenses = TRIP.budget.actual_expenses || [];
  var purchasedItems = TRIP.budget.items.filter(function(i) { return i.purchased; });
  var dailyItems = getAllActualItems();
  var allItems = purchasedItems.concat(dailyItems);
  var fullTotal = allItems.reduce(function(s, i) { return s + i.cost_twd; }, 0);
  var purchasedTotal = purchasedItems.reduce(function(s, i) { return s + i.cost_twd; }, 0);

  // Total
  document.getElementById('budget-total-val').textContent = fmtCurr(fullTotal);
  var dayCount = expenses.length;
  document.getElementById('budget-total-sub').textContent = allItems.length + ' ' + t('budget_items');

  // City horizontal bars (from all items that have city data)
  var cities = {};
  allItems.forEach(function(i) { if (i.city) cities[i.city] = (cities[i.city] || 0) + i.cost_twd; });
  var cityHbarsEl = document.getElementById('city-hbars');
  if (cityHbarsEl) {
    cityHbarsEl.innerHTML = Object.entries(cities).sort(function(a, b) { return b[1] - a[1]; }).map(function(entry) {
      var k = entry[0], v = entry[1];
      return '<div class="h-bar-row"><div class="h-bar-label">' + getCityName(k) + '</div>' +
        '<div class="h-bar-track"><div class="h-bar-fill" style="width:' + (fullTotal > 0 ? Math.round(v / fullTotal * 100) : 0) + '%"></div></div>' +
        '<div class="h-bar-val">' + fmtCurr(v) + '</div></div>';
    }).join('');
  }

  // Category bars
  var cats = {};
  allItems.forEach(function(i) { cats[i.cat] = (cats[i.cat] || 0) + i.cost_twd; });
  var maxCat = Math.max.apply(null, Object.values(cats).concat([1]));
  document.getElementById('cat-hbars').innerHTML = Object.entries(cats).sort(function(a, b) { return b[1] - a[1]; }).map(function(entry) {
    var k = entry[0], v = entry[1];
    var info = budgetCatColorMap[k] || { icon:'📌', color:'var(--chart-bar)' };
    return '<div class="h-bar-row"><div class="h-bar-label">' + info.icon + ' ' + getCatName(k) + '</div>' +
      '<div class="h-bar-track"><div class="h-bar-fill" style="width:' + Math.round(v / maxCat * 100) + '%;background:' + info.color + '"></div></div>' +
      '<div class="h-bar-val">' + fmtCurr(v) + ' (' + (fullTotal > 0 ? Math.round(v / fullTotal * 100) : 0) + '%)</div></div>';
  }).join('');

  // Items: pre-purchased group + daily groups
  var catIconMap = { hotel:'hotel', food:'restaurant', transport:'train', attraction:'confirmation_number', shopping:'shopping_bag', other:'inventory_2' };

  function renderItemRow(item) {
    var icon = catIconMap[item.cat] || 'receipt';
    var color = (budgetCatColorMap[item.cat] || {}).color || 'var(--text-3)';
    return '<div class="item-row" style="grid-template-columns:1fr auto"><div><div class="item-name"><span class="mi" style="font-size:14px;color:' + color + ';vertical-align:middle;margin-right:4px">' + icon + '</span>' + getBudgetItemName(item) + '</div></div><div class="item-cost">' + fmtCurr(item.cost_twd) + '</div></div>';
  }

  var html = '';

  // Pre-purchased group
  if (purchasedItems.length > 0) {
    html += '<div class="items-table-wrap" style="margin-bottom:16px"><div class="items-table-head" style="grid-template-columns:1fr auto"><span>' + t('budget_prepurchased') + '</span><span style="text-align:right">' + fmtCurr(purchasedTotal) + '</span></div>' +
      purchasedItems.map(renderItemRow).join('') + '</div>';
  }

  // Daily groups
  html += expenses.map(function(day) {
    var dayTotal = day.items.reduce(function(s, i) { return s + i.cost_twd; }, 0);
    return '<div class="items-table-wrap" style="margin-bottom:16px"><div class="items-table-head" style="grid-template-columns:1fr auto"><span>' + day.date + '</span><span style="text-align:right">' + fmtCurr(dayTotal) + '</span></div>' +
      day.items.map(renderItemRow).join('') + '</div>';
  }).join('');

  document.getElementById('items-list-wrap').innerHTML = html;
  document.getElementById('stat-total').textContent = fmtCurr(TRIP.budget.items.reduce(function(s, i) { return s + i.cost_twd; }, 0));
}

function initCurrency() {
  document.getElementById('curr-switcher').addEventListener('click', e => {
    const btn = e.target.closest('.curr-btn');
    if (!btn) return;
    currentCurr = btn.dataset.curr;
    document.querySelectorAll('.curr-btn').forEach(b => b.classList.remove('on'));
    btn.classList.add('on');
    renderBudget();
  });
  document.getElementById('budget-mode-switcher').addEventListener('click', function(e) {
    var btn = e.target.closest('.budget-mode-btn');
    if (!btn || btn.dataset.mode === budgetMode) return;
    budgetMode = btn.dataset.mode;
    renderBudget();
  });
}

// ── Checklist ──
function renderChecklist() {
  var grid = document.getElementById('check-grid');
  if (!grid || !TRIP.checklist) return;

  grid.innerHTML = TRIP.checklist.map(function(group, gi) {
    var title = group.title[currentLang] || group.title.zh;
    var items = group.items.map(function(item, ii) {
      var text = item[currentLang] || item.zh;
      var id = 'check-' + gi + '-' + ii;
      var checked = localStorage.getItem(id) === '1' ? ' checked' : '';
      return '<label class="check-item' + (checked ? ' done' : '') + '"><input type="checkbox" data-check-id="' + id + '"' + checked + '> ' + text + '</label>';
    }).join('');
    return '<div class="check-group"><div class="check-group-title">' + title + '</div>' + items + '</div>';
  }).join('');

  grid.querySelectorAll('input[type="checkbox"]').forEach(function(cb) {
    cb.addEventListener('change', function() {
      localStorage.setItem(this.dataset.checkId, this.checked ? '1' : '0');
      this.closest('.check-item').classList.toggle('done', this.checked);
    });
  });
}

// ── Entry Forms (collapsible in checklist tab) ──
function renderEntryForms() {
  var container = document.getElementById('entry-forms');
  if (!container || !TRIP.entryForms) return;

  container.innerHTML = TRIP.entryForms.map(function(form) {
    var title = form.title[currentLang] || form.title.zh;
    var rows = form.fields.map(function(field) {
      var label = field.label[currentLang] || field.label.zh;
      return '<div class="entry-form-row">' +
        '<div class="entry-form-label">' + label + '</div>' +
        '<div class="entry-form-value" onclick="navigator.clipboard.writeText(\'' + field.value.replace(/'/g, "\\'") + '\');this.classList.add(\'copied\');setTimeout(()=>this.classList.remove(\'copied\'),1500)">' +
        field.value +
        '<span class="mi material-symbols-outlined" style="font-size:14px;margin-left:6px;opacity:.4">content_copy</span>' +
        '</div>' +
      '</div>';
    }).join('');
    return '<details class="entry-form-details">' +
      '<summary class="entry-form-summary">' + title +
      '<a href="' + form.url + '" target="_blank" class="entry-form-link" onclick="event.stopPropagation()">' +
      '<span class="mi material-symbols-outlined" style="font-size:16px">open_in_new</span></a>' +
      '</summary>' +
      '<div class="entry-form-content">' + rows + '</div>' +
    '</details>';
  }).join('');
}

// ── Export GeoJSON ──
function initExport() {
  document.getElementById('btn-export-geojson').addEventListener('click', () => {
    const geo = {
      type: 'FeatureCollection',
      features: TRIP.pois.map(p => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
        properties: { name: p.name, nameLocal: p.nameLocal, description: p.desc, category: p.cat }
      }))
    };
    const blob = new Blob([JSON.stringify(geo, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'trip-busan-fukuoka.geojson';
    a.click();
  });
}

// ── Flight verdict (inline badge on booked card) ──
function renderFlightIntel() {
  const fi = TRIP.flightIntel;
  const el = document.getElementById('flight-verdict-inline');
  if (!fi || !el) return;

  const pct = Math.round((fi.userPrice - fi.range.avg) / fi.range.avg * 100);
  if (pct <= -10) {
    el.className = 'booked-card-verdict good';
    el.textContent = '🟢 低於均價 ' + Math.abs(pct) + '% · 歷史區間 ' + fmtCurr(fi.range.low) + '–' + fmtCurr(fi.range.high);
  } else if (pct <= 10) {
    el.className = 'booked-card-verdict ok';
    el.textContent = '🟡 接近均價 · 歷史區間 ' + fmtCurr(fi.range.low) + '–' + fmtCurr(fi.range.high);
  } else {
    el.className = 'booked-card-verdict bad';
    el.textContent = '🔴 高於均價 ' + pct + '% · 歷史區間 ' + fmtCurr(fi.range.low) + '–' + fmtCurr(fi.range.high);
  }
}

function renderHolidays() {}

// ── Booking Tab ──
function renderBooking() {
  const bk = TRIP.booking;
  if (!bk) return;

  // Section 1: Confirmed bookings
  const confirmedEl = document.getElementById('booking-confirmed');
  if (confirmedEl && bk.confirmed) {
    confirmedEl.innerHTML = bk.confirmed.map(item => {
      const badgeClass = item.status === 'confirmed' ? 'done' : 'pending';
      const badgeText = item.status === 'confirmed' ? t('lbl_booked') : t('lbl_pending');
      const badgeIcon = item.status === 'confirmed' ? 'check_circle' : 'schedule';

      if (item.type === 'flight') {
        const segs = (item.segments || []).map(seg => `
          <div class="flight-seg">
            <div class="flight-seg-badge${seg.label_i18n === 'booking_return' ? ' return' : ''}">${t(seg.label_i18n)}</div>
            <div class="flight-seg-body">
              <div class="flight-seg-route">
                <div class="flight-seg-point">
                  <div class="flight-seg-time">${seg.departure.time}</div>
                  <div class="flight-seg-city">${seg.departure.city_zh}${seg.departure.terminal}</div>
                </div>
                <div class="flight-seg-arrow">
                  <div class="flight-seg-line"></div>
                  <div class="flight-seg-code">${seg.flight} · ${seg.duration}</div>
                </div>
                <div class="flight-seg-point">
                  <div class="flight-seg-time">${seg.arrival.time}</div>
                  <div class="flight-seg-city">${seg.arrival.city_zh}${seg.arrival.terminal}</div>
                </div>
              </div>
              <div class="flight-seg-detail">${seg.date} · <a href="${seg.maps_dep}" target="_blank">${seg.departure.city_zh}機場</a> → <a href="${seg.maps_arr}" target="_blank">${seg.arrival.city_zh}機場</a></div>
            </div>
          </div>`).join('');

        return `<div class="booked-card booked-card-wide flight-card">
          <div class="booked-card-head">
            <div class="booked-card-name"><span class="mi material-symbols-outlined" style="font-size:16px">flight</span> ${item.title}</div>
            <span class="booked-badge ${badgeClass}"><span class="mi material-symbols-outlined" style="font-size:14px">${badgeIcon}</span> ${badgeText}</span>
          </div>
          <div class="flight-segments">${segs}</div>
          <div class="flight-footer">
            <div>
              <div class="booked-card-cost" style="margin:0">${item.price}</div>
              <div class="booked-card-verdict" id="flight-verdict-inline"></div>
            </div>
          </div>
          ${item.checkin_url ? `<div class="flight-checkin-note"><a href="${item.checkin_url}" target="_blank">${t(item.checkin_note_i18n)}</a></div>` : ''}
        </div>`;
      }

      if (item.type === 'ferry') {
        return `<div class="booked-card">
          <div class="booked-card-head">
            <div class="booked-card-name"><span class="mi material-symbols-outlined" style="font-size:16px">directions_boat</span> ${item.title}</div>
            <span class="booked-badge ${badgeClass}"><span class="mi material-symbols-outlined" style="font-size:14px">${badgeIcon}</span> ${badgeText}</span>
          </div>
          <div class="booked-card-meta">${item.date} ${item.departure.time} ${item.departure.city}→${item.arrival.time}+1 ${item.arrival.city}</div>
          <div class="booked-card-meta">${item.departure.terminal} → ${item.arrival.terminal}</div>
          <div class="booked-card-cost" style="margin-top:6px">${item.price}</div>
          <div class="booked-card-links">
            <a href="${item.departure.maps}" target="_blank" class="booked-card-link"><span class="mi material-symbols-outlined" style="font-size:14px">location_on</span>${item.departure.city}港</a>
            <a href="${item.arrival.maps}" target="_blank" class="booked-card-link"><span class="mi material-symbols-outlined" style="font-size:14px">location_on</span>${item.arrival.city}港</a>
          </div>
        </div>`;
      }

      if (item.type === 'hotel') {
        return `<div class="booked-card">
          <div class="booked-card-head">
            <div class="booked-card-name"><span class="mi material-symbols-outlined" style="font-size:16px">hotel</span> ${item.title}</div>
            <span class="booked-badge ${badgeClass}"><span class="mi material-symbols-outlined" style="font-size:14px">${badgeIcon}</span> ${badgeText}</span>
          </div>
          ${item.dates ? `<div class="booked-card-meta">${item.dates}${item.price_per_night ? ' · ' + item.price_per_night : ''}</div>` : ''}
          <div class="booked-card-cost">${item.price}</div>
          ${item.maps_url ? `<div class="booked-card-links"><a href="${item.maps_url}" target="_blank" class="booked-card-link"><span class="mi material-symbols-outlined" style="font-size:14px">location_on</span>${t('booking_map')}</a></div>` : ''}
        </div>`;
      }

      // activity / default
      return `<div class="booked-card">
        <div class="booked-card-head">
          <div class="booked-card-name"><span class="mi material-symbols-outlined" style="font-size:16px">confirmation_number</span> ${item.title}</div>
          <span class="booked-badge ${badgeClass}"><span class="mi material-symbols-outlined" style="font-size:14px">${badgeIcon}</span> ${badgeText}</span>
        </div>
        ${item.desc ? `<div class="booked-card-meta">${item.desc}</div>` : ''}
        ${item.meetup ? `<div class="booked-card-meta">${t('booking_meetpoint')}：${item.meetup}</div>` : ''}
        <div class="booked-card-cost">${item.price}</div>
        ${item.maps_url ? `<div class="booked-card-links"><a href="${item.maps_url}" target="_blank" class="booked-card-link"><span class="mi material-symbols-outlined" style="font-size:14px">location_on</span>${t('booking_meetpoint')}</a></div>` : ''}
      </div>`;
    }).join('');

    // Re-run flight intel badge after DOM update
    renderFlightIntel();
  }

  // Section 2: Comparison table
  const cmpEl = document.getElementById('booking-comparison');
  if (cmpEl && bk.comparison) {
    cmpEl.innerHTML = `
      <div class="booking-table-wrap">
        <table class="booking-table">
          <thead><tr>
            <th data-i18n="booking_th_item">${t('booking_th_item')}</th>
            <th data-i18n="booking_th_official">${t('booking_th_official')}</th>
            <th data-i18n="booking_th_klook">${t('booking_th_klook')}</th>
            <th data-i18n="booking_th_kkday">${t('booking_th_kkday')}</th>
            <th data-i18n="booking_th_suggest">${t('booking_th_suggest')}</th>
          </tr></thead>
          <tbody>${bk.comparison.map(row => {
            const p = row.prices;
            const bestCell = (key, val) => val
              ? (row.best === key ? `<span class="best-price">${val} <span class="star-mark">★</span></span>` : val)
              : '—';
            return `<tr>
              <td><strong>${row.name}</strong>${row.name_note ? `<br><span style="font-size:.72rem;color:var(--text-3)">${row.name_note}</span>` : ''}</td>
              <td>${bestCell('official', p.official)}</td>
              <td>${bestCell('klook', p.klook)}</td>
              <td>${bestCell('kkday', p.kkday)}</td>
              <td>${row.verdict_i18n ? `<span>${t(row.verdict_i18n)}</span>` : '—'}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>`;
  }

  // Section 3: Recommended to buy
  const toBuyEl = document.getElementById('booking-tobuy');
  if (toBuyEl && bk.to_buy) {
    toBuyEl.innerHTML = bk.to_buy.map(item => `
      <div class="recommend-item">
        <strong>${t(item.name_i18n)}</strong>
        <div class="rec-note">${t(item.note_i18n)}</div>
      </div>`).join('');
  }
}

// ── POI Detail Popup ──
function openPOIModal(id) {
  const p = TRIP.pois.find(x => x.id === id);
  if (!p) return;

  const col = CAT_COLORS_MAP[p.cat] || '#888';
  const catNames = {}; ['attraction','food','cafe','shopping','transport','work','hotel'].forEach(c => catNames[c] = getCatName(c));
  const price = p.price_twd > 0
    ? 'NT$' + p.price_twd + (p.price_krw ? '（₩' + p.price_krw.toLocaleString() + '）' : p.price_jpy ? '（¥' + p.price_jpy.toLocaleString() + '）' : '')
    : '免費';
  const mapQ = encodeURIComponent(p.nameLocal + ' ' + p.addr);
  const searchQ = encodeURIComponent(p.nameLocal || p.name);

  document.getElementById('poi-modal-content').innerHTML =
    '<div class="poi-modal-header">' +
      '<div class="poi-modal-dot" style="background:' + col + '"></div>' +
      '<div><div class="poi-modal-title">' + p.name + '</div>' +
      '<div class="poi-modal-local">' + (p.nameLocal || '') + '</div></div>' +
    '</div>' +
    '<div class="poi-modal-section">' +
      '<div class="poi-modal-row">📍 ' + getCityLabel(p.city) + ' · ' + p.addr + '</div>' +
      '<div class="poi-modal-row">🕐 ' + p.hours + '</div>' +
      '<div class="poi-modal-row">💰 ' + price + '</div>' +
      '<div class="poi-modal-row">📋 ' + p.desc + '</div>' +
      '<div class="poi-modal-row" style="margin-top:4px"><span style="display:inline-block;padding:2px 8px;border-radius:99px;font-size:.7rem;background:' + col + '20;color:' + col + ';font-weight:600">' + (catNames[p.cat] || p.cat) + '</span></div>' +
    '</div>' +
    '<div class="poi-modal-section">' +
      '<div class="poi-modal-label">搜尋更多</div>' +
      '<div class="poi-modal-links">' +
        '<a href="https://www.google.com/maps/search/?api=1&query=' + mapQ + '" target="_blank" class="poi-modal-link"><img src="https://www.google.com/images/branding/product/1x/maps_round_32dp.png" width="16" height="16"> Google Maps</a>' +
        '<a href="https://www.google.com/search?q=' + searchQ + '" target="_blank" class="poi-modal-link"><img src="https://www.google.com/favicon.ico" width="16" height="16"> Google</a>' +
        '<a href="https://www.instagram.com/explore/tags/' + encodeURIComponent((p.nameLocal || p.name).replace(/[\s+\/]/g, '')) + '/" target="_blank" class="poi-modal-link"><img src="https://www.instagram.com/favicon.ico" width="16" height="16"> Instagram</a>' +
        '<a href="https://www.youtube.com/results?search_query=' + searchQ + '" target="_blank" class="poi-modal-link"><img src="https://www.youtube.com/favicon.ico" width="16" height="16"> YouTube</a>' +
        '<a href="https://www.xiaohongshu.com/search_result?keyword=' + searchQ + '" target="_blank" class="poi-modal-link">📕 小紅書</a>' +
      '</div>' +
    '</div>';

  const overlay = document.getElementById('poi-modal-overlay');
  overlay.classList.add('open');

  // Also focus on map
  focusPOI(id);
}

function initPOIModal() {
  const overlay = document.getElementById('poi-modal-overlay');
  const closeBtn = document.getElementById('poi-modal-close');
  if (!overlay || !closeBtn) return;

  closeBtn.addEventListener('click', () => overlay.classList.remove('open'));
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.remove('open');
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') overlay.classList.remove('open');
  });
}

// ── Live Clocks + Now Line ──
const DEST_TZ = 'Asia/Tokyo';   // Korea & Japan = UTC+9
const HOME_TZ = 'Asia/Taipei';  // Passport country = Taiwan UTC+8

function getTimeInTZ(tz) {
  return new Date().toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
}
function getDateInTZ(tz) {
  return new Date().toLocaleDateString('en-CA', { timeZone: tz });
}
function getHourDecimalInTZ(tz) {
  const d = new Date();
  const s = d.toLocaleString('en-US', { timeZone: tz, hour: 'numeric', minute: 'numeric', hour12: false });
  const [h, m] = s.split(':').map(Number);
  return h + m / 60;
}

function updateClocks() {
  const el = document.getElementById('live-clocks');
  if (!el) return;

  const destTime = getTimeInTZ(DEST_TZ);
  const homeTime = getTimeInTZ(HOME_TZ);
  const [dh, dm] = destTime.split(':');
  const [hh, hm] = homeTime.split(':');

  el.innerHTML =
    '<div class="clock-wrap">' +
      '<div class="cd-label">' + t('clock_dest') + '</div>' +
      '<div class="cd-digits">' +
        '<div class="cd-unit"><div class="cd-num">' + dh + '</div><div class="cd-sub">' + t('clock_hour') + '</div></div>' +
        '<div class="cd-sep">:</div>' +
        '<div class="cd-unit"><div class="cd-num">' + dm + '</div><div class="cd-sub">' + t('clock_min') + '</div></div>' +
      '</div>' +
    '</div>' +
    '<div class="clock-wrap">' +
      '<div class="cd-label">' + t('clock_home') + '</div>' +
      '<div class="cd-digits">' +
        '<div class="cd-unit"><div class="cd-num">' + hh + '</div><div class="cd-sub">' + t('clock_hour') + '</div></div>' +
        '<div class="cd-sep">:</div>' +
        '<div class="cd-unit"><div class="cd-num">' + hm + '</div><div class="cd-sub">' + t('clock_min') + '</div></div>' +
      '</div>' +
    '</div>';
}

function renderNowLine() {
  document.querySelectorAll('.cal-now-line,.cal-m-now').forEach(e => e.remove());
  const todayStr = getDateInTZ(DEST_TZ);
  const nowH = getHourDecimalInTZ(DEST_TZ);
  var tzAbbr = new Date().toLocaleString('en-US', { timeZone: DEST_TZ, timeZoneName: 'short' }).split(' ').pop();
  const label = getTimeInTZ(DEST_TZ) + ' ' + tzAbbr;

  // Desktop
  const days = TRIP.schedule.slice((currentWeek - 1) * 7, currentWeek * 7);
  days.forEach((day, i) => {
    if (day.date !== todayStr) return;
    const col = document.querySelectorAll('#cal-desktop .cal-day-col')[i];
    if (!col) return;
    const top = (nowH - HOUR_START) * 60;
    if (top < 0 || top > (HOUR_END - HOUR_START) * 60) return;
    const line = document.createElement('div');
    line.className = 'cal-now-line';
    line.style.top = top + 'px';
    line.innerHTML = '<span class="cal-now-label">' + label + '</span>';
    col.appendChild(line);
  });

  // Mobile
  document.querySelectorAll('#cal-mobile .cal-m-day').forEach(dayEl => {
    const txt = dayEl.querySelector('.cal-m-day-num')?.textContent;
    if (!txt) return;
    const [m, d] = txt.split('/').map(Number);
    const yr = new Date(TRIP.startDate).getFullYear();
    const ds = yr + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    if (ds !== todayStr) return;
    const evs = dayEl.querySelector('.cal-m-events');
    if (!evs) return;
    const items = evs.querySelectorAll('.cal-m-event');
    let done = false;
    const mk = () => { const n = document.createElement('div'); n.className = 'cal-m-now'; n.innerHTML = '<div class="cal-m-now-dot"></div><div class="cal-m-now-line"></div><div class="cal-m-now-label">' + label + '</div>'; return n; };
    for (const ev of items) {
      const t = ev.querySelector('.cal-m-time')?.textContent;
      if (!t) continue;
      const [h, mm] = t.split(':').map(Number);
      if (nowH < h + mm / 60) { evs.insertBefore(mk(), ev); done = true; break; }
    }
    if (!done) evs.appendChild(mk());
  });
}

function initClocks() {
  updateClocks();
  renderNowLine();
  setInterval(() => { updateClocks(); renderNowLine(); }, 30000);
}

// ── Time Allocation (computed from schedule) ──
let timeCatFilter = null; // null = all, 'attraction'/'work'/etc = filtered

const TIME_CAT_COLORS = {
  attraction: 'var(--cat-attraction)',
  work: 'var(--cat-work)',
  food: 'var(--cat-food)',
  transport: 'var(--cat-transport)',
  shopping: 'var(--cat-shopping)',
  cafe: 'var(--cat-cafe)',
  hotel: 'var(--cat-hotel)',
  other: 'var(--cat-other)'
};
function getTimeCatMeta(cat) {
  return { name: t('tcat_' + cat) || getCatName(cat), color: TIME_CAT_COLORS[cat] || TIME_CAT_COLORS.other };
}
// Legacy alias for existing code
const TIME_CAT_META = new Proxy({}, { get: (_, cat) => getTimeCatMeta(cat) });

function renderTimeAllocation() {
  const catHours = {};
  const cityDays = {};
  const cityCatHours = {}; // { city: { cat: hours } }
  const dailyBreakdown = []; // per-day data

  TRIP.schedule.forEach(day => {
    cityDays[day.city] = (cityDays[day.city] || 0) + 1;
    if (!cityCatHours[day.city]) cityCatHours[day.city] = {};
    const dayData = { date: day.date, city: day.city, cats: {} };
    day.events.forEach(ev => {
      const hrs = ev.eh - ev.sh;
      const cat = ev.cat || 'other';
      catHours[cat] = (catHours[cat] || 0) + hrs;
      cityCatHours[day.city][cat] = (cityCatHours[day.city][cat] || 0) + hrs;
      dayData.cats[cat] = (dayData.cats[cat] || 0) + hrs;
    });
    dailyBreakdown.push(dayData);
  });

  // ── Countdown timer ──
  const countdownEl = document.getElementById('time-countdown');
  if (countdownEl) {
    // Countdown to flight departure IT606 16:40 TPE (UTC+8)
    const start = new Date(TRIP.startDate + 'T16:40:00+08:00');
    const end = new Date(TRIP.endDate + 'T23:59:59+09:00');
    const now = new Date();
    let label, diffMs;
    if (now < start) {
      label = t('time_countdown');
      diffMs = start - now;
    } else if (now <= end) {
      label = t('time_remaining');
      diffMs = end - now;
    } else {
      label = t('time_ended');
      diffMs = 0;
    }
    const totalSec = Math.max(0, Math.floor(diffMs / 1000));
    const days = Math.floor(totalSec / 86400);
    const hrs = Math.floor((totalSec % 86400) / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    const pad = n => String(n).padStart(2, '0');

    if (days > 0) {
      countdownEl.innerHTML =
        '<div class="cd-label">' + label + '</div>' +
        '<div class="cd-digits">' +
          '<div class="cd-unit"><div class="cd-num">' + pad(days) + '</div><div class="cd-sub">DAY</div></div>' +
          '<div class="cd-sep">:</div>' +
          '<div class="cd-unit"><div class="cd-num">' + pad(hrs) + '</div><div class="cd-sub">HOUR</div></div>' +
          '<div class="cd-sep">:</div>' +
          '<div class="cd-unit"><div class="cd-num">' + pad(mins) + '</div><div class="cd-sub">MIN</div></div>' +
          '<div class="cd-sep">:</div>' +
          '<div class="cd-unit"><div class="cd-num">' + pad(secs) + '</div><div class="cd-sub">SEC</div></div>' +
        '</div>';
    } else {
      countdownEl.innerHTML =
        '<div class="cd-label">' + label + '</div>' +
        '<div class="cd-digits">' +
          '<div class="cd-unit"><div class="cd-num">' + pad(hrs) + '</div><div class="cd-sub">HOUR</div></div>' +
          '<div class="cd-sep">:</div>' +
          '<div class="cd-unit"><div class="cd-num">' + pad(mins) + '</div><div class="cd-sub">MIN</div></div>' +
          '<div class="cd-sep">:</div>' +
          '<div class="cd-unit"><div class="cd-num">' + pad(secs) + '</div><div class="cd-sub">SEC</div></div>' +
        '</div>';
    }
  }

  // ── Filter label ──
  const filterEl = document.getElementById('time-filter-label');
  if (filterEl) {
    if (timeCatFilter) {
      const m = TIME_CAT_META[timeCatFilter] || TIME_CAT_META.other;
      filterEl.innerHTML = t('filter_label') + '：<strong>' + m.name + '</strong>（' + (catHours[timeCatFilter] || 0).toFixed(1) + ' hr） <span class="time-clear-filter" style="cursor:pointer;color:var(--text-3);font-size:.78rem;margin-left:8px;text-decoration:underline">' + t('filter_clear') + '</span>';
      filterEl.style.display = '';
      filterEl.querySelector('.time-clear-filter')?.addEventListener('click', () => {
        timeCatFilter = null;
        renderTimeAllocation();
      });
    } else {
      filterEl.style.display = 'none';
    }
  }

  // ── Bar chart: total hours per category (top, always all, highlight selected) ──
  const maxHrs = Math.max(...Object.values(catHours));
  const chartEl = document.getElementById('time-alloc-chart');
  if (chartEl) {
    chartEl.innerHTML = Object.entries(catHours)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, hrs]) => {
        const m = TIME_CAT_META[cat] || TIME_CAT_META.other;
        const h = Math.round(hrs / maxHrs * 120);
        const active = timeCatFilter === cat;
        const dimmed = timeCatFilter && !active;
        return '<div class="bar-col time-cat-bar' + (active ? ' active' : '') + (dimmed ? ' dimmed' : '') + '" data-cat="' + cat + '" style="cursor:pointer">' +
          '<div class="bar-fill" style="height:' + h + 'px;background:' + m.color + '"></div>' +
          '<div class="bar-label">' + m.name + '</div>' +
          '<div class="bar-sub">' + hrs.toFixed(1) + 'hr</div>' +
        '</div>';
      }).join('');

    // Click handler
    chartEl.querySelectorAll('.time-cat-bar').forEach(el => {
      el.addEventListener('click', () => {
        const cat = el.dataset.cat;
        timeCatFilter = (timeCatFilter === cat) ? null : cat;
        renderTimeAllocation();
      });
    });
  }

  // ── City bars (breakdown by selected category, or total days) ──
  const totalDays = TRIP.schedule.length;
  const cityEl = document.getElementById('time-city-bars');
  if (cityEl) {
    if (timeCatFilter) {
      // Show hours of this category per city
      const cityHrsForCat = {};
      Object.entries(cityCatHours).forEach(([city, cats]) => {
        cityHrsForCat[city] = cats[timeCatFilter] || 0;
      });
      const maxVal = Math.max(...Object.values(cityHrsForCat), 0.1);
      const m = TIME_CAT_META[timeCatFilter] || TIME_CAT_META.other;
      cityEl.innerHTML = Object.entries(cityHrsForCat)
        .filter(([_, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([city, hrs]) =>
          '<div class="h-bar-row"><div class="h-bar-label">' + getScheduleCityName(city) + '</div>' +
          '<div class="h-bar-track"><div class="h-bar-fill" style="width:' + Math.round(hrs / maxVal * 100) + '%;background:' + m.color + '"></div></div>' +
          '<div class="h-bar-val">' + hrs.toFixed(1) + ' hr</div></div>'
        ).join('') || '<div style="color:var(--text-3);font-size:.83rem;padding:8px 0">' + t('time_no_data') + '</div>';
    } else {
      const maxCity = Math.max(...Object.values(cityDays));
      cityEl.innerHTML = Object.entries(cityDays).map(([city, d]) =>
        '<div class="h-bar-row"><div class="h-bar-label">' + getScheduleCityName(city) + '</div><div class="h-bar-track"><div class="h-bar-fill" style="width:' + Math.round(d / maxCity * 100) + '%"></div></div><div class="h-bar-val">' + d + ' ' + t('time_days') + '</div></div>'
      ).join('');
    }
  }

  // ── Daily breakdown (filtered or average) ──
  const dailyEl = document.getElementById('time-daily-bars');
  if (dailyEl) {
    if (timeCatFilter) {
      // Show each day's hours for this category
      const m = TIME_CAT_META[timeCatFilter] || TIME_CAT_META.other;
      const daysWithCat = dailyBreakdown.filter(d => (d.cats[timeCatFilter] || 0) > 0);
      const maxDayHrs = Math.max(...daysWithCat.map(d => d.cats[timeCatFilter] || 0), 0.1);
      dailyEl.innerHTML = daysWithCat.map(d => {
        const dt = new Date(d.date);
        const dayLabel = (dt.getMonth()+1) + '/' + dt.getDate() + ' ' + getScheduleCityName(d.city);
        const hrs = d.cats[timeCatFilter] || 0;
        return '<div class="h-bar-row"><div class="h-bar-label" style="min-width:100px;font-size:.78rem">' + dayLabel + '</div>' +
          '<div class="h-bar-track"><div class="h-bar-fill" style="width:' + Math.round(hrs / maxDayHrs * 100) + '%;background:' + m.color + '"></div></div>' +
          '<div class="h-bar-val">' + hrs.toFixed(1) + 'hr</div></div>';
      }).join('') || '<div style="color:var(--text-3);font-size:.83rem;padding:8px 0">' + t('time_no_data') + '</div>';
    } else {
      // Default: daily average per category
      const maxAvg = Math.max(...Object.values(catHours).map(h => h / totalDays));
      dailyEl.innerHTML = Object.entries(catHours)
        .sort((a, b) => b[1] - a[1])
        .map(([cat, hrs]) => {
          const m = TIME_CAT_META[cat] || TIME_CAT_META.other;
          const avg = hrs / totalDays;
          return '<div class="h-bar-row"><div class="h-bar-label">' + m.name + '</div><div class="h-bar-track"><div class="h-bar-fill" style="width:' + Math.round(avg / maxAvg * 100) + '%;background:' + m.color + '"></div></div><div class="h-bar-val">' + avg.toFixed(1) + 'hr/' + t('time_days') + '</div></div>';
        }).join('');
    }
  }

  // Update chart titles based on filter
  const cityTitle = document.getElementById('time-city-title');
  const dailyTitle = document.getElementById('time-daily-title');
  if (cityTitle) {
    const m = timeCatFilter ? (TIME_CAT_META[timeCatFilter] || TIME_CAT_META.other) : null;
    cityTitle.textContent = timeCatFilter ? m.name + ' — ' + t('time_city_hours') : t('time_city_days');
  }
  if (dailyTitle) {
    const m = timeCatFilter ? (TIME_CAT_META[timeCatFilter] || TIME_CAT_META.other) : null;
    dailyTitle.textContent = timeCatFilter ? m.name + ' — ' + t('time_daily_hours') : t('time_daily_dist');
  }
}

// Update countdown every second
function initCountdown() {
  renderTimeAllocation();
  renderOverviewExtras();
  setInterval(() => {
    const countdownEl = document.getElementById('time-countdown');
    if (countdownEl && document.getElementById('tab-attractions').classList.contains('active')) {
      renderTimeAllocation();
    }
  }, 1000);
  // Update today card every 60s
  setInterval(() => {
    if (document.getElementById('tab-attractions')?.classList.contains('active')) {
      renderOverviewExtras();
    }
  }, 60000);
}

// ── City Theme Data ──
const CITY_THEMES = {
  '釜山': { icon: 'park', label: '釜山' },
  'busan': { icon: 'park', label: 'Busan' },
  '釜山→渡輪': { icon: 'directions_boat', label: '渡輪' },
  '阿蘇/熊本': { icon: 'landscape', label: '阿蘇' },
  'aso': { icon: 'landscape', label: 'Aso' },
  '太宰府+柳川': { icon: 'temple_buddhist', label: '太宰府' },
  '糸島': { icon: 'beach_access', label: '糸島' },
  '福岡': { icon: 'ramen_dining', label: '福岡' },
  'fukuoka': { icon: 'ramen_dining', label: 'Fukuoka' },
};
function getCityTheme(city) {
  return CITY_THEMES[city] || CITY_THEMES['福岡'];
}

// Map schedule city names (Chinese) to i18n keys
const SCHEDULE_CITY_I18N = {
  '釜山': 'scity_busan', '釜山→渡輪': 'scity_ferry', '阿蘇/熊本': 'scity_aso',
  '太宰府+柳川': 'scity_dazaifu', '糸島': 'scity_itoshima', '福岡': 'scity_fukuoka'
};
function getScheduleCityName(city) {
  const key = SCHEDULE_CITY_I18N[city];
  if (key) return t(key);
  return city;
}

// ── Weather Data (pre-researched for 3/30–4/12) ──
// icon = Material Symbols icon name
const WEATHER_DATA = [
  { date:'2026-03-30', icon:'rainy', hi:14, lo:9,  desc:{zh:'陣雨',en:'Showers',ko:'소나기',ja:'にわか雨'}, sunrise:'06:22', sunset:'18:40', city:'busan' },
  { date:'2026-03-31', icon:'grain', hi:15, lo:10, desc:{zh:'多雲時雨',en:'Cloudy/Rain',ko:'흐리고 비',ja:'曇り時々雨'}, sunrise:'06:21', sunset:'18:41', city:'busan' },
  { date:'2026-04-01', icon:'clear_day', hi:17, lo:10, desc:{zh:'晴朗',en:'Sunny',ko:'맑음',ja:'晴れ'}, sunrise:'06:19', sunset:'18:42', city:'busan' },
  { date:'2026-04-02', icon:'partly_cloudy_day', hi:16, lo:11, desc:{zh:'多雲',en:'Partly Cloudy',ko:'구름 많음',ja:'曇り'}, sunrise:'06:18', sunset:'18:43', city:'busan' },
  { date:'2026-04-03', icon:'partly_cloudy_day', hi:16, lo:10, desc:{zh:'晴時多雲',en:'Mostly Sunny',ko:'대체로 맑음',ja:'晴れ時々曇り'}, sunrise:'06:17', sunset:'18:44', city:'busan' },
  { date:'2026-04-04', icon:'clear_day', hi:18, lo:8,  desc:{zh:'晴朗',en:'Sunny',ko:'맑음',ja:'晴れ'}, sunrise:'05:58', sunset:'18:42', city:'aso' },
  { date:'2026-04-05', icon:'partly_cloudy_day', hi:19, lo:10, desc:{zh:'多雲',en:'Partly Cloudy',ko:'구름 많음',ja:'曇り'}, sunrise:'05:56', sunset:'18:43', city:'fukuoka' },
  { date:'2026-04-06', icon:'partly_cloudy_day', hi:20, lo:11, desc:{zh:'晴時多雲',en:'Mostly Sunny',ko:'대체로 맑음',ja:'晴れ時々曇り'}, sunrise:'05:55', sunset:'18:44', city:'fukuoka' },
  { date:'2026-04-07', icon:'clear_day', hi:20, lo:12, desc:{zh:'晴・櫻花滿開',en:'Sunny · Full bloom',ko:'맑음 · 만개',ja:'晴れ・満開'}, sunrise:'05:54', sunset:'18:44', city:'fukuoka' },
  { date:'2026-04-08', icon:'partly_cloudy_day', hi:19, lo:12, desc:{zh:'多雲',en:'Partly Cloudy',ko:'구름 많음',ja:'曇り'}, sunrise:'05:52', sunset:'18:45', city:'fukuoka' },
  { date:'2026-04-09', icon:'rainy', hi:17, lo:12, desc:{zh:'陣雨',en:'Showers',ko:'소나기',ja:'にわか雨'}, sunrise:'05:51', sunset:'18:46', city:'fukuoka' },
  { date:'2026-04-10', icon:'partly_cloudy_day', hi:19, lo:11, desc:{zh:'晴時多雲',en:'Mostly Sunny',ko:'대체로 맑음',ja:'晴れ時々曇り'}, sunrise:'05:50', sunset:'18:46', city:'fukuoka' },
  { date:'2026-04-11', icon:'clear_day', hi:21, lo:12, desc:{zh:'晴朗',en:'Sunny',ko:'맑음',ja:'晴れ'}, sunrise:'05:49', sunset:'18:47', city:'fukuoka' },
  { date:'2026-04-12', icon:'partly_cloudy_day', hi:20, lo:13, desc:{zh:'多雲',en:'Partly Cloudy',ko:'구름 많음',ja:'曇り'}, sunrise:'05:47', sunset:'18:48', city:'fukuoka' },
];

// ── Today's Itinerary Card ──
function renderTodayCard() {
  const el = document.getElementById('today-card');
  if (!el) return;

  const now = new Date();
  const todayStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
  const tripStart = new Date(TRIP.startDate);
  const tripEnd = new Date(TRIP.endDate);
  const today = new Date(todayStr);

  const mi = function(name, size) { return '<span class="mi material-symbols-outlined" style="font-size:' + (size||16) + 'px">' + name + '</span>'; };

  // Before trip
  if (today < tripStart) {
    const dayIdx = TRIP.schedule.findIndex(d => d.date === TRIP.startDate);
    const firstDay = TRIP.schedule[dayIdx >= 0 ? dayIdx : 0];
    const theme = getCityTheme(firstDay?.city || '釜山');
    el.innerHTML = '<div class="today-card-inner">' +
      '<div class="today-card-header">' + mi(theme.icon, 20) + '<span class="today-card-title">' + t('time_today') + '</span></div>' +
      '<div class="today-card-msg">' + t('time_today_before') + '</div>' +
      '<div class="today-card-preview"><div class="today-preview-label">Day 1 · ' + TRIP.startDate.slice(5) + '</div>' + renderDayEvents(firstDay) + '</div>' +
    '</div>';
    return;
  }

  // After trip
  if (today > tripEnd) {
    el.innerHTML = '<div class="today-card-inner">' +
      '<div class="today-card-header">' + mi('flight_takeoff', 20) + '<span class="today-card-title">' + t('time_today') + '</span></div>' +
      '<div class="today-card-msg">' + t('time_today_after') + '</div></div>';
    return;
  }

  // During trip
  const dayData = TRIP.schedule.find(d => d.date === todayStr);
  const dayNum = Math.floor((today - tripStart) / 86400000) + 1;
  const weather = WEATHER_DATA.find(w => w.date === todayStr);

  if (!dayData || dayData.events.length === 0) {
    el.innerHTML = '<div class="today-card-inner"><div class="today-card-header">' + mi('explore', 20) + '<span class="today-card-title">' + t('time_today') + ' · Day ' + dayNum + '</span></div>' +
      '<div class="today-card-msg">' + t('time_today_rest') + '</div></div>';
    return;
  }

  const theme = getCityTheme(dayData.city);
  const nowHour = now.getHours() + now.getMinutes() / 60;

  // Weather bar
  const weatherHtml = weather
    ? '<div class="today-weather">' +
        mi(weather.icon, 18) +
        '<span class="today-weather-temp">' + weather.hi + '°/' + weather.lo + '°</span>' +
        '<span class="today-weather-desc">' + (weather.desc[currentLang] || weather.desc.zh) + '</span>' +
        '<span class="today-weather-sun">' + mi('wb_twilight', 12) + ' ' + weather.sunrise + '  ' + mi('nightlight', 12) + ' ' + weather.sunset + '</span>' +
      '</div>'
    : '';

  el.innerHTML = '<div class="today-card-inner">' +
    '<div class="today-card-header">' + mi(theme.icon, 20) + '<span class="today-card-title">' + t('time_today') + ' · Day ' + dayNum + ' · ' + getScheduleCityName(dayData.city) + '</span></div>' +
    weatherHtml +
    '<div class="today-events-timeline">' + renderDayEvents(dayData, nowHour) + '</div>' +
  '</div>';

}

function formatHour(h) {
  const hr = Math.floor(h);
  const min = Math.round((h - hr) * 60);
  return String(hr).padStart(2, '0') + ':' + String(min).padStart(2, '0');
}

function renderDayEvents(dayData, nowHour) {
  if (!dayData || !dayData.events.length) return '';
  return dayData.events.map(ev => {
    const catColor = TIME_CAT_COLORS[ev.cat] || TIME_CAT_COLORS.other;
    const isPast = nowHour !== undefined && nowHour > ev.eh;
    const isCurrent = nowHour !== undefined && nowHour >= ev.sh && nowHour < ev.eh;
    const cls = isPast ? ' past' : (isCurrent ? ' current' : '');
    return '<div class="today-ev' + cls + '">' +
      '<div class="today-ev-dot" style="background:' + catColor + '"></div>' +
      '<div class="today-ev-time">' + formatHour(ev.sh) + '</div>' +
      '<div class="today-ev-name">' + getEventName(ev) + '</div>' +
    '</div>';
  }).join('');
}

// ── Weather Forecast Strip ──
function renderWeatherStrip() {
  const el = document.getElementById('weather-strip');
  if (!el) return;

  const now = new Date();
  const todayStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');

  el.innerHTML = '<div class="weather-strip-title"><span class="mi material-symbols-outlined" style="font-size:16px">cloud</span> ' + t('time_weather_title') + '</div>' +
    '<div class="weather-strip-scroll">' +
      WEATHER_DATA.map((w, i) => {
        const dt = new Date(w.date);
        const dayNum = i + 1;
        const isToday = w.date === todayStr;
        const theme = getCityTheme(w.city === 'busan' ? '釜山' : (w.city === 'aso' ? '阿蘇/熊本' : '福岡'));
        const goldenMorning = addMinutes(w.sunrise, -30);
        const goldenEvening = addMinutes(w.sunset, -30);
        return '<div class="weather-day' + (isToday ? ' today' : '') + '">' +
          '<div class="wd-daynum">D' + dayNum + '</div>' +
          '<div class="wd-date">' + (dt.getMonth()+1) + '/' + dt.getDate() + '</div>' +
          '<div class="wd-icon"><span class="mi material-symbols-outlined">' + w.icon + '</span></div>' +
          '<div class="wd-temp">' + w.hi + '°<span class="wd-lo">/' + w.lo + '°</span></div>' +
          '<div class="wd-desc">' + (w.desc[currentLang] || w.desc.zh) + '</div>' +
          '<div class="wd-sun"><span class="wd-sun-rise"><span class="mi material-symbols-outlined" style="font-size:10px">wb_twilight</span>' + w.sunrise + '</span><span class="wd-sun-set"><span class="mi material-symbols-outlined" style="font-size:10px">nightlight</span>' + w.sunset + '</span></div>' +
          '<div class="wd-golden" title="' + t('time_golden_hour') + '"><span class="mi material-symbols-outlined" style="font-size:10px">photo_camera</span> ' + goldenEvening + '</div>' +
          '<div class="wd-city-row"><div class="wd-city-dot" title="' + getCityName(w.city) + '"></div><span class="wd-city-label wd-city-' + w.city + '">' + getCityName(w.city) + '</span></div>' +
        '</div>';
      }).join('') +
    '</div>';

  // Scroll to today
  requestAnimationFrame(() => {
    const todayEl = el.querySelector('.weather-day.today');
    if (todayEl) todayEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  });
}

function addMinutes(timeStr, mins) {
  const [h, m] = timeStr.split(':').map(Number);
  const total = h * 60 + m + mins;
  return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
}

// ── Patch renderTimeAllocation to also render new sections ──
const _origRenderTimeAlloc = renderTimeAllocation;
// We'll call new renders from initCountdown instead to avoid recursion

function renderOverviewExtras() {
  renderTodayCard();
  renderWeatherStrip();
}

// ── Nomad / Work Spots (i18n-ready) ──
const NOMAD_SPOTS = [
  {
    name: 'Engineer Cafe (エンジニアカフェ)',
    addr: '福岡市中央区天神1-4-4',
    mapQuery: 'Engineer+Cafe+天神+福岡',
    hours: '09:00–21:00',
    tags: ['nomad_free','nomad_outlets','nomad_techbooks','nomad_wifi'],
    coverage: 'nomad_covers'
  },
  {
    name: 'Startup Cafe (スタートアップカフェ)',
    addr: '福岡市中央区大名2-6-11 FUKUOKA growth next',
    mapQuery: 'Startup+Cafe+FUKUOKA+growth+next',
    hours: '10:00–22:00',
    tags: ['nomad_free','nomad_has_wifi','nomad_consult'],
    coverage: 'nomad_covers_open'
  }
];

function renderNomadSpots() {
  const el = document.getElementById('nomad-spots');
  if (!el) return;
  el.innerHTML = NOMAD_SPOTS.map(s =>
    '<div class="nomad-spot">' +
      '<div class="ns-name">' + s.name + '</div>' +
      '<div class="ns-addr">' + s.addr + ' · <a href="https://www.google.com/maps/search/?api=1&query=' + s.mapQuery + '" target="_blank" style="color:var(--cat-attraction)">' + t('booking_map') + '</a></div>' +
      '<div class="ns-tags">' + s.tags.map(tag => '<span class="ns-tag">' + t(tag) + '</span>').join('') +
        '<span class="ns-tag">' + s.hours + '</span>' +
        '<span class="ns-tag">' + t(s.coverage) + '</span>' +
      '</div>' +
    '</div>'
  ).join('');
}

// ── Language Switcher (i18n) ──
const LANGS = ['zh', 'en', 'ko', 'ja'];
const LANG_LABELS = { zh: '中文', en: 'EN', ko: '한국어', ja: '日本語' };
let currentLang = 'zh';

const I18N = {
  // ── Navigation & Tab labels ──
  nav_attractions: { zh:'概覽', en:'Overview', ko:'개요', ja:'概要' },
  nav_calendar:    { zh:'行程', en:'Itinerary', ko:'일정', ja:'日程' },
  nav_booking:     { zh:'票券', en:'Tickets', ko:'티켓', ja:'チケット' },
  nav_budget:      { zh:'旅費', en:'Expenses', ko:'경비', ja:'旅費' },
  nav_time:        { zh:'景點', en:'Spots', ko:'명소', ja:'スポット' },
  nav_checklist:   { zh:'清單', en:'List', ko:'목록', ja:'リスト' },
  nav_lang:        { zh:'語言', en:'Lang', ko:'언어', ja:'言語' },
  nav_more:        { zh:'更多', en:'More', ko:'더보기', ja:'その他' },

  // ── Main header ──
  main_title: { zh:'🇰🇷 釜山 → 🇯🇵 阿蘇 → 🇯🇵 福岡', en:'🇰🇷 Busan → 🇯🇵 Aso → 🇯🇵 Fukuoka', ko:'🇰🇷 부산 → 🇯🇵 아소 → 🇯🇵 후쿠오카', ja:'🇰🇷 釜山 → 🇯🇵 阿蘇 → 🇯🇵 福岡' },
  main_meta:  { zh:'2026年 3月30日 – 4月12日 · 14天 · 獨旅 · 省錢版 · 含 Work Mode', en:'Mar 30 – Apr 12, 2026 · 14 days · Solo · Budget · Work Mode', ko:'2026년 3월 30일 – 4월 12일 · 14일 · 솔로 · 절약형 · Work Mode', ja:'2026年 3月30日 – 4月12日 · 14日間 · ひとり旅 · 節約版 · Work Mode' },
  main_desc:  { zh:'賞櫻旅程：韓國釜山海邊城市 → 九州阿蘇火山 → 福岡都市漫遊（含 Work Mode）', en:'Cherry blossom trip: Busan coastal city → Aso volcano → Fukuoka urban stroll (with Work Mode)', ko:'벚꽃 여행: 부산 해변도시 → 아소 화산 → 후쿠오카 도시 산책 (Work Mode 포함)', ja:'桜旅：釜山海辺の街 → 阿蘇火山 → 福岡都市散歩（Work Mode付き）' },

  // ── Page titles ──
  title_attractions: { zh:'景點地圖', en:'Attractions Map', ko:'명소 지도', ja:'スポットマップ' },
  title_calendar:    { zh:'行程日曆', en:'Itinerary Calendar', ko:'일정 달력', ja:'日程カレンダー' },
  title_booking:     { zh:'票券比價', en:'Ticket Comparison', ko:'티켓 비교', ja:'チケット比較' },
  title_budget:      { zh:'旅費', en:'Expenses', ko:'여행 경비', ja:'旅費' },
  title_time:        { zh:'景點地圖', en:'Attractions Map', ko:'명소 지도', ja:'スポットマップ' },
  title_checklist:   { zh:'行前清單', en:'Checklist', ko:'체크리스트', ja:'チェックリスト' },

  // ── Category names ──
  cat_attraction: { zh:'景點', en:'Attraction', ko:'명소', ja:'観光地' },
  cat_food:       { zh:'美食', en:'Food', ko:'맛집', ja:'グルメ' },
  cat_cafe:       { zh:'咖啡', en:'Cafe', ko:'카페', ja:'カフェ' },
  cat_transport:  { zh:'交通', en:'Transport', ko:'교통', ja:'交通' },
  cat_work:       { zh:'工作', en:'Work', ko:'업무', ja:'仕事' },
  cat_hotel:      { zh:'住宿', en:'Hotel', ko:'숙소', ja:'宿泊' },
  cat_shopping:   { zh:'購物', en:'Shopping', ko:'쇼핑', ja:'ショッピング' },
  cat_personal:   { zh:'個人', en:'Personal', ko:'개인', ja:'個人' },

  // ── City labels ──
  city_busan:   { zh:'釜山', en:'Busan', ko:'부산', ja:'釜山' },
  city_aso:     { zh:'阿蘇/熊本', en:'Aso/Kumamoto', ko:'아소/구마모토', ja:'阿蘇/熊本' },
  city_fukuoka: { zh:'福岡', en:'Fukuoka', ko:'후쿠오카', ja:'福岡' },
  scity_busan:    { zh:'釜山', en:'Busan', ko:'부산', ja:'釜山' },
  scity_ferry:    { zh:'釜山→渡輪', en:'Busan→Ferry', ko:'부산→페리', ja:'釜山→フェリー' },
  scity_aso:      { zh:'阿蘇/熊本', en:'Aso/Kumamoto', ko:'아소/구마모토', ja:'阿蘇/熊本' },
  scity_dazaifu:  { zh:'太宰府+柳川', en:'Dazaifu+Yanagawa', ko:'다자이후+야나가와', ja:'太宰府+柳川' },
  scity_itoshima: { zh:'糸島', en:'Itoshima', ko:'이토시마', ja:'糸島' },
  scity_fukuoka:  { zh:'福岡', en:'Fukuoka', ko:'후쿠오카', ja:'福岡' },

  // ── Day names (Sun-Sat) ──
  day_names: {
    zh: ['日','一','二','三','四','五','六'],
    en: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],
    ko: ['일','월','화','수','목','금','토'],
    ja: ['日','月','火','水','木','金','土']
  },

  // ── Stats labels ──
  stat_total:     { zh:'預估總費用', en:'Est. Total', ko:'총 예상 비용', ja:'総費用（税込）' },
  stat_total_sub: { zh:'含機酒', en:'incl. flights & hotel', ko:'항공+숙박 포함', ja:'航空券・宿泊込' },
  stat_pois:      { zh:'景點數量', en:'Spots', ko:'명소 수', ja:'スポット数' },
  stat_pois_sub:  { zh:'3 個城市', en:'3 cities', ko:'3개 도시', ja:'3都市' },
  stat_daily:     { zh:'每日均消', en:'Daily Avg.', ko:'일일 평균', ja:'日平均' },
  stat_daily_sub: { zh:'不含機酒', en:'excl. flights & hotel', ko:'항공+숙박 제외', ja:'航空券・宿泊除く' },
  stat_work:      { zh:'工作天數', en:'Work Days', ko:'근무일', ja:'勤務日' },
  stat_work_sub:  { zh:'福岡 4/7–4/10', en:'Fukuoka 4/7–4/10', ko:'후쿠오카 4/7–4/10', ja:'福岡 4/7–4/10' },

  // ── Buttons & labels ──
  btn_all:        { zh:'全部', en:'All', ko:'전체', ja:'すべて' },
  btn_workspace:  { zh:'工作空間', en:'Workspace', ko:'작업공간', ja:'作業場' },
  btn_export_geo: { zh:'匯出 GeoJSON', en:'Export GeoJSON', ko:'GeoJSON 내보내기', ja:'GeoJSON出力' },
  btn_export_gm:  { zh:'匯出 Google Maps', en:'Export Google Maps', ko:'Google Maps 내보내기', ja:'Google Maps出力' },
  lbl_free:       { zh:'免費', en:'Free', ko:'무료', ja:'無料' },
  lbl_booked:     { zh:'已購', en:'Booked', ko:'구매완료', ja:'購入済' },
  lbl_pending:    { zh:'待訂', en:'Pending', ko:'미구매', ja:'未購入' },

  // ── Calendar ──
  cal_week1: { zh:'Week 1（3/30–4/5）', en:'Week 1 (3/30–4/5)', ko:'1주차 (3/30–4/5)', ja:'第1週 (3/30–4/5)' },
  cal_week2: { zh:'Week 2（4/6–4/12）', en:'Week 2 (4/6–4/12)', ko:'2주차 (4/6–4/12)', ja:'第2週 (4/6–4/12)' },

  // ── Booking ──
  booking_booked:    { zh:'已預訂項目', en:'Booked Items', ko:'예약 완료 항목', ja:'予約済み項目' },
  booking_compare:   { zh:'票券比價（未購）', en:'Ticket Comparison (Not Booked)', ko:'티켓 비교 (미구매)', ja:'チケット比較（未購入）' },
  booking_recommend: { zh:'建議購買', en:'Recommended', ko:'구매 추천', ja:'おすすめ' },
  booking_subtitle:  { zh:'已購 / 未購 / 建議購買', en:'Booked / Not Booked / Recommended', ko:'구매완료 / 미구매 / 추천', ja:'購入済 / 未購入 / おすすめ' },
  booking_th_item:   { zh:'項目', en:'Item', ko:'항목', ja:'項目' },
  booking_th_official:{ zh:'官網', en:'Official', ko:'공식', ja:'公式' },
  booking_th_klook:  { zh:'Klook', en:'Klook', ko:'Klook', ja:'Klook' },
  booking_th_kkday:  { zh:'KKday', en:'KKday', ko:'KKday', ja:'KKday' },
  booking_th_suggest:{ zh:'建議', en:'Suggestion', ko:'추천', ja:'おすすめ' },
  booking_buy_onsite:{ zh:'現場買即可', en:'Buy on-site', ko:'현장 구매', ja:'現地購入OK' },
  booking_same_price:{ zh:'都一樣，現場買即可', en:'Same price, buy on-site', ko:'가격 동일, 현장 구매', ja:'同価格、現地購入OK' },
  booking_kkday_save:{ zh:'★ KKday 省40%', en:'★ KKday saves 40%', ko:'★ KKday 40% 할인', ja:'★ KKday 40%お得' },
  booking_klook_excl:{ zh:'★ Klook 獨家', en:'★ Klook Exclusive', ko:'★ Klook 독점', ja:'★ Klook限定' },
  booking_official_best:{ zh:'★ 官方最便宜', en:'★ Official cheapest', ko:'★ 공식 최저가', ja:'★ 公式が最安' },
  booking_pass_not_worth:{ zh:'只去塔+X the Sky 不划算', en:'Tower + X the Sky only — not worth it', ko:'타워+X the Sky만 방문 시 비추', ja:'タワー+X the Skyだけなら割高' },
  booking_recommend_title:{ zh:'⏳ 建議購買', en:'⏳ Recommended to Buy', ko:'⏳ 구매 추천', ja:'⏳ 購入おすすめ' },
  booking_checkin_note: { zh:'線上報到 Web Check-in（起飛前 48hr – 1hr 開放）', en:'Web Check-in (opens 48hr – 1hr before departure)', ko:'웹 체크인 (출발 48시간 ~ 1시간 전)', ja:'ウェブチェックイン（出発48時間〜1時間前）' },
  booking_outbound:  { zh:'去程', en:'Outbound', ko:'출국편', ja:'往路' },
  booking_return:    { zh:'回程', en:'Return', ko:'귀국편', ja:'復路' },
  booking_total:     { zh:'來回合計', en:'Round-trip Total', ko:'왕복 합계', ja:'往復合計' },
  booking_map:       { zh:'地圖', en:'Map', ko:'지도', ja:'地図' },
  booking_meetpoint: { zh:'集合點', en:'Meeting Point', ko:'집합 장소', ja:'集合場所' },
  booking_rec_esim:  { zh:'韓日 eSIM 卡', en:'KR/JP eSIM Card', ko:'한일 eSIM 카드', ja:'韓日eSIMカード' },
  booking_rec_esim_note:{ zh:'Holafly ~NT$1,500/14天無限 or KKday 韓+日 combo。出發前購買啟用。', en:'Holafly ~NT$1,500/14 days unlimited or KKday KR+JP combo. Buy & activate before departure.', ko:'Holafly ~NT$1,500/14일 무제한 또는 KKday 한+일 combo. 출발 전 구매 활성화.', ja:'Holafly ~NT$1,500/14日無制限 or KKday 韓+日 combo。出発前に購入・有効化。' },
  booking_rec_tmoney:{ zh:'T-money 交通卡', en:'T-money Transit Card', ko:'T-money 교통카드', ja:'T-money交通カード' },
  booking_rec_tmoney_note:{ zh:'機場便利商店購買 ₩3,000–5,000（卡費+儲值），釜山地鐵公車通用', en:'Buy at airport convenience store ₩3,000–5,000 (card + top-up), works on Busan subway & bus', ko:'공항 편의점에서 구매 ₩3,000–5,000 (카드비+충전), 부산 지하철·버스 사용 가능', ja:'空港コンビニで購入 ₩3,000–5,000（カード代+チャージ）、釜山地下鉄・バス共通' },
  booking_rec_icoca: { zh:'ICOCA / Suica', en:'ICOCA / Suica', ko:'ICOCA / Suica', ja:'ICOCA / Suica' },
  booking_rec_icoca_note:{ zh:'Apple Pay 直接加入，福岡地鐵/巴士/便利商店都可用', en:'Add via Apple Pay, works on Fukuoka subway/bus/convenience stores', ko:'Apple Pay로 바로 추가, 후쿠오카 지하철/버스/편의점 사용 가능', ja:'Apple Payで追加、福岡地下鉄・バス・コンビニで利用可' },
  booking_rec_insurance:{ zh:'旅遊保險', en:'Travel Insurance', ko:'여행 보험', ja:'旅行保険' },
  booking_rec_insurance_note:{ zh:'14天旅遊平安險 + 海外突發疾病，約 NT$500–800', en:'14-day travel + overseas medical, ~NT$500–800', ko:'14일 여행자보험 + 해외 질병, 약 NT$500–800', ja:'14日間旅行保険＋海外疾病、約NT$500–800' },

  // ── Budget ──
  budget_subtitle:    { zh:'預估總額（含機酒） · 匯率 1 TWD ≈ 42 KRW / 5 JPY / 0.031 USD', en:'Estimated Total (incl. flights & hotel) · Rate: 1 TWD ≈ 42 KRW / 5 JPY / 0.031 USD', ko:'총 예상 금액 (항공+숙박 포함) · 환율: 1 TWD ≈ 42 KRW / 5 JPY / 0.031 USD', ja:'総見積（航空券・宿泊込） · レート: 1 TWD ≈ 42 KRW / 5 JPY / 0.031 USD' },
  budget_chart_city:  { zh:'城市花費分布', en:'Cost by City', ko:'도시별 비용 분포', ja:'都市別費用分布' },
  budget_city_ratio:  { zh:'城市花費比例', en:'City Cost Ratio', ko:'도시별 비용 비율', ja:'都市別費用割合' },
  budget_chart_cat:   { zh:'花費類別', en:'Cost by Category', ko:'카테고리별 비용', ja:'カテゴリ別費用' },
  budget_detail_list: { zh:'明細清單', en:'Detail List', ko:'상세 목록', ja:'明細一覧' },
  budget_actual_expenses: { zh:'實際花費', en:'Actual Expenses', ko:'실제 지출', ja:'実際の支出' },
  budget_mode_estimated: { zh:'預估', en:'Estimated', ko:'예상', ja:'予定' },
  budget_mode_actual:    { zh:'實際花費', en:'Actual', ko:'실제', ja:'実際' },
  budget_actual_total:   { zh:'實際總花費', en:'Actual Total', ko:'실제 총 지출', ja:'実際の合計' },
  budget_days:           { zh:'天', en:'days', ko:'일', ja:'日' },
  budget_prepurchased:   { zh:'已預購', en:'Pre-purchased', ko:'사전 구매', ja:'事前購入済' },
  budget_th_item:     { zh:'項目', en:'Item', ko:'항목', ja:'項目' },
  budget_th_city:     { zh:'城市', en:'City', ko:'도시', ja:'都市' },
  budget_th_amount:   { zh:'金額', en:'Amount', ko:'금액', ja:'金額' },
  budget_checked_total:{ zh:'勾選項目合計', en:'Checked Total', ko:'선택 항목 합계', ja:'チェック済み合計' },
  budget_items:       { zh:'項', en:'items', ko:'개 항목', ja:'件' },
  budget_checked:     { zh:'已勾選', en:'Checked', ko:'선택', ja:'チェック済' },

  // ── Time Allocation ──
  time_subtitle:      { zh:'24 個景點 · 3 個城市', en:'24 spots · 3 cities', ko:'24개 명소 · 3개 도시', ja:'24スポット · 3都市' },
  time_activity_chart:{ zh:'活動時間分配（點擊分類查看明細）', en:'Activity Time Distribution (click category for details)', ko:'활동 시간 배분 (카테고리 클릭시 상세)', ja:'アクティビティ時間配分（カテゴリクリックで詳細）' },
  time_city_days:     { zh:'城市停留天數', en:'Days per City', ko:'도시별 체류일', ja:'都市別滞在日数' },
  time_daily_dist:    { zh:'每日時間分佈', en:'Daily Time Distribution', ko:'일별 시간 분포', ja:'日別時間分布' },
  time_city_hours:    { zh:'各城市時數', en:'Hours per City', ko:'도시별 시간', ja:'都市別時間' },
  time_daily_hours:   { zh:'每日時數', en:'Daily Hours', ko:'일별 시간', ja:'日別時間' },
  time_days:          { zh:'天', en:'days', ko:'일', ja:'日' },
  time_countdown:     { zh:'出發倒數', en:'Countdown', ko:'출발 카운트다운', ja:'出発カウントダウン' },
  time_remaining:     { zh:'旅程剩餘', en:'Time Remaining', ko:'남은 여행 시간', ja:'残り時間' },
  time_ended:         { zh:'旅程結束', en:'Trip Ended', ko:'여행 종료', ja:'旅行終了' },
  time_no_data:       { zh:'此類別無資料', en:'No data for this category', ko:'해당 카테고리 데이터 없음', ja:'このカテゴリのデータなし' },
  time_today:         { zh:'今日行程', en:"Today's Itinerary", ko:'오늘 일정', ja:'今日の予定' },
  time_today_before:  { zh:'旅途尚未開始', en:'Trip hasn\'t started yet', ko:'아직 여행이 시작되지 않았습니다', ja:'旅はまだ始まっていません' },
  time_today_after:   { zh:'旅途已結束，感謝這趟旅程 ✈️', en:'Trip has ended. Thank you for this journey ✈️', ko:'여행이 끝났습니다. 이 여정에 감사합니다 ✈️', ja:'旅が終わりました。この旅に感謝 ✈️' },
  time_today_rest:    { zh:'今天沒有安排，自由探索吧！', en:'Nothing planned today — explore freely!', ko:'오늘은 일정이 없어요 — 자유롭게 탐험하세요!', ja:'今日は予定なし — 自由に探検しよう！' },
  time_transport_est: { zh:'交通時間', en:'Transport', ko:'이동 시간', ja:'移動時間' },
  time_walk_est:      { zh:'步行時間', en:'Walking', ko:'도보 시간', ja:'徒歩時間' },
  time_sunrise:       { zh:'日出', en:'Sunrise', ko:'일출', ja:'日の出' },
  time_sunset:        { zh:'日落', en:'Sunset', ko:'일몰', ja:'日の入り' },
  time_golden_hour:   { zh:'Golden Hour', en:'Golden Hour', ko:'골든아워', ja:'ゴールデンアワー' },
  time_weather_title: { zh:'14天天氣預報', en:'14-Day Weather Forecast', ko:'14일 날씨 예보', ja:'14日間天気予報' },
  time_next:          { zh:'接下來', en:'Next', ko:'다음', ja:'次' },
  time_now:           { zh:'現在進行', en:'Now', ko:'현재', ja:'進行中' },
  time_day_prefix:    { zh:'Day', en:'Day', ko:'Day', ja:'Day' },

  // ── Time category labels (for time allocation charts) ──
  tcat_attraction:    { zh:'景點觀光', en:'Sightseeing', ko:'관광', ja:'観光' },
  tcat_work:          { zh:'工作', en:'Work', ko:'업무', ja:'仕事' },
  tcat_food:          { zh:'餐飲', en:'Dining', ko:'식사', ja:'食事' },
  tcat_transport:     { zh:'交通移動', en:'Transport', ko:'교통 이동', ja:'移動' },
  tcat_shopping:      { zh:'購物', en:'Shopping', ko:'쇼핑', ja:'ショッピング' },
  tcat_cafe:          { zh:'咖啡/工作', en:'Cafe/Work', ko:'카페/업무', ja:'カフェ/仕事' },
  tcat_hotel:         { zh:'住宿休息', en:'Hotel/Rest', ko:'숙소/휴식', ja:'宿泊/休憩' },
  tcat_other:         { zh:'其他', en:'Other', ko:'기타', ja:'その他' },
  cat_other:          { zh:'雜費', en:'Other', ko:'기타', ja:'その他' },

  // ── Filter (shared) ──
  filter_label:       { zh:'篩選', en:'Filter', ko:'필터', ja:'フィルター' },
  filter_clear:       { zh:'清除篩選', en:'Clear filter', ko:'필터 해제', ja:'フィルター解除' },

  // ── Nomad / Work section ──
  nomad_title:        { zh:'福岡 Work Mode 推薦工作地點', en:'Fukuoka Work Mode Recommended Workspaces', ko:'후쿠오카 Work Mode 추천 작업 공간', ja:'福岡 Work Mode おすすめワークスペース' },
  nomad_local_hours:  { zh:'當地10:00-18:00', en:'Local 10:00-18:00', ko:'현지 10:00-18:00', ja:'現地10:00-18:00' },
  nomad_free:         { zh:'免費', en:'Free', ko:'무료', ja:'無料' },
  nomad_outlets:      { zh:'插座完備', en:'Power outlets', ko:'콘센트 완비', ja:'コンセント完備' },
  nomad_wifi:         { zh:'高速WiFi', en:'Fast WiFi', ko:'고속 WiFi', ja:'高速WiFi' },
  nomad_has_wifi:     { zh:'有WiFi', en:'WiFi available', ko:'WiFi 있음', ja:'WiFiあり' },
  nomad_techbooks:    { zh:'技術書籍', en:'Tech books', ko:'기술 서적', ja:'技術書籍' },
  nomad_consult:      { zh:'可免費諮詢', en:'Free consultation', ko:'무료 상담 가능', ja:'無料相談可' },
  nomad_covers:       { zh:'✅覆蓋10:00-18:00', en:'✅ Covers 10:00-18:00', ko:'✅ 10:00-18:00 커버', ja:'✅ 10:00-18:00カバー' },
  nomad_covers_open:  { zh:'✅覆蓋(剛好10:00開)', en:'✅ Covers (opens at 10:00)', ko:'✅ 커버 (10:00 오픈)', ja:'✅ カバー（10:00開店）' },

  // ── Checklist ──
  checklist_subtitle: { zh:'出發前確認事項', en:'Pre-departure Checklist', ko:'출발 전 확인사항', ja:'出発前チェック事項' },

  // ── Clock labels ──
  clock_dest:  { zh:'KR / JP', en:'KR / JP', ko:'한/일', ja:'韓/日' },
  clock_home:  { zh:'TW', en:'TW', ko:'TW', ja:'TW' },
  clock_hour:  { zh:'HOUR', en:'HOUR', ko:'시', ja:'時' },
  clock_min:   { zh:'MIN', en:'MIN', ko:'분', ja:'分' },

  // ── Info box ──
  info_cherry: { zh:'3/30–4/12 賞櫻最佳時段！釜山櫻花 3月底盛開、福岡西公園百大櫻花名所到 4/10。匯率：1 TWD ≈ 42 KRW / 5 JPY',
                 en:'3/30–4/12 Peak cherry blossom! Busan blooms late March, Fukuoka Nishi Park (Top 100) until 4/10. Rate: 1 TWD ≈ 42 KRW / 5 JPY',
                 ko:'3/30–4/12 벚꽃 최적 시기! 부산 3월 말 만개, 후쿠오카 니시공원 100대 벚꽃명소 4/10까지. 환율: 1 TWD ≈ 42 KRW / 5 JPY',
                 ja:'3/30–4/12 桜の見頃！釜山は3月末満開、福岡西公園（桜百選）4/10まで。レート：1 TWD ≈ 42 KRW / 5 JPY' },

  // ── Today overlay ──
  today_days_left: { zh:'天後出發', en:'days until departure', ko:'일 후 출발', ja:'日後に出発' },
  today_enter:     { zh:'進入行程規劃 →', en:'Enter Trip Planner →', ko:'여행 플래너 열기 →', ja:'旅行プランナーへ →' },
  today_start:     { zh:'開始旅行 →', en:'Start Journey →', ko:'여행 시작 →', ja:'旅を始める →' },
  today_now:       { zh:'現在', en:'Now', ko:'지금', ja:'現在' },
  today_next:      { zh:'接下來', en:'Next', ko:'다음', ja:'次' },
  today_free:      { zh:'自由時間 ☕', en:'Free Time ☕', ko:'자유시간 ☕', ja:'フリータイム ☕' },
  today_events:    { zh:'個行程', en:'events today', ko:'개 일정', ja:'件の予定' },
  today_morning:   { zh:'上午', en:'Morning', ko:'오전', ja:'午前' },
  today_afternoon: { zh:'下午', en:'Afternoon', ko:'오후', ja:'午後' },
  today_evening:   { zh:'晚上', en:'Evening', ko:'저녁', ja:'夜' },
  today_ended:     { zh:'旅程已結束', en:'Trip Completed', ko:'여행 완료', ja:'旅行終了' },

  // Pre-trip todos
  today_todo_title: { zh:'現在可以做的事', en:'Things to do now', ko:'지금 할 수 있는 것', ja:'今できること' },
  today_first:      { zh:'第一個行程', en:'First event', ko:'첫 일정', ja:'最初の予定' },
  todo_pack:        { zh:'整理行李', en:'Pack your bags', ko:'짐 싸기', ja:'荷造り' },
  todo_passport:    { zh:'確認護照 · 放在隨身包', en:'Check passport · keep in carry-on', ko:'여권 확인 · 기내용 가방에', ja:'パスポート確認 · 手荷物に' },
  todo_esim:        { zh:'安裝 eSIM 並測試', en:'Install & test eSIM', ko:'eSIM 설치 및 테스트', ja:'eSIMインストール＆テスト' },
  todo_cash:        { zh:'換外幣 / 準備現金', en:'Exchange currency / prepare cash', ko:'환전 / 현금 준비', ja:'外貨両替 / 現金準備' },
  todo_charger:     { zh:'充電器 · 行動電源 · 韓國需圓頭轉接頭（Type C/F）', en:'Charger · power bank · Korea needs round adapter (Type C/F)', ko:'충전기 · 보조배터리 · 한국 어댑터 (Type C/F)', ja:'充電器・モバイルバッテリー・韓国は丸型変換プラグ必要（Type C/F）' },
  todo_checkin:     { zh:'線上報到 Web Check-in（起飛前48hr開放）', en:'Web Check-in (opens 48hr before)', ko:'온라인 체크인 (출발 48시간 전 오픈)', ja:'Webチェックイン（出発48時間前オープン）' },
  todo_tickets:     { zh:'確認所有票券 · 列印 QR code', en:'Confirm all tickets · print QR codes', ko:'모든 티켓 확인 · QR코드 출력', ja:'全チケット確認・QRコード印刷' },
  todo_hotel:       { zh:'確認住宿預訂', en:'Confirm hotel bookings', ko:'숙소 예약 확인', ja:'宿泊予約確認' },
  todo_weather:     { zh:'查看目的地天氣預報', en:'Check destination weather forecast', ko:'목적지 날씨 확인', ja:'目的地の天気予報確認' },
  todo_itinerary:   { zh:'確認行程規劃完整', en:'Review full itinerary', ko:'전체 일정 확인', ja:'旅程プラン最終確認' },
  todo_flights:     { zh:'確認機票預訂', en:'Confirm flight bookings', ko:'항공권 예약 확인', ja:'航空券予約確認' },

  // Photo upload
  today_upload_hint: { zh:'上傳這趟旅行最期待的景點照片', en:'Upload a photo of your most anticipated spot', ko:'가장 기대되는 여행지 사진 업로드', ja:'最も楽しみなスポットの写真をアップロード' },
  today_upload_btn:  { zh:'選擇照片', en:'Choose photo', ko:'사진 선택', ja:'写真を選択' },
  today_change_photo:{ zh:'更換照片', en:'Change photo', ko:'사진 변경', ja:'写真を変更' },
  today_entry_title: { zh:'入境必辦（點擊前往）', en:'Entry Requirements (tap to open)', ko:'입국 필수 (탭하여 열기)', ja:'入国必須手続き（タップで開く）' }
};

// Helper: get translated string
function t(key) {
  const entry = I18N[key];
  if (!entry) return key;
  return entry[currentLang] || entry.zh || key;
}

function getCityLabel(city) {
  const key = 'city_' + city;
  return t(key) || city;
}
function getCityName(city) { return getCityLabel(city); }

function getCatName(cat) {
  const key = 'cat_' + cat;
  return t(key) || cat;
}

function getDayNames() {
  return I18N.day_names[currentLang] || I18N.day_names.zh;
}

function getEventName(ev) {
  if (currentLang === 'en' && ev.name_en) return ev.name_en;
  if (currentLang === 'ko' && ev.name_ko) return ev.name_ko;
  if (currentLang === 'ja' && ev.name_ja) return ev.name_ja;
  return ev.name;
}
function getEventNote(ev) {
  if (currentLang === 'en' && ev.note_en) return ev.note_en;
  if (currentLang === 'ko' && ev.note_ko) return ev.note_ko;
  if (currentLang === 'ja' && ev.note_ja) return ev.note_ja;
  return ev.note || '';
}
function translateCity(cityStr) {
  const map = {
    '釜山': {en:'Busan', ko:'부산', ja:'釜山'},
    '阿蘇/熊本': {en:'Aso/Kumamoto', ko:'아소/구마모토', ja:'阿蘇/熊本'},
    '太宰府+柳川': {en:'Dazaifu+Yanagawa', ko:'다자이후+야나가와', ja:'太宰府+柳川'},
    '福岡': {en:'Fukuoka', ko:'후쿠오카', ja:'福岡'},
    '釜山→渡輪': {en:'Busan→Ferry', ko:'부산→페리', ja:'釜山→フェリー'}
  };
  const t = map[cityStr];
  if (!t) return cityStr;
  return t[currentLang] || cityStr;
}

function cycleLang() {
  const idx = LANGS.indexOf(currentLang);
  currentLang = LANGS[(idx + 1) % LANGS.length];
  applyLang();
}

function applyLang() {
  // Update all elements with data-i18n attribute
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    el.textContent = t(key);
  });

  // Update POI names throughout the page (legacy support)
  document.querySelectorAll('[data-name-zh][data-name-local]').forEach(el => {
    if (currentLang === 'ko' || currentLang === 'ja') {
      el.textContent = el.dataset.nameLocal || el.dataset.nameZh;
    } else {
      el.textContent = el.dataset.nameZh;
    }
  });

  // Update the toggle button indicator
  const sbBtn = document.getElementById('lang-toggle-sb');
  if (sbBtn) sbBtn.title = LANG_LABELS[currentLang];

  // Update bottom bar label
  const bbLabel = document.querySelector('#lang-toggle-bb .bb-label');
  if (bbLabel) bbLabel.textContent = t('nav_lang');

  // Re-render POI list, calendar, and budget to pick up language change
  safe('renderToday', renderToday);
  safe('renderPOIs', () => renderPOIs(currentFilter));
  safe('renderCalendar', () => renderCalendar(currentWeek));
  safe('renderBudget', renderBudget);
  safe('timeAlloc', renderTimeAllocation);
  safe('overviewExtras', renderOverviewExtras);
  safe('renderNomadSpots', renderNomadSpots);
  safe('updateClocks', updateClocks);
  safe('renderChecklist', renderChecklist);
  safe('renderEntryForms', renderEntryForms);
}

function createLangMenu(anchor, position) {
  const menu = document.createElement('div');
  menu.className = 'lang-menu ' + position;
  menu.innerHTML = LANGS.map(l =>
    '<button class="lang-option' + (l === currentLang ? ' active' : '') + '" data-lang="' + l + '">' +
    LANG_LABELS[l] + '</button>'
  ).join('');
  anchor.style.position = 'relative';
  anchor.appendChild(menu);

  anchor.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    document.querySelectorAll('.lang-menu').forEach(m => {
      if (m !== menu) m.classList.remove('show');
    });
    menu.classList.toggle('show');
  });

  menu.addEventListener('click', (e) => {
    e.stopPropagation();
    const opt = e.target.closest('.lang-option');
    if (!opt) return;
    currentLang = opt.dataset.lang;
    document.querySelectorAll('.lang-option').forEach(o => o.classList.toggle('active', o.dataset.lang === currentLang));
    document.querySelectorAll('.lang-menu').forEach(m => m.classList.remove('show'));
    applyLang();
  });

  return menu;
}

function initLangToggle() {
  const sbBtn = document.getElementById('lang-toggle-sb');
  const bbBtn = document.getElementById('lang-toggle-bb');
  if (sbBtn) createLangMenu(sbBtn, 'pos-right');
  if (bbBtn) createLangMenu(bbBtn, 'pos-top');
  document.addEventListener('click', function() {
    document.querySelectorAll('.lang-menu').forEach(m => m.classList.remove('show'));
    var moreMenu = document.getElementById('bb-more-menu');
    if (moreMenu) moreMenu.classList.remove('open');
  });
}

// ── Today overlay ──
function renderToday() {
  const overlay = document.getElementById('today-overlay');
  if (!overlay || !TRIP) return;
  // Lock body scroll while overlay is visible
  document.body.classList.add('overlay-open');

  const now = new Date();
  const today = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
  const tripStart = new Date(TRIP.startDate + 'T00:00:00');
  const tripEnd = new Date(TRIP.endDate + 'T23:59:59');
  const nowHour = now.getHours() + now.getMinutes() / 60;

  // Find today's schedule
  const todaySchedule = TRIP.schedule.find(d => d.date === today);

  // On start date, show BEFORE trip until first event begins (e.g., still at airport)
  var firstEvStart = todaySchedule ? todaySchedule.events[0] : null;
  var showBeforeTrip = now < tripStart || (today === TRIP.startDate && firstEvStart && nowHour < firstEvStart.sh);

  if (showBeforeTrip) {
    // BEFORE TRIP — countdown + pre-trip todos
    const startDay = new Date(TRIP.startDate + 'T00:00:00');
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const daysLeft = Math.ceil((startDay - todayMidnight) / 86400000);

    // Pre-trip action items based on days remaining
    var todos = [];
    var mi = function(name) { return '<span class="mi material-symbols-outlined" style="font-size:20px">' + name + '</span>'; };
    if (daysLeft <= 1) {
      todos = [
        {icon:mi('luggage'), text:t('todo_pack')},
        {icon:mi('badge'), text:t('todo_passport')},
        {icon:mi('sim_card'), text:t('todo_esim')},
        {icon:mi('currency_exchange'), text:t('todo_cash')},
        {icon:mi('power'), text:t('todo_charger')},
        {icon:mi('flight_takeoff'), text:t('todo_checkin'), url:'https://booking.tigerairtw.com/CheckIn/CheckIn'}
      ];
    } else if (daysLeft <= 3) {
      todos = [
        {icon:mi('luggage'), text:t('todo_pack')},
        {icon:mi('sim_card'), text:t('todo_esim')},
        {icon:mi('currency_exchange'), text:t('todo_cash')},
        {icon:mi('confirmation_number'), text:t('todo_tickets')},
        {icon:mi('hotel'), text:t('todo_hotel')},
        {icon:mi('cloud'), text:t('todo_weather')}
      ];
    } else if (daysLeft <= 7) {
      todos = [
        {icon:mi('confirmation_number'), text:t('todo_tickets')},
        {icon:mi('hotel'), text:t('todo_hotel')},
        {icon:mi('sim_card'), text:t('todo_esim')},
        {icon:mi('cloud'), text:t('todo_weather')},
        {icon:mi('checklist'), text:t('todo_itinerary')}
      ];
    } else {
      todos = [
        {icon:mi('flight'), text:t('todo_flights')},
        {icon:mi('hotel'), text:t('todo_hotel')},
        {icon:mi('confirmation_number'), text:t('todo_tickets')},
        {icon:mi('checklist'), text:t('todo_itinerary')}
      ];
    }

    var todoHtml = '<div class="today-todos">' +
      '<div class="today-todos-label">' + t('today_todo_title') + '</div>';
    todos.forEach(function(item) {
      if (item.url) {
        todoHtml += '<div class="today-todo-item"><a href="' + item.url + '" target="_blank" style="display:flex;align-items:center;gap:10px;color:white;text-decoration:none;width:100%"><span class="today-todo-icon">' + item.icon + '</span>' + item.text + '</a></div>';
      } else {
        todoHtml += '<div class="today-todo-item"><span class="today-todo-icon">' + item.icon + '</span>' + item.text + '</div>';
      }
    });
    todoHtml += '</div>';

    // First event of the trip
    var firstDay = TRIP.schedule[0];
    var firstEv = firstDay ? firstDay.events[0] : null;
    var firstEvHtml = '';
    if (firstEv) {
      firstEvHtml = '<div class="today-first-event">' +
        '<div class="today-todos-label">' + t('today_first') + '</div>' +
        '<div class="today-todo-item"><span class="today-todo-icon"><span class="mi material-symbols-outlined" style="font-size:20px">flight_takeoff</span></span>' + getEventName(firstEv) + (firstEv.note ? ' · ' + getEventNote(firstEv) : '') + '</div>' +
      '</div>';
    }

    var tagline = TRIP.tagline ? (TRIP.tagline[currentLang] || TRIP.tagline.zh || '') : '';

    // Entry requirements
    var entryHtml = '';
    if (TRIP.entryRequirements) {
      var pendingItems = [];
      TRIP.entryRequirements.forEach(function(country) {
        country.items.forEach(function(item) {
          if (item.status !== 'done') {
            var taskText = item.task[currentLang] || item.task.zh;
            var deadlineText = item.deadline[currentLang] || item.deadline.zh;
            pendingItems.push({task: taskText, deadline: deadlineText, url: item.url, country: country.name[currentLang] || country.name.zh});
          }
        });
      });
      if (pendingItems.length > 0) {
        entryHtml = '<div class="today-todos" style="margin-top:24px">' +
          '<div class="today-todos-label">' + mi('travel_explore') + ' ' + t('today_entry_title') + '</div>';
        pendingItems.forEach(function(item) {
          entryHtml += '<div class="today-todo-item">' +
            (item.url ? '<a href="' + item.url + '" target="_blank" style="display:flex;align-items:center;gap:10px;color:white;text-decoration:none;width:100%">' : '<div style="display:flex;align-items:center;gap:10px;width:100%">') +
            '<span class="today-todo-icon">' + mi('open_in_new') + '</span>' +
            '<div><div>' + item.task + '</div><div style="font-size:.7rem;opacity:.6;margin-top:2px">' + item.deadline + '</div></div>' +
            (item.url ? '</a>' : '</div>') +
          '</div>';
        });
        entryHtml += '</div>';
      }
    }

    overlay.innerHTML =
      '<div class="today-countdown">' +
        '<div class="today-countdown-num">' + daysLeft + '</div>' +
        '<div class="today-countdown-label">' + t('today_days_left') + '</div>' +
        '<div class="today-dest">' + TRIP.destination + '</div>' +
        (tagline ? '<div class="today-tagline">' + tagline + '</div>' : '') +
        '<div class="today-status">' + TRIP.startDate.replace(/-/g, '/') + ' – ' + TRIP.endDate.replace(/-/g, '/') + '</div>' +
        entryHtml + todoHtml + firstEvHtml +
        '<div class="today-enter"><button class="today-enter-btn" onclick="dismissToday()">' + t('today_start') + '</button></div>' +
      '</div>';

  } else if (todaySchedule) {
    // DURING TRIP — left-aligned glassmorphism style, matching BEFORE trip aesthetic
    const d = new Date(today + 'T00:00:00');
    const dayNames = getDayNames();
    const cityName = translateCity(todaySchedule.city);
    const tripStartDate = new Date(TRIP.startDate + 'T00:00:00');
    const dayNum = Math.ceil((d - tripStartDate) / 86400000) + 1;

    var formatTime = function(h) {
      var hh = Math.floor(h);
      var mm = Math.round((h - hh) * 60);
      return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
    };

    var mi = function(name) { return '<span class="mi material-symbols-outlined" style="font-size:20px">' + name + '</span>'; };

    // Smart icon: flight-related events get flight icon, others use category icon
    var getEvIcon = function(ev) {
      var name = (ev.name || '').toLowerCase() + ' ' + (ev.name_en || '').toLowerCase();
      if (name.match(/機場|airport|飛機|flight|降落|起飛|空港|공항/)) return 'flight';
      var CAT_ICONS = {attraction:'attractions',food:'restaurant',cafe:'coffee',transport:'directions_transit',work:'laptop_mac',hotel:'hotel',shopping:'shopping_bag',personal:'bedtime'};
      return CAT_ICONS[ev.cat] || 'event';
    };

    // Split events into time periods
    var morningEvs = [], afternoonEvs = [], eveningEvs = [];
    todaySchedule.events.forEach(function(ev) {
      if (ev.sh < 12) morningEvs.push(ev);
      else if (ev.sh < 18) afternoonEvs.push(ev);
      else eveningEvs.push(ev);
    });

    // Find current and next events
    var currentEv = null, nextEv = null;
    for (var i = 0; i < todaySchedule.events.length; i++) {
      var ev = todaySchedule.events[i];
      if (nowHour >= ev.sh && nowHour < ev.eh) currentEv = ev;
      if (!nextEv && ev.sh > nowHour) nextEv = ev;
    }

    // Build event item HTML (glassmorphism card style)
    var buildEvItem = function(ev) {
      var icon = getEvIcon(ev);
      var timeStr = formatTime(ev.sh) + ' – ' + formatTime(ev.eh);
      var isActive = (nowHour >= ev.sh && nowHour < ev.eh);
      var activeStyle = isActive ? 'background:rgba(255,255,255,.22);border-color:rgba(255,255,255,.25)' : '';
      var html = '<div class="today-todo-item"' + (activeStyle ? ' style="' + activeStyle + '"' : '') + '>' +
        '<span class="today-todo-icon">' + mi(icon) + '</span>' +
        '<div style="flex:1">' +
          '<div>' + getEventName(ev) + '</div>' +
          '<div style="font-size:.7rem;opacity:.6;margin-top:2px">' + timeStr +
            (getEventNote(ev) ? ' · ' + getEventNote(ev) : '') +
          '</div>' +
          (ev.restaurant ? '<div style="font-size:.7rem;opacity:.6;margin-top:2px">' + ev.restaurant +
            (ev.map ? ' <a href="' + ev.map + '" target="_blank" style="color:rgba(255,255,255,.8)">📍</a>' : '') +
          '</div>' : '') +
        '</div>' +
      '</div>';
      return html;
    };

    // Build section HTML
    var buildSection = function(label, icon, events) {
      if (events.length === 0) return '';
      var html = '<div class="today-todos">' +
        '<div class="today-todos-label">' + mi(icon) + ' ' + label + '</div>';
      events.forEach(function(ev) { html += buildEvItem(ev); });
      html += '</div>';
      return html;
    };

    // Now/Next section — uses same today-todos wrapper as time period sections
    var nowSection = '';
    if (currentEv) {
      var nowIcon = getEvIcon(currentEv);
      nowSection = '<div class="today-todos">' +
        '<div class="today-todos-label">NOW · ' + t('today_now') + '</div>' +
        '<div class="today-todo-item" style="background:rgba(255,255,255,.2);border-color:rgba(255,255,255,.3)">' +
          '<span class="today-todo-icon">' + mi(nowIcon) + '</span>' +
          '<div style="flex:1"><div style="font-weight:600">' + getEventName(currentEv) + '</div>' +
          '<div style="font-size:.7rem;opacity:.6;margin-top:2px">' + formatTime(currentEv.sh) + ' – ' + formatTime(currentEv.eh) +
            (getEventNote(currentEv) ? ' · ' + getEventNote(currentEv) : '') + '</div></div>' +
        '</div></div>';
    } else if (nextEv) {
      var nextIcon = getEvIcon(nextEv);
      nowSection = '<div class="today-todos">' +
        '<div class="today-todos-label">NEXT · ' + t('today_next') + '</div>' +
        '<div class="today-todo-item">' +
          '<span class="today-todo-icon">' + mi(nextIcon) + '</span>' +
          '<div style="flex:1"><div style="font-weight:600">' + getEventName(nextEv) + '</div>' +
          '<div style="font-size:.7rem;opacity:.6;margin-top:2px">' + formatTime(nextEv.sh) + ' – ' + formatTime(nextEv.eh) + '</div></div>' +
        '</div></div>';
    } else {
      nowSection = '<div class="today-todos">' +
        '<div class="today-todos-label">NOW · ' + t('today_now') + '</div>' +
        '<div class="today-todo-item">' +
          '<span class="today-todo-icon">' + mi('coffee') + '</span>' +
          '<div style="flex:1"><div style="font-weight:600">' + t('today_free') + '</div></div>' +
        '</div></div>';
    }

    // Centered layout matching BEFORE trip, card content is left-aligned via flexbox
    var html = '<div class="today-countdown" style="padding-top:60px;min-height:auto">' +
      '<div class="today-countdown-label" style="font-size:.85rem;margin-bottom:4px">' + (d.getMonth()+1) + '/' + d.getDate() + ' ' + dayNames[d.getDay()] + ' · Day ' + dayNum + '</div>' +
      '<div class="today-dest">' + cityName + '</div>' +
      '<div class="today-status">' + todaySchedule.events.length + ' ' + t('today_events') + '</div>' +
      nowSection +
      buildSection(t('today_morning'), 'wb_sunny', morningEvs) +
      buildSection(t('today_afternoon'), 'wb_twilight', afternoonEvs) +
      buildSection(t('today_evening'), 'dark_mode', eveningEvs) +
      '<div class="today-enter"><button class="today-enter-btn" onclick="dismissToday()">' + t('today_enter') + '</button></div>' +
    '</div>';
    overlay.innerHTML = html;

  } else if (now > tripEnd) {
    // AFTER TRIP
    var totalDays = Math.ceil((new Date(TRIP.endDate + 'T23:59:59') - new Date(TRIP.startDate + 'T00:00:00')) / 86400000) + 1;
    var totalEvents = TRIP.schedule.reduce(function(sum, d) { return sum + d.events.length; }, 0);
    var cities = [];
    TRIP.schedule.forEach(function(d) { if (cities.indexOf(d.city) === -1) cities.push(d.city); });

    overlay.innerHTML =
      '<div class="today-countdown">' +
        '<div class="today-countdown-num" style="font-size:3rem">✈️</div>' +
        '<div class="today-countdown-label">' + t('today_ended') + '</div>' +
        '<div class="today-dest">' + TRIP.destination + '</div>' +
        '<div class="today-status">' + totalDays + ' days · ' + totalEvents + ' events · ' + cities.length + ' cities</div>' +
      '</div>' +
      '<div class="today-enter"><button class="today-enter-btn" onclick="dismissToday()">' + t('today_enter') + '</button></div>';

  } else {
    // Date in trip range but no schedule for today
    dismissToday();
    return;
  }
}

function dismissToday() {
  var overlay = document.getElementById('today-overlay');
  if (overlay) overlay.classList.add('hidden');
  document.body.classList.remove('overlay-open');
}

function uploadTodayPhoto(input) {
  var file = input.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    localStorage.setItem('trip-cover-photo', e.target.result);
    renderToday(); // re-render with new photo
  };
  reader.readAsDataURL(file);
}

// ── Safe runner ──
function safe(name, fn) {
  try { fn(); } catch(e) { console.error('[' + name + ']', e); }
}

// ── Init ──
document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  if (!TRIP) {
    document.querySelector('.main').innerHTML = '<h1 style="padding:40px">Error: Trip data failed to load. Check console.</h1>';
    return;
  }

  safe('today', renderToday);
  safe('tabs', initTabs);
  safe('filters', initFilters);

  // Leaflet might not be loaded yet (CDN delay) — wait briefly then init
  if (typeof L !== 'undefined') {
    safe('map', initMap);
  } else {
    // Wait for Leaflet to load
    const waitForLeaflet = setInterval(() => {
      if (typeof L !== 'undefined') {
        clearInterval(waitForLeaflet);
        safe('map', initMap);
        safe('gmaps', initGoogleMapsImport);
      }
    }, 100);
    // Give up after 5s
    setTimeout(() => {
      clearInterval(waitForLeaflet);
      if (typeof L === 'undefined') {
        console.warn('Leaflet failed to load');
        document.getElementById('map').innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-3);font-size:.85rem">地圖載入失敗 — 請確認網路連線</div>';
      }
    }, 5000);
  }

  safe('gmaps', initGoogleMapsImport);
  safe('weekPills', initWeekPills);
  safe('currency', initCurrency);
  safe('checklist', renderChecklist);
  safe('entryForms', renderEntryForms);
  safe('export', initExport);

  safe('renderPOIs', () => renderPOIs('all'));
  safe('renderCalendar', () => renderCalendar(1));
  safe('renderBudget', renderBudget);
  safe('renderBooking', renderBooking);
  safe('timeAlloc', initCountdown);
  safe('renderNomadSpots', renderNomadSpots);
  safe('clocks', initClocks);
  safe('poiModal', initPOIModal);
  safe('langToggle', initLangToggle);
});
