#!/usr/bin/env node
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const nodemailer = require("nodemailer");

const user = (process.env.SMTP_USER || "").trim();
const pass = (process.env.SMTP_PASS || "").trim().replace(/^["']|["']$/g, "");
const domain = user.includes("@") ? user.split("@")[1] : "cropfort.com";

const profiles = [
  { label: "env", host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 465), secure: process.env.SMTP_SECURE !== "false" && Number(process.env.SMTP_PORT || 465) === 465 },
  { label: "SiteGround :465", host: "gvam1094.siteground.biz", port: 465, secure: true },
  { label: "SiteGround :587", host: "gvam1094.siteground.biz", port: 587, secure: false },
  { label: "mail.domain :465", host: `mail.${domain}`, port: 465, secure: true },
  { label: "mail.domain :587", host: `mail.${domain}`, port: 587, secure: false },
];

async function tryProfile(p) {
  const t = nodemailer.createTransport({
    host: p.host,
    port: p.port,
    secure: p.secure,
    requireTLS: !p.secure,
    auth: { user, pass },
    tls: { minVersion: "TLSv1.2", servername: p.host },
  });
  try {
    await t.verify();
    return true;
  } finally {
    t.close();
  }
}

(async () => {
  console.log("USER:", user || "(missing)");
  console.log("PASS length:", pass.length);
  if (!user || !pass) process.exit(1);
  for (const p of profiles) {
    if (!p.host) continue;
    process.stdout.write(`${p.label} (${p.host}:${p.port}) … `);
    try {
      await tryProfile(p);
      console.log("OK");
      console.log(`\nUse:\nSMTP_HOST=${p.host}\nSMTP_PORT=${p.port}\nSMTP_SECURE=${p.secure}\n`);
      process.exit(0);
    } catch (e) {
      console.log("FAIL", e.message);
    }
  }
  process.exit(1);
})();
