// Offline OTP flow checks against the built service. Twilio is blanked so no SMS is sent,
// and email delivery is captured by a fake sender instead of Gmail.
process.env.TWILIO_ACCOUNT_SID = '';
process.env.TWILIO_AUTH_TOKEN = '';
process.env.TWILIO_VERIFY_SERVICE_SID = '';
process.env.NODE_ENV = 'production';

const { ServicingAuthService } = await import('../dist/modules/servicing/servicing.auth.service.js');
const { TicketRepository } = await import('../dist/modules/persistence/ticket.repository.js');

const outbox = [];
const fakeEmail = {
  deliver: true,
  async sendEmail(message) {
    if (!this.deliver) return { success: true, simulated: true };
    outbox.push(message);
    return { success: true, messageId: `TEST-${outbox.length}` };
  },
};
const lastCode = () => outbox.at(-1)?.body.match(/\b(\d{6})\b/)?.[1];

const repo = new TicketRepository();
const auth = new ServicingAuthService(repo, fakeEmail);
const ticket = await repo.getTicketContext('HQ-DEMO-001');
const email = ticket.recipientEmail;

let passed = 0;
let failed = 0;
function check(name, ok, detail) {
  if (ok) {
    passed++;
    console.log(`✓ ${name}`);
  } else {
    failed++;
    console.error(`✗ ${name}`, detail ?? '');
  }
}

const noSession = await auth.requestOtp(email, undefined);
check('no session: code is not sent', !noSession.sent && noSession.reason === 'no_session', noSession);

const unknown = await auth.requestOtp('nobody@example.com', 'chat-a');
check('unknown contact: not_found and nothing sent', !unknown.sent && unknown.reason === 'not_found' && outbox.length === 0, unknown);

const sent = await auth.requestOtp(`  ${email.toUpperCase()} `, 'chat-a');
const code = lastCode();
check('email on file: code emailed to the ticket address', sent.sent && outbox.at(-1)?.to === email && /^\d{6}$/.test(code || ''), { sent, outbox });

const resend = await auth.requestOtp(email, 'chat-a');
check('immediate resend is rate limited', !resend.sent && resend.reason === 'rate_limited', resend);

const otherChat = await auth.verifyOtp(code, 'chat-b');
check('code from chat A is rejected in chat B', !otherChat.verified && !auth.isSessionAuthenticated('chat-b'), otherChat);

const wrong = await auth.verifyOtp(code === '000000' ? '111111' : '000000', 'chat-a');
check('wrong code is rejected with attempts left', !wrong.verified && /attempts? left/.test(wrong.error), wrong);

const right = await auth.verifyOtp(code, 'chat-a');
check('correct code verifies the ticket owner', right.verified && right.ticketId === 'HQ-DEMO-001', right);
check('chat A is authenticated, chat B is not', auth.isSessionAuthenticated('chat-a') && !auth.isSessionAuthenticated('chat-b'));

const reuse = await auth.verifyOtp(code, 'chat-c');
check('used code cannot be replayed in another chat', !reuse.verified, reuse);

await auth.requestOtp(email, 'chat-d');
const lockedCode = lastCode();
let last;
for (let i = 0; i < 5; i++) last = await auth.verifyOtp(lockedCode === '000000' ? '111111' : '000000', 'chat-d');
const afterLock = await auth.verifyOtp(lockedCode, 'chat-d');
check('5 wrong attempts lock the code', /Too many/.test(last.error) && !afterLock.verified, { last, afterLock });

fakeEmail.deliver = false;
const undelivered = await auth.requestOtp(email, 'chat-e');
check('simulated email in production counts as delivery_failed', !undelivered.sent && undelivered.reason === 'delivery_failed', undelivered);

const sms = await auth.requestOtp(ticket.customerPhone, 'chat-f');
check('SMS without Twilio configured is delivery_failed', !sms.sent && sms.channel === 'sms' && sms.reason === 'delivery_failed', sms);

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
