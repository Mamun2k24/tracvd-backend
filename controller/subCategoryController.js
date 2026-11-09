import { Category, SubCategory } from "../model/index.model.js";

// POST: Add a new Subcategory
export const addSubCategory = async (req, res) => {
  const { name, parentCategory } = req.body;
  const image = req.file;

  // Validation
  if (!name || !parentCategory) {
    return res
      .status(400)
      .json({ message: "Name and parent category are required" });
  }

  try {
    // Check parent category existence
    const parent = await Category.findById(parentCategory);
    if (!parent) {
      return res
        .status(404)
        .json({ message: "Parent category not found" });
    }

    // Optional image
    const imageUrl = image ? `/uploads/${image.filename}` : "";

    const newSubCategory = new SubCategory({
      name,
      parentCategory,
      image: imageUrl,
    });

    await newSubCategory.save();

    res.status(201).json({
      message: "Subcategory added successfully",
      subCategory: newSubCategory,
    });
  } catch (error) {
    console.error("Error adding subcategory:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// GET: Fetch all Subcategories
export const getAllSubCategories = async (req, res) => {
  try {
    const subs = await SubCategory.find()
      .populate("parentCategory", "name")
      .sort({ createdAt: -1 });

    res.status(200).json(subs);
  } catch (error) {
    console.error("Error fetching subcategories:", error);
    res.status(500).json({ message: "Failed to fetch subcategories" });
  }
};

export const updateSubCategory = async (req, res) => {
  const { id } = req.params;
  const { name, parentCategory } = req.body;
  const image = req.file;

  try {
    const sub = await SubCategory.findById(id);
    if (!sub) {
      return res.status(404).json({ message: "Subcategory not found" });
    }

    // name
    if (name) sub.name = name;

    // parent category (optional change)
    if (parentCategory) {
      const parent = await Category.findById(parentCategory);
      if (!parent) {
        return res
          .status(404)
          .json({ message: "Parent category not found" });
      }
      sub.parentCategory = parentCategory;
    }

    // image (only if new file uploaded)
    if (image) {
      sub.image = `/uploads/${image.filename}`;
    }

    await sub.save();

    res.status(200).json({
      message: "Subcategory updated successfully",
      subCategory: sub,
    });
  } catch (error) {
    console.error("Error updating subcategory:", error);
    res.status(500).json({ message: "Failed to update subcategory" });
  }
};

// DELETE: Remove a Subcategory by ID
export const deleteSubCategory = async (req, res) => {
  const { id } = req.params;

  try {
    const deleted = await SubCategory.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: "Subcategory not found" });
    }

    res.status(200).json({
      message: "Subcategory deleted successfully",
      subCategory: deleted,
    });
  } catch (error) {
    console.error("Error deleting subcategory:", error);
    res.status(500).json({ message: "Failed to delete subcategory" });
  }
};
