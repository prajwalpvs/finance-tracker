/* ===== Dashboard JS ===== */
'use strict';

const PAGE_SIZE = 50;

const CHART_COLORS = [
  '#a78bfa','#60a5fa','#f87171','#4ade80','#fbbf24',
  '#34d399','#fb923c','#e879f9','#38bdf8','#facc15',
  '#f472b6','#818cf8','#2dd4bf',
];

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

let allTransactions  = [];
let filteredTransactions = [];
let currentPage = 1;
let pieChart = null;
let barChart = null;

document.addEventListener('DOMContentLoaded', init);

async function init() {
  try {
    const res = await fetch('/api/data');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    allTransactions      = data.transactions || [];
    filteredTransactions = [...allTransactions];

    renderStatCards(data.summary);
    renderPieChart(data.summary.by_category);
    renderBarChart(data.summary.by_month);
    renderMerchants(data.summary.top_merchants);
    renderTips(data.tips);
    populateCategoryFilter();
    renderTable();
    bindControls();
    activeSidebarOnScroll();
  } catch (err) {
    console.error('Failed to load data:', err);
  }
}

// ---- Stat Cards ----
function renderStatCards(s) {
  const net = s.net;
  const dateRange = s.date_range;
  const rangeStr = dateRange.start
    ? `${fmt_date(dateRange.start)} – ${fmt_date(dateRange.end)}`
    : 'N/A';

  document.getElementById('stat-cards').innerHTML = `
    <div class="stat-card card-spent fade-in" style="animation-delay:.05s">
      <div class="stat-icon">💸</div>
      <div class="stat-label">Total Spent</div>
      <div class="stat-value grad-text-red">${fmt_money(s.total_spent)}</div>
      <div class="stat-sub">${s.transaction_count} transactions</div>
    </div>
    <div class="stat-card card-income fade-in" style="animation-delay:.1s">
      <div class="stat-icon">💰</div>
      <div class="stat-label">Total Income</div>
      <div class="stat-value grad-text-green">${fmt_money(s.total_income)}</div>
      <div class="stat-sub">Credits & deposits</div>
    </div>
    <div class="stat-card card-net fade-in" style="animation-delay:.15s">
      <div class="stat-icon">${net >= 0 ? '📈' : '📉'}</div>
      <div class="stat-label">Net Balance</div>
      <div class="stat-value" style="background:${net >= 0 ? 'linear-gradient(135deg,#10b981,#06b6d4)' : 'linear-gradient(135deg,#ef4444,#f97316)'};-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">
        ${net >= 0 ? '+' : ''}${fmt_money(net)}
      </div>
      <div class="stat-sub">Income minus expenses</div>
    </div>
    <div class="stat-card card-range fade-in" style="animation-delay:.2s">
      <div class="stat-icon">📅</div>
      <div class="stat-label">Date Range</div>
      <div class="stat-value" style="font-size:14px;font-weight:700;line-height:1.4;margin-top:4px;-webkit-text-fill-color:var(--purple)">${rangeStr}</div>
      <div class="stat-sub">${Object.keys(s.by_month || {}).length} month(s) of data</div>
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

  filteredTransactions = allTransactions.filter(t => {
    if (search && !t.description.toLowerCase().includes(search) &&
        !(t.category || '').toLowerCase().includes(search)) return false;
    if (cat  && t.category !== cat)  return false;
    if (type && t.type     !== type) return false;
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
      <tr class="fade-in" style="animation-delay:${Math.min(i,.2) * .03}s">
        <td style="color:var(--muted);font-size:12px;white-space:nowrap">${fmt_date(t.date)}</td>
        <td style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500" title="${esc(t.description)}">${esc(t.description)}</td>
        <td>
          <span class="cat-badge" style="background:${color}18;color:${color};border:1px solid ${color}30;font-size:11px">
            ${esc(t.category || 'Other')}
          </span>
        </td>
        <td><span class="badge badge-${t.type}">${t.type}</span></td>
        <td style="text-align:right;font-weight:700;background:${amtGrad};-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">
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
  document.getElementById('search-input').addEventListener('input', applyFilters);
  document.getElementById('category-filter').addEventListener('change', applyFilters);
  document.getElementById('type-filter').addEventListener('change', applyFilters);
  document.getElementById('sort-select').addEventListener('change', applyFilters);
}

// ---- Active nav on scroll ----
function activeSidebarOnScroll() {
  const sections = ['overview','charts','merchants','tips','transactions'];
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
