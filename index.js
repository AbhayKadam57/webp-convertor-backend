import express from "express";
import multer from "multer";
import sharp from "sharp";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";

const app = express();
const PORT = 3000;
app.use(cors());

// Resolve __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Set up folders
const uploadDir = path.join(__dirname, "uploads");
const outputDir = path.join(__dirname, "public", "images");
await fs.mkdir(uploadDir, { recursive: true });
await fs.mkdir(outputDir, { recursive: true });

app.use("/images", express.static(outputDir));

// Multer setup
const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + "-" + Math.round(Math.random() * 1e5) + ext);
  },
});

const fileFilter = (_, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed"), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    files: 20,
  },
});

// Upload endpoint
app.post("/upload", upload.array("images", 20), async (req, res) => {
  try {
    const width = req.query.width ? parseInt(req.query.width) : null;
    const height = req.query.height ? parseInt(req.query.height) : null;
    const quality = req.query.quality ? parseInt(req.query.quality) : 80;
    const maintainAspectRatio = req.query.maintainAspectRatio === "true";

    // Validate query params
    if (
      (width && (width < 1 || width > 5000)) ||
      (height && (height < 1 || height > 5000)) ||
      isNaN(quality) ||
      quality < 1 ||
      quality > 100
    ) {
      return res
        .status(400)
        .json({ error: "Invalid width, height, or quality" });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No images provided" });
    }

    if (req.files.length > 20) {
      return res.status(400).json({ error: "Maximum 20 images allowed" });
    }

    const urls = [];

    for (const file of req.files) {
      const inputPath = file.path;
      const outputFilename = `${Date.now()}-${Math.round(
        Math.random() * 1e5
      )}.webp`;
      const outputPath = path.join(outputDir, outputFilename);

      let image = sharp(inputPath);

      const metadata = await image.metadata();
      const originalWidth = metadata.width;
      const originalHeight = metadata.height;

      let targetWidth = width;
      let targetHeight = height;

      if (maintainAspectRatio) {
        const aspectRatio = originalWidth / originalHeight;

        if (width && height) {
          // Adjust dimensions to fit within bounding box
          if (width / height > aspectRatio) {
            targetWidth = Math.round(height * aspectRatio);
          } else {
            targetHeight = Math.round(width / aspectRatio);
          }
        } else if (width) {
          targetHeight = Math.round(width / aspectRatio);
        } else if (height) {
          targetWidth = Math.round(height * aspectRatio);
        }
      }

      if (targetWidth || targetHeight) {
        image = image.resize(targetWidth || null, targetHeight || null);
      }

      await image.webp({ quality }).toFile(outputPath);

      urls.push(
        `https://webp-convertor-backend.onrender.com/images/${outputFilename}`
      );
    }

    res.status(200).json({ urls });
  } catch (err) {
    console.error("Upload error:", err.message);
    res.status(500).json({ error: "Image conversion failed" });
  }
});

// Error handler
app.use((err, req, res, _next) => {
  if (err.message === "Only image files are allowed") {
    return res.status(400).json({ error: err.message });
  }

  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
