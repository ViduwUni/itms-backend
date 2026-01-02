import jwt from "jsonwebtoken";

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: "Missing token" });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // ✅ normalize id + role no matter what your token contains
    const id = payload.id || payload._id || payload.userId || payload.sub;
    if (!id)
      return res
        .status(401)
        .json({ message: "Invalid token (missing user id)" });

    req.user = {
      ...payload,
      id: String(id),
      role: payload.role,
    };

    return next();
  } catch {
    return res.status(401).json({ message: "Invalid/expired token" });
  }
}

export function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    if (req.user.role !== role)
      return res.status(403).json({ message: "Forbidden" });
    next();
  };
}
