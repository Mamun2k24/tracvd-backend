import path from "path";
import {
  notifyUser,
  notifyAdmins,
} from "../services/notification.service.js";
import SellerVerification from "../model/sellerVerification.model.js";
import User from "../model/user.model.js";
import Shop from "../model/shop.model.js";

/* =====================================================
   Helpers
===================================================== */

const createSlug = (value = "") =>
  String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

const generateUniqueShopSlug = async (businessName) => {
  const baseSlug = createSlug(businessName) || "shop";

  let slug = baseSlug;
  let counter = 1;

  while (await Shop.exists({ slug })) {
    slug = `${baseSlug}-${counter}`;
    counter += 1;
  }

  return slug;
};

const toUrl = (file) => {
  const fileName =
    file?.filename || path.basename(file?.path || "");

  return `/uploads/verification/${fileName}`;
};

/* =====================================================
   Seller: Submit or resubmit verification
===================================================== */

export const submitVerification = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;

    const {
      businessName,
      contactEmail,
      contactPhone,
      docsMeta,
    } = req.body;

    if (!userId) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        message: "User account not found",
      });
    }

    if (user.isActive === false) {
      return res.status(403).json({
        message: "Your account is inactive",
      });
    }

    if (
      user.role === "seller" &&
      user.sellerStatus === "approved"
    ) {
      return res.status(409).json({
        message: "Your seller account is already approved",
      });
    }

    if (!businessName?.trim()) {
      return res.status(422).json({
        message: "Business name is required",
      });
    }

    if (!req.files?.length) {
      return res.status(422).json({
        message: "At least one document is required",
      });
    }

    let documentMeta = [];

    try {
      documentMeta = JSON.parse(docsMeta || "[]");

      if (!Array.isArray(documentMeta)) {
        documentMeta = [];
      }
    } catch {
      documentMeta = [];
    }

    const documents = req.files.map((file, index) => ({
      kind: documentMeta[index]?.kind || "other",
      note: String(documentMeta[index]?.note || "").trim(),
      url: toUrl(file),
    }));

    const verification =
      await SellerVerification.findOneAndUpdate(
        { userId },
        {
          $set: {
            userId,
            businessName: businessName.trim(),
            contactEmail:
              contactEmail?.trim().toLowerCase() || "",
            contactPhone: contactPhone?.trim() || "",
            documents,
            status: "pending",
            adminNote: "",
          },

          $unset: {
            decidedBy: 1,
            decidedAt: 1,
          },
        },
        {
          upsert: true,
          new: true,
          runValidators: true,
          setDefaultsOnInsert: true,
        },
      );

    user.sellerStatus = "pending";
    user.sellerRejectionReason = null;
    user.wholesaleApproved = false;

    await user.save();
    await notifyAdmins({
  type: "seller",
  title: "New Seller Application",
  message: `${verification.businessName} submitted a seller application.`,
  priority: "high",
  actionUrl: `/admin/seller-verifications/${verification._id}`,
  metadata: {
    verificationId: verification._id,
    applicantUserId: userId,
    businessName: verification.businessName,
  },
}).catch((error) => {
  console.error(
    "Seller application notification failed:",
    error,
  );
});

    return res.status(201).json({
      message: "Seller application submitted successfully",
      verification,
    });
  } catch (error) {
    console.error("submitVerification error:", error);

    if (error?.name === "ValidationError") {
      return res.status(422).json({
        message: "Validation failed",
        error: error.message,
      });
    }

    if (error?.code === 11000) {
      return res.status(409).json({
        message: "Seller application already exists",
      });
    }

    return res.status(500).json({
      message: "Failed to submit seller application",
      error: error.message,
    });
  }
};

/* =====================================================
   Seller: Get own verification
===================================================== */

export const getMyVerification = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;

    if (!userId) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    const verification = await SellerVerification.findOne({
      userId,
    })
      .select("-__v")
      .lean();

    const shop = await Shop.findOne({
      owner: userId,
    })
      .select(
        "shopName slug logo banner description status isActive commissionRate ratingAverage ratingCount",
      )
      .lean();

    return res.status(200).json({
      status: verification?.status || "none",
      verification: verification || null,
      shop: shop || null,
    });
  } catch (error) {
    console.error("getMyVerification error:", error);

    return res.status(500).json({
      message: "Failed to load seller application",
      error: error.message,
    });
  }
};

/* =====================================================
   Admin: List pending applications
===================================================== */

export const listPending = async (_req, res) => {
  try {
    const items = await SellerVerification.find({
      status: "pending",
    })
      .populate({
        path: "userId",
        select:
          "name email mobile profileImage role sellerStatus isActive",
      })
      .sort({ createdAt: -1 })
      .select("-__v")
      .lean();

    return res.status(200).json(items);
  } catch (error) {
    console.error("listPending error:", error);

    return res.status(500).json({
      message: "Failed to load pending seller applications",
      error: error.message,
    });
  }
};

/* =====================================================
   Admin: List approved sellers
===================================================== */

export const listApproved = async (_req, res) => {
  try {
    const verifications = await SellerVerification.find({
      status: "approved",
    })
      .populate({
        path: "userId",
        select:
          "name email mobile profileImage role sellerStatus isActive",
      })
      .populate({
        path: "decidedBy",
        select: "name email role",
      })
      .sort({ decidedAt: -1 })
      .select("-__v")
      .lean();

    const userIds = verifications
      .map((item) => item.userId?._id || item.userId)
      .filter(Boolean);

    const shops = await Shop.find({
      owner: { $in: userIds },
    })
      .select(
        "owner shopName slug logo status isActive commissionRate ratingAverage ratingCount createdAt",
      )
      .lean();

    const shopMap = new Map(
      shops.map((shop) => [
        String(shop.owner),
        shop,
      ]),
    );

    const items = verifications.map((verification) => {
      const ownerId =
        verification.userId?._id ||
        verification.userId;

      return {
        ...verification,
        shop:
          shopMap.get(String(ownerId)) || null,
      };
    });

    return res.status(200).json(items);
  } catch (error) {
    console.error("listApproved error:", error);

    return res.status(500).json({
      message: "Failed to load approved sellers",
      error: error.message,
    });
  }
};

/* =====================================================
   Admin: Approve seller
===================================================== */

export const approve = async (req, res) => {
  try {
    const verification =
      await SellerVerification.findById(req.params.id);

    if (!verification) {
      return res.status(404).json({
        message: "Seller application not found",
      });
    }

    const user = await User.findById(
      verification.userId,
    );

    if (!user) {
      return res.status(404).json({
        message: "Seller user account not found",
      });
    }

    if (user.isActive === false) {
      return res.status(403).json({
        message: "Cannot approve an inactive user",
      });
    }

    if (
      verification.status === "approved" &&
      user.role === "seller" &&
      user.sellerStatus === "approved"
    ) {
      const existingApprovedShop =
        await Shop.findOne({
          owner: user._id,
        });

      return res.status(409).json({
        message: "Seller is already approved",
        verification,
        shop: existingApprovedShop,
      });
    }

    let shop = await Shop.findOne({
      owner: user._id,
    });

    if (shop) {
      shop.shopName = verification.businessName;
      shop.contactEmail =
        verification.contactEmail ||
        user.email ||
        "";
      shop.contactPhone =
        verification.contactPhone ||
        user.mobile ||
        "";
      shop.verification = verification._id;
      shop.status = "approved";
      shop.isActive = true;

      await shop.save();
    } else {
      const slug = await generateUniqueShopSlug(
        verification.businessName,
      );

      shop = await Shop.create({
        owner: user._id,
        verification: verification._id,
        shopName: verification.businessName,
        slug,

        contactEmail:
          verification.contactEmail ||
          user.email ||
          "",

        contactPhone:
          verification.contactPhone ||
          user.mobile ||
          "",

        commissionRate: 10,
        status: "approved",
        isActive: true,
      });
    }

    verification.status = "approved";
    verification.adminNote = "";
    verification.decidedBy =
      req.user?._id || req.user?.id;
    verification.decidedAt = new Date();

    await verification.save();

    user.role = "seller";
    user.sellerStatus = "approved";
    user.sellerRejectionReason = null;
    user.wholesaleApproved = true;

    await user.save();
    await notifyUser({
  recipient: user._id,
  sender: req.user?._id || req.user?.id,
  type: "seller",
  title: "Seller Application Approved",
  message: `Your seller application for ${verification.businessName} has been approved.`,
  priority: "high",
  shopId: shop._id,
  actionUrl: "/seller/dashboard",
  metadata: {
    verificationId: verification._id,
    sellerStatus: "approved",
  },
}).catch((error) => {
  console.error(
    "Seller approval notification failed:",
    error,
  );
});

    return res.status(200).json({
      message: "Seller approved successfully",
      verification,
      shop,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        role: user.role,
        sellerStatus: user.sellerStatus,
      },
    });
  } catch (error) {
    console.error("approve seller error:", error);

    if (error?.code === 11000) {
      return res.status(409).json({
        message:
          "A shop with this information already exists",
      });
    }

    return res.status(500).json({
      message: "Failed to approve seller",
      error: error.message,
    });
  }
};

/* =====================================================
   Admin: Reject seller application
===================================================== */

export const reject = async (req, res) => {
  try {
    const reason = String(
      req.body?.reason || "",
    ).trim();

    if (!reason) {
      return res.status(422).json({
        message: "Rejection reason is required",
      });
    }

    const verification =
      await SellerVerification.findById(req.params.id);

    if (!verification) {
      return res.status(404).json({
        message: "Seller application not found",
      });
    }

    const user = await User.findById(
      verification.userId,
    );

    if (!user) {
      return res.status(404).json({
        message: "Seller user account not found",
      });
    }

    verification.status = "rejected";
    verification.adminNote = reason;
    verification.decidedBy =
      req.user?._id || req.user?.id;
    verification.decidedAt = new Date();

    await verification.save();

    user.sellerStatus = "rejected";
    user.sellerRejectionReason = reason;
    user.wholesaleApproved = false;

    /*
     * আগে approved seller-কে reject/suspend করতে হলে
     * role user করে দেওয়া হচ্ছে।
     */
    if (user.role === "seller") {
      user.role = "user";
    }

    await user.save();

    await Shop.findOneAndUpdate(
      { owner: verification.userId },
      {
        $set: {
          status: "rejected",
          isActive: false,
        },
      },
    );

    await notifyUser({
  recipient: verification.userId,
  sender: req.user?._id || req.user?.id,
  type: "seller",
  title: "Seller Application Rejected",
  message: `Your seller application was rejected. Reason: ${reason}`,
  priority: "high",
  actionUrl: "/seller/application",
  metadata: {
    verificationId: verification._id,
    sellerStatus: "rejected",
    reason,
  },
}).catch((error) => {
  console.error(
    "Seller rejection notification failed:",
    error,
  );
});

    return res.status(200).json({
      message: "Seller application rejected",
      verification,
      user: {
        id: user._id,
        role: user.role,
        sellerStatus: user.sellerStatus,
      },
    });
  } catch (error) {
    console.error("reject seller error:", error);

    return res.status(500).json({
      message: "Failed to reject seller application",
      error: error.message,
    });
  }
};
/* =====================================================
   Admin: List rejected seller applications
===================================================== */

export const listRejected = async (_req, res) => {
  try {
    const items = await SellerVerification.find({
      status: "rejected",
    })
      .populate({
        path: "userId",
        select:
          "name email mobile profileImage role sellerStatus isActive sellerRejectionReason",
      })
      .populate({
        path: "decidedBy",
        select: "name email role",
      })
      .sort({ decidedAt: -1, updatedAt: -1 })
      .select("-__v")
      .lean();

    return res.status(200).json(items);
  } catch (error) {
    console.error("listRejected error:", error);

    return res.status(500).json({
      message: "Failed to load rejected seller applications",
      error: error.message,
    });
  }
};