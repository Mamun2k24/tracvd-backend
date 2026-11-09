import GeneralSettings from "../model/generalSettings.model.js";
// ⚠️ আপনার imgbb helper ফাংশন ফাইলের সঠিক পাথ এখানে দিন
import { uploadToImgbb } from "../utils/uploadToImgbb.js"; 

// ডাটাবেজে ডকুমেন্ট না থাকলে অটো তৈরি করার হেল্পার
const ensureSingleton = async () => {
  let doc = await GeneralSettings.findOne();
  if (!doc) {
    doc = await GeneralSettings.create({
      logoUrl: "",
      phone: "",
      email: "",
      address: "",
      description: "",
      openTime: "",
      facebookUrl: "",
      instagramUrl: "",
      whatsappUrl: "",
      youtubeUrl: "",
    });
  }
  return doc;
};

// ১. GET: Frontend / Public এর জন্য
export const getGeneralSettings = async (req, res) => {
  try {
    const doc = await ensureSingleton();
    res.status(200).json({ success: true, data: doc });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching settings", error: error.message });
  }
};

// ২. PUT: টেক্সট এবং সোশ্যাল মিডিয়া সেটিংস আপডেট
export const updateGeneralSettings = async (req, res) => {
  try {
    const { 
      phone, 
      email, 
      address, 
      description, 
      openTime,
      facebookUrl,
      instagramUrl,
      whatsappUrl,
      youtubeUrl 
    } = req.body;

    const existing = await ensureSingleton();

    const updated = await GeneralSettings.findByIdAndUpdate(
      existing._id,
      {
        ...(phone !== undefined ? { phone } : {}),
        ...(email !== undefined ? { email } : {}),
        ...(address !== undefined ? { address } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(openTime !== undefined ? { openTime } : {}),
        // 🌟 সোশ্যাল মিডিয়া ফিল্ডস আপডেট
        ...(facebookUrl !== undefined ? { facebookUrl } : {}),
        ...(instagramUrl !== undefined ? { instagramUrl } : {}),
        ...(whatsappUrl !== undefined ? { whatsappUrl } : {}),
        ...(youtubeUrl !== undefined ? { youtubeUrl } : {}),
        
        updatedBy: req.user?._id,
        updatedAt: new Date(),
      },
      { new: true }
    );

    res.status(200).json({ success: true, message: "General settings updated", data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error updating settings", error: error.message });
  }
};

// ৩. POST: লোগো আপলোড ও আপডেট (ImgBB ব্যবহার করে)
export const upsertLogo = async (req, res) => {
  try {
    const doc = await ensureSingleton();

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded. Use form-data field name "logo".',
      });
    }

    const IMGBB_API_KEY = process.env.IMGBB_API_KEY; 
    if (!IMGBB_API_KEY) {
      return res.status(500).json({ success: false, message: "ImgBB API key is missing in .env file" });
    }

    // আপনার তৈরি করা হেল্পার ফাংশন কল করা হলো
    const imgbbData = await uploadToImgbb(req.file.buffer, req.file.originalname, IMGBB_API_KEY);

    doc.logoUrl = imgbbData.url; 
    doc.updatedBy = req.user?._id;
    doc.updatedAt = new Date();
    await doc.save();

    res.json({ success: true, message: "Logo updated successfully", data: { logoUrl: doc.logoUrl } });
  } catch (e) {
    res.status(500).json({ success: false, message: "ImgBB upload failed: " + e.message });
  }
};

// ৪. DELETE: লোগো ডিলিট
export const deleteLogo = async (req, res) => {
  try {
    const doc = await ensureSingleton();

    doc.logoUrl = "";
    doc.updatedBy = req.user?._id;
    doc.updatedAt = new Date();
    await doc.save();

    res.json({ success: true, message: "Logo removed from settings" });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};