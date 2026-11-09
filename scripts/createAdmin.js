// backend/scripts/createAdmin.js
import mongoose from "mongoose";
import dotenv from "dotenv";
import { User } from "../model/index.model.js";

dotenv.config();

async function run() {
  try {
    await mongoose.connect(process.env.MONGO_URL);

    const admin = new User({
      name: "Super Admin",
      email: "admin@mmtrading.com",   // এখানে তোমার পছন্দমত ইমেল দাও
      mobile: "01781977392",        // এখানে তোমার নাম্বার দাও (OTP login এর জন্য দরকার হলে)
      role: "admin",
      isVerified: true,
    });

    await admin.save();
    console.log("✅ Admin created:", admin);
  } catch (err) {
    console.error("❌ Error creating admin:", err);
  } finally {
    await mongoose.disconnect();
  }
}

run();
