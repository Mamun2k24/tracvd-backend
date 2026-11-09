// config/paths.js
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
// project root = one level up from /config
const ROOT_DIR = path.resolve(path.dirname(__filename), "..");
const UPLOAD_DIR = path.join(ROOT_DIR, "uploads");

export { ROOT_DIR, UPLOAD_DIR };
