// colorController.js

import { Color } from '../model/index.model.js'

// Add new color
export const addColor = async (req, res) => {
  const { name, code } = req.body;

  if (!name || !code) {
    return res.status(400).json({ message: "Color name and code are required" });
  }

  try {
    const newColor = new Color({ name, code });
    await newColor.save();
    res.status(201).json({ message: "Color added successfully", color: newColor });
  } catch (error) {
    console.error("Error adding color:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// Get all colors
export const getColors = async (req, res) => {
  try {
    const colors = await Color.find({});
    res.status(200).json(colors);
  } catch (error) {
    console.error("Error fetching colors:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// Update color
export const updateColor = async (req, res) => {
  const { id } = req.params;
  const { name, code } = req.body;

  if (!name && !code) {
    return res
      .status(400)
      .json({ message: "Nothing to update. Provide name or code." });
  }

  try {
    const updateData = {};
    if (name) updateData.name = name;
    if (code) updateData.code = code;

    const color = await Color.findByIdAndUpdate(id, updateData, { new: true });

    if (!color) {
      return res.status(404).json({ message: "Color not found" });
    }

    res
      .status(200)
      .json({ message: "Color updated successfully", color });
  } catch (error) {
    console.error("Error updating color:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// Delete color
export const deleteColor = async (req, res) => {
  const { id } = req.params;

  try {
    const deleted = await Color.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: "Color not found" });
    }

    res
      .status(200)
      .json({ message: "Color deleted successfully", color: deleted });
  } catch (error) {
    console.error("Error deleting color:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
