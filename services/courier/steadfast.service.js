import axios from "axios";

const BASE_URL = process.env.STEADFAST_BASE_URL;

const headers = () => ({
  "Content-Type": "application/json",
  "Api-Key": process.env.STEADFAST_API_KEY,
  "Secret-Key": process.env.STEADFAST_SECRET_KEY,
});

class SteadfastService {
  // 📦 Create Parcel
  async createParcel(order) {
    try {
      const payload = {
        invoice: order._id.toString(),
        recipient_name: order.customer.name,
        recipient_phone: order.customer.mobile,
        recipient_address: order.address,
        cod_amount:
          order.paymentMethod === "Cash on Delivery"
            ? order.totalPrice + order.shippingCost
            : 0,
        note:
          order.parcelDescription ||
          order.products.map((p) => `Item x${p.quantity}`).join(", "),
      };

      const response = await axios.post(
        `${BASE_URL}/create_order`,
        payload,
        { headers: headers() }
      );

      return response.data;
    } catch (error) {
      console.error("Steadfast createParcel error:", error.response?.data || error.message);
      throw new Error("Failed to create parcel");
    }
  }

  // 🔍 Track Parcel
  async trackParcel(consignmentId) {
    try {
      const response = await axios.get(
        `${BASE_URL}/status_by_cid/${consignmentId}`,
        { headers: headers() }
      );

      return response.data;
    } catch (error) {
      console.error("Steadfast track error:", error.response?.data || error.message);
      throw new Error("Failed to track parcel");
    }
  }

  // ❌ Cancel Parcel
  async cancelParcel(consignmentId) {
    try {
      const response = await axios.post(
        `${BASE_URL}/cancel_order`,
        { consignment_id: consignmentId },
        { headers: headers() }
      );

      return response.data;
    } catch (error) {
      console.error("Steadfast cancel error:", error.response?.data || error.message);
      throw new Error("Failed to cancel parcel");
    }
  }
}

export default new SteadfastService();