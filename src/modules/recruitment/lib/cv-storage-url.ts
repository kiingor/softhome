const SUPABASE_PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;
const CV_SIGNED_PATH_PREFIX = "/storage/v1/object/sign/candidate-cvs/";

/**
 * Signed Storage URLs inherit the Supabase client origin. The production API
 * proxy does not serve signed Storage objects correctly, so CVs must use the
 * project's canonical Supabase origin.
 *
 * The signed token is preserved; only the origin changes. Local/non-HTTPS URLs
 * and URLs outside the private CV bucket are left untouched.
 */
export function normalizeCvSignedUrl(
  signedUrl: string,
  projectId: string | undefined,
): string {
  const projectRef = projectId?.trim();
  if (!projectRef || !SUPABASE_PROJECT_REF_PATTERN.test(projectRef)) {
    return signedUrl;
  }

  let url: URL;
  try {
    url = new URL(signedUrl);
  } catch {
    return signedUrl;
  }

  if (
    url.protocol !== "https:" ||
    !url.pathname.startsWith(CV_SIGNED_PATH_PREFIX)
  ) {
    return signedUrl;
  }

  const canonicalHostname = `${projectRef}.supabase.co`;
  if (url.hostname === canonicalHostname) {
    return signedUrl;
  }

  url.hostname = canonicalHostname;
  url.port = "";
  url.username = "";
  url.password = "";
  return url.toString();
}
