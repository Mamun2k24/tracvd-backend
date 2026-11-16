
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

import { Banner } from "../model/index.model.js";
import { bannerUploadDir } from "../middleware/bannerUpload.js";

// ========================================
// Verify actual image file type
// ========================================

const detectImageType = (buffer) => {
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
};

// ========================================
// Build public banner image URL
// ========================================

const getPublicImageUrl = (req, filename) => {
  const base = (
    process.env.BANNER_PUBLIC_BASE_URL ||
    `${req.protocol}://${req.get("host")}`
  ).replace(/\/+$/, "");

  return `${base}/uploads/banners/${filename}`;
};

// ========================================
// Delete only images in local banner folder
// ========================================

const removeLocalBannerImage = async (imageUrl) => {
  if (!imageUrl) return;

  try {
    const url = new URL(
      imageUrl,
      "http://localhost"
    );

    if (
      !url.pathname.startsWith("/uploads/banners/")
    ) {
      return;
    }

    const filename = path.basename(url.pathname);

    // Only server-generated banner filenames
    const validFilename =
      /^[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(
        filename
      ) &&
      crypto.version
        ? true
        : false;

    if (!validFilename) return;

    const filePath = path.join(
      bannerUploadDir,
      filename
    );

    await fs.rm(filePath, {
      force: true,
    });
  } catch (error) {
    console.warn(
      "Local banner image cleanup failed:",
      error.message
    );
  }
};

// ========================================
// POST /api/banners
// Add Banner
// ========================================

export const addBanner = async (req, res) => {
  const image = req.file;

  if (!image) {
    return res.status(400).json({
      message: "Banner image is required",
    });
  }

  try {
    const fileBuffer = await fs.readFile(
      image.path
    );

    const actualType = detectImageType(
      fileBuffer.subarray(0, 16)
    );

    if (actualType !== image.mimetype) {
      await fs.rm(image.path, {
        force: true,
      });

      return res.status(400).json({
        message: "Invalid image file",
      });
    }

    const imageUrl = getPublicImageUrl(
      req,
      image.filename
    );

    const newBanner = new Banner({
      title: String(req.body.title || "")
        .trim()
        .slice(0, 200),

      imageUrl,

      // Old ImgBB fields kept empty for compatibility
      imgbbDeleteUrl: "",
      imgbbId: "",
    });

    await newBanner.save();

    return res.status(201).json({
      message: "Banner uploaded successfully",
      banner: newBanner,
    });
  } catch (error) {
    await fs.rm(image.path, {
      force: true,
    }).catch(() => {});

    console.error(
      "Banner upload error:",
      error
    );

    return res.status(500).json({
      message: "Failed to upload banner",
    });
  }
};

// ========================================
// GET /api/banners
// Get all banners
// ========================================

export const getBanners = async (_req, res) => {
  try {
    const banners = await Banner.find().sort({
      uploadedAt: -1,
    });

    return res.status(200).json(banners);
  } catch (error) {
    console.error(
      "Get banners error:",
      error
    );

    return res.status(500).json({
      message: "Failed to fetch banners",
    });
  }
};

// ========================================
// DELETE /api/banners/:id
// Delete banner and local image
// ========================================

export const deleteBanner = async (req, res) => {
  try {
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

    // Delete local image, if it belongs
    // to the new local upload system.
    await removeLocalBannerImage(
      banner.imageUrl
    );

    // Old ImgBB banners:
    // their database records are deleted,
    // but externally hosted images are untouched.

    return res.status(200).json({
      message: "Banner deleted successfully",
      banner: deleted,
    });
  } catch (error) {
    console.error(
      "Delete banner error:",
      error
    );

    return res.status(500).json({
      message: "Failed to delete banner",
    });
  }
};
