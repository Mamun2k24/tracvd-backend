// middleware/upload.js
// import multer from "multer";
// import fs from "fs";
// import path from "path";
// import { UPLOAD_DIR } from "../config/paths.js";

// if (!fs.existsSync(UPLOAD_DIR)) {
//   fs.mkdirSync(UPLOAD_DIR, { recursive: true });
// }

// const slug = (s) =>
//   String(s).toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9\-_.]/g, "").slice(0, 80);

// const storage = multer.diskStorage({
//   destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
//   filename: (_req, file, cb) => {
//     const ext = path.extname(file.originalname) || "";
//     const base = path.basename(file.originalname, ext);
//     cb(null, `${slug(base)}-${Date.now()}.rand${Math.random().toString(36).slice(2,8)}${ext}`);
//   },
// });

// const upload = multer({
//   storage,
//   limits: { fileSize: 5 * 1024 * 1024 },
//   fileFilter: (_req, file, cb) => {
//     const ok = /image\/(png|jpe?g|webp|gif|svg\+xml)/i.test(file.mimetype);
//     cb(ok ? null : new Error("Only image uploads are allowed"), ok);
//   },
// });

// export default upload;

// uporer image upload system holo server a upload korar jonno

import multer from "multer";

const storage = multer.memoryStorage();

const uploadMemory = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB (ইচ্ছেমতো)
});

export default uploadMemory;