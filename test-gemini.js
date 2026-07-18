// Run: npm install @google/generative-ai
import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialize with the key you just set up
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function testGeminiPipeline() {
  const startTime = Date.now();
  console.log("🟢 Initiating Gemini API test...");

  try {
    // Target the model you configured in the UI
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    
    const prompt = "Explain the concept of 'residual heat' in cooking in two sentences.";
    console.log(`\n[Prompt]: ${prompt}`);

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    const latency = Date.now() - startTime;

    console.log(`\n[Response]: ${text}`);
    console.log(`\n⏱️ Latency: ${latency}ms`);
    
    // This is the metadata your Gateway will need to parse for the Cost Analysis Panel
    console.log("\n📊 Telemetry Data for SQLite:");
    console.log({
      model: "gemini-1.5-pro",
      status: "OK",
      latency_ms: latency,
      tokens_in: response.usageMetadata?.promptTokenCount,
      tokens_out: response.usageMetadata?.candidatesTokenCount
    });

  } catch (error) {
    console.error("🔴 API Test Failed:", error.message);
  }
}

testGeminiPipeline();
