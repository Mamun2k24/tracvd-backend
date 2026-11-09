// userController.js
import bcrypt from "bcryptjs";
import { User } from "../model/index.model.js";
import jwt from "jsonwebtoken";

// Controller function to get all users
export const getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select("-password");
    if (!users.length) {
      return res.status(404).json({ message: "No users found" });
    }
    res.status(200).json({ users });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
// Delete user by ID

// export const deleteUserById = async (req, res) => {
//     const { id } = req.params;
//     console.log(req.params)
//     try {
//       const deletedUser = await User.findByIdAndDelete(id);
//       if (!deletedUser) {
//         return res.status(404).json({ message: "User not found" });
//       }
//       res.status(200).json({ message: "User deleted successfully" });
//     } catch (error) {
//       console.error("Error deleting user:", error);
//       res.status(500).json({ message: "Internal Server Error" });
//     }
//   };
export const deleteUserById = async (req, res) => {
  try {
    const { id } = req.params;

    if (String(req.user.id) === String(id)) {
      return res.status(400).json({
        message: "You cannot delete your own account",
      });
    }

    const targetUser = await User.findById(id);

    if (!targetUser) {
      return res.status(404).json({ message: "User not found" });
    }

    if (targetUser.role === "superadmin") {
      return res.status(403).json({
        message: "Superadmin cannot be deleted",
      });
    }

    if (targetUser.role === "admin" && req.user.role !== "superadmin") {
      return res.status(403).json({
        message: "Only superadmin can delete admin",
      });
    }

    await User.findByIdAndDelete(id);

    return res.status(200).json({
      message: "User deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting user:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

  // ✅ আমার প্রোফাইল (GET)
export const getUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;           // ensureAuth/protect middleware সেট করে
    const user = await User.findById(userId).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.status(200).json({ user });
  } catch (err) {
    console.error('Error fetching user profile:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};
// userController.js

export const updateUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      name,
      mobile,
      bio,
      profileImage,
      gender,
      dateOfBirth,
      address,
    } = req.body;

    if (
      !name &&
      !mobile &&
      !bio &&
      !profileImage &&
      !gender &&
      !dateOfBirth &&
      !address
    ) {
      return res.status(400).json({ message: "No fields to update." });
    }

    const updateData = {
      ...(name && { name }),
      ...(mobile && { mobile }),
      ...(bio && { bio }),
      ...(profileImage && { profileImage }),
      ...(gender && { gender }),              // optional
      ...(address && { address }),
    };

    // DOB আলাদা করে handle করলাম যাতে string থেকেও Date সেট হয়
    if (dateOfBirth) {
      // ধরলাম frontend থেকে "2025-12-24" আসছে
      updateData.dateOfBirth = new Date(dateOfBirth);
    }

    const updatedUser = await User.findByIdAndUpdate(userId, updateData, {
      new: true,
      runValidators: true,
      select: "-password",
    });

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const token = jwt.sign(
      { id: updatedUser._id, email: updatedUser.email, role: updatedUser.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.status(200).json({
      message: "Profile updated successfully",
      user: updatedUser,
      token,
    });
  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
// userController.js
export const changePassword = async (req, res) => {
  try {
    const userId = req.user?.id; // protect middleware set করবে

    if (!userId) {
      return res.status(401).json({ message: "Not authorized" });
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res
        .status(400)
        .json({ message: "Current password and new password are required" });
    }

    // 🔑 password field ডিফল্টে select:false, তাই +password দিতে হবে
    const user = await User.findById(userId).select("+password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // current password check
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    // বা: const isMatch = await user.matchPassword(currentPassword);

    if (!isMatch) {
      return res
        .status(400)
        .json({ message: "Current password is incorrect" });
    }

    // নতুন password সেট করে save করলে pre('save') hook এ hash হবে
    user.password = newPassword;
    await user.save();

    // চাইলে নতুন token
    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    return res
      .status(200)
      .json({ message: "Password updated successfully", token });
  } catch (err) {
    console.error("Error changing password:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// ✅ Update user role (Admin/Superadmin only)
// export const updateUserRole = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { role } = req.body;

//     const allowed = ["user", "admin", "superadmin"];
//     if (!allowed.includes(role)) {
//       return res.status(400).json({ message: "Invalid role" });
//     }

//     // ✅ only superadmin can assign superadmin
//     if (role === "superadmin" && req.user.role !== "superadmin") {
//       return res.status(403).json({ message: "Only superadmin can assign superadmin" });
//     }

//     // ✅ optional safety: cannot change own role
//     if (String(req.user.id) === String(id)) {
//       return res.status(400).json({ message: "You cannot change your own role" });
//     }

//     const updated = await User.findByIdAndUpdate(id, { role }, { new: true }).select("-password");
//     if (!updated) return res.status(404).json({ message: "User not found" });

//     return res.status(200).json({
//       message: "Role updated successfully",
//       user: updated,
//     });
//   } catch (error) {
//     console.error("Error updating user role:", error);
//     res.status(500).json({ message: "Internal Server Error" });
//   }
// };
export const updateUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    const allowedRoles = ["user", "admin", "superadmin"];

    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    if (String(req.user.id) === String(id)) {
      return res.status(400).json({
        message: "You cannot change your own role",
      });
    }

    const targetUser = await User.findById(id);

    if (!targetUser) {
      return res.status(404).json({ message: "User not found" });
    }

    if (req.user.role !== "superadmin") {
      return res.status(403).json({
        message: "Only superadmin can change user role",
      });
    }

    if (targetUser.role === "superadmin") {
      return res.status(403).json({
        message: "Superadmin role cannot be changed",
      });
    }

    targetUser.role = role;
    await targetUser.save();

    const updatedUser = await User.findById(id).select("-password");

    return res.status(200).json({
      message: "Role updated successfully",
      user: updatedUser,
    });
  } catch (error) {
    console.error("Error updating user role:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== "boolean") {
      return res.status(400).json({
        message: "isActive must be true or false",
      });
    }

    if (String(req.user.id) === String(id)) {
      return res.status(400).json({
        message: "You cannot change your own status",
      });
    }

    const targetUser = await User.findById(id);

    if (!targetUser) {
      return res.status(404).json({ message: "User not found" });
    }

    if (targetUser.role === "superadmin") {
      return res.status(403).json({
        message: "Superadmin status cannot be changed",
      });
    }

    if (targetUser.role === "admin" && req.user.role !== "superadmin") {
      return res.status(403).json({
        message: "Only superadmin can change admin status",
      });
    }

    targetUser.isActive = isActive;
    await targetUser.save();

    const updatedUser = await User.findById(id).select("-password");

    return res.status(200).json({
      message: `User ${isActive ? "activated" : "deactivated"} successfully`,
      user: updatedUser,
    });
  } catch (error) {
    console.error("Update status error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// ✅ Create Admin - Only Superadmin
export const createAdmin = async (req, res) => {
  try {
    const { name, email, username, password } = req.body;

    if (!name || !email || !username || !password) {
      return res.status(400).json({
        message: "Name, email, username and password are required",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        message: "Password must be at least 6 characters",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const normalizedUsername = username.toLowerCase().trim();

    const exists = await User.findOne({
      $or: [{ email: normalizedEmail }, { username: normalizedUsername }],
    });

    if (exists) {
      return res.status(400).json({
        message: "Email or username already exists",
      });
    }

    const admin = await User.create({
      name,
      email: normalizedEmail,
      username: normalizedUsername,
      password,
      role: "admin",
      isVerified: true,
      isActive: true,
      createdBy: req.user.id,
    });

    const adminData = await User.findById(admin._id).select("-password");

    return res.status(201).json({
      message: "Admin created successfully",
      user: adminData,
    });
  } catch (error) {
    console.error("Create admin error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};
