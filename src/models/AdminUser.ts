import mongoose from "mongoose";

const AdminUserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  isPrimary: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.models.AdminUser || mongoose.model("AdminUser", AdminUserSchema);