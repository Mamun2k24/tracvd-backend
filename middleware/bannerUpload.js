
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const bannerUploadDir = path.join(
  process.cwd(),
  "uploads",
  "banners"
);

fs.mkdirSync(bannerUploadDir, {
  recursive: true,
});

const allowedTypes = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, bannerUploadDir);
  },

  filename: (_req, file, cb) => {
    const ext = allowedTypes.get(file.mimetype);

    cb(
      null,
      `${crypto.randomUUID()}${ext}`
    );
  },
});

const bannerUpload = multer({
  storage,

  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },

  fileFilter: (_req, file, cb) => {
    if (!allowedTypes.has(file.mimetype)) {
      return cb(
        new Error(
          "Only JPG, PNG and WebP images are allowed"
        )
      );
    }

    cb(null, true);
  },
});

export default bannerUpload;
