
import { Product, Category, } from '../model/index.model.js'

const slugify = (s = "") =>
  s
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w\-]+/g, "")
    .replace(/\-\-+/g, "-");

export const addCategory = async (req, res) => {
  const { categoryName, image } = req.body;

  // ❗ parent এলে reject করবে
  if (req.body.parent) {
    return res.status(400).send({
      message: "Use /api/categories/subcategory to add subcategory",
    });
  }

  if (!categoryName || !image) {
    return res
      .status(400)
      .send({ message: "Category name and image URL are required" });
  }

  try {
    const name = categoryName.trim();
    const slug = slugify(name);

    const exists = await Category.findOne({
      $or: [{ name }, { slug }],
    });

    if (exists) {
      return res.status(409).send({
        message: "Category already exists with same name/slug",
      });
    }

    const newCategory = new Category({
      name,
      slug,
      image,
      parent: null, // 🔥 always main category
    });

    await newCategory.save();

    res.status(201).send({
      message: "Category added successfully",
      category: newCategory,
    });
  } catch (error) {
    console.error("Error adding category:", error);
    res.status(500).send({ message: "Server error" });
  }
};

export const addSubCategory = async (req, res) => {
  const { categoryName, image, parent } = req.body;

  if (!categoryName || !image || !parent) {
    return res.status(400).send({
      message: "Subcategory name, image, and parent category are required",
    });
  }

  try {
    const parentCategory = await Category.findById(parent);

    if (!parentCategory) {
      return res.status(404).send({
        message: "Parent category not found",
      });
    }

    // নিরাপত্তার জন্য: parent নিজে যেন subcategory না হয়
    if (parentCategory.parent) {
      return res.status(400).send({
        message: "Parent must be a main category",
      });
    }

    const name = categoryName.trim();
    const slug = slugify(name);

    const exists = await Category.findOne({
      $or: [{ name }, { slug }],
    });

    if (exists) {
      return res.status(409).send({
        message: "Subcategory already exists with same name/slug",
      });
    }

    const newSubCategory = new Category({
      name,
      slug,
      image,
      parent: parentCategory._id,
    });

    await newSubCategory.save();

    return res.status(201).send({
      message: "Subcategory added successfully",
      category: newSubCategory,
    });
  } catch (error) {
    console.error("Error adding subcategory:", error);

    if (error?.code === 11000) {
      return res.status(409).send({
        message: "Subcategory name/slug must be unique",
      });
    }

    return res.status(500).send({ message: "Server error" });
  }
};
// Get all categories
export const getAllCategories = async (req, res) => {
  try {
    const categories = await Category.find({}).lean();

    const parentCategories = categories.filter((cat) => !cat.parent);

    const formattedCategories = parentCategories.map((parent) => ({
      ...parent,
      subcategories: categories.filter(
        (sub) =>
          sub.parent && sub.parent.toString() === parent._id.toString()
      ),
    }));

    res.status(200).send(formattedCategories);
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).send({ message: "Internal Server Error" });
  }
};

export const getAllSubCategories = async (req, res) => {
  try {
    const subcategories = await Category.find({ parent: { $ne: null } })
      .populate("parent", "name slug")
      .sort({ createdAt: -1 });

    res.status(200).send(subcategories);
  } catch (error) {
    console.error("Error fetching subcategories:", error);
    res.status(500).send({ message: "Internal Server Error" });
  }
};
export const getProductsByCategory = async (req, res) => {
  try {
    const { name } = req.params; // this is slugOrName actually
    const limit = parseInt(req.query.limit) || 0;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * limit;

    const decoded = decodeURIComponent(name);

    // ✅ match by slug OR name (case-insensitive)
    const category = await Category.findOne({
      $or: [
        { slug: decoded },
        { name: decoded },
        { name: { $regex: `^${decoded}$`, $options: "i" } },
        { slug: { $regex: `^${decoded}$`, $options: "i" } },
      ],
    });

    if (!category) {
      return res.status(404).send({ message: "Category not found" });
    }

    const query = { categories: category._id };

    let productsQuery = Product.find(query).sort({ createdAt: -1 });
    if (limit) productsQuery = productsQuery.skip(skip).limit(limit);

    const products = await productsQuery;

    // ✅ empty হলেও 404 না দিয়ে empty array দিলে UI stable থাকে
    return res.status(200).send(products);
  } catch (error) {
    console.error("Error fetching products by category:", error);
    res.status(500).send({ message: "Internal Server Error" });
  }
};

export const getProductsBySubCategory = async (req, res) => {
  try {
    const { name, subSlug } = req.params;

    const parentCategory = await Category.findOne({
      $or: [{ slug: name }, { name }],
      parent: null,
    });

    if (!parentCategory) {
      return res.status(404).send({ message: "Parent category not found" });
    }

    const subCategory = await Category.findOne({
      $or: [{ slug: subSlug }, { name: subSlug }],
      parent: parentCategory._id,
    });

    if (!subCategory) {
      return res.status(404).send({ message: "Subcategory not found" });
    }

    const products = await Product.find({
      categories: { $all: [parentCategory._id, subCategory._id] },
    }).sort({ createdAt: -1 });

    res.status(200).send(products);
  } catch (error) {
    console.error("Error fetching subcategory products:", error);
    res.status(500).send({ message: "Server error" });
  }
};
// ✅ Update category
export const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { categoryName, image } = req.body;

    if (!categoryName && !image) {
      return res
        .status(400)
        .send({ message: "Nothing to update. Provide name or image." });
    }

    const updateData = {};

    // ✅ name update + slug update together
    if (categoryName) {
      updateData.name = categoryName;
      updateData.slug = slugify(categoryName);
    }

    if (image) updateData.image = image;

    const updatedCategory = await Category.findByIdAndUpdate(id, updateData, {
      new: true,
    });

    if (!updatedCategory) {
      return res.status(404).send({ message: "Category not found" });
    }

    res.status(200).send({
      message: "Category updated successfully",
      category: updatedCategory,
    });
  } catch (error) {
    console.error("Error updating category:", error);
    res.status(500).send({ message: "Internal Server Error" });
  }
}
  // ✅ Delete category by ID
export const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const category = await Category.findByIdAndDelete(id);
    if (!category) {
      return res.status(404).send({ message: "Category not found" });
    }
    res.status(200).send({ message: "Category deleted successfully" });
  } catch (error) {
    console.error("Error deleting category:", error);
    res.status(500).send({ message: "Internal Server Error" });
  }
};
