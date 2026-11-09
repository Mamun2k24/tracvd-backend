import axios from "axios";

const BASE_URL = "https://cmp.banggomart.com/api";

const banggoClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    appKey: process.env.BANGGO_APP_KEY,
    appSecret: process.env.BANGGO_APP_SECRET,
    username: process.env.BANGGO_USERNAME,
    "Content-Type": "application/json",
  },
});

export default banggoClient;

export const createBanggoOrder = async (payload) => {
  const response = await banggoClient.post("/create-order", payload);
  return response.data;
};
