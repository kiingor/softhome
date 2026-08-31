import { describe, expect, it } from "vitest";
import { normalizeCvSignedUrl } from "./cv-storage-url";

const PROJECT_ID = "mxqbawfazgvdnyhrarlz";

describe("normalizeCvSignedUrl", () => {
  it("troca o proxy pelo host oficial e preserva o token", () => {
    const signedUrl =
      "https://api.dnasoftcom.com/storage/v1/object/sign/candidate-cvs/company/candidate.pdf?token=secret-token";

    expect(normalizeCvSignedUrl(signedUrl, PROJECT_ID)).toBe(
      `https://${PROJECT_ID}.supabase.co/storage/v1/object/sign/candidate-cvs/company/candidate.pdf?token=secret-token`,
    );
  });

  it("mantém uma URL que já usa o host oficial", () => {
    const signedUrl =
      `https://${PROJECT_ID}.supabase.co/storage/v1/object/sign/candidate-cvs/company/candidate.pdf?token=secret-token`;

    expect(normalizeCvSignedUrl(signedUrl, PROJECT_ID)).toBe(signedUrl);
  });

  it("não altera URL de outro bucket", () => {
    const signedUrl =
      "https://api.dnasoftcom.com/storage/v1/object/sign/admission-docs/company/file.pdf?token=secret-token";

    expect(normalizeCvSignedUrl(signedUrl, PROJECT_ID)).toBe(signedUrl);
  });

  it("não altera URL quando o project id é inválido", () => {
    const signedUrl =
      "https://api.dnasoftcom.com/storage/v1/object/sign/candidate-cvs/company/candidate.pdf?token=secret-token";

    expect(normalizeCvSignedUrl(signedUrl, "project-invalido")).toBe(
      signedUrl,
    );
  });

  it("não altera URL local", () => {
    const signedUrl =
      "http://127.0.0.1:54321/storage/v1/object/sign/candidate-cvs/company/candidate.pdf?token=secret-token";

    expect(normalizeCvSignedUrl(signedUrl, PROJECT_ID)).toBe(signedUrl);
  });
});
