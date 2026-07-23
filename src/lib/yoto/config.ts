/**
 * Yoto OAuth + API configuration.
 * Endpoints follow Yoto's public Auth0 tenant.
 */
export const YOTO_AUTH_BASE = "https://login.yotoplay.com";
export const YOTO_API_BASE = "https://api.yotoplay.com";
export const YOTO_AUDIENCE = "https://api.yotoplay.com"; // Access to devices, playlists, family, content
export const YOTO_SCOPES = "openid profile offline_access family:library:manage family:devices:view family:devices:manage family:devices:control user:content:manage";
export const YOTO_CALLBACK_PATH = "/api/yoto/callback";
