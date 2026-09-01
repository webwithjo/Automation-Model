require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');

async function testModels() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const prompt = "Hi, reply with just 'hello'";
  const modelsToTest = [
    'gemini-3.5-flash',
    'gemini-3.1-pro',
    'gemini-3.6-flash',
    'gemini-3.1-flash-lite'
  ];

  for (const model of modelsToTest) {
    try {
      console.log(`Testing ${model}...`);
      const response = await ai.models.generateContent({
        model: model,
        contents: prompt,
      });
      console.log(`✅ Success for ${model}: ${response.text}`);
      return; // Stop on first success
    } catch (err) {
      console.log(`❌ Failed for ${model}: ${err.message}`);
    }
  }
}

testModels();
