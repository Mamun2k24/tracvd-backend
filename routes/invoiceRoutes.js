import express from "express";
import { protect } from "../middleware/protect.js";
import { isAdmin } from "../middleware/isAdmin.js";
import {
  createInvoice,
  listInvoices,
  listMyInvoices,
  markPaid,        // ⬅️ controller থেকে আসবে
  markUnpaid,      // (optional) নিচে দিলাম
} from "../controller/invoice.controller.js";

const router = express.Router();

// Admin
router.get("/invoices", protect, isAdmin, listInvoices);
router.post("/invoices", protect, isAdmin, createInvoice);
router.patch("/invoices/:id/paid", protect, isAdmin, markPaid);     // ✅ Mark Paid
router.patch("/invoices/:id/unpaid", protect, isAdmin, markUnpaid); // (optional)

// User
router.get("/my/invoices", protect, listMyInvoices);

export default router;
