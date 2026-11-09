import { HomeSectionSetting } from "../model/index.model.js";


const DEFAULTS = [
  {
    key: "men",
    sectionTitle: "Men's Collection",
    subtitles: [
      { text: "Grab these new items before they are gone!", order: 1, isActive: true },
      { text: "Fresh drops weekly!", order: 2, isActive: true },
      { text: "Best picks for you!", order: 3, isActive: true },
    ],
    isEnabled: true,
  },
  {
    key: "women",
    sectionTitle: "Women's Collection",
    subtitles: [
      { text: "New arrivals tailored just for you!", order: 1, isActive: true },
      { text: "Trending styles inside!", order: 2, isActive: true },
      { text: "Limited stock—shop now!", order: 3, isActive: true },
    ],
    isEnabled: true,
  },
  {
    key: "kids",
    sectionTitle: "Kid's Collection",
    subtitles: [
      { text: "Comfort meets style for the little ones!", order: 1, isActive: true },
      { text: "Play-ready favorites!", order: 2, isActive: true },
      { text: "Cute + comfy picks!", order: 3, isActive: true },
    ],
    isEnabled: true,
  },
  {
    key: "accessories",
    sectionTitle: "Accessories Collection",
    subtitles: [
      { text: "Grab these new items before they are gone!", order: 1, isActive: true },
      { text: "Complete your look!", order: 2, isActive: true },
      { text: "Small things, big style!", order: 3, isActive: true },
    ],
    isEnabled: true,
  },
];

function getActiveCount(subtitles = []) {
  return subtitles.filter((s) => s?.isActive !== false && String(s?.text || "").trim()).length;
}

function normalizeSubtitles(subtitles = []) {
  // keep only items with text, sort by order, re-number order
  const cleaned = subtitles
    .map((s, idx) => ({
      text: String(s?.text || "").trim(),
      order: Number.isFinite(Number(s?.order)) ? Number(s.order) : idx + 1,
      isActive: s?.isActive !== false,
    }))
    .filter((s) => s.text.length > 0)
    .sort((a, b) => a.order - b.order)
    .map((s, i) => ({ ...s, order: i + 1 }));
  return cleaned;
}

/**
 * GET /api/home-section-settings
 * Ensures all 4 exist (auto-seed if missing), returns sorted list
 */
export const getAllHomeSectionSettings = async (req, res) => {
  try {
    // auto-seed missing keys
    const existing = await HomeSectionSetting.find({}, { __v: 0 }).lean();
    const existingKeys = new Set(existing.map((x) => x.key));

    const missing = DEFAULTS.filter((d) => !existingKeys.has(d.key));
    if (missing.length) {
      await HomeSectionSetting.insertMany(missing, { ordered: false });
    }

    const data = await HomeSectionSetting.find({}, { __v: 0 })
      .sort({ key: 1 })
      .lean();

    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/home-section-settings/:key
 */
export const getHomeSectionSettingByKey = async (req, res) => {
  try {
    const { key } = req.params;

    const doc = await HomeSectionSetting.findOne({ key }, { __v: 0 }).lean();
    if (!doc) {
      return res.status(404).json({ success: false, message: "Section not found" });
    }

    return res.status(200).json({ success: true, data: doc });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * PUT /api/home-section-settings/:key
 * body: { sectionTitle, subtitles, isEnabled }
 */
export const upsertHomeSectionSettingByKey = async (req, res) => {
  try {
    const { key } = req.params;
    const { sectionTitle, subtitles, isEnabled } = req.body || {};

    if (!["men", "women", "kids", "accessories"].includes(key)) {
      return res.status(400).json({ success: false, message: "Invalid section key" });
    }

    const title = String(sectionTitle || "").trim();
    if (!title) {
      return res.status(400).json({ success: false, message: "sectionTitle is required" });
    }

    const normalizedSubs = normalizeSubtitles(subtitles || []);
    const activeCount = getActiveCount(normalizedSubs);
    if (activeCount < 3) {
      return res.status(400).json({
        success: false,
        message: "Minimum 3 subtitle texts are required",
      });
    }

    const payload = {
      key,
      sectionTitle: title,
      subtitles: normalizedSubs,
      isEnabled: typeof isEnabled === "boolean" ? isEnabled : true,
    };

    const updated = await HomeSectionSetting.findOneAndUpdate(
      { key },
      { $set: payload },
      { new: true, upsert: true, runValidators: true, projection: { __v: 0 } }
    ).lean();

    return res.status(200).json({ success: true, data: updated });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
