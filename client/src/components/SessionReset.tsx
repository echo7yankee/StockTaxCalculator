import { useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useUpload } from '../contexts/UploadContext';
import { clearPendingParse } from '../lib/pendingParse';

/**
 * Clears every in-memory / sessionStorage trace of a logged-in user's tax data when
 * they log out, on ALL logout paths (the header button, the Dashboard 401
 * auto-logout, Settings, and delete-account), not just the one that happens to call
 * clearUpload itself.
 *
 * It watches the auth user and fires only on a real logged-in -> logged-out
 * transition (non-null -> null). On a shared machine this stops the next person from
 * opening /results or /filing-guide and seeing the prior user's numbers + D212. An
 * anonymous in-progress free-checker flow (null -> null) is never wiped, and the
 * initial null -> user login transition is a no-op.
 *
 * Placed inside BOTH AuthProvider and UploadProvider (rendered from App), so it can
 * read the auth user and reach the upload context's clearUpload.
 */
export default function SessionReset() {
  const { user } = useAuth();
  const { clearUpload } = useUpload();
  const prevUserRef = useRef(user);

  useEffect(() => {
    const wasLoggedIn = prevUserRef.current !== null;
    const isLoggedOut = user === null;
    if (wasLoggedIn && isLoggedOut) {
      clearUpload();
      clearPendingParse();
    }
    prevUserRef.current = user;
  }, [user, clearUpload]);

  return null;
}
