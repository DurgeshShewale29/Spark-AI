import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI!;

if (!MONGODB_URI) {
  throw new Error("Please define the MONGODB_URI environment variable inside .env.local");
}

// 🚀 STRICT TYPE FOR GLOBAL MONGOOSE CACHE
interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var mongoose: MongooseCache | undefined;
}

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

export async function connectToDB() {
  // Ensure cached is always defined locally to satisfy TypeScript
  const currentCache = cached ?? { conn: null, promise: null };

  if (currentCache.conn) return currentCache.conn;

  if (!currentCache.promise) {
    currentCache.promise = mongoose.connect(MONGODB_URI, {
      bufferCommands: false,
    }).then((mongooseInstance) => mongooseInstance);
  }
  
  currentCache.conn = await currentCache.promise;
  cached = currentCache; // Update global reference
  
  return currentCache.conn;
}