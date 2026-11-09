// controllers/siteTicker.controller.js
import { SiteTicker} from "../model/index.model.js";

/**
 * GET /api/site/ticker
 * Public (or protected if you want)
 */
export const getSiteTicker = async (req, res) => {
  try {
    const doc = await SiteTicker.findOne({ key: "home_top_ticker" }).lean();

    // If not created yet, return defaults (no need to create doc)
    if (!doc) {
      return res.status(200).json({
        enabled: true,
        direction: "left",
        speed: 35,
        pauseOnHover: true,
        items: [],
      });
    }

    // return only needed fields
    return res.status(200).json({
      enabled: doc.enabled ?? true,
      direction: doc.direction ?? "left",
      speed: doc.speed ?? 35,
      pauseOnHover: doc.pauseOnHover ?? true,
      items: Array.isArray(doc.items) ? doc.items : [],
    });
  } catch (error) {
    console.error("getSiteTicker error:", error);
    return res.status(500).json({ message: "Failed to load ticker settings" });
  }
};

/**
 * PUT /api/site/ticker
 * Admin protected recommended
 * Body: { enabled, direction, speed, pauseOnHover, items }
 */
export const upsertSiteTicker = async (req, res) => {
  try {
    const {
      enabled,
      direction,
      speed,
      pauseOnHover,
      items, // [{id,text,icon?,active}]
    } = req.body || {};

    // Basic validation (keep it simple but safe)
    if (direction && !["left", "right"].includes(direction)) {
      return res.status(400).json({ message: "Invalid direction" });
    }

    // sanitize items
    let safeItems = [];
    if (Array.isArray(items)) {
      safeItems = items
        .filter((it) => it && typeof it === "object")
        .map((it) => ({
          id: String(it.id || "").trim(),
          text: String(it.text || "").trim(),
          icon: it.icon ? String(it.icon).trim() : "",
          active: typeof it.active === "boolean" ? it.active : true,
        }))
        .filter((it) => it.id && it.text); // must have id & text
    }

    const payload = {
      ...(typeof enabled === "boolean" ? { enabled } : {}),
      ...(direction ? { direction } : {}),
      ...(typeof speed === "number" ? { speed: Math.min(80, Math.max(10, speed)) } : {}),
      ...(typeof pauseOnHover === "boolean" ? { pauseOnHover } : {}),
      ...(items !== undefined ? { items: safeItems } : {}),
    };

    const updated = await SiteTicker.findOneAndUpdate(
      { key: "home_top_ticker" },
      { $set: { key: "home_top_ticker", ...payload } },
      { new: true, upsert: true }
    ).lean();

    return res.status(200).json({
      message: "Ticker settings saved",
      ticker: {
        enabled: updated.enabled ?? true,
        direction: updated.direction ?? "left",
        speed: updated.speed ?? 35,
        pauseOnHover: updated.pauseOnHover ?? true,
        items: Array.isArray(updated.items) ? updated.items : [],
      },
    });
  } catch (error) {
    console.error("upsertSiteTicker error:", error);
    return res.status(500).json({ message: "Failed to save ticker settings" });
  }
};
