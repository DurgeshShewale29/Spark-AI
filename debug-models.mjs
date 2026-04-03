// debug-models.mjs
const apiKey = "AIzaSyDY9OW2FL7lmKvQjrZEKWl4-t-DjIYOZ6s"; // 🔴 PASTE YOUR NEW KEY HERE

async function listModels() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
  
  console.log("🔍 Asking Google for available models...");
  
  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.models) {
      console.log("\n✅ SUCCESS! Your key works. You have access to:");
      data.models.forEach(m => {
        // Only show the "generateContent" models we care about
        if (m.supportedGenerationMethods.includes("generateContent")) {
            console.log(`   👉 ${m.name.replace("models/", "")}`);
        }
      });
      console.log("\n💡 USE ONE OF THE NAMES ABOVE in your code.");
    } else {
      console.log("❌ ERROR: Key accepted, but no models found.");
      console.log("Response:", JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error("❌ NETWORK ERROR:", error.message);
  }
}

listModels();