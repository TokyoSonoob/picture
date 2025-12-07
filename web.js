const express = require("express");
const session = require("express-session");
const multer = require("multer");
const path = require("path");

const GUILD_ID = "1401622759582466229";
const ALBUM_CATEGORY_ID = "1447008816402272276";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function createWebApp(client) {
  const app = express();

  app.use(express.json());
  app.use(
    session({
      secret: "photo-by-dekRIE",
      resave: false,
      saveUninitialized: false,
      cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 },
    })
  );

  app.use(express.static(__dirname));

  function getUser(req) {
    return req.session && req.session.user ? req.session.user : null;
  }

  function requireAdmin(req, res, next) {
    const u = getUser(req);
    if (!u || u.role !== "ADMIN")
      return res.status(403).json({ error: "forbidden" });
    next();
  }

  app.get("/api/session", (req, res) => {
    res.json({ user: getUser(req) });
  });

  app.post("/api/login", (req, res) => {
    const { name, pass } = req.body || {};
    let user = null;
    if (name === "ADMINBALL" && pass === "พี่บอลตัวตึง")
      user = { name: "ADMINBALL", role: "ADMIN" };
    else if (name === "Us" && pass === "เสือก")
      user = { name: "Us", role: "USER" };
    if (!user)
      return res
        .status(401)
        .json({ error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
    req.session.user = user;
    res.json({ user });
  });

  app.post("/api/logout", (req, res) => {
    if (req.session) req.session.destroy(() => {});
    res.json({ ok: true });
  });

  app.get("/api/albums", async (req, res) => {
    try {
      const guild = await client.guilds.fetch(GUILD_ID);
      const channels = await guild.channels.fetch();
      const withPreview =
        req.query.withPreview === "1" || req.query.withPreview === "true";
      const albums = [];
      for (const [, ch] of channels) {
        if (!ch) continue;
        if (ch.parentId !== ALBUM_CATEGORY_ID) continue;
        if (ch.type !== 0) continue;
        const base = {
          id: ch.id,
          title: ch.name,
          createdAt: ch.createdTimestamp || Date.now(),
          previewUrl: null,
        };
        if (withPreview) {
          try {
            const msgs = await ch.messages.fetch({ limit: 20 });
            const msg = msgs.find(
              (m) => m.attachments && m.attachments.size > 0
            );
            if (msg) {
              const att = msg.attachments.first();
              if (att) base.previewUrl = att.url;
            }
          } catch {}
        }
        albums.push(base);
      }
      albums.sort((a, b) => a.createdAt - b.createdAt);
      res.json(albums);
    } catch (e) {
      console.error("GET /api/albums error", e);
      res.status(500).json({ error: "failed_to_list_albums" });
    }
  });

  app.post("/api/albums", requireAdmin, async (req, res) => {
    try {
      const { title } = req.body || {};
      if (!title || typeof title !== "string")
        return res.status(400).json({ error: "invalid_title" });
      const guild = await client.guilds.fetch(GUILD_ID);
      const chan = await guild.channels.create({
        name: title,
        parent: ALBUM_CATEGORY_ID,
        reason: "Create photo album from web",
        type: 0,
      });
      res.json({
        id: chan.id,
        title: chan.name,
        createdAt: chan.createdTimestamp || Date.now(),
        previewUrl: null,
      });
    } catch (e) {
      console.error("POST /api/albums error", e);
      res.status(500).json({ error: "failed_to_create_album" });
    }
  });

  app.put("/api/albums/:id", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      let { title } = req.body || {};
      if (!title || typeof title !== "string")
        return res.status(400).json({ error: "invalid_title" });
      title = title.trim();
      if (!title)
        return res.status(400).json({ error: "invalid_title" });
      const ch = await client.channels.fetch(id);
      if (!ch || ch.parentId !== ALBUM_CATEGORY_ID || ch.type !== 0)
        return res.status(404).json({ error: "album_not_found" });
      await ch.setName(title);
      res.json({
        id: ch.id,
        title: ch.name,
        createdAt: ch.createdTimestamp || Date.now(),
        previewUrl: null,
      });
    } catch (e) {
      console.error("PUT /api/albums/:id error", e);
      res.status(500).json({ error: "failed_to_rename_album" });
    }
  });

  app.delete("/api/albums/:id", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const ch = await client.channels.fetch(id);
      if (!ch || ch.parentId !== ALBUM_CATEGORY_ID)
        return res.status(404).json({ error: "album_not_found" });
      await ch.delete("Delete photo album from web");
      res.status(204).end();
    } catch (e) {
      console.error("DELETE /api/albums/:id error", e);
      res.status(500).json({ error: "failed_to_delete_album" });
    }
  });

  app.get("/api/albums/:id/photos", async (req, res) => {
    try {
      const { id } = req.params;
      const ch = await client.channels.fetch(id);
      if (!ch || ch.parentId !== ALBUM_CATEGORY_ID)
        return res.status(404).json({ error: "album_not_found" });
      const msgs = await ch.messages.fetch({ limit: 100 });
      const photos = [];
      msgs.forEach((m) => {
        if (!m.attachments || m.attachments.size === 0) return;
        const att = m.attachments.first();
        if (!att) return;
        photos.push({
          id: m.id,
          url: att.url,
          uploadedAt: m.createdTimestamp || Date.now(),
        });
      });
      photos.sort((a, b) => a.uploadedAt - b.uploadedAt);
      res.json({ photos });
    } catch (e) {
      console.error("GET /api/albums/:id/photos error", e);
      res.status(500).json({ error: "failed_to_list_photos" });
    }
  });

  app.post(
    "/api/albums/:id/upload",
    requireAdmin,
    upload.single("image"),
    async (req, res) => {
      try {
        const { id } = req.params;
        if (!req.file) return res.status(400).json({ error: "no_file" });
        const ch = await client.channels.fetch(id);
        if (!ch || ch.parentId !== ALBUM_CATEGORY_ID)
          return res.status(404).json({ error: "album_not_found" });
        await ch.send({
          files: [{ attachment: req.file.buffer, name: req.file.originalname }],
        });
        res.status(201).json({ ok: true });
      } catch (e) {
        console.error("POST /api/albums/:id/upload error", e);
        res.status(500).json({ error: "failed_to_upload" });
      }
    }
  );

  app.delete(
    "/api/albums/:albumId/photos/:photoId",
    requireAdmin,
    async (req, res) => {
      try {
        const { albumId, photoId } = req.params;
        const ch = await client.channels.fetch(albumId);
        if (!ch || ch.parentId !== ALBUM_CATEGORY_ID)
          return res.status(404).json({ error: "album_not_found" });
        let msgId = photoId;
        const idx = photoId.indexOf(":");
        if (idx !== -1) msgId = photoId.slice(0, idx);
        const msg = await ch.messages.fetch(msgId);
        if (!msg) return res.status(404).json({ error: "photo_not_found" });
        await msg.delete("Delete photo from web");
        res.status(204).end();
      } catch (e) {
        console.error(
          "DELETE /api/albums/:albumId/photos/:photoId error",
          e
        );
        res.status(500).json({ error: "failed_to_delete_photo" });
      }
    }
  );

  app.get(/^\/(?!api\/).*/, (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
  });

  return app;
}

module.exports = { createWebApp };
