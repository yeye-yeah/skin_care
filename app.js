const state = {
  user: null,
  entries: [],
  shares: [],
  currentPhoto: "",
  reminderTimer: null,
  activeTag: "",
  authMode: "login",
};

const views = {
  checkin: document.querySelector("#checkinView"),
  timeline: document.querySelector("#timelineView"),
  compare: document.querySelector("#compareView"),
  community: document.querySelector("#communityView"),
  reminder: document.querySelector("#reminderView"),
};

const titles = {
  checkin: "今日护肤打卡",
  timeline: "护肤记录档案",
  compare: "智能前后对比",
  community: "社区交流平台",
  reminder: "打卡提醒",
};

const elements = {
  authScreen: document.querySelector("#authScreen"),
  appShell: document.querySelector("#appShell"),
  authForm: document.querySelector("#authForm"),
  authSubmit: document.querySelector("#authSubmit"),
  authMessage: document.querySelector("#authMessage"),
  userPill: document.querySelector("#userPill"),
  logoutButton: document.querySelector("#logoutButton"),
  todayText: document.querySelector("#todayText"),
  viewTitle: document.querySelector("#viewTitle"),
  checkinForm: document.querySelector("#checkinForm"),
  entryDate: document.querySelector("#entryDate"),
  photoInput: document.querySelector("#photoInput"),
  photoPreview: document.querySelector("#photoPreview"),
  photoUploader: document.querySelector(".photo-uploader"),
  hydration: document.querySelector("#hydration"),
  hydrationValue: document.querySelector("#hydrationValue"),
  sensitivity: document.querySelector("#sensitivity"),
  sensitivityValue: document.querySelector("#sensitivityValue"),
  timelineList: document.querySelector("#timelineList"),
  dateFilter: document.querySelector("#dateFilter"),
  beforeSelect: document.querySelector("#beforeSelect"),
  afterSelect: document.querySelector("#afterSelect"),
  beforeImage: document.querySelector("#beforeImage"),
  afterImage: document.querySelector("#afterImage"),
  afterMask: document.querySelector("#afterMask"),
  compareSlider: document.querySelector("#compareSlider"),
  compareWrap: document.querySelector("#compareWrap"),
  compareEmpty: document.querySelector("#compareEmpty"),
  compareNotes: document.querySelector("#compareNotes"),
  streakCount: document.querySelector("#streakCount"),
  streakHint: document.querySelector("#streakHint"),
  reminderTime: document.querySelector("#reminderTime"),
  reminderStatus: document.querySelector("#reminderStatus"),
  shareForm: document.querySelector("#shareForm"),
  shareList: document.querySelector("#shareList"),
  popularTags: document.querySelector("#popularTags"),
  communitySearch: document.querySelector("#communitySearch"),
  ageFilter: document.querySelector("#ageFilter"),
  skinFilter: document.querySelector("#skinFilter"),
  needFilter: document.querySelector("#needFilter"),
};

init();

async function init() {
  bindEvents();
  elements.todayText.textContent = new Date().toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
  elements.entryDate.value = toDateInput(new Date());
  updateMetricLabels();
  await checkSession();
}

function bindEvents() {
  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.addEventListener("click", () => setAuthMode(button.dataset.authMode));
  });
  elements.authForm.addEventListener("submit", submitAuth);
  elements.logoutButton.addEventListener("click", logout);

  document.querySelectorAll(".nav-tab").forEach((tab) => {
    tab.addEventListener("click", () => switchView(tab.dataset.view));
  });
  elements.photoInput.addEventListener("change", handlePhotoInput);
  elements.checkinForm.addEventListener("submit", saveEntry);
  elements.dateFilter.addEventListener("input", renderTimeline);
  document.querySelector("#clearFilterButton").addEventListener("click", () => {
    elements.dateFilter.value = "";
    renderTimeline();
  });
  elements.hydration.addEventListener("input", updateMetricLabels);
  elements.sensitivity.addEventListener("input", updateMetricLabels);
  elements.beforeSelect.addEventListener("change", renderCompare);
  elements.afterSelect.addEventListener("change", renderCompare);
  elements.compareSlider.addEventListener("input", updateCompareClip);

  elements.shareForm.addEventListener("submit", saveShare);
  [elements.communitySearch, elements.ageFilter, elements.skinFilter, elements.needFilter].forEach((control) => {
    control.addEventListener("input", () => {
      state.activeTag = "";
      renderCommunity();
    });
  });

  document.querySelector("#saveReminderButton").addEventListener("click", saveReminder);
  document.querySelector("#testReminderButton").addEventListener("click", () => notify("现在可以打卡啦", "记录一下今晚的护肤产品和皮肤状态。"));
}

async function checkSession() {
  const data = await api("/api/me");
  if (data.user) {
    state.user = data.user;
    await enterApp();
  } else {
    showAuth();
  }
}

function setAuthMode(mode) {
  state.authMode = mode;
  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.authMode === mode);
  });
  elements.authSubmit.textContent = mode === "login" ? "登录" : "注册并进入";
  elements.authMessage.textContent = "";
}

async function submitAuth(event) {
  event.preventDefault();
  elements.authMessage.textContent = "";
  const form = new FormData(elements.authForm);
  try {
    const data = await api(`/api/${state.authMode}`, {
      method: "POST",
      body: {
        username: form.get("username"),
        password: form.get("password"),
      },
    });
    state.user = data.user;
    elements.authForm.reset();
    await enterApp();
  } catch (error) {
    elements.authMessage.textContent = error.message;
  }
}

async function logout() {
  await api("/api/logout", { method: "POST" });
  state.user = null;
  state.entries = [];
  state.shares = [];
  clearTimeout(state.reminderTimer);
  showAuth();
}

async function enterApp() {
  elements.authScreen.classList.add("is-hidden");
  elements.appShell.classList.remove("is-hidden");
  elements.userPill.textContent = state.user.username;
  await refreshData();
}

function showAuth() {
  elements.appShell.classList.add("is-hidden");
  elements.authScreen.classList.remove("is-hidden");
  setAuthMode("login");
}

async function refreshData() {
  const [entryData, shareData, reminderData] = await Promise.all([
    api("/api/entries"),
    api("/api/shares"),
    api("/api/reminder"),
  ]);
  state.entries = entryData.entries;
  state.shares = shareData.shares;
  elements.reminderTime.value = reminderData.time || "21:30";
  if (reminderData.time) scheduleReminder(reminderData.time);
  updateReminderStatus(reminderData.time || "");
  renderAll();
}

function switchView(name) {
  Object.entries(views).forEach(([key, view]) => view.classList.toggle("active", key === name));
  document.querySelectorAll(".nav-tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === name));
  elements.viewTitle.textContent = titles[name];
  if (name === "timeline") renderTimeline();
  if (name === "compare") renderCompareOptions();
  if (name === "community") renderCommunity();
}

function handlePhotoInput(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    alert("图片请控制在 5MB 以内。");
    elements.photoInput.value = "";
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    state.currentPhoto = String(reader.result);
    elements.photoPreview.src = state.currentPhoto;
    elements.photoUploader.classList.add("has-photo");
  };
  reader.readAsDataURL(file);
}

async function saveEntry(event) {
  event.preventDefault();
  const form = new FormData(elements.checkinForm);
  const date = form.get("date");
  const exists = state.entries.some((entry) => entry.date === date);
  if (exists && !confirm("这一天已有记录，要用当前内容更新它吗？")) return;

  await api("/api/entries", {
    method: "POST",
    body: {
      date,
      photo: state.currentPhoto,
      skinState: form.get("skinState"),
      products: form.get("products"),
      notes: form.get("notes"),
      hydration: Number(form.get("hydration")),
      sensitivity: Number(form.get("sensitivity")),
    },
  });
  await refreshData();
  resetForm();
  switchView("timeline");
}

async function saveShare(event) {
  event.preventDefault();
  const form = new FormData(elements.shareForm);
  await api("/api/shares", {
    method: "POST",
    body: {
      title: form.get("title"),
      body: form.get("body"),
      age: form.get("age"),
      skinType: form.get("skinType"),
      need: form.get("need"),
      tags: parseTags(form.get("tags")),
    },
  });
  elements.shareForm.reset();
  await loadShares();
  renderCommunity();
}

function resetForm() {
  elements.checkinForm.reset();
  elements.entryDate.value = toDateInput(new Date());
  state.currentPhoto = "";
  elements.photoPreview.removeAttribute("src");
  elements.photoUploader.classList.remove("has-photo");
  elements.hydration.value = "3";
  elements.sensitivity.value = "2";
  updateMetricLabels();
}

function renderAll() {
  updateMetricLabels();
  renderTimeline();
  renderCompareOptions();
  renderStreak();
  renderCommunity();
}

function renderTimeline() {
  const filter = elements.dateFilter.value;
  const entries = filter ? state.entries.filter((entry) => entry.date === filter) : state.entries;
  elements.timelineList.innerHTML = "";
  if (!entries.length) {
    elements.timelineList.innerHTML = `<div class="empty-state">${filter ? "这一天还没有记录。" : "还没有护肤记录，先完成一次今日打卡吧。"}</div>`;
    return;
  }

  const template = document.querySelector("#entryTemplate");
  entries.forEach((entry) => {
    const node = template.content.firstElementChild.cloneNode(true);
    const image = node.querySelector(".entry-photo");
    image.src = entry.photo || makePlaceholder(entry.skinState);
    image.alt = `${formatDate(entry.date)} 护肤照片`;
    node.querySelector("time").textContent = formatDate(entry.date);
    node.querySelector("h3").textContent = entry.skinState;
    node.querySelector(".entry-products").textContent = entry.products ? `产品：${entry.products}` : "产品：未记录";
    node.querySelector(".entry-notes").textContent = entry.notes || "今天没有额外文字记录。";
    node.querySelector(".score-row").innerHTML = `
      <span>水润度 ${entry.hydration}/5</span>
      <span>敏感度 ${entry.sensitivity}/5</span>
    `;
    node.querySelector(".delete-button").addEventListener("click", () => deleteEntry(entry.id));
    elements.timelineList.appendChild(node);
  });
}

function renderCompareOptions() {
  const photoEntries = state.entries.filter((entry) => entry.photo);
  const options = photoEntries.map((entry) => `<option value="${entry.id}">${formatDate(entry.date)} · ${escapeHtml(entry.skinState)}</option>`).join("");
  elements.beforeSelect.innerHTML = options;
  elements.afterSelect.innerHTML = options;
  if (photoEntries.length >= 2) {
    elements.beforeSelect.value = photoEntries[photoEntries.length - 1].id;
    elements.afterSelect.value = photoEntries[0].id;
  }
  renderCompare();
}

function renderCompare() {
  const before = state.entries.find((entry) => entry.id === elements.beforeSelect.value);
  const after = state.entries.find((entry) => entry.id === elements.afterSelect.value);
  const canCompare = before?.photo && after?.photo && before.id !== after.id;
  elements.compareEmpty.style.display = canCompare ? "none" : "block";
  elements.compareWrap.style.display = canCompare ? "block" : "none";
  elements.compareNotes.innerHTML = "";
  if (!canCompare) return;

  elements.beforeImage.src = before.photo;
  elements.afterImage.src = after.photo;
  elements.compareSlider.value = "50";
  updateCompareClip();
  elements.compareNotes.innerHTML = `
    <div class="compare-note"><strong>${formatDate(before.date)}</strong><br>${before.skinState}；水润度 ${before.hydration}/5，敏感度 ${before.sensitivity}/5。${escapeHtml(before.notes || "")}</div>
    <div class="compare-note"><strong>${formatDate(after.date)}</strong><br>${after.skinState}；水润度 ${after.hydration}/5，敏感度 ${after.sensitivity}/5。${escapeHtml(after.notes || "")}</div>
  `;
}

function renderCommunity() {
  renderPopularTags();
  const shares = getFilteredShares();
  elements.shareList.innerHTML = "";
  if (!shares.length) {
    elements.shareList.innerHTML = `<div class="empty-state">没有匹配的分享。换个筛选条件，或发布第一条体验吧。</div>`;
    return;
  }

  shares.forEach((share) => {
    const article = document.createElement("article");
    article.className = "share-card";
    article.innerHTML = `
      <div class="share-meta">
        <span>${escapeHtml(share.author)}</span>
        <time>${formatDateTime(share.createdAt)}</time>
      </div>
      <h3>${escapeHtml(share.title)}</h3>
      <p>${escapeHtml(share.body)}</p>
      <div class="share-taxonomy">
        <span>${escapeHtml(share.age)}</span>
        <span>${escapeHtml(share.skinType)}</span>
        <span>${escapeHtml(share.need)}</span>
      </div>
      <div class="tag-row">
        ${share.tags.map((tag) => `<button type="button" data-tag="${escapeHtml(tag)}">#${escapeHtml(tag)}</button>`).join("")}
      </div>
      <div class="share-actions">
        <button type="button" data-action="like">${share.liked ? "已赞" : "点赞"} · ${share.likes}</button>
        <button type="button" data-action="collect">${share.collected ? "已收藏" : "收藏"}</button>
        <button type="button" data-action="comment">评论 · ${share.comments.length}</button>
      </div>
      <div class="comment-list">
        ${share.comments.map((comment) => `<p><strong>${escapeHtml(comment.author)}</strong> ${escapeHtml(comment.text)}</p>`).join("")}
      </div>
      <form class="comment-form" data-share-id="${share.id}">
        <input type="text" name="comment" placeholder="写一条评论" />
        <button class="ghost-button" type="submit">发送</button>
      </form>
    `;
    article.querySelector('[data-action="like"]').addEventListener("click", () => toggleShareAction(share.id, "like"));
    article.querySelector('[data-action="collect"]').addEventListener("click", () => toggleShareAction(share.id, "collect"));
    article.querySelector('[data-action="comment"]').addEventListener("click", () => article.querySelector(".comment-form input").focus());
    article.querySelectorAll("[data-tag]").forEach((button) => {
      button.addEventListener("click", () => {
        state.activeTag = button.dataset.tag;
        elements.communitySearch.value = "";
        renderCommunity();
      });
    });
    article.querySelector(".comment-form").addEventListener("submit", saveComment);
    elements.shareList.appendChild(article);
  });
}

function renderPopularTags() {
  const counts = new Map();
  state.shares.forEach((share) => share.tags.forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1)));
  const tags = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  elements.popularTags.innerHTML = tags.map(([tag, count]) => `
    <button class="${state.activeTag === tag ? "active" : ""}" type="button" data-tag="${escapeHtml(tag)}">#${escapeHtml(tag)} ${count}</button>
  `).join("");
  elements.popularTags.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeTag = state.activeTag === button.dataset.tag ? "" : button.dataset.tag;
      renderCommunity();
    });
  });
}

function getFilteredShares() {
  const keyword = elements.communitySearch.value.trim().toLowerCase();
  const age = elements.ageFilter.value;
  const skin = elements.skinFilter.value;
  const need = elements.needFilter.value;
  return state.shares.filter((share) => {
    const text = `${share.title} ${share.body} ${share.tags.join(" ")}`.toLowerCase();
    return (!keyword || text.includes(keyword))
      && (!age || share.age === age)
      && (!skin || share.skinType === skin)
      && (!need || share.need === need)
      && (!state.activeTag || share.tags.includes(state.activeTag));
  });
}

async function toggleShareAction(id, action) {
  await api(`/api/shares/${id}/${action}`, { method: "POST" });
  await loadShares();
  renderCommunity();
}

async function saveComment(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const text = form.elements.comment.value.trim();
  if (!text) return;
  await api(`/api/shares/${form.dataset.shareId}/comments`, {
    method: "POST",
    body: { text },
  });
  await loadShares();
  renderCommunity();
}

async function loadShares() {
  const data = await api("/api/shares");
  state.shares = data.shares;
}

async function deleteEntry(id) {
  if (!confirm("确定删除这条记录吗？")) return;
  await api(`/api/entries/${id}`, { method: "DELETE" });
  const data = await api("/api/entries");
  state.entries = data.entries;
  renderAll();
}

async function saveReminder() {
  const time = elements.reminderTime.value || "21:30";
  await api("/api/reminder", { method: "PUT", body: { time } });
  if ("Notification" in window && Notification.permission === "default") {
    await Notification.requestPermission();
  }
  scheduleReminder(time);
  updateReminderStatus(time);
}

function scheduleReminder(time) {
  clearTimeout(state.reminderTimer);
  if (!time) return;
  const now = new Date();
  const [hours, minutes] = time.split(":").map(Number);
  const target = new Date();
  target.setHours(hours, minutes, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  state.reminderTimer = setTimeout(() => {
    notify("BeautyPace 打卡提醒", "现在记录一下今天的护肤和皮肤状态吧。");
    scheduleReminder(time);
  }, target - now);
}

function updateReminderStatus(time) {
  if (!time) {
    elements.reminderStatus.textContent = "还未设置提醒。";
    return;
  }
  const permission = "Notification" in window ? Notification.permission : "unsupported";
  const permissionText = {
    granted: "浏览器通知已授权",
    default: "浏览器通知待授权",
    denied: "浏览器通知被拒绝",
    unsupported: "当前浏览器不支持通知",
  }[permission];
  elements.reminderStatus.textContent = `已保存每天 ${time} 提醒到账号。${permissionText}。`;
}

function renderStreak() {
  const dates = new Set(state.entries.map((entry) => entry.date));
  let streak = 0;
  const cursor = new Date();
  while (dates.has(toDateInput(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  const hasToday = dates.has(toDateInput(new Date()));
  elements.streakCount.textContent = `${streak} 天`;
  elements.streakHint.textContent = hasToday ? "今天已完成打卡，继续观察皮肤的细微变化。" : "今天还没有记录，给皮肤留一张近照吧。";
}

async function api(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      method: options.method || "GET",
      headers: options.body ? { "Content-Type": "application/json" } : {},
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new Error("无法连接后端服务，请先启动 server.js 后再注册或登录。");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "请求失败，请稍后再试。");
  return data;
}

function notify(title, body) {
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, { body });
  } else {
    alert(`${title}\n${body}`);
  }
}

function updateMetricLabels() {
  elements.hydrationValue.textContent = `${elements.hydration.value} / 5`;
  elements.sensitivityValue.textContent = `${elements.sensitivity.value} / 5`;
}

function parseTags(value) {
  return String(value || "")
    .split(/[,，#\s]+/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function formatDate(value) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    weekday: "short",
  });
}

function formatDateTime(value) {
  return new Date(value).toLocaleDateString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toDateInput(date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function updateCompareClip() {
  const hiddenRight = 100 - Number(elements.compareSlider.value);
  elements.afterMask.style.clipPath = `inset(0 ${hiddenRight}% 0 0)`;
}

function makePlaceholder(text) {
  return makeDemoImage("#edf5f2", text || "未上传照片", "");
}

function makeDemoImage(color, title, date) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="960" height="1200" viewBox="0 0 960 1200">
      <rect width="960" height="1200" fill="${color}"/>
      <circle cx="490" cy="430" r="250" fill="#f2b9aa" opacity="0.38"/>
      <circle cx="390" cy="390" r="38" fill="#d98975" opacity="0.3"/>
      <circle cx="590" cy="510" r="26" fill="#477264" opacity="0.24"/>
      <text x="80" y="1040" fill="#254a3f" font-family="Arial, sans-serif" font-size="54" font-weight="700">${escapeHtml(title)}</text>
      <text x="80" y="1110" fill="#71777f" font-family="Arial, sans-serif" font-size="34">${escapeHtml(date)}</text>
    </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}
