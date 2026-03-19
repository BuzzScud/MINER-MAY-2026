const COOKIE_NAME = 'algonov_auth';

function parseCookies(cookieHeader) {
  if (!cookieHeader || typeof cookieHeader !== 'string') return {};
  const cookiePairs = cookieHeader.split(';');
  const parsedCookies = {};
  for (const cookiePair of cookiePairs) {
    const separatorIndex = cookiePair.indexOf('=');
    if (separatorIndex <= 0) continue;
    const cookieKey = cookiePair.slice(0, separatorIndex).trim();
    const cookieValue = cookiePair.slice(separatorIndex + 1).trim();
    if (!cookieKey) continue;
    try {
      parsedCookies[cookieKey] = decodeURIComponent(cookieValue);
    } catch {
      parsedCookies[cookieKey] = cookieValue;
    }
  }
  return parsedCookies;
}

export function extractAuthToken(req) {
  const parsedCookies = parseCookies(req.headers?.cookie);
  if (parsedCookies[COOKIE_NAME]) {
    return parsedCookies[COOKIE_NAME];
  }

  const authorizationHeader = req.headers?.authorization;
  if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
    return null;
  }
  const bearerToken = authorizationHeader.slice(7).trim();
  return bearerToken || null;
}

export function setAuthCookie(res, token) {
  const isProduction = process.env.NODE_ENV === 'production';
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearAuthCookie(res) {
  const isProduction = process.env.NODE_ENV === 'production';
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/',
  });
}

