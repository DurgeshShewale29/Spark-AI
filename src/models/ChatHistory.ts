import mongoose from "mongoose";

// 🚀 NEW: Schema to define how a team member looks
const CollaboratorSchema = new mongoose.Schema({
  email: { type: String, required: true },
  role: { type: String, enum: ['viewer', 'editor'], default: 'viewer' }
}, { _id: false });

const ChatHistorySchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true }, 
  userEmail: { type: String }, 
  id: { type: String, required: true }, 
  title: { type: String, required: true },
  messages: { type: Array, default: [] },
  framework: { type: String, default: "nextjs" },
  files: { type: Object, default: {} }, 
  isPinned: { type: Boolean, default: false },
  isDeleted: { type: Boolean, default: false }, 
  isShared: { type: Boolean, default: false }, 
  collaborators: { type: [CollaboratorSchema], default: [] }, // 🚀 NEW: Array to store invited team members
  timestamp: { type: Number, required: true }
});

// Ensure that each user can only have one unique chat per ID
ChatHistorySchema.index({ userId: 1, id: 1 }, { unique: true });
// 🚀 NEW: Index for fast querying of projects shared with a specific email
ChatHistorySchema.index({ "collaborators.email": 1 });

export default mongoose.models.ChatHistory || mongoose.model("ChatHistory", ChatHistorySchema);