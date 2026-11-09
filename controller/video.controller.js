// controller/videoController.js
import Video from "../model/video.model.js";

// GET /api/videos?active=&search=&page=&limit=
export const getVideos = async (req, res, next) => {
  try {
    const { active, search = "", page = 1, limit = 40 } = req.query;

    const q = {};
    if (active === "true") q.isActive = true;
    else if (active === "false") q.isActive = false;
    else q.isActive = true;

    if (search?.trim()) {
      q.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 40, 1), 200);
    const skip = (pageNum - 1) * limitNum;

    const [items, total] = await Promise.all([
      Video.find(q).sort({ order: 1, createdAt: -1 }).skip(skip).limit(limitNum),
      Video.countDocuments(q),
    ]);

    res.json({
      items,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/videos/:id
export const getVideoById = async (req, res, next) => {
  try {
    const item = await Video.findById(req.params.id);
    if (!item) return res.status(404).json({ message: "Video not found" });
    if (!item.isActive) return res.status(404).json({ message: "Video not found" });
    res.json(item);
  } catch (err) {
    next(err);
  }
};

// ADMIN: POST /api/videos
export const createVideo = async (req, res, next) => {
  try {
    const { title, youtubeUrl, thumbnailUrl, description, isActive, order } = req.body;
    if (!title || !youtubeUrl) {
      return res.status(400).json({ message: "title and youtubeUrl are required" });
    }

    const item = await Video.create({
      title,
      youtubeUrl,
      thumbnailUrl,
      description,
      isActive: typeof isActive === "boolean" ? isActive : true,
      order: typeof order === "number" ? order : 0,
    });

    res.status(201).json(item);
  } catch (err) {
    next(err);
  }
};

// ADMIN: PUT /api/videos/:id
export const updateVideo = async (req, res, next) => {
  try {
    const updated = await Video.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ message: "Video not found" });
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

// ADMIN: DELETE /api/videos/:id
export const deleteVideo = async (req, res, next) => {
  try {
    const deleted = await Video.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Video not found" });
    res.json({ message: "Deleted successfully" });
  } catch (err) {
    next(err);
  }
};

// ADMIN: PATCH /api/videos/:id/toggle
export const toggleVideoActive = async (req, res, next) => {
  try {
    const item = await Video.findById(req.params.id);
    if (!item) return res.status(404).json({ message: "Video not found" });

    item.isActive = !item.isActive;
    await item.save();

    res.json(item);
  } catch (err) {
    next(err);
  }
};
