import nodemailer from "nodemailer";

export type Send = (to: string, subject: string, text: string) => Promise<void>;

const smtp = process.env.SMTP_URL && nodemailer.createTransport(process.env.SMTP_URL);

/** Ohne SMTP_URL landen Mails in der Konsole (inkl. Login-Links) – das ist nur in der Entwicklung erlaubt. */
export const send: Send = async (to, subject, text) => {
  if (smtp) return void (await smtp.sendMail({ from: process.env.MAIL_FROM ?? "Handwerkertermine <noreply@localhost>", to, subject, text }));
  if (process.env.NODE_ENV === "production") throw new Error("SMTP_URL fehlt – Mailversand nicht konfiguriert");
  console.log(`\n📧 An: ${to}\n   ${subject}\n   ${text.replaceAll("\n", "\n   ")}\n`);
};
