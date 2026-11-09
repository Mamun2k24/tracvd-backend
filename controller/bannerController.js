import axios from "axios";
import { Banner } from "../model/index.model.js";
import { uploadToImgbb } from "../utils/uploadToImgbb.js";

// POST: Add a new banner (Upload to ImgBB)
export const addBanner = async (req, res) => {
  try {
    const { title } = req.body;
    const image = req.file;

    if (!image) {
      return res.status(400).json({ message: "Image is required" });
    }

    const apiKey = process.env.IMGBB_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ message: "IMGBB_API_KEY missing in env" });
    }

    // Upload to ImgBB using your util
    const imgbbData = await uploadToImgbb(
      image.buffer,
      image.originalname,
      apiKey
    );

    // Save hosted url in DB
    const newBanner = new Banner({
  imageUrl: imgbbData.url,
  title: title || "",
  imgbbDeleteUrl: imgbbData.delete_url || "",
  imgbbId: imgbbData.id || "",
});

    await newBanner.save();

    res.status(201).json({
      message: "Banner uploaded successfully",
      banner: newBanner,
    });
  } catch (error) {
    console.error("Error uploading banner (ImgBB):", error?.response?.data || error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// GET: Fetch all banners
export const getBanners = async (req, res) => {
  try {
    const banners = await Banner.find().sort({ uploadedAt: -1 });
    res.status(200).json(banners);
  } catch (error) {
    console.error("Error fetching banners:", error);
    res.status(500).json({ message: "Failed to fetch banners" });
  }
};

// DELETE: Remove a banner by ID (Also delete from ImgBB if possible)
export const deleteBanner = async (req, res) => {
  const { id } = req.params;

  try {
    const banner = await Banner.findById(id);
    if (!banner) {
      return res.status(404).json({ message: "Banner not found" });
    }

    // Delete image from ImgBB (optional but good)
    if (banner.imgbbDeleteUrl) {
      try {
        await axios.get(banner.imgbbDeleteUrl);
      } catch (e) {
        console.warn("ImgBB delete failed (continuing DB delete):", e?.response?.data || e);
      }
    }

    // Delete from DB
    const deleted = await Banner.findByIdAndDelete(id);

    res.status(200).json({
      message: "Banner deleted successfully",
      banner: deleted,
    });
  } catch (error) {
    console.error("Error deleting banner:", error);
    res.status(500).json({ message: "Failed to delete banner" });
  }
};
