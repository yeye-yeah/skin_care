const STORAGE_KEY = "glowlog.entries";
const REMINDER_KEY = "glowlog.reminder";

const state = {
  entries: loadEntries(),
  currentPhoto: "",
  reminderTimer: null,
};

const views = {
  checkin: document.querySelector("#checkinView"),
  timeline: document.querySelector("#timelineView"),
  compare: document.querySelector("#compareView"),
  reminder: document.querySelector("#reminderView"),
};

const titles = {
  checkin: "今日护肤打卡",
  timeline: "护肤记录档案",
  compare: "智能前后对比",
  reminder: "打卡提醒",
};

const elements = {
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
};

init();

function init() {
  const today = new Date();
  elements.todayText.textContent = today.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
  elements.entryDate.value = toDateInput(today);

  bindEvents();
  restoreReminder();
  renderAll();
}

function bindEvents() {
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
  elements.compareSlider.addEventListener("input", () => {
    updateCompareClip();
  });

  document.querySelector("#saveReminderButton").addEventListener("click", saveReminder);
  document.querySelector("#testReminderButton").addEventListener("click", () => notify("现在可以打卡啦", "记录一下今晚的护肤产品和皮肤状态。"));
  document.querySelector("#seedButton").addEventListener("click", seedDemoEntries);
}

function switchView(name) {
  Object.entries(views).forEach(([key, view]) => view.classList.toggle("active", key === name));
  document.querySelectorAll(".nav-tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === name));
  elements.viewTitle.textContent = titles[name];
  if (name === "timeline") renderTimeline();
  if (name === "compare") renderCompareOptions();
}

function handlePhotoInput(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    state.currentPhoto = String(reader.result);
    elements.photoPreview.src = state.currentPhoto;
    elements.photoUploader.classList.add("has-photo");
  };
  reader.readAsDataURL(file);
}

function saveEntry(event) {
  event.preventDefault();
  const form = new FormData(elements.checkinForm);
  const date = form.get("date");

  const entry = {
    id: createId(),
    date,
    createdAt: new Date().toISOString(),
    photo: state.currentPhoto,
    skinState: form.get("skinState"),
    products: String(form.get("products") || "").trim(),
    notes: String(form.get("notes") || "").trim(),
    hydration: Number(form.get("hydration")),
    sensitivity: Number(form.get("sensitivity")),
  };

  const existingIndex = state.entries.findIndex((item) => item.date === date);
  if (existingIndex >= 0 && confirm("这一天已有记录，要用当前内容更新它吗？")) {
    entry.id = state.entries[existingIndex].id;
    entry.photo = entry.photo || state.entries[existingIndex].photo;
    state.entries.splice(existingIndex, 1, entry);
  } else if (existingIndex < 0) {
    state.entries.push(entry);
  } else {
    return;
  }

  state.entries.sort((a, b) => b.date.localeCompare(a.date));
  persistEntries();
  resetForm();
  renderAll();
  switchView("timeline");
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
  const options = photoEntries.map((entry) => `<option value="${entry.id}">${formatDate(entry.date)} · ${entry.skinState}</option>`).join("");
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
    <div class="compare-note"><strong>${formatDate(before.date)}</strong><br>${before.skinState}；水润度 ${before.hydration}/5，敏感度 ${before.sensitivity}/5。${before.notes || ""}</div>
    <div class="compare-note"><strong>${formatDate(after.date)}</strong><br>${after.skinState}；水润度 ${after.hydration}/5，敏感度 ${after.sensitivity}/5。${after.notes || ""}</div>
  `;
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

function deleteEntry(id) {
  if (!confirm("确定删除这条记录吗？")) return;
  state.entries = state.entries.filter((entry) => entry.id !== id);
  persistEntries();
  renderAll();
}

async function saveReminder() {
  const time = elements.reminderTime.value || "21:30";
  localStorage.setItem(REMINDER_KEY, time);

  if ("Notification" in window && Notification.permission === "default") {
    await Notification.requestPermission();
  }

  scheduleReminder(time);
  updateReminderStatus(time);
}

function restoreReminder() {
  const time = localStorage.getItem(REMINDER_KEY);
  if (!time) {
    elements.reminderStatus.textContent = "还未开启提醒。";
    return;
  }

  elements.reminderTime.value = time;
  scheduleReminder(time);
  updateReminderStatus(time);
}

function scheduleReminder(time) {
  clearTimeout(state.reminderTimer);
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
  const permission = "Notification" in window ? Notification.permission : "unsupported";
  const permissionText = {
    granted: "浏览器通知已授权",
    default: "浏览器通知待授权",
    denied: "浏览器通知被拒绝",
    unsupported: "当前浏览器不支持通知",
  }[permission];
  elements.reminderStatus.textContent = `已设置每天 ${time} 提醒。${permissionText}。`;
}

function notify(title, body) {
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, { body });
  } else {
    alert(`${title}\n${body}`);
  }
}

function seedDemoEntries() {
  const today = new Date();
  const day = 24 * 60 * 60 * 1000;
  const demo = [
    {
      offset: 21,
      skinState: "干燥紧绷",
      products: "温和洁面、保湿精华、修护面霜",
      notes: "换季时脸颊偏干，晚间厚涂面霜后紧绷感有缓解。",
      hydration: 2,
      sensitivity: 4,
      color: "#f6d8d1",
    },
    {
      offset: 10,
      skinState: "屏障修护中",
      products: "神经酰胺乳液、泛醇精华、防晒",
      notes: "泛红范围比上周小，鼻翼附近仍有轻微刺痛。",
      hydration: 3,
      sensitivity: 3,
      color: "#dcecf2",
    },
    {
      offset: 0,
      skinState: "稳定透亮",
      products: "氨基酸洁面、烟酰胺精华、清爽防晒",
      notes: "整体状态稳定，额头出油减少，妆前没有明显卡粉。",
      hydration: 4,
      sensitivity: 1,
      color: "#edf5f2",
    },
  ];

  state.entries = demo.map((item) => {
    const date = new Date(today.getTime() - item.offset * day);
    return {
      id: createId(),
      date: toDateInput(date),
      createdAt: date.toISOString(),
      photo: makeDemoImage(item.color, item.skinState, toDateInput(date)),
      skinState: item.skinState,
      products: item.products,
      notes: item.notes,
      hydration: item.hydration,
      sensitivity: item.sensitivity,
    };
  });

  persistEntries();
  renderAll();
  switchView("timeline");
}

function updateMetricLabels() {
  elements.hydrationValue.textContent = `${elements.hydration.value} / 5`;
  elements.sensitivityValue.textContent = `${elements.sensitivity.value} / 5`;
}

function loadEntries() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function persistEntries() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.entries));
}

function formatDate(value) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    weekday: "short",
  });
}

function toDateInput(date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stop-color="${color}"/>
          <stop offset="1" stop-color="#ffffff"/>
        </linearGradient>
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2"/>
          <feColorMatrix type="saturate" values="0"/>
          <feComponentTransfer><feFuncA type="table" tableValues="0 0.12"/></feComponentTransfer>
        </filter>
      </defs>
      <rect width="960" height="1200" fill="url(#bg)"/>
      <rect width="960" height="1200" filter="url(#grain)" opacity="0.22"/>
      <circle cx="490" cy="430" r="250" fill="#f2b9aa" opacity="0.38"/>
      <circle cx="390" cy="390" r="38" fill="#d98975" opacity="0.3"/>
      <circle cx="590" cy="510" r="26" fill="#477264" opacity="0.24"/>
      <text x="80" y="1040" fill="#254a3f" font-family="Arial, sans-serif" font-size="54" font-weight="700">${escapeSvg(title)}</text>
      <text x="80" y="1110" fill="#71777f" font-family="Arial, sans-serif" font-size="34">${escapeSvg(date)}</text>
    </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function escapeSvg(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}
