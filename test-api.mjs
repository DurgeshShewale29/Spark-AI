// test-api.mjs
import { GoogleGenerativeAI } from "@google/generative-ai";

async function runTest() {
  const apiKey = "AIzaSyDY9OW2FL7lmKvQjrZEKWl4-t-DjIYOZ6s"; 
  const genAI = new GoogleGenerativeAI(apiKey);

  // 🟢 Trying the model that appeared #1 on your access list
  const modelName = "gemini-2.5-flash"; 

  console.log(`📡 Testing Free Tier for: '${modelName}'...`);
  
  try {
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent("Hello! Are you working?");
    
    console.log("\n🎉 SUCCESS! This model is free and working.");
    console.log("📝 Response:", result.response.text());
    console.log("\n👉 ACTION: Update your 'route.ts' to use: " + modelName);
    
  } catch (error) {
    console.error("\n❌ ERROR with 2.5-flash:", error.message);
    
    // Fallback: If 2.5 fails, try the "Lite" version (almost always free)
    console.log("\n⚠️ Trying fallback: 'gemini-2.0-flash-lite'...");
    try {
      const modelLite = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });
      const resultLite = await modelLite.generateContent("Hello from Lite!");
      console.log("🎉 SUCCESS! The LITE model works.");
      console.log("👉 ACTION: Update your 'route.ts' to use: gemini-2.0-flash-lite");
    } catch (errLite) {
      console.error("❌ All models failed. Your account might need a billing setup (even for free tier).");
    }
  }
}

runTest();