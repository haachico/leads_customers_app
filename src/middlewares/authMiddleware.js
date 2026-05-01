const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "43434343oojfodjfdo4343";
const authenticationMiddleware = (req, res, next) => {
  const authHeader = req.headers["authorization"];

  if (!authHeader) {
    return res.status(401).json({ message: "Authorization header missing" });
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Token missing" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (errror) {
    return res.status(401).json({ message: "Invalid token" });
  }
};

const authorizationMiddleware = (requiredRoles) => {
  return (req, res, next) => {
    console.log(requiredRoles, req.user.role, "requiredRoles");
    if (requiredRoles.includes(req.user.role)) {
      return next();
    } else {
      return res.status(403).json({ message: "Forbidden" });
    }
  };
};

module.exports = {
  authenticationMiddleware,
  authorizationMiddleware,
};
