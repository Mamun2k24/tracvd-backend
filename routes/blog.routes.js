import { Router } from "express";
import { protect, ensureAdmin } from "../middleware/protect.js";
import {
  publicBlogs, publicCategories, publicBlogBySlug,
  adminBlogs, adminOneBlog, createBlog, updateBlog, deleteBlog,
} from "../controller/blog.controller.js";
import { uploadBlogImage } from "../middleware/blogUpload.js";

const router = Router();
router.get("/", publicBlogs);
router.get("/categories", publicCategories);
// All /admin routes come before /:slug.
router.use("/admin", protect, ensureAdmin);
router.get("/admin", adminBlogs);
router.get("/admin/:id", adminOneBlog);
router.post("/admin", createBlog);
router.post("/admin/upload", uploadBlogImage);
router.patch("/admin/:id", updateBlog);
router.delete("/admin/:id", deleteBlog);
router.get("/:slug", publicBlogBySlug);
export default router;
