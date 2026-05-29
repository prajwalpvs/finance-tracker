/* ===== Dashboard JS ===== */
'use strict';

const PAGE_SIZE = 50;

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

const CAT_COLORS = {
  'Dining Out':     '#fb923c',
  'Groceries':      '#4ade80',
  'Transport':      '#60a5fa',
  'Shopping':       '#e879f9',
  'Entertainment':  '#a78bfa',
  'Subscriptions':  '#38bdf8',
  'Utilities':      '#fbbf24',
  'Health':         '#34d399',
  'Travel':         '#f472b6',
  'Rent & Housing': '#f87171',
  'Fitness':        '#2dd4bf',
  'Education':      '#818cf8',
  'Other':          '#64748b',
};

const ALL_CATEGORIES = [
  'Dining Out','Groceries','Transport','Shopping','Entertainment',
  'Subscriptions','Utilities','Health','Travel','Rent & Housing',
  'Fitness','Education','Other',
];

let allTransactions  = [];
let filteredTransactions = [];
let currentPage = 1;
let pieChart = null;
let barChart = null;
let lineChart = null;
let yoyChart  = null;

document.addEventListener('DOMContentLoaded', init);

async function init() {
  try {
    const res = await fetch('/api/data');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    allTransactions = data.transactions || [];
    allTransactions.forEach((t, i) => t._idx = i);
    filteredTransactions = [...allTransactions];

    renderStatCards(data.summary);
    renderPieChart(data.summary.by_category);
    renderBarChart(data.summary.by_month);
    renderLineChart(allTransactions);
    renderYoYChart(data.summary.by_month);
    renderMerchants(data.summary.top_merchants);
    renderTips(data.tips);
    populateCategoryFilter();
    renderTable();
    bindControls();
    activeSidebarOnScroll();
  } catch (err) {
    console.error('Failed to load data:', err);
    document.querySelector('.main-content')?.insertAdjacentHTML('afterbegin',
      `<div class="error-banner fade-in">⚠ Failed to load data. <a href="/">Upload again</a></div>`
    );
  }
}

// ---- Stat Cards ----
function renderStatCards(s) {
  const net = s.net;
  const dateRange = s.date_range;
  const rangeStr = dateRange.start
    ? `${fmt_date(dateRange.start)} – ${fmt_date(dateRange.end)}`
    : 'N/A';
  const validMonths = Object.keys(s.by_month || {}).filter(k => /^\d{4}-\d{2}$/.test(k));
  const monthCount = validMonths.length;
  const avgMonthly = s.avg_monthly_spend != null
    ? s.avg_monthly_spend
    : +(s.total_spent / Math.max(monthCount, 1)).toFixed(2);
  const avgTxn = s.avg_transaction != null ? s.avg_transaction : 0;

  // MoM trend arrow
  let momHtml = '';
  if (s.mom_pct != null) {
    const up = s.mom_pct > 0;
    const arrow = up ? '▲' : '▼';
    const color = up ? 'var(--red)' : 'var(--green)';
    momHtml = ` · <span style="color:${color}">${arrow} ${Math.abs(s.mom_pct)}% vs prev mo</span>`;
  }

  // Transfer note
  const xferHtml = (s.total_transfers > 0)
    ? `<div class="stat-sub" style="margin-top:4px;color:var(--muted)">${fmt_money(s.total_transfers)} in transfers excluded (${s.transfer_count || 0}×)</div>`
    : '';

  document.getElementById('stat-cards').innerHTML = `
    <div class="stat-card card-spent fade-in" style="animation-delay:.05s">
      <div class="stat-icon">💸</div>
      <div class="stat-label">Total Spent</div>
      <div class="stat-value grad-text-red">${fmt_money(s.total_spent)}</div>
      <div class="stat-sub">${s.transaction_count} transactions · avg ${fmt_money(avgTxn)}/txn${momHtml}</div>
      ${xferHtml}
    </div>
    <div class="stat-card card-income fade-in" style="animation-delay:.1s">
      <div class="stat-icon">💰</div>
      <div class="stat-label">True Income</div>
      <div class="stat-value grad-text-green">${fmt_money(s.total_income)}</div>
      <div class="stat-sub">Deposits & credits (transfers excluded)</div>
    </div>
    <div class="stat-card card-net fade-in" style="animation-delay:.15s">
      <div class="stat-icon">${net >= 0 ? '📈' : '📉'}</div>
      <div class="stat-label">Net Balance</div>
      <div class="stat-value" style="background:${net >= 0 ? 'linear-gradient(135deg,#10b981,#06b6d4)' : 'linear-gradient(135deg,#ef4444,#f97316)'};-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">
        ${net >= 0 ? '+' : ''}${fmt_money(net)}
      </div>
      <div class="stat-sub">True income minus expenses</div>
    </div>
    <div class="stat-card card-range fade-in" style="animation-delay:.2s">
      <div class="stat-icon">📅</div>
      <div class="stat-label">Avg / Month</div>
      <div class="stat-value grad-text">${fmt_money(avgMonthly)}</div>
      <div class="stat-sub">${rangeStr} · ${monthCount} month(s)</div>
    </div>
  `;
}

// ---- Pie Chart ----
function renderPieChart(byCategory) {
  const ctx = document.getElementById('pie-chart').getContext('2d');
  const labels = Object.keys(byCategory);
  const values = Object.values(byCategory);
  const colors = labels.map(l => CAT_COLORS[l] || '#64748b');

  if (pieChart) pieChart.destroy();
  pieChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors.map(c => c + 'cc'),
        borderColor: colors,
        borderWidth: 2,
        hoverOffset: 10,
        hoverBorderWidth: 3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: '#94a3b8',
            font: { size: 11, weight: '600' },
            padding: 14,
            boxWidth: 10,
            borderRadius: 4,
            usePointStyle: true,
            pointStyle: 'rectRounded',
          },
        },
        tooltip: {
          backgroundColor: 'rgba(11,15,35,.95)',
          borderColor: 'rgba(255,255,255,.1)',
          borderWidth: 1,
          padding: 12,
          callbacks: {
            label: ctx => `  ${ctx.label}: ${fmt_money(ctx.parsed)}`,
          },
        },
      },
    },
  });
}

// ---- Bar Chart ----
function renderBarChart(byMonth) {
  const ctx = document.getElementById('bar-chart').getContext('2d');
  const labels = Object.keys(byMonth);
  const values = Object.values(byMonth);

  // Gradient fill
  const gradient = ctx.createLinearGradient(0, 0, 0, 290);
  gradient.addColorStop(0, 'rgba(239,68,68,.85)');
  gradient.addColorStop(1, 'rgba(249,115,22,.35)');

  if (barChart) barChart.destroy();
  barChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Spending',
        data: values,
        backgroundColor: gradient,
        borderColor: 'rgba(239,68,68,.9)',
        borderWidth: 1,
        borderRadius: 8,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(11,15,35,.95)',
          borderColor: 'rgba(255,255,255,.1)',
          borderWidth: 1,
          padding: 12,
          callbacks: { label: ctx => `  ${fmt_money(ctx.parsed.y)}` },
        },
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,.04)', border: { display: false } },
          ticks: { color: '#64748b', font: { size: 11, weight: '600' } },
        },
        y: {
          grid: { color: 'rgba(255,255,255,.04)', border: { display: false } },
          ticks: {
            color: '#64748b', font: { size: 11, weight: '600' },
            callback: v => v >= 1000 ? `$${(v/1000).toFixed(1)}k` : `$${v}`,
          },
        },
      },
    },
  });
}

// ---- Line Chart (Daily Spending Trend) ----
function renderLineChart(transactions) {
  const canvas = document.getElementById('line-chart');
  if (!canvas) return;

  const daily = {};
  for (const t of transactions) {
    if (t.type !== 'expense' || !t.date) continue;
    daily[t.date] = (daily[t.date] || 0) + t.amount;
  }

  const dates = Object.keys(daily).sort();
  if (!dates.length) {
    canvas.parentElement.innerHTML = '<p style="color:var(--muted);text-align:center;padding:40px 0">No expense data to chart.</p>';
    return;
  }

  const labels = dates.map(fmt_date);
  const values = dates.map(d => +daily[d].toFixed(2));

  const gCtx = canvas.getContext('2d');
  const gradient = gCtx.createLinearGradient(0, 0, 0, 200);
  gradient.addColorStop(0, 'rgba(124,58,237,.45)');
  gradient.addColorStop(1, 'rgba(124,58,237,.0)');

  if (lineChart) lineChart.destroy();
  lineChart = new Chart(gCtx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Daily Spend',
        data: values,
        borderColor: '#a78bfa',
        borderWidth: 2,
        pointRadius: dates.length > 60 ? 0 : 3,
        pointHoverRadius: 6,
        pointBackgroundColor: '#a78bfa',
        fill: true,
        backgroundColor: gradient,
        tension: 0.4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(11,15,35,.95)',
          borderColor: 'rgba(255,255,255,.1)',
          borderWidth: 1,
          padding: 12,
          callbacks: { label: ctx => `  ${fmt_money(ctx.parsed.y)}` },
        },
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,.04)', border: { display: false } },
          ticks: {
            color: '#64748b',
            font: { size: 10, weight: '600' },
            maxTicksLimit: 12,
            maxRotation: 0,
          },
        },
        y: {
          grid: { color: 'rgba(255,255,255,.04)', border: { display: false } },
          ticks: {
            color: '#64748b', font: { size: 11, weight: '600' },
            callback: v => v >= 1000 ? `$${(v/1000).toFixed(1)}k` : `$${v}`,
          },
        },
      },
    },
  });
}

// ---- Year-over-Year Chart ----
function renderYoYChart(byMonth) {
  const canvas = document.getElementById('yoy-chart');
  if (!canvas) return;

  const yearData = {};
  for (const [key, val] of Object.entries(byMonth || {})) {
    const m = key.match(/^(\d{4})-(\d{2})$/);
    if (!m) continue;
    const year = m[1];
    const mo = parseInt(m[2], 10) - 1;
    if (!yearData[year]) yearData[year] = new Array(12).fill(0);
    yearData[year][mo] = val;
  }

  const years = Object.keys(yearData).sort();
  if (!years.length) {
    canvas.parentElement.innerHTML = '<p style="color:var(--muted);text-align:center;padding:40px 0">No data.</p>';
    return;
  }

  const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const YEAR_COLORS  = ['#a78bfa','#60a5fa','#4ade80','#fb923c','#f472b6'];

  const ctx = canvas.getContext('2d');
  if (yoyChart) yoyChart.destroy();
  yoyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: MONTH_LABELS,
      datasets: years.map((yr, i) => ({
        label: yr,
        data: yearData[yr],
        backgroundColor: YEAR_COLORS[i % YEAR_COLORS.length] + '99',
        borderColor:     YEAR_COLORS[i % YEAR_COLORS.length],
        borderWidth: 1,
        borderRadius: 4,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: { color: '#94a3b8', font: { size: 11, weight: '600' }, padding: 16, boxWidth: 10, usePointStyle: true },
        },
        tooltip: {
          backgroundColor: 'rgba(11,15,35,.95)',
          borderColor: 'rgba(255,255,255,.1)',
          borderWidth: 1,
          padding: 12,
          callbacks: { label: ctx => `  ${ctx.dataset.label}: ${fmt_money(ctx.parsed.y)}` },
        },
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,.04)', border: { display: false } },
          ticks: { color: '#64748b', font: { size: 11, weight: '600' } },
        },
        y: {
          grid: { color: 'rgba(255,255,255,.04)', border: { display: false } },
          ticks: {
            color: '#64748b', font: { size: 11, weight: '600' },
            callback: v => v >= 1000 ? `$${(v/1000).toFixed(1)}k` : `$${v}`,
          },
        },
      },
    },
  });
}

// ---- Inline Category Edit ----
window.editCategory = function(el) {
  const idx  = parseInt(el.dataset.idx, 10);
  const txn  = allTransactions[idx];
  if (!txn) return;

  const sel = document.createElement('select');
  sel.className = 'cat-edit-select';
  ALL_CATEGORIES.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    if (cat === txn.category) opt.selected = true;
    sel.appendChild(opt);
  });

  el.replaceWith(sel);
  sel.focus();

  const commit = async () => {
    const newCat = sel.value;
    txn.category = newCat;

    const color = CAT_COLORS[newCat] || '#64748b';
    const badge = document.createElement('span');
    badge.className = 'cat-badge cat-editable';
    badge.dataset.idx = idx;
    badge.style.cssText = `background:${color}18;color:${color};border:1px solid ${color}30;font-size:11px;cursor:pointer`;
    badge.textContent = newCat;
    badge.onclick = () => editCategory(badge);
    sel.replaceWith(badge);

    await fetch('/api/update-category', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: txn.date,
        description: txn.description,
        amount: txn.amount,
        category: newCat,
      }),
    });
  };

  sel.addEventListener('change', commit);
  sel.addEventListener('blur', commit);
};

// ---- Recategorize All ----
window.recategorizeAll = async function() {
  const btn = document.getElementById('recat-btn');
  if (btn) { btn.disabled = true; btn.textContent = '↺ Working…'; }
  try {
    const res = await fetch('/api/recategorize', { method: 'POST' });
    const d = await res.json();
    if (d.ok) {
      // Reload fresh data
      const r2 = await fetch('/api/data');
      const data = await r2.json();
      allTransactions = data.transactions || [];
      allTransactions.forEach((t, i) => t._idx = i);
      filteredTransactions = [...allTransactions];
      renderStatCards(data.summary);
      renderPieChart(data.summary.by_category);
      renderYoYChart(data.summary.by_month);
      renderMerchants(data.summary.top_merchants);
      renderTips(data.tips);
      populateCategoryFilter();
      applyFilters();
    }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '↺ Re-categorize'; }
  }
};

// ---- Merchants ----
function renderMerchants(merchants) {
  const tbody = document.getElementById('merchants-body');
  if (!merchants?.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="loading-row">No merchant data</td></tr>';
    return;
  }
  const maxTotal = merchants[0]?.total || 1;
  tbody.innerHTML = merchants.map((m, i) => {
    const rankClass = i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : '';
    const pct = Math.round((m.total / maxTotal) * 100);
    return `
      <tr class="fade-in" style="animation-delay:${i * .04}s">
        <td><div class="rank-badge ${rankClass}">${i + 1}</div></td>
        <td style="font-weight:600">${esc(m.name)}</td>
        <td><span class="badge" style="background:rgba(167,139,250,.12);color:#a78bfa;border:1px solid rgba(167,139,250,.2)">${m.count}×</span></td>
        <td class="amount-expense" style="background:linear-gradient(135deg,#ef4444,#f97316);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;font-weight:800">${fmt_money(m.total)}</td>
        <td>
          <div class="spend-bar-wrap">
            <div class="spend-bar"><div class="spend-bar-fill" style="width:${pct}%"></div></div>
            <span style="font-size:11px;color:var(--muted);width:32px;text-align:right">${pct}%</span>
          </div>
        </td>
      </tr>`;
  }).join('');
}

// ---- Tips ----
function renderTips(tips) {
  const grid = document.getElementById('tips-grid');
  if (!tips?.length) {
    grid.innerHTML = '<div class="no-tips">Upload more statements to unlock personalised savings tips.</div>';
    return;
  }
  grid.innerHTML = tips.map((tip, i) => `
    <div class="tip-card fade-in" style="animation-delay:${i * .08}s">
      <div class="tip-header">
        <div class="tip-icon">${tip.icon || '💡'}</div>
        <span class="tip-category">${esc(tip.category)}</span>
      </div>
      <p class="tip-message">${esc(tip.message)}</p>
      <div class="tip-savings">
        <div class="tip-stat">
          <span class="tip-stat-label">Current</span>
          <span class="tip-stat-value" style="color:var(--red)">${fmt_money(tip.current_spend)}</span>
        </div>
        <div class="tip-stat">
          <span class="tip-stat-label">Potential cut</span>
          <span class="tip-stat-value" style="color:var(--yellow)">${fmt_money(tip.suggested_cut)}</span>
        </div>
        <div class="tip-stat">
          <span class="tip-stat-label">Monthly save</span>
          <span class="tip-stat-value save">${fmt_money(tip.monthly_savings)}</span>
        </div>
      </div>
    </div>
  `).join('');
}

// ---- Category filter ----
function populateCategoryFilter() {
  const sel = document.getElementById('category-filter');
  [...new Set(allTransactions.map(t => t.category).filter(Boolean))].sort().forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat; opt.textContent = cat;
    sel.appendChild(opt);
  });
}

// ---- Table ----
function applyFilters() {
  const search = document.getElementById('search-input').value.toLowerCase();
  const cat    = document.getElementById('category-filter').value;
  const type   = document.getElementById('type-filter').value;
  const sort   = document.getElementById('sort-select').value;
  const from   = document.getElementById('date-from')?.value || '';
  const to     = document.getElementById('date-to')?.value   || '';

  filteredTransactions = allTransactions.filter(t => {
    if (search && !(t.description || '').toLowerCase().includes(search) &&
        !(t.category || '').toLowerCase().includes(search)) return false;
    if (cat  && t.category !== cat)  return false;
    if (type && t.type     !== type) return false;
    if (from && t.date < from) return false;
    if (to   && t.date > to)   return false;
    return true;
  });

  filteredTransactions.sort((a, b) => {
    switch (sort) {
      case 'date-desc':   return (b.date||'').localeCompare(a.date||'');
      case 'date-asc':    return (a.date||'').localeCompare(b.date||'');
      case 'amount-desc': return b.amount - a.amount;
      case 'amount-asc':  return a.amount - b.amount;
      case 'category':    return (a.category||'').localeCompare(b.category||'');
      default: return 0;
    }
  });

  currentPage = 1;
  renderTable();
}

function renderTable() {
  const tbody = document.getElementById('txn-body');
  const total = filteredTransactions.length;
  const start = (currentPage - 1) * PAGE_SIZE;
  const page  = filteredTransactions.slice(start, start + PAGE_SIZE);

  if (!page.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="loading-row">No transactions match your filters.</td></tr>';
    document.getElementById('pagination').innerHTML = '';
    return;
  }

  tbody.innerHTML = page.map((t, i) => {
    const color = CAT_COLORS[t.category] || '#64748b';
    const amtGrad = t.type === 'expense'
      ? 'linear-gradient(135deg,#ef4444,#f97316)'
      : 'linear-gradient(135deg,#10b981,#06b6d4)';
    return `
      <tr class="fade-in" style="animation-delay:${Math.min(i * .03, .2)}s">
        <td style="color:var(--muted);font-size:12px;white-space:nowrap">${fmt_date(t.date)}</td>
        <td style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500" title="${esc(t.description)}">${esc(t.description)}</td>
        <td>
          <span class="cat-badge cat-editable" data-idx="${t._idx}"
            style="background:${color}18;color:${color};border:1px solid ${color}30;font-size:11px"
            onclick="editCategory(this)" title="Click to change category">
            ${esc(t.category || 'Other')}
          </span>
        </td>
        <td><span class="badge badge-${t.type}">${t.type}</span></td>
        <td class="amount-${t.type}" style="text-align:right;font-weight:700;background:${amtGrad};-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">
          ${t.type === 'expense' ? '-' : '+'}${fmt_money(t.amount)}
        </td>
      </tr>`;
  }).join('');

  renderPagination(total);
}

function renderPagination(total) {
  const pages = Math.ceil(total / PAGE_SIZE);
  const el = document.getElementById('pagination');
  if (pages <= 1) { el.innerHTML = ''; return; }

  let html = `<button class="page-btn" onclick="goPage(${currentPage-1})" ${currentPage===1?'disabled':''}>‹</button>`;
  const start = Math.max(1, currentPage-2);
  const end   = Math.min(pages, currentPage+2);
  if (start > 1) html += `<button class="page-btn" onclick="goPage(1)">1</button>${start>2?'<span style="color:var(--muted);padding:0 4px">…</span>':''}`;
  for (let p=start; p<=end; p++)
    html += `<button class="page-btn${p===currentPage?' active':''}" onclick="goPage(${p})">${p}</button>`;
  if (end < pages) html += `${end<pages-1?'<span style="color:var(--muted);padding:0 4px">…</span>':''}<button class="page-btn" onclick="goPage(${pages})">${pages}</button>`;
  html += `<button class="page-btn" onclick="goPage(${currentPage+1})" ${currentPage===pages?'disabled':''}>›</button>`;

  el.innerHTML = html;
}

window.goPage = function(p) {
  const pages = Math.ceil(filteredTransactions.length / PAGE_SIZE);
  if (p < 1 || p > pages) return;
  currentPage = p;
  renderTable();
  document.getElementById('transactions').scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// ---- Controls ----
function bindControls() {
  document.getElementById('search-input').addEventListener('input', debounce(applyFilters, 250));
  document.getElementById('category-filter').addEventListener('change', applyFilters);
  document.getElementById('type-filter').addEventListener('change', applyFilters);
  document.getElementById('sort-select').addEventListener('change', applyFilters);
  document.getElementById('date-from')?.addEventListener('change', applyFilters);
  document.getElementById('date-to')?.addEventListener('change', applyFilters);
}

// ---- Active nav on scroll ----
function activeSidebarOnScroll() {
  const sections = ['overview','charts','yoy','merchants','tips','transactions'];
  const links = {};
  sections.forEach(id => {
    links[id] = document.querySelector(`.sidebar-nav a[href="#${id}"]`);
  });
  const observer = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        sections.forEach(id => links[id]?.classList.remove('active'));
        links[e.target.id]?.classList.add('active');
      }
    });
  }, { threshold: .3 });
  sections.forEach(id => {
    const el = document.getElementById(id);
    if (el) observer.observe(el);
  });
}

// ---- Export ----
window.exportCSV = () => { window.location.href = '/api/export'; };

// ---- Helpers ----
function fmt_money(val) {
  if (val == null || isNaN(val)) return '$0.00';
  return '$' + Number(val).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 });
}
function fmt_date(d) {
  if (!d) return '—';
  const [y,m,day] = d.split('-');
  return `${m}/${day}/${y}`;
}
function esc(str) {
  return String(str||'')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
