const fs = require("fs");
const path = require("path");
const env = require("./env");

function localFallback() {
  return !env.S3_ENDPOINT || !env.S3_ACCESS_KEY;
}

function client() {
  const { S3Client } = require("@aws-sdk/client-s3");
  return new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
    // AWS SDK v3 checksum headers break some S3-compatible APIs (Supabase Storage).
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

async function signedUploadUrl(storageKey, contentType) {
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  if (localFallback()) {
    fs.mkdirSync(path.join(process.cwd(), "uploads", path.dirname(storageKey)), { recursive: true });
    return {
      uploadUrl: `http://localhost:${env.PORT}/local-upload/${encodeURIComponent(storageKey)}`,
      storageKey,
      expiresAt,
    };
  }
  const { PutObjectCommand } = require("@aws-sdk/client-s3");
  const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
  const uploadUrl = await getSignedUrl(
    client(),
    new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: storageKey, ContentType: contentType }),
    { expiresIn: 900 }
  );
  return { uploadUrl, storageKey, expiresAt };
}

async function signedDownloadUrl(storageKey) {
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  if (localFallback()) {
    return {
      downloadUrl: `http://localhost:${env.PORT}/local-download/${encodeURIComponent(storageKey)}`,
      expiresAt,
    };
  }
  const { GetObjectCommand } = require("@aws-sdk/client-s3");
  const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
  const downloadUrl = await getSignedUrl(
    client(),
    new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: storageKey }),
    { expiresIn: 900 }
  );
  return { downloadUrl, expiresAt };
}

module.exports = { signedUploadUrl, signedDownloadUrl };
