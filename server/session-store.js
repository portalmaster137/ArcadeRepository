/**
 * A small express-session Store backed by the existing Firestore instance.
 *
 * One document per session, keyed by the express-session cookie id (sanitized
 * to be a valid Firestore document id). Each document carries the serialized
 * session payload and an expiresAt Timestamp so we can TTL-clean later.
 *
 *   sessions/{sid}  →  { data, expiresAt }
 *
 * Implements the four methods express-session actually uses:
 *   - get(sid, cb)         load a session
 *   - set(sid, session, cb) upsert with a fresh TTL
 *   - destroy(sid, cb)     delete a session (logout, expiry)
 *   - touch(sid, session, cb) refresh the TTL without re-serializing
 */

module.exports = function createFirestoreSessionStore(sessionLib, db, options = {}) {
  const collectionName = options.collection || 'sessions';
  const collection = db.collection(collectionName);

  // Firestore doc ids can't contain '.', '$', '#', '[', ']', '/'.
  // express-session sids are signed cookies — base64-ish, but defensible
  // to sanitize to avoid an unexpected crash on weird input.
  const cleanSid = (sid) => String(sid).replace(/[.$#[\]\/]/g, '_');

  class FirestoreSessionStore extends sessionLib.Store {
    get(sid, cb) {
      try {
        collection.doc(cleanSid(sid)).get()
          .then(doc => {
            if (!doc.exists) return cb(null, null);
            const { data, expiresAt } = doc.data() || {};
            if (expiresAt && expiresAt.toMillis() <= Date.now()) {
              // Expired — clean up and report as not found.
              doc.ref.delete().catch(() => {});
              return cb(null, null);
            }
            cb(null, data || null);
          })
          .catch(err => cb(err));
      } catch (err) {
        cb(err);
      }
    }

    set(sid, session, cb) {
      try {
        // express-session gives us a `cookie.expires` Date on the session.
        // Default to a 7-day TTL (matches the cookie maxAge in server/index.js).
        const expiresAt = session?.cookie?.expires
          ? new Date(session.cookie.expires)
          : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        // express-session constructs the session via `new session.Session(...)`,
        // so it has a custom prototype. Firestore refuses to serialize any
        // object with a non-Object prototype (anything created via `new`).
        // JSON round-trip strips the prototype and yields a plain object that
        // Firestore can encode.
        const data = JSON.parse(JSON.stringify(session));

        collection.doc(cleanSid(sid)).set({ data, expiresAt })
          .then(() => cb(null))
          .catch(err => cb(err));
      } catch (err) {
        cb(err);
      }
    }

    touch(sid, session, cb) {
      // Refresh just the TTL; keep the same session data. express-session
      // calls this on every request when rolling: true, so we want it cheap.
      try {
        const expiresAt = session?.cookie?.expires
          ? new Date(session.cookie.expires)
          : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        collection.doc(cleanSid(sid)).update({ expiresAt })
          .then(() => cb(null))
          .catch(err => {
            // If the doc doesn't exist yet (first request, race), fall through
            // to set(). express-session's set() will be called next.
            if (err.code === 5 || /NOT_FOUND/i.test(err.message || '')) return cb(null);
            cb(err);
          });
      } catch (err) {
        cb(err);
      }
    }

    destroy(sid, cb) {
      try {
        collection.doc(cleanSid(sid)).delete()
          .then(() => cb(null))
          .catch(err => cb(err));
      } catch (err) {
        cb(err);
      }
    }
  }

  return FirestoreSessionStore;
};
