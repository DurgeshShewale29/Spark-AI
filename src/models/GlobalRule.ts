import mongoose, { Schema, Document } from "mongoose";

export interface IGlobalRule extends Document {
  content: string;
  ruleType: string; // 🚀 'auto-learned' or 'project-directive'
  scope: string;    // 🚀 'frontend', 'backend', 'database', 'config', 'general'
  isActive: boolean;
  isDeleted: boolean; 
  embedding: number[]; 
}

const GlobalRuleSchema = new Schema<IGlobalRule>(
  {
    content: { type: String, required: true },
    ruleType: { type: String, default: "auto-learned", enum: ["auto-learned", "project-directive"] },
    scope: { type: String, default: "general", enum: ["frontend", "backend", "database", "config", "general"] },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false }, 
    embedding: { type: [Number], required: true }, 
  },
  { timestamps: true }
);

export default mongoose.models.GlobalRule || mongoose.model<IGlobalRule>("GlobalRule", GlobalRuleSchema);