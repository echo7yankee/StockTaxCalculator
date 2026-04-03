import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma.js';

// Serialize: store user id in session
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Deserialize: fetch user from DB by id
passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    done(null, user);
  } catch (err) {
    done(err);
  }
});

// Local strategy: email + password
passport.use(
  new LocalStrategy(
    { usernameField: 'email', passwordField: 'password' },
    async (email, password, done) => {
      try {
        const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

        if (!user) {
          return done(null, false, { message: 'Invalid email or password' });
        }

        if (!user.passwordHash) {
          return done(null, false, {
            message: 'This account uses Google sign-in. Please log in with Google.',
          });
        }

        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) {
          return done(null, false, { message: 'Invalid email or password' });
        }

        return done(null, user);
      } catch (err) {
        return done(err);
      }
    },
  ),
);

// Google OAuth strategy (only register if credentials are configured)
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3001/api/auth/google/callback',
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const googleId = profile.id;
          const email = profile.emails?.[0]?.value?.toLowerCase();
          const name = profile.displayName || null;

          if (!email) {
            return done(null, false, { message: 'No email from Google' });
          }

          // Try to find by googleId first
          let user = await prisma.user.findUnique({ where: { googleId } });
          if (user) return done(null, user);

          // Try to find by email (account linking)
          user = await prisma.user.findUnique({ where: { email } });
          if (user) {
            // Link Google account to existing user
            user = await prisma.user.update({
              where: { id: user.id },
              data: { googleId, name: user.name || name },
            });
            return done(null, user);
          }

          // Create new user
          user = await prisma.user.create({
            data: { email, name, googleId, plan: 'free' },
          });
          return done(null, user);
        } catch (err) {
          return done(err);
        }
      },
    ),
  );
}

export default passport;
