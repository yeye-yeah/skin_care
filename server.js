const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "data");
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, "db.json");
const SESSION_SECRET = process.env.SESSION_SECRET || "beautypace-local-dev-secret";
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const MAX_JSON_BYTES = 8 * 1024 * 1024;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

ensureDb();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (url.pathname === "/healthz") {
      sendJson(res, 200, { ok: true, service: "BeautyPace" });
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    serveStatic(res, url.pathname);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: "服务器开小差了，请稍后再试。" });
  }
});

server.listen(PORT, () => {
  console.log(`BeautyPace server running on port ${PORT}`);
  console.log(`Data file: ${DB_PATH}`);
});

async function handleApi(req, res, url) {
  const db = readDb();
  const user = getSessionUser(req, db);
  const pathname = url.pathname;

  if (req.method === "POST" && pathname === "/api/register") {
    const body = await readJson(req);
    const username = cleanText(body.username, 24);
    const password = String(body.password || "");

    if (username.length < 2 || password.length < 6) {
      sendJson(res, 400, { error: "用户名至少 2 位，密码至少 6 位。" });
      return;
    }
    if (db.users.some((item) => item.username.toLowerCase() === username.toLowerCase())) {
      sendJson(res, 409, { error: "这个用户名已经被注册。" });
      return;
    }

    const nextUser = {
      id: createId(),
      username,
      password: hashPassword(password),
      reminderTime: "",
      createdAt: new Date().toISOString(),
    };
    db.users.push(nextUser);
    writeDb(db);
    createSession(res, nextUser);
    sendJson(res, 201, { user: publicUser(nextUser) });
    return;
  }

  if (req.method === "POST" && pathname === "/api/login") {
    const body = await readJson(req);
    const found = db.users.find((item) => item.username.toLowerCase() === String(body.username || "").toLowerCase());
    if (!found || !verifyPassword(String(body.password || ""), found.password)) {
      sendJson(res, 401, { error: "用户名或密码不正确。" });
      return;
    }
    createSession(res, found);
    sendJson(res, 200, { user: publicUser(found) });
    return;
  }

  if (req.method === "POST" && pathname === "/api/logout") {
    clearSession(res);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && pathname === "/api/me") {
    sendJson(res, 200, { user: user ? publicUser(user) : null });
    return;
  }

  if (!user) {
    sendJson(res, 401, { error: "请先登录。" });
    return;
  }

  if (req.method === "GET" && pathname === "/api/entries") {
    const entries = db.entries
      .filter((entry) => entry.userId === user.id)
      .sort((a, b) => b.date.localeCompare(a.date));
    sendJson(res, 200, { entries });
    return;
  }

  if (req.method === "POST" && pathname === "/api/entries") {
    const body = await readJson(req, MAX_JSON_BYTES);
    const date = String(body.date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      sendJson(res, 400, { error: "日期格式不正确。" });
      return;
    }

    const entry = {
      id: createId(),
      userId: user.id,
      date,
      createdAt: new Date().toISOString(),
      photo: String(body.photo || ""),
      skinState: cleanText(body.skinState, 30),
      products: cleanText(body.products, 160),
      notes: cleanText(body.notes, 1200),
      hydration: clampNumber(body.hydration, 1, 5, 3),
      sensitivity: clampNumber(body.sensitivity, 1, 5, 2),
    };

    const existing = db.entries.findIndex((item) => item.userId === user.id && item.date === date);
    if (existing >= 0) {
      entry.id = db.entries[existing].id;
      entry.createdAt = db.entries[existing].createdAt;
      entry.photo = entry.photo || db.entries[existing].photo;
      db.entries.splice(existing, 1, entry);
    } else {
      db.entries.push(entry);
    }
    writeDb(db);
    sendJson(res, 200, { entry });
    return;
  }

  const entryDelete = pathname.match(/^\/api\/entries\/([^/]+)$/);
  if (req.method === "DELETE" && entryDelete) {
    const before = db.entries.length;
    db.entries = db.entries.filter((entry) => !(entry.id === entryDelete[1] && entry.userId === user.id));
    writeDb(db);
    sendJson(res, before === db.entries.length ? 404 : 200, { ok: before !== db.entries.length });
    return;
  }

  if (req.method === "GET" && pathname === "/api/shares") {
    const shares = db.shares
      .map((share) => decorateShare(share, db, user.id))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    sendJson(res, 200, { shares });
    return;
  }

  if (req.method === "POST" && pathname === "/api/shares") {
    const body = await readJson(req);
    const share = {
      id: createId(),
      userId: user.id,
      title: cleanText(body.title, 36),
      body: cleanText(body.body, 2000),
      age: cleanText(body.age, 12),
      skinType: cleanText(body.skinType, 20),
      need: cleanText(body.need, 20),
      tags: normalizeTags(body.tags),
      likesBy: [],
      collectedBy: [],
      comments: [],
      createdAt: new Date().toISOString(),
    };
    if (!share.title || !share.body) {
      sendJson(res, 400, { error: "标题和内容不能为空。" });
      return;
    }
    db.shares.push(share);
    writeDb(db);
    sendJson(res, 201, { share: decorateShare(share, db, user.id) });
    return;
  }

  const likeMatch = pathname.match(/^\/api\/shares\/([^/]+)\/like$/);
  if (req.method === "POST" && likeMatch) {
    const share = findShare(db, likeMatch[1], res);
    if (!share) return;
    toggleInArray(share.likesBy, user.id);
    writeDb(db);
    sendJson(res, 200, { share: decorateShare(share, db, user.id) });
    return;
  }

  const collectMatch = pathname.match(/^\/api\/shares\/([^/]+)\/collect$/);
  if (req.method === "POST" && collectMatch) {
    const share = findShare(db, collectMatch[1], res);
    if (!share) return;
    toggleInArray(share.collectedBy, user.id);
    writeDb(db);
    sendJson(res, 200, { share: decorateShare(share, db, user.id) });
    return;
  }

  const commentMatch = pathname.match(/^\/api\/shares\/([^/]+)\/comments$/);
  if (req.method === "POST" && commentMatch) {
    const share = findShare(db, commentMatch[1], res);
    if (!share) return;
    const body = await readJson(req);
    const text = cleanText(body.text, 300);
    if (!text) {
      sendJson(res, 400, { error: "评论不能为空。" });
      return;
    }
    share.comments.push({ id: createId(), userId: user.id, text, createdAt: new Date().toISOString() });
    writeDb(db);
    sendJson(res, 201, { share: decorateShare(share, db, user.id) });
    return;
  }

  if (req.method === "GET" && pathname === "/api/reminder") {
    sendJson(res, 200, { time: user.reminderTime || "" });
    return;
  }

  if (req.method === "PUT" && pathname === "/api/reminder") {
    const body = await readJson(req);
    const time = String(body.time || "");
    if (time && !/^\d{2}:\d{2}$/.test(time)) {
      sendJson(res, 400, { error: "提醒时间格式不正确。" });
      return;
    }
    const found = db.users.find((item) => item.id === user.id);
    found.reminderTime = time;
    writeDb(db);
    sendJson(res, 200, { time });
    return;
  }

  sendJson(res, 404, { error: "接口不存在。" });
}

function serveStatic(res, pathname) {
  const normalized = pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
  const relative = normalized.replace(/^\/+/, "");
  const filePath = path.resolve(ROOT, relative);

  if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    sendText(res, 404, "Not found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
}

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) writeDb({ users: [], entries: [], shares: [] });
}

function readDb() {
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

function writeDb(db) {
  const tempPath = `${DB_PATH}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(db, null, 2));
  fs.renameSync(tempPath, DB_PATH);
}

function readJson(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (Buffer.byteLength(raw) > limit) {
        reject(new Error("payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function createSession(res, user) {
  const payload = Buffer.from(JSON.stringify({ userId: user.id, issuedAt: Date.now() })).toString("base64url");
  const signature = sign(payload);
  const secure = IS_PRODUCTION ? "; Secure" : "";
  res.setHeader("Set-Cookie", `bp_session=${payload}.${signature}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${secure}`);
}

function clearSession(res) {
  const secure = IS_PRODUCTION ? "; Secure" : "";
  res.setHeader("Set-Cookie", `bp_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`);
}

function getSessionUser(req, db) {
  const token = getCookie(req, "bp_session");
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature || sign(payload) !== signature) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const age = Date.now() - Number(session.issuedAt || 0);
    if (age > 7 * 24 * 60 * 60 * 1000) return null;
    return db.users.find((user) => user.id === session.userId) || null;
  } catch {
    return null;
  }
}

function getCookie(req, name) {
  const cookie = req.headers.cookie || "";
  return cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function sign(value) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(value).digest("base64url");
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(candidate, "hex"));
}

function decorateShare(share, db, currentUserId) {
  const author = db.users.find((user) => user.id === share.userId)?.username || "已注销用户";
  return {
    ...share,
    author,
    likes: share.likesBy.length,
    liked: share.likesBy.includes(currentUserId),
    collected: share.collectedBy.includes(currentUserId),
    comments: share.comments.map((comment) => ({
      ...comment,
      author: db.users.find((user) => user.id === comment.userId)?.username || "已注销用户",
    })),
  };
}

function findShare(db, id, res) {
  const share = db.shares.find((item) => item.id === id);
  if (!share) sendJson(res, 404, { error: "分享不存在。" });
  return share;
}

function toggleInArray(items, value) {
  const index = items.indexOf(value);
  if (index >= 0) items.splice(index, 1);
  else items.push(value);
}

function normalizeTags(tags) {
  const source = Array.isArray(tags) ? tags : String(tags || "").split(/[,，#\s]+/);
  return [...new Set(source.map((tag) => cleanText(tag, 18)).filter(Boolean))].slice(0, 8);
}

function cleanText(value, max) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, max);
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function publicUser(user) {
  return { id: user.id, username: user.username, reminderTime: user.reminderTime || "" };
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function createId() {
  return crypto.randomBytes(12).toString("hex");
}
