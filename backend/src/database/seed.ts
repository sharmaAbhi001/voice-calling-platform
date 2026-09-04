import { closePool, query } from './client.js';
import { logger } from '../utils/logger.js';
import { authService } from '../modules/auth/auth.service.js';
import { authRepository } from '../modules/auth/auth.repository.js';
import { knowledgeBaseService } from '../modules/knowledge-base/knowledge-base.service.js';
import { templatesService } from '../modules/templates/templates.service.js';

const KB_NAME = 'Nimbus CRM Knowledge Base v1';
const TEMPLATE_NAME = 'Product Introduction v1';
const HINGLISH_TEMPLATE_NAME = 'Product Introduction - Hinglish v1';

/**
 * Demo data for a fictional product ("Nimbus CRM"). It exists so the guard rails
 * can be exercised on day one: ask the agent about anything below and it answers
 * from the KB, ask about anything else and it must decline.
 */
const DOCUMENTS = [
  {
    title: 'About Nimbus Software',
    category: 'COMPANY' as const,
    content: `Nimbus Software is a business software company based in Pune, India, founded in 2019.
We build Nimbus CRM, a sales management tool used by small and mid-sized B2B teams in India.

We have around 60 employees. Support is provided in English, Hindi and Marathi.
Our office hours are Monday to Friday, 9:30 AM to 6:30 PM IST.`,
  },
  {
    title: 'Nimbus CRM product overview',
    category: 'PRODUCT' as const,
    content: `Nimbus CRM helps sales teams track leads, calls and deals in one place.

It is a web application and also has Android and iOS apps. Data is hosted in India
(Mumbai region). A typical team is live within one week.

Nimbus CRM is designed for teams of 5 to 200 sales users. It is not an accounting
or inventory product.`,
  },
  {
    title: 'Nimbus CRM pricing',
    category: 'PRICING' as const,
    content: `Nimbus CRM is priced per user per month, billed annually.

Starter: 499 rupees per user per month. Includes lead management, call logging and
standard reports. Minimum 5 users.

Growth: 999 rupees per user per month. Adds pipeline automation, custom fields,
role-based permissions and the mobile app.

Enterprise: custom pricing, starting at 40 users. Adds single sign-on, audit logs
and a dedicated success manager.

Volume discount: teams above 25 users get 10 percent off the Growth plan. Teams
above 50 users get 15 percent off.

All prices exclude GST. A 14-day free trial is available on Starter and Growth and
does not require a credit card.`,
  },
  {
    title: 'Nimbus CRM features',
    category: 'FEATURES' as const,
    content: `Lead capture from web forms, email and CSV import.
Call logging with notes and follow-up reminders.
Deal pipeline with customisable stages.
Reports for pipeline value, conversion rate and rep activity.
Mobile apps for Android and iOS (Growth plan and above).
Integrations available: Gmail, Outlook, WhatsApp Business API, Zapier and Tally.

There is no built-in dialer. Calls are logged manually or through the mobile app.`,
  },
  {
    title: 'Frequently asked questions',
    category: 'FAQ' as const,
    content: `How long does onboarding take? A standard onboarding takes 3 to 5 working days,
including data import and one training session.

Can we import our existing data? Yes, from CSV or Excel. Our team does the first
import for you on the Growth and Enterprise plans.

Is there a contract lock-in? Annual billing is a 12-month term. Monthly billing is
available on request at 20 percent higher per-user pricing.

Do you support multiple languages? The interface is available in English only today.`,
  },
  {
    title: 'Data, privacy and cancellation policy',
    category: 'POLICY' as const,
    content: `Customer data is stored in India (AWS Mumbai region) and is encrypted at rest.

If a subscription is cancelled, data remains available for export for 30 days after
the end of the billing period, then it is permanently deleted.

Refunds: annual plans can be cancelled within 30 days of first payment for a full
refund. After 30 days, no partial refunds are issued for the remaining term.

We do not sell customer data to third parties. Calls made through our platform may
be recorded, and the caller must disclose recording at the start of the call.`,
  },
  {
    title: 'Support information',
    category: 'SUPPORT' as const,
    content: `Support is available by email at support@nimbus.example and by phone during
office hours (Monday to Friday, 9:30 AM to 6:30 PM IST).

Starter plan: email support with a next-business-day response target.
Growth plan: email and phone support with a 4-hour response target.
Enterprise plan: dedicated success manager and a 1-hour response target.`,
  },
];

const TEMPLATE = {
  name: TEMPLATE_NAME,
  objective:
    'Introduce Nimbus CRM, find out whether the person runs a sales team that could use it, and book a demo if they are interested.',
  openingScript:
    'Hello {{first_name}}, this is {{agent_name}} calling from {{company}}. Is now an okay time for a quick minute?',
  systemPrompt: `You are calling on behalf of {{company}} to introduce Nimbus CRM.

Keep the conversation short and natural. Ask one question at a time and let the
person finish speaking. If they say it is a bad time, offer to call back and end
the call politely.`,
  closingScript:
    'Thank you for your time, {{first_name}}. I will send the details across and someone from our team will follow up. Have a good day.',
  tone: 'Professional, warm and unhurried. Indian English.',
  language: 'EN' as const,
  voiceProvider: 'OPENAI' as const,
  llmProvider: 'OPENAI' as const,
  voiceName: null,
  backgroundAudio: 'OFFICE' as const,
  qualificationQuestions: [
    'How many people are in your sales team today?',
    'How are you tracking leads and follow-ups at the moment?',
    'What is the biggest problem with your current process?',
  ],
  variableSchema: [
    { key: 'first_name', label: 'Customer first name', required: true, example: 'Rahul' },
    { key: 'company', label: 'Your company name', required: true, example: 'Nimbus Software' },
    { key: 'agent_name', label: 'Agent name', required: true, example: 'Asha' },
  ],
};

/**
 * The same call in Hinglish. The scripts are written the way the agent should sound:
 * Devanagari for Hindi words, Latin for the English business terms nobody translates.
 * Text-to-speech pronounces each script correctly, so romanising the Hindi would make
 * it read as broken English.
 */
const HINGLISH_TEMPLATE = {
  name: HINGLISH_TEMPLATE_NAME,
  objective:
    'Nimbus CRM introduce karna, samajhna ki customer ke paas sales team hai ya nahi, aur interested hone par demo book karna.',
  openingScript:
    'नमस्ते {{first_name}} जी, मैं {{agent_name}} बोल रही हूँ {{company}} से। क्या अभी दो मिनट बात कर सकते हैं?',
  systemPrompt: `आप {{company}} की तरफ़ से Nimbus CRM introduce करने के लिए call कर रहे हैं.

बातचीत छोटी और natural रखें. एक बार में एक ही सवाल पूछें और customer को पूरा बोलने दें.
अगर वो कहें कि अभी busy हैं, तो politely बाद में call करने का offer करके call end कर दें.`,
  closingScript:
    'आपके समय के लिए धन्यवाद {{first_name}} जी। मैं details भेज देती हूँ, हमारी team आपसे follow-up करेगी। आपका दिन शुभ हो।',
  tone: 'Professional, warm aur unhurried. Natural Hinglish, jaise sales calls me hoti hai.',
  language: 'HINGLISH' as const,
  // Sarvam's code-mix speech model and native voices are the point of this template.
  voiceProvider: 'SARVAM' as const,
  llmProvider: 'OPENAI' as const,
  voiceName: 'ritu',
  backgroundAudio: 'OFFICE' as const,
  qualificationQuestions: [
    'अभी आपकी sales team में कितने लोग हैं?',
    'अभी leads और follow-ups कैसे track करते हैं आप?',
    'current process में सबसे बड़ी दिक्कत क्या आती है?',
  ],
  variableSchema: [
    { key: 'first_name', label: 'Customer first name', required: true, example: 'Rahul' },
    { key: 'company', label: 'Your company name', required: true, example: 'Nimbus Software' },
    { key: 'agent_name', label: 'Agent name', required: true, example: 'Asha' },
  ],
};

const run = async (): Promise<void> => {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345';

  const user = await authRepository.upsert({
    name: 'Admin',
    email,
    passwordHash: await authService.hashPassword(password),
    role: 'ADMIN',
  });
  logger.info({ email: user.email }, 'Admin user ready');

  const existingBases = await knowledgeBaseService.list();
  let base = existingBases.find((candidate) => candidate.name === KB_NAME);
  if (!base) {
    base = await knowledgeBaseService.create({
      name: KB_NAME,
      description: 'Demo knowledge base for the sample outbound call template.',
    });
    for (const document of DOCUMENTS) {
      await knowledgeBaseService.addDocument(base.id, { ...document, status: 'PUBLISHED' });
      logger.info({ title: document.title }, 'Indexed document');
    }
  } else {
    logger.info('Knowledge base already seeded, skipping documents');
  }

  const templates = await templatesService.list();
  for (const template of [TEMPLATE, HINGLISH_TEMPLATE]) {
    if (templates.some((existing) => existing.name === template.name)) continue;
    await templatesService.create({ ...template, knowledgeBaseId: base.id });
    logger.info({ name: template.name, language: template.language }, 'Template created');
  }

  // A safe destination to test with: eligible, but you must set the real number.
  await query(
    `INSERT INTO contacts (name, phone, company, eligibility_status, tags)
     VALUES ('Test Contact', '+919999999999', 'Test Co', 'PENDING', ARRAY['demo'])
     ON CONFLICT (phone) DO NOTHING`,
  );

  logger.info('Seed complete');
};

run()
  .then(() => closePool())
  .then(() => process.exit(0))
  .catch(async (error) => {
    logger.error({ err: error }, 'Seed failed');
    await closePool().catch(() => undefined);
    process.exit(1);
  });
