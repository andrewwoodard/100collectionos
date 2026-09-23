import React from "react";
import { Link } from "react-router-dom";
import { Shield, ArrowLeft } from "lucide-react";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-white font-sans">
      <nav className="border-b border-gray-100 bg-white/90 backdrop-blur sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="text-sm text-gray-600 hover:text-gray-900 inline-flex items-center gap-1.5">
            <ArrowLeft className="w-4 h-4" /> Back to Home
          </Link>
          <span className="text-xl font-bold tracking-tight text-gray-900">100 Collection</span>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
            <Shield className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Privacy Policy</h1>
            <p className="text-sm text-gray-500">Last updated: August 19, 2026</p>
          </div>
        </div>

        <div className="prose prose-slate max-w-none space-y-8 text-gray-600 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Overview</h2>
            <p>
              The 100 Collection ("we", "us", "our") operates the partner portal at
              portal.theonehundredcollection.com, a platform that enables vacation rental
              property managers and homeowners to list, manage, and market their properties
              through our curated collection. This policy explains what data we collect, why
              we collect it, and how we use it.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Data We Collect</h2>
            <ul className="space-y-2 list-disc pl-5">
              <li>
                <strong className="text-gray-900">Account information:</strong> Your name,
                email address, and role within your organization, used to create and manage
                your partner portal account.
              </li>
              <li>
                <strong className="text-gray-900">Property information:</strong> Property
                details, descriptions, photos, amenities, and listing URLs that you submit
                for inclusion in The 100 Collection.
              </li>
              <li>
                <strong className="text-gray-900">Billing information:</strong> Payment
                details processed securely through Stripe for license fees and onboarding
                fees. We do not store full card numbers.
              </li>
              <li>
                <strong className="text-gray-900">Connected content:</strong> When you
                connect Google Drive or Google Sheets, we access files you select to import
                property content and media into the portal.
              </li>
              <li>
                <strong className="text-gray-900">Usage data:</strong> Basic analytics about
                how you interact with the portal, used to improve the platform.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Why We Collect Your Data</h2>
            <ul className="space-y-2 list-disc pl-5">
              <li>To create and administer your partner account and team access.</li>
              <li>To review, curate, and publish your properties on The 100 Collection.</li>
              <li>To process license and onboarding fee payments.</li>
              <li>To communicate with you about applications, submissions, and account status.</li>
              <li>To import property content and media from connected integrations you authorize.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Data Sharing</h2>
            <p>
              We share data with trusted service providers that help us operate the platform:
            </p>
            <ul className="space-y-2 list-disc pl-5 mt-2">
              <li><strong className="text-gray-900">Stripe</strong> — payment processing</li>
              <li><strong className="text-gray-900">Google</strong> — Drive and Sheets integration (only when you authorize it), and email via your account</li>
              <li><strong className="text-gray-900">Resend</strong> — transactional email delivery</li>
              <li><strong className="text-gray-900">Supabase</strong> — property data storage and sync to the public website</li>
            </ul>
            <p className="mt-3">
              We never sell your personal data to third parties.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Data Retention</h2>
            <p>
              We retain your account and property data for as long as you are an active
              partner. If you terminate your partnership, we will remove your data upon
              request or within a reasonable period, except where retention is required by
              law or for legitimate business records (such as billing history).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Your Rights</h2>
            <p>
              You may request access to, correction of, or deletion of your personal data by
              contacting us. You may also disconnect any third-party integrations (Google
              Drive, Google Sheets) at any time from your portal settings.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Contact</h2>
            <p>
              For privacy questions or data requests, contact The 100 Collection Partnerships
              Team by replying to any portal email or through the contact options on this site.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}