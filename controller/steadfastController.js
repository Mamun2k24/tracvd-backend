import Order from "../model/order.model.js";
import steadfastService from "../services/courier/steadfast.service.js";

// 📦 Book Parcel
export const bookSteadfastParcel = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });

    const result = await steadfastService.createParcel(order);

    if (result?.status === true || result?.success === true) {
      order.courier = {
        provider: "steadfast",
        consignmentId: result?.consignment?.consignment_id || "",
        trackingCode: result?.consignment?.tracking_code || "",
        status: "booked",
        bookedAt: new Date(),
        rawResponse: result,
      };

      await order.save();
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 🔍 Track
export const trackSteadfastParcel = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId);
    if (!order || !order.courier?.consignmentId) {
      return res.status(400).json({ message: "No courier found" });
    }

    const result = await steadfastService.trackParcel(
      order.courier.consignmentId
    );

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ❌ Cancel
export const cancelSteadfastParcel = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId);
    if (!order || !order.courier?.consignmentId) {
      return res.status(400).json({ message: "No courier found" });
    }

    const result = await steadfastService.cancelParcel(
      order.courier.consignmentId
    );

    order.courier.status = "cancelled";
    order.courier.cancelledAt = new Date();
    await order.save();

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};