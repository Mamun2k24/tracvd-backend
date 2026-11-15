import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const blogUploadDir = path.join(process.cwd(), "uploads", "blog");
fs.mkdirSync(blogUploadDir, { recursive: true });
const allowed = new Map([
  ["image/jpeg", ".jpg"], ["image/png", ".png"], ["image/webp", ".webp"],
]);
export const blogUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, blogUploadDir),
    filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${allowed.get(file.mimetype) || ".bin"}`),
  }),
  limits: { fileSize: 3 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!allowed.has(file.mimetype)) return cb(new Error("Only JPG, PNG or WebP images allowed"));
    cb(null, true);
  },
}).single("image");

const realImageType = (buf) => {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
};
export const uploadBlogImage = (req, res, next) => {
  blogUpload(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message });
    if (!req.file) return res.status(400).json({ message: "No image supplied" });
    const header = Buffer.alloc(12);
    try {
      const fd = fs.openSync(req.file.path, "r");
      try { fs.readSync(fd, header, 0, 12, 0); } finally { fs.closeSync(fd); }
    } catch (e) { fs.rmSync(req.file.path, { force: true }); return next(e); }
    if (realImageType(header) !== req.file.mimetype) {
      fs.rmSync(req.file.path, { force: true });
      return res.status(400).json({ message: "Invalid or damaged image" });
    }
    // Origin is configured for deployment proxies (BLOG_PUBLIC_BASE_URL optional).
    const base = (process.env.BLOG_PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
    res.status(201).json({ url: `${base}/uploads/blog/${req.file.filename}` });
  });
};
