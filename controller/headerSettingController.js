import { HeaderSetting} from "../model/index.model.js";

const getOrCreateHeader = async () => {
  let doc = await HeaderSetting.findOne();
  if (!doc) doc = await HeaderSetting.create({});
  return doc;
};

export const getPublicHeader = async (req, res) => {
  try {
    const doc = await getOrCreateHeader();

    const topBarTexts =
      Array.isArray(doc.topBarTexts) && doc.topBarTexts.length
        ? doc.topBarTexts
        : doc.topBarText
        ? [doc.topBarText]
        : [];

    res.json({
      success: true,
      data: {
        topBarTexts,
        showTopBar: doc.showTopBar,
        socialLinks: doc.socialLinks,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

export const updateHeader = async (req, res) => {
  try {
    const doc = await getOrCreateHeader();

    const { topBarTexts, topBarText, showTopBar, socialLinks } = req.body;

    if (Array.isArray(topBarTexts)) {
      doc.topBarTexts = topBarTexts
        .map((t) => (typeof t === "string" ? t.trim() : ""))
        .filter(Boolean);

      // optional: legacy sync
      doc.topBarText = doc.topBarTexts[0] || "";
    } else if (typeof topBarText === "string") {
      // fallback old request body
      doc.topBarText = topBarText;
      doc.topBarTexts = topBarText.trim() ? [topBarText.trim()] : [];
    }

    if (typeof showTopBar === "boolean") doc.showTopBar = showTopBar;

    // ✅ socialLinks part তোমার আগেরটাই থাকবে
    // (no change)

    await doc.save();
    res.json({ success: true, message: "Header updated", data: doc });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: e.message });
  }
};


