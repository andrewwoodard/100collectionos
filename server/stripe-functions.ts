import { getNeonPool, json } from "./neon-db.js";
import { requireAdmin } from "./require-session.js";
import { getStripe } from "./stripe.js";

export const STRIPE_FUNCTIONS = new Set([
  "stripePartnerData",
  "stripeAllInvoices",
  "stripeInvoices",
  "voidStripeInvoice",
  "getPromoCodeDisplay",
  "createStripeCustomer",
]);

function tsToDate(ts: number | null | undefined) {
  return ts ? new Date(ts * 1000).toISOString().split("T")[0] : null;
}

async function handleStripePartnerData(res: any, body: any) {
  const stripe = getStripe();
  const emails = Array.isArray(body?.emails) ? body.emails.map(String) : [];
  if (!emails.length) return json(res, 200, { customers: {} });

  const results = await Promise.all(
    emails.map(async (email: string) => {
      try {
        const customers = await stripe.customers.list({ email, limit: 1 });
        const customer = customers.data[0];
        if (!customer) return { email, data: null };

        const invoices = await stripe.invoices.list({
          customer: customer.id,
          status: "paid",
          limit: 100,
        });
        const now = Math.floor(Date.now() / 1000);
        const ONE_YEAR = 365 * 24 * 60 * 60;
        const lastInvoice = invoices.data[0];
        const annual_spend =
          invoices.data
            .filter((inv) => (inv.created || 0) >= now - ONE_YEAR)
            .reduce((sum, inv) => sum + (inv.total || 0), 0) / 100;

        const subList = await stripe.subscriptions.list({
          customer: customer.id,
          status: "all",
          limit: 100,
          expand: ["data.latest_invoice"],
        });
        const schedList = await stripe.subscriptionSchedules.list({
          customer: customer.id,
          limit: 100,
          expand: ["data.phases.items.price"],
        });
        const activeScheduleIds = new Set(
          schedList.data.filter((s) => s.status === "active").map((s) => s.id)
        );
        const credit_slots: any[] = [];

        for (const sub of subList.data) {
          if (sub.schedule && activeScheduleIds.has(String(sub.schedule))) continue;
          const isActive = ["active", "trialing", "past_due", "unpaid"].includes(sub.status);
          const isCanceledActive = sub.status === "canceled" && (sub.current_period_end || 0) > now;
          if (!isActive && !isCanceledActive) continue;
          const latestInvoice = sub.latest_invoice;
          const latestInvoiceStatus = typeof latestInvoice === "object" && latestInvoice ? latestInvoice.status : null;
          if (latestInvoiceStatus && latestInvoiceStatus !== "paid") continue;
          for (const item of sub.items?.data || []) {
            const qty = item.quantity || 0;
            const unitAmount = ((item.price as any)?.unit_amount || 0) / 100;
            const slotBase = {
              subscription_id: sub.id,
              status: sub.status,
              line_description: item.price?.nickname || "",
              period_start: sub.current_period_start || 0,
              period_end: sub.current_period_end || 0,
              unit_price: unitAmount,
              invoice_date: null,
              paid_date: null,
              paused: !!sub.pause_collection,
              resumes_at: sub.pause_collection?.resumes_at || null,
            };
            for (let i = 0; i < qty; i++) credit_slots.push({ ...slotBase });
          }
        }

        for (const sched of schedList.data.filter((s) => s.status === "active")) {
          const phases = sched.phases || [];
          const currentPhase = phases.find(
            (p) => p.start_date <= now && (!p.end_date || p.end_date > now)
          );
          if (!currentPhase) continue;
          for (const item of currentPhase.items || []) {
            const qty = item.quantity || 0;
            const price = typeof item.price === "object" ? item.price : null;
            const unitAmount = ((price as any)?.unit_amount || 0) / 100;
            const slotBase = {
              subscription_id: sched.id,
              status: "active",
              line_description: (price as any)?.nickname || "",
              period_start: currentPhase.start_date || 0,
              period_end: currentPhase.end_date || 0,
              unit_price: unitAmount,
              invoice_date: null,
              paid_date: null,
              paused: false,
              resumes_at: null,
            };
            for (let i = 0; i < qty; i++) credit_slots.push({ ...slotBase });
          }
        }

        const seenDescriptions = new Set<string>();
        for (const inv of invoices.data) {
          if (inv.subscription) continue;
          try {
            const allLines = await stripe.invoices.listLineItems(inv.id, { limit: 100 }).autoPagingToArray({ limit: 100 });
            for (const line of allLines) {
              const qty = line.quantity || 0;
              if (qty <= 0) continue;
              const desc = line.description || "";
              if (desc && seenDescriptions.has(desc)) continue;
              if (desc) seenDescriptions.add(desc);
              const unitAmount = line.amount && qty ? line.amount / qty / 100 : 0;
              const slotBase = {
                subscription_id: null,
                invoice_id: inv.id,
                invoice_number: inv.number || null,
                status: "paid",
                line_description: desc,
                period_start: inv.period_start || inv.created || 0,
                period_end: inv.period_end || 0,
                unit_price: unitAmount,
                invoice_date: tsToDate(inv.created),
                paid_date: tsToDate(inv.status_transitions?.paid_at || inv.created),
              };
              for (let i = 0; i < qty; i++) credit_slots.push({ ...slotBase });
            }
          } catch {
            continue;
          }
        }

        let billing_cycle = null;
        if (lastInvoice) {
          const firstPeriod = lastInvoice.lines?.data?.[0]?.period;
          const pStart = firstPeriod?.start || lastInvoice.created || 0;
          const pEnd = firstPeriod?.end || 0;
          const pDays = pEnd > pStart ? Math.floor((pEnd - pStart) / 86400) : 365;
          billing_cycle = pDays < 100 ? "monthly" : "annual";
        }

        return {
          email,
          data: {
            customer_id: customer.id,
            last_invoice_amount: lastInvoice ? (lastInvoice.total ?? lastInvoice.amount_paid) / 100 : null,
            last_invoice_date: lastInvoice ? lastInvoice.created : null,
            billing_cycle,
            property_credits: credit_slots.length,
            credit_slots,
            annual_spend,
            paid_invoices_count: invoices.data.length,
          },
        };
      } catch {
        return { email, data: null };
      }
    })
  );

  const customers: Record<string, any> = {};
  for (const row of results) {
    if (row.data) customers[row.email] = row.data;
  }
  return json(res, 200, { customers });
}

async function handleStripeAllInvoices(res: any) {
  const stripe = getStripe();
  const { rows } = await getNeonPool().query(
    `SELECT id, data->>'partner_name' AS name, data->>'stripe_billing_email' AS email
     FROM base44.partner
     WHERE coalesce(data->>'stripe_billing_email', '') <> ''`
  );
  if (!rows.length) return json(res, 200, { invoices: [], subscriptions: [] });

  const results = await Promise.all(
    rows.map(async ({ id, name, email }) => {
      try {
        const customers = await stripe.customers.list({ email, limit: 1 });
        const customer = customers.data[0];
        if (!customer) return { invoices: [], subscriptions: [] };

        const invoiceList = await stripe.invoices.list({ customer: customer.id, limit: 100 });
        const subList = await stripe.subscriptions.list({ customer: customer.id, status: "all", limit: 100 });
        const schedList = await stripe.subscriptionSchedules.list({
          customer: customer.id,
          limit: 100,
          expand: ["data.phases.items.price"],
        });

        const subMap = new Map<string, { quantity: number; unit_amount: number }>();
        let partnerUnitAmount = 0;
        for (const sub of subList.data) {
          const items = sub.items.data || [];
          const totalQuantity = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
          const firstItem = items[0] || ({} as any);
          const unitAmount = (firstItem.price?.unit_amount || 0) / 100;
          subMap.set(sub.id, { quantity: totalQuantity || 1, unit_amount: unitAmount });
          if (!partnerUnitAmount && unitAmount > 0) partnerUnitAmount = unitAmount;
        }

        const nowSec = Math.floor(Date.now() / 1000);
        const activeScheduleIds = new Set(schedList.data.filter((s) => s.status === "active").map((s) => s.id));
        const subscriptions: any[] = [];
        for (const sub of subList.data) {
          if (sub.schedule && activeScheduleIds.has(String(sub.schedule))) continue;
          const live =
            ["active", "trialing", "past_due", "unpaid"].includes(sub.status) ||
            (sub.status === "canceled" && (sub.current_period_end || 0) > nowSec);
          if (!live) continue;
          const items = sub.items.data || [];
          const totalQuantity = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
          const firstItem = items[0] || ({} as any);
          const unitAmount = (firstItem.price?.unit_amount || 0) / 100;
          const totalAmount = items.reduce((sum, item) => {
            const ua = (item.price?.unit_amount || 0) / 100;
            return sum + ua * (item.quantity || 0);
          }, 0);
          subscriptions.push({
            id: sub.id,
            status: sub.status,
            customer_id: customer.id,
            partner_id: id,
            partner_name: name,
            partner_email: email,
            current_period_end: sub.current_period_end,
            current_period_start: sub.current_period_start,
            interval: firstItem.price?.recurring?.interval,
            interval_count: firstItem.price?.recurring?.interval_count || 1,
            quantity: totalQuantity || 1,
            unit_amount: unitAmount,
            amount: totalAmount,
            currency: firstItem.price?.currency,
            plan_name: firstItem.price?.nickname || null,
            canceled_at: sub.canceled_at,
          });
        }

        for (const sched of schedList.data.filter((s) => s.status === "active")) {
          const phases = sched.phases || [];
          const currentPhase = phases.find((p) => p.start_date <= nowSec && (!p.end_date || p.end_date > nowSec));
          if (!currentPhase) continue;
          const nextPhase = currentPhase.end_date
            ? phases.find((p) => p.start_date >= currentPhase.end_date && p !== currentPhase)
            : null;
          const pricingPhase = nextPhase || currentPhase;
          const totalQuantity = pricingPhase.items?.reduce((sum, i) => sum + (i.quantity || 0), 0) || 1;
          const firstPrice = typeof pricingPhase.items?.[0]?.price === "object" ? pricingPhase.items[0].price : null;
          const unitAmount = ((firstPrice as any)?.unit_amount || 0) / 100;
          const totalAmount =
            pricingPhase.items?.reduce((sum, i) => {
              const price = typeof i.price === "object" ? i.price : null;
              const ua = ((price as any)?.unit_amount || 0) / 100;
              return sum + ua * (i.quantity || 0);
            }, 0) || 0;
          let periodEnd = currentPhase.end_date;
          if (!periodEnd) {
            const intervalSecs = ((firstPrice as any)?.recurring?.interval === "year" ? 365 : 30) * 86400;
            periodEnd = (pricingPhase.start_date || nowSec) + intervalSecs;
          }
          subscriptions.push({
            id: sched.id,
            status: "active",
            customer_id: customer.id,
            partner_id: id,
            partner_name: name,
            partner_email: email,
            current_period_end: periodEnd,
            current_period_start: currentPhase.start_date,
            interval: (firstPrice as any)?.recurring?.interval || "month",
            interval_count: (firstPrice as any)?.recurring?.interval_count || 1,
            quantity: totalQuantity,
            unit_amount: unitAmount,
            amount: totalAmount,
            currency: sched.currency || "usd",
            plan_name: (firstPrice as any)?.nickname || null,
            canceled_at: null,
            is_schedule: true,
          });
        }

        const invoices = invoiceList.data.map((inv) => {
          const lineItems = inv.lines?.data || [];
          const lineItemQty = lineItems.reduce((sum, line) => sum + (line.quantity || 0), 0);
          const subId = typeof inv.subscription === "string" ? inv.subscription : inv.subscription?.id;
          const subInfo = subId ? subMap.get(subId) : null;
          const lineUnitAmount = lineItems[0]?.price?.unit_amount ? lineItems[0].price.unit_amount / 100 : 0;
          const unitAmount = subInfo?.unit_amount || partnerUnitAmount || lineUnitAmount || 0;
          let quantity = lineItemQty || 1;
          if (unitAmount > 0 && (inv.total || 0) > 0) {
            const calcQty = Math.round(inv.total / 100 / unitAmount);
            if (calcQty > 0) quantity = calcQty;
          }
          return {
            id: inv.id,
            number: inv.number,
            status: inv.status,
            amount_paid: (inv.amount_paid || 0) / 100,
            amount_due: (inv.amount_due || 0) / 100,
            total: (inv.total || 0) / 100,
            created: inv.created,
            due_date: inv.due_date,
            period_start: inv.period_start,
            period_end: inv.period_end,
            hosted_invoice_url: inv.hosted_invoice_url,
            partner_id: id,
            partner_name: name,
            partner_email: email,
            customer_id: customer.id,
            subscription_id: subId,
            quantity,
          };
        });
        return { invoices, subscriptions };
      } catch {
        return { invoices: [], subscriptions: [] };
      }
    })
  );

  const seenIds = new Set<string>();
  const invoices = results
    .flatMap((r) => r.invoices)
    .filter((inv) => (inv.status === "open" || inv.status === "paid") && !seenIds.has(inv.id) && seenIds.add(inv.id))
    .sort((a, b) => b.created - a.created);
  const subscriptions = results.flatMap((r) => r.subscriptions);
  return json(res, 200, { invoices, subscriptions });
}

async function handleStripeInvoices(res: any, body: any) {
  const stripe = getStripe();
  const email = String(body?.email || "").trim();
  if (!email) return json(res, 200, { invoices: [] });
  const customers = await stripe.customers.list({ email, limit: 1 });
  const customer = customers.data[0];
  if (!customer) return json(res, 200, { invoices: [] });
  const invoiceList = await stripe.invoices.list({ customer: customer.id, limit: 50 });
  const seenIds = new Set<string>();
  const invoices = [];
  for (const inv of invoiceList.data) {
    if (inv.status !== "open" && inv.status !== "paid") continue;
    if (seenIds.has(inv.id)) continue;
    seenIds.add(inv.id);
    const allLines = await stripe.invoices.listLineItems(inv.id, { limit: 100 }).autoPagingToArray({ limit: 100 });
    invoices.push({
      id: inv.id,
      number: inv.number,
      status: inv.status,
      total: inv.total,
      amount_paid: inv.amount_paid,
      amount_due: inv.amount_due,
      created: inv.created,
      hosted_invoice_url: inv.hosted_invoice_url,
      description: inv.description,
      quantity: allLines.reduce((sum, line) => sum + (line.quantity || 0), 0),
      lines: allLines.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        amount: l.amount,
      })),
    });
  }
  return json(res, 200, { invoices });
}

export async function handleStripeFunction(req: any, res: any, functionName: string, body: any) {
  if (functionName === "voidStripeInvoice" || functionName === "createStripeCustomer") {
    const gate = await requireAdmin(req);
    if ("error" in gate && gate.error) return json(res, gate.error, { error: gate.message });
  }

  if (functionName === "stripePartnerData") return handleStripePartnerData(res, body);
  if (functionName === "stripeAllInvoices") return handleStripeAllInvoices(res);
  if (functionName === "stripeInvoices") return handleStripeInvoices(res, body);
  if (functionName === "getPromoCodeDisplay") {
    const stripe = getStripe();
    const promo_id = String(body?.promo_id || "");
    if (!promo_id) return json(res, 200, { code: null });
    try {
      const promoCode = await stripe.promotionCodes.retrieve(promo_id);
      return json(res, 200, { code: promoCode?.active ? promoCode.code : null });
    } catch {
      return json(res, 200, { code: null });
    }
  }
  if (functionName === "createStripeCustomer") {
    const stripe = getStripe();
    const email = String(body?.email || "").trim();
    if (!email) return json(res, 400, { error: "email is required" });
    const existing = await stripe.customers.list({ email, limit: 1 });
    if (existing.data[0]) {
      return json(res, 200, { ok: true, customer_id: existing.data[0].id, already_existed: true });
    }
    const customer = await stripe.customers.create({
      email,
      name: body?.name || undefined,
      metadata: { source: "100c-os" },
    });
    return json(res, 200, { ok: true, customer_id: customer.id, already_existed: false });
  }
  if (functionName === "voidStripeInvoice") {
    const stripe = getStripe();
    const invoice_id = String(body?.invoice_id || "");
    if (!invoice_id) return json(res, 400, { error: "Missing invoice_id" });
    const invoice = await stripe.invoices.retrieve(invoice_id);
    if (invoice.status !== "open") {
      return json(res, 400, { error: `Only open invoices can be voided. This invoice is "${invoice.status}".` });
    }
    const voided = await stripe.invoices.voidInvoice(invoice_id);
    return json(res, 200, { invoice_id: voided.id, status: voided.status, number: voided.number });
  }
  return json(res, 400, { error: "Unknown Stripe action" });
}
