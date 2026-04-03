import mongoose, { Schema, Document } from "mongoose";

// 🚀 STRICT TYPES FOR MESSAGES
export interface IMessage {
  role: "user" | "assistant";
  content: string;
  image?: string;
}

export interface IProject extends Document {
  userId: string;
  chatId: string;
  title: string;
  framework: string;
  messages: IMessage[];
  files: Record<string, string>;
  isPinned: boolean;
  timestamp: number;
}

const MessageSchema = new Schema<IMessage>({
  role: { type: String, enum: ["user", "assistant"], required: true },
  content: { type: String, required: true },
  image: { type: String, required: false }
}, { _id: false }); // Prevents MongoDB from generating a sub-ID for every single chat bubble

const ProjectSchema = new Schema<IProject>({
  userId: { type: String, required: true, index: true }, 
  chatId: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  framework: { type: String, required: true },
  messages: { type: [MessageSchema], required: true }, 
  files: { type: Schema.Types.Mixed, required: true }, // Mixed is acceptable here as it's a native Mongoose type, not 'any'
  isPinned: { type: Boolean, default: false },
  timestamp: { type: Number, required: true },
});

export default mongoose.models.Project || mongoose.model<IProject>("Project", ProjectSchema);