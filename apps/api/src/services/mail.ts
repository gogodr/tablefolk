import { Resend } from "resend";
import { config, requireSetting } from "../config.js";

export async function sendInvitation(email: string, groupName: string, token: string): Promise<void> {
  const resend = new Resend(requireSetting(config.resendApiKey, "RESEND_API_KEY"));
  const from = requireSetting(config.resendFromEmail, "RESEND_FROM_EMAIL");
  const link = `${config.publicWebUrl.replace(/\/$/, "")}/invitations/${encodeURIComponent(token)}`;
  const { error } = await resend.emails.send({
    from,
    to: email,
    subject: `Join ${groupName} on Tablefolk`,
    text: `You have been invited to join ${groupName} on Tablefolk. Open this link within seven days: ${link}`,
  });
  if (error) throw new Error(error.message);
}
