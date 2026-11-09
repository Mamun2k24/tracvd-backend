import axios from "axios";
import FormData from "form-data";

export async function uploadToImgbb(buffer, fileName, apiKey) {
  const fd = new FormData();
  fd.append("image", buffer.toString("base64"));
  fd.append("name", (fileName || "image").replace(/\.[^/.]+$/, ""));

  const url = `https://api.imgbb.com/1/upload?key=${apiKey}`;
  const res = await axios.post(url, fd, { headers: fd.getHeaders() });

  if (!res.data?.success) throw new Error("ImgBB upload failed");
  return res.data.data; // { url, display_url, thumb, delete_url ... }
}
