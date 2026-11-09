import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const uri = process.env.MONGO_URL;

if (!uri) {
  throw new Error("MongoDB connection string is not defined in the environment variables");
}

mongoose.connect(uri)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => {
    console.error("Error connecting to MongoDB:", err);
    process.exit(1);
  });

export default mongoose;
