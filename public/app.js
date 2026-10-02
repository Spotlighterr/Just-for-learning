const CACHE_KEY = 'builderos-cache-v2';
const NAV = [
  ['today', '⌂', 'Today'],
  ['roadmap', '↗', 'Roadmap'],
  ['sessions', '◷', 'Study log'],
  ['code', '⌘', 'Code reading'],
  ['finance', '₫', 'Finance × Data'],
  ['mobile', '▣', 'Mobile'],
  ['certs', '✓', 'Certs & Costs'],
  ['resources', '↪', 'Resources'],
  ['system', '⚙', 'System']
];

let state = null;
let currentView = 'today';
let server = { online: false, revision: 0, updatedAt: null };
let pendingTimer = null;
let conflictPayload = null;

const $ = (selector) => document.querySelector(selector);
const view = $('#view');
const title = $('#page-title');
const syncPill = $('#sync-pill');
const syncLabel = $('#sync-label');
const conflictBanner = $('#conflict-banner');

function uid(prefix='id') {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function esc(value='') {
  return String(value).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[ch]));
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('vi-VN', { day:'2-digit', month:'2-digit', year:'numeric' });
}

function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('vi-VN');
}

function minutesLabel(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 1700);
}

function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); }
  catch { return null; }
}

function writeCache(dirty = true) {
  localStorage.setItem(CACHE_KEY, JSON.stringify({
    state,
    revision: server.revision,
    dirty,
    savedAt: new Date().toISOString()
  }));
}

function setSyncStatus(status, label) {
  syncPill.className = `sync-pill ${status}`;
  syncLabel.textContent = label;
}

async function fetchServerState() {
  const res = await fetch('/api/state', { cache: 'no-store' });
  if (!res.ok) throw new Error('Cannot load server state');
  return res.json();
}

async function syncNow(force = false) {
  if (!state) return;
  clearTimeout(pendingTimer);
  setSyncStatus('syncing', 'Đang đồng bộ…');

  try {
    const res = await fetch('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseRevision: server.revision, force, state })
    });

    if (res.status === 409) {
      const data = await res.json();
      conflictPayload = data.current;
      conflictBanner.classList.remove('hidden');
      setSyncStatus('conflict', 'Xung đột dữ liệu');
      return;
    }

    if (!res.ok) throw new Error('Sync failed');
    const data = await res.json();
    server = { online: true, revision: data.revision, updatedAt: data.updatedAt };
    conflictPayload = null;
    conflictBanner.classList.add('hidden');
    writeCache(false);
    setSyncStatus('synced', `Đã sync · r${server.revision}`);
    if (currentView === 'system') render();
  } catch (error) {
    server.online = false;
    writeCache(true);
    setSyncStatus('offline', 'Offline · lưu local');
  }
}

function scheduleSync() {
  clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => syncNow(false), 650);
}

function commit(message) {
  writeCache(true);
  render();
  scheduleSync();
  if (message) toast(message);
}

function overallProgress() {
  const topics = state.roadmap.flatMap(p => p.topics);
  const done = topics.filter(t => t.done).length;
  return { done, total: topics.length, pct: topics.length ? Math.round(done / topics.length * 100) : 0 };
}

function phaseProgress(phase) {
  const done = phase.topics.filter(t => t.done).length;
  return { done, total: phase.topics.length, pct: phase.topics.length ? Math.round(done / phase.topics.length * 100) : 0 };
}

function currentPhase() {
  return state.roadmap.find(p => p.topics.some(t => !t.done)) || state.roadmap[state.roadmap.length - 1];
}

function nextTasks(limit=5) {
  const tasks = [];
  for (const phase of state.roadmap) {
    for (const topic of phase.topics) {
      if (!topic.done) tasks.push({ phase, topic });
      if (tasks.length >= limit) return tasks;
    }
  }
  return tasks;
}

function weekStart(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay() || 7;
  d.setHours(0,0,0,0);
  d.setDate(d.getDate() - day + 1);
  return d;
}

function currentWeekMinutes(track) {
  const start = weekStart().getTime();
  return state.sessions
    .filter(s => s.track === track && new Date(s.date).getTime() >= start)
    .reduce((sum, s) => sum + Number(s.minutes || 0), 0);
}

function renderNav() {
  $('#nav').innerHTML = NAV.map(([id, icon, label]) => `
    <button data-nav="${id}" class="${currentView === id ? 'active' : ''}">
      <span class="icon">${icon}</span><span>${label}</span>
    </button>`).join('');
}

function render() {
  if (!state) return;
  renderNav();
  const label = NAV.find(x => x[0] === currentView)?.[2] || 'BuilderOS';
  title.textContent = label;

  const renders = {
    today: renderToday,
    roadmap: renderRoadmap,
    sessions: renderSessions,
    code: renderCode,
    finance: renderFinance,
    mobile: renderMobile,
    certs: renderCerts,
    resources: renderResources,
    system: renderSystem
  };
  view.innerHTML = renders[currentView]();
}

function renderToday() {
  const progress = overallProgress();
  const phase = currentPhase();
  const phaseP = phaseProgress(phase);
  const tech = currentWeekMinutes('Tech');
  const chinese = currentWeekMinutes('Chinese');
  const tasks = nextTasks(6);

  return `
    <div class="card hero">
      <div class="eyebrow">Current mission</div>
      <h2>${esc(phase.title)}</h2>
      <p>${esc(phase.goal)}</p>
      <div class="progress"><span style="width:${phaseP.pct}%"></span></div>
      <div class="subtle" style="margin-top:8px">${phaseP.done}/${phaseP.total} mục hoàn thành trong phase này</div>
    </div>

    <div class="grid cols-4">
      <div class="card metric"><div class="label">Roadmap tổng</div><div class="value">${progress.pct}%</div><div class="progress"><span style="width:${progress.pct}%"></span></div></div>
      <div class="card metric"><div class="label">Tech tuần này</div><div class="value">${minutesLabel(tech)}</div><div class="subtle">Target ${minutesLabel(state.profile.techWeeklyTargetMinutes)}</div></div>
      <div class="card metric"><div class="label">Chinese tuần này</div><div class="value">${minutesLabel(chinese)}</div><div class="subtle">Target ${minutesLabel(state.profile.chineseWeeklyTargetMinutes)}</div></div>
      <div class="card metric"><div class="label">Tốt nghiệp</div><div class="value">${state.profile.graduationYear}</div><div class="subtle">${esc(state.profile.degree)}</div></div>
    </div>

    <div class="grid cols-2">
      <div class="card">
        <div class="card-header"><div><div class="eyebrow">Do next</div><h2>6 việc tiếp theo</h2></div><span class="badge blue">Guided</span></div>
        <div class="task-list">
          ${tasks.map(({phase, topic}) => `
            <label class="task">
              <input type="checkbox" data-topic="${topic.id}" ${topic.done ? 'checked' : ''} />
              <div><div class="task-title">${esc(topic.title)}</div><div class="task-meta">${esc(phase.title)} · ${esc(phase.period)}</div></div>
            </label>`).join('') || '<div class="callout">Roadmap đã hoàn thành. Lúc này chuyển trọng tâm sang portfolio và applications.</div>'}
        </div>
      </div>

      <div class="card">
        <div class="card-header"><div><div class="eyebrow">Operating rules</div><h2>Cách học để không bị AI dắt</h2></div></div>
        <div class="timeline">
          <div class="timeline-item"><div class="when">1</div><div class="what"><strong>Hiểu requirement</strong><span>Tự nói được business logic trước khi prompt AI.</span></div></div>
          <div class="timeline-item"><div class="when">2</div><div class="what"><strong>AI tạo phần nhỏ</strong><span>Không nhận một cục 700 dòng rồi ship.</span></div></div>
          <div class="timeline-item"><div class="when">3</div><div class="what"><strong>Đọc diff</strong><span>File nào đổi? Vì sao? Input/output là gì?</span></div></div>
          <div class="timeline-item"><div class="when">4</div><div class="what"><strong>Trace data flow</strong><span>UI → action → logic → storage → response.</span></div></div>
          <div class="timeline-item"><div class="when">5</div><div class="what"><strong>Test rồi mới commit</strong><span>App chạy chưa đủ; bạn phải biết vì sao nó chạy.</span></div></div>
        </div>
      </div>
    </div>

    <div class="card flat">
      <div class="card-header"><div><div class="eyebrow">Career architecture</div><h2>Đích đến 2028</h2></div></div>
      <div class="flow"><span>Finance & Banking</span><b>→</b><span>SQL / BI / Python</span><b>→</b><span>TypeScript / React</span><b>→</b><span>Next.js + React Native</span><b>→</b><span>AI</span><b>→</b><span>Production / Cloud</span></div>
    </div>`;
}

function renderRoadmap() {
  return `
    <div class="callout">Đi theo thứ tự. Mobile, AI, Docker và cache đều có chỗ của chúng — nhưng không chen vào trước khi code literacy đủ chắc.</div>
    ${state.roadmap.map(phase => {
      const p = phaseProgress(phase);
      return `
        <div class="card phase-card">
          <div class="phase-head">
            <div><div class="eyebrow">${esc(phase.period)}</div><h3>${esc(phase.title)}</h3></div>
            <div class="phase-progress"><strong>${p.pct}%</strong><div class="progress"><span style="width:${p.pct}%"></span></div></div>
          </div>
          <div class="phase-body">
            <p class="phase-goal">${esc(phase.goal)}</p>
            <div class="task-list">
              ${phase.topics.map(topic => `<label class="task"><input type="checkbox" data-topic="${topic.id}" ${topic.done ? 'checked' : ''}><div><div class="task-title">${esc(topic.title)}</div></div></label>`).join('')}
            </div>
          </div>
        </div>`;
    }).join('')}`;
}

function renderSessions() {
  const logs = [...state.sessions].sort((a,b) => new Date(b.date) - new Date(a.date));
  return `
    <div class="grid cols-2">
      <div class="card">
        <div class="card-header"><div><div class="eyebrow">Log study</div><h2>Thêm buổi học</h2></div></div>
        <form id="session-form">
          <div class="form-grid">
            <div class="field"><label>Track</label><select name="track"><option>Tech</option><option>Chinese</option><option>Finance</option><option>University</option></select></div>
            <div class="field"><label>Thời lượng (phút)</label><input name="minutes" type="number" min="1" value="60" required></div>
            <div class="field full"><label>Topic</label><input name="topic" placeholder="VD: JS map/filter/find" required></div>
            <div class="field full"><label>Học được gì?</label><textarea name="learned" placeholder="Viết bằng lời của mình, không chép định nghĩa."></textarea></div>
            <div class="field full"><label>Chưa hiểu gì?</label><textarea name="confused" placeholder="Một câu hỏi cụ thể cho buổi sau."></textarea></div>
          </div>
          <div class="form-actions"><button class="button">Lưu session</button></div>
        </form>
      </div>
      <div class="card">
        <div class="card-header"><div><div class="eyebrow">Weekly rhythm</div><h2>Nhịp học đề xuất</h2></div></div>
        <div class="timeline">
          <div class="timeline-item"><div class="when">Tech</div><div class="what"><strong>10h / tuần target</strong><span>Tuần bận vẫn giữ floor 5h. Ưu tiên deep blocks 60–180 phút.</span></div></div>
          <div class="timeline-item"><div class="when">Chinese</div><div class="what"><strong>30–45 phút gần như mỗi ngày</strong><span>Ngôn ngữ cần frequency hơn deep work.</span></div></div>
          <div class="timeline-item"><div class="when">Finance</div><div class="what"><strong>Tận dụng môn trên trường</strong><span>Biến bài học thành data model, dashboard hoặc project idea thay vì mở thêm một roadmap riêng.</span></div></div>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><div><div class="eyebrow">History</div><h2>Study sessions</h2></div><span class="badge">${logs.length} sessions</span></div>
      ${logs.length ? logs.map(s => `<div class="log-card"><div class="log-card-top"><div><strong>${esc(s.topic)}</strong><span class="badge blue" style="margin-left:7px">${esc(s.track)}</span></div><span class="subtle">${minutesLabel(Number(s.minutes))} · ${formatDate(s.date)}</span></div>${s.learned ? `<p><b>Learned:</b> ${esc(s.learned)}</p>`:''}${s.confused ? `<p><b>Question:</b> ${esc(s.confused)}</p>`:''}</div>`).join('') : '<div class="callout">Chưa có session. Log buổi học đầu tiên ngay hôm nay.</div>'}
    </div>`;
}

function renderCode() {
  const logs = [...state.codeLogs].sort((a,b) => new Date(b.date) - new Date(a.date));
  return `
    <div class="grid cols-2">
      <div class="card">
        <div class="card-header"><div><div class="eyebrow">Most important habit</div><h2>Code Reading Log</h2></div></div>
        <form id="code-form">
          <div class="form-grid">
            <div class="field full"><label>Feature</label><input name="feature" placeholder="VD: Create Lead" required></div>
            <div class="field full"><label>Entry point</label><input name="entry" placeholder="app/leads/new/page.tsx"></div>
            <div class="field full"><label>Data flow</label><textarea name="flow" placeholder="LeadForm → createLead() → Zod → service → DB"></textarea></div>
            <div class="field full"><label>Điểm chưa hiểu</label><textarea name="questions" placeholder="VD: revalidatePath làm gì? Auth user đến từ đâu?"></textarea></div>
          </div>
          <div class="form-actions"><button class="button">Lưu code trace</button></div>
        </form>
      </div>
      <div class="card">
        <div class="card-header"><div><div class="eyebrow">5 questions</div><h2>Trace một feature như thế nào?</h2></div></div>
        <div class="timeline">
          <div class="timeline-item"><div class="when">01</div><div class="what"><strong>Entry point ở đâu?</strong><span>Route/file nào bắt đầu feature?</span></div></div>
          <div class="timeline-item"><div class="when">02</div><div class="what"><strong>Data vào từ đâu?</strong><span>Form, API, file, user interaction?</span></div></div>
          <div class="timeline-item"><div class="when">03</div><div class="what"><strong>Data đổi shape ở đâu?</strong><span>Validation, mapping, parser, DTO?</span></div></div>
          <div class="timeline-item"><div class="when">04</div><div class="what"><strong>Business logic nằm đâu?</strong><span>Đừng nhầm UI với rule nghiệp vụ.</span></div></div>
          <div class="timeline-item"><div class="when">05</div><div class="what"><strong>Lưu và trả về ở đâu?</strong><span>DB/object storage/cache → response → UI.</span></div></div>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><div><div class="eyebrow">History</div><h2>Feature traces</h2></div><span class="badge">${logs.length} traces</span></div>
      ${logs.length ? logs.map(l => `<div class="log-card"><div class="log-card-top"><strong>${esc(l.feature)}</strong><span class="subtle">${formatDate(l.date)}</span></div>${l.entry ? `<p><b>Entry:</b> ${esc(l.entry)}</p>`:''}${l.flow ? `<p><b>Flow:</b> ${esc(l.flow)}</p>`:''}${l.questions ? `<p><b>Questions:</b> ${esc(l.questions)}</p>`:''}</div>`).join('') : '<div class="callout">Mỗi ngày trace ít nhất một feature AI đã sinh ra (trong phạm vi chính sách bảo mật công việc).</div>'}
    </div>`;
}

function renderFinance() {
  return `
    <div class="card hero"><div class="eyebrow">Your moat</div><h2>Không học Finance và Tech thành hai thế giới riêng.</h2><p>Mỗi môn Finance & Banking có thể trở thành input cho một data model, dashboard hoặc system nhỏ. Đó là lợi thế khác biệt so với một generalist developer.</p></div>
    <div class="grid cols-2">
      ${[
        ['Corporate Finance','Financial statement dashboard','Ratios, cash flow, valuation assumptions → SQL + Power BI.'],
        ['Banking','Loan / customer workflow','Customer, loan, repayment, status, delinquency → relational modelling.'],
        ['Risk Management','Credit risk dashboard','Exposure, arrears, buckets, alerts → data + analytics.'],
        ['Portfolio Theory','Portfolio analytics','Holdings, P&L, allocation, benchmark, volatility, drawdown.'],
        ['Econometrics','Python analysis','Data cleaning, regressions, visualization, interpretation.'],
        ['Accounting','Transaction model','Double-entry mental model, ledgers, reconciliation, controls.']
      ].map(x => `<div class="card flat"><div class="eyebrow">${x[0]}</div><h3 style="margin-top:5px">${x[1]}</h3><p>${x[2]}</p></div>`).join('')}
    </div>
    <div class="card"><div class="card-header"><div><div class="eyebrow">Career statement</div><h2>Cách mô tả bản thân sau này</h2></div></div><div class="callout">“Em có nền tảng Finance & Banking, dùng SQL/Python cho dữ liệu, TypeScript/React để xây application, và AI để tự động hóa workflow.”</div></div>`;
}

function renderMobile() {
  return `
    <div class="card hero"><div class="eyebrow">Mobile branch</div><h2>React Native + Expo sau khi React đã chắc.</h2><p>Không học Swift + Kotlin từ đầu. Tận dụng TypeScript và React để target iOS + Android, rồi chỉ học native-specific khi fintech use case buộc phải chạm vào.</p></div>
    <div class="card flat"><div class="card-header"><div><div class="eyebrow">Shared architecture</div><h2>Một backend, hai client</h2></div></div><div class="flow"><span>PostgreSQL</span><b>↕</b><span>Backend / API</span><b>→</b><span>Next.js Web</span><b>+</b><span>React Native / Expo</span></div></div>
    <div class="grid cols-3">
      <div class="card flat"><h3>Học chung lại</h3><p>TypeScript, components, props, state, hooks, API calls, validation, TanStack Query.</p></div>
      <div class="card flat"><h3>Mobile-specific</h3><p>Permissions, secure storage, push notifications, camera, deep links, lifecycle, offline/network failure.</p></div>
      <div class="card flat"><h3>Fintech-specific</h3><p>OTP, biometrics, device binding, transaction confirmation, payment SDK, security boundaries.</p></div>
    </div>
    <div class="callout warning">Không chen mobile vào Phase 0. React Native sẽ nhanh hơn nhiều khi JavaScript/TypeScript/React mental model đã chắc.</div>`;
}

function renderCerts() {
  const totalUsd = state.expenses.filter(x => x.currency === 'USD').reduce((s,x) => s + Number(x.amount || 0), 0);
  return `
    <div class="grid cols-3">
      <div class="card metric"><div class="label">Priority #1</div><div class="value" style="font-size:22px">PL-300</div><div class="subtle">Sau khi đã build Power BI dashboard thật.</div></div>
      <div class="card metric"><div class="label">Priority #2</div><div class="value" style="font-size:22px">AWS Developer</div><div class="subtle">Sau khi đã deploy/debug app thật.</div></div>
      <div class="card metric"><div class="label">Tracked USD cost</div><div class="value">$${totalUsd.toFixed(0)}</div><div class="subtle">Giá trong tracker là estimate editable.</div></div>
    </div>
    <div class="grid cols-2">
      <div class="card">
        <div class="card-header"><div><div class="eyebrow">Priority order</div><h2>Certificates</h2></div></div>
        <div class="timeline">
          <div class="timeline-item"><div class="when">#1</div><div class="what"><strong>PL-300</strong><span>Finance + data + BI signal.</span></div></div>
          <div class="timeline-item"><div class="when">#2</div><div class="what"><strong>AWS Developer Associate</strong><span>Cloud/application/deployment signal.</span></div></div>
          <div class="timeline-item"><div class="when">Free</div><div class="what"><strong>GitHub Foundations</strong><span>Lấy nếu student voucher giúp chi phí gần 0.</span></div></div>
          <div class="timeline-item"><div class="when">Optional</div><div class="what"><strong>CFA Level I / FRM</strong><span>Chỉ khi career direction rẽ rõ sang investment hoặc risk.</span></div></div>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><div><div class="eyebrow">Add cost</div><h2>Chi phí học tập</h2></div></div>
        <form id="expense-form">
          <div class="form-grid">
            <div class="field full"><label>Hạng mục</label><input name="item" required placeholder="VD: domain / exam / API"></div>
            <div class="field"><label>Số tiền</label><input name="amount" type="number" step="0.01" min="0" required></div>
            <div class="field"><label>Currency</label><select name="currency"><option>USD</option><option>VND</option></select></div>
            <div class="field"><label>Category</label><select name="category"><option>Certification</option><option>Infrastructure</option><option>AI/API</option><option>Course</option><option>Other</option></select></div>
            <div class="field"><label>Status</label><select name="status"><option>Planned</option><option>Active</option><option>Paid</option><option>Optional</option></select></div>
            <div class="field full"><label>Note</label><input name="note"></div>
          </div>
          <div class="form-actions"><button class="button">Thêm chi phí</button></div>
        </form>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><div><div class="eyebrow">Cost ledger</div><h2>Tracked costs</h2></div></div>
      <div class="table-wrap"><table><thead><tr><th>Item</th><th>Category</th><th>Amount</th><th>Status</th><th>Note</th></tr></thead><tbody>
        ${state.expenses.map(e => `<tr><td><strong>${esc(e.item)}</strong></td><td>${esc(e.category)}</td><td>${e.currency === 'USD' ? '$' : ''}${Number(e.amount || 0).toLocaleString()} ${e.currency === 'VND' ? '₫' : ''}</td><td><span class="badge ${e.status === 'Paid' || e.status === 'Active' ? 'green' : e.status === 'Optional' ? 'amber' : 'blue'}">${esc(e.status)}</span></td><td class="subtle">${esc(e.note || '')}</td></tr>`).join('')}
      </tbody></table></div>
    </div>`;
}

function renderResources() {
  const groups = [
    ['JavaScript', [['javascript.info','https://javascript.info/','JS mental models & examples'],['MDN JavaScript Guide','https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide','Reference + fundamentals']]],
    ['TypeScript', [['TypeScript Handbook','https://www.typescriptlang.org/docs/handbook/intro.html','Official handbook']]],
    ['React / Next.js', [['Thinking in React','https://react.dev/learn/thinking-in-react','Component & state mental model'],['Next.js Learn','https://nextjs.org/learn','Official dashboard course']]],
    ['Data / Backend', [['PostgreSQL Tutorial','https://www.postgresql.org/docs/current/tutorial.html','Official PostgreSQL tutorial'],['Full Stack Open','https://fullstackopen.com/en/','Use later for testing/full-stack depth']]],
    ['Mobile', [['Expo Tutorial','https://docs.expo.dev/tutorial/introduction/','React Native + Expo practical start'],['React Native Docs','https://reactnative.dev/docs/getting-started','Native concepts']]],
    ['Ops', [['Docker Get Started','https://docs.docker.com/get-started/','Containers after system literacy'],['Git Book','https://git-scm.com/book/en/v2','Git concepts & workflows']]]
  ];
  return groups.map(([name, items]) => `<div class="card"><div class="card-header"><div><div class="eyebrow">${name}</div><h2>${name}</h2></div></div><div class="resource-grid">${items.map(i => `<a class="resource" href="${i[1]}" target="_blank" rel="noreferrer"><strong>${i[0]}</strong><span>${i[2]}</span></a>`).join('')}</div></div>`).join('');
}

function renderSystem() {
  const cache = readCache();
  return `
    <div class="grid cols-2">
      <div class="card">
        <div class="card-header"><div><div class="eyebrow">Sync model</div><h2>Server + local mirror</h2></div></div>
        <div class="flow"><span>Browser</span><b>↔</b><span>Local mirror</span><b>↔</b><span>BuilderOS server</span><b>→</b><span>data/state.json</span></div>
        <p>Dữ liệu server là nguồn dùng chung giữa các máy. Mỗi browser tự giữ một local mirror để vẫn dùng được khi server tạm unreachable.</p>
        <div class="simple-list">
          <div class="task"><div><div class="task-title">Server revision</div><div class="task-meta">r${server.revision || 0} · ${server.updatedAt ? formatDateTime(server.updatedAt) : 'chưa kết nối'}</div></div></div>
          <div class="task"><div><div class="task-title">Local snapshot</div><div class="task-meta">${cache?.savedAt ? formatDateTime(cache.savedAt) : 'chưa có'} · ${cache?.dirty ? 'có thay đổi chưa sync' : 'đã sync'}</div></div></div>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><div><div class="eyebrow">Backup</div><h2>3 lớp bảo vệ dữ liệu</h2></div></div>
        <div class="timeline">
          <div class="timeline-item"><div class="when">1</div><div class="what"><strong>Server state</strong><span>Persist ở <code>./data/state.json</code> trên homelab.</span></div></div>
          <div class="timeline-item"><div class="when">2</div><div class="what"><strong>Browser localStorage</strong><span>Tự mirror mỗi thay đổi.</span></div></div>
          <div class="timeline-item"><div class="when">3</div><div class="what"><strong>Backup JSON</strong><span>Tải file về máy và restore khi cần.</span></div></div>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><div><div class="eyebrow">Homelab deploy</div><h2>Chạy đơn giản trước</h2></div></div>
      <div class="flow"><span>docker compose up -d --build</span><b>→</b><span>:8787</span><b>→</b><span>Tailscale / reverse proxy</span></div>
      <div class="callout warning" style="margin-top:14px">BuilderOS v0.2 chưa có authentication. Nếu truy cập từ Internet công khai, đặt nó sau lớp auth/reverse proxy. Nếu chỉ dùng qua Tailscale/VPN của homelab thì đơn giản và an toàn hơn cho phase này.</div>
    </div>
    <div class="card">
      <div class="card-header"><div><div class="eyebrow">Project grows with you</div><h2>BuilderOS evolution</h2></div></div>
      <div class="timeline">
        ${[
          ['v0.2','Vanilla JS + server JSON persistence + local backup'],['v0.3','TypeScript'],['v0.4','React'],['v0.5','Next.js + PostgreSQL'],['v0.6','Auth + roles'],['v0.7','Docker/CI-CD hardening'],['v0.8','AI weekly review'],['v1.0','React Native companion app']
        ].map(x => `<div class="timeline-item"><div class="when">${x[0]}</div><div class="what"><strong>${x[1]}</strong><span>Chỉ nâng cấp khi bạn đang học chính concept đó.</span></div></div>`).join('')}
      </div>
    </div>`;
}

function toggleTopic(topicId, checked) {
  for (const phase of state.roadmap) {
    const topic = phase.topics.find(t => t.id === topicId);
    if (topic) { topic.done = checked; return; }
  }
}

function exportBackup() {
  const payload = { schema: 'builderos-backup-v2', exportedAt: new Date().toISOString(), revision: server.revision, state };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `builderos-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('Đã tải backup JSON');
}

async function restoreBackup(file) {
  const text = await file.text();
  const parsed = JSON.parse(text);
  const restored = parsed.state || parsed;
  if (!restored.roadmap || !Array.isArray(restored.roadmap)) throw new Error('File backup không hợp lệ');
  if (!confirm('Restore sẽ thay state hiện tại trên máy này và đồng bộ lên server. Tiếp tục?')) return;
  state = restored;
  writeCache(true);
  render();
  await syncNow(false);
  toast('Đã restore backup');
}

async function boot() {
  renderNav();
  const cached = readCache();
  if (cached?.state) {
    state = cached.state;
    server.revision = Number(cached.revision || 0);
    render();
  }

  try {
    const remote = await fetchServerState();
    server = { online: true, revision: remote.revision, updatedAt: remote.updatedAt };

    if (cached?.dirty && cached.revision === remote.revision) {
      state = cached.state;
      await syncNow(false);
    } else if (cached?.dirty && cached.revision !== remote.revision) {
      state = cached.state;
      conflictPayload = remote;
      conflictBanner.classList.remove('hidden');
      setSyncStatus('conflict', 'Xung đột dữ liệu');
      render();
    } else {
      state = remote.state;
      writeCache(false);
      setSyncStatus('synced', `Đã sync · r${server.revision}`);
      render();
    }
  } catch {
    if (!state) {
      view.innerHTML = '<div class="card"><h2>Không kết nối được server và chưa có local cache.</h2><p>Hãy chạy BuilderOS qua server Node hoặc Docker Compose.</p></div>';
    }
    setSyncStatus('offline', 'Offline · local only');
  }
}

document.addEventListener('click', async (event) => {
  const nav = event.target.closest('[data-nav]');
  if (nav) { currentView = nav.dataset.nav; render(); return; }

  if (event.target.id === 'export-btn') return exportBackup();
  if (event.target.id === 'local-snapshot-btn') { writeCache(true); toast('Đã lưu snapshot trên trình duyệt'); return; }

  if (event.target.id === 'use-server-btn' && conflictPayload) {
    state = conflictPayload.state;
    server.revision = conflictPayload.revision;
    server.updatedAt = conflictPayload.updatedAt;
    conflictPayload = null;
    conflictBanner.classList.add('hidden');
    writeCache(false);
    setSyncStatus('synced', `Đã sync · r${server.revision}`);
    render();
    toast('Đã dùng bản server');
  }

  if (event.target.id === 'overwrite-server-btn' && conflictPayload) {
    server.revision = conflictPayload.revision;
    await syncNow(true);
    toast('Đã ghi đè server bằng bản máy này');
  }
});

document.addEventListener('change', async (event) => {
  if (event.target.matches('[data-topic]')) {
    toggleTopic(event.target.dataset.topic, event.target.checked);
    commit('Đã cập nhật roadmap');
  }
  if (event.target.id === 'restore-input' && event.target.files?.[0]) {
    try { await restoreBackup(event.target.files[0]); }
    catch (error) { alert(error.message); }
    event.target.value = '';
  }
});

document.addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.target;
  const data = Object.fromEntries(new FormData(form));

  if (form.id === 'session-form') {
    state.sessions.push({ id: uid('session'), date: new Date().toISOString(), track: data.track, minutes: Number(data.minutes), topic: data.topic, learned: data.learned, confused: data.confused });
    form.reset();
    commit('Đã lưu study session');
  }

  if (form.id === 'code-form') {
    state.codeLogs.push({ id: uid('code'), date: new Date().toISOString(), feature: data.feature, entry: data.entry, flow: data.flow, questions: data.questions });
    form.reset();
    commit('Đã lưu code trace');
  }

  if (form.id === 'expense-form') {
    state.expenses.push({ id: uid('cost'), item: data.item, category: data.category, amount: Number(data.amount), currency: data.currency, status: data.status, note: data.note });
    form.reset();
    commit('Đã thêm chi phí');
  }
});

window.addEventListener('online', () => syncNow(false));
window.addEventListener('beforeunload', () => { if (state) writeCache(true); });

boot();
