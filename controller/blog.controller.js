import Blog from "../model/blog.model.js";

const slugify = (text) => String(text || "")
  .normalize("NFKC").toLowerCase().trim()
  .replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 105);
const fields = "title slug excerpt category coverImage imageAlt author tags featured status publishedAt createdAt views";
const safePage = (v) => Math.max(1, Math.min(100000, Number.parseInt(v, 10) || 1));
const safeLimit = (v) => Math.max(1, Math.min(24, Number.parseInt(v, 10) || 9));
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const buildSearch = (search) => search ? { $regex: escapeRegex(search.slice(0, 100)), $options: "i" } : null;

const validatePayload = (input, partial = false) => {
  const obj = {};
  for (const key of ["title", "excerpt", "content", "category", "coverImage", "imageAlt", "author", "status", "featured", "tags"]) {
    if (Object.prototype.hasOwnProperty.call(input, key)) obj[key] = input[key];
  }
  if (obj.tags !== undefined) {
    obj.tags = Array.isArray(obj.tags) ? obj.tags.map(x => String(x).trim()).filter(Boolean).slice(0, 12) : [];
  }
  for (const key of ["title", "excerpt", "content", "category", "coverImage", "imageAlt", "author"]) {
    if (obj[key] !== undefined) obj[key] = String(obj[key]).trim();
  }
  if (obj.featured !== undefined) obj.featured = obj.featured === true;
  if (obj.status !== undefined && !["draft", "published"].includes(obj.status)) throw Error("Invalid status");
  if (!partial && (!obj.title || !obj.content || !obj.category)) throw Error("Title, category and content are required");
  if (obj.title !== undefined && !obj.title) throw Error("Title cannot be empty");
  if (obj.category !== undefined && !obj.category) throw Error("Category cannot be empty");
  if (obj.content !== undefined && !obj.content) throw Error("Content cannot be empty");
  for (const key of ["coverImage"]) {
    if (obj[key] && !/^https?:\/\//i.test(obj[key]) && !obj[key].startsWith("/uploads/blog/")) throw Error("Invalid image URL");
  }
  return obj;
};
const errorResponse = (res, err) => res.status(err.code === 11000 ? 409 : 400).json({ message: err.code === 11000 ? "Slug already exists" : err.message });

export const publicBlogs = async (req, res, next) => {
  try {
    const page = safePage(req.query.page), limit = safeLimit(req.query.limit);
    const filter = { status: "published" };
    if (req.query.category) filter.category = String(req.query.category).slice(0, 80);
    if (req.query.search) {
      const q = buildSearch(String(req.query.search));
      filter.$or = [{ title: q }, { excerpt: q }, { content: q }];
    }
    const [items, total] = await Promise.all([
      Blog.find(filter).select(fields).sort({ featured: -1, publishedAt: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Blog.countDocuments(filter),
    ]);
    res.json({ items, total, page, pages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
};
export const publicCategories = async (_req, res, next) => {
  try {
    const categories = await Blog.aggregate([
      { $match: { status: "published" } },
      { $group: { _id: "$category", count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);
    res.json({ items: categories.map(x => ({ name: x._id, count: x.count })) });
  } catch (err) { next(err); }
};
export const publicBlogBySlug = async (req, res, next) => {
  try {
    const blog = await Blog.findOne({ slug: req.params.slug, status: "published" });
    if (!blog) return res.status(404).json({ message: "Article not found" });
    // No counter increment on every view, avoiding write amplification/bot-inflated counts.
    const related = await Blog.find({ _id: { $ne: blog._id }, status: "published", category: blog.category })
      .select(fields).sort({ publishedAt: -1 }).limit(3).lean();
    res.json({ item: blog, related });
  } catch (err) { next(err); }
};
export const adminBlogs = async (req, res, next) => {
  try {
    const page = safePage(req.query.page), limit = safeLimit(req.query.limit || 12);
    const filter = {};
    if (req.query.status && ["draft", "published"].includes(req.query.status)) filter.status = req.query.status;
    if (req.query.search) filter.title = buildSearch(String(req.query.search));
    const [items, total] = await Promise.all([
      Blog.find(filter).select(fields).sort({ updatedAt: -1 }).skip((page-1)*limit).limit(limit).lean(),
      Blog.countDocuments(filter),
    ]);
    res.json({ items, total, page, pages: Math.ceil(total / limit) });
  } catch(err) { next(err); }
};
export const adminOneBlog = async (req, res, next) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) return res.status(404).json({ message: "Blog not found" });
    res.json({ item: blog });
  } catch(err) { next(err); }
};
export const createBlog = async (req, res) => {
  try {
    const data = validatePayload(req.body);
    const base = slugify(data.title) || "blog";
    data.slug = `${base}-${Date.now().toString(36)}`;
    if (data.status === "published") data.publishedAt = new Date();
    const item = await Blog.create(data);
    res.status(201).json({ item, message: "Blog created" });
  } catch(err) { errorResponse(res, err); }
};
export const updateBlog = async (req, res) => {
  try {
    const data = validatePayload(req.body, true);
    const item = await Blog.findById(req.params.id);
    if (!item) return res.status(404).json({ message: "Blog not found" });
    // Stable slug: editing a title must not break old shared links.
    if (data.status === "published" && item.status !== "published") data.publishedAt = new Date();
    Object.assign(item, data);
    await item.save();
    res.json({ item, message: "Blog updated" });
  } catch(err) { errorResponse(res, err); }
};
export const deleteBlog = async (req, res, next) => {
  try {
    const item = await Blog.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ message: "Blog not found" });
    res.json({ message: "Blog deleted" });
  } catch(err) { next(err); }
};
