import mongoose, { Schema, Document } from "mongoose";

export interface IGlobalRule extends Document {
  content: string;
  category: string;
  isActive: boolean;
  isDeleted: boolean; // 🚀 ADDED: Required for the Recycle Bin feature
  embedding: number[]; // 🚀 The mathematical vector
}

const GlobalRuleSchema = new Schema<IGlobalRule>(
  {
    content: { type: String, required: true },
    category: { type: String, default: "general" },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false }, // 🚀 ADDED: Soft delete flag defaults to false
    embedding: { type: [Number], required: true }, // 🚀 Store the vector
  },
  { timestamps: true }
);

export default mongoose.models.GlobalRule || mongoose.model<IGlobalRule>("GlobalRule", GlobalRuleSchema);