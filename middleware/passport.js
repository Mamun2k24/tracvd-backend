import dotenv from "dotenv";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { User } from "../model/index.model.js";

dotenv.config();

const googleClientID = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const googleCallbackURL =
  process.env.GOOGLE_CALLBACK_URL ||
  `${process.env.SERVER_URL || "http://localhost:5000"}/api/auth/google/callback`;

if (!googleClientID || !googleClientSecret) {
  console.warn(
    "Google OAuth is disabled because GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is not set."
  );
} else {
  passport.use(
    new GoogleStrategy(
      {
        clientID: googleClientID,
        clientSecret: googleClientSecret,
        callbackURL: googleCallbackURL,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value?.toLowerCase();
          if (!email) {
            return done(new Error("Google account has no email"), null);
          }

          let user = await User.findOne({ googleId: profile.id });
          if (!user) {
            user = await User.findOne({ email });
          }

          if (user) {
            if (!user.googleId) {
              user.googleId = profile.id;
              await user.save();
            }
            return done(null, user);
          }

          const newUser = await User.create({
            googleId: profile.id,
            email,
            name: profile.displayName,
            profileImage: profile.photos?.[0]?.value,
            isVerified: true,
          });

          done(null, newUser);
        } catch (error) {
          done(error, null);
        }
      }
    )
  );
}

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

export default passport;