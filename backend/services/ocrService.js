const fs = require("fs/promises");
const Tesseract = require("tesseract.js");

let visionClient = null;

const canUseGoogleVision = () =>
  Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_CLOUD_PROJECT);

const getVisionClient = () => {
  if (!canUseGoogleVision()) return null;
  if (!visionClient) {
    // Lazy import so local setups without credentials keep working.
    // eslint-disable-next-line global-require
    const vision = require("@google-cloud/vision");
    visionClient = new vision.ImageAnnotatorClient();
  }
  return visionClient;
};

const toVisionWords = (fullTextAnnotation) => {
  const pages = fullTextAnnotation?.pages || [];
  const words = [];

  for (const page of pages) {
    for (const block of page.blocks || []) {
      for (const paragraph of block.paragraphs || []) {
        for (const word of paragraph.words || []) {
          const text = (word.symbols || []).map((s) => s.text || "").join("").trim();
          if (!text) continue;
          const vertices = word.boundingBox?.vertices || [];
          const xs = vertices.map((v) => v.x || 0);
          const ys = vertices.map((v) => v.y || 0);
          words.push({
            text,
            bbox: {
              x0: Math.min(...xs),
              y0: Math.min(...ys),
              x1: Math.max(...xs),
              y1: Math.max(...ys)
            }
          });
        }
      }
    }
  }

  return words;
};

const detectWithGoogleVision = async (imagePath) => {
  const client = getVisionClient();
  if (!client) return null;

  const imageBytes = await fs.readFile(imagePath);
  const [result] = await client.documentTextDetection({
    image: { content: imageBytes }
  });

  const fullText = result.fullTextAnnotation?.text || result.textAnnotations?.[0]?.description || "";
  const words = toVisionWords(result.fullTextAnnotation);

  return {
    engine: "google-vision",
    text: fullText,
    words
  };
};

const detectWithTesseract = async (imagePath) => {
  const result = await Tesseract.recognize(imagePath, "eng");
  return {
    engine: "tesseract",
    text: result.data?.text || "",
    words: result.data?.words || []
  };
};

const recognizeCardText = async (imagePath) => {
  try {
    const visionResult = await detectWithGoogleVision(imagePath);
    if (visionResult && visionResult.text) {
      return visionResult;
    }
  } catch (error) {
    console.warn("[OCR] Google Vision failed, falling back to Tesseract:", error.message);
  }

  return detectWithTesseract(imagePath);
};

module.exports = {
  recognizeCardText
};
