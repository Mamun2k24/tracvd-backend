// controller/shippingSettings.controller.js

import { ShippingSettings} from "../model/index.model.js";
// helper: single doc always "default"
const DEFAULT_KEY = "default";

// ✅ public – no auth
export const getPublicShippingSettings = async (_req, res) => {
  try {
    const doc = await ShippingSettings.findOne({ key: DEFAULT_KEY }).lean();

    return res.json({
      success: true,
      data: doc || {
        key: DEFAULT_KEY,
        insideDhakaRate: 0,
        outsideDhakaRate: 0,
        freeThreshold: 0,
        freeForDistricts: [],
        campaign: { active: false, startAt: null, endAt: null, freeThreshold: 0 },
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Failed to load shipping settings" });
  }
};

// ✅ admin – upsert/update (protect + ensureAdmin routes এ থাকবে)
export const upsertShippingSettings = async (req, res) => {
  try {
    const payload = req.body || {};

    // key enforce করে দিলাম যাতে multi doc না হয়
    payload.key = DEFAULT_KEY;

    const doc = await ShippingSettings.findOneAndUpdate(
      { key: DEFAULT_KEY },
      { $set: payload },
      { new: true, upsert: true }
    ).lean();

    return res.json({
      success: true,
      message: "Shipping settings updated",
      data: doc,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Failed to update shipping settings" });
  }
};
