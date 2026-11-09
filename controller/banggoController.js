import banggoClient from "../services/banggoClient.js";

export const getBanggoProducts = async (req, res) => {
  try {
    const response = await banggoClient.get("/products");

    res.status(200).json(response.data);
  } catch (error) {
    console.error("Banggo product fetch error:", error.message);
    res.status(500).json({ message: "Failed to fetch Banggo products" });
  }
};
