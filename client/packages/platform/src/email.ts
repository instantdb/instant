export const defaultMagicCodeEmailHtml = /* html */ `<div style="background: #f6f6f6; font-family: Helvetica, Arial, sans-serif; line-height: 1.6; font-size: 18px;">
  <div style="max-width: 650px; margin: 0 auto; background: white; padding: 20px">
    <div style="background: #f6f6f6; font-family: Helvetica, Arial, sans-serif; line-height: 1.6; font-size: 18px;">
      <div style="max-width: 650px; margin: 0 auto; background: white; padding: 20px;">
        <p><strong>Welcome,</strong></p>
        <p>
          You asked to join {app_title}. To complete your registration, use this
          verification code:
        </p>
        <h2 style="text-align: center"><strong>{code}</strong></h2>
        <p>
          Copy and paste this into the confirmation box, and you'll be on your
          way.
        </p>
        <p>
          Note: This code will expire in 10 minutes, and can only be used once. If
          you didn't request this code, please reply to this email.
        </p>
      </div>
    </div>
  </div>
</div>
`;

export const defaultMagicCodeEmailSubject =
  '{code} is your code for {app_title}';

export const defaultMagicCodeEmailConfig = {
  authEmail: {
    subject: defaultMagicCodeEmailSubject,
    from: '',
    fromAddress: undefined,
    body: defaultMagicCodeEmailHtml,
  },
};
