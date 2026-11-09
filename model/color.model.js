import mongoose from 'mongoose';

const colorSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true, 
    unique: true,// Optional: Ensure a name is provided
  },
  code: {
    type: String, // Store color codes (e.g., hex, RGB, or HSL)
    required: true, // Optional: Ensure a color code is provided
  },
}, 

{ collection: 'colorname' }); // Explicitly set the collection name

const Color = mongoose.model("Color", colorSchema);
export default Color;
