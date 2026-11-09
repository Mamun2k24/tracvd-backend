import mongoose from "mongoose";

const { Schema } = mongoose;

/* =====================================================
   Product item snapshot

   Order হওয়ার সময় product-এর নাম, ছবি ও দাম snapshot
   রাখা হবে। পরে product পরিবর্তন হলেও পুরোনো order
   ঠিক থাকবে।
===================================================== */

const orderItemSchema = new Schema(
  {
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },

    productName: {
      type: String,
      required: true,
      trim: true,
    },

    sku: {
      type: String,
      trim: true,
      default: "",
    },

    image: {
      type: String,
      default: "",
    },

    quantity: {
      type: Number,
      required: true,
      min: 1,
    },

    originalPrice: {
      type: Number,
      required: true,
      min: 0,
    },

    discountAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    finalPrice: {
      type: Number,
      required: true,
      min: 0,
    },

    // পুরোনো invoice/controller compatibility
    price: {
      type: Number,
      required: true,
      min: 0,
    },

    lineTotal: {
      type: Number,
      required: true,
      min: 0,
    },

    selectedSize: {
      type: String,
      default: null,
    },

    selectedWeight: {
      type: String,
      default: null,
    },

    selectedColor: {
      type: String,
      default: null,
    },

    selectedChest: {
      type: String,
      default: null,
    },

    selectedWaist: {
      type: String,
      default: null,
    },
  },
  {
    _id: true,
  },
);

/* =====================================================
   Seller sub-order

   একই checkout-এর প্রতিটি seller-এর জন্য একটি করে
   sub-order তৈরি হবে।
===================================================== */

const sellerOrderSchema = new Schema(
  {
    source: {
      type: String,
      enum: ["platform", "seller"],
      required: true,
    },

    seller: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    shop: {
      type: Schema.Types.ObjectId,
      ref: "Shop",
      default: null,
      index: true,
    },

    shopName: {
      type: String,
      required: true,
      trim: true,
    },

    items: {
      type: [orderItemSchema],
      required: true,
      validate: {
        validator: (items) => Array.isArray(items) && items.length > 0,
        message: "Seller order must contain at least one product",
      },
    },

    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },

    couponDiscount: {
      type: Number,
      default: 0,
      min: 0,
    },

    productTotalAfterDiscount: {
      type: Number,
      required: true,
      min: 0,
    },

    shippingCost: {
      type: Number,
      required: true,
      min: 0,
    },

    total: {
      type: Number,
      required: true,
      min: 0,
    },

    commissionRate: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },

    commissionAmount: {
      type: Number,
      min: 0,
      default: 0,
    },

    sellerEarning: {
      type: Number,
      min: 0,
      default: 0,
    },

    orderStatus: {
      type: String,
      enum: ["pending", "processing", "shipped", "delivered", "cancelled"],
      default: "pending",
      index: true,
    },

    paymentStatus: {
      type: String,
      enum: ["unpaid", "paid", "partial", "refunded", "cancelled"],
      default: "unpaid",
    },

    payoutStatus: {
      type: String,
      enum: [
        "pending",
        "available",
        "requested",
        "paid",
        "cancelled",
        "refunded",
      ],
      default: "pending",
    },

    trackingCode: {
      type: String,
      trim: true,
      default: "",
    },

    courierName: {
      type: String,
      trim: true,
      default: "",
    },

    sellerNote: {
      type: String,
      trim: true,
      default: "",
    },

    cancelledBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    cancellationReason: {
      type: String,
      trim: true,
      default: "",
    },

    deliveredAt: {
      type: Date,
      default: null,
    },

    stockRestored: {
      type: Boolean,
      default: false,
    },

    earningProcessed: {
      type: Boolean,
      default: false,
    },

    returnStatus: {
      type: String,
      enum: [
        "none",
        "requested",
        "approved",
        "rejected",
        "returning",
        "received",
        "refunded",
        "cancelled",
      ],
      default: "none",
      index: true,
    },

    returnRequest: {
      type: Schema.Types.ObjectId,
      ref: "ReturnRequest",
      default: null,
    },
  },
  {
    _id: true,
    timestamps: true,
  },
);

/* =====================================================
   Parent Order
===================================================== */

const orderSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    guestId: {
      type: String,
      default: null,
      index: true,
    },

    guestAccessTokenHash: {
      type: String,
      default: null,
      select: false,
    },

    products: {
      type: [orderItemSchema],
      default: [],
    },

    /*
     * Multi-vendor order-এর আসল data।
     */
    sellerOrders: {
      type: [sellerOrderSchema],
      required: true,
      validate: {
        validator: (orders) => Array.isArray(orders) && orders.length > 0,
        message: "Order must contain at least one seller order",
      },
    },

    customer: {
      name: {
        type: String,
        required: true,
        trim: true,
      },

      email: {
        type: String,
        lowercase: true,
        trim: true,
        default: "",
      },

      mobile: {
        type: String,
        required: true,
        trim: true,
      },
    },

    address: {
      type: String,
      required: true,
      trim: true,
    },

    district: {
      type: String,
      trim: true,
      default: "",
    },

    shippingOption: {
      type: String,
      enum: ["inside", "outside"],
      required: true,
    },

    paymentMethod: {
      type: String,
      enum: [
        "Cash on Delivery",
        "bKash",
        "Nagad",

        // পুরোনো order compatibility
        "Cash",
        "Bkash",
      ],
      required: true,
    },

    paymentStatus: {
      type: String,
      enum: [
        "unpaid",
        "pending_verification",
        "paid",
        "rejected",
        "partial",
        "refunded",
      ],
      default: "unpaid",
      index: true,
    },

    manualPayment: {
      provider: {
        type: String,
        enum: ["bKash", "Nagad"],
        default: undefined,
      },
      senderNumber: {
        type: String,
        trim: true,
        default: "",
      },
      transactionId: {
        type: String,
        uppercase: true,
        trim: true,
        default: "",
      },
      amount: {
        type: Number,
        min: 0,
        default: 0,
      },
      status: {
        type: String,
        enum: ["pending", "verified", "rejected"],
        default: undefined,
      },
      submittedAt: {
        type: Date,
        default: null,
      },
      verifiedAt: {
        type: Date,
        default: null,
      },
      verifiedBy: {
        type: Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      adminNote: {
        type: String,
        trim: true,
        maxlength: 500,
        default: "",
      },
    },

    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },

    shippingCost: {
      type: Number,
      required: true,
      min: 0,
    },

    discountAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    totalPrice: {
      type: Number,
      required: true,
      min: 0,
    },

    couponCode: {
      type: String,
      uppercase: true,
      trim: true,
      default: null,
    },

    orderStatus: {
      type: String,
      enum: [
        "pending",
        "processing",
        "shipped",
        "delivered",
        "partially_cancelled",
        "cancelled",
      ],
      default: "pending",
      index: true,
    },

    orderType: {
      type: String,
      enum: ["regular", "pre_book"],
      default: "regular",
      index: true,
    },

    preBookInfo: {
      expectedDeliveryDate: {
        type: Date,
        default: null,
      },

      advanceRequired: {
        type: Boolean,
        default: false,
      },

      advanceAmount: {
        type: Number,
        default: 0,
      },

      remainingAmount: {
        type: Number,
        default: 0,
      },
    },

    refundStatus: {
      type: String,
      enum: ["none", "partial", "refunded"],
      default: "none",
      index: true,
    },

    paidAt: {
      type: Date,
      default: null,
    },

    invoiceId: {
      type: Schema.Types.ObjectId,
      ref: "Invoice",
      default: null,
    },

    /*
     * Steadfast Courier integration info
     */
    steadfast: {
      status: {
        type: String,
        enum: [
          "not_sent",
          "creating",
          "created",
          "needs_review",
        ],
        default: "not_sent",
      },
      invoice: { type: String, default: null },
      consignmentId: { type: Number, default: null },
      trackingCode: { type: String, default: null },
      codAmount: { type: Number, default: null },
      sentAt: { type: Date, default: null },
    },

    /*
     * পুরোনো pricing response compatibility
     */
    pricing: {
      subtotal: {
        type: Number,
        default: 0,
      },

      couponTotal: {
        type: Number,
        default: 0,
      },

      productTotalAfterDiscount: {
        type: Number,
        default: 0,
      },

      shippingBase: {
        type: Number,
        default: 0,
      },

      freeThresholdUsed: {
        type: Number,
        default: 0,
      },

      inCampaign: {
        type: Boolean,
        default: false,
      },
    },

    stockRestored: {
      type: Boolean,
      default: false,
    },
  },
  {
    collection: "order",
    timestamps: true,
  },
);

/* =====================================================
   Validation
===================================================== */

orderSchema.pre("validate", function (next) {
  const hasUser = Boolean(this.user);
  const hasGuest = Boolean(this.guestId);

  if (!hasUser && !hasGuest) {
    return next(new Error("Order requires either a user or guest ID"));
  }

  if (hasUser && hasGuest) {
    this.guestId = null;
  }

  next();
});

/* =====================================================
   Indexes
===================================================== */

orderSchema.index({
  createdAt: -1,
});

orderSchema.index({
  user: 1,
  createdAt: -1,
});

orderSchema.index({
  guestId: 1,
  createdAt: -1,
});

orderSchema.index({
  "sellerOrders.seller": 1,
  createdAt: -1,
});

orderSchema.index({
  "sellerOrders.shop": 1,
  "sellerOrders.orderStatus": 1,
  createdAt: -1,
});

orderSchema.index({
  guestId: 1,
  guestAccessTokenHash: 1,
  createdAt: -1,
});

orderSchema.index(
  { "manualPayment.transactionId": 1 },
  {
    unique: true,
    partialFilterExpression: {
      "manualPayment.transactionId": { $type: "string" },
      "manualPayment.status": { $exists: true },
    },
  },
);

const Order = mongoose.model("Order", orderSchema);

export default Order;