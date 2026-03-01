const fs = require("fs");
const pdfParse = require("pdf-parse");

const parseResume = async (filePath) => {
  try {
    const ext = filePath.split(".").pop().toLowerCase();

    // ✅ TXT support (very important)
    if (ext === "txt") {
      const text = fs.readFileSync(filePath, "utf8");
      return text.toLowerCase();
    }

    // ✅ PDF support
    if (ext === "pdf") {
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdfParse(dataBuffer);
      return data.text.toLowerCase();
    }

    return "";
  } catch (err) {
    console.error("PDF Parse Error:", err.message);
    return "";
  }
};

module.exports = parseResume;