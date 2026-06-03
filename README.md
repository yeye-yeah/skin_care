# BeautyPace

BeautyPace 是一个护肤打卡与社区交流网站，包含用户注册、登录、护肤记录、照片对比、社区分享、点赞、收藏和评论。

## 本地运行

```powershell
npm start
```

如果系统 `node` 不可用，可以运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\start-server.ps1
```

打开：

```text
http://localhost:3000
```

## 数据存储

当前版本使用服务器端 JSON 文件存储数据。默认数据文件会自动创建在：

```text
data/db.json
```

部署到云平台时，请配置持久化磁盘，并设置：

```text
DATA_DIR=/var/data/beautypace
```

否则云平台重新部署或重启后，临时文件系统里的用户和社区数据可能会丢失。

## 环境变量

参考 `.env.example`：

```text
NODE_ENV=production
PORT=3000
DATA_DIR=/var/data/beautypace
SESSION_SECRET=replace-with-a-long-random-secret
```

`SESSION_SECRET` 请换成一段足够长的随机字符串，不要使用示例值。

## Render 部署要点

1. 把项目推到 GitHub。
2. 在 Render 创建 Web Service，连接这个仓库。
3. Build Command 留空或填 `npm install`。
4. Start Command 填：

```text
npm start
```

5. 添加 Persistent Disk：
   - Mount Path: `/var/data/beautypace`
   - Size: 按需要选择
6. 添加环境变量：
   - `NODE_ENV=production`
   - `DATA_DIR=/var/data/beautypace`
   - `SESSION_SECRET=<一段长随机字符串>`

部署成功后，Render 会提供一个公网网址，朋友访问这个网址即可注册和使用。

## 健康检查

服务提供健康检查接口：

```text
/healthz
```

返回 `ok: true` 表示服务正在运行。
