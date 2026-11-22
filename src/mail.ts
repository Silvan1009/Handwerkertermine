import nodemailer from "nodemailer";

export type Send = (to: string, subject: string, text: string) => Promise<void>;

const smtp = process.env.SMTP_URL && nodemailer.createTransport(process.env.SMTP_URL);

/** Ohne SMTP_URL (Entwicklung) landen Mails in der Konsole – inkl. Login-Links. */
export const send: Send = async (to, subject, text) => {
  if (!smtp) return void console.log(`\n📧 An: ${to}\n   ${subject}\n   ${text.replaceAll("\n", "\n   ")}\n`);
  await smtp.sendMail({ from: process.env.MAIL_FROM ?? "Handwerkertermine <noreply@localhost>", to, subject, text });
};
