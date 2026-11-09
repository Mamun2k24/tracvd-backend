import mongoose from 'mongoose';

const bannerSchema = new mongoose.Schema({
  imageUrl: {
    type: String,
    required: true, // Must provide an image
  },
  title: {
    type: String,
    required: false, // Optional title
    trim: true,
  },
  uploadedAt: {
    type: Date,
    default: Date.now, // Automatically records when banner was uploaded
  },
  imgbbDeleteUrl: { type: String, default: "" },
imgbbId: { type: String, default: "" },

}, 
{ collection: 'banners' }); // Explicit collection name

const Banner = mongoose.model("Banner", bannerSchema);

export default Banner;
