// middleware/sanitize.Middleware.js
// Prevents NoSQL/operator injection by stripping keys that MongoDB treats as
// query operators ($gt, $ne, ...) or projection/dot paths from request input.
//
// Written for Express 5: req.query is a read-only getter, so we mutate the
// returned object in place instead of reassigning it (reassigning throws).

const isPlainObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const isForbiddenKey = (key) => key.startsWith("$") || key.includes(".");

// Recursively delete any operator keys. Returns the number of keys removed so
// callers can log when something was stripped.
const sanitizeInPlace = (obj) => {
  let removed = 0;

  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (item && typeof item === "object") removed += sanitizeInPlace(item);
    }
    return removed;
  }

  if (!isPlainObject(obj)) return removed;

  for (const key of Object.keys(obj)) {
    if (isForbiddenKey(key)) {
      delete obj[key];
      removed += 1;
      continue;
    }
    const value = obj[key];
    if (value && typeof value === "object") removed += sanitizeInPlace(value);
  }

  return removed;
};

const mongoSanitize = (req, res, next) => {
  try {
    let removed = 0;
    if (req.body) removed += sanitizeInPlace(req.body);
    if (req.params) removed += sanitizeInPlace(req.params);
    // req.query is a getter in Express 5; grab it once and mutate the object.
    if (req.query) removed += sanitizeInPlace(req.query);

    if (removed > 0) {
      console.warn(
        `[mongoSanitize] stripped ${removed} operator key(s) from ${req.method} ${req.originalUrl}`,
      );
    }
  } catch (err) {
    // Never let sanitization break a request; log and continue.
    console.error("[mongoSanitize] error:", err);
  }
  next();
};

module.exports = mongoSanitize;
