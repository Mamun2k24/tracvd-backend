// index.js
import dotenv from "dotenv";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import session from "express-session";
import MongoStore from "connect-mongo";
import cookieParser from "cookie-parser";
import passport from "passport";

import "./middleware/passport.js";
import "./db/database.js";

import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import categoryRoutes from "./routes/categoryRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import colorRoutes from "./routes/colorRoutes.js";
import cartRoutes from "./routes/cartRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import bannerRoutes from "./routes/BannerRoutes.js";
import sellerVerificationRoutes from "./routes/sellerVerificationRoutes.js";
import invoiceRoutes from "./routes/invoiceRoutes.js";
import couponRoutes from "./routes/couponRoutes.js";
import couponAdminRoutes from "./routes/couponAdminRoutes.js";
import shippingSettingsRoutes from "./routes/shippingSettingsRoutes.js";
import adminStatsRoutes from "./routes/adminStatsRoutes.js";
import subCategoryRoutes from "./routes/subCategoryRoutes.js";
import brandRoutes from "./routes/brandRoutes.js";
import homeSectionSettingRoutes from "./routes/homeSectionSettingRoutes.js";
import siteTickerRoutes from "./routes/siteTickerRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";
import analyticsRoutes from "./routes/analyticsRoutes.js";
import headerSettingRoutes from "./routes/headerSettingRoutes.js";
import reviewRoutes from "./routes/reviewRoutes.js";
import generalSettingsRoutes from "./routes/generalSettingsRoutes.js";
import flashSaleSettingsRoute from "./routes/flashSaleSettings.route.js";
import videoRoutes from "./routes/videoRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";
import chatBotQuestionRoutes from "./routes/chatBotQuestion.routes.js";
import steadfastRoutes from "./routes/steadfastRoutes.js";
import shopRoutes from "./routes/shopRoutes.js";
import { seedSuperAdmin } from "./controller/authController.js";
import sellerWalletRoutes from "./routes/sellerWalletRoutes.js";
import adminMarketplaceRoutes from "./routes/adminMarketplaceRoutes.js";
import returnRequestRoutes from "./routes/returnRequestRoutes.js";
import landingPageRoutes from "./routes/landingPageRoutes.js";
import demoRequestRoutes from "./routes/demoRequest.route.js";

/* =====================================================
   Environment variables
===================================================== */

dotenv.config();

/* =====================================================
   Express and HTTP server
===================================================== */

const app = express();
const server = http.createServer(app);

const port = process.env.PORT || 5000;

/* =====================================================
   Production proxy
===================================================== */

if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

/* =====================================================
   Allowed origins
===================================================== */

const allowedOrigins = [
  "http://localhost:5173",

  "https://kroykori.com",
  "https://tracvd-frontend-lake.vercel.app",

 
];

/* =====================================================
   Socket.IO
===================================================== */

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST"],
  },
});

app.set("io", io);

io.on("connection", (socket) => {
  console.log("✅ Socket connected:", socket.id);

  socket.on("joinConversation", (conversationId) => {
    if (!conversationId) return;

    socket.join(conversationId);

    console.log(`📌 Joined room: ${conversationId}`);
  });

  socket.on("joinAdminRoom", () => {
    socket.join("admin-chat-room");

    console.log("📌 Admin joined admin-chat-room");
  });

  socket.on("sendMessage", (data = {}) => {
    const { conversationId, message } = data;

    if (!conversationId || !message) return;

    io.to(conversationId).emit(
      "receiveMessage",
      message
    );
  });

  socket.on("typing", (data = {}) => {
    const { conversationId, sender } = data;

    if (!conversationId) return;

    socket.to(conversationId).emit("typing", {
      sender,
    });
  });

  socket.on("disconnect", () => {
    console.log(
      "❌ Socket disconnected:",
      socket.id
    );
  });
});

/* =====================================================
   CORS
===================================================== */

const corsOptions = {
  origin: (origin, callback) => {
    /*
     * Postman, server-to-server request এবং একই origin-এর
     * request-এর ক্ষেত্রে origin নাও থাকতে পারে।
     */
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.error(
      `❌ CORS blocked origin: ${origin}`
    );

    return callback(
      new Error("Not allowed by CORS")
    );
  },

  credentials: true,

  methods: [
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS",
  ],

  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "x-guest-access-token",
  ],

  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));

/* =====================================================
   Common middleware
===================================================== */

app.use(cookieParser());

app.use(
  express.json({
    limit: "1mb",
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "1mb",
  })
);

/* =====================================================
   Session
===================================================== */

app.use(
  session({
    name: "zozo.sid",

    secret:
      process.env.SESSION_SECRET ||
      "change_me_in_environment_variables",

    resave: false,
    saveUninitialized: false,

    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URL,

      /*
       * Expired session 24 ঘণ্টা পরে MongoDB থেকে
       * automatically remove হবে।
       */
      ttl: 24 * 60 * 60,
    }),

    cookie: {
      maxAge: 1000 * 60 * 60 * 24,
      secure:
        process.env.NODE_ENV ===
        "production",
      httpOnly: true,

      /*
       * Frontend এবং backend ভিন্ন domain হলে
       * production-এ "none" প্রয়োজন।
       */
      sameSite:
        process.env.NODE_ENV === "production"
          ? "none"
          : "lax",
    },
  })
);

/* =====================================================
   Passport
===================================================== */

app.use(passport.initialize());
app.use(passport.session());

/* =====================================================
   Health routes
===================================================== */

app.get("/", (_req, res) => {
  res.status(200).send(
    "Trackviobd server is Running"
  );
});

app.get("/healthz", (_req, res) => {
  res.status(200).send("ok");
});

app.get("/readyz", (_req, res) => {
  res.status(200).json({
    success: true,
    up: true,
    message: "Ab API is ready",
  });
});

/* =====================================================
   Product cache headers
===================================================== */

app.use((req, res, next) => {
  if (
    req.method === "GET" &&
    req.path.startsWith("/api/products")
  ) {
    res.set(
      "Cache-Control",
      "private, max-age=30"
    );
  }

  next();
});

/* =====================================================
   API routes
===================================================== */

app.use("/api/auth", authRoutes);

/*
 * Report routes সাধারণ API routes-এর আগে রাখা হয়েছে,
 * যাতে অন্য কোনো dynamic route আগে match না করে।
 */
app.use("/api", reportRoutes);

app.use("/api/users", userRoutes);

app.use(
  "/api/categories",
  categoryRoutes
);

app.use(
  "/api/category",
  categoryRoutes
);

app.use("/api/products", productRoutes);
app.use("/api/colors", colorRoutes);
app.use("/api/cart", cartRoutes);

app.use("/api", orderRoutes);

app.use("/api/banners", bannerRoutes);
app.use("/api/videos", videoRoutes);

app.use(
  "/api",
  sellerVerificationRoutes
);

app.use("/api", invoiceRoutes);
app.use("/api", couponRoutes);
app.use("/api", couponAdminRoutes);
app.use("/api", adminStatsRoutes);
app.use("/api", analyticsRoutes);

app.use(
  "/api/subcategories",
  subCategoryRoutes
);

app.use("/api/brands", brandRoutes);

app.use(
  "/api/home-section-settings",
  homeSectionSettingRoutes
);

app.use("/api", siteTickerRoutes);

app.use(
  "/api/header-settings",
  headerSettingRoutes
);

app.use(
  "/api/shipping-settings",
  shippingSettingsRoutes
);
app.use(
 "/api/landing-pages",
 landingPageRoutes
);
app.use(
  "/api/notifications",
  notificationRoutes
);

app.use("/api", reviewRoutes);
app.use("/api", generalSettingsRoutes);

app.use(
  "/api/flashsale/settings",
  flashSaleSettingsRoute
);

app.use("/api", chatRoutes);

app.use(
  "/api",
  chatBotQuestionRoutes
);

app.use("/api", steadfastRoutes);
app.use("/api", shopRoutes);
app.use("/api", sellerWalletRoutes);
app.use(
  "/api/admin/marketplace",
  adminMarketplaceRoutes,
);

app.use(
  "/api/returns",
  returnRequestRoutes,
);

// GPS Free Demo API
app.use("/api/demo", demoRequestRoutes);

/* =====================================================
   404 handler
===================================================== */

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
    path: req.originalUrl,
  });
});

/* =====================================================
   Global error handler
===================================================== */

app.use((err, _req, res, _next) => {
  console.error(
    "❌ Unhandled error:",
    err
  );

  if (
    err.message === "Not allowed by CORS"
  ) {
    return res.status(403).json({
      success: false,
      message: "Origin is not allowed",
    });
  }

  if (err.name === "MulterError") {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }

  return res.status(
    err.status || err.statusCode || 500
  ).json({
    success: false,
    message:
      err.message ||
      "Internal Server Error",
  });
});

/* =====================================================
   Start server
===================================================== */

/*
 * Vercel serverless environment-এ app export হবে।
 * Local এবং Railway-তে HTTP server listen করবে।
 */
if (!process.env.VERCEL) {
  server.listen(port, async () => {
    console.log(
      `✅ Trackviobd server is running on port ${port}`
    );

    try {
      await seedSuperAdmin();
    } catch (error) {
      console.error(
        "❌ Superadmin seed failed:",
        error
      );
    }
  });
}

/*
 * Vercel Serverless Function-এর জন্য export।
 */
export default app;