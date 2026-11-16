
import fs from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";

import { Banner } from "../model/index.model.js";
import { bannerUploadDir } from "../middleware/bannerUpload.js";

// ========================================
// Detect actual image type
// ========================================

function detectImageType(buffer) {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "image/jpeg";
  }

  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([
        137, 80, 78, 71, 13, 10, 26, 10,
      ])
    )
  ) {
    return "image/png";
  }

  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }

  return null;
}

// ========================================
// Create public banner URL
// ========================================

function createImageUrl(req, filename) {
  const base = (
    process.env.BANNER_PUBLIC_BASE_URL ||
    `${req.protocol}://${req.get("host")}`
  ).replace(/\/+$/, "");

  return `${base}/uploads/banners/${filename}`;
}

// ========================================
// Remove local banner image
// ========================================

async function removeLocalBanner(imageUrl) {
  if (!imageUrl) return;

  try {
    const parsed = new URL(imageUrl);

    if (
      !parsed.pathname.startsWith("/uploads/banners/")
    ) {
      return;
    }

    const filename = parsed.pathname.split("/").pop();

    const isValid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/i.test(
        filename || ""
      );

    if (!isValid) return;

    await fs.rm(
      path.join(bannerUploadDir, filename),
      { force: true }
    );
  } catch (error) {
    console.warn(
      "Banner image cleanup warning:",
      error.message
    );
  }
}

// ========================================
// POST /api/banners
// ========================================

export const addBanner = async (req, res) => {
  const image = req.file;

  if (!image) {
    return res.status(400).json({
      message: "Banner image is required",
    });
  }

  try {
    const imageBuffer = await fs.readFile(image.path);

    const actualType = detectImageType(
      imageBuffer.subarray(0, 16)
    );

    if (actualType !== image.mimetype) {
      await fs.rm(image.path, { force: true });

      return res.status(400).json({
        message: "Invalid image file",
      });
    }

    const newBanner = await Banner.create({
      title: String(req.body.title || "")
        .trim()
        .slice(0, 200),

      imageUrl: createImageUrl(
        req,
        image.filename
      ),

      // Legacy ImgBB fields
      imgbbDeleteUrl: "",
      imgbbId: "",
    });

    return res.status(201).json({
      message: "Banner uploaded successfully",
      banner: newBanner,
    });
  } catch (error) {
    await fs.rm(image.path, {
      force: true,
    }).catch(() => {});

    console.error("Banner upload error:", error);

    return res.status(500).json({
      message: "Failed to upload banner",
    });
  }
};

// ========================================
// GET /api/banners
// ========================================

export const getBanners = async (_req, res) => {
  try {
    const banners = await Banner.find().sort({
      uploadedAt: -1,
    });

    return res.status(200).json(banners);
  } catch (error) {
    console.error("Get banners error:", error);

    return res.status(500).json({
      message: "Failed to fetch banners",
    });
  }
};

// ========================================
// DELETE /api/banners/:id
// ========================================

export const deleteBanner = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        message: "Invalid banner ID",
      });
    }

    const banner = await Banner.findById(
      req.params.id
    );

    if (!banner) {
      return res.status(404).json({
        message: "Banner not found",
      });
    }

    const deleted = await Banner.findByIdAndDelete(
      req.params.id
    );

    // Delete local image
    await removeLocalBanner(banner.imageUrl);

    // Old ImgBB images are not deleted
    return res.status(200).json({
      message: "Banner deleted successfully",
      banner: deleted,
    });
  } catch (error) {
    console.error("Delete banner error:", error);

    return res.status(500).json({
      message: "Failed to delete banner",
    });
  }
};
