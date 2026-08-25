const TERMS_VERSION = "2026-08-25";

const TERMS_OF_USE_TEXT = `SoftChariot Trial Version
Terms of Use & User Declaration
SoftChariot Technologies, Pune, Maharashtra, India

By registering for and using the SoftChariot Estimation Software Trial Version ("Software"), the User confirms that the User has read, understood and agreed to the following terms.

1. Trial Version
The User understands that the Software is currently provided as a trial/free version for evaluation and use.
SoftChariot may modify, suspend or discontinue the Software or any of its features at any time.
SoftChariot does not guarantee uninterrupted or error-free availability of the Software.

2. User Data and Backup
The User remains responsible for maintaining independent copies/backups of important data entered into or generated through the Software.
The User should regularly export or otherwise retain copies of important estimates, measurements, quantities, rates, reports and other project information.

3. Data Loss and Availability
SoftChariot will take reasonable measures to protect User data and maintain the Software.
However, SoftChariot cannot guarantee that data will never be lost, corrupted, altered or become unavailable.
SoftChariot shall not be liable for loss or unavailability of data or information resulting from circumstances including:
Server or database failure
Software bugs or defects
Accidental deletion
Unauthorized access
Cybersecurity incidents or attacks
Internet or network failure
Third-party hosting or infrastructure failure
Force majeure events
User error or incorrect use of the Software

4. Accuracy of Estimates and Calculations
The User acknowledges that the Software performs calculations based on data, measurements, rates, formulas and other information entered or selected by the User.
The User is responsible for independently verifying all quantities, measurements, rates, calculations and reports before using them for tendering, billing, contractual, financial, construction or other official purposes.
SoftChariot is not responsible for consequences arising from incorrect, incomplete or inaccurate information entered or selected by the User.

5. Prohibited Activities
The User shall not:
Attempt to access another User's account or data.
Attempt SQL injection or other cyberattacks.
Attempt to bypass authentication or authorization mechanisms.
Manipulate API requests for unauthorized purposes.
Modify database records through unauthorized means.
Reverse engineer, decompile or otherwise attempt to obtain the source code, except where permitted by applicable law.
Scrape or extract the database or its contents through unauthorized means.
Upload malicious files, code or software.
Deliberately damage, disrupt or overload the Software.
Share login credentials in a manner that permits unauthorized access.
Use automated attacks or other mechanisms to compromise or abuse the Software.
Violation of these conditions may result in suspension or termination of the User's account and, where appropriate, further action under applicable law.

6. Account Security
The User is responsible for keeping the User's login credentials confidential and for notifying SoftChariot if unauthorized access to the account is suspected.

7. Electronic Acceptance
The User agrees that acceptance of these Terms through the Software's electronic interface constitutes the User's electronic acceptance of these Terms.
SoftChariot may retain the User's acceptance record, including the accepted Terms version, date and time of acceptance and relevant technical information, for security, audit and record-keeping purposes, subject to applicable law.

User Declaration
I have read, understood and agree to the above SoftChariot Trial Version Terms of Use & User Declaration.`;

const TERMS_DECLARATION =
  "I have read, understood and agree to the above SoftChariot Trial Version Terms of Use & User Declaration.";

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function termsAsHtml() {
  return TERMS_OF_USE_TEXT.split("\n")
    .map((line) =>
      line.trim() === "" ? "<br/>" : `<div>${escapeHtml(line)}</div>`,
    )
    .join("");
}

function buildUserApprovalEmail({ userName, loginName, orgCode }) {
  const greetingName = userName || loginName || "User";
  const text = [
    `Hello ${greetingName},`,
    "",
    "Your SoftChariot account has been approved. You can now sign in.",
    "",
    "This approval is granted considering that you have read, understood and agreed to the following Terms of Use & User Declaration at the time of signup.",
    "",
    `Organization code: ${orgCode || ""}`,
    `User name: ${loginName || ""}`,
    "",
    "---------- TERMS OF USE & USER DECLARATION ----------",
    "",
    TERMS_OF_USE_TEXT,
    "",
    "Thank you,",
    "SoftChariot Technologies, Pune",
  ].join("\n");

  const html = `
    <p>Hello ${escapeHtml(greetingName)},</p>
    <p>Your SoftChariot account has been approved. You can now sign in.</p>
    <p>This approval is granted considering that you have read, understood and agreed to the following <strong>Terms of Use &amp; User Declaration</strong> at the time of signup.</p>
    <p>
      Organization code: <strong>${escapeHtml(orgCode || "")}</strong><br/>
      User name: <strong>${escapeHtml(loginName || "")}</strong>
    </p>
    <hr/>
    <h3>Terms of Use &amp; User Declaration</h3>
    <div style="font-family: Arial, sans-serif; font-size: 13px; line-height: 1.5; color: #24323f;">
      ${termsAsHtml()}
    </div>
    <p>Thank you,<br/>SoftChariot Technologies, Pune</p>
  `;

  return {
    subject: "Your SoftChariot account is approved",
    text,
    html,
  };
}

function buildOrganizationApprovalEmail({ orgName, orgCode }) {
  const text = [
    "Hello,",
    "",
    `Organization "${orgName || ""}" (${orgCode || ""}) has been approved.`,
    "",
    "This approval is granted considering that you have read, understood and agreed to the following Terms of Use & User Declaration at the time of signup.",
    "",
    "SuperAdmin will create user accounts for your organization, or contact SoftChariot for next steps.",
    "",
    "---------- TERMS OF USE & USER DECLARATION ----------",
    "",
    TERMS_OF_USE_TEXT,
    "",
    "Thank you,",
    "SoftChariot Technologies, Pune",
  ].join("\n");

  const html = `
    <p>Hello,</p>
    <p>Organization <strong>${escapeHtml(orgName || "")}</strong> (${escapeHtml(
      orgCode || "",
    )}) has been approved.</p>
    <p>This approval is granted considering that you have read, understood and agreed to the following <strong>Terms of Use &amp; User Declaration</strong> at the time of signup.</p>
    <p>SuperAdmin will create user accounts for your organization, or contact SoftChariot for next steps.</p>
    <hr/>
    <h3>Terms of Use &amp; User Declaration</h3>
    <div style="font-family: Arial, sans-serif; font-size: 13px; line-height: 1.5; color: #24323f;">
      ${termsAsHtml()}
    </div>
    <p>Thank you,<br/>SoftChariot Technologies, Pune</p>
  `;

  return {
    subject: "Your SoftChariot organization is approved",
    text,
    html,
  };
}

module.exports = {
  TERMS_VERSION,
  TERMS_OF_USE_TEXT,
  TERMS_DECLARATION,
  buildUserApprovalEmail,
  buildOrganizationApprovalEmail,
};
