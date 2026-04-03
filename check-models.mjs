import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error("❌ No API Key found in .env.local");
  process.exit(1);
}

console.log("🔑 Testing API Key...");

async function listModels() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.error) {
      console.error("❌ API Error:", data.error.message);
      return;
    }

    console.log("\n✅ AVAILABLE MODELS FOR YOUR KEY:");
    console.log("---------------------------------");
    const models = data.models || [];
    models.forEach(m => {
      // Filter for 'generateContent' supported models
      if (m.supportedGenerationMethods.includes("generateContent")) {
        console.log(`Model Name: ${m.name.replace("models/", "")}`);
      }
    });
    console.log("---------------------------------\n");
    
  } catch (error) {
    console.error("❌ Network Error:", error);
  }
}

listModels();